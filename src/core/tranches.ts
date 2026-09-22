/**
 * T-0296 — un long balayage, rendu par tranches.
 *
 * Décoder quatre-vingt mille étoiles ou en indexer la sphère tient le fil principal deux
 * cents millisecondes sur une tablette : pendant ce temps le ciel ne tourne plus, la frappe
 * ne s'affiche plus, et le geste en cours saute. Le travail ne peut pas être supprimé — il
 * faut bien lire le catalogue — mais il peut être rendu, morceau par morceau.
 *
 * LE MOTEUR NE CONNAÎT AUCUN BUDGET. Il dit seulement OÙ il peut s'interrompre, par un
 * `yield` à ses points de coupe naturels. C'est le pilote qui décide quoi en faire :
 * `dUnBloc` les ignore — c'est le chemin des bancs, des tests et de `node`, où rendre la
 * main n'a aucun sens —, `parTranches` rend la main dès qu'une tranche a consommé son
 * budget. Un même moteur sert donc les deux, sans seconde écriture à tenir d'accord.
 *
 * LE BUDGET SE MESURE EN TEMPS D'HORLOGE, pas en nombre d'éléments : un bridage CPU ralentit
 * le travail accompli dans la tranche, il n'allonge pas la tranche. Le découpage est donc
 * juste sur une station comme sur un téléphone bridé, sans facteur à régler.
 */

import { B } from '../registry/budgets.ts'

/** Un calcul qui nomme ses points de coupe : `yield` là où il accepte d'être interrompu. */
export type Decoupable<T> = Generator<void, T, void>

/**
 * Vrai aux indices où un balayage peut rendre la main. Le test est ce que coûte le
 * découpage : il doit rester négligeable devant le travail d'un élément.
 */
export function pointDeCoupe(i: number): boolean {
  return i % B('PAS_TRANCHE') === 0
}

/** Déroule d'un bloc, sans jamais rendre la main : hors navigateur, il n'y a rien à rendre. */
export function dUnBloc<T>(pas: Decoupable<T>): T {
  let etape = pas.next()
  while (!etape.done) etape = pas.next()
  return etape.value
}

/**
 * `scheduler.yield()` reprend la suite en tête de file, avant les tâches arrivées entretemps :
 * c'est ce qui garde le décodage prioritaire sur ce qui n'est pas encore demandé. À défaut,
 * `setTimeout` — son palier de quatre millisecondes après imbrication est le prix d'un repli
 * qui marche partout.
 */
interface Ordonnanceur {
  readonly yield?: () => Promise<void>
}

function rendLaMain(): Promise<void> {
  const ordonnanceur = (globalThis as { scheduler?: Ordonnanceur }).scheduler
  return ordonnanceur?.yield?.() ?? new Promise<void>((reprend) => setTimeout(reprend, 0))
}

/** Ce qu'une exécution tranchée a réellement tenu : de quoi le mesurer au banc. */
export interface Tranchage {
  readonly tranches: number
  /** Le travail seul, sommé sur les tranches : le temps rendu au fil principal n'y est pas. */
  readonly travailMs: number
  /** La plus longue tranche, en millisecondes : c'est elle qui décide, pas la moyenne. */
  readonly plusLongueMs: number
  /**
   * Le plus grand dépassement du budget, en millisecondes. C'est la part qui suit la vitesse
   * de la machine : sous bridage, elle est la seule à s'allonger.
   */
  readonly depassementMs: number
}

/**
 * Déroule en rendant la main dès qu'une tranche a tenu le fil plus longtemps que son budget.
 *
 * `surTranchage` est appelé à la fin, avec ce que l'exécution a tenu : l'application ne s'en
 * sert pas, le banc de démarrage si — une mesure qu'on ne peut pas rejouer ne prouve rien.
 */
export async function parTranches<T>(
  pas: Decoupable<T>,
  surTranchage?: (mesure: Tranchage) => void,
): Promise<T> {
  const budget = B('TRANCHE_MS')
  let debut = performance.now()
  let tranches = 1
  let travailMs = 0
  let plusLongueMs = 0
  let depassementMs = 0

  for (;;) {
    const etape = pas.next()
    const tenue = performance.now() - debut
    if (etape.done || tenue >= budget) {
      travailMs += tenue
      if (tenue > plusLongueMs) plusLongueMs = tenue
      if (tenue - budget > depassementMs) depassementMs = tenue - budget
    }
    if (etape.done) {
      surTranchage?.({ tranches, travailMs, plusLongueMs, depassementMs })
      return etape.value
    }
    if (tenue < budget) continue
    await rendLaMain()
    tranches++
    debut = performance.now()
  }
}
