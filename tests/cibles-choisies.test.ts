/**
 * §6.4 → §8.3 — target selection = night-plan input.
 * Store contract: toggle reversible, overwrites nothing else; DB reads VALIDATED (tampered
 * record must not enter calc chain). No ephemeris: store knows only désignations.
 */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  basculeChoixCible,
  ciblesChoisies,
  poseCiblesChoisies,
  reinitialiseCiblesChoisies,
} from '../src/ui/cibles-choisies.ts'
import { db, ecritCiblesChoisies, litCiblesChoisies } from '../src/data/db.ts'

const CLE = 'cibles-choisies'

describe('magasin des cibles choisies', () => {
  beforeEach(() => {
    reinitialiseCiblesChoisies()
  })

  it('ajoute une cible, puis la retire au même geste', () => {
    basculeChoixCible('M31')
    expect([...ciblesChoisies()]).toStrictEqual(['M31'])
    basculeChoixCible('M31')
    expect([...ciblesChoisies()]).toStrictEqual([])
  })

  it('n’écrase pas les autres cibles en en ajoutant une', () => {
    basculeChoixCible('M31')
    basculeChoixCible('NGC7000')
    basculeChoixCible('M31')
    expect([...ciblesChoisies()]).toStrictEqual(['NGC7000'])
  })

  it('rend un ensemble figé : personne ne modifie la sélection sans passer par le magasin', () => {
    basculeChoixCible('M45')
    const lu = ciblesChoisies()
    expect(Object.isFrozen(lu)).toBe(true)
    // Whole set replaced per gesture, no mutation: two reads around an add cannot alias.
    basculeChoixCible('M33')
    expect(ciblesChoisies()).not.toBe(lu)
  })

  it('remplace la sélection à l’hydratation, sans fusionner avec ce qui traînait', () => {
    basculeChoixCible('M31')
    poseCiblesChoisies(['NGC7000', 'M45'])
    expect([...ciblesChoisies()]).toStrictEqual(['NGC7000', 'M45'])
  })
})

describe('§12.3 — la sélection enregistrée', () => {
  beforeEach(() => {
    reinitialiseCiblesChoisies()
  })

  it('fait l’aller-retour par la base', async () => {
    await ecritCiblesChoisies(['M31', 'NGC7000'])
    expect([...(await litCiblesChoisies())]).toStrictEqual(['M31', 'NGC7000'])
  })

  it('ne grave rien tant que la relecture du démarrage n’a pas abouti', async () => {
    await ecritCiblesChoisies(['M45'])
    // Without hydration store changes on screen but DB stays intact; else first (empty)
    // render wipes yesterday's selection.
    basculeChoixCible('M31')
    expect([...(await litCiblesChoisies())]).toStrictEqual(['M45'])
  })

  it('grave une fois la relecture faite', async () => {
    poseCiblesChoisies([])
    basculeChoixCible('M31')
    // Write fired, not awaited: click does not depend on DB.
    await new Promise((resolu) => setTimeout(resolu, 0))
    expect([...(await litCiblesChoisies())]).toStrictEqual(['M31'])
  })

  it('rend une sélection vide plutôt qu’une valeur retouchée', async () => {
    for (const brut of [42, 'M31', null, { M31: true }]) {
      await (await db()).put('reglages', brut, CLE)
      expect(await litCiblesChoisies(), String(brut)).toStrictEqual([])
    }
  })

  it('ne garde d’une liste mêlée que ce qui est une désignation', async () => {
    await (await db()).put('reglages', ['M31', 7, null, 'M45'], CLE)
    expect([...(await litCiblesChoisies())]).toStrictEqual(['M31', 'M45'])
  })
})
