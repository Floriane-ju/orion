/**
 * §2.2 — Bortle table and sky-background brightness.
 * Linear model replaced by a table: extrapolated to Bortle 1 it gave 23,4 mag/arcsec², physically
 * impossible (airglow, zodiacal light, integrated starlight floor ≈ 21,7–22,0 mag/arcsec²).
 * LINEAR INTERPOLATION ALLOWED between two rows. EXTRAPOLATION FORBIDDEN beyond 1 and 9.
 * Measured SQM, when entered, ALWAYS overrides estimated Bortle.
 */

export interface LigneBortle {
  readonly bortle: number
  /** Sky-background brightness, mag/arcsec². */
  readonly sb: number
  /** Naked-eye limiting magnitude. */
  readonly mLimOeil: number
}

/**
 * Rows 4, 8: base anchors. Limiting-magnitude column: Bortle scale as published (Sky &
 * Telescope, 2001) — [À VÉRIFIER] against source.
 */
export const TABLE_BORTLE: readonly LigneBortle[] = Object.freeze([
  { bortle: 1, sb: 21.9, mLimOeil: 7.8 },
  { bortle: 2, sb: 21.7, mLimOeil: 7.3 },
  { bortle: 3, sb: 21.5, mLimOeil: 6.8 },
  { bortle: 4, sb: 21.3, mLimOeil: 6.3 },
  { bortle: 5, sb: 20.6, mLimOeil: 5.8 },
  { bortle: 6, sb: 19.9, mLimOeil: 5.5 },
  { bortle: 7, sb: 19.2, mLimOeil: 5.0 },
  { bortle: 8, sb: 18.5, mLimOeil: 4.5 },
  { bortle: 9, sb: 18.0, mLimOeil: 4.0 },
].map(Object.freeze) as LigneBortle[])

export const SOURCE_TABLE_BORTLE =
  'Échelle de Bortle (Sky & Telescope, 2001) ; lignes 4 et 8 ancrées sur le socle. ' +
  'Interpolation autorisée entre deux lignes, extrapolation interdite hors [1 ; 9].'

const BORTLE_MIN = TABLE_BORTLE[0]!.bortle
const BORTLE_MAX = TABLE_BORTLE[TABLE_BORTLE.length - 1]!.bortle

/** Darkest natural sky background reachable: table upper bound. */
export const SB_PLANCHER_NATUREL = TABLE_BORTLE[0]!.sb

function encadre(bortle: number): readonly [LigneBortle, LigneBortle, number] {
  const bas = Math.floor(bortle)
  const indexBas = Math.min(bas - BORTLE_MIN, TABLE_BORTLE.length - 2)
  const ligneBasse = TABLE_BORTLE[indexBas]!
  const ligneHaute = TABLE_BORTLE[indexBas + 1]!
  return [ligneBasse, ligneHaute, bortle - ligneBasse.bortle]
}

export class BortleHorsTableError extends Error {
  readonly bortle: number

  constructor(bortle: number) {
    super(
      `Bortle ${bortle} hors de la table [${BORTLE_MIN} ; ${BORTLE_MAX}] : ` +
        'aucune extrapolation n’est produite hors de ces bornes.',
    )
    this.name = 'BortleHorsTableError'
    this.bortle = bortle
  }
}

/** Interpolates table for fractional Bortle; refuses values outside [1 ; 9]. */
export function interpoleBortle(bortle: number): LigneBortle {
  if (!Number.isFinite(bortle) || bortle < BORTLE_MIN || bortle > BORTLE_MAX) {
    throw new BortleHorsTableError(bortle)
  }
  const [basse, haute, fraction] = encadre(bortle)
  return {
    bortle,
    sb: basse.sb + fraction * (haute.sb - basse.sb),
    mLimOeil: basse.mLimOeil + fraction * (haute.mLimOeil - basse.mLimOeil),
  }
}

/**
 * Inverts SB column: measured brightness → naked-eye limiting magnitude.
 * `null` outside table domain, no extrapolation.
 */
export function mLimOeilDepuisSb(sb: number): number | null {
  const sbMax = TABLE_BORTLE[0]!.sb
  const sbMin = TABLE_BORTLE[TABLE_BORTLE.length - 1]!.sb
  if (!Number.isFinite(sb) || sb > sbMax || sb < sbMin) return null

  for (let i = 0; i < TABLE_BORTLE.length - 1; i++) {
    const haute = TABLE_BORTLE[i]! // SB decreases with Bortle
    const basse = TABLE_BORTLE[i + 1]!
    if (sb <= haute.sb && sb >= basse.sb) {
      const etendue = haute.sb - basse.sb
      if (etendue === 0) return haute.mLimOeil
      const fraction = (haute.sb - sb) / etendue
      return haute.mLimOeil + fraction * (basse.mLimOeil - haute.mLimOeil)
    }
  }
  return null
}

/** Naked-eye limiting magnitude at both table edges. */
export const M_LIM_OEIL_PLAFOND = TABLE_BORTLE[0]!.mLimOeil
export const M_LIM_OEIL_PLANCHER = TABLE_BORTLE[TABLE_BORTLE.length - 1]!.mLimOeil
/** Brightest sky background of table: domain lower bound. */
export const SB_PLAFOND_TABLE = TABLE_BORTLE[TABLE_BORTLE.length - 1]!.sb

export type BorneTableBortle = 'AUCUNE' | 'CIEL_PLUS_SOMBRE' | 'CIEL_PLUS_CLAIR'

export interface MLimOeilBorne {
  readonly value: number
  readonly borne: BorneTableBortle
}

/**
 * T-0100 — naked-eye limiting magnitude, CLAMPED to table edge outside domain.
 * `mLimOeilDepuisSb` returns `null` outside table: right for publishing a value (no
 * extrapolation), but a caller that must CAP something can't use `null` → no cap, and a
 * full-Moon sky shows more stars than a suburb. So clamp to table edge, declared, like
 * `contrast.ts` caps Blackwell threshold at last tier.
 */
export function mLimOeilBorne(sb: number): MLimOeilBorne {
  if (!Number.isFinite(sb)) return { value: M_LIM_OEIL_PLANCHER, borne: 'CIEL_PLUS_CLAIR' }
  if (sb > SB_PLANCHER_NATUREL) return { value: M_LIM_OEIL_PLAFOND, borne: 'CIEL_PLUS_SOMBRE' }
  if (sb < SB_PLAFOND_TABLE) return { value: M_LIM_OEIL_PLANCHER, borne: 'CIEL_PLUS_CLAIR' }
  return { value: mLimOeilDepuisSb(sb) ?? M_LIM_OEIL_PLANCHER, borne: 'AUCUNE' }
}
