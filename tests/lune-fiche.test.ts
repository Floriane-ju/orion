/**
 * T-0089 — la fiche cible compte la Lune comme le plan de séance (§8.1, §6.3, §7.5).
 *
 * Ce que ce fichier interdit de régresser : deux écrans qui évaluent la même cible la même
 * nuit ne doivent pas annoncer deux poses. La fiche appelait `detectabilite()` sans la Lune,
 * sur le fond de ciel noir du site — elle dosait donc une nuit sans Lune, quelle que soit la
 * nuit. Le test compare les deux chemins sur la même entrée et échoue s'ils divergent.
 *
 * Aucune éphéméride n'est écrite ici : la nuit de Lune est CHERCHÉE à l'exécution, et les
 * valeurs attendues sont celles que le moteur du plan produit sur la même entrée.
 */

import { describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { etatLune, fenetreUtile } from '../src/core/moon.ts'
import { masquePlat, masseAir } from '../src/core/site.ts'
import { PRESET_SNR_DEFAUT } from '../src/registry/verdicts.ts'
import { etatsCibles, prepareEvaluation } from '../src/core/cibles-liste.ts'
import { instantLune } from '../src/core/session-candidates.ts'
import { planSession, type ContexteSession, type EtapePlan } from '../src/core/session.ts'
import { profilOptique } from '../src/core/optics.ts'
import {
  BOITIER_REFERENCE,
  capteurEffectif,
  isoRecommande,
  pointZeroSysteme,
} from '../src/data/equipment.ts'
import type { ObjetCielProfond, TypeObjet } from '../src/data/deepsky.ts'
import {
  conseilsCible,
  evalue,
  type CaptureNuit,
  type ContexteFiche,
  type LuneFiche,
} from '../src/ui/fiche-cible-calcul.ts'
import { nuitFiche } from '../src/ui/fiche-cible-creneau.ts'
import { lunePourCible } from '../src/ui/fiche-cible-lune.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

/**
 * Pas de nuit chiffrable : la fiche n'a alors ni créneau ni masse d'air, et `fluxObjetReel`
 * annonce un minimum plutôt que de supposer le zénith (§7.6, §12.5).
 */
const SANS_CRENEAU: CaptureNuit = {
  masseAir: masseAir(null),
  dureeCreneauS: null,
  plusHaut: null,
  exclusion: null,
}

/** Annexe A : site de référence, et le setup grand champ 120 mm f/2,8 sur plein format. */
const CAPTEUR = capteurEffectif(BOITIER_REFERENCE, 'FULL_FRAME')
const OPTIQUE = profilOptique({ focaleMm: 120, ouvertureN: 2.8, ...CAPTEUR })
const ZERO = pointZeroSysteme(BOITIER_REFERENCE)
const ISO = isoRecommande(BOITIER_REFERENCE)
const SB_CIEL_NOIR = 20.95
const M_LIM_OEIL = 6.05
const T_MAX_S = 200
/** L'objectif de qualité du plan de la nuit : la fiche doit être interrogée sur le même. */
const SNR_PLAN = PRESET_SNR_DEFAUT

const NGC7000: ObjetCielProfond = {
  designation: 'NGC7000',
  nomsCommuns: 'Amérique du Nord',
  adDeg: 314.75,
  decDeg: 44.52,
  type: 'EMISSION',
  majAxArcmin: 120,
  minAxArcmin: 100,
  posAngDeg: null,
  vMag: 4,
  bMag: null,
  surfBr: null,
}

const CATALOGUE: readonly ObjetCielProfond[] = [NGC7000]

function contexteSession(dateIso: string): ContexteSession {
  const nuit = fenetreNocturne(SITE, new Date(`${dateIso}T12:00:00Z`))
  return {
    site: SITE,
    nuit,
    fenetreUtile: fenetreUtile(SITE, nuit),
    masque: masquePlat(),
    fovHDeg: OPTIQUE.fovHDeg.value,
    echApx: OPTIQUE.echApx.value,
    dMm: OPTIQUE.dMm.value,
    capteurHMm: CAPTEUR.capteurHMm,
    pitchUm: CAPTEUR.pitchUm,
    ouvertureN: 2.8,
    zpSys: ZERO.valeur,
    zpEstime: ZERO.estime,
    readNoiseE: ISO.readNoiseE,
    tailleRawMo: BOITIER_REFERENCE.tailleRawMo,
    isoSession: ISO.iso,
    sbCielNoir: SB_CIEL_NOIR,
    mLimOeil: M_LIM_OEIL,
    tMaxS: T_MAX_S,
    domaineCpFerme: null,
    snrCible: SNR_PLAN,
    typeMonture: 'TRACKER',
  }
}

/**
 * Le fond de ciel que le plan emploie avant la Lune : le ciel noir du site, moins la
 * pénalité de crépuscule de la nuit (§2.2). La fiche est interrogée sur celui-là, pour que
 * la seule différence testée soit la Lune.
 */
function sbCielBase(contexte: ContexteSession): number {
  return contexte.sbCielNoir - contexte.nuit.penaliteSbMag
}

function contexteFiche(sbCiel: number): ContexteFiche {
  return {
    optique: OPTIQUE,
    capteurHMm: CAPTEUR.capteurHMm,
    pitchUm: CAPTEUR.pitchUm,
    ouvertureN: 2.8,
    boitier: BOITIER_REFERENCE,
    zeroSysteme: ZERO,
    iso: ISO,
    sbCiel,
    mLimOeil: M_LIM_OEIL,
    tMaxS: T_MAX_S,
    // Bortle 4 : sous le seuil C-22 du conseil filtre. Ce qui déclenche le conseil dans ce
    // fichier ne peut donc être que la Lune.
    bortle: 4,
    suiviActif: true,
    focaleMm: 120,
  }
}

/**
 * Première nuit, à partir du 1er août 2026, où le plan retient la cible sous une Lune qui
 * dégrade réellement le fond de ciel. Cherchée plutôt qu'écrite : une date recopiée serait
 * une éphéméride en dur, et le test la vérifierait contre elle-même.
 */
function nuitAvecLune(): { readonly contexte: ContexteSession; readonly etape: EtapePlan } {
  for (let jour = 1; jour <= 30; jour += 1) {
    const contexte = contexteSession(`2026-08-${String(jour).padStart(2, '0')}`)
    const etape = planSession(contexte, CATALOGUE).etapes[0]
    if (etape !== undefined && etape.deltaSbLuneMag.value > 0) return { contexte, etape }
  }
  throw new Error('Aucune nuit de Lune trouvée sur le mois : le moteur lunaire ne répond plus.')
}

/**
 * T-0268 — les TROIS chemins sur la même entrée : le plan de séance, la liste du catalogue et
 * la fiche. Reprise du test de T-0089, qui ne comparait que deux d'entre eux et tolérait
 * explicitement un écart de masse d'air — c'est par là que la régression est revenue.
 *
 * Ce que ce fichier interdit désormais : que la fiche annonce une autre intégration, un autre
 * nombre de poses ou une autre gêne lunaire que le plan pour la même cible la même nuit.
 */
describe('T-0268 — la liste, la fiche et le plan annoncent le même dosage', () => {
  const { contexte, etape } = nuitAvecLune()
  const sbBase = sbCielBase(contexte)
  const nuit = nuitFiche(contexte, etape.objet)
  const fiche = evalue(
    contexteFiche(sbBase),
    etape.objet,
    SNR_PLAN,
    ISO,
    nuit.lune,
    nuit.capture,
  )
  const liste = etatsCibles(contexte, CATALOGUE).get(etape.objet.designation)

  it('la fiche annonce l’intégration et le nombre de poses du plan', () => {
    expect(fiche.integration?.tRequisS.value).toBe(etape.integration.tRequisS.value)
    expect(fiche.integration?.nPoses.value).toBe(etape.integration.nPoses.value)
  })

  it('la liste annonce les mêmes : un seul moteur pour les trois écrans', () => {
    expect(liste?.pose?.tRequisS).toBe(etape.integration.tRequisS.value)
    expect(liste?.pose?.nPoses).toBe(etape.integration.nPoses.value)
    expect(liste?.pose?.tPoseS).toBe(fiche.pose?.tAfficheeS)
  })

  it('éteint la cible à la MÊME masse d’air : celle du créneau, pas la culmination', () => {
    expect(fiche.extinction?.masseAir.value).toBe(etape.extinction.masseAir.value)
    expect(fiche.extinction?.masseAir.value).toBe(etape.creneau.masseAirMoyenne.value)
  })

  it('dégrade le même ciel sous la même Lune, au même instant', () => {
    const attendu = instantLune(etape.creneau, prepareEvaluation(contexte)!.fenetre.debut)
    expect(nuit.lune.evaluee && nuit.lune.instant.getTime()).toBe(attendu.getTime())
    expect(nuit.lune.evaluee && nuit.lune.ciel.delta.value).toBeCloseTo(
      etape.deltaSbLuneMag.value,
      12,
    )
    expect(fiche.sbCielEffectif).toBeCloseTo(etape.sbCielEffectif, 12)
    expect(fiche.pose?.tRecommandeS.value).toBeCloseTo(etape.pose.tRecommandeS.value, 12)
  })

  /**
   * L'instant lunaire de la fiche est tiré du CRÉNEAU, donc de la nuit seule. Aucune horloge
   * n'y entre : préparer à midi et consulter à 23 h 30 lisent le même instant, donc la même
   * gêne. C'est la clause que la fiche violait en datant sa Lune de l'instant affiché.
   */
  it('date sa Lune d’un instant du créneau, jamais de l’heure de consultation', () => {
    const creneaux = nuit.creneau.chiffre ? nuit.creneau.creneau.creneaux : []
    expect(creneaux.length).toBeGreaterThan(0)
    const instant = (nuit.lune.evaluee ? nuit.lune.instant : new Date(0)).getTime()
    expect(instant).toBeGreaterThanOrEqual(creneaux[0]!.debut.getTime())
    expect(instant).toBeLessThanOrEqual(creneaux[creneaux.length - 1]!.fin.getTime())
  })

  /**
   * §7.6 — le plancher est la variante nommée : la même cible au seul meilleur instant. Il
   * est plus court que la prévision, et c'est tout son intérêt — l'écart chiffre ce que coûte
   * le fait de poser toute la fenêtre plutôt que l'heure de la culmination.
   */
  it('affiche un plancher plus court que la prévision, jamais à sa place', () => {
    expect(fiche.plancher).not.toBeNull()
    expect(fiche.plancher!.integration.tRequisS.value).toBeLessThanOrEqual(
      fiche.integration!.tRequisS.value,
    )
    expect(fiche.plancher!.extinction.masseAir.value).toBe(etape.creneau.masseAirMin.value)
  })

  /**
   * Le critère que la phrase « Lune à 12:47, cible à son point le plus haut » violait : la
   * hauteur annoncée et l'instant nommé doivent décrire le MÊME événement. Ils viennent du
   * même échantillon du créneau, ce qui les rend incapables de diverger.
   */
  it('nomme un instant auquel la cible est effectivement à la hauteur annoncée', () => {
    const plusHaut = fiche.plancher!.plusHaut
    expect(plusHaut.instant).not.toBeNull()
    expect(plusHaut.altitudeDeg).toBe(etape.creneau.plusHaut.altitudeDeg)
    expect(plusHaut.instant!.getTime()).toBe(etape.creneau.plusHaut.instant!.getTime())
  })

  it('divergerait si la fiche ignorait la Lune — c’est le défaut que ce test garde fermé', () => {
    const ignoree: LuneFiche = { evaluee: false, cause: 'Lune ignorée, comme avant T-0089.' }
    const sansLune = evalue(
      contexteFiche(sbBase),
      etape.objet,
      SNR_PLAN,
      ISO,
      ignoree,
      nuit.capture,
    )
    expect(sansLune.integration?.tRequisS.value).not.toBeCloseTo(
      etape.integration.tRequisS.value,
      6,
    )
  })
})

describe('§6.3 — une Lune sous l’horizon ne dégrade rien, et la fiche le dit', () => {
  /** Premier instant de la nuit où la Lune est couchée, cherché heure par heure. */
  function instantSansLune(): Date {
    const nuit = fenetreNocturne(SITE, new Date('2026-08-01T12:00:00Z'))
    const depart = nuit.debutReference ?? new Date('2026-08-01T22:00:00Z')
    for (let heures = 0; heures < 24; heures += 1) {
      const essai = new Date(depart.getTime() + heures * 3600_000)
      if (etatLune(SITE, essai).sousHorizon) return essai
    }
    throw new Error('Lune levée 24 h d’affilée : impossible à cette latitude.')
  }

  const instant = instantSansLune()
  const lune = lunePourCible({
    site: SITE,
    instant,
    objet: NGC7000,
    sbCielNoirMag: SB_CIEL_NOIR,
  })
  const fiche = evalue(contexteFiche(SB_CIEL_NOIR), NGC7000, SNR_PLAN, ISO, lune, SANS_CRENEAU)

  it('laisse le fond de ciel intact, quelle que soit la phase', () => {
    expect(lune.evaluee && lune.ciel.delta.value).toBe(0)
    expect(fiche.sbCielEffectif).toBe(SB_CIEL_NOIR)
  })

  it('l’annonce explicitement plutôt que de pénaliser la cible', () => {
    expect(fiche.detect.noteLune).toMatch(/Lune couchée : aucune gêne/)
  })
})

describe('§6.3 et §7.5 — la même Lune ne pénalise pas tous les types de la même façon', () => {
  const { contexte, etape } = nuitAvecLune()
  const sbBase = sbCielBase(contexte)
  const lune = lunePourCible({
    site: SITE,
    instant: instantLune(etape.creneau, etape.creneauAlloue.debut),
    objet: etape.objet,
    sbCielNoirMag: sbBase,
  })

  function conseilPour(typeObjet: TypeObjet) {
    const ctx = contexteFiche(sbBase)
    // Le type de l'objet décide du conseil : il est imposé ici, la cible restant la même.
    const r = evalue(ctx, { ...etape.objet, type: typeObjet }, SNR_PLAN, ISO, lune, SANS_CRENEAU)
    return {
      r,
      conseils: conseilsCible(ctx, r, {
        typeObjet,
        snrCible: SNR_PLAN,
        explicationDepliee: true,
      }),
    }
  }

  const emission = conseilPour('EMISSION')
  const galaxie = conseilPour('GALAXIE')

  it('porte la tolérance lunaire du type d’objet dans la fiche', () => {
    expect(emission.r.detect.toleranceLune).toBe('FORTE')
    expect(galaxie.r.detect.toleranceLune).toBe('FAIBLE')
    expect(emission.r.detect.conseilType).toMatch(/bi-bande/)
    expect(galaxie.r.detect.conseilType).toMatch(/Lune couchée/)
  })

  it('déclenche le conseil bi-bande sur la nébuleuse en émission, par la Lune et non par le Bortle', () => {
    expect(lune.evaluee && lune.ciel.delta.value).toBeGreaterThan(0)
    expect(emission.conseils?.filtre.declenche).toBe(true)
    expect(emission.conseils?.filtre.message).toMatch(/reste planifiable sans filtre/)
  })

  it('n’émet aucun conseil filtre sur la galaxie : aucun filtre n’aide un spectre continu', () => {
    expect(galaxie.conseils?.filtre.declenche).toBe(false)
    expect(galaxie.conseils?.filtre.message).toMatch(/Aucun filtre n’aide/)
  })
})

describe('T-0089 — une Lune non évaluée ne se voit pas inventer un fond de ciel', () => {
  /**
   * §12.5 — l'instant sorti du domaine des séries est le seul refus qui subsiste depuis
   * T-0156 : une cible a toujours ses coordonnées. La cause vient du moteur, pas d'ici.
   */
  const lune: LuneFiche = {
    evaluee: false,
    cause: 'Instant hors du domaine des séries : la Lune n’est pas chiffrée.',
  }
  const fiche = evalue(contexteFiche(SB_CIEL_NOIR), NGC7000, SNR_PLAN, ISO, lune, SANS_CRENEAU)

  it('garde le fond de ciel du site plutôt que de deviner la dégradation', () => {
    expect(fiche.sbCielEffectif).toBe(SB_CIEL_NOIR)
    // Sans créneau, aucune hauteur n'est supposée : ni plancher affiché, ni masse d'air.
    expect(fiche.plusHaut).toBeNull()
    expect(fiche.plancher).toBeNull()
    expect(fiche.extinction?.masseAir.value).toBeNull()
  })

  it('ne produit alors aucune note lunaire : rien n’a été évalué', () => {
    expect(fiche.detect.noteLune).toBeUndefined()
  })
})
