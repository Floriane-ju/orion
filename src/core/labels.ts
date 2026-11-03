/**
 * §3.4 — label composition. Zoom hierarchy:
 *   fov > 180°  Lune and planets only (product convention, FOV_LABELS_CORPS_SEULS_DEG)
 *   fov > 40°   constellation names only
 *   10° to 40°  + Bayer designations of stars mag ≤ 3.5
 *   fov < 10°   + proper names and designations of ciel profond objects
 * Density capped at 25 simultaneous labels, magnitude priority, anti-overlap mandatory: dense
 * field without it is unreadable (reading constraint, not optimization).
 */

import { K } from '../registry/constants.ts'

export type CategorieLabel = 'CORPS' | 'CONSTELLATION' | 'ETOILE' | 'OBJET'

/** Text and its footprint: all anti-overlap needs. */
export interface BoiteLabel {
  readonly texte: string
  readonly xPx: number
  readonly yPx: number
  readonly largeurPx: number
  readonly hauteurPx: number
}

export interface CandidatLabel extends BoiteLabel {
  readonly categorie: CategorieLabel
  /** Lower = higher priority; fed by magnitude. */
  readonly priorite: number
  /** Own tint, when shared text colour would tie label to nothing. */
  readonly couleur?: string
}

/** Categories allowed at given field. */
export function categoriesActives(fovDeg: number): ReadonlySet<CategorieLabel> {
  if (fovDeg > K('FOV_LABELS_CORPS_SEULS_DEG')) return new Set(['CORPS'])
  const actives: CategorieLabel[] = ['CORPS', 'CONSTELLATION']
  if (fovDeg <= K('FOV_LABELS_CONSTELLATIONS_DEG')) actives.push('ETOILE')
  if (fovDeg < K('FOV_LABELS_OBJETS_DEG')) actives.push('OBJET')
  return new Set(actives)
}

function chevauche(a: BoiteLabel, b: BoiteLabel): boolean {
  return (
    Math.abs(a.xPx - b.xPx) * 2 < a.largeurPx + b.largeurPx &&
    Math.abs(a.yPx - b.yPx) * 2 < a.hauteurPx + b.hauteurPx
  )
}

/**
 * Keeps displayable labels: zoom categories, magnitude priority, no overlap, ≤ `LABELS_MAX`.
 * Dropped only for lack of room, never by input truncation.
 */
export function composeLabels(
  candidats: readonly CandidatLabel[],
  fovDeg: number,
): readonly CandidatLabel[] {
  const actives = categoriesActives(fovDeg)
  const eligibles = candidats
    .filter((c) => actives.has(c.categorie))
    .slice()
    .sort((a, b) => a.priorite - b.priorite)

  const retenus: CandidatLabel[] = []
  for (const candidat of eligibles) {
    if (retenus.length >= K('LABELS_MAX')) break
    if (retenus.some((r) => chevauche(r, candidat))) continue
    retenus.push(candidat)
  }
  return retenus
}

/** §3.4 — only stars of magnitude ≤ 3.5 carry their Bayer designation. */
export function etoileLabellisable(magV: number): boolean {
  return magV <= K('MAG_LABEL_BAYER_MAX')
}

/**
 * T-0085 — successive offsets tried to place hover label, in label heights. Beyond: neighbourhood
 * full → reveal nothing rather than hide a kept name.
 */
const DECALAGES_SURVOL: readonly number[] = Object.freeze([0, -1, 1, -2, 2])

/**
 * T-0085 — name hidden by §3.4 zoom threshold, revealed under cursor.
 * Transient, outside `LABELS_MAX`: evicts no kept label, fits between them or gives up. Zoom
 * hierarchy n/a: hover names what it dropped.
 * Already-named element not named twice. Since T-0109 scene and hover share one text function →
 * same field = SAME label, duplicate = equality. Test = prefix check (covers enriched "Véga" then
 * "Véga — α Lyr"), compares texts never positions (categories offset differently).
 */
export function labelSurvol(
  retenus: readonly CandidatLabel[],
  survol: BoiteLabel,
): BoiteLabel | null {
  if (retenus.some((r) => survol.texte.startsWith(r.texte))) return null
  for (const rangs of DECALAGES_SURVOL) {
    const place: BoiteLabel = { ...survol, yPx: survol.yPx + rangs * survol.hauteurPx }
    if (!retenus.some((r) => chevauche(r, place))) return Object.freeze(place)
  }
  return null
}
