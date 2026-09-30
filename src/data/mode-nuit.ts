/**
 * §11.1 — le mode nuit survit au redémarrage : son état persiste dans le stockage local.
 *
 * T-0338 — la persistance vit dans `src/data/`, comme toutes les autres : le composant
 * `ModeNuit` décide et applique, il ne lit ni n'écrit le stockage. État d'interface, donc
 * `stockage-local.ts` : il doit être connu AVANT le premier rendu, sans quoi l'écran
 * s'allumerait en blanc le temps d'une lecture asynchrone — exactement ce que le mode protège.
 */

import { K } from '../registry/constants.ts'
import { booleen, ecritLocal, fini, litLocal } from './stockage-local.ts'

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
  const lu = litLocal(CLE_STOCKAGE, CLE_STOCKAGE_ANCIENNE)
  if (lu === null) return ETAT_INITIAL
  const plancher = K('LUMINANCE_PLANCHER_MODE_NUIT')
  const luminance = lu.luminance as number
  return {
    actif: booleen(lu.actif) ? (lu.actif as boolean) : ETAT_INITIAL.actif,
    luminance:
      fini(luminance) && luminance >= plancher && luminance <= LUMINANCE_NOMINALE
        ? luminance
        : ETAT_INITIAL.luminance,
  }
}

/**
 * Écrit à chaque bascule plutôt qu'au départ de la page (`gardeAuDepart`) : l'état est tenu
 * par React et change rarement, et c'est celui qu'on ne veut surtout pas perdre.
 */
export function ecritEtatPersiste(etat: EtatModeNuit): void {
  ecritLocal(CLE_STOCKAGE, etat)
}
