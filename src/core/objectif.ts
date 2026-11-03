/**
 * §5.1 — objectif park; §6.1 — park lens that would frame a cible écartée.
 * Objectif = what it allows: focal range + widest aperture at each end. Fixed focal =
 * `focaleMinMm === focaleMaxMm`, not a separate type.
 * Variable-aperture zoom: floor interpolates LINEARLY in focal between ends. No maker publishes
 * the curve; linear fits common zooms (18-55 f/3.5-5.6 at 35 mm: f/4.46, body shows f/4.5),
 * logarithmic deviates (f/4.75). Floor rounds to domain step TOWARD THE NARROWER aperture:
 * announcing f/4.4 where lens stops at f/4.5 promises signal it can't give.
 * Engines ignore this: always receive a focal and aperture. Module only bounds the current setting.
 */

import { K } from '../registry/constants.ts'
import { DOMAINES, SaisieRefuseeError, valide } from '../registry/domains.ts'
import type { FocaleRequise } from './cible-ecartee.ts'
import { focalePourChamp, type TypeObjectif } from './optics.ts'
import { ARCMIN_PAR_DEG } from './unites.ts'

export interface Objectif {
  readonly id: string
  readonly nom: string
  readonly focaleMinMm: number
  readonly focaleMaxMm: number
  /** Widest aperture (smallest N) at `focaleMinMm`. */
  readonly ouvertureGrandAngleN: number
  /** Widest aperture at `focaleMaxMm`; equals previous on constant-aperture zoom. */
  readonly ouvertureTeleN: number
  readonly typeObjectif: TypeObjectif
}

export interface Plage {
  readonly min: number
  readonly max: number
}

/** Widest aperture lens allows at this focal, unrounded. */
export function ouverturePlancher(objectif: Objectif, focaleMm: number): number {
  const { focaleMinMm: fMin, focaleMaxMm: fMax } = objectif
  const nGa = objectif.ouvertureGrandAngleN
  if (fMax === fMin || !Number.isFinite(focaleMm)) return nGa
  const t = (Math.min(Math.max(focaleMm, fMin), fMax) - fMin) / (fMax - fMin)
  return nGa + (objectif.ouvertureTeleN - nGa) * t
}

/**
 * Floor at domain step, rounded toward narrower. Quotient within 1 ulp of a whole step IS that
 * step: 1.1 × 10 = 11.000000000000002 in float, bare ceil would bump an on-step aperture. Divide
 * by an integer, don't multiply by step: gives 4.5 not 4.500000000000001.
 */
export function plancherAuPas(n: number): number {
  const cransParUnite = Math.round(1 / DOMAINES.ouverture_N.pas)
  const q = n * cransParUnite
  const proche = Math.round(q)
  const crans = Math.abs(q - proche) <= Math.abs(q) * Number.EPSILON * cransParUnite ? proche : Math.ceil(q)
  return crans / cransParUnite
}

/** What lens lets you set: focal range, aperture beyond floor. */
export function plagesReglage(
  objectif: Objectif,
  focaleMm: number,
): { readonly focale: Plage; readonly ouverture: Plage } {
  return {
    focale: { min: objectif.focaleMinMm, max: objectif.focaleMaxMm },
    ouverture: {
      min: plancherAuPas(ouverturePlancher(objectif, focaleMm)),
      max: DOMAINES.ouverture_N.max,
    },
  }
}

/** Entered or imported lens: each number in domain, ends ordered. Refusal names the field. */
export function valideObjectif(objectif: Objectif): Objectif {
  if (objectif.nom.trim() === '') throw new Error('Saisie refusée : le nom de l’objectif est vide.')
  valide('focale_mm', objectif.focaleMinMm)
  valide('focale_mm', objectif.focaleMaxMm)
  valide('ouverture_N', objectif.ouvertureGrandAngleN)
  valide('ouverture_N', objectif.ouvertureTeleN)
  if (objectif.focaleMinMm > objectif.focaleMaxMm) {
    throw new SaisieRefuseeError(
      'focale_mm',
      'Saisie refusée : la focale la plus courte dépasse la plus longue.',
    )
  }
  if (objectif.ouvertureTeleN < objectif.ouvertureGrandAngleN) {
    throw new SaisieRefuseeError(
      'ouverture_N',
      'Saisie refusée : l’ouverture au télé est plus grande qu’au grand-angle — un zoom ' +
        'ne s’ouvre pas davantage en allongeant sa focale.',
    )
  }
  return objectif
}

/**
 * §6.1 — park lens whose range crosses the required focal, set closest to it.
 * Rectilinear only, like `focaleRequise`: cadrage rule doesn't describe a fisheye. Among
 * candidates, closest-set wins (farther could push cible across the cadrage window).
 */
export function objectifPour(
  parc: readonly Objectif[],
  requise: FocaleRequise,
): { readonly objectif: Objectif; readonly focaleMm: number } | null {
  if (requise.sens !== 'AU_MOINS' && requise.sens !== 'AU_PLUS') return null
  const f = requise.focaleMm
  const candidats = parc
    .filter((o) => o.typeObjectif === 'RECTILINEAIRE')
    .filter((o) => (requise.sens === 'AU_MOINS' ? o.focaleMaxMm >= f : o.focaleMinMm <= f))
    .map((objectif) => ({
      objectif,
      focaleMm: Math.min(Math.max(f, objectif.focaleMinMm), objectif.focaleMaxMm),
    }))
  if (candidats.length === 0) return null
  return candidats.reduce((meilleur, c) =>
    Math.abs(c.focaleMm - f) < Math.abs(meilleur.focaleMm - f) ? c : meilleur,
  )
}

/** A zoom: a range to traverse, so a target's optimal focal makes sense. */
export function estZoom(objectif: Objectif | null): objectif is Objectif {
  return objectif !== null && objectif.focaleMaxMm > objectif.focaleMinMm
}

/**
 * T-0407 — focal in range where major axis fills `REMPLISSAGE_ZOOM_OPTIMAL` of short side, else
 * nearest end. Unoriented like `bornesTailleCadre`: list ignores boîtier roll, two conventions =
 * two focals.
 */
export function focaleOptimale(
  objectif: Objectif,
  tailleMajArcmin: number,
  capteurHMm: number,
): number {
  const champDeg = tailleMajArcmin / ARCMIN_PAR_DEG / K('REMPLISSAGE_ZOOM_OPTIMAL')
  const f = focalePourChamp(capteurHMm, champDeg)
  // ponytail: whole mm — a zoom ring can't be set finer, and focals grouped by mm share their
  // evaluation context.
  return Math.round(Math.min(Math.max(f, objectif.focaleMinMm), objectif.focaleMaxMm))
}

/**
 * T-0407 — aperture at another focal of the range, same rule as input (`surFocale`): at floor,
 * follows floor; stopped down, kept while lens allows.
 */
export function ouvertureA(
  objectif: Objectif,
  ouvertureN: number,
  focaleCouranteMm: number,
  focaleMm: number,
): number {
  const plancherCourant = plancherAuPas(ouverturePlancher(objectif, focaleCouranteMm))
  const plancher = plancherAuPas(ouverturePlancher(objectif, focaleMm))
  return ouvertureN <= plancherCourant ? plancher : Math.max(ouvertureN, plancher)
}

/** T-0436 — what cadrage rule describes: a fisheye has no cadrage focal. */
function rectilineaires(parc: readonly Objectif[]): readonly Objectif[] {
  return parc.filter((o) => o.typeObjectif === 'RECTILINEAIRE')
}

/**
 * T-0436 — list picks the lens when there's a choice: mounted zoom (T-0407) or ≥ 2 rectilinear in
 * park. A lone fixed has nothing to choose.
 */
export function autoParc(parc: readonly Objectif[], monte: Objectif | null): boolean {
  return estZoom(monte) || rectilineaires(parc).length >= 2
}

/**
 * T-0436 — park lens framing the target best, set to its optimal focal.
 * 1) cadrage: gap to target focal as RATIO (|ln f/f*|), fill follows f (10 mm too many at 20 mm ≠
 * at 200). 2) tie: widest aperture at floor (extended object: signal/px ∝ 1/N²). 3) park order,
 * stable pick.
 */
export function objectifOptimal(
  parc: readonly Objectif[],
  tailleMajArcmin: number,
  capteurHMm: number,
): { readonly objectif: Objectif; readonly focaleMm: number } | null {
  const fVisee = focalePourChamp(capteurHMm, tailleMajArcmin / ARCMIN_PAR_DEG / K('REMPLISSAGE_ZOOM_OPTIMAL'))
  const candidats = rectilineaires(parc).map((objectif) => {
    const focaleMm = focaleOptimale(objectif, tailleMajArcmin, capteurHMm)
    // Gap on SET focal, mm: fixed 50 and zoom set to 50 frame alike; aperture breaks the tie.
    return {
      objectif,
      focaleMm,
      ecart: Math.abs(Math.log(focaleMm / fVisee)),
      n: plancherAuPas(ouverturePlancher(objectif, focaleMm)),
    }
  })
  const meilleur = candidats.reduce<(typeof candidats)[number] | null>(
    (m, c) => (m === null || c.ecart < m.ecart || (c.ecart === m.ecart && c.n < m.n) ? c : m),
    null,
  )
  return meilleur === null ? null : { objectif: meilleur.objectif, focaleMm: meilleur.focaleMm }
}
