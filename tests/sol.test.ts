/**
 * §4.1 / §3.3 — le sol du site, opposé au projecteur.
 *
 * Aucune coordonnée n'est recopiée ici : les directions se construisent dans le repère
 * horizontal du site avec `versVecteur`, puis se transposent en J2000. Un test qui vérifierait
 * une valeur relevée vérifierait la copie, pas la règle.
 */

import { describe, expect, it } from 'vitest'
import { cielInstantane } from '../src/core/horloges.ts'
import { applique, transpose, versSpherique, versVecteur, type Vec3 } from '../src/core/mat3.ts'
import { pointEcran, projecteur, type Vue } from '../src/core/projection.ts'
import { masqueDepuisPoints, masquePlat, obstructionDeg } from '../src/core/site.ts'
import { projecteurSansSol, sousLeSol } from '../src/core/sol.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const DATE = new Date('2026-08-15T22:00:00Z')

const ciel = cielInstantane(SITE, DATE)
const versJ2000 = transpose(ciel.matrice)

/** Une direction J2000 désignée par la hauteur et l'azimut qu'elle a DEPUIS ce site. */
function vise(azimutDeg: number, hauteurDeg: number): Vec3 {
  return applique(versJ2000, versVecteur(azimutDeg, hauteurDeg))
}

const VUE: Vue = {
  mode: 'MODE_PLANETARIUM',
  fovDeg: 60,
  largeurPx: 960,
  hauteurPx: 540,
  azimutDeg: 180,
  hauteurDeg: 0,
  rotationDeg: 0,
}

describe('sol du site — §4.1', () => {
  it('sans relevé de relief, le sol est l’horizon plat', () => {
    const enterre = sousLeSol(masquePlat(), ciel.matrice)
    const zenith = vise(0, 90)
    const nadir = vise(0, -90)
    expect(enterre(zenith.x, zenith.y, zenith.z)).toBe(false)
    expect(enterre(nadir.x, nadir.y, nadir.z)).toBe(true)
    for (const azimut of [0, 90, 180, 270, 359.7]) {
      const dessus = vise(azimut, 1)
      const dessous = vise(azimut, -1)
      expect(enterre(dessus.x, dessus.y, dessus.z)).toBe(false)
      expect(enterre(dessous.x, dessous.y, dessous.z)).toBe(true)
    }
  })

  it('avec un relief relevé, le sol monte avec lui', () => {
    // Une crête à l'est, l'horizon dégagé au nord : deux azimuts relevés suffisent, les
    // intermédiaires s'interpolent (§4.1).
    const masque = masqueDepuisPoints([
      { azimutDeg: 0, altitudeDeg: 0 },
      { azimutDeg: 90, altitudeDeg: 10 },
    ])
    const enterre = sousLeSol(masque, ciel.matrice)
    const sousLaCrete = vise(90, obstructionDeg(masque, 90) / 2)
    const auDessusDeLaCrete = vise(90, obstructionDeg(masque, 90) * 2)
    const memeHauteurAuNord = vise(0, obstructionDeg(masque, 90) / 2)
    expect(enterre(sousLaCrete.x, sousLaCrete.y, sousLaCrete.z)).toBe(true)
    expect(enterre(auDessusDeLaCrete.x, auDessusDeLaCrete.y, auDessusDeLaCrete.z)).toBe(false)
    expect(enterre(memeHauteurAuNord.x, memeHauteurAuNord.y, memeHauteurAuNord.z)).toBe(false)
  })

  it('dit la même chose que la hauteur et l’azimut calculés en clair', () => {
    // Le prédicat inline les produits scalaires pour ne rien allouer par étoile (T-0065). Ce
    // test est ce qui interdit à cette optimisation de dériver de sa définition lisible.
    const masque = masqueDepuisPoints([
      { azimutDeg: 30, altitudeDeg: 4 },
      { azimutDeg: 150, altitudeDeg: 12 },
      { azimutDeg: 300, altitudeDeg: 1 },
    ])
    const enterre = sousLeSol(masque, ciel.matrice)
    for (let azimut = 0; azimut < 360; azimut += 7) {
      for (let hauteur = -20; hauteur <= 20; hauteur += 3.5) {
        const v = vise(azimut, hauteur)
        const horizontal = versSpherique(applique(ciel.matrice, v))
        const attendu =
          horizontal.latitudeDeg < obstructionDeg(masque, horizontal.longitudeDeg)
        expect(enterre(v.x, v.y, v.z)).toBe(attendu)
      }
    }
  })
})

describe('projecteur aveugle au sol — §3.3', () => {
  const base = projecteur(VUE, ciel.matrice)
  const filtre = projecteurSansSol(base, masquePlat(), ciel.matrice)

  it('projette au-dessus du sol exactement comme le projecteur qu’il décore', () => {
    const cible = vise(VUE.azimutDeg, 10)
    const attendu = pointEcran()
    const obtenu = pointEcran()
    expect(base.projetteEn(cible.x, cible.y, cible.z, attendu)).toBe(true)
    expect(filtre.projetteEn(cible.x, cible.y, cible.z, obtenu)).toBe(true)
    expect(obtenu).toEqual(attendu)
    expect(filtre.projette(cible)).toEqual(base.projette(cible))
    expect(filtre.vue).toBe(base.vue)
    expect(filtre.echelle).toBe(base.echelle)
  })

  it('rend non projetable ce qui est sous le sol', () => {
    const enterree = vise(VUE.azimutDeg, -10)
    // Elle serait dans le champ : c'est bien le sol qui l'écarte, pas le cadrage.
    expect(base.projetteEn(enterree.x, enterree.y, enterree.z, pointEcran())).toBe(true)
    expect(filtre.projetteEn(enterree.x, enterree.y, enterree.z, pointEcran())).toBe(false)
    expect(filtre.projette(enterree)).toBeNull()
  })

  it('laisse `inverse` répondre : le curseur désigne aussi le sol', () => {
    // Un point de l'écran a une direction même là où rien n'est dessiné — sans quoi le
    // pointage à la souris cesserait de savoir où il est (§3.4).
    const basX = VUE.largeurPx / 2
    const basY = VUE.hauteurPx - 1
    expect(filtre.inverse(basX, basY)).toEqual(base.inverse(basX, basY))
  })
})
