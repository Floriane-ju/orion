/**
 * §3.2, T-0394 — le trajet dans le temps : « aller à » un instant en le traversant.
 *
 * Revue DA §4.2, « La tombée de la nuit ». Le saut montre la nuit sans dire à quelle heure
 * chaque magnitude devient visible ; le trajet est le défilement de §3.2 déclenché par un
 * geste, et c'est pour cela qu'il reste soumis au même plafond de lisibilité.
 *
 * La courbe n'est pas `--courbe` : le smoothstep est symétrique, et l'arrivée — là où les
 * dernières magnitudes apparaissent — demandait à se poser plus lentement que le départ. C'est
 * sa vitesse de POINTE qui doit tenir sous `facteur_max` : une moyenne sous le plafond
 * laisserait le milieu du trajet se replier.
 */

import { K } from '../registry/constants.ts'
import { facteurMax } from './curseur-temps.ts'
import { MS_PAR_JOUR } from './horloges.ts'

/**
 * La courbe du trajet : A·(t/p)^m jusqu'à la bascule p, puis 1 − (1 − A)·((1 − t)/(1 − p))^n.
 * A égale les deux pentes en p, donc la vitesse ne saute pas ; c'est là qu'elle culmine.
 */
function formeCourbe(): { readonly p: number; readonly m: number; readonly n: number; readonly a: number } {
  const p = K('COURBE_TRAJET_BASCULE')
  const m = K('COURBE_TRAJET_ENTREE')
  const n = K('COURBE_TRAJET_SORTIE')
  const a = n / (1 - p) / (m / p + n / (1 - p))
  return { p, m, n, a }
}

/** Fraction du trajet parcourue à la fraction de durée `t` ∈ [0, 1]. */
export function courbeTrajet(t: number): number {
  const { p, m, n, a } = formeCourbe()
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t < p ? a * (t / p) ** m : 1 - (1 - a) * ((1 - t) / (1 - p)) ** n
}

/** Vitesse de pointe rapportée à la vitesse moyenne : la pente de la courbe en p. */
export function penteMaxTrajet(): number {
  const { p, m, a } = formeCourbe()
  return (a * m) / p
}

export type PlanTrajet =
  | { readonly saut: false; readonly dureeMs: number }
  | { readonly saut: true; readonly raison: 'MOUVEMENT_REDUIT' | 'ILLISIBLE' | 'SUR_PLACE' }

/**
 * La durée du trajet de `departMs` à `arriveeMs`, ou le saut qui le remplace.
 *
 * Nominale quand la pointe tient sous le plafond ; allongée juste assez sinon ; un saut quand
 * l'allongement dépasserait `DUREE_TRAJET_MAX_MS` — il est alors annoncé, comme tout écrêtage
 * de §3.2. Sous `prefers-reduced-motion`, toujours un saut (§11.1).
 */
export function planTrajet(entree: {
  readonly departMs: number
  readonly arriveeMs: number
  readonly pxParDegre: number
  readonly mouvementReduit: boolean
  /**
   * Ignorer le plafond : la durée suit le nombre de jours traversés (`dureeForcee`), pas la
   * lisibilité. Choix produit pour le
   * panneau de temps — changer de jour se VOIT, même quand le ciel y défile plus vite qu'il ne
   * se lit (§3.2). La frise et « Aller à la nuit », eux, restent plafonnés.
   */
  readonly force?: boolean
}): PlanTrajet {
  const ecartMs = Math.abs(entree.arriveeMs - entree.departMs)
  if (ecartMs === 0) return { saut: true, raison: 'SUR_PLACE' }
  if (entree.mouvementReduit) return { saut: true, raison: 'MOUVEMENT_REDUIT' }
  if (entree.force === true) return { saut: false, dureeMs: dureeForcee(ecartMs) }
  const plafond = facteurMax(entree.pxParDegre).value
  const dureeMs = Math.max(K('DUREE_TRAJET_MS'), (penteMaxTrajet() * ecartMs) / plafond)
  return dureeMs > K('DUREE_TRAJET_MAX_MS')
    ? { saut: true, raison: 'ILLISIBLE' }
    : { saut: false, dureeMs }
}


/**
 * La durée d'un trajet forcé : la nominale, allongée de `DUREE_TRAJET_PAR_DOUBLEMENT_MS` à
 * chaque doublement des jours traversés, jamais au-delà de `DUREE_TRAJET_FORCE_MAX_MS`. Une
 * heure ou deux restent à la nominale ; une semaine se voit plus longue qu'un jour.
 */
export function dureeForcee(ecartMs: number): number {
  const jours = Math.abs(ecartMs) / MS_PAR_JOUR
  const duree = K('DUREE_TRAJET_MS') + K('DUREE_TRAJET_PAR_DOUBLEMENT_MS') * Math.log2(1 + jours)
  return Math.min(duree, K('DUREE_TRAJET_FORCE_MAX_MS'))
}

/**
 * La part d'un écart qu'un trajet forcé MONTRE : tout l'écart jusqu'à `JOURS_TRAJET_FORCE_MAX`
 * jours, au-delà ces derniers jours plus la fraction de journée — le reste, des jours solaires
 * entiers, se saute au départ. Le Soleil revient alors à sa place : le saut ne se voit qu'aux
 * étoiles, à la Lune et aux planètes, pas au fond de ciel. La durée, elle, suit l'écart réel
 * (`dureeForcee`) : un an dure plus qu'une semaine, même en n'en montrant que trois jours.
 */
export function ecartMontre(ecartMs: number): number {
  const max = K('JOURS_TRAJET_FORCE_MAX') * MS_PAR_JOUR
  const absolu = Math.abs(ecartMs)
  if (absolu <= max) return ecartMs
  return Math.sign(ecartMs) * (max + (absolu % MS_PAR_JOUR))
}
