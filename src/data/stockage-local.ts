/**
 * §11.1, §12.3 — le seul accès au stockage local : ce qu'on REGARDE survit au rechargement.
 *
 * Deux natures d'état, deux chemins, jamais mélangés :
 *   - ce que l'utilisateur PRODUIT (site, profil, cibles choisies, poids de scoring) vit dans
 *     IndexedDB (`db.ts`), s'écrit au fil de la saisie et part dans l'export ;
 *   - ce qu'il REGARDE (scène, mode nuit, catalogue, fiche ouverte, cartes dépliées) vit ici,
 *     dans `localStorage`, et ne s'exporte pas : il ne vaut rien sur une autre machine.
 *
 * `localStorage` parce que sa lecture est synchrone : chaque magasin s'initialise au
 * chargement de son module, avant le premier rendu. Une lecture asynchrone ouvrirait d'abord
 * l'état par défaut, puis le ferait sauter — un écran blanc en mode nuit, une liste qui
 * clignote.
 *
 * Le stockage est hors du périmètre de confiance : une clé retouchée, ou écrite par une
 * version antérieure, ne rend que les champs qui passent leur test. Un champ abîmé retombe
 * sur le défaut sans emporter les autres.
 */

import { DOMAINES, type DomaineId } from '../registry/domains.ts'

export type Brut = Readonly<Record<string, unknown>>
export type Test = (v: unknown) => boolean

export function objet(v: unknown): Brut | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Brut) : null
}

/** Ne garde que les clés dont la valeur passe son test. */
export function garde<T>(source: Brut, tests: Readonly<Record<string, Test>>): T {
  return Object.fromEntries(
    Object.entries(tests).flatMap(([cle, test]) => (test(source[cle]) ? [[cle, source[cle]]] : [])),
  ) as T
}

export const fini: Test = (v) => typeof v === 'number' && Number.isFinite(v)
export const booleen: Test = (v) => typeof v === 'boolean'
export const chaine: Test = (v) => typeof v === 'string'
export const parmi =
  (valeurs: readonly string[]): Test =>
  (v) =>
    typeof v === 'string' && valeurs.includes(v)

/** Un nombre dans son domaine de saisie : une valeur que l'écran n'aurait pas pu produire est oubliée. */
export const dans =
  (champ: DomaineId): Test =>
  (v) =>
    fini(v) && (v as number) >= DOMAINES[champ].min && (v as number) <= DOMAINES[champ].max

/**
 * L'objet rangé sous la première clé présente, ou `null` : absent, illisible ou stockage
 * refusé. Plusieurs clés pour relire une dernière fois un nom porté par une version antérieure.
 */
export function litLocal(...cles: readonly string[]): Brut | null {
  if (typeof localStorage === 'undefined') return null
  try {
    for (const cle of cles) {
      const brut = localStorage.getItem(cle)
      if (brut !== null) return objet(JSON.parse(brut))
    }
    return null
  } catch {
    return null
  }
}

export function ecritLocal(cle: string, valeur: unknown): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(cle, JSON.stringify(valeur))
  } catch {
    // Stockage refusé : l'écran reste utilisable, il ne survit simplement pas au rechargement.
  }
}

/**
 * Écrit au départ de la page — fermeture, rechargement, onglet passé en arrière-plan — plutôt
 * qu'à chaque écriture du magasin : la scène en publie deux par seconde, et seul le dernier
 * état compte. `visibilitychange` couvre le mobile, où `pagehide` n'est pas sûr.
 * ponytail: un onglet tué sans aucun des deux perd sa dernière retouche ; écrire à chaque
 * `pose` si ça gêne sur le terrain.
 */
export function gardeAuDepart(cle: string, instantane: () => unknown): void {
  if (typeof window === 'undefined') return
  const ecrit = () => ecritLocal(cle, instantane())
  window.addEventListener('pagehide', ecrit)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') ecrit()
  })
}
