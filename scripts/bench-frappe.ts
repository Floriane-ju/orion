/**
 * T-0291 — ce qu'une frappe coûte, chiffré, et le budget qu'elle ne doit pas dépasser.
 *
 * L'audit annonçait 486 à 692 ms par caractère en configuration télescope à CPU ×4. Un chiffre
 * pris au navigateur ne se rejoue pas : ce banc mesure hors navigateur les MOTEURS que la
 * chaîne de calcul enchaîne, et les range dans les deux chemins que T-0291 a séparés.
 *
 *   - LE CHEMIN DE FRAPPE : ce qui reste dans le rendu de la touche. Le bornage des saisies,
 *     le ciel du site, la fenêtre utile, le profil optique et le cadre. C'est lui qui porte le
 *     budget, parce que c'est lui que l'utilisateur attend avant de voir son caractère.
 *   - LE CHEMIN DIFFÉRÉ : le plan de la nuit, les notes du catalogue et les lectures de la
 *     liste, que `useDeferredValue` sort du rendu de la touche. Il est chiffré et affiché —
 *     il n'a pas disparu, il a changé de place — mais il ne porte pas le budget.
 *
 * CE QUE CE BANC NE MESURE PAS, et pourquoi. Le rendu React, la mise en page et la peinture
 * restent au navigateur : `app-calcul.ts` importe un composant, donc ne s'exécute pas sous
 * `node`. C'est la même limite que `bench-catalogue.ts`, et elle est acceptable parce que les
 * millisecondes sont dans les moteurs — le chemin de frappe passe de ~70 ms à ~4 ms, et aucun
 * arbre React ne se rend en soixante-six millisecondes.
 *
 * Le budget vient du registre (`registry/budgets.ts`), jamais d'ici : un seuil écrit dans le
 * banc qui le mesure n'est plus un seuil. Il est donné pour la tablette de §11.2, mesurée au
 * bridage ×4 du navigateur ; ce banc tourne sans bridage et divise donc d'autant.
 *
 * Usage : `pnpm bench:frappe`. Sortie non nulle au-delà du budget.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { decodeObjets, type ObjetCielProfond } from '../src/data/deepsky.ts'
import {
  capteurEffectif,
  isoRecommande,
  pointZeroSysteme,
  resoutBoitier,
  type SaisieBoitier,
} from '../src/data/equipment.ts'
import { fenetreNocturne, offsetMidiSolaireMin } from '../src/core/nuit.ts'
import { midiDeLaNuit } from '../src/core/nuit-datee.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { fondDeCiel } from '../src/core/fond-ciel.ts'
import { masquePlat, seuilsDeclinaison } from '../src/core/site.ts'
import { profilOptique } from '../src/core/optics.ts'
import { npf, profilSuivi, type QualiteMiseEnStation, type TypeMonture } from '../src/core/suivi.ts'
import { planSession, poidsParDefaut, type ContexteSession } from '../src/core/session.ts'
import { etatsCibles, lignesInvariantes } from '../src/core/cibles-liste.ts'
import { borne, nombreDeTexte } from '../src/registry/domains.ts'
import { PRESET_SNR_DEFAUT } from '../src/registry/verdicts.ts'
import { B, BUDGETS } from '../src/registry/budgets.ts'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Le budget du chemin de frappe sur CETTE machine : celui de la tablette, débridé. */
const BUDGET_MS = B('FRAPPE_MS') / B('BRIDAGE_CPU')

/**
 * Les deux configurations que T-0291 a mesurées au navigateur, reprises telles quelles pour
 * que les chiffres se comparent : la longue focale sur équatoriale, qui ne retient qu'une
 * centaine de cibles mais les évalue toutes, et le grand champ sur tracker.
 */
interface Configuration {
  readonly nom: string
  readonly focale: string
  readonly ouverture: string
  readonly monture: TypeMonture
  readonly qualiteMes: QualiteMiseEnStation
}

const CONFIGURATIONS: readonly Configuration[] = [
  { nom: 'télescope 1000 mm f/5 sur équatoriale', focale: '1000', ouverture: '5', monture: 'GEM', qualiteMes: 'SOIGNEE' },
  { nom: 'objectif 135 mm f/2 sur tracker', focale: '135', ouverture: '2', monture: 'TRACKER', qualiteMes: 'SOIGNEE' },
]

/** Le site et la nuit de référence des autres bancs : les chiffres restent comparables. */
const LATITUDE = '46.391'
const LONGITUDE = '6.697'
const ALTITUDE = '500'
const BORTLE = '4.5'
const NUIT_ISO = '2026-08-15'

const BOITIER: SaisieBoitier = {
  formatCapteur: 'PLEIN_FORMAT',
  resolutionMpx: '33',
  readNoiseE: '',
  seuilDoubleGainIso: '',
  fullWellE: '',
  zpSys: '',
  tailleRawMo: '',
}

function lit(nom: string): ArrayBuffer {
  const octets = readFileSync(join(RACINE, 'public/data', nom))
  return octets.buffer.slice(
    octets.byteOffset,
    octets.byteOffset + octets.byteLength,
  ) as ArrayBuffer
}

const CATALOGUE: readonly ObjetCielProfond[] = decodeObjets({
  enregistrements: lit('openngc-1.bin'),
  chaines: lit('openngc-noms-1.bin'),
})

/**
 * La FRAPPE simulée : une latitude qui change vraiment à chaque touche.
 *
 * Le cas mesuré est le pire, pas le moyen. Un caractère sans effet sur la valeur ne relance
 * plus rien depuis T-0291 — c'est `frappe-sans-recalcul.test.ts` qui le tient —, donc le
 * chiffre qui décide est celui d'une touche qui change bel et bien le lieu.
 */
const FRAPPES: readonly string[] = Array.from(
  { length: 12 },
  (_, i) => (Number(LATITUDE) + i * 0.001).toFixed(3),
)

/** Une mesure : la médiane des frappes, parce qu'une moyenne suit le premier échauffement. */
function mediane(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(triees.length / 2)
  return triees.length % 2 === 0
    ? ((triees[milieu - 1] ?? 0) + (triees[milieu] ?? 0)) / 2
    : (triees[milieu] ?? 0)
}

/** Le temps d'un étage, en millisecondes, mesuré sur toute la série de frappes. */
function chrono(travail: (latitude: string) => void): number {
  for (const latitude of FRAPPES) travail(latitude)
  return mediane(
    FRAPPES.map((latitude) => {
      const debut = performance.now()
      travail(latitude)
      return performance.now() - debut
    }),
  )
}

const nombre = (champ: Parameters<typeof borne>[0], texte: string): number =>
  borne(champ, nombreDeTexte(texte)).valeur

/** Le site, tel que `grandeursLieu` le borne dans la chaîne. */
function site(latitude: string) {
  return {
    latitudeDeg: nombre('latitude_deg', latitude),
    longitudeDeg: nombre('longitude_deg', LONGITUDE),
    altitudeM: nombre('altitude_m', ALTITUDE),
  }
}

/** Le matériel, tel que `evalueMateriel` le chiffre. */
function materiel(config: Configuration) {
  const boitier = resoutBoitier(BOITIER)
  const capteur = capteurEffectif(boitier, 'FULL_FRAME')
  const focaleMm = nombre('focale_mm', config.focale)
  const ouvertureN = nombre('ouverture_N', config.ouverture)
  const suivi = profilSuivi({
    suiviActif: true,
    qualiteMes: config.qualiteMes,
    typeMonture: config.monture,
    focaleMm,
  })
  return {
    boitier,
    capteur,
    focaleMm,
    ouvertureN,
    suivi,
    optique: profilOptique({ focaleMm, ouvertureN, typeObjectif: 'RECTILINEAIRE', ...capteur }),
    poseNpf: npf({ focaleMm, ouvertureN, pitchUm: capteur.pitchUm, decDeg: 0 }),
    zeroSysteme: pointZeroSysteme(boitier),
    iso: isoRecommande(boitier, null),
  }
}

/** §8.3 — le contexte de séance, assemblé comme la chaîne l'assemble. */
function contexte(config: Configuration, latitude: string): ContexteSession {
  const s = site(latitude)
  const m = materiel(config)
  const nuit = fenetreNocturne(s, midiDeLaNuit(NUIT_ISO))
  const ciel = fondDeCiel({ bortleDeclare: nombre('bortle_declare', BORTLE) })
  return {
    site: s,
    nuit,
    fenetreUtile: fenetreUtile(s, nuit),
    masque: masquePlat(),
    fovHDeg: m.optique.fovHDeg.value,
    echApx: m.optique.echApx.value,
    dMm: m.optique.dMm.value,
    capteurHMm: m.capteur.capteurHMm,
    pitchUm: m.capteur.pitchUm,
    ouvertureN: m.ouvertureN,
    zpSys: m.zeroSysteme.valeur,
    zpEstime: m.zeroSysteme.estime,
    readNoiseE: m.iso.readNoiseE,
    tailleRawMo: m.boitier.tailleRawMo,
    isoSession: m.iso.iso,
    sbCielNoir: ciel.sbCiel.value,
    mLimOeil: ciel.mLimOeil.value,
    tMaxS: m.suivi.tMaxSuiviS.value ?? m.poseNpf.value,
    domaineCpFerme: m.suivi.cause,
    snrCible: PRESET_SNR_DEFAUT,
    typeMonture: config.monture,
    poids: poidsParDefaut(),
  }
}

interface Etage {
  readonly nom: string
  readonly ms: number
}

function chemin(etages: readonly Etage[], titre: string, total: number, note: string): void {
  console.log(`  ${titre}`)
  for (const etage of etages) {
    console.log(`    ${etage.ms.toFixed(2).padStart(8)} ms  ${etage.nom}`)
  }
  console.log(`    ${'─'.repeat(8)}`)
  console.log(`    ${total.toFixed(2).padStart(8)} ms  ${note}`)
}

let depasse = false

console.log(
  `Catalogue réel : ${CATALOGUE.length.toLocaleString('fr-FR')} objets — ` +
    `${FRAPPES.length} frappes, médiane\n`,
)
console.log(
  `Budget d'une frappe : ${BUDGETS.FRAPPE_MS.valeur} ms à CPU ×${BUDGETS.BRIDAGE_CPU.valeur}, ` +
    `soit ${BUDGET_MS.toFixed(2)} ms sans bridage.\n`,
)

for (const config of CONFIGURATIONS) {
  const reference = contexte(config, LATITUDE)
  const photographiables = [...etatsCibles(reference, CATALOGUE).values()].filter(
    (etat) => etat.pose !== null,
  ).length

  console.log(`${config.nom} — ${photographiables} cible(s) photographiable(s)`)

  /**
   * Le chemin de frappe mesuré d'un bloc : c'est le chiffre qui décide. Les étages ci-dessous
   * le détaillent, mais ils se recouvrent — chacun recalcule la nuit dont il a besoin —, donc
   * leur somme dépasse le total. Seule la mesure de bout en bout vaut comparaison au budget.
   */
  const totalFrappe = chrono((lat) => {
    const s = site(lat)
    const nuit = fenetreNocturne(s, midiDeLaNuit(NUIT_ISO))
    fondDeCiel({ bortleDeclare: nombre('bortle_declare', BORTLE) })
    seuilsDeclinaison(s.latitudeDeg)
    offsetMidiSolaireMin(s.longitudeDeg, 0)
    fenetreUtile(s, nuit)
    materiel(config)
  })

  const frappe: readonly Etage[] = [
    { nom: 'bornage des saisies', ms: chrono((lat) => { site(lat); materiel(config) }) },
    {
      nom: 'ciel du site (nuit, fond de ciel, seuils)',
      ms: chrono((lat) => {
        const s = site(lat)
        fenetreNocturne(s, midiDeLaNuit(NUIT_ISO))
        fondDeCiel({ bortleDeclare: nombre('bortle_declare', BORTLE) })
        seuilsDeclinaison(s.latitudeDeg)
        offsetMidiSolaireMin(s.longitudeDeg, 0)
      }),
    },
    {
      nom: 'fenêtre utile (gêne lunaire)',
      ms: chrono((lat) => {
        const s = site(lat)
        fenetreUtile(s, fenetreNocturne(s, midiDeLaNuit(NUIT_ISO)))
      }),
    },
    { nom: 'profil optique, suivi et cadre', ms: chrono(() => { materiel(config) }) },
  ]

  const differe: readonly Etage[] = [
    { nom: 'plan de la nuit', ms: chrono(() => { planSession(reference, CATALOGUE) }) },
    { nom: 'notes du catalogue', ms: chrono(() => { etatsCibles(reference, CATALOGUE) }) },
    {
      nom: 'lectures de la liste',
      ms: chrono(() => {
        lignesInvariantes({
          catalogue: CATALOGUE,
          sbCiel: reference.sbCielNoir,
          mLimOeil: reference.mLimOeil,
          dMm: reference.dMm,
          fovHDeg: reference.fovHDeg,
          echApx: reference.echApx,
          capteurHMm: reference.capteurHMm,
        })
      }),
    },
  ]
  const totalDiffere = differe.reduce((somme, etage) => somme + etage.ms, 0)

  chemin(
    frappe,
    'chemin de frappe — dans le rendu de la touche',
    totalFrappe,
    'total mesuré d’un bloc (les étages se recouvrent)',
  )
  const tient = totalFrappe <= BUDGET_MS
  if (!tient) depasse = true
  console.log(
    `    ${tient ? '✓' : '✗'} budget ${BUDGET_MS.toFixed(2)} ms ` +
      `${tient ? 'tenu' : 'DÉPASSÉ'} — ${(totalFrappe * B('BRIDAGE_CPU')).toFixed(0)} ms ` +
      `attendus à CPU ×${BUDGETS.BRIDAGE_CPU.valeur}`,
  )
  chemin(
    differe,
    'chemin différé — hors du rendu de la touche',
    totalDiffere,
    'total reporté par useDeferredValue',
  )
  // Avant T-0291, les deux chemins n'en faisaient qu'un : c'est la somme qu'une touche payait.
  const avant = totalFrappe + totalDiffere
  console.log(
    `  avant T-0291 (tout dans le rendu de la touche) : ${avant.toFixed(2)} ms, ` +
      `soit ${(avant * B('BRIDAGE_CPU')).toFixed(0)} ms à CPU ×${BUDGETS.BRIDAGE_CPU.valeur} — ` +
      `gain ×${(avant / totalFrappe).toFixed(1)}`,
  )
  console.log('')
}

if (depasse) {
  console.error('Budget de frappe dépassé : voir T-0291 et registry/budgets.ts.')
  process.exit(1)
}
