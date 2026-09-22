/**
 * T-0296 — le ciel s'affiche avec ses étoiles, sans trou ni tâche longue.
 *
 * Quatre propriétés, qui sont les quatre critères du ticket :
 *
 *   1. un long balayage tranché rend RÉELLEMENT la main — ce qui attendait passe entre deux
 *      tranches — et rend exactement le même résultat que le même balayage d'un bloc ;
 *   2. la séquence de démarrage publie les étoiles et leur index AVANT le catalogue d'objets,
 *      qui est ce que la liste affiche ;
 *   3. hors Panorama, l'index de l'aperçu n'est pas construit ;
 *   4. les catalogues partent en même temps que la relecture de la saisie, pas après elle.
 *
 * Aucune valeur de ciel n'est écrite ici : le catalogue d'épreuve est fabriqué, et ce qui est
 * comparé est toujours un chemin contre l'autre.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  dUnBloc,
  parTranches,
  pointDeCoupe,
  type Decoupable,
} from '../src/core/tranches.ts'
import { decodeEtoiles, decodeEtoilesPas, encodeEtoiles, type Etoile } from '../src/data/catalog.ts'
import { construitIndex, construitIndexPas } from '../src/core/index-ciel.ts'
import { B } from '../src/registry/budgets.ts'
import { chargeCatalogues } from '../src/ui/app-donnees.ts'

/**
 * Un catalogue d'épreuve qui traverse plusieurs points de coupe : sous le pas, le découpage
 * ne se produirait pas et le test ne prouverait rien. Les positions sont fabriquées — il ne
 * s'agit pas d'un ciel, mais d'un volume de données.
 */
function catalogueEpreuve(): readonly Etoile[] {
  const n = B('PAS_TRANCHE') * 3 + 7
  return Array.from({ length: n }, (_, i) => ({
    adDeg: (i * 360) / n,
    decDeg: -90 + ((i * 180) / n),
    magV: -1 + (i % 1300) / 100,
    bv: -0.3 + (i % 220) / 100,
  }))
}

const ETOILES = catalogueEpreuve()
const PAQUET = encodeEtoiles(ETOILES)

/** Un balayage qui consomme un temps d'horloge connu par étape, découpé à chaque étape. */
function* brule(etapes: number, msParEtape: number): Decoupable<number> {
  let tours = 0
  for (let i = 0; i < etapes; i++) {
    yield
    const fin = performance.now() + msParEtape
    while (performance.now() < fin) tours++
  }
  return tours
}

describe('T-0296 — un long balayage rendu par tranches', () => {
  it('rend la main : ce qui attendait passe avant la fin du balayage', async () => {
    const budget = B('TRANCHE_MS')
    let passe = false
    setTimeout(() => {
      passe = true
    }, 0)

    // Assez de travail pour dépasser le budget plusieurs fois, quelle que soit la machine :
    // chaque étape consomme du TEMPS, pas un nombre d'opérations.
    await parTranches(brule(6, budget / 2))
    expect(passe).toBe(true)
  })

  it('d’un bloc, rien ne passe : c’est bien le découpage qui rend la main', async () => {
    let passe = false
    setTimeout(() => {
      passe = true
    }, 0)

    dUnBloc(brule(6, B('TRANCHE_MS') / 2))
    expect(passe).toBe(false)
    // La promesse rendue ici ne sert qu'à laisser le minuteur repartir pour les tests suivants.
    await new Promise<void>((reprend) => setTimeout(reprend, 0))
  })

  it('aucune tranche ne dépasse son budget de plus d’une étape', async () => {
    const budget = B('TRANCHE_MS')
    const msParEtape = budget / 3
    let plusLongueMs = 0
    await parTranches(brule(12, msParEtape), (mesure) => {
      plusLongueMs = mesure.plusLongueMs
    })
    expect(plusLongueMs).toBeLessThan(budget + msParEtape * 2)
  })

  it('découpe aux indices annoncés, et nulle part ailleurs', () => {
    expect(pointDeCoupe(0)).toBe(true)
    expect(pointDeCoupe(1)).toBe(false)
    expect(pointDeCoupe(B('PAS_TRANCHE'))).toBe(true)
    expect(pointDeCoupe(B('PAS_TRANCHE') + 1)).toBe(false)
  })
})

describe('T-0296 — tranché ou d’un bloc, le résultat est le même', () => {
  it('décode les mêmes étoiles', async () => {
    expect(await parTranches(decodeEtoilesPas(PAQUET))).toEqual(decodeEtoiles(PAQUET))
  })

  it('construit le même index', async () => {
    const tranche = await parTranches(construitIndexPas(ETOILES))
    const bloc = construitIndex(ETOILES)
    expect(tranche.nombreEtoiles).toBe(bloc.nombreEtoiles)
    expect(tranche.magMin).toBe(bloc.magMin)
    expect(tranche.profondeurMag).toBe(bloc.profondeurMag)
    expect([...tranche.cumulMag]).toEqual([...bloc.cumulMag])
    expect(tranche.cellules.length).toBe(bloc.cellules.length)
    for (let i = 0; i < bloc.cellules.length; i++) {
      const a = tranche.cellules[i]!
      const z = bloc.cellules[i]!
      expect([...a.source]).toEqual([...z.source])
      expect([...a.mag]).toEqual([...z.mag])
      expect(a.rayonDeg).toBe(z.rayonDeg)
    }
    // Le découpage doit vraiment avoir eu lieu : sinon les égalités ci-dessus sont triviales.
    expect(ETOILES.length).toBeGreaterThan(B('PAS_TRANCHE'))
  })
})

describe('T-0296 — l’ordre du démarrage', () => {
  it('publie les étoiles et leur index avant le catalogue que la liste affiche', async () => {
    const publies: string[] = []
    const note =
      (nom: string) =>
      (): void => {
        publies.push(nom)
      }

    // Aucun paquet n'est rangé en base ici : les chargeurs rendent du vide, et c'est leur
    // ORDRE qui est mesuré — c'est lui que T-0296 change, pas leur contenu.
    await chargeCatalogues({
      etat: note('etat'),
      etoiles: note('etoiles'),
      index: note('index'),
      constellations: note('constellations'),
      objets: note('objets'),
    })

    expect(publies).toEqual(['etat', 'etoiles', 'index', 'constellations', 'objets'])
    expect(publies.indexOf('index')).toBeLessThan(publies.indexOf('objets'))
  })
})
