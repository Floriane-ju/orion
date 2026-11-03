/**
 * T-0291 — cost of one keystroke vs its budget. Run: `pnpm bench:frappe`. Exit != 0 above budget.
 *
 * Audit claimed 486-692 ms/char in télescope config at CPU ×4; browser numbers don't replay →
 * measures off-browser the MOTEURS of the chain, split in T-0291's two paths:
 *
 *   - CHEMIN DE FRAPPE: stays in the key's render (input clamping, site sky, fenêtre utile,
 *     optical profile, cadre). Carries the budget: user waits on it to see the character.
 *   - CHEMIN DIFFÉRÉ: plan de la nuit, catalogue notes, list reads, moved out by
 *     `useDeferredValue`. Shown, not budgeted.
 *
 * Not measured: React render, layout, paint (`app-calcul.ts` imports a component → no `node`;
 * same limit as `bench-catalogue.ts`; ms live in engines: frappe path ~70 → ~4 ms).
 *
 * Budget from `registry/budgets.ts`, never here: given for §11.2 tablet at browser ×4 throttle;
 * this bench is unthrottled → divided accordingly.
 */

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
import { lit, mediane } from './bench-commun.ts'


/** Frappe-path budget on THIS machine: tablet budget, unthrottled. */
const BUDGET_MS = B('FRAPPE_MS') / B('BRIDAGE_CPU')

/**
 * T-0291's 2 browser configs, kept for comparison: long focale on équatoriale (keeps ~100
 * cibles, evaluates all) and grand champ on tracker.
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

/** Same site and night as other benches. */
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
  zpSys: '',
  tailleRawMo: '',
}

const CATALOGUE: readonly ObjetCielProfond[] = decodeObjets({
  enregistrements: lit('openngc-1.bin'),
  chaines: lit('openngc-noms-1.bin'),
})

/**
 * Simulated FRAPPE: latitude really changes each key. Worst case: a no-effect char reruns
 * nothing since T-0291 (held by `frappe-sans-recalcul.test.ts`).
 */
const FRAPPES: readonly string[] = Array.from(
  { length: 12 },
  (_, i) => (Number(LATITUDE) + i * 0.001).toFixed(3),
)

/** Time of one étage in ms over the keystroke series. */
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

/** Site as `grandeursLieu` clamps it in the chain. */
function site(latitude: string) {
  return {
    latitudeDeg: nombre('latitude_deg', latitude),
    longitudeDeg: nombre('longitude_deg', LONGITUDE),
    altitudeM: nombre('altitude_m', ALTITUDE),
  }
}

/** Matériel as `evalueMateriel` computes it. */
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

/** §8.3 — séance context, assembled as the chain does. */
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
  const designations = new Set(
    [...etatsCibles(reference, CATALOGUE)]
      .filter(([, etat]) => etat.pose !== null)
      .map(([designation]) => designation),
  )
  /**
   * Plan orders only the selection (§8.3), not the catalogue (`app-calcul.ts` filters).
   * Worst case: every cible the list calls photographiable.
   */
  const choisies = CATALOGUE.filter((objet) => designations.has(objet.designation))

  console.log(`${config.nom} — ${choisies.length} cible(s) photographiable(s)`)

  /**
   * Whole frappe path = deciding number. Étages detail it but overlap (each recomputes the night
   * it needs) → sum > total.
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
    {
      // T-0294 — both share evaluations per context: NEW context each round, else bench measures
      // only the memo. Measured together, as the chain pays them.
      nom: 'notes du catalogue et plan de la nuit',
      ms: chrono(() => {
        const neuf = { ...reference }
        etatsCibles(neuf, CATALOGUE)
        planSession(neuf, choisies)
      }),
    },
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
  // Before T-0291 both paths were one: this sum is what a key paid.
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
