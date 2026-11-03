/**
 * §6.1 — ideal focale of a discarded cible, §6.2 — cadrage verdict per cible. Two rules:
 *   1. discarded cible comes WITH ITS CAUSE and the focale that would frame it — silent refusal
 *      teaches nothing;
 *   2. software-crop compensation never offered: cropping creates no pixels (44 px object stays
 *      44 px).
 */

import { K } from '../registry/constants.ts'
import { degres, nombre, pourcentage } from '../registry/ecriture.ts'
import {
  RAPPORT_AXES_ORIENTATION,
  TABLE_CADRAGE,
  type VerdictCadrage,
} from '../registry/verdicts.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { DEG } from './mat3.ts'
import { ARCMIN_PAR_DEG, ARCSEC_PAR_ARCMIN } from './unites.ts'


export type { VerdictCadrage }

/** Never offered, stated once: replaces the "je recadrerai au traitement" reflex. */
export const REFUS_RECADRAGE_LOGICIEL =
  'Recadrer ensuite n’ajoute pas de détail : seule une focale plus longue aide.'

/**
 * Focale framing a cible cleanly: aims at middle of window C-05; range covers the whole window,
 * ⅓ to ½ of champ.
 */
export function focaleIdeale(tailleObjetDeg: number, capteurHMm: number): Traced<number> {
  const focalePour = (remplissage: number): number => {
    const fovDeg = tailleObjetDeg / remplissage
    return capteurHMm / (2 * Math.tan((fovDeg / 2) * DEG))
  }
  return trace({
    value: focalePour(K('REMPLISSAGE_CADRE_CIBLE')),
    formula: 'FOCALE_IDEALE',
    inputs: { taille_objet_deg: tailleObjetDeg, capteur_h_mm: capteurHMm },
    constants: ['REMPLISSAGE_CADRE_CIBLE', 'REMPLISSAGE_CADRE_MIN', 'REMPLISSAGE_CADRE_MAX'],
    range: [focalePour(K('REMPLISSAGE_CADRE_MIN')), focalePour(K('REMPLISSAGE_CADRE_MAX'))],
    note: REFUS_RECADRAGE_LOGICIEL,
  })
}

// ---------------------------------------------------------------------------
// §6.2 — cadrage verdict per cible
// ---------------------------------------------------------------------------

export interface EntreeCadrage {
  readonly fovHDeg: number
  readonly echApx: number
  readonly capteurHMm: number
  readonly tailleMajArcmin: number
  readonly tailleMinArcmin?: number | null
  /** Position angle of the major axis. Often missing from catalogue. */
  readonly posAngDeg?: number | null
  /**
   * §3.5 — champ of sensor long side. With `angleGrandAxeDeg` it orients the fill; without,
   * short side alone decides.
   */
  readonly fovLDeg?: number
  /** Cible major-axis angle in sensor axes (boîtier roulis incl.); `null` = not in catalogue. */
  readonly angleGrandAxeDeg?: number | null
}

/**
 * §6.2 with §3.5 boîtier orientation: occupied fraction of cadre = that of cible's BOUNDING BOX
 * in sensor axes. Rectangle chord along major axis would give more margin at 45° than a major
 * axis aligned with long side — physically wrong (no margin for field rotation/edge gradients).
 * Bounding box reduces exactly to "major axis vs short side" at φ = 90°, the shape the §6.2
 * table is calibrated on: rotating boîtier 90° changes verdict without shifting it.
 * No usable orientation → short side alone: conservative, claims no angle the catalogue lacks.
 */
function remplissageCadre(entree: EntreeCadrage): Traced<number> {
  const majDeg = entree.tailleMajArcmin / ARCMIN_PAR_DEG
  const phi = entree.angleGrandAxeDeg
  if (entree.fovLDeg === undefined || phi === null || phi === undefined) {
    return trace({
      value: majDeg / entree.fovHDeg,
      formula: 'REMPLISSAGE',
      inputs: { taille_objet_deg: majDeg, fov_h_deg: entree.fovHDeg },
    })
  }
  // No minor axis in catalogue: cible taken round — same hypothesis as `orientation()`, which
  // then suggests no angle.
  const minDeg =
    (entree.tailleMinArcmin === null || entree.tailleMinArcmin === undefined
      ? entree.tailleMajArcmin
      : entree.tailleMinArcmin) / ARCMIN_PAR_DEG
  // Bounding box of an ELLIPSE, not a rectangle: §6.3 models cible as ellipse (AIRE_ELLIPSE).
  // Rectangle would grow a round cible ×√2 at 45° — false, a disc has no orientation.
  const cos2 = Math.cos(phi * DEG) ** 2
  const sin2 = Math.sin(phi * DEG) ** 2
  const u = Math.sqrt(majDeg ** 2 * cos2 + minDeg ** 2 * sin2)
  const v = Math.sqrt(majDeg ** 2 * sin2 + minDeg ** 2 * cos2)
  return trace({
    value: Math.max(u / entree.fovLDeg, v / entree.fovHDeg),
    formula: 'REMPLISSAGE_ORIENTE',
    inputs: {
      maj_deg: majDeg,
      min_deg: minDeg,
      phi_deg: phi,
      fov_l_deg: entree.fovLDeg,
      fov_h_deg: entree.fovHDeg,
    },
  })
}

export interface FicheCadrage {
  readonly remplissage: Traced<number>
  readonly verdict: VerdictCadrage
  /** False as soon as "faisable" verdict must be refused, cause attached. */
  readonly faisable: boolean
  readonly message: string
  readonly diamPx: Traced<number>
  /** Set in mosaïque: tile count is also the factor on total time. */
  readonly nTuiles?: Traced<number>
  /** `null` when catalogue gives no position angle. */
  readonly angleBoitierDeg: number | null
  readonly noteOrientation: string
  /** Refusal cause, if any: names what blocks. */
  readonly cause?: string
  /** Focale that would make the cible frameable, when it isn't. */
  readonly focaleIdealeMm?: Traced<number>
}

function orientation(
  tailleMajArcmin: number,
  tailleMinArcmin: number | null | undefined,
  posAngDeg: number | null | undefined,
): { readonly angleBoitierDeg: number | null; readonly noteOrientation: string } {
  const rapport =
    tailleMinArcmin === null || tailleMinArcmin === undefined || tailleMinArcmin === 0
      ? 1
      : tailleMajArcmin / tailleMinArcmin

  if (rapport <= RAPPORT_AXES_ORIENTATION) {
    return {
      angleBoitierDeg: null,
      noteOrientation:
        'Cible presque ronde : l’orientation du boîtier ne change rien.',
    }
  }
  if (posAngDeg === null || posAngDeg === undefined) {
    return {
      angleBoitierDeg: null,
      noteOrientation:
        'Cible allongée, orientation inconnue : pas d’angle conseillé.',
    }
  }
  return {
    angleBoitierDeg: posAngDeg,
    noteOrientation:
      `Cible allongée : tournez le boîtier à ${degres(posAngDeg, 0)} pour l’aligner sur la ` +
      'longueur du capteur.',
  }
}

/**
 * Fill rate, orientation, mosaïque and "trop petit" for a cible. Pixel diameter decides
 * independently of fill: cible may fill an OK fraction of champ yet be a pixel blob.
 */
export function ficheCadrage(entree: EntreeCadrage): FicheCadrage {
  const { echApx, capteurHMm, tailleMajArcmin } = entree
  const tailleObjetDeg = tailleMajArcmin / ARCMIN_PAR_DEG
  const remplissageTrace = remplissageCadre(entree)
  const remplissage = remplissageTrace.value
  const ligne = TABLE_CADRAGE.find((l) => remplissage >= l.remplissageMin) ?? TABLE_CADRAGE[TABLE_CADRAGE.length - 1]!
  const diamPx = (tailleMajArcmin * ARCSEC_PAR_ARCMIN) / echApx
  const tropPetitEnPixels = diamPx < K('DIAMETRE_PIXELS_MIN')
  const faisable = ligne.faisable && !tropPetitEnPixels

  const causes: string[] = []
  if (!ligne.faisable) {
    causes.push(
      `${ligne.message} Elle occupe ${pourcentage(remplissage, 2)} du cadre.`,
    )
  }
  if (tropPetitEnPixels) {
    causes.push(
      `Seulement ${nombre(diamPx, 0)} px de large : aucun détail visible sous ` +
        `${K('DIAMETRE_PIXELS_MIN')} px.`,
    )
  }
  if (causes.length > 0) causes.push(REFUS_RECADRAGE_LOGICIEL)

  const nTuilesValeur =
    remplissage > 1
      ? Math.ceil(remplissage * (1 + K('RECOUVREMENT_MOSAIQUE'))) ** 2
      : null

  return {
    remplissage: remplissageTrace,
    verdict: ligne.verdict,
    faisable,
    message: ligne.message,
    diamPx: trace({
      value: diamPx,
      formula: 'DIAMETRE_PIXELS',
      inputs: { taille_objet_arcsec: tailleMajArcmin * ARCSEC_PAR_ARCMIN, ech_apx: echApx },
      constants: ['DIAMETRE_PIXELS_MIN'],
    }),
    ...(nTuilesValeur === null
      ? {}
      : {
          nTuiles: trace({
            value: nTuilesValeur,
            formula: 'NOMBRE_TUILES',
            inputs: { taille_objet_deg: tailleObjetDeg, fov_h_deg: entree.fovHDeg },
            constants: ['RECOUVREMENT_MOSAIQUE'],
            note:
              `${nTuilesValeur} fois plus de temps qu’une seule photo.`,
          }),
        }),
    ...orientation(tailleMajArcmin, entree.tailleMinArcmin, entree.posAngDeg),
    ...(faisable ? {} : { cause: causes.join(' ') }),
    ...(faisable ? {} : { focaleIdealeMm: focaleIdeale(tailleObjetDeg, capteurHMm) }),
  }
}
