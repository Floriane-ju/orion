/**
 * T-0248 — la boucle du planétarium ne peint que ce qui a changé.
 *
 * Ce que ce fichier garde : temps figé, une image identique n'est pas repeinte ; tout ce qui
 * change l'image — un rendu de la scène, le survol, la taille du canevas, le défilement — la
 * fait repeindre ; en `MAINTENANT`, la rotation du ciel ne repeint qu'au pixel de dérive.
 */

import { describe, expect, it } from 'vitest'
import { pxParDegre, vitesseEcran } from '../src/core/curseur-temps.ts'
import { doitDessiner, type ImageLue } from '../src/ui/planetarium-boucle.ts'
import { etatScene, type VueScene } from '../src/ui/scene-etat.ts'

const VUE: VueScene = etatScene().vue

function image(
  etat: ImageLue['etat'],
  retouche: Partial<Omit<ImageLue, 'etat'>> = {},
): ImageLue {
  return {
    etat,
    survole: null,
    largeurPx: VUE.largeurPx,
    hauteurPx: VUE.hauteurPx,
    instantMs: 0,
    ...retouche,
  }
}

/** Les millisecondes qu'il faut au ciel pour dériver d'un pixel dans la vue. */
function msParPixel(vue: VueScene): number {
  return 1000 / vitesseEcran(1, pxParDegre(vue.largeurPx, vue.fovDeg)).value
}

describe('T-0248 — doitDessiner', () => {
  const fige: ImageLue['etat'] = { vue: VUE, modeTemps: 'FIGE', anime: false }

  it('peint la première image', () => {
    expect(doitDessiner(null, image(fige))).toBe(true)
  })

  it('temps figé, rien ne change : rien ne se repeint', () => {
    const peinte = image(fige)
    expect(doitDessiner(peinte, image(fige))).toBe(false)
  })

  it('repeint quand la scène a rendu, le survol ou la taille a changé', () => {
    const peinte = image(fige)
    expect(doitDessiner(peinte, image({ ...fige }))).toBe(true)
    expect(doitDessiner(peinte, image(fige, { survole: 'M31' }))).toBe(true)
    expect(doitDessiner(peinte, image(fige, { largeurPx: VUE.largeurPx + 1 }))).toBe(true)
  })

  it('T-0394 — temps figé, repeint l’instant qu’un trajet vient d’écrire', () => {
    const peinte = image(fige)
    expect(doitDessiner(peinte, image(fige, { instantMs: 1 }))).toBe(true)
  })

  it('en défilement, chaque image est neuve', () => {
    const defile: ImageLue['etat'] = { vue: VUE, modeTemps: 'DEFILEMENT', anime: true }
    expect(doitDessiner(image(defile), image(defile))).toBe(true)
  })

  it('en MAINTENANT, repeint au pixel de dérive et pas avant', () => {
    const maintenant: ImageLue['etat'] = { vue: VUE, modeTemps: 'MAINTENANT', anime: false }
    const peinte = image(maintenant)
    const pixel = msParPixel(VUE)
    expect(doitDessiner(peinte, image(maintenant, { instantMs: pixel / 2 }))).toBe(false)
    expect(doitDessiner(peinte, image(maintenant, { instantMs: pixel }))).toBe(true)
  })
})
