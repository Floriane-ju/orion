/**
 * §5.1 — optical profile and sensor. Two PRD traps wired in code:
 *   1. rectilinear field = arctangent EVERYWHERE, no switch condition — linear approx 57.3 × d / f
 *      gives 205.7° at 10 mm full frame, impossible. Fisheye = equidistant (R = f·θ): field IS
 *      linear in d / f, bounded by image circle (T-0218);
 *   2. APS-C recadrage changes sensor dimensions, never pitch: échantillonnage, NPF, pose max
 *      independent of it. Recadrage magnifies nothing, app says so (see `capteurEffectif`).
 */

import { K } from '../registry/constants.ts'
import { valide } from '../registry/domains.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { DEG } from './mat3.ts'
import type { ModeProjection } from './projection.ts'
import { UM_PAR_MM } from './unites.ts'


/** §5.1 — four regimes, for common seeing 2-3" (C-04). */
export type DiagnosticEchantillonnage =
  | 'SUR_ECHANTILLONNE'
  | 'NOMINAL'
  | 'SOUS_ECHANTILLONNE_MODERE'
  | 'GRAND_CHAMP_ASSUME'

/** §5.1 — drives field law and projection of §3.3, §9.2, §9.3. */
export type TypeObjectif = 'RECTILINEAIRE' | 'FISHEYE'

/** §5.1 — projection this lens imposes on the scene: it chooses, doesn't tweak a render. */
export function modeObjectif(type: TypeObjectif): ModeProjection {
  return type === 'FISHEYE' ? 'MODE_FISHEYE' : 'MODE_CADRE'
}

export interface EntreeOptique {
  readonly focaleMm: number
  /** Absent: rectilinear (input default, §5.1). */
  readonly typeObjectif?: TypeObjectif
  readonly ouvertureN: number
  /** Effective dimensions, recadrage already applied (see `capteurEffectif`). */
  readonly capteurLMm: number
  readonly capteurHMm: number
  readonly pitchUm: number
}

export interface ProfilOptique {
  readonly fovLDeg: Traced<number>
  readonly fovHDeg: Traced<number>
  readonly dMm: Traced<number>
  readonly echApx: Traced<number>
  readonly dawesAs: Traced<number>
  readonly diagEch: DiagnosticEchantillonnage
  readonly messageDiag: string
  /**
   * True only if échantillonnage deserves flagging. Undersampling NORMAL for grand champ: no alert
   * at 8.80 "/px.
   */
  readonly alerte: boolean
}

/** Focal of a rectilinear field over a sensor dimension: inverse of `fovDeg`. */
export function focalePourChamp(dimensionMm: number, champDeg: number): number {
  return dimensionMm / (2 * Math.tan((champDeg * DEG) / 2))
}

/**
 * Angular field of a sensor dimension. Rectilinear: arctangent, no exception (§5.1); equidistant
 * fisheye: d / f, capped at image circle.
 */
export function fovDeg(
  dimensionMm: number,
  focaleMm: number,
  typeObjectif: TypeObjectif = 'RECTILINEAIRE',
): Traced<number> {
  if (typeObjectif === 'FISHEYE') {
    const lineaireDeg = dimensionMm / focaleMm / DEG
    const plafondDeg = K('CHAMP_MAX_FISHEYE_DEG')
    return trace({
      value: Math.min(lineaireDeg, plafondDeg),
      formula: 'FOV_FISHEYE',
      inputs: { dimension_capteur_mm: dimensionMm, focale_mm: focaleMm },
      constants: ['CHAMP_MAX_FISHEYE_DEG'],
      ...(lineaireDeg > plafondDeg
        ? {
            note:
              `Le capteur dépasse le cercle de l’image : champ limité à ${plafondDeg}°.`,
          }
        : {}),
    })
  }
  return trace({
    value: (2 * Math.atan(dimensionMm / (2 * focaleMm))) / DEG,
    formula: 'FOV',
    inputs: { dimension_capteur_mm: dimensionMm, focale_mm: focaleMm },
  })
}

interface Diagnostic {
  readonly diagEch: DiagnosticEchantillonnage
  readonly messageDiag: string
  readonly alerte: boolean
}

function diagnostique(echApx: number): Diagnostic {
  if (echApx < K('ECHANTILLONNAGE_NOMINAL_MIN')) {
    return {
      diagEch: 'SUR_ECHANTILLONNE',
      messageDiag:
        'Pixels trop petits pour cette focale : plus de bruit que de détail. Une focale plus ' +
        'courte aide.',
      alerte: true,
    }
  }
  if (echApx <= K('ECHANTILLONNAGE_NOMINAL_MAX')) {
    return {
      diagEch: 'NOMINAL',
      messageDiag: 'Bon équilibre entre pixels et focale.',
      alerte: false,
    }
  }
  if (echApx <= K('ECHANTILLONNAGE_SOUS_MODERE_MAX')) {
    return {
      diagEch: 'SOUS_ECHANTILLONNE_MODERE',
      messageDiag: 'Pixels un peu grands : normal en grand champ.',
      alerte: false,
    }
  }
  return {
    diagEch: 'GRAND_CHAMP_ASSUME',
    messageDiag: '',
    alerte: false,
  }
}

/**
 * Optical-train derived quantities. Throws `SaisieRefuseeError` naming field; never infinite/NaN
 * (§5.1).
 */
export function profilOptique(entree: EntreeOptique): ProfilOptique {
  const focaleMm = valide('focale_mm', entree.focaleMm)
  const ouvertureN = valide('ouverture_N', entree.ouvertureN)
  const capteurLMm = valide('capteur_mm', entree.capteurLMm)
  const capteurHMm = valide('capteur_mm', entree.capteurHMm)
  const pitchUm = valide('pitch_um', entree.pitchUm)

  const echApx = (K('RADIAN_EN_ARCSEC') * pitchUm) / (focaleMm * UM_PAR_MM)
  const dMm = focaleMm / ouvertureN

  return {
    fovLDeg: fovDeg(capteurLMm, focaleMm, entree.typeObjectif),
    fovHDeg: fovDeg(capteurHMm, focaleMm, entree.typeObjectif),
    dMm: trace({
      value: dMm,
      formula: 'DIAMETRE_PUPILLE',
      inputs: { focale_mm: focaleMm, ouverture_N: ouvertureN },
    }),
    echApx: trace({
      value: echApx,
      formula: 'ECHANTILLONNAGE',
      inputs: { pitch_um: pitchUm, focale_mm: focaleMm },
      constants: ['RADIAN_EN_ARCSEC'],
      note: 'Le recadrage du capteur ne le change pas.',
    }),
    dawesAs: trace({
      value: K('DAWES_NUMERATEUR') / dMm,
      formula: 'DAWES',
      inputs: { d_mm: dMm },
      constants: ['DAWES_NUMERATEUR'],
    }),
    ...diagnostique(echApx),
  }
}
