/**
 * §8.4 — Cheminement d'étoiles et carte de pointage.
 *
 * Le mode est choisi par le champ, jamais par une préférence : au-delà de 8°, le cadre
 * contient toujours plusieurs étoiles brillantes et une seule étape suffit. Et l'orientation
 * est une sortie à part entière — deux pointages à deux heures ne donnent pas le même schéma.
 */

import { describe, expect, it } from 'vitest'
import { angleOrientation, cartePointage, separationEtoilesDeg } from '../src/core/pointage.ts'
import { K } from '../src/registry/constants.ts'
import type { Etoile } from '../src/data/catalog.ts'
import type { EtoileNommee } from '../src/data/constellations.ts'

const SITE_REFERENCE = { latitudeDeg: 46.391, longitudeDeg: 6.697, altitudeM: 500 }
const DATE = new Date('2026-08-14T22:30:00Z')

/** Cible arbitraire du Cygne, et un semis d'étoiles autour d'elle. */
const AD_CIBLE_H = 20.75
const DEC_CIBLE_DEG = 31

function etoile(adH: number, decDeg: number, magV: number): Etoile {
  return { adDeg: adH * 15, decDeg, magV, bv: 0 }
}

/** Deneb, Sadr, Gienah et quelques étoiles faibles, positions approchées. */
const CIEL: readonly Etoile[] = [
  etoile(20.69, 45.28, 1.25),
  etoile(20.37, 40.26, 2.23),
  etoile(20.77, 33.97, 2.46),
  etoile(20.75, 30.2, 4.2),
  etoile(20.9, 31.5, 5.9),
  etoile(20.6, 29.8, 6.3),
  etoile(20.68, 32.4, 3.2),
]

/**
 * Le paquet §3.4 ne nomme qu'une partie du semis : c'est le cas réel, et c'est ce qui permet
 * de vérifier que la ligne sans nom le dit au lieu de rester vide.
 */
function nommee(etoile: Etoile, designation: string, nomPropre: string): EtoileNommee {
  return {
    adDeg: etoile.adDeg,
    decDeg: etoile.decDeg,
    magV: etoile.magV,
    designation,
    nomPropre,
    spectre: '',
    distancePc: null,
    constellation: 'Cyg',
  }
}

const NOMMEES: readonly EtoileNommee[] = [
  nommee(CIEL[0]!, 'α Cyg', 'Deneb'),
  nommee(CIEL[2]!, 'γ Cyg', 'Sadr'),
  nommee(CIEL[6]!, '41 Cyg', ''),
]

const COMMUN = {
  site: SITE_REFERENCE,
  date: DATE,
  adCibleH: AD_CIBLE_H,
  decCibleDeg: DEC_CIBLE_DEG,
  mLimOeil: 6.05,
  etoiles: CIEL,
  nommees: NOMMEES,
}

describe('mode de pointage §8.4', () => {
  it('retient la carte directe sur le profil de référence 17,0° × 11,4°', () => {
    const carte = cartePointage({ ...COMMUN, fovHDeg: 11.38, fovLDeg: 17.02 })
    expect(carte.mode).toBe('CARTE_DIRECTE')
    expect(carte.ancrages.length).toBeGreaterThan(0)
    expect(carte.message).toMatch(/Pointage direct/)
  })

  it('liste les ancrages sous la magnitude limite du site, avec leurs décalages', () => {
    const carte = cartePointage({ ...COMMUN, fovHDeg: 11.38, fovLDeg: 17.02 })
    for (const ancrage of carte.ancrages) {
      expect(ancrage.magV).toBeLessThanOrEqual(6.05)
      expect(Math.abs(ancrage.xCadre)).toBeLessThanOrEqual(1 / 2)
      expect(Math.abs(ancrage.yCadre)).toBeLessThanOrEqual(1 / 2)
    }
    const premier = carte.ancrages[0]!
    expect(premier.deltaAdH).toBeCloseTo(AD_CIBLE_H - premier.adH, 6)
    expect(premier.deltaDecDeg).toBeCloseTo(DEC_CIBLE_DEG - premier.decDeg, 6)
    expect(premier.principal).toBe(true)
  })

  it('bascule en cheminement sous 8° de champ', () => {
    const carte = cartePointage({ ...COMMUN, fovHDeg: 2, fovLDeg: 3, fovChercheurDeg: 5 })
    expect(carte.mode).toBe('CHEMINEMENT')
  })
})

describe('ciel dégradé — Bortle 8, m_lim_oeil = 4,5 §8.4', () => {
  it('ne propose que les étoiles réellement visibles depuis ce site', () => {
    const carte = cartePointage({
      ...COMMUN,
      mLimOeil: 4.5,
      fovHDeg: 11.38,
      fovLDeg: 17.02,
    })
    for (const ancrage of carte.ancrages) expect(ancrage.magV).toBeLessThanOrEqual(4.5)
  })

  it('déclare l’absence d’ancrage au lieu de proposer une étoile invisible', () => {
    const carte = cartePointage({
      ...COMMUN,
      mLimOeil: 0.5,
      fovHDeg: 11.38,
      fovLDeg: 17.02,
    })
    expect(carte.ancrages).toStrictEqual([])
    expect(carte.cause).toMatch(/Aucune étoile visible à l’œil/)
    expect(carte.contraintesARelacher?.length).toBeGreaterThan(0)
  })
})

describe('cheminement §8.4', () => {
  it('trouve un itinéraire d’au plus 5 sauts depuis une étoile de magnitude ≤ 3,5', () => {
    const carte = cartePointage({ ...COMMUN, fovHDeg: 2, fovLDeg: 3, fovChercheurDeg: 6 })
    expect(carte.mode).toBe('CHEMINEMENT')
    expect(carte.sauts.length).toBeGreaterThan(0)
    expect(carte.sauts.length).toBeLessThanOrEqual(5)
    expect(carte.sauts[0]!.magV).toBeLessThanOrEqual(3.5)
    // Recouvrement garanti : chaque saut reste sous 0,7 × le champ de chercheur.
    for (const saut of carte.sauts) expect(saut.distanceDeg).toBeLessThanOrEqual(0.7 * 6)
  })

  it('propose la contrainte à relâcher plutôt qu’un itinéraire inventé', () => {
    const carte = cartePointage({
      ...COMMUN,
      fovHDeg: 2,
      fovLDeg: 3,
      // Chercheur minuscule : aucun saut n'est possible sous la contrainte déclarée.
      fovChercheurDeg: 0.2,
    })
    expect(carte.sauts).toStrictEqual([])
    expect(carte.cause).toMatch(/Aucun chemin/)
    expect(carte.contraintesARelacher?.length).toBeGreaterThan(0)
  })
})

/**
 * T-0287 — LE SCHÉMA TOURNE POUR DE BON.
 *
 * Le message annonçait « Schéma tourné de −59° » sur un dessin dont rien ne bougeait. Ce qui
 * se vérifie ici n'est pas une position attendue — elle serait une éphéméride recopiée — mais
 * la PROPRIÉTÉ : entre deux heures, les positions rendues se déduisent l'une de l'autre par
 * une rotation, et cette rotation vaut l'écart des angles parallactiques.
 */
describe('T-0287 — le schéma rendu est orienté zénith en haut §8.4', () => {
  const CADRE = { fovHDeg: 11.38, fovLDeg: 17.02 }
  const TARD = new Date(DATE.getTime() + 5 * 3600 * 1000)

  it('tourne les ancrages de l’écart exact des angles parallactiques', () => {
    const tot = cartePointage({ ...COMMUN, ...CADRE })
    const tard = cartePointage({ ...COMMUN, ...CADRE, date: TARD })
    const ecart =
      (tard.angleOrientationDeg.value - tot.angleOrientationDeg.value) * (Math.PI / 180)
    expect(Math.abs(ecart)).toBeGreaterThan(0)

    // Rotation horaire de `ecart` dans un repère `y` vers le haut.
    for (const [i, a] of tot.ancrages.entries()) {
      const b = tard.ancrages[i]!
      expect(b.adH).toBe(a.adH)
      expect(b.xDisque).toBeCloseTo(a.xDisque * Math.cos(ecart) + a.yDisque * Math.sin(ecart), 9)
      expect(b.yDisque).toBeCloseTo(-a.xDisque * Math.sin(ecart) + a.yDisque * Math.cos(ecart), 9)
    }
  })

  it('amène le zénith en haut : un ancrage au zénith de la cible s’y trouve', () => {
    const carte = cartePointage({ ...COMMUN, ...CADRE })
    const q = carte.angleOrientationDeg.value * (Math.PI / 180)
    // Le zénith est à l'angle de position `q`, compté du nord vers l'est : ses composantes
    // valent donc `sin q` vers l'est et `cos q` vers le nord.
    // Le quart du plus petit côté garde l'étoile dans le cadre quel que soit `q`.
    const rayon = Math.min(CADRE.fovLDeg, CADRE.fovHDeg) / 4
    const estDeg = Math.sin(q) * rayon
    const nordDeg = Math.cos(q) * rayon
    const versZenith = cartePointage({
      ...COMMUN,
      ...CADRE,
      etoiles: [
        etoile(
          AD_CIBLE_H + estDeg / (15 * Math.cos((DEC_CIBLE_DEG * Math.PI) / 180)),
          DEC_CIBLE_DEG + nordDeg,
          2,
        ),
      ],
      nommees: [],
    })
    const ancrage = versZenith.ancrages[0]
    expect(ancrage, 'l’étoile du zénith doit tomber dans le cadre').toBeDefined()
    expect(ancrage!.xDisque).toBeCloseTo(0, 9)
    expect(ancrage!.yDisque).toBeGreaterThan(0)
  })

  it('pose le nord au bord du disque, à l’angle parallactique du zénith', () => {
    const carte = cartePointage({ ...COMMUN, ...CADRE })
    const q = carte.angleOrientationDeg.value * (Math.PI / 180)
    expect(Math.hypot(carte.xNord, carte.yNord)).toBeCloseTo(1 / 2, 9)
    expect(carte.xNord).toBeCloseTo(Math.sin(q) / 2, 9)
    expect(carte.yNord).toBeCloseTo(Math.cos(q) / 2, 9)
  })

  it('garde tout ancrage du cadre dans le disque, quelle que soit la rotation', () => {
    // Le rayon est la demi-diagonale : un ancrage de coin tombe au bord, jamais au-delà.
    for (const heures of [0, 2, 5, 9]) {
      const carte = cartePointage({
        ...COMMUN,
        ...CADRE,
        date: new Date(DATE.getTime() + heures * 3600 * 1000),
      })
      for (const a of carte.ancrages) {
        expect(Math.hypot(a.xDisque, a.yDisque), `${heures} h`).toBeLessThanOrEqual(1 / 2)
      }
    }
  })

  it('dit ce que le schéma montre, et plus qu’il ne tourne sans tourner', () => {
    const carte = cartePointage({ ...COMMUN, ...CADRE })
    expect(carte.message).not.toMatch(/Schéma tourné/)
    expect(carte.message).toMatch(/zénith en haut/)
    expect(carte.message).toContain(
      `${Math.abs(carte.angleOrientationDeg.value).toFixed(0)}° avec la verticale`,
    )
  })
})

/**
 * T-0287 — « depuis une étoile de magnitude 3,4 » ne dit pas LAQUELLE. Le catalogue binaire
 * de §12.2 ne porte pas de nom ; le paquet §3.4 en porte un pour cinq cent quarante-six
 * étoiles, et c'est de là que vient celui-ci.
 */
describe('T-0287 — les repères portent un nom §8.4', () => {
  const CADRE = { fovHDeg: 11.38, fovLDeg: 17.02 }

  it('nomme l’ancrage quand le paquet §3.4 le nomme, et le dit quand il ne le nomme pas', () => {
    const carte = cartePointage({ ...COMMUN, ...CADRE })
    const nommes = carte.ancrages.filter((a) => a.nom !== '')
    expect(nommes.length).toBeGreaterThan(0)
    for (const a of carte.ancrages) {
      const attendu = NOMMEES.find((n) => n.decDeg === a.decDeg)
      expect(a.nom, `${a.magV}`).toBe(
        attendu === undefined
          ? ''
          : attendu.nomPropre === ''
            ? attendu.designation
            : `${attendu.nomPropre} — ${attendu.designation}`,
      )
    }
  })

  it('n’apparie pas une étoile voisine : l’écart admis reste celui du registre', () => {
    const tolerance = K('TOLERANCE_APPARIEMENT_ETOILE_DEG')
    const decale = CIEL.map((e) => ({ ...e, decDeg: e.decDeg + 10 * tolerance }))
    const carte = cartePointage({ ...COMMUN, ...CADRE, etoiles: decale })
    for (const a of carte.ancrages) expect(a.nom).toBe('')
  })

  it('nomme l’étoile de départ du cheminement dans le message', () => {
    const carte = cartePointage({ ...COMMUN, fovHDeg: 2, fovLDeg: 3, fovChercheurDeg: 6 })
    const depart = carte.sauts[0]!
    expect(depart.nom).not.toBe('')
    expect(carte.message).toContain(depart.nom)
  })
})

describe('orientation du champ §8.4', () => {
  it('change entre deux heures de pointage : le schéma n’est jamais figé', () => {
    const tot = angleOrientation(SITE_REFERENCE, DATE, 2.5, 60)
    const tard = angleOrientation(
      SITE_REFERENCE,
      new Date(DATE.getTime() + 3 * 3600 * 1000),
      2.5,
      60,
    )
    expect(Math.abs(tard.value - tot.value)).toBeGreaterThan(1)
    expect(tot.formula.section).toBe('8.4')
    expect(tot.note).toMatch(/Le ciel tourne/)
  })
})

describe('séparation angulaire', () => {
  it('est nulle sur soi-même et symétrique', () => {
    // L'arc-cosinus perd de la précision près de zéro : l'écart résiduel est de l'ordre de
    // la milliseconde d'arc, sans effet à l'échelle d'un cadre de pointage.
    expect(separationEtoilesDeg(5, 10, 5, 10)).toBeCloseTo(0, 5)
    expect(separationEtoilesDeg(5, 10, 6, 20)).toBeCloseTo(
      separationEtoilesDeg(6, 20, 5, 10),
      9,
    )
  })
})
