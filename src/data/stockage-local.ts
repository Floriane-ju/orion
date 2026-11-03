/**
 * §11.1, §12.3 — sole local-storage access: what is LOOKED AT survives reload.
 * Two state natures, never mixed:
 *   - what user PRODUCES (site, profil, chosen targets, scoring weights): IndexedDB (`db.ts`),
 *     written as typed, exported;
 *   - what user LOOKS AT (scene, night mode, catalogue, open fiche, unfolded cards): here, in
 *     `localStorage`, not exported (worthless on another machine).
 * `localStorage` for synchronous reads: each store initialises at module load, before first
 * render; async read would open default state then jump (white screen in night mode, flicker).
 * Storage is outside trust perimeter: tampered/earlier-version keys yield only fields passing
 * their test; a damaged field falls back to default without taking others.
 */

import { DOMAINES, type DomaineId } from '../registry/domains.ts'

export type Brut = Readonly<Record<string, unknown>>
export type Test = (v: unknown) => boolean

export function objet(v: unknown): Brut | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Brut) : null
}

/** Keeps only keys whose value passes its test. */
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

/** Number within its input domain; a value the screen couldn't produce is dropped. */
export const dans =
  (champ: DomaineId): Test =>
  (v) =>
    fini(v) && (v as number) >= DOMAINES[champ].min && (v as number) <= DOMAINES[champ].max

/**
 * Object under first present key, or `null`: absent, unreadable or storage refused. Several keys
 * to reread a name used by an earlier version.
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
    // Storage refused: screen usable, just doesn't survive reload.
  }
}

/**
 * Written at page exit (close, reload, tab backgrounded), not each store write: scene publishes
 * 2/s, only last state counts. `visibilitychange` covers mobile, where `pagehide` is unreliable.
 * ponytail: a tab killed with neither loses its last tweak; write at each `pose` if it hurts in
 * the field.
 */
export function gardeAuDepart(cle: string, instantane: () => unknown): void {
  if (typeof window === 'undefined') return
  const ecrit = () => ecritLocal(cle, instantane())
  window.addEventListener('pagehide', ecrit)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') ecrit()
  })
}
