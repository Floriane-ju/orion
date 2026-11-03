/**
 * T-0188 — where focus goes when panel changes content with nothing moving on screen.
 * Side panel is permanent (T-0181): opening a fiche or returning to list replaces its body in
 * place. By keyboard both transitions are invisible — worse, return DESTROYS the focus-holding
 * button: focus falls to `<body>`, Tab restarts from document top.
 * APG « detail then return »: go INTO the detail, return WHERE we left from.
 * - LISTE → FICHE: focus enters fiche, on its title. Opening a fiche is deliberate (row click,
 *   Enter on a scène object); arrow-key sky navigation doesn't call `ouvreCible`, so can't trap
 *   focus in panel (`planetarium-gestes.ts`).
 * - FICHE → LISTE: focus returns to the ROW of the cible just consulted.
 * - Fallback: row gone (filters or minute moved) → search field, panel head, never nowhere.
 * Mode toggle absent: leaves focus on its triggering button, which survives. Doing nothing is also
 * a decision.
 */

import type { VueCibles } from './seance-etat.ts'

export type CibleFocus = 'TITRE_FICHE' | 'LIGNE_CIBLE' | 'CHAMP_RECHERCHE' | null

/**
 * Decided without DOM: `lignePresente` = consulted cible's row still rendered. `null` = don't
 * touch focus (vast majority of renders).
 */
export function cibleFocus(
  precedente: VueCibles,
  courante: VueCibles,
  lignePresente: boolean,
): CibleFocus {
  if (precedente === courante) return null
  if (courante === 'FICHE') return 'TITRE_FICHE'
  return lignePresente ? 'LIGNE_CIBLE' : 'CHAMP_RECHERCHE'
}

/**
 * Row button id. A désignation has spaces and dots (« NGC 7000 », « IC 1396A »): non-alphanumerics
 * → hyphen, else `getElementById` gets an id the document never writes as is.
 */
export function idLigneCible(designation: string): string {
  return `cible-${designation.replace(/[^A-Za-z0-9-]/g, '-')}`
}
