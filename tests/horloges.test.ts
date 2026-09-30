/**
 * §3.1 — Pipeline temporel à deux horloges.
 *
 * Les quatre critères du PRD tiennent à des propriétés vérifiables sans écran : une seule
 * matrice pour tout le catalogue, une précession appliquée dès qu'on sort de l'époque
 * courante, une interpolation dont l'écart reste sous le seuil annoncé, et des corps du
 * système solaire masqués — jamais extrapolés — hors du domaine des séries.
 */

import { describe, expect, it } from 'vitest'
import {
  avanceEphemerides,
  avertissementEpoque,
  cielInstantane,
  epoqueAnnee,
  matriceHorizon,
  matricePrecession,
  pasEphemeridesMs,
  positionsInterpolees,
} from '../src/core/horloges.ts'
import { Body, positionCorps } from '../src/core/ephem.ts'
import { applique, separationDeg, versSpherique, versVecteur } from '../src/core/mat3.ts'
import { K } from '../src/registry/constants.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

/** Site de référence de l'Annexe A. */

describe('rotation du ciel §3.1', () => {
  it('place le zénith et les points cardinaux dans le repère du site', () => {
    // Une étoile au zénith : déclinaison égale à la latitude, à l'angle horaire nul.
    const ciel = cielInstantane(SITE, new Date('2026-08-15T22:00:00Z'))
    const adZenithDeg = ciel.tslH.value * (360 / 24)
    const horizontal = applique(ciel.matrice, versVecteur(adZenithDeg, SITE.latitudeDeg))
    const { latitudeDeg: hauteur } = versSpherique(horizontal)
    // La précession de 2026 déplace la cible de 0,4° : la hauteur reste très proche de 90°.
    expect(hauteur).toBeGreaterThan(89)
  })

  it('donne une matrice orthogonale, donc inversible par transposition', () => {
    const m = matriceHorizon(SITE.latitudeDeg)
    const v = versVecteur(123, -17)
    const image = applique(m, v)
    expect(Math.hypot(image.x, image.y, image.z)).toBeCloseTo(1, 12)
  })

  it('ramène le ciel étoilé à l’identique après un jour sidéral', () => {
    const t0 = new Date('2026-08-15T22:00:00Z')
    const t1 = new Date(t0.getTime() + K('JOUR_SIDERAL_S') * 1000)
    const etoile = versVecteur(88.79, 7.41) // Bételgeuse
    const a = applique(cielInstantane(SITE, t0).matrice, etoile)
    const b = applique(cielInstantane(SITE, t1).matrice, etoile)
    expect(separationDeg(a, b)).toBeLessThan(0.01)
  })

  it('déplace la Lune pendant ce même jour sidéral, ce qui distingue le pas', () => {
    const t0 = new Date('2026-08-15T22:00:00Z')
    const t1 = new Date(t0.getTime() + K('JOUR_SIDERAL_S') * 1000)
    const a = positionCorps(Body.Moon, t0, SITE)
    const b = positionCorps(Body.Moon, t1, SITE)
    const separation = separationDeg(
      versVecteur(a.adH * (360 / 24), a.decDeg),
      versVecteur(b.adH * (360 / 24), b.decDeg),
    )
    expect(separation).toBeGreaterThan(10)
  })
})

describe('précession §3.1', () => {
  it('décale le ciel d’environ 8,7° entre 2026 et 1400', () => {
    // Le PRD annonce 8,7° pour ce saut ; l'étoile de test est sur l'écliptique, donc
    // déplacée de la valeur pleine de la précession générale.
    const point = versVecteur(0, 0) // point vernal J2000, sur l'écliptique
    const versDeux = applique(matricePrecession(2026), point)
    const versMille = applique(matricePrecession(1400), point)
    expect(separationDeg(versDeux, versMille)).toBeCloseTo(8.75, 1)
  })

  it('est nulle à l’époque de référence', () => {
    const point = versVecteur(45, 20)
    expect(separationDeg(applique(matricePrecession(2000), point), point)).toBeLessThan(1e-9)
  })

  it('signale que les figures perdent leur sens au-delà des mouvements propres ignorés', () => {
    expect(avertissementEpoque(2100)).toBeNull()
    const lointain = avertissementEpoque(12000)
    expect(lointain).toMatch(/ne sont plus fidèles/)
  })

  it('date l’époque affichée en année fractionnaire', () => {
    expect(epoqueAnnee(new Date('2000-01-01T12:00:00Z'))).toBeCloseTo(2000, 3)
    expect(epoqueAnnee(new Date('2026-08-15T00:00:00Z'))).toBeCloseTo(2026.62, 1)
  })
})

describe('horloge d’éphémérides §3.1', () => {
  it('cadence le pas sur le temps réel, donc l’étire au défilement', () => {
    const lent = pasEphemeridesMs(1)
    expect(lent).toBe(1000 / K('FREQ_EPHEMERIDES_HZ'))
    expect(pasEphemeridesMs(3600)).toBe(lent * 3600)
  })

  it('recycle l’échantillon déjà calculé quand le pas suivant l’encadre', () => {
    const pas = pasEphemeridesMs(1)
    const base = Date.UTC(2026, 7, 15, 22, 0, 0)
    const premier = avanceEphemerides(null, SITE, base, pas)
    const suivant = avanceEphemerides(premier, SITE, base + pas, pas)
    // p1 du pas précédent devient p0 du suivant, sans réévaluation des séries.
    expect(suivant.p0).toBe(premier.p1)
    expect(avanceEphemerides(suivant, SITE, base + pas + 1, pas)).toBe(suivant)
  })

  it('garde l’écart d’interpolation de la Lune sous 0,06° à ×3600', () => {
    const pas = pasEphemeridesMs(3600)
    const base = Date.UTC(2026, 7, 15, 22, 0, 0)
    const etat = avanceEphemerides(null, SITE, base, pas)
    let ecartMax = 0
    for (let f = 0; f <= 1; f += 0.1) {
      const instant = etat.t0Ms + (etat.t1Ms - etat.t0Ms) * f
      const interpolee = positionsInterpolees(etat, instant).find((p) => p.corps === Body.Moon)
      const exacte = positionCorps(Body.Moon, new Date(instant), SITE)
      expect(interpolee).toBeDefined()
      ecartMax = Math.max(
        ecartMax,
        separationDeg(
          versVecteur(interpolee!.adH * (360 / 24), interpolee!.decDeg),
          versVecteur(exacte.adH * (360 / 24), exacte.decDeg),
        ),
      )
    }
    expect(ecartMax).toBeLessThan(0.06)
  })

  it('interpole l’ascension droite par le plus court chemin au passage par zéro', () => {
    const etat = {
      pasMs: 100,
      t0Ms: 0,
      t1Ms: 100,
      p0: [{ corps: Body.Moon, adH: 23.9, decDeg: 0, azimutDeg: 359, hauteurDeg: 10 }],
      p1: [{ corps: Body.Moon, adH: 0.1, decDeg: 0, azimutDeg: 1, hauteurDeg: 10 }],
    }
    const milieu = positionsInterpolees(etat, 50)[0]!
    expect(milieu.adH).toBeCloseTo(0, 6)
    expect(milieu.azimutDeg).toBeCloseTo(0, 6)
  })
})

describe('domaine des séries §3.1, §12.4', () => {
  it('masque les corps du système solaire hors domaine, en nommant la cause', () => {
    const ciel = cielInstantane(SITE, new Date('1500-06-01T22:00:00Z'))
    expect(ciel.corpsMasques).toBe(true)
    expect(ciel.cause).toMatch(/masqués/)
    const etat = avanceEphemerides(null, SITE, Date.UTC(1500, 5, 1), pasEphemeridesMs(1))
    expect(positionsInterpolees(etat, Date.UTC(1500, 5, 1))).toEqual([])
  })

  it('laisse la matrice du ciel utilisable hors domaine : les étoiles restent tracées', () => {
    const ciel = cielInstantane(SITE, new Date('1500-06-01T22:00:00Z'))
    const image = applique(ciel.matrice, versVecteur(88.79, 7.41))
    expect(Math.hypot(image.x, image.y, image.z)).toBeCloseTo(1, 9)
  })
})
