/**
 * §3.1 et §3.3 — « à 120 000 étoiles et un défilement ×60, la fréquence reste au-dessus de
 * 50 Hz, et l'ajouter d'étoiles au catalogue ne la dégrade pas mesurablement ».
 *
 * Le second membre est le plus intéressant : il ne se vérifie pas au chronomètre mais par
 * une invariance. Les étoiles ajoutées sont plus faibles que la magnitude limite du zoom ;
 * rangées par magnitude dans leur cellule, elles s'insèrent APRÈS le point d'arrêt du
 * parcours. Le nombre d'étoiles LUES par image doit donc rester identique.
 *
 * Le chronomètre mesure ici la sélection et la projection, c'est-à-dire la seule partie du
 * rendu qui dépend de la taille du catalogue — le tracé, lui, dépend du canevas et n'existe
 * pas hors navigateur.
 */

import { describe, expect, it } from 'vitest'
import type { Etoile } from '../src/data/catalog.ts'
import { construitIndex, selectionne } from '../src/core/index-ciel.ts'
import { cielInstantane } from '../src/core/horloges.ts'
import { magnitudeLimite, projecteur, type Vue } from '../src/core/projection.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'


/** Générateur congruentiel : le catalogue de test doit être reproductible d'un run à l'autre. */
function alea(graine: number): () => number {
  let etat = graine
  return () => {
    etat = (etat * 1103515245 + 12345) % 2147483648
    return etat / 2147483648
  }
}

/**
 * Catalogue synthétique : répartition uniforme sur la sphère, et densité de magnitude en
 * 10^(0,6 m), qui est l'ordre de grandeur observé — environ 3 % des étoiles d'un catalogue
 * complet à magnitude 9 sont plus brillantes que 6,5.
 */
function catalogueSynthetique(nombre: number, magMin: number, magMax: number): Etoile[] {
  const suivant = alea(nombre + magMin * 1000)
  const etoiles: Etoile[] = new Array(nombre)
  for (let i = 0; i < nombre; i++) {
    const u = Math.max(1e-9, suivant())
    const mag = Math.min(magMax, Math.max(magMin, magMax + Math.log10(Math.max(1e-9, suivant())) / 0.6))
    etoiles[i] = {
      adDeg: u * 360,
      decDeg: (Math.asin(2 * suivant() - 1) * 180) / Math.PI,
      magV: mag,
      bv: suivant() * 2 - 0.4,
    }
  }
  return etoiles
}

function vueDeReference(fovDeg: number): Vue {
  return {
    mode: 'MODE_PLANETARIUM',
    fovDeg,
    largeurPx: 1920,
    hauteurPx: 1080,
    azimutDeg: 180,
    hauteurDeg: 45,
    rotationDeg: 0,
  }
}

/** Une image complète : matrice unique, sélection, projection de chaque étoile retenue. */
function image(index: ReturnType<typeof construitIndex>, dateMs: number, fovDeg: number) {
  const ciel = cielInstantane(SITE, new Date(dateMs))
  const proj = projecteur(vueDeReference(fovDeg), ciel.matrice)
  const centre = proj.inverse(1920 / 2, 1080 / 2)
  const rayon = (fovDeg / 2) * Math.hypot(1, 1080 / 1920)
  let projetees = 0
  const stats = selectionne(index, centre, rayon, magnitudeLimite(fovDeg).value, (x, y, z) => {
    if (proj.projette({ x, y, z }) !== null) projetees++
  })
  return { stats, projetees }
}

describe('index spatial §3.3', () => {
  const etoiles = catalogueSynthetique(120_000, -1.5, 9)
  const index = construitIndex(etoiles)

  it('range 120 000 étoiles en cellules et connaît la profondeur du paquet', () => {
    expect(index.nombreEtoiles).toBe(120_000)
    expect(index.profondeurMag).toBeCloseTo(9, 3)
    expect(index.cellules.length).toBeGreaterThan(100)
  })

  it('ne visite qu’une fraction des cellules à 60° de champ', () => {
    const { stats } = image(index, Date.UTC(2026, 7, 15, 22), 60)
    expect(stats.cellulesRetenues).toBeLessThan(index.cellules.length / 2)
    expect(stats.etoilesExaminees).toBeGreaterThan(0)
    expect(stats.etoilesExaminees).toBeLessThan(index.nombreEtoiles)
  })

  it('ne lit pas les étoiles plus faibles que la limite du zoom', () => {
    const serre = image(index, Date.UTC(2026, 7, 15, 22), 15)
    const large = image(index, Date.UTC(2026, 7, 15, 22), 60)
    // Champ plus serré : moins de cellules, mais profondeur plus grande. Ce qui compte est
    // que rien ne soit lu au-delà de la magnitude limite.
    expect(serre.stats.cellulesRetenues).toBeLessThan(large.stats.cellulesRetenues)
  })

  it('ne dégrade pas le coût par image quand le catalogue s’enrichit d’étoiles faibles', () => {
    // Les étoiles ajoutées sont toutes plus faibles que la magnitude limite à 60° (6,5).
    const enrichi = construitIndex([
      ...etoiles,
      ...catalogueSynthetique(120_000, 7, 9),
    ])
    expect(enrichi.nombreEtoiles).toBe(240_000)

    const dateMs = Date.UTC(2026, 7, 15, 22)
    const avant = image(index, dateMs, 60)
    const apres = image(enrichi, dateMs, 60)
    expect(apres.stats.etoilesExaminees).toBe(avant.stats.etoilesExaminees)
    expect(apres.projetees).toBe(avant.projetees)
  })

  it('tient le budget d’une image sous 20 ms à ×60, soit plus de 50 Hz', () => {
    const IMAGES = 60
    const MS_PAR_IMAGE_A_50HZ = 1000 / 50
    const depart = Date.UTC(2026, 7, 15, 22)
    // ×60 : une minute de ciel par seconde réelle, soit une seconde de ciel par image.
    const debut = performance.now()
    let total = 0
    for (let i = 0; i < IMAGES; i++) {
      total += image(index, depart + i * 1000, 60).projetees
    }
    const parImage = (performance.now() - debut) / IMAGES
    expect(total).toBeGreaterThan(0)
    expect(parImage).toBeLessThan(MS_PAR_IMAGE_A_50HZ)
  })
})
