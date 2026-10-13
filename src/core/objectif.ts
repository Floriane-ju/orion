/**
 * §5.1 — Parc d'objectifs ; §6.1 — l'objectif du parc qui cadrerait une cible écartée.
 *
 * Un objectif ne se décrit pas par UNE focale et UNE ouverture mais par ce qu'il permet : une
 * plage de focales, et l'ouverture la plus grande à chacun de ses bouts. Une focale fixe est
 * le cas `focaleMinMm === focaleMaxMm`, pas un type à part.
 *
 * Entre les deux bouts d'un zoom à ouverture variable, le plancher s'interpole LINÉAIREMENT
 * en focale. Aucun fabricant ne publie la courbe ; la linéaire colle aux zooms courants
 * (18-55 f/3,5-5,6 à 35 mm : f/4,46, pour f/4,5 affiché par le boîtier), la logarithmique
 * s'en écarte (f/4,75). Le plancher s'arrondit ensuite au pas du domaine VERS LE PLUS FERMÉ :
 * annoncer f/4,4 là où l'objectif ne descend qu'à f/4,5 promettrait un signal qu'il ne donne pas.
 *
 * Les moteurs n'en savent rien : ils reçoivent toujours une focale et une ouverture. Ce
 * module ne fait que borner le réglage du moment.
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
  /** Ouverture la plus grande (plus petit N) à `focaleMinMm`. */
  readonly ouvertureGrandAngleN: number
  /** Ouverture la plus grande à `focaleMaxMm` ; égale à la précédente sur un zoom constant. */
  readonly ouvertureTeleN: number
  readonly typeObjectif: TypeObjectif
}

export interface Plage {
  readonly min: number
  readonly max: number
}

/** L'ouverture la plus grande que l'objectif permet à cette focale, sans arrondi. */
export function ouverturePlancher(objectif: Objectif, focaleMm: number): number {
  const { focaleMinMm: fMin, focaleMaxMm: fMax } = objectif
  const nGa = objectif.ouvertureGrandAngleN
  if (fMax === fMin || !Number.isFinite(focaleMm)) return nGa
  const t = (Math.min(Math.max(focaleMm, fMin), fMax) - fMin) / (fMax - fMin)
  return nGa + (objectif.ouvertureTeleN - nGa) * t
}

/**
 * Le plancher au cran du domaine, arrondi vers le plus fermé. Un quotient à un ulp près d'un
 * cran entier EST ce cran : 1,1 × 10 vaut 11,000000000000002 en flottant, et un plafond nu
 * ferait monter d'un cran une ouverture déjà au pas. Diviser par un entier, plutôt que
 * multiplier par le pas, rend 4,5 et non 4,500000000000001.
 */
export function plancherAuPas(n: number): number {
  const cransParUnite = Math.round(1 / DOMAINES.ouverture_N.pas)
  const q = n * cransParUnite
  const proche = Math.round(q)
  const crans = Math.abs(q - proche) <= Math.abs(q) * Number.EPSILON * cransParUnite ? proche : Math.ceil(q)
  return crans / cransParUnite
}

/** Ce que l'objectif laisse régler : sa plage de focales, et l'ouverture au-delà du plancher. */
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

/**
 * Un objectif saisi ou importé : chaque nombre dans son domaine, et les bouts dans l'ordre.
 * Le refus nomme le champ — une plage inversée se corrige en lisant le message, pas en devinant.
 */
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
 * §6.1 — l'objectif du parc dont la plage croise la focale requise, réglé au plus près d'elle.
 *
 * Rectilinéaire seulement, comme `focaleRequise` : la règle de cadrage ne décrit pas un
 * fisheye. Entre deux candidats, celui qu'on règle le plus près de la focale requise — le
 * plus éloigné risquerait de faire passer la cible de l'autre côté de la fenêtre de cadrage.
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

/** Un zoom, au sens où la focale optimale d'une cible a un sens : une plage à parcourir. */
export function estZoom(objectif: Objectif | null): objectif is Objectif {
  return objectif !== null && objectif.focaleMaxMm > objectif.focaleMinMm
}

/**
 * T-0407 — la focale de la plage où le grand axe remplit `REMPLISSAGE_ZOOM_OPTIMAL` du petit
 * côté, ou le bout le plus proche. Non orienté, comme `bornesTailleCadre` : la liste ne
 * connaît pas le roulis du boîtier, et deux conventions y donneraient deux focales.
 */
export function focaleOptimale(
  objectif: Objectif,
  tailleMajArcmin: number,
  capteurHMm: number,
): number {
  const champDeg = tailleMajArcmin / ARCMIN_PAR_DEG / K('REMPLISSAGE_ZOOM_OPTIMAL')
  const f = focalePourChamp(capteurHMm, champDeg)
  // ponytail: au mm — une bague de zoom ne se règle pas plus finement, et des focales
  // groupées au mm partagent leur contexte d'évaluation.
  return Math.round(Math.min(Math.max(f, objectif.focaleMinMm), objectif.focaleMaxMm))
}

/**
 * T-0407 — l'ouverture qu'on aurait à une autre focale de la plage, même règle que la saisie
 * (`surFocale`) : au plancher, elle suit le plancher ; fermée, elle est gardée tant que
 * l'objectif le permet.
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
