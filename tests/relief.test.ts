/**
 * §4.1 — le relief du terrain converti en masque d'horizon (T-0359).
 *
 * Aucun relief réel n'est recopié : le terrain est synthétique, décrit par une fonction, et
 * chaque attendu se recalcule depuis la formule et les constantes du registre.
 */

import { describe, expect, it } from 'vitest'
import { K } from '../src/registry/constants.ts'
import { R } from '../src/registry/relief.ts'
import {
  elevationApparenteDeg,
  pointA,
  profilRelief,
  type Altimetre,
} from '../src/core/relief.ts'
import {
  masqueDepuisRelief,
  NB_AZIMUTS,
  obstructionDeg,
} from '../src/core/site.ts'
import { SITE_REFERENCE } from './fixtures.ts'
import { masqueDuRelief } from '../src/ui/relief-site.ts'

const RAD = Math.PI / 180
const RAYON_TERRE_M = K('RAYON_TERRE_KM') * 1000
const SITE = { latDeg: SITE_REFERENCE.latitudeDeg, lonDeg: SITE_REFERENCE.longitudeDeg }

/** La formule, réécrite ici depuis sa définition : une Terre de rayon R / (1 − k). */
function attendueDeg(deniveleM: number, distanceM: number): number {
  const chute = ((1 - R('COEF_REFRACTION_TERRESTRE')) * distanceM ** 2) / (2 * RAYON_TERRE_M)
  return Math.atan((deniveleM - chute) / distanceM) / RAD
}

describe('élévation apparente d’un point du relief (§4.1)', () => {
  it('abaisse un sommet de la chute due à la courbure, réfraction comprise', () => {
    const denivele = 1500
    const distance = 20_000
    expect(elevationApparenteDeg(denivele, distance)).toBeCloseTo(attendueDeg(denivele, distance), 10)
    // Sans courbure, le même sommet paraîtrait plus haut : la correction n'est pas nulle.
    expect(elevationApparenteDeg(denivele, distance)).toBeLessThan(
      Math.atan(denivele / distance) / RAD,
    )
  })

  it('place sous l’horizon un point au niveau de l’œil, d’autant plus bas qu’il est loin', () => {
    expect(elevationApparenteDeg(0, 10_000)).toBeLessThan(0)
    expect(elevationApparenteDeg(0, 30_000)).toBeLessThan(elevationApparenteDeg(0, 10_000))
  })

  it('courbe moins la Terre que sans réfraction : le rayon effectif est R / (1 − k)', () => {
    const distance = 30_000
    const sansRefraction = Math.atan(-(distance ** 2) / (2 * RAYON_TERRE_M) / distance) / RAD
    expect(elevationApparenteDeg(0, distance)).toBeGreaterThan(sansRefraction)
  })
})

describe('point à distance et azimut donnés', () => {
  it('suit le méridien vers le sud à l’azimut 180', () => {
    const distance = 10_000
    const p = pointA(SITE.latDeg, SITE.lonDeg, 180, distance)
    expect(p.lonDeg).toBeCloseTo(SITE.lonDeg, 9)
    expect(p.latDeg).toBeCloseTo(SITE.latDeg - distance / RAYON_TERRE_M / RAD, 9)
  })
})

describe('profil de relief sur 360 azimuts (§4.1)', () => {
  const plaine = (altitude: number): Altimetre => () => altitude

  it('donne un horizon nul sur une plaine : la courbure ne creuse pas le masque', () => {
    const profil = profilRelief(plaine(400), SITE.latDeg, SITE.lonDeg)
    expect(profil).not.toBeNull()
    expect(profil).toHaveLength(NB_AZIMUTS)
    expect(profil!.every((a) => a === 0)).toBe(true)
  })

  it('relève une crête au sud à l’élévation que la formule donne au premier pas qui l’atteint', () => {
    const sol = 400
    const crete = 1600
    // La crête commence à une distance qui ne tombe pas sur un pas : le premier échantillon
    // qui la touche est le pas suivant, et c'est le plus haut (le plus proche) des sommets.
    const debutM = 5_050
    const latCrete = SITE.latDeg - debutM / RAYON_TERRE_M / RAD
    const terrain: Altimetre = (lat) => (lat <= latCrete ? crete : sol)

    const profil = profilRelief(terrain, SITE.latDeg, SITE.lonDeg)!
    const pas = R('PAS_RADIAL_RELIEF_M')
    const premierPas = Math.ceil(debutM / pas) * pas
    const denivele = crete - (sol + R('HAUTEUR_OEIL_M'))
    expect(profil[180]).toBeCloseTo(attendueDeg(denivele, premierPas), 6)
    expect(profil[0]).toBe(0)
  })

  it('ne lit pas le champ proche, où le bruit du modèle inventerait un horizon', () => {
    // Une butte de 10 m à 200 m au nord : sous la résolution verticale du modèle.
    const latButte = SITE.latDeg + R('DISTANCE_MIN_RELIEF_M') / 2 / RAYON_TERRE_M / RAD
    const terrain: Altimetre = (lat) => (lat >= latButte && lat < latButte + 1e-4 ? 410 : 400)
    expect(profilRelief(terrain, SITE.latDeg, SITE.lonDeg)![0]).toBe(0)
  })

  it('ignore ce qui est au-delà du rayon de §4.1', () => {
    const rayonM = R('RAYON_RELIEF_KM') * 1000
    const latLointaine = SITE.latDeg - (rayonM + 2 * R('PAS_RADIAL_RELIEF_M')) / RAYON_TERRE_M / RAD
    const terrain: Altimetre = (lat) => (lat <= latLointaine ? 4000 : 0)
    expect(profilRelief(terrain, SITE.latDeg, SITE.lonDeg)![180]).toBe(0)
  })

  it('rend null sans altitude au site : le masque plat s’appliquera', () => {
    expect(profilRelief(() => null, SITE.latDeg, SITE.lonDeg)).toBeNull()
  })

  it('produit un profil que masqueDepuisRelief accepte, sans marque [HYP]', () => {
    const profil = profilRelief(plaine(0), SITE.latDeg, SITE.lonDeg)!
    const masque = masqueDepuisRelief(profil)
    expect(masque.estHypothese).toBe(false)
    expect(masque.flags ?? []).not.toContain('HYP')
  })
})

describe('obstruction entre deux azimuts entiers (T-0359)', () => {
  const masque = masqueDepuisRelief(
    Array.from({ length: NB_AZIMUTS }, (_, az) => (az === 10 ? 8 : az === 11 ? 12 : 0)),
  )

  it('se relie linéairement d’un degré au suivant : pas de marche à l’écran', () => {
    expect(obstructionDeg(masque, 10)).toBe(8)
    expect(obstructionDeg(masque, 10.25)).toBeCloseTo(9, 10)
    expect(obstructionDeg(masque, 10.75)).toBeCloseTo(11, 10)
  })

  it('se referme entre 359° et 0°', () => {
    const tour = masqueDepuisRelief(
      Array.from({ length: NB_AZIMUTS }, (_, az) => (az === 359 ? 4 : az === 0 ? 6 : 0)),
    )
    expect(obstructionDeg(tour, 359.5)).toBeCloseTo(5, 10)
    expect(obstructionDeg(tour, -0.5)).toBeCloseTo(5, 10)
  })
})


describe('avertissement d’horizon plat dans la carte Site (T-0368)', () => {
  it('ne dit rien pendant le premier chargement du relief', () => {
    const masque = masqueDuRelief(null)
    expect(masque.estHypothese).toBe(true)
    expect(masque.note).toBeUndefined()
  })

  it('nomme la cause quand le relief est indisponible', () => {
    const masque = masqueDuRelief({ etat: 'INDISPONIBLE', cause: 'Service muet.' })
    expect(masque.estHypothese).toBe(true)
    expect(masque.note).toMatch(/^Service muet\. Horizon supposé plat\.$/)
  })
})
