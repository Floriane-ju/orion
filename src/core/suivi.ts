/**
 * §5.2 — Profil Suivi, et §9.1 — pose maximale à étoiles ponctuelles.
 *
 * Une seule question est posée à l'utilisateur — « viseur polaire réglé ? » — et « je ne
 * sais pas » vaut mise en station approximative : le moteur ne suppose jamais le pire en
 * silence, il annonce ce qu'il a supposé et ce que la réponse soignée rapporterait.
 *
 * Les poses de référence C-12 et C-13 sont des ORDRES DE GRANDEUR. Toute sortie qui en
 * dépend porte sa plage : la mise en station reste à la charge de l'utilisateur sur le
 * terrain, l'application annonce un ordre de grandeur, jamais une valeur mesurée.
 */

import { K, type ConstantId } from '../registry/constants.ts'
import { valide } from '../registry/domains.ts'
import type { Traced } from './traced.ts'
import { plageOrdreDeGrandeur, trace } from './traced.ts'
import { DEG } from './mat3.ts'

const POLE_DEG = 90

export type ModeSuivi = 'AUCUN' | 'SUIVI_APPROX' | 'SUIVI_SOIGNE'
export type QualiteMiseEnStation = 'SOIGNEE' | 'APPROX' | 'INCONNUE'
export type TypeMonture = 'GEM' | 'TRACKER' | 'ALTAZ'
export type ToleranceNpf = 'STRICT' | 'TOLERANT'

export interface EntreeNpf {
  readonly focaleMm: number
  readonly ouvertureN: number
  readonly pitchUm: number
  /** Déclinaison de la zone visée : il n'existe pas une pose max, mais une par déclinaison. */
  readonly decDeg: number
  readonly tolerance?: ToleranceNpf
}

/**
 * Pose la plus longue conservant des étoiles ponctuelles, à la déclinaison visée (§9.1).
 * Au pôle exact, cos δ s'annule et la NPF n'est plus définie : aucune valeur n'est produite.
 */
export function npf(entree: EntreeNpf): Traced<number | null> {
  const focaleMm = valide('focale_mm', entree.focaleMm)
  const ouvertureN = valide('ouverture_N', entree.ouvertureN)
  const pitchUm = valide('pitch_um', entree.pitchUm)
  const decDeg = valide('dec_deg', entree.decDeg)
  const constanteK: ConstantId =
    entree.tolerance === 'TOLERANT' ? 'NPF_K_TOLERANT' : 'NPF_K_STRICT'
  const constants = ['NPF_COEF_OUVERTURE', 'NPF_COEF_PITCH', constanteK] as const
  const inputs = { focale_mm: focaleMm, ouverture_N: ouvertureN, pitch_um: pitchUm, dec_deg: decDeg }

  if (Math.abs(decDeg) >= POLE_DEG) {
    return trace({
      value: null,
      formula: 'NPF',
      inputs,
      constants,
      flags: ['HORS_DOMAINE'],
      note:
        'Au pôle, les étoiles ne filent pas : pas de limite de pose.',
    })
  }

  const numerateur =
    K('NPF_COEF_OUVERTURE') * ouvertureN + K('NPF_COEF_PITCH') * pitchUm
  return trace({
    value: (K(constanteK) * numerateur) / (focaleMm * Math.cos(decDeg * DEG)),
    formula: 'NPF',
    inputs,
    constants,
    ...(entree.tolerance === 'TOLERANT'
      ? {
          note:
            'Tolérance large : étoiles un peu étirées à 100 %, invisibles sur un tirage ou un écran.',
        }
      : {}),
  })
}

export interface EntreeSuivi {
  readonly suiviActif: boolean
  readonly qualiteMes?: QualiteMiseEnStation
  readonly typeMonture: TypeMonture
  readonly focaleMm: number
}

export interface ProfilSuivi {
  readonly mode: ModeSuivi
  /** `null` quand aucune pose de suivi n'a de sens : pas de suivi, ou monture altazimutale. */
  readonly tMaxSuiviS: Traced<number | null>
  readonly domaineCpOuvert: boolean
  /** §8.2 — seule l'équatoriale allemande impose un retournement au méridien. */
  readonly retournementMeridien: boolean
  /**
   * Pourquoi le domaine ciel profond est fermé — `null` quand il est ouvert.
   *
   * Nullable plutôt qu'optionnel : c'est cette phrase que le plan de séance et la liste du
   * catalogue affichent à la place des cibles (§8.3, §6.4), et un `undefined` les laisserait
   * refuser sans rien dire. Fermer le domaine et le justifier sont un seul geste.
   */
  readonly cause: string | null
  /** Ce qu'une mise en station soignée rapporterait, chiffré, quand elle ne l'est pas. */
  readonly gainMiseEnStation?: string
}

/** « Je ne sais pas » vaut approximatif : c'est l'hypothèse annoncée, pas le pire supposé. */
export function modeSuivi(entree: EntreeSuivi): ModeSuivi {
  if (!entree.suiviActif) return 'AUCUN'
  return entree.qualiteMes === 'SOIGNEE' ? 'SUIVI_SOIGNE' : 'SUIVI_APPROX'
}

function poseDeSuivi(constanteRef: ConstantId, focaleMm: number): number {
  const brute = (K(constanteRef) * K('FOCALE_REFERENCE_SUIVI_MM')) / focaleMm
  return Math.min(brute, K('PLAFOND_POSE_SANS_AUTOGUIDAGE_S'))
}

function suiviIndisponible(cause: string, focaleMm: number): Traced<number | null> {
  return trace({
    value: null,
    formula: 'POSE_MAX_SUIVI',
    inputs: { focale_mm: focaleMm },
    flags: ['DONNEE_MANQUANTE'],
    note: cause,
  })
}

export function profilSuivi(entree: EntreeSuivi): ProfilSuivi {
  const focaleMm = valide('focale_mm', entree.focaleMm)
  const mode = modeSuivi(entree)
  const retournementMeridien = entree.typeMonture === 'GEM'

  if (entree.typeMonture === 'ALTAZ') {
    const cause =
      'Monture altazimutale non gérée : sa rotation de champ déforme les poses.'
    return {
      mode,
      tMaxSuiviS: suiviIndisponible(cause, focaleMm),
      domaineCpOuvert: false,
      retournementMeridien,
      cause,
    }
  }

  if (mode === 'AUCUN') {
    const cause =
      'Sans suivi, les poses sont trop courtes pour le ciel profond. Le grand champ reste ' +
      'possible.'
    return {
      mode,
      tMaxSuiviS: suiviIndisponible(cause, focaleMm),
      domaineCpOuvert: false,
      retournementMeridien,
      cause,
    }
  }

  const constanteRef: ConstantId =
    mode === 'SUIVI_SOIGNE' ? 'T_REF_SOIGNE_200MM_S' : 'T_REF_APPROX_200MM_S'
  const tMax = poseDeSuivi(constanteRef, focaleMm)
  const plafonne = tMax >= K('PLAFOND_POSE_SANS_AUTOGUIDAGE_S')
  const [basse, haute] = plageOrdreDeGrandeur(tMax)

  const tMaxSuiviS = trace({
    value: tMax,
    formula: 'POSE_MAX_SUIVI',
    inputs: { focale_mm: focaleMm },
    constants: [constanteRef, 'FOCALE_REFERENCE_SUIVI_MM', 'PLAFOND_POSE_SANS_AUTOGUIDAGE_S'],
    range: [basse, Math.min(haute, K('PLAFOND_POSE_SANS_AUTOGUIDAGE_S'))],
    ...(plafonne
      ? {
          note:
            'Plafond des montures sans autoguidage.',
        }
      : {}),
  })

  if (mode === 'SUIVI_SOIGNE') {
    return { mode, tMaxSuiviS, domaineCpOuvert: true, retournementMeridien, cause: null }
  }

  const tSoigne = poseDeSuivi('T_REF_SOIGNE_200MM_S', focaleMm)
  return {
    mode,
    tMaxSuiviS,
    domaineCpOuvert: true,
    retournementMeridien,
    cause: null,
    gainMiseEnStation:
      `Poses de ${tMax.toFixed(0)} s. Avec un viseur polaire bien réglé : ` +
      `${tSoigne.toFixed(0)} s.`,
  }
}
