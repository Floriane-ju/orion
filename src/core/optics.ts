/**
 * §5.1 — Profil optique et capteur.
 *
 * Deux pièges du PRD sont câblés ici plutôt que rappelés en commentaire ailleurs :
 *
 *   1. le champ d'un rectilinéaire est l'arctangente PARTOUT, sans condition de bascule —
 *      l'approximation linéaire 57,3 × d / f donne 205,7° à 10 mm sur plein format, valeur
 *      impossible. Un fisheye, lui, est équidistant (R = f·θ) : son champ EST linéaire en
 *      d / f, borné au cercle image (T-0218) ;
 *   2. le recadrage APS-C change les dimensions du capteur, jamais le pitch : ni
 *      l'échantillonnage, ni la NPF, ni la pose max n'en dépendent. Le recadrage ne
 *      grossit rien, et l'application le dit (voir `capteurEffectif`, base matériel).
 */

import { K } from '../registry/constants.ts'
import { valide } from '../registry/domains.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { DEG } from './mat3.ts'
import type { ModeProjection } from './projection.ts'

const UM_PAR_MM = 1000

/** §5.1 — quatre régimes, pour un seeing courant de 2 à 3" (C-04). */
export type DiagnosticEchantillonnage =
  | 'SUR_ECHANTILLONNE'
  | 'NOMINAL'
  | 'SOUS_ECHANTILLONNE_MODERE'
  | 'GRAND_CHAMP_ASSUME'

/** §5.1 — pilote la loi du champ et la projection de §3.3, §9.2, §9.3. */
export type TypeObjectif = 'RECTILINEAIRE' | 'FISHEYE'

/** §5.1 — la projection que cet objectif impose à la scène : il la choisit, il n'ajuste pas un rendu. */
export function modeObjectif(type: TypeObjectif): ModeProjection {
  return type === 'FISHEYE' ? 'MODE_FISHEYE' : 'MODE_CADRE'
}

export interface EntreeOptique {
  readonly focaleMm: number
  /** Absent : rectilinéaire, la valeur par défaut de la saisie (§5.1). */
  readonly typeObjectif?: TypeObjectif
  readonly ouvertureN: number
  /** Dimensions effectives, recadrage déjà appliqué (voir `capteurEffectif`). */
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
   * Vrai seulement si l'échantillonnage mérite un signalement. Le sous-échantillonnage est
   * le régime NORMAL du grand champ : à 8,80 "/px l'application n'affiche aucune alerte.
   */
  readonly alerte: boolean
}

/**
 * Champ angulaire d'une dimension de capteur. Arctangente pour un rectilinéaire, sans
 * exception (§5.1) ; d / f pour un fisheye équidistant, plafonné à son cercle image.
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
 * Grandeurs dérivées du train optique. Lève `SaisieRefuseeError` en nommant le champ fautif
 * plutôt que de produire une valeur infinie ou NaN (§5.1).
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
