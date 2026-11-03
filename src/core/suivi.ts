/**
 * §5.2 — Profil Suivi, §9.1 — pose maximale à étoiles ponctuelles.
 * One question: « viseur polaire réglé ? »; « je ne sais pas » = mise en station approximative.
 * Never silently assumes worst case: announces the assumption and what the careful answer yields.
 * Reference poses C-12, C-13 are ORDERS OF MAGNITUDE: dependent outputs carry their range.
 */

import { K, type ConstantId } from '../registry/constants.ts'
import { nombre } from '../registry/ecriture.ts'
import { valide } from '../registry/domains.ts'
import type { Traced } from './traced.ts'
import { plageOrdreDeGrandeur, trace } from './traced.ts'
import { DEG } from './mat3.ts'
import { QUART_TOUR_DEG as POLE_DEG } from './unites.ts'

export type ModeSuivi = 'AUCUN' | 'SUIVI_APPROX' | 'SUIVI_SOIGNE'
export type QualiteMiseEnStation = 'SOIGNEE' | 'APPROX' | 'INCONNUE'
export type TypeMonture = 'GEM' | 'TRACKER' | 'ALTAZ'
export type ToleranceNpf = 'STRICT' | 'TOLERANT'

export interface EntreeNpf {
  readonly focaleMm: number
  readonly ouvertureN: number
  readonly pitchUm: number
  /** Aimed-zone declination: one pose max per declination. */
  readonly decDeg: number
  readonly tolerance?: ToleranceNpf
}

/**
 * Longest point-star pose at aimed declination (§9.1).
 * Exact pole (cos δ = 0): NPF undefined, no value.
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

/**
 * §9.3 — star blob angular extent, arcsec: path an equatorial star travels at NPF pose before
 * ceasing to be a point. NPF measures a trail against the blob (N term: diffraction/aberrations;
 * pitch term: pixel), not 1 pixel: 1-pixel crossing faded stars after seconds.
 */
export function tacheNpfArcsec(optique: Omit<EntreeNpf, 'decDeg' | 'tolerance'>): number {
  // 1°/h = 1 arcsec/s: NPF at equator × sky rotation = angle. δ = 0: NPF always defined.
  return K('ROTATION_CIEL_DEG_H') * npf({ ...optique, decDeg: 0 }).value!
}

export interface EntreeSuivi {
  readonly suiviActif: boolean
  readonly qualiteMes?: QualiteMiseEnStation
  readonly typeMonture: TypeMonture
  readonly focaleMm: number
}

export interface ProfilSuivi {
  readonly mode: ModeSuivi
  /** `null` = no tracking pose: no suivi or altaz mount. */
  readonly tMaxSuiviS: Traced<number | null>
  readonly domaineCpOuvert: boolean
  /** §8.2 — only German equatorial flips at meridian. */
  readonly retournementMeridien: boolean
  /**
   * Why deep-sky domain is closed; `null` = open.
   * Nullable, not optional: plan de séance and catalogue list show it instead of targets
   * (§8.3, §6.4); `undefined` would let them refuse silently.
   */
  readonly cause: string | null
  /** Quantified yield of a careful mise en station, when not done. */
  readonly gainMiseEnStation?: string
}

/** « Je ne sais pas » = approximatif: announced hypothesis, not assumed worst case. */
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
      `Poses de ${nombre(tMax, 0)} s. Avec un viseur polaire bien réglé : ` +
      `${nombre(tSoigne, 0)} s.`,
  }
}
