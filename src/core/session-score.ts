/**
 * §8.3 — Le scoring C-15, exposé plutôt qu'appris.
 *
 * Cinq critères indépendants, chacun ramené sur [0, 1], puis une somme pondérée dont la
 * trace porte les cinq termes. Aucun n'est caché : la fiche du plan les affiche tels quels.
 */

import { K } from '../registry/constants.ts'
import { trace } from './traced.ts'
import type { Traced } from './traced.ts'
import type { DetailScore, PoidsScoring } from './session-types.ts'
import { encadre } from './unites.ts'

const borne = (valeur: number): number => encadre(valeur, 0, 1)

export function scoreCadrage(remplissage: number): number {
  const cible = K('REMPLISSAGE_CADRE_CIBLE')
  return borne(1 - Math.abs(remplissage - cible) / cible)
}

export function scoreHauteur(altCulminationDeg: number): number {
  return borne(
    (altCulminationDeg - K('SEUIL_HAUTEUR_IMAGERIE_DEG')) / K('ETENDUE_SCORE_HAUTEUR_DEG'),
  )
}

export function scoreSignal(dureeCreneauMin: number, tRequisMin: number): number {
  return tRequisMin <= 0 ? 0 : borne(dureeCreneauMin / tRequisMin)
}

export function scoreFenetre(dureeCreneauMin: number, dureeNuitMin: number): number {
  return dureeNuitMin <= 0 ? 0 : borne(dureeCreneauMin / dureeNuitMin)
}

export function scoreLune(deltaSb: number): number {
  return borne(1 - deltaSb / K('TOLERANCE_LUNE_DELTA_SB_MAG'))
}

export function scoreGlobal(detail: DetailScore, poids: PoidsScoring): Traced<number> {
  const valeur =
    poids.cadrage * detail.cadrage +
    poids.hauteur * detail.hauteur +
    poids.signal * detail.signal +
    poids.fenetre * detail.fenetre +
    poids.lune * detail.lune
  return trace({
    value: valeur,
    formula: 'SCORE_CIBLE',
    // Les poids entrent dans la trace : réglés, ils ne valent plus ceux du registre, et une
    // décomposition qui n'afficherait que les C-15 mentirait sur le calcul qu'elle explique.
    inputs: {
      s_cadrage: detail.cadrage,
      s_hauteur: detail.hauteur,
      s_signal: detail.signal,
      s_fenetre: detail.fenetre,
      s_lune: detail.lune,
      w_cadrage: poids.cadrage,
      w_hauteur: poids.hauteur,
      w_signal: poids.signal,
      w_fenetre: poids.fenetre,
      w_lune: poids.lune,
    },
    constants: [
      'POIDS_SCORING_CADRAGE',
      'POIDS_SCORING_HAUTEUR',
      'POIDS_SCORING_SNR',
      'POIDS_SCORING_FENETRE',
      'POIDS_SCORING_LUNE',
    ],
  })
}
