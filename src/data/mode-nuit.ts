/**
 * §11.1 — le mode nuit survit au redémarrage : son état persiste dans le stockage local.
 *
 * T-0338 — la persistance vit dans `src/data/`, comme toutes les autres : le composant
 * `ModeNuit` décide et applique, il ne lit ni n'écrit le stockage. `localStorage` et non
 * IndexedDB : l'état doit être connu AVANT le premier rendu, sans quoi l'écran s'allumerait en
 * blanc le temps d'une lecture asynchrone — exactement ce que le mode protège.
 */

import { K } from '../registry/constants.ts'

export interface EtatModeNuit {
  readonly actif: boolean
  readonly luminance: number
}

const CLE_STOCKAGE = 'orion.mode-nuit'
/** Clé portée avant que le produit s'appelle Orion : relue une dernière fois, jamais réécrite. */
const CLE_STOCKAGE_ANCIENNE = 'astrofort.mode-nuit'
export const LUMINANCE_NOMINALE = 1

export const ETAT_INITIAL: EtatModeNuit = Object.freeze({
  actif: false,
  luminance: LUMINANCE_NOMINALE,
})

/**
 * Le mode reste actif au redémarrage et entre les vues (§11.1).
 *
 * Le stockage local est hors du périmètre de confiance : une clé retouchée, ou écrite par
 * une version antérieure, ne doit pas se propager dans l'état. Chaque champ de forme
 * inattendue retombe sur `ETAT_INITIAL`, les champs intrus sont ignorés — dont `typeDalle`
 * et `autoActivation`, écrits par les versions d'avant T-0140.
 */
export function litEtatPersiste(): EtatModeNuit {
  if (typeof localStorage === 'undefined') return ETAT_INITIAL
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE) ?? localStorage.getItem(CLE_STOCKAGE_ANCIENNE)
    if (brut === null) return ETAT_INITIAL
    const lu: unknown = JSON.parse(brut)
    if (typeof lu !== 'object' || lu === null) return ETAT_INITIAL
    const champs = lu as Record<string, unknown>
    const plancher = K('LUMINANCE_PLANCHER_MODE_NUIT')
    return {
      actif: typeof champs.actif === 'boolean' ? champs.actif : ETAT_INITIAL.actif,
      luminance:
        typeof champs.luminance === 'number' &&
        champs.luminance >= plancher &&
        champs.luminance <= LUMINANCE_NOMINALE
          ? champs.luminance
          : ETAT_INITIAL.luminance,
    }
  } catch {
    return ETAT_INITIAL
  }
}

export function ecritEtatPersiste(etat: EtatModeNuit): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(etat))
  } catch {
    // Stockage refusé : le mode reste utilisable, il ne survit simplement pas au rechargement.
  }
}

