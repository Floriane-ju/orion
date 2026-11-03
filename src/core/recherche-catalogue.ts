/**
 * §6.4, T-0052 — search a catalogue object by name.
 * ~14 000 entries are queried, not browsed: listing first 400 shows only IC, M45 out of reach.
 * T-0053 gives it its field.
 * Searched = `libelleObjet` display (designation + each common name) + usual French name if any
 * (`registry/noms-fr.ts`, T-0281): catalogue English, user isn't. No horizon/verdict here
 * (`lignesCatalogue`, column by column in Cibles tab). Whole catalogue, below horizon too.
 * Scope never capped: `maxRendus` bounds rendered results, not search extent.
 */

import type { ObjetCielProfond } from '../data/deepsky.ts'
import { NOMS_FR } from '../registry/noms-fr.ts'

/**
 * T-0281 — normalizes what varies by hand without changing the object: case, accents, separators,
 * padding zeros. "NGC 224", "ngc0224", "NGC-224" = catalogue's "NGC0224"; "M 42" = "M42".
 * Zeros drop only at the HEAD of a digit group: "M100" stays "M100", else matches another
 * object. No dependency.
 */
function normalise(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/(^|\D)0+(\d)/g, '$1$2')
}

/**
 * Every name an object can be asked under: designation, common names, French name (§6.4).
 * Upstream separates names by "|" or "," — both count, else "Orion Nebula" would only be an
 * internal hit of "Great Orion Nebula,Orion Nebula".
 */
function nomsDe(objet: ObjetCielProfond): readonly string[] {
  return [
    objet.designation,
    ...objet.nomsCommuns.split(/[|,]/),
    ...(NOMS_FR[objet.designation] ?? '').split('|'),
  ]
}

/** Prefix ranks before internal hit; no hit = out. */
const RANG_PREFIXE = 0
const RANG_INTERNE = 1
const ABSENT = -1

function rangDe(objet: ObjetCielProfond, recherche: string): number {
  let rang = ABSENT
  for (const nom of nomsDe(objet)) {
    if (nom === '') continue
    const position = normalise(nom).indexOf(recherche)
    if (position === 0) return RANG_PREFIXE
    if (position > 0) rang = RANG_INTERNE
  }
  return rang
}

/**
 * Catalogue objects whose designation or a common name contains input: prefixes first, then
 * brightest → faintest (observer's order, as `lignesCatalogue`).
 * Empty input returns nothing: offering 14 000 entries before first keystroke was the defect.
 */
export function chercheCatalogue(
  catalogue: readonly ObjetCielProfond[],
  saisie: string,
  maxRendus: number,
): readonly ObjetCielProfond[] {
  const recherche = normalise(saisie.trim())
  if (recherche === '') return []

  const trouves: { objet: ObjetCielProfond; rang: number }[] = []
  for (const objet of catalogue) {
    const rang = rangDe(objet, recherche)
    if (rang !== ABSENT) trouves.push({ objet, rang })
  }

  // No magnitude never precedes a magnitude: absence sorts last, not zero (§6.3).
  trouves.sort(
    (a, b) =>
      a.rang - b.rang || (a.objet.vMag ?? Number.POSITIVE_INFINITY) - (b.objet.vMag ?? Number.POSITIVE_INFINITY),
  )
  return trouves.slice(0, maxRendus).map((t) => t.objet)
}
