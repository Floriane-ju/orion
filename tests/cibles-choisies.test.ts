/**
 * §6.4 → §8.3 — la sélection de cibles : ce que le plan de nuit reçoit en entrée.
 *
 * Deux choses sont vérifiées ici, et elles tiennent seules le contrat du magasin : le geste
 * d'ajout est réversible et n'écrase rien d'autre, et ce qui revient de la base est VALIDÉ —
 * un enregistrement retouché ne doit pas traverser la chaîne de calcul.
 *
 * Aucune éphéméride ici : le magasin ne connaît que des désignations.
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
    // Le magasin remplace l'ensemble à chaque geste plutôt que de le muter : deux lectures
    // séparées par un ajout ne peuvent pas désigner le même objet.
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
    // Sans hydratation, le magasin change à l'écran mais laisse la base intacte : sinon le
    // premier rendu, forcément vide, effacerait la sélection de la veille.
    basculeChoixCible('M31')
    expect([...(await litCiblesChoisies())]).toStrictEqual(['M45'])
  })

  it('grave une fois la relecture faite', async () => {
    poseCiblesChoisies([])
    basculeChoixCible('M31')
    // L'écriture est lancée sans être attendue : le clic ne dépend pas de la base.
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
