/**
 * T-0099 — twilight sky brightness at zenith, V band.
 * SINGLE SOURCE, read and verified: Patat, Ugolnikov & Postylyakov (2006), A&A 455, 385,
 * « UBVRI twilight sky brightness at ESO-Paranal », Table 1. 2000+ archive FORS1 images, 2nd-
 * degree polynomial fit:
 *
 *     μ(ζ) = a0 + a1 (ζ − 95) + a2 (ζ − 95)²        95° ≤ ζ ≤ 105°
 *
 * ζ = SOLAR ZENITH DISTANCE, deg = 90° + solar depression (authors neglect horizon dip).
 * Fitted domain = depression 5° to 15°: neither civil twilight nor nuit astronomique.
 * EXTRAPOLATION FORBIDDEN, not just on principle: polynomial peaks at ζ = 108,3° then FALLS,
 * reviving a twilight sky mid-night. Below 5° not extended either: table-edge value kept and
 * declared, like `contrast.ts` caps at last Blackwell tier.
 * MOUNTAIN SITE — open question, source answers. Paranal 2600 m; authors compare CrAO (600 m),
 * conclude (§5) « the bright twilight and night sky brightnesses are very close at the two
 * sites »; Paranal only ~30% darker in V in DEEP twilight. Table usable for lowland sites where
 * it matters (bright twilight, erases stars); the 30% gap (0,3 mag, 1.5× fit σ) sits where the
 * contribution is already residual. Declared limit, no altitude correction: no per-altitude
 * table to cite.
 */

export interface AjustementCrepuscule {
  /** μ at low edge of domain, mag/arcsec². */
  readonly a0: number
  /** mag/arcsec² per degree. */
  readonly a1: number
  /** mag/arcsec² per degree squared. */
  readonly a2: number
  /** RMS of measurements about the fit, mag/arcsec². */
  readonly sigma: number
  /** Polynomial's reference solar zenith distance, deg. */
  readonly zetaReferenceDeg: number
  readonly zetaMinDeg: number
  readonly zetaMaxDeg: number
}

/** V band, the only one of five used: that of `TABLE_BORTLE` and `moon.ts`. */
export const CREPUSCULE_V: AjustementCrepuscule = Object.freeze({
  a0: 11.84,
  a1: 1.518,
  a2: -0.057,
  sigma: 0.18,
  zetaReferenceDeg: 95,
  zetaMinDeg: 95,
  zetaMaxDeg: 105,
})

export const SOURCE_CREPUSCULE =
  'Patat, Ugolnikov & Postylyakov (2006), A&A 455, 385, Table 1 — brillance de surface du ' +
  'ciel au zénith en bande V, ajustée sur 95° ≤ ζ_Soleil ≤ 105°. Interpolation autorisée ' +
  'dans le domaine, extrapolation interdite hors de lui.'

/**
 * Night sky background of the site where table was measured, V band: what must be SUBTRACTED
 * from the fit to get twilight alone. Fit measures a total (scattered twilight glow PLUS Paranal
 * night glow); composing with another site's background without removing Paranal's would count
 * night glow twice.
 * Source: Patat (2003), A&A 400, 1183, Table 4 (ESO-published Paranal values: U 22,28 · B 22,64
 * · V 21,61 · R 20,87 · I 19,71 mag/arcsec², σ_V = 0,20). Cross-checked on the 2006 paper's
 * Paranal night-sky colours (U−B = −0,36 · B−V = 1,03 · V−R = 0,74 · V−I = 1,90): five
 * magnitudes reproduce them exactly.
 */
export const SB_NUIT_SITE_REFERENCE_MAG = 21.61

const DEPRESSION_HORIZON_DEG = 90

/** Solar depression at fitted domain's low edge: nothing extrapolated below. */
export const DEPRESSION_MIN_TABLE_DEG = CREPUSCULE_V.zetaMinDeg - DEPRESSION_HORIZON_DEG

/**
 * Solar depression where the fit meets its own site's night background: beyond it twilight
 * contribution is zero, polynomial no longer evaluated.
 * DERIVED, not chosen: smaller root of μ(ζ) = SB_NUIT_SITE_REFERENCE_MAG, lands at 15,9° (ζ =
 * 105,9°), inside the paper's interval (« the night sky brightness level is reached at around
 * ζ = 105°-106° »): the source's own junction, not a convention on the table edge.
 */
export const DEPRESSION_FIN_CREPUSCULE_DEG = (() => {
  const { a0, a1, a2 } = CREPUSCULE_V
  const c = a0 - SB_NUIT_SITE_REFERENCE_MAG
  const discriminant = a1 * a1 - 4 * a2 * c
  const racine = (-a1 + Math.sqrt(discriminant)) / (2 * a2)
  return DEPRESSION_MIN_TABLE_DEG + racine
})()

export type BorneCrepuscule = 'AUCUNE' | 'CIEL_PLUS_CLAIR'

export interface SbCrepuscule {
  /** Total twilight-sky brightness at zenith, mag/arcsec². */
  readonly value: number
  /** `CIEL_PLUS_CLAIR`: depression below domain, value is the edge's. */
  readonly borne: BorneCrepuscule
}

/**
 * TOTAL Paranal sky brightness at zenith for this solar depression, measurement-site night glow
 * included. Twilight alone = subtract `SB_NUIT_SITE_REFERENCE_MAG` (`brillanceCrepusculeNl`).
 * Beyond `DEPRESSION_FIN_CREPUSCULE_DEG`: meaningless, refuses instead of extending a falling
 * polynomial.
 */
export function sbCrepusculeZenith(depressionSolaireDeg: number): SbCrepuscule | null {
  if (!Number.isFinite(depressionSolaireDeg)) return null
  if (depressionSolaireDeg >= DEPRESSION_FIN_CREPUSCULE_DEG) return null
  const sousLaTable = depressionSolaireDeg < DEPRESSION_MIN_TABLE_DEG
  const depression = sousLaTable ? DEPRESSION_MIN_TABLE_DEG : depressionSolaireDeg
  const { a0, a1, a2 } = CREPUSCULE_V
  const d = depression - DEPRESSION_MIN_TABLE_DEG
  return {
    value: a0 + a1 * d + a2 * d * d,
    borne: sousLaTable ? 'CIEL_PLUS_CLAIR' : 'AUCUNE',
  }
}
