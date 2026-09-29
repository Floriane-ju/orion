/**
 * §3.4 — Constellations, frontières et astérismes.
 *
 * Le test porte sur le PAQUET RÉELLEMENT EMBARQUÉ, pas sur une donnée fabriquée pour
 * l'occasion : une figure amputée ou une frontière à la mauvaise époque est un défaut de
 * chaîne de données, et c'est précisément ce que le PRD signale comme « le détail qui
 * décale tout ».
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  RAPPEL_ASTERISME,
  RAPPEL_FIGURES,
  coucheAsterismes,
  coucheFigures,
  coucheFrontieres,
  ecartFrontieresDeg,
  longueurAreteDeg,
  matriceB1875VersJ2000,
  polyligneFrontiere,
} from '../src/core/constellations.ts'
import { decodeConstellations } from '../src/data/constellations.ts'
import { matricePrecession } from '../src/core/horloges.ts'
import { applique, separationDeg, versVecteur } from '../src/core/mat3.ts'
import {
  categoriesActives,
  composeLabels,
  etoileLabellisable,
  labelSurvol,
  type CategorieLabel,
} from '../src/core/labels.ts'
import { K } from '../src/registry/constants.ts'

const PAQUET = decodeConstellations(
  readFileSync(
    join(import.meta.dirname, '..', 'public', 'data', 'constellations-1.bin'),
  ).buffer as ArrayBuffer,
)

describe('paquet des tracés §3.4', () => {
  it('porte les 88 constellations IAU et leurs 781 arêtes de frontière', () => {
    expect(PAQUET.figures).toHaveLength(88)
    expect(PAQUET.frontieres.length).toBe(781)
    expect(PAQUET.source).toMatch(/B1875/)
  })

  it('déclare les segments écartés plutôt que d’amputer une figure en silence', () => {
    expect(PAQUET.segmentsIgnores).toBeGreaterThan(0)
    // Ils viennent des sommets Gaia que HYG ne référence pas : le compte est publié.
    expect(PAQUET.segmentsIgnores).toBeLessThan(PAQUET.figures.length * 10)
  })

  it('fait des astérismes une couche distincte des figures IAU', () => {
    const noms = PAQUET.asterismes.map((a) => a.nom)
    expect(noms).toContain('Grande Casserole')
    expect(noms).toContain('Ceinture d’Orion')
    expect(noms).toContain('Cintre')
    expect(noms).toContain('Triangle d’été')
    // Aucun astérisme ne porte le nom d'une constellation : les deux couches ne se
    // recouvrent pas, et la Grande Casserole n'est pas la Grande Ourse.
    const constellations = new Set(PAQUET.figures.map((f) => f.nom))
    for (const nom of noms) expect(constellations.has(nom), nom).toBe(false)
    expect(RAPPEL_ASTERISME).toMatch(/n’est pas une constellation/)
    expect(RAPPEL_FIGURES).toMatch(/dessins traditionnels/)
  })

  it('porte les désignations Bayer et les métadonnées du clic sur une étoile', () => {
    const sirius = PAQUET.etoilesNommees.find((e) => e.nomPropre === 'Sirius')
    expect(sirius).toBeDefined()
    expect(sirius!.designation).toBe('α CMa')
    expect(sirius!.constellation).toBe('CMa')
    expect(sirius!.spectre).not.toBe('')
    expect(sirius!.distancePc).toBeGreaterThan(0)
  })
})

describe('précession des frontières §3.4', () => {
  it('décale les frontières de 2,11° entre B1875 et 2026', () => {
    // Le chiffre du PRD : 50,29 "/an × 151 ans.
    expect(ecartFrontieresDeg(2026).value).toBeCloseTo(2.11, 2)
    expect(ecartFrontieresDeg(2000).value).toBeCloseTo(1.75, 2)
  })

  it('ramène le sommet d’une arête de B1875 à l’époque affichée, pas ailleurs', () => {
    const arete = PAQUET.frontieres[0]!
    const brut = versVecteur(arete.ad1Deg, arete.dec1Deg)
    const j2000 = applique(matriceB1875VersJ2000(), brut)
    // Vers J2000 : environ 1,75° de déplacement, jamais zéro.
    expect(separationDeg(brut, j2000)).toBeGreaterThan(1)
    expect(separationDeg(brut, j2000)).toBeLessThan(2)

    // Puis vers 2026, par la matrice unique de l'image : le total suit la précession.
    const affiche = applique(matricePrecession(2026), j2000)
    expect(separationDeg(brut, affiche)).toBeGreaterThan(separationDeg(brut, j2000))
    expect(separationDeg(brut, affiche)).toBeLessThan(ecartFrontieresDeg(2026).value + 0.1)
  })

  it('subdivise un parallèle plutôt que de le tracer comme une corde', () => {
    const matrice = matriceB1875VersJ2000()
    const parallele = {
      type: 'PARALLELE' as const,
      ad1Deg: 0,
      dec1Deg: 30,
      ad2Deg: 60,
      dec2Deg: 30,
      codes: ['AAA', 'BBB'] as const,
    }
    expect(longueurAreteDeg(parallele)).toBeCloseTo(60 * Math.cos((30 * Math.PI) / 180), 6)
    const polyligne = polyligneFrontiere(parallele, matrice)
    expect(polyligne.length).toBeGreaterThan(
      longueurAreteDeg(parallele) / K('SUBDIVISION_FRONTIERE_DEG'),
    )
    // Le point médian de la polyligne n'est PAS le milieu de la corde : il suit le parallèle.
    const milieu = polyligne[Math.floor(polyligne.length / 2)]!
    const corde = {
      x: (polyligne[0]!.x + polyligne[polyligne.length - 1]!.x) / 2,
      y: (polyligne[0]!.y + polyligne[polyligne.length - 1]!.y) / 2,
      z: (polyligne[0]!.z + polyligne[polyligne.length - 1]!.z) / 2,
    }
    const norme = Math.hypot(corde.x, corde.y, corde.z)
    const projetee = { x: corde.x / norme, y: corde.y / norme, z: corde.z / norme }
    expect(separationDeg(milieu, projetee)).toBeGreaterThan(0.5)
  })

  it('produit une polyligne par arête, avec les deux constellations séparées', () => {
    const couche = coucheFrontieres(PAQUET)
    expect(couche.polylignes).toHaveLength(PAQUET.frontieres.length)
    expect(couche.codes[0]).toEqual(PAQUET.frontieres[0]!.codes)
    // Codes IAU à trois lettres, avec le suffixe des deux régions du Serpent — SER1 pour la
    // tête, SER2 pour la queue : le Serpent est la seule constellation en deux morceaux.
    for (const codes of couche.codes) {
      expect(codes[0]).toMatch(/^[A-Z]{3}\d?$/)
      expect(codes[1]).toMatch(/^[A-Z]{3}\d?$/)
    }
    expect(couche.codes.flat()).toContain('SER2')
  })
})

describe('couches de tracés §3.4', () => {
  it('place le label d’une constellation au barycentre de sa figure', () => {
    const orion = coucheFigures(PAQUET.figures).find((f) => f.code === 'ORI')
    expect(orion).toBeDefined()
    expect(orion!.centre).not.toBeNull()
    // Le barycentre d'Orion tombe près de la Ceinture : déclinaison proche de zéro.
    const { z } = orion!.centre!
    expect(Math.abs(Math.asin(z) * (180 / Math.PI))).toBeLessThan(15)
  })

  it('donne un centre à chaque astérisme tracé', () => {
    for (const asterisme of coucheAsterismes(PAQUET.asterismes)) {
      expect(asterisme.segments.length, asterisme.nom).toBeGreaterThan(0)
      expect(asterisme.centre, asterisme.nom).not.toBeNull()
    }
  })
})

describe('labels §3.4', () => {
  const candidat = (texte: string, categorie: CategorieLabel, x: number, y: number, priorite: number) => ({
    texte,
    categorie,
    xPx: x,
    yPx: y,
    priorite,
    largeurPx: 40,
    hauteurPx: 12,
  })

  it('suit la hiérarchie de zoom', () => {
    expect([...categoriesActives(60)]).toEqual(['CORPS', 'CONSTELLATION'])
    expect([...categoriesActives(30)]).toEqual(['CORPS', 'CONSTELLATION', 'ETOILE'])
    expect([...categoriesActives(5)]).toEqual(['CORPS', 'CONSTELLATION', 'ETOILE', 'OBJET'])
    expect([...categoriesActives(K('FOV_LABELS_CORPS_SEULS_DEG'))]).toContain('CONSTELLATION')
    expect(etoileLabellisable(3.4)).toBe(true)
    expect(etoileLabellisable(3.6)).toBe(false)
  })

  it('ne nomme que la Lune et les planètes au plus large', () => {
    const retenus = composeLabels(
      [candidat('Orion', 'CONSTELLATION', 10, 10, 0), candidat('Mars', 'CORPS', 200, 10, -Infinity)],
      K('FOV_MAX_STEREOGRAPHIQUE_DEG'),
    )
    expect(retenus.map((l) => l.texte)).toEqual(['Mars'])
  })

  it('plafonne à 25 labels, priorité aux plus brillants', () => {
    const candidats = Array.from({ length: 200 }, (_, i) =>
      candidat(`E${i}`, 'ETOILE', (i % 20) * 100, Math.floor(i / 20) * 40, i),
    )
    const retenus = composeLabels(candidats, 20)
    expect(retenus.length).toBe(K('LABELS_MAX'))
    // Les 25 premiers par priorité, dans l'ordre.
    expect(retenus.map((l) => l.texte)).toEqual(
      candidats.slice(0, K('LABELS_MAX')).map((l) => l.texte),
    )
  })

  it('n’affiche jamais deux labels qui se chevauchent', () => {
    const candidats = [
      candidat('brillante', 'ETOILE', 100, 100, 1),
      candidat('faible', 'ETOILE', 105, 102, 5),
      candidat('ailleurs', 'ETOILE', 400, 100, 9),
    ]
    const retenus = composeLabels(candidats, 20)
    expect(retenus.map((l) => l.texte)).toEqual(['brillante', 'ailleurs'])
  })

  it('révèle au survol un nom que le zoom a masqué, hors du budget de §3.4', () => {
    const retenus = composeLabels([candidat('Orion', 'CONSTELLATION', 10, 10, 0)], 60)
    const revele = labelSurvol(retenus, {
      texte: 'M42 — Grande nébuleuse d’Orion',
      xPx: 400,
      yPx: 300,
      largeurPx: 40,
      hauteurPx: 12,
    })
    // La catégorie OBJET est inactive à 60° : c'est justement ce nom-là que le survol montre.
    expect(retenus.map((l) => l.texte)).toEqual(['Orion'])
    expect(revele).toEqual({ texte: 'M42 — Grande nébuleuse d’Orion', xPx: 400, yPx: 300, largeurPx: 40, hauteurPx: 12 })
  })

  it('ne double pas un nom que la scène affiche déjà', () => {
    const retenus = composeLabels([candidat('Véga', 'ETOILE', 100, 100, 0)], 20)
    expect(labelSurvol(retenus, {
      texte: 'Véga — α Lyr',
      xPx: 100,
      yPx: 100,
      largeurPx: 40,
      hauteurPx: 12,
    })).toBeNull()
  })

  it('décale le label du survol plutôt que de recouvrir un label retenu', () => {
    const retenus = composeLabels([candidat('brillante', 'ETOILE', 100, 100, 0)], 20)
    const revele = labelSurvol(retenus, {
      texte: 'M31',
      xPx: 100,
      yPx: 100,
      largeurPx: 40,
      hauteurPx: 12,
    })
    expect(revele).not.toBeNull()
    expect(Math.abs(revele!.yPx - 100)).toBeGreaterThanOrEqual(12)
  })

  it('renonce quand tout le voisinage est occupé, plutôt que de masquer un nom retenu', () => {
    const empiles = [-2, -1, 0, 1, 2].map((k, i) =>
      candidat(`retenu${i}`, 'ETOILE', 100, 100 + k * 12, i),
    )
    const retenus = composeLabels(empiles, 20)
    expect(retenus.length).toBe(empiles.length)
    expect(labelSurvol(retenus, {
      texte: 'M31',
      xPx: 100,
      yPx: 100,
      largeurPx: 40,
      hauteurPx: 12,
    })).toBeNull()
  })

  it('écarte les catégories que le zoom n’autorise pas', () => {
    const candidats = [
      candidat('Orion', 'CONSTELLATION', 10, 10, 0),
      candidat('α Ori', 'ETOILE', 200, 10, 1),
      candidat('M42', 'OBJET', 400, 10, 4),
    ]
    expect(composeLabels(candidats, 60).map((l) => l.texte)).toEqual(['Orion'])
    expect(composeLabels(candidats, 20).map((l) => l.texte)).toEqual(['Orion', 'α Ori'])
    expect(composeLabels(candidats, 5).map((l) => l.texte)).toEqual(['Orion', 'α Ori', 'M42'])
  })
})
