/**
 * §7.5 — contextual filter advice; §10.3 — equipment recommendation.
 * Single rule: THE APP SELLS NOTHING. Names an equipment CATEGORY, quantifies gain via existing
 * engines. Never brand, model, price, banner, or spontaneous suggestion in the target list.
 * Four cumulative conditions (§10.3): 1. a verdict is unfavourable; 2. missing equipment is the
 * dominant factor of §10.2; 3. cheaper levers presented first; 4. user unfolded the explanation.
 * Ban: equipment whose gain existing engines can't compute is NEVER recommended ("a better sensor
 * gives nicer images" = unquantifiable, out of scope).
 */

import { K } from '../registry/constants.ts'
import { dureeLisible, nombre } from '../registry/ecriture.ts'
import { ligneFiltre, TYPES_EN_EMISSION, type FamilleFiltre } from '../registry/filters.ts'
import type { VerdictCadrage } from '../registry/verdicts.ts'
import type { TypeObjet } from '../data/deepsky.ts'
import { integrationRequiseS } from './exposure.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'

export type CategorieEquipement =
  | 'FILTRE_DUAL_BAND'
  | 'FOCALE_PLUS_LONGUE'
  | 'FOCALE_PLUS_COURTE'
  | 'MONTURE_SUIVI'
  | 'AUTOGUIDAGE'

export interface Recommandation {
  readonly categorie: CategorieEquipement
  readonly libelle: string
  /** Computed differential, never qualitative gain: "sans X — avec Y — rapport Z". */
  readonly sans: string
  readonly avec: string
  readonly rapport: number
  readonly explication: string
}

// §7.5 — conseil filtre

export interface EntreeConseilFiltre {
  readonly typeObjet: TypeObjet
  readonly bortle: number | null
  /** fond de ciel degradation by Moon (§8.1), mag/arcsec². */
  readonly deltaSbLuneMag: number
  readonly cadragePlanifiable: boolean
  readonly explicationDepliee: boolean
  readonly eObj: number
  readonly eCiel: number
  readonly tPoseS: number
  readonly readNoiseE: number
  readonly snrCible: number
  readonly tailleRawMo: number
}

export interface ConseilFiltre {
  readonly declenche: boolean
  readonly tRequisSansS: number
  readonly tRequisAvecS: number | null
  readonly gainSnr: number | null
  readonly fractionTransmise: Traced<number> | null
  readonly message: string
}

/** Share of fond de ciel a filter family lets through. */
export function fractionFondDeCielTransmise(famille: FamilleFiltre): Traced<number> {
  const ligne = ligneFiltre(famille)
  const somme = ligne.bandesNm.reduce((total, bande) => total + bande, 0)
  const fraction = somme === 0 ? 1 : somme / K('LARGEUR_BANDE_LARGE_NM')
  return trace({
    value: fraction,
    formula: 'TRANSMISSION_FOND_DE_CIEL',
    inputs: { bandes_nm: somme },
    constants: ['LARGEUR_BANDE_LARGE_NM'],
    note: ligne.note,
  })
}

/**
 * Strict conditional trigger, never a banner. Never for galaxy, reflection nebula, cluster or dark
 * nebula: continuous spectrum, narrow-band filter cuts their signal too.
 */
export function conseilFiltre(entree: EntreeConseilFiltre): ConseilFiltre {
  const base = {
    eObj: entree.eObj,
    eCiel: entree.eCiel,
    tPoseS: entree.tPoseS,
    readNoiseE: entree.readNoiseE,
    snrCible: entree.snrCible,
    tailleRawMo: entree.tailleRawMo,
  }
  const tSans = integrationRequiseS(base, entree.snrCible)
  const rien = {
    declenche: false,
    tRequisSansS: tSans,
    tRequisAvecS: null,
    gainSnr: null,
    fractionTransmise: null,
  }

  if (!TYPES_EN_EMISSION.includes(entree.typeObjet)) {
    return {
      ...rien,
      message:
        'Aucun filtre n’aide sur cet objet : visez un ciel plus noir ou un temps de pose plus long.',
    }
  }
  const cielDegrade =
    entree.deltaSbLuneMag > 0 ||
    (entree.bortle !== null && entree.bortle >= K('BORTLE_SEUIL_CONSEIL_FILTRE'))
  if (!cielDegrade || !entree.cadragePlanifiable) {
    return {
      ...rien,
      message:
        'Le ciel n’est pas le problème ici : pas besoin de filtre.',
    }
  }
  if (!entree.explicationDepliee) {
    return {
      ...rien,
      message:
        'Conseil filtre dans l’explication du verdict.',
    }
  }

  const fraction = fractionFondDeCielTransmise('DUAL_BAND')
  const tAvec = integrationRequiseS({ ...base, eCiel: entree.eCiel * fraction.value }, entree.snrCible)
  const gain = Math.sqrt(entree.eCiel / (entree.eCiel * fraction.value))

  return {
    declenche: true,
    tRequisSansS: tSans,
    tRequisAvecS: tAvec,
    gainSnr: gain,
    fractionTransmise: fraction,
    message:
      'Un filtre bi-bande coupe la pollution lumineuse et la Lune, pas la nébuleuse. ' +
      `Sans filtre : ${dureeLisible(tSans)} de pose. Avec : ${dureeLisible(tAvec)}, ` +
      `${nombre(tSans / tAvec, 1)} fois moins. La cible reste planifiable sans filtre.`,
  }
}

// §10.3 — recommandation d'équipement

export interface EntreeRecommandations {
  readonly conseilFiltre: ConseilFiltre
  readonly verdictDefavorable: boolean
  readonly explicationDepliee: boolean
  /** Cheaper levers already presented to user (§10.3, condition 3). */
  readonly leviersPresentes: readonly string[]
  /** `null` without catalogue dimensions: no focal advice on nothing. */
  readonly verdictCadrage: VerdictCadrage | null
  readonly focaleActuelleMm: number
  readonly focaleIdealeMm: number | null
  readonly nTuiles: number | null
  /** True when mount limits pose before physics does (§7.2). */
  readonly regimeLimiteSuivi: boolean
  readonly suiviActif: boolean
  readonly tOptS: number
  readonly tMaxSuiviS: number | null
}

export interface SortieRecommandations {
  readonly recommandations: readonly Recommandation[]
  readonly message: string
  /** True until cumulative conditions met: nothing displayed. */
  readonly silencieux: boolean
}

export function recommandationsEquipement(
  entree: EntreeRecommandations,
): SortieRecommandations {
  if (!entree.explicationDepliee) {
    return {
      recommandations: [],
      silencieux: true,
      message:
        'Conseils matériel dans l’explication du verdict.',
    }
  }
  if (!entree.verdictDefavorable) {
    return {
      recommandations: [],
      silencieux: true,
      message: 'Verdict favorable : votre matériel suffit.',
    }
  }
  if (entree.leviersPresentes.length === 0) {
    return {
      recommandations: [],
      silencieux: true,
      message:
        'Essayez d’abord une autre cible, un meilleur créneau, un ciel plus noir ou plus de temps.',
    }
  }

  const recommandations: Recommandation[] = []

  const filtre = entree.conseilFiltre
  if (filtre.declenche && filtre.tRequisAvecS !== null && filtre.gainSnr !== null) {
    recommandations.push({
      categorie: 'FILTRE_DUAL_BAND',
      libelle: 'Filtre bi-bande Hα / OIII',
      sans: dureeLisible(filtre.tRequisSansS),
      avec: dureeLisible(filtre.tRequisAvecS),
      rapport: filtre.tRequisSansS / filtre.tRequisAvecS,
      explication: filtre.message,
    })
  }

  if (
    (entree.verdictCadrage === 'CADRAGE_PERDU' || entree.verdictCadrage === 'HORS_DOMAINE') &&
    entree.focaleIdealeMm !== null
  ) {
    recommandations.push({
      categorie: 'FOCALE_PLUS_LONGUE',
      libelle: 'Focale plus longue',
      sans: `${nombre(entree.focaleActuelleMm, 0)} mm`,
      avec: `${nombre(entree.focaleIdealeMm, 0)} mm`,
      rapport: entree.focaleIdealeMm / entree.focaleActuelleMm,
      explication:
        `À ${nombre(entree.focaleActuelleMm, 0)} mm, la cible est trop petite dans l’image. ` +
        `Il faudrait environ ${nombre(entree.focaleIdealeMm, 0)} mm ; recadrer ensuite ` +
        'n’ajoute pas de détail.',
    })
  }

  if (
    entree.verdictCadrage === 'MOSAIQUE_REQUISE' &&
    entree.nTuiles !== null &&
    entree.nTuiles > K('TUILES_SEUIL_FOCALE_COURTE')
  ) {
    recommandations.push({
      categorie: 'FOCALE_PLUS_COURTE',
      libelle: 'Focale plus courte',
      sans: `${entree.nTuiles} tuiles`,
      avec: '1 tuile',
      rapport: entree.nTuiles,
      explication:
        `La mosaïque demande ${entree.nTuiles} photos, donc ${entree.nTuiles} fois plus de ` +
        'temps. Une focale plus courte fait tenir la cible en une seule.',
    })
  }

  if (!entree.suiviActif && entree.tMaxSuiviS !== null && entree.tOptS > entree.tMaxSuiviS) {
    recommandations.push({
      categorie: 'MONTURE_SUIVI',
      libelle: 'Monture de suivi',
      sans: `${nombre(entree.tMaxSuiviS, 1)} s de pose`,
      avec: `${nombre(entree.tOptS, 1)} s de pose`,
      rapport: entree.tOptS / entree.tMaxSuiviS,
      explication:
        'Sans suivi, les poses restent trop courtes. Une monture de suivi ouvre les cibles ' +
        'faibles.',
    })
  }

  if (
    entree.suiviActif &&
    entree.regimeLimiteSuivi &&
    entree.tMaxSuiviS !== null &&
    entree.tMaxSuiviS >= K('PLAFOND_POSE_SANS_AUTOGUIDAGE_S')
  ) {
    recommandations.push({
      categorie: 'AUTOGUIDAGE',
      libelle: 'Autoguidage',
      sans: `${nombre(entree.tMaxSuiviS, 0)} s de pose`,
      avec: `au-delà de ${K('PLAFOND_POSE_SANS_AUTOGUIDAGE_S')} s`,
      rapport: entree.tOptS / entree.tMaxSuiviS,
      explication:
        `Sans autoguidage, les poses plafonnent à ${K('PLAFOND_POSE_SANS_AUTOGUIDAGE_S')} s, ` +
        'même bien mis en station.',
    })
  }

  return {
    recommandations,
    silencieux: recommandations.length === 0,
    message:
      recommandations.length === 0
        ? 'Aucun achat ne changerait ce verdict de façon chiffrable.'
        : 'Gains calculés pour votre cas.',
  }
}
