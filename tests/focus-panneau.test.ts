/**
 * T-0188 — focus follows panneau when content changes.
 * Tests the rule, not `.focus()`: list and fiche never coexist in DOM, so the DECISION (target,
 * fallback when origin row vanished) carries APG "detail then back". Wiring = 6-line
 * `useEffect` in `RegionSeance`. Row id tested too: links fiche → row; désignation has spaces.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cibleFocus, idLigneCible } from '../src/ui/focus-panneau.ts'
import { etatSeance, ouvreCible, poseMode, reinitialiseSeance } from '../src/ui/seance-etat.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'

afterEach(() => {
  reinitialiseSeance()
})

describe('T-0188 — la séquence liste → fiche → retour', () => {
  it('ouvrir une fiche fait entrer le focus dans la fiche', () => {
    expect(cibleFocus('LISTE', 'FICHE', false)).toBe('TITRE_FICHE')
  })

  it('revenir rend le focus à la ligne d’où l’on est parti', () => {
    expect(cibleFocus('FICHE', 'LISTE', true)).toBe('LIGNE_CIBLE')
  })

  it('se replie sur la recherche quand les filtres ont écarté la ligne', () => {
    expect(cibleFocus('FICHE', 'LISTE', false)).toBe('CHAMP_RECHERCHE')
  })

  it('ne déplace jamais le focus quand la vue n’a pas changé', () => {
    expect(cibleFocus('LISTE', 'LISTE', true)).toBeNull()
    expect(cibleFocus('FICHE', 'FICHE', false)).toBeNull()
  })

  it('ne rend jamais « nulle part » sur un retour : le focus ne retombe pas sur le corps', () => {
    for (const presente of [true, false]) {
      expect(cibleFocus('FICHE', 'LISTE', presente)).not.toBeNull()
    }
  })
})

describe('T-0188 — retrouver la ligne d’une cible', () => {
  it('rend un identifiant que le document peut porter', () => {
    for (const designation of ['M31', 'NGC 7000', 'IC 1396A', 'Sh2-155', 'Barnard 33']) {
      const id = idLigneCible(designation)
      expect(id, designation).toMatch(/^cible-[A-Za-z0-9-]+$/)
    }
  })

  it('reste stable pour une même désignation, et distingue deux cibles', () => {
    expect(idLigneCible('NGC 7000')).toBe(idLigneCible('NGC 7000'))
    expect(idLigneCible('M31')).not.toBe(idLigneCible('M32'))
  })
})

describe('T-0188 — la bascule de mode ne perd pas le focus de son bouton', () => {
  /**
   * Toggle button survives: rendered in both modes, browser keeps focus. Only a panneau
   * unmount (`vueCibles` change) could remove it; mode switch causes none.
   */
  const CIBLE = {
    designation: 'M31',
    nomsCommuns: 'Andromède',
    adDeg: 10.6847,
    decDeg: 41.269,
    type: 'GALAXIE',
    majAxArcmin: 189.1,
    minAxArcmin: 61.7,
    posAngDeg: 35,
    vMag: 3.4,
    bMag: 4.4,
    surfBr: 13.5,
  } as const satisfies ObjetCielProfond

  it('laisse la vue du panneau telle quelle dans les deux sens', () => {
    ouvreCible(CIBLE)
    expect(etatSeance().vueCibles).toBe('FICHE')

    poseMode('PANORAMA')
    expect(etatSeance().vueCibles).toBe('FICHE')

    poseMode('CIEL_PROFOND')
    expect(etatSeance().vueCibles).toBe('FICHE')
    expect(cibleFocus('FICHE', etatSeance().vueCibles, true)).toBeNull()
  })
})
