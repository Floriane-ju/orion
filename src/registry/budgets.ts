/**
 * §3.2 et §1.5.1 — Budgets de réactivité de l'interface.
 *
 * §3.2 chiffre l'animation (50 Hz) et §1.5.1 la séance (un plan en moins de deux minutes).
 * Aucun des deux ne dit ce qu'une FRAPPE a le droit de coûter, et c'est pourtant là que les
 * deux se paient : une saisie qui recalcule toute la nuit dans le rendu de la touche les rend
 * inatteignables sans qu'aucun critère du PRD soit formellement violé.
 *
 * Ces valeurs ne sont pas des grandeurs physiques — aucune formule n'en dépend, aucun verdict
 * ne les cite. Elles vivent donc à côté de §2.1 plutôt que dedans, comme `imagerie.ts`. Ce
 * qu'elles gardent est la règle du projet : un seuil écrit dans le banc qui le mesure n'est
 * plus un seuil, c'est une constatation.
 */

export interface ValeurBudget {
  readonly valeur: number
  readonly unite: string
  readonly source: string
  readonly tolerance: string
}

function valeur(v: ValeurBudget): ValeurBudget {
  return Object.freeze(v)
}

export const BUDGETS = Object.freeze({
  /**
   * Ce qu'un caractère tapé a le droit de coûter, bridage compris.
   *
   * Le repère n'est pas le confort, c'est la cadence de frappe soutenue : au-delà de ce délai
   * la touche suivante arrive avant que la précédente soit peinte, et la saisie décroche. Ce
   * n'est pas une gêne subjective — c'est le symptôme que T-0291 a mesuré, 486 à 692 ms par
   * caractère en configuration télescope.
   */
  FRAPPE_MS: valeur({
    valeur: 50,
    unite: 'ms',
    source: 'convention d’interaction — sous l’intervalle d’une frappe soutenue (~7 car./s)',
    tolerance: 'sans objet — budget d’interface, pas une grandeur mesurée',
  }),

  /**
   * Le bridage sous lequel le budget vaut.
   *
   * Les mesures de T-0255 sont prises à ×4 parce que c'est la classe de machine que §11.2
   * vise — une tablette sur le terrain, pas la station de développement. Un banc qui tourne
   * sans bridage divise donc son budget par ce facteur avant de conclure.
   */
  BRIDAGE_CPU: valeur({
    valeur: 4,
    unite: '—',
    source: 'classe de machine visée §11.2 — tablette, mesurée au bridage ×4 du navigateur',
    tolerance: 'sans objet — conversion entre machine de mesure et machine visée',
  }),

  /**
   * Le seuil au-delà duquel une tâche du fil principal est une tâche longue.
   *
   * Ce n'est pas une convention du projet : c'est la définition de l'API Long Tasks, celle
   * que l'outil de mesure applique. Un travail qui tient le fil au-delà retarde la première
   * image, la frappe et le geste, tous ensemble.
   */
  TACHE_LONGUE_MS: valeur({
    valeur: 50,
    unite: 'ms',
    source: 'W3C Long Tasks API — seuil de signalement du navigateur',
    tolerance: 'sans objet — seuil de l’outil de mesure, pas une grandeur mesurée',
  }),

  /**
   * Ce qu'une tranche de décodage ou d'indexation a le droit de tenir le fil principal.
   *
   * Le budget se mesure en temps d'horloge sur la machine qui calcule : un bridage CPU ralentit
   * le travail accompli dans la tranche, il n'allonge pas la tranche. C'est ce qui rend le
   * découpage juste sur une tablette comme sur une station, sans facteur à régler.
   *
   * La valeur tient sous l'image de 20 ms que §3.2 demande à 50 Hz : le ciel continue de
   * tourner pendant que les catalogues se décodent.
   */
  TRANCHE_MS: valeur({
    valeur: 8,
    unite: 'ms',
    source: '§3.2 — sous l’image de 20 ms à 50 Hz, marge laissée au rendu',
    tolerance: 'sans objet — budget d’interface, pas une grandeur mesurée',
  }),

  /**
   * Le nombre d'éléments balayés entre deux points de coupe.
   *
   * C'est la granularité du découpage, donc le dépassement maximal d'une tranche : le budget
   * n'est vérifié qu'à un point de coupe. Trop fin, le test coûte plus que le travail ; trop
   * gros, la tranche déborde sur une machine lente. Quatre mille éléments, c'est un quart de
   * milliseconde sur une station et quelques millisecondes sur un téléphone bridé.
   */
  PAS_TRANCHE: valeur({
    valeur: 4096,
    unite: 'éléments',
    source: 'granularité de découpage — compromis entre coût du test et dépassement',
    tolerance: 'sans objet — granularité, pas une grandeur mesurée',
  }),
} satisfies Record<string, ValeurBudget>)

export type IdBudget = keyof typeof BUDGETS

/** Lecture d'une valeur, sur le modèle de `K()` du registre §2.1. */
export function B(id: IdBudget): number {
  return BUDGETS[id].valeur
}
