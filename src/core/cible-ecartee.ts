/**
 * §6.4, §8.3 — what a discarded cible needs to stop being one: the lever, not the finding.
 *
 * Engine discards naming ONE cause, the first met — its contract; plan wants no more. List card
 * answers "what would have to change?" with 2 priced levers: focale (T-0379), date (T-0380).
 * Neither rewrites the discarding rule: they invert it with same bounds and same créneau engine,
 * else the announced focale or proposed night could be refused in turn.
 */

import { K } from '../registry/constants.ts'
import { DOMAINES } from '../registry/domains.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { creneauCible, type CauseExclusion } from './creneaux.ts'
import { fenetreNocturne } from './nuit.ts'
import { fenetreUtile } from './moon.ts'
import { prepareEvaluation, type EtatCible } from './cibles-liste.ts'
import { bornesTailleCadre, creneauSousLaLune, entreeCreneau } from './session-candidates.ts'
import type { ContexteSession } from './session-types.ts'
import { MS_PAR_JOUR } from './horloges.ts'
import { focalePourChamp } from './optics.ts'
import { ARCMIN_PAR_DEG, DEMI_TOUR_DEG } from './unites.ts'

/**
 * T-0379 — focale putting the major axis back within `bornesTailleCadre`. Always rectilinéaire,
 * even for a fisheye objectif: a DSO cible too small for a fisheye isn't fixed by a longer
 * fisheye, it needs another objectif — whose focale must be readable.
 */
export type FocaleRequise =
  | { readonly sens: 'AU_MOINS' | 'AU_PLUS'; readonly focaleMm: number }
  /** Larger than the champ of the domain's shortest focale: mosaïque. */
  | { readonly sens: 'MOSAIQUE' }
  /** Smaller than what the domain's longest focale frames on this sensor. */
  | { readonly sens: 'TROP_PETITE' }

/** `null` when size is within bounds, or unknown: focale isn't the lever. */
export function focaleRequise(
  contexte: Pick<ContexteSession, 'fovHDeg' | 'capteurHMm'>,
  objet: ObjetCielProfond,
): FocaleRequise | null {
  const taille = objet.majAxArcmin
  if (taille === null) return null
  const { minArcmin, maxArcmin } = bornesTailleCadre(contexte.fovHDeg)
  const { min, max } = DOMAINES.focale_mm
  // Wanted champ from current bounds by proportion: `minArcmin` is a fixed share of champ →
  // champ placing `taille` on that bound = champ × taille / min.
  if (taille < minArcmin) {
    const focaleMm = focalePourChamp(contexte.capteurHMm, (contexte.fovHDeg * taille) / minArcmin)
    return focaleMm > max ? { sens: 'TROP_PETITE' } : { sens: 'AU_MOINS', focaleMm }
  }
  if (taille > maxArcmin) {
    const champDeg = taille / ARCMIN_PAR_DEG
    // A half-turn champ or more has no rectilinear focale.
    if (champDeg >= DEMI_TOUR_DEG) return { sens: 'MOSAIQUE' }
    const focaleMm = focalePourChamp(contexte.capteurHMm, champDeg)
    return focaleMm < min ? { sens: 'MOSAIQUE' } : { sens: 'AU_PLUS', focaleMm }
  }
  return null
}

/**
 * What refuses this night's créneau, independent of size. Engine stops at first cause (too
 * small cible never reaches créneau computation); card wants both: changing focale is useless
 * if cible is also daytime. `HORS_FENETRE` = only cause DATE lifts (relief/hauteur don't change
 * with season). `null` = night has a créneau, or no night to test.
 */
export interface ExclusionCreneau {
  readonly cause: CauseExclusion
  readonly message: string
}

export function exclusionCreneau(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
): ExclusionCreneau | null {
  const { debutReference: debut, finReference: fin } = contexte.nuit
  if (debut === null || fin === null) return null
  const creneau = creneauCible(entreeCreneau(contexte, objet, { debut, fin }))
  return creneau.causeExclusion === undefined
    ? null
    : { cause: creneau.causeExclusion, message: creneau.message }
}

/** Highest instant of the night créneau following `depart`, or `null` if none. */
function creneauDeLaNuit(contexte: ContexteSession, objet: ObjetCielProfond, depart: Date): Date | null {
  const nuit = fenetreNocturne(contexte.site, depart)
  const { debutReference: debut, finReference: fin } = nuit
  if (debut === null || fin === null) return null
  const creneau = creneauCible(entreeCreneau(contexte, objet, { debut, fin }))
  if (creneau.causeExclusion !== undefined || creneau.dureeTotaleMin.value <= 0) return null
  return creneau.plusHaut.instant ?? debut
}

/**
 * T-0380 — first night after context's where créneau engine finds a créneau. Steps of
 * `PROCHAIN_CRENEAU_PAS_J` days, refined to the day within last step: a visibility season lasts
 * months, 1-week step doesn't straddle it; ~15 nights searched, not 365. Same engine/criteria
 * as the créneau gap — Lune excluded (own search: `prochaineNuitSansLune`). `null` beyond
 * `PROCHAIN_CRENEAU_HORIZON_J` (nuit polaire, cible the latitude shows only by day).
 */
export function prochainCreneau(contexte: ContexteSession, objet: ObjetCielProfond): Date | null {
  const origine = contexte.nuit.leverSoleil ?? contexte.nuit.finReference
  if (origine === null) return null
  const pas = K('PROCHAIN_CRENEAU_PAS_J')
  const horizon = K('PROCHAIN_CRENEAU_HORIZON_J')
  const departJour = (j: number) => new Date(origine.getTime() + j * MS_PAR_JOUR)

  for (let j = pas; j <= horizon + pas; j += pas) {
    const jour = Math.min(j, horizon)
    if (creneauDeLaNuit(contexte, objet, departJour(jour)) === null) continue
    // First open night is in the step that just opened: search it by the day.
    for (let k = Math.max(jour - pas + 1, 1); k <= jour; k++) {
      const instant = creneauDeLaNuit(contexte, objet, departJour(k))
      if (instant !== null) return instant
    }
  }
  return null
}

/**
 * T-0382 — first night after context's where a cible discarded for Lune no longer is. Same gate
 * as the gap (`creneauSousLaLune`, fenêtre utile of THAT night): proposed night can't be refused
 * for the Lune in turn. Day by day: Lune moves 12°/night, a week would straddle the whole dark
 * window. `null` beyond one lunar cycle.
 */
export function prochaineNuitSansLune(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
): Date | null {
  const origine = contexte.nuit.leverSoleil ?? contexte.nuit.finReference
  if (origine === null) return null
  for (let j = 1; j <= K('PROCHAINE_NUIT_SANS_LUNE_HORIZON_J'); j++) {
    const nuit = fenetreNocturne(contexte.site, new Date(origine.getTime() + j * MS_PAR_JOUR))
    const ceSoir: ContexteSession = {
      ...contexte,
      nuit,
      fenetreUtile: fenetreUtile(contexte.site, nuit),
    }
    const entree = prepareEvaluation(ceSoir)
    if (entree === null) continue
    const { creneau, exclusionLune } = creneauSousLaLune(
      ceSoir,
      objet,
      entree.fenetre,
      entree.sbCielBase,
    )
    if (exclusionLune !== null) continue
    if (creneau.causeExclusion !== undefined || creneau.dureeTotaleMin.value <= 0) continue
    return creneau.plusHaut.instant ?? entree.fenetre.debut
  }
  return null
}

/**
 * §6.4 — list order with "photographiables" unchecked: shootable tonight first, then discarded
 * from quickest to slowest to fix. Lune passes in a few nights, season in a few months; position
 * never changes from here; focale needs another objectif, sensor another boîtier. Rest (out of
 * reach, no suivi, donnée manquante) after; unevaluated cible last: nothing known.
 */
const GROUPES = Object.freeze([
  'PHOTOGRAPHIABLE',
  'LUNE',
  'SAISON',
  'POSITION',
  'FOCALE',
  'CAPTEUR',
  'AUTRE',
  'NON_EVALUEE',
] as const)
type Groupe = (typeof GROUPES)[number]

function groupe(
  cadre: Pick<ContexteSession, 'fovHDeg' | 'capteurHMm'>,
  objet: ObjetCielProfond,
  etat: EtatCible | undefined,
): Groupe {
  if (etat === undefined) return 'NON_EVALUEE'
  if (etat.pose !== null) return 'PHOTOGRAPHIABLE'
  switch (etat.code) {
    case 'LUNE':
      return 'LUNE'
    case 'FENETRE':
      return 'SAISON'
    case 'HAUTEUR':
    case 'RELIEF':
      return 'POSITION'
    case 'CADRAGE': {
      // Cadrage refused with no focale lever (size outside domain, mosaïque, other verdict) isn't
      // fixed by changing objectif.
      const sens = focaleRequise(cadre, objet)?.sens
      return sens === 'AU_MOINS' || sens === 'AU_PLUS' ? 'FOCALE' : 'CAPTEUR'
    }
    default:
      return 'AUTRE'
  }
}

/** Stable sort: within a group, received order (magnitude or pertinence) holds. */
export function trieParPhotographiabilite<L extends { readonly objet: ObjetCielProfond }>(
  lignes: readonly L[],
  etats: ReadonlyMap<string, EtatCible>,
  cadre: Pick<ContexteSession, 'fovHDeg' | 'capteurHMm'>,
  /** T-0407 — under a zoom, focale lever is read at each cible's cadre focale. */
  cadreDe?: (objet: ObjetCielProfond) => Pick<ContexteSession, 'fovHDeg' | 'capteurHMm'>,
): readonly L[] {
  const rang = new Map(
    lignes.map((l) => [
      l,
      GROUPES.indexOf(groupe(cadreDe?.(l.objet) ?? cadre, l.objet, etats.get(l.objet.designation))),
    ]),
  )
  return lignes.toSorted((a, b) => rang.get(a)! - rang.get(b)!)
}
