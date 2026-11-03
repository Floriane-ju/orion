/**
 * §6.3 — Visual-detection contrast thresholds.
 * THE POINT 90% OF APPS MISS: an instrument never raises extended-object surface brightness; it
 * raises apparent size, which lowers the contrast threshold. Detection depends on (ΔSB, apparent
 * size), never limiting magnitude alone.
 * Model: Blackwell (1946), popularised by Clark, *Visual Astronomy of the Deep Sky* (1990).
 * Threshold directly in ΔSB (object − sky surface-brightness gap), not contrast: comparable with
 * §6.3 output without conversion.
 * WORKING VALUES, `[À VÉRIFIER]` against published tables, like the Bortle limiting-magnitude
 * column.
 * Two bounds, no extrapolation between:
 *   - below smallest tabulated size: point, integrated magnitude decides, not surface brightness;
 *   - above largest: threshold CAPS (not extrapolation): eye's spatial summation is complete,
 *     enlarging adds nothing.
 */

export interface LigneContraste {
  /** Apparent size, magnification applied. */
  readonly tailleArcmin: number
  /** Minimal surface-brightness gap for detection, mag/arcsec². */
  readonly seuilDeltaSb: number
}

export const TABLE_CONTRASTE: readonly LigneContraste[] = Object.freeze(
  [
    { tailleArcmin: 1, seuilDeltaSb: -0.5 },
    { tailleArcmin: 2, seuilDeltaSb: -0.9 },
    { tailleArcmin: 5, seuilDeltaSb: -1.3 },
    { tailleArcmin: 10, seuilDeltaSb: -1.55 },
    { tailleArcmin: 20, seuilDeltaSb: -1.75 },
    { tailleArcmin: 40, seuilDeltaSb: -1.9 },
    { tailleArcmin: 60, seuilDeltaSb: -1.95 },
    { tailleArcmin: 120, seuilDeltaSb: -2.0 },
  ].map(Object.freeze) as LigneContraste[],
)

export const SOURCE_TABLE_CONTRASTE =
  'Blackwell (1946), tel que popularisé par Clark, Visual Astronomy of the Deep Sky (1990). ' +
  'Valeurs de travail — [À VÉRIFIER] contre les tables publiées. Interpolation autorisée ' +
  'entre deux lignes ; au-delà de la dernière, le seuil plafonne par sommation spatiale ' +
  'complète, il n’est pas extrapolé.'

/** Below this apparent size: point, integrated magnitude alone decides. */
const TAILLE_PONCTUELLE_ARCMIN = TABLE_CONTRASTE[0]!.tailleArcmin

const PLATEAU = TABLE_CONTRASTE[TABLE_CONTRASTE.length - 1]!

/**
 * Contrast threshold for an apparent size. `null` for a point object: no usable surface
 * brightness, verdict on integrated magnitude alone.
 */
export function seuilContraste(tailleApparenteArcmin: number): number | null {
  if (!Number.isFinite(tailleApparenteArcmin)) return null
  if (tailleApparenteArcmin < TAILLE_PONCTUELLE_ARCMIN) return null
  if (tailleApparenteArcmin >= PLATEAU.tailleArcmin) return PLATEAU.seuilDeltaSb

  for (let i = 0; i < TABLE_CONTRASTE.length - 1; i++) {
    const basse = TABLE_CONTRASTE[i]!
    const haute = TABLE_CONTRASTE[i + 1]!
    if (tailleApparenteArcmin <= haute.tailleArcmin) {
      const fraction =
        (tailleApparenteArcmin - basse.tailleArcmin) / (haute.tailleArcmin - basse.tailleArcmin)
      return basse.seuilDeltaSb + fraction * (haute.seuilDeltaSb - basse.seuilDeltaSb)
    }
  }
  return PLATEAU.seuilDeltaSb
}
