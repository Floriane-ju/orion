/**
 * T-0208 — §4.1 et §5.1 : la frontière de SAISIE borne, là où la frontière de DONNÉES refuse.
 *
 * La table est DÉRIVÉE de `DOMAINES` : aucune borne n'est recopiée ici. Un domaine ajouté
 * demain est couvert sans qu'on y pense, et un domaine dont les bornes changent ne laisse pas
 * derrière lui un test qui affirme l'ancienne plage.
 */

import { describe, expect, it } from 'vitest'
import { nombreLibre } from '../src/registry/ecriture.ts'
import { DOMAINES, borne, valide, type DomaineId } from '../src/registry/domains.ts'

const TOUS = Object.keys(DOMAINES) as readonly DomaineId[]

describe('borne() — une saisie hors plage est ramenée, et on le dit', () => {
  it.each(TOUS)('%s : au-dessus du maximum, le maximum est retenu', (champ) => {
    const d = DOMAINES[champ]
    const r = borne(champ, d.max + 1)
    expect(r.valeur).toBe(d.max)
    expect(r.refus).toContain(d.champ)
    expect(r.refus).toContain(nombreLibre(d.max))
  })

  it.each(TOUS)('%s : en dessous du minimum, le minimum est retenu', (champ) => {
    const d = DOMAINES[champ]
    const r = borne(champ, d.min - 1)
    expect(r.valeur).toBe(d.min)
    expect(r.refus).toContain(d.champ)
  })

  it.each(TOUS)('%s : une valeur intérieure traverse sans rien dire', (champ) => {
    const d = DOMAINES[champ]
    const milieu = (d.min + d.max) / 2
    expect(borne(champ, milieu)).toEqual({ valeur: milieu, refus: null })
  })

  it.each(TOUS)('%s : les bornes elles-mêmes sont acceptées', (champ) => {
    const d = DOMAINES[champ]
    expect(borne(champ, d.min).refus).toBeNull()
    expect(borne(champ, d.max).refus).toBeNull()
  })

  it.each(TOUS)('%s : un NaN n’est pas borné — un champ vide n’est pas le minimum', (champ) => {
    const r = borne(champ, Number.NaN)
    expect(r.valeur).toBeNaN()
    expect(r.refus).not.toBeNull()
  })

  it.each(TOUS)('%s : une valeur bornée passe ensuite valide() sans lever', (champ) => {
    const d = DOMAINES[champ]
    expect(() => valide(champ, borne(champ, d.max * 10 + 1).valeur)).not.toThrow()
    expect(() => valide(champ, borne(champ, d.min - 10_000).valeur)).not.toThrow()
  })

  it('l’infini est traité comme un NaN : ce n’est pas une grandeur', () => {
    expect(borne('latitude_deg', Number.POSITIVE_INFINITY).refus).not.toBeNull()
    expect(borne('latitude_deg', Number.POSITIVE_INFINITY).valeur).not.toBe(
      DOMAINES.latitude_deg.max,
    )
  })
})
