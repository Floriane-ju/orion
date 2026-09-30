/**
 * §7.5 — Conseil filtre contextuel, et §10.3 — recommandation d'équipement.
 *
 * Une seule règle gouverne tout le module : L'APPLICATION NE VEND RIEN. Elle nomme une
 * CATÉGORIE d'équipement et chiffre le gain par les moteurs existants. Jamais de marque,
 * jamais de modèle, jamais de prix, jamais de bandeau, jamais de suggestion spontanée en
 * liste de cibles.
 *
 * Quatre conditions cumulatives, sans exception (§10.3) :
 *   1. un verdict est défavorable ;
 *   2. l'équipement absent est le facteur dominant identifié en §10.2 ;
 *   3. les leviers de coût inférieur ont été présentés d'abord ;
 *   4. l'utilisateur a déplié l'explication.
 *
 * Et une interdiction : un équipement dont le gain n'est pas calculable par les moteurs
 * existants n'est JAMAIS recommandé. Pas de « un meilleur capteur donnerait de plus belles
 * images » — non chiffrable, donc hors périmètre.
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
  /** Différentiel calculé, jamais un gain qualitatif : « sans X — avec Y — rapport Z ». */
  readonly sans: string
  readonly avec: string
  readonly rapport: number
  readonly explication: string
}

// ---------------------------------------------------------------------------
// §7.5 — conseil filtre
// ---------------------------------------------------------------------------

export interface EntreeConseilFiltre {
  readonly typeObjet: TypeObjet
  readonly filtresPossedes: readonly FamilleFiltre[]
  readonly bortle: number | null
  /** Dégradation du fond de ciel par la Lune (§8.1), en mag/arcsec². */
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

/** Part du fond de ciel que laisse passer une famille de filtres. */
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
 * Déclenchement conditionnel strict, jamais de bandeau. Sur une galaxie, une nébuleuse par
 * réflexion, un amas ou une nébuleuse obscure, le conseil n'est jamais émis : ces objets
 * émettent en spectre continu, et le filtre à bande étroite coupe leur signal aussi.
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
  if (entree.filtresPossedes.includes('DUAL_BAND')) {
    return {
      ...rien,
      message:
        'Filtre bi-bande déjà pris en compte.',
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

// ---------------------------------------------------------------------------
// §10.3 — recommandation d'équipement
// ---------------------------------------------------------------------------

export interface EntreeRecommandations {
  readonly conseilFiltre: ConseilFiltre
  readonly verdictDefavorable: boolean
  readonly explicationDepliee: boolean
  /** Leviers de coût inférieur déjà présentés à l'utilisateur (§10.3, condition 3). */
  readonly leviersPresentes: readonly string[]
  /** `null` sans dimensions au catalogue : aucun conseil de focale ne s'appuie sur rien. */
  readonly verdictCadrage: VerdictCadrage | null
  readonly focaleActuelleMm: number
  readonly focaleIdealeMm: number | null
  readonly nTuiles: number | null
  /** Vrai quand la monture bride la pose avant la physique (§7.2). */
  readonly regimeLimiteSuivi: boolean
  readonly suiviActif: boolean
  readonly tOptS: number
  readonly tMaxSuiviS: number | null
}

export interface SortieRecommandations {
  readonly recommandations: readonly Recommandation[]
  readonly message: string
  /** Vrai tant que les conditions cumulatives ne sont pas réunies : rien n'est affiché. */
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
