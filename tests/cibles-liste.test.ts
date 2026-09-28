/**
 * §6.4 — la liste du catalogue : une ligne par objet, et ce qui décide dessus.
 *
 * Le catalogue est forgé ici plutôt que décodé : ce qui est vérifié est la règle de tri, les
 * filtres et ce qu'une ligne dit quand la donnée manque — pas le contenu d'OpenNGC. Les
 * positions sont choisies depuis le site de l'Annexe A et relues par la même conversion que
 * celle du module : le test constate un signe de hauteur, jamais une éphéméride recopiée.
 *
 * La taille en pixels est vérifiée contre `ficheCadrage`, source de la formule §6.2 : un
 * nombre écrit à la main y ferait passer une projection fausse.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ajouteCoordonnees, filtreLignes, lignesCatalogue, lignesInvariantes, typesPresents } from '../src/core/cibles-liste.ts'
import { ficheCadrage } from '../src/core/cadrage.ts'
import { cielInstantane } from '../src/core/horloges.ts'
import { applique, versSpherique, versVecteur } from '../src/core/mat3.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import type { Site } from '../src/core/ephem.ts'
import { decodeObjets, TYPES_OBJET, type ObjetCielProfond } from '../src/data/deepsky.ts'

/** Annexe A : Bordeaux, 45° N. */
const SITE: Site = { latitudeDeg: 44.84, longitudeDeg: -0.58, altitudeM: 20 }
const INSTANT = new Date('2026-08-18T22:00:00Z')
const MATRICE = cielInstantane(SITE, INSTANT).matrice

/** Setup de référence de l'Annexe A : 120 mm f/2.8, plein format. */
const OPTIQUE = { fovHDeg: 16.4, echApx: 10.1, capteurHMm: 24, dMm: 42.86 }
const CIEL = { sbCiel: 21.0, mLimOeil: 6.1 }
const SETUP = { ...OPTIQUE, ...CIEL, matriceCiel: MATRICE }

const SANS_FILTRE = { types: new Set(TYPES_OBJET), magMax: DOMAINES.m_int.max, recherche: '' }

function hauteurDe(adDeg: number, decDeg: number): number {
  return versSpherique(applique(MATRICE, versVecteur(adDeg, decDeg))).latitudeDeg
}

function objet(partiel: Partial<ObjetCielProfond> & { designation: string }): ObjetCielProfond {
  return {
    nomsCommuns: '',
    adDeg: 0,
    decDeg: 0,
    type: 'GALAXIE',
    majAxArcmin: 10,
    minAxArcmin: 6,
    posAngDeg: null,
    vMag: 8,
    bMag: null,
    surfBr: null,
    ...partiel,
  }
}

// Le pôle nord céleste ne se couche jamais depuis 44,84° N ; le pôle sud ne se lève jamais.
const CIRCUMPOLAIRE = { adDeg: 0, decDeg: 85 }
const JAMAIS_LEVE = { adDeg: 0, decDeg: -85 }

function liste(catalogue: readonly ObjetCielProfond[]) {
  return lignesCatalogue({ catalogue, ...SETUP })
}

describe('lignesCatalogue — une ligne par objet, rien n’est écarté', () => {
  it('garde un objet sous l’horizon, avec une hauteur négative', () => {
    expect(hauteurDe(JAMAIS_LEVE.adDeg, JAMAIS_LEVE.decDeg)).toBeLessThan(0)

    const lignes = liste([
      objet({ designation: 'HAUT', ...CIRCUMPOLAIRE }),
      objet({ designation: 'BAS', ...JAMAIS_LEVE }),
    ])

    expect(lignes.map((l) => l.objet.designation).sort()).toEqual(['BAS', 'HAUT'])
    expect(lignes.find((l) => l.objet.designation === 'BAS')!.hauteurDeg).toBeLessThan(0)
    expect(lignes.find((l) => l.objet.designation === 'HAUT')!.hauteurDeg).toBeGreaterThan(0)
  })

  it('garde un objet sans magnitude ou sans dimensions, sans rien estimer pour lui', () => {
    const lignes = liste([
      objet({ designation: 'SANS_MAG', ...CIRCUMPOLAIRE, vMag: null }),
      objet({ designation: 'SANS_DIM', ...CIRCUMPOLAIRE, majAxArcmin: null, minAxArcmin: null }),
      objet({ designation: 'COMPLET', ...CIRCUMPOLAIRE }),
    ])
    const par = (d: string) => lignes.find((l) => l.objet.designation === d)!

    expect(lignes).toHaveLength(3)
    expect(par('SANS_MAG').verdict).toBeNull()
    expect(par('SANS_MAG').sbObj).toBeNull()
    expect(par('SANS_DIM').grandAxePx).toBeNull()
    expect(par('SANS_DIM').petitAxePx).toBeNull()
    expect(par('SANS_DIM').remplissage).toBeNull()
    expect(par('COMPLET').verdict).not.toBeNull()
  })

  it('porte PHOTO_SEULE comme un verdict, pas comme un refus', () => {
    // Grande et faible : sa brillance de surface passe sous le fond de ciel.
    const lignes = liste([
      objet({
        designation: 'DIFFUSE',
        ...CIRCUMPOLAIRE,
        vMag: 13,
        majAxArcmin: 90,
        minAxArcmin: 60,
      }),
    ])

    expect(lignes).toHaveLength(1)
    expect(lignes[0]!.verdict).toBe('PHOTO_SEULE')
  })

  it('projette le grand axe comme §6.2, et le petit axe dans le même rapport', () => {
    const grand = 30
    const petit = 12
    const lignes = liste([
      objet({ designation: 'ELLIPSE', ...CIRCUMPOLAIRE, majAxArcmin: grand, minAxArcmin: petit }),
    ])
    const attendu = ficheCadrage({
      ...OPTIQUE,
      tailleMajArcmin: grand,
      tailleMinArcmin: petit,
      posAngDeg: null,
    }).diamPx.value

    expect(lignes[0]!.grandAxePx).toBeCloseTo(attendu, 6)
    expect(lignes[0]!.petitAxePx).toBeCloseTo(attendu * (petit / grand), 6)
  })

  it('porte le remplissage de §6.2, la place de la cible sur la photo', () => {
    const grand = 30
    const petit = 12
    const lignes = liste([
      objet({ designation: 'ELLIPSE', ...CIRCUMPOLAIRE, majAxArcmin: grand, minAxArcmin: petit }),
    ])
    const attendu = ficheCadrage({
      ...OPTIQUE,
      tailleMajArcmin: grand,
      tailleMinArcmin: petit,
      posAngDeg: null,
    }).remplissage.value

    expect(lignes[0]!.remplissage).toBeCloseTo(attendu, 6)
  })

  it('garde le même remplissage à capteur égal quand le pitch change, pas le diamètre', () => {
    // Même capteur, deux résolutions : le champ ne bouge pas, l'échantillonnage suit le pitch.
    const rapportPitch = 6.1 / 5.12
    const cible = [objet({ designation: 'CIBLE', ...CIRCUMPOLAIRE, majAxArcmin: 30 })]
    const fin = lignesCatalogue({ catalogue: cible, ...SETUP })[0]!
    const large = lignesCatalogue({
      catalogue: cible,
      ...SETUP,
      echApx: OPTIQUE.echApx * rapportPitch,
    })[0]!

    expect(large.remplissage).toBeCloseTo(fin.remplissage!, 12)
    expect(large.grandAxePx).toBeCloseTo(fin.grandAxePx! / rapportPitch, 6)
  })

  it('suppose l’objet circulaire quand le petit axe manque, comme le fait §6.2', () => {
    const lignes = liste([
      objet({ designation: 'ROND', ...CIRCUMPOLAIRE, majAxArcmin: 20, minAxArcmin: null }),
    ])

    expect(lignes[0]!.petitAxePx).toBe(lignes[0]!.grandAxePx)
  })

  it('trie du plus brillant au plus faible, magnitude absente en dernier', () => {
    const lignes = liste([
      objet({ designation: 'FAIBLE', ...CIRCUMPOLAIRE, vMag: 11 }),
      objet({ designation: 'SANS_MAG', ...CIRCUMPOLAIRE, vMag: null }),
      objet({ designation: 'BRILLANT', ...CIRCUMPOLAIRE, vMag: 3 }),
      objet({ designation: 'MOYEN', ...CIRCUMPOLAIRE, vMag: 7 }),
    ])

    expect(lignes.map((l) => l.objet.designation)).toEqual([
      'BRILLANT',
      'MOYEN',
      'FAIBLE',
      'SANS_MAG',
    ])
  })
})

describe('filtreLignes — les trois restrictions de §6.4', () => {
  const CATALOGUE = [
    objet({ designation: 'GAL', nomsCommuns: 'Andromède', ...CIRCUMPOLAIRE, type: 'GALAXIE', vMag: 4 }),
    objet({ designation: 'GLOB', ...CIRCUMPOLAIRE, type: 'AMAS_GLOB', vMag: 9 }),
    objet({ designation: 'OBSCURE_SOUS_HORIZON', ...JAMAIS_LEVE, type: 'NEB_OBSCURE', vMag: 12 }),
    objet({ designation: 'SANS_MAG', ...CIRCUMPOLAIRE, type: 'GALAXIE', vMag: null }),
  ]
  const LIGNES = liste(CATALOGUE)

  it('ne propose que les types présents, dans l’ordre du catalogue', () => {
    expect(typesPresents(LIGNES)).toEqual(['GALAXIE', 'AMAS_GLOB', 'NEB_OBSCURE'])
  })

  it('ne retire rien tant qu’aucun filtre n’est posé', () => {
    expect(filtreLignes(LIGNES, SANS_FILTRE)).toEqual(LIGNES)
  })

  it('ne garde que les objets du type retenu', () => {
    expect(
      filtreLignes(LIGNES, { ...SANS_FILTRE, types: new Set(['AMAS_GLOB'] as const) }).map(
        (l) => l.objet.designation,
      ),
    ).toEqual(['GLOB'])
  })

  it('garde les objets de chacun des types cochés, et d’eux seuls', () => {
    expect(
      filtreLignes(LIGNES, {
        ...SANS_FILTRE,
        types: new Set(['AMAS_GLOB', 'NEB_OBSCURE'] as const),
      }).map((l) => l.objet.designation),
    ).toEqual(['GLOB', 'OBSCURE_SOUS_HORIZON'])
  })

  it('ne garde rien quand aucun type n’est coché', () => {
    expect(filtreLignes(LIGNES, { ...SANS_FILTRE, types: new Set() })).toEqual([])
  })

  it('écarte une magnitude absente dès que le filtre de magnitude est actif', () => {
    const toutes = filtreLignes(LIGNES, SANS_FILTRE).map((l) => l.objet.designation)
    const brillantes = filtreLignes(LIGNES, { ...SANS_FILTRE, magMax: 10 }).map(
      (l) => l.objet.designation,
    )

    expect(toutes).toContain('SANS_MAG')
    expect(brillantes).not.toContain('SANS_MAG')
    expect(brillantes).toEqual(['GAL', 'GLOB'])
  })

  it('ne rend rien sur une saisie vide de recherche, mais ne filtre pas non plus', () => {
    expect(filtreLignes(LIGNES, { ...SANS_FILTRE, recherche: '   ' })).toEqual(LIGNES)
  })

  it('trouve par nom commun, sans accent ni majuscule, y compris sous l’horizon', () => {
    expect(
      filtreLignes(LIGNES, { ...SANS_FILTRE, recherche: 'andromede' }).map(
        (l) => l.objet.designation,
      ),
    ).toEqual(['GAL'])
    expect(
      filtreLignes(LIGNES, { ...SANS_FILTRE, recherche: 'OBSCURE' }).map(
        (l) => l.objet.designation,
      ),
    ).toEqual(['OBSCURE_SOUS_HORIZON'])
  })

  it('applique le filtre AVANT tout plafond d’affichage', () => {
    // 250 galaxies plus brillantes qu'un amas globulaire : filtrer avant de plafonner le
    // fait apparaître, filtrer après ne le montrerait jamais.
    const foule = [
      ...Array.from({ length: 250 }, (_, i) =>
        objet({ designation: `GAL${i}`, ...CIRCUMPOLAIRE, vMag: 4 + i / 100 }),
      ),
      objet({ designation: 'GLOB_FAIBLE', ...CIRCUMPOLAIRE, type: 'AMAS_GLOB', vMag: 10 }),
    ]
    const lignes = liste(foule)

    expect(lignes.slice(0, 200).some((l) => l.objet.designation === 'GLOB_FAIBLE')).toBe(false)
    expect(
      filtreLignes(lignes, { ...SANS_FILTRE, types: new Set(['AMAS_GLOB'] as const) })
        .slice(0, 200)
        .map((l) => l.objet.designation),
    ).toEqual(['GLOB_FAIBLE'])
  })
})

describe('lignesCatalogue — sur le catalogue embarqué, au site de l’Annexe A', () => {
  function openngc(): readonly ObjetCielProfond[] {
    const racine = join(import.meta.dirname, '..', 'public', 'data')
    const lit = (nom: string): ArrayBuffer => {
      const octets = readFileSync(join(racine, nom))
      return octets.buffer.slice(
        octets.byteOffset,
        octets.byteOffset + octets.byteLength,
      ) as ArrayBuffer
    }
    return decodeObjets({
      enregistrements: lit('openngc-1.bin'),
      chaines: lit('openngc-noms-1.bin'),
    })
  }

  const CATALOGUE = openngc()
  const LIGNES = liste(CATALOGUE)

  it('rend exactement une ligne par entrée du catalogue', () => {
    expect(LIGNES).toHaveLength(CATALOGUE.length)
  })

  it('rend des azimuts dans [0 ; 360[ et des hauteurs dans [−90 ; 90]', () => {
    expect(LIGNES.every((l) => l.azimutDeg >= 0 && l.azimutDeg < 360)).toBe(true)
    expect(LIGNES.every((l) => l.hauteurDeg >= -90 && l.hauteurDeg <= 90)).toBe(true)
  })

  it('laisse un hémisphère sous l’horizon : la liste n’est ni tout levé ni rien', () => {
    const levees = LIGNES.filter((l) => l.hauteurDeg > 0).length
    expect(levees).toBeGreaterThan(0)
    expect(levees).toBeLessThan(CATALOGUE.length)
  })

  it('trie du plus brillant au plus faible, magnitudes absentes rejetées en fin', () => {
    const magnitudes = LIGNES.map((l) => l.objet.vMag)
    const dernierChiffre = magnitudes.findIndex((m) => m === null)
    const chiffrees = dernierChiffre === -1 ? magnitudes : magnitudes.slice(0, dernierChiffre)

    expect(chiffrees.every((m, i) => i === 0 || chiffrees[i - 1]! <= m!)).toBe(true)
    expect(magnitudes.slice(dernierChiffre === -1 ? magnitudes.length : dernierChiffre)).toSatisfy(
      (restant: readonly (number | null)[]) => restant.every((m) => m === null),
    )
  })

  it('T-0190 - optimisation identique a la version non optimisee', () => {
    const naif = lignesCatalogue({ catalogue: CATALOGUE, ...SETUP })
    const optimise = ajouteCoordonnees(lignesInvariantes({ catalogue: CATALOGUE, ...OPTIQUE, ...CIEL }), MATRICE)

    expect(optimise).toHaveLength(naif.length)
    for (let i = 0; i < naif.length; i++) {
      const n = naif[i]!
      const o = optimise[i]!
      expect(o.objet.designation).toBe(n.objet.designation)
      expect(o.hauteurDeg).toBeCloseTo(n.hauteurDeg, 12)
      expect(o.azimutDeg).toBeCloseTo(n.azimutDeg, 12)
      expect(o.sbObj).toBe(n.sbObj)
      expect(o.verdict).toBe(n.verdict)
      expect(o.grandAxePx).toBe(n.grandAxePx)
      expect(o.petitAxePx).toBe(n.petitAxePx)
      expect(o.remplissage).toBe(n.remplissage)
      expect(o.verdictCadrage).toBe(n.verdictCadrage)
      expect(o.cadrable).toBe(n.cadrable)
    }
  })
})
