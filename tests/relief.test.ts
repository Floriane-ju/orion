/**
 * §4.1 — terrain relief → horizon mask (T-0359). Synthetic terrain by function; each expectation
 * recomputed from registry formula + constants.
 */

import { describe, expect, it } from 'vitest'
import { K } from '../src/registry/constants.ts'
import { R } from '../src/registry/relief.ts'
import {
  courbesNiveau,
  creteFine,
  silhouettes,
  elevationApparenteDeg,
  pointA,
  profilRelief,
  simplifieLigne,
  type Altimetre,
} from '../src/core/relief.ts'
import { separationDeg, versVecteur, type Vec3 } from '../src/core/mat3.ts'
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

/** Formula from definition: Earth of radius R / (1 − k). */
function attendueDeg(deniveleM: number, distanceM: number): number {
  const chute = ((1 - R('COEF_REFRACTION_TERRESTRE')) * distanceM ** 2) / (2 * RAYON_TERRE_M)
  return Math.atan((deniveleM - chute) / distanceM) / RAD
}

describe('élévation apparente d’un point du relief (§4.1)', () => {
  it('abaisse un sommet de la chute due à la courbure, réfraction comprise', () => {
    const denivele = 1500
    const distance = 20_000
    expect(elevationApparenteDeg(denivele, distance)).toBeCloseTo(attendueDeg(denivele, distance), 10)
    // Without curvature same summit looks higher: correction non-zero.
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
    // Ridge starts off step grid: first sample touching it = next step, highest (closest) summit.
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
    // 10 m mound at 200 m north: below model vertical resolution.
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

describe('courbes de niveau vues depuis le site (T-0395)', () => {
  const sol = 400
  const oeil = sol + R('HAUTEUR_OEIL_M')
  /** Distance south (m) of a point at given latitude. */
  const versLeSud = (lat: number): number => (SITE.latDeg - lat) * RAD * RAYON_TERRE_M
  const denivele = R('EQUIDISTANCE_COURBES_M') * 12
  /**
   * Slope steepening southward up to §4.1 radius, flat elsewhere. Concave: constant slope seen from
   * its foot keeps near-constant apparent height, curvature hides its top — correct, shows nothing.
   */
  const versant = (s: number): number =>
    sol + denivele * Math.min(Math.max(s, 0) / dernierM, 1) ** 2
  const dernierM = R('RAYON_RELIEF_KM') * 1000

  /** Polylines `[[az, h], …]`: two lines separated by a NaN pair. */
  function polylignes(courbes: Float32Array): number[][][] {
    const lignes: number[][][] = [[]]
    for (let i = 0; i < courbes.length; i += 2) {
      if (Number.isNaN(courbes[i]!)) lignes.push([])
      else lignes[lignes.length - 1]!.push([courbes[i]!, courbes[i + 1]!])
    }
    return lignes.filter((l) => l.length > 0)
  }

  /** Segments `[az₀, h₀, az₁, h₁]` with an end inside the sector. */
  function dansLeSecteur(courbes: Float32Array, de: number, a: number): number[][] {
    const dedans = (az: number): boolean => az >= de && az <= a
    return polylignes(courbes)
      .flatMap((l) => l.slice(1).map((q, i) => [...l[i]!, ...q]))
      .filter((s) => dedans(s[0]!) || dedans(s[2]!))
  }

  it('ne trace rien sur une plaine : aucune altitude n’y est franchie', () => {
    expect(courbesNiveau(() => sol, SITE.latDeg, SITE.lonDeg)).toHaveLength(0)
  })

  it('suit le versant au sud et laisse le nord plat sans ligne', () => {
    const courbes = courbesNiveau((lat) => versant(versLeSud(lat)), SITE.latDeg, SITE.lonDeg)!
    expect(courbes.length % 2).toBe(0)
    expect(dansLeSecteur(courbes, 175, 185).length).toBeGreaterThan(0)
    expect(dansLeSecteur(courbes, 0, 10)).toHaveLength(0)
  })

  it('place chaque courbe à la hauteur apparente de son altitude', () => {
    // Due south, altitude curve L crosses azimuth 180 where slope = L.
    const courbes = courbesNiveau((lat) => versant(versLeSud(lat)), SITE.latDeg, SITE.lonDeg)!
    const niveau = sol + R('EQUIDISTANCE_COURBES_M') * 6
    const distance = dernierM * Math.sqrt((niveau - sol) / denivele)
    const attendue = attendueDeg(niveau - oeil, distance)
    const proches = dansLeSecteur(courbes, 179.5, 180.5).flatMap((s) => [s[1]!, s[3]!])
    expect(proches.some((h) => Math.abs(h - attendue) < 0.01)).toBe(true)
  })

  it('retire ce qu’un relief plus proche cache dans le même azimut', () => {
    // High wall 1.5-2.5 km south: following slope passes behind it. Wall face carries curves above
    // threshold, slope below.
    const mur = (s: number): number => (s >= 1500 && s <= 2500 ? sol + denivele * 3 : versant(s))
    const seuil = attendueDeg(R('EQUIDISTANCE_COURBES_M') - R('HAUTEUR_OEIL_M'), 2000)
    const basses = (courbes: Float32Array) =>
      dansLeSecteur(courbes, 175, 185).filter((s) => Math.min(s[1]!, s[3]!) < seuil)
    const sansMur = courbesNiveau((lat) => versant(versLeSud(lat)), SITE.latDeg, SITE.lonDeg)!
    const avecMur = courbesNiveau((lat) => mur(versLeSud(lat)), SITE.latDeg, SITE.lonDeg)!
    expect(basses(sansMur).length).toBeGreaterThan(0)
    expect(basses(avecMur)).toHaveLength(0)
  })

  it('retire ce qu’une croupe étroite cache juste derrière elle', () => {
    // T-0445 — narrow ridge between two contour-grid nodes, then gentle slope behind: its first
    // curve lies ~1 grid step behind the ridge top, under it in apparent height.
    const pas = R('PAS_RADIAL_RELIEF_M')
    const equidistance = R('EQUIDISTANCE_COURBES_M')
    const sommet = 11 * pas
    const plaine = (s: number): number => sol + Math.max(0, s - sommet) / 2
    const croupe = (s: number): number =>
      Math.abs(s - sommet) < pas / 2 ? sol + equidistance * 2.4 : plaine(s)
    // Under the curve the ridge's front face carries: what the ridge hides.
    const seuil = attendueDeg(equidistance - R('HAUTEUR_OEIL_M'), sommet)
    const basses = (courbes: Float32Array) =>
      dansLeSecteur(courbes, 175, 185).filter((s) => Math.min(s[1]!, s[3]!) < seuil)
    const sansCroupe = courbesNiveau((lat) => plaine(versLeSud(lat)), SITE.latDeg, SITE.lonDeg)!
    const avecCroupe = courbesNiveau((lat) => croupe(versLeSud(lat)), SITE.latDeg, SITE.lonDeg)!
    expect(basses(sansCroupe).length).toBeGreaterThan(0)
    expect(basses(avecCroupe)).toHaveLength(0)
  })

  it('rend null sans altitude au site', () => {
    expect(courbesNiveau(() => null, SITE.latDeg, SITE.lonDeg)).toBeNull()
  })

  it('trace aussi les courbes du terrain proche, en deçà du seuil du masque', () => {
    // Slope descending southward: first curve below site passes midway to threshold where mask
    // stops reading terrain.
    const equidistance = R('EQUIDISTANCE_COURBES_M')
    const distance = R('DISTANCE_MIN_RELIEF_M') / 2
    const pente = (s: number): number => sol - (Math.max(s, 0) * equidistance) / distance
    const courbes = courbesNiveau((lat) => pente(versLeSud(lat)), SITE.latDeg, SITE.lonDeg)!
    const attendue = attendueDeg(-equidistance - R('HAUTEUR_OEIL_M'), distance)
    const proches = dansLeSecteur(courbes, 179.5, 180.5).flatMap((s) => [s[1]!, s[3]!])
    expect(proches.some((h) => Math.abs(h - attendue) < 0.05)).toBe(true)
  })

  it('ne trace aucune courbe proche au-dessus de la crête que le sol peint', () => {
    // T-0450 — near rise south, flat beyond: its curves under the mask threshold climb higher
    // than the crest, read only from that threshold on — they hung in the sky.
    const finM = (R('DISTANCE_MIN_RELIEF_M') * 4) / 5
    const butte = (s: number): number => sol + denivele * (Math.min(Math.max(s, 0), finM) / finM)
    const altimetre: Altimetre = (lat) => butte(versLeSud(lat))
    const crete = creteFine(altimetre, SITE.latDeg, SITE.lonDeg)!
    const creteA = (az: number): number => {
      const x = (az * crete.length) / 360
      const i = Math.floor(x)
      const avant = crete[i % crete.length]!
      return avant + (crete[(i + 1) % crete.length]! - avant) * (x - i)
    }
    const auDessus = (courbes: Float32Array) =>
      polylignes(courbes)
        .flat()
        .filter(([az, h]) => az! >= 175 && az! <= 185 && h! > creteA(az!))
    expect(auDessus(courbesNiveau(altimetre, SITE.latDeg, SITE.lonDeg)!).length).toBeGreaterThan(0)
    expect(auDessus(courbesNiveau(altimetre, SITE.latDeg, SITE.lonDeg, crete)!)).toHaveLength(0)
  })

  describe('crête fine pour le dessin (T-0438)', () => {
    /** Narrow peak due south, offset ½°: falls between two whole azimuths. */
    const pic = (lat: number, lon: number): number => {
      const sud = versLeSud(lat)
      const est = (lon - SITE.lonDeg) * RAD * RAYON_TERRE_M * Math.cos(SITE.latDeg * RAD)
      const largeurM = 20
      const axe = -Math.tan(0.5 * RAD) * sud
      return sud > 5000 && sud < 5200 && Math.abs(est - axe) < largeurM ? sol + denivele : sol
    }

    it('voit un pic que le masque au degré manque', () => {
      const parDeg = 1 / R('PAS_AZIMUT_CRETE_DEG')
      const crete = creteFine(pic, SITE.latDeg, SITE.lonDeg)!
      const masque = profilRelief(pic, SITE.latDeg, SITE.lonDeg)!
      expect(crete).toHaveLength(360 * parDeg)
      expect(Math.max(...crete)).toBeGreaterThan(Math.max(...masque) + 1)
    })

    it('atteint le sommet d’une arête tombé entre deux pas radiaux', () => {
      // T-0445 — rounded ridge due south, top between two PAS_RADIAL_RELIEF_M samples: crest
      // stopped below it, contours rose into the sky above drawn sol.
      const pas = R('PAS_RADIAL_RELIEF_M')
      const sommetM = 50.5 * pas
      const demiLargeurM = 2 * pas
      const arete = (lat: number): number => {
        const x = (versLeSud(lat) - sommetM) / demiLargeurM
        return Math.abs(x) < 1 ? sol + denivele * (1 - x * x) : sol
      }
      const parDeg = 1 / R('PAS_AZIMUT_CRETE_DEG')
      const sud = creteFine(arete, SITE.latDeg, SITE.lonDeg)![180 * parDeg]!
      expect(sud).toBeCloseTo(attendueDeg(denivele - R('HAUTEUR_OEIL_M'), sommetM), 1)
    })

    it('dessine la rive d’en face sous l’horizontale, là où le masque reste à 0°', () => {
      // Plain at ground level: curvature dips it below eye horizontal.
      const plaine = (): number => sol
      const crete = creteFine(plaine, SITE.latDeg, SITE.lonDeg)!
      const masque = profilRelief(plaine, SITE.latDeg, SITE.lonDeg)!
      expect(Math.max(...crete)).toBeLessThan(0)
      expect(Math.min(...masque)).toBe(0)
    })

    it('rend null sans altitude au site', () => {
      expect(creteFine(() => null, SITE.latDeg, SITE.lonDeg)).toBeNull()
    })
  })

  describe('lignes de silhouette (T-0438)', () => {
    const butteM = R('EQUIDISTANCE_COURBES_M') * 2
    const montagneM = R('EQUIDISTANCE_COURBES_M') * 40
    /** Low close mound south, before a distant mountain overtopping it. */
    const etage = (s: number): number => {
      if (s >= 1500 && s <= 2500) return sol + butteM
      if (s > dernierM / 3) return sol + montagneM * ((s - dernierM / 3) / (dernierM * (2 / 3)))
      return sol
    }

    it('ne trace rien sur une plaine', () => {
      expect(silhouettes(() => sol, SITE.latDeg, SITE.lonDeg)).toHaveLength(0)
    })

    it('trace le bord d’une butte devant la montagne qu’elle cache', () => {
      const bords = silhouettes((lat) => etage(versLeSud(lat)), SITE.latDeg, SITE.lonDeg)!
      const auSud = dansLeSecteur(bords, 170, 190)
      expect(auSud.length).toBeGreaterThan(0)
      // Seen from below, flat-topped mound bordered by its front rim, radial-step accuracy.
      const pas = R('PAS_RADIAL_RELIEF_M')
      const haut = attendueDeg(butteM - R('HAUTEUR_OEIL_M'), 1500)
      const bas = attendueDeg(butteM - R('HAUTEUR_OEIL_M'), 1500 + pas)
      for (const s of auSud) {
        expect(s[1]!).toBeGreaterThanOrEqual(bas - 1e-3)
        expect(s[1]!).toBeLessThanOrEqual(haut + 1e-3)
      }
      // North: no mound nor mountain, nothing hides.
      expect(dansLeSecteur(bords, 0, 10)).toHaveLength(0)
    })

    it('ne reprend pas la crête de l’horizon, que le sol trace déjà', () => {
      // Slope alone hides nothing behind it: its summit = crête, not a silhouette.
      expect(silhouettes((lat) => versant(versLeSud(lat)), SITE.latDeg, SITE.lonDeg)).toHaveLength(0)
    })

    it('rend null sans altitude au site', () => {
      expect(silhouettes(() => null, SITE.latDeg, SITE.lonDeg)).toBeNull()
    })
  })

  it('enchaîne chaque courbe en une seule ligne au lieu de segments épars', () => {
    // Due south slope hides nothing itself: each level crossing it = ONE east-west line over tens
    // of degrees. Isolated segments cost one subpath each, every frame.
    const courbes = courbesNiveau((lat) => versant(versLeSud(lat)), SITE.latDeg, SITE.lonDeg)!
    const pleinSud = polylignes(courbes).filter((l) =>
      l.some(([az], i) => i > 0 && (l[i - 1]![0]! - 180) * (az! - 180) <= 0),
    )
    expect(pleinSud.length).toBeGreaterThan(0)
    expect(pleinSud.length).toBeLessThanOrEqual(denivele / R('EQUIDISTANCE_COURBES_M'))
    for (const ligne of pleinSud) {
      const azimuts = ligne.map(([az]) => az!)
      expect(Math.min(...azimuts)).toBeLessThan(165)
      expect(Math.max(...azimuts)).toBeGreaterThan(195)
    }
  })

  it('ne simplifie pas au-delà de la corde maximale', () => {
    // First level crossed >8 km: original segments there all shorter than bound, only
    // simplification could violate it.
    const courbes = courbesNiveau((lat) => versant(versLeSud(lat)), SITE.latDeg, SITE.lonDeg)!
    const cordes = polylignes(courbes).flatMap((l) =>
      l.slice(1).map((q, i) => separationDeg(versVecteur(l[i]![0]!, l[i]![1]!), versVecteur(q[0]!, q[1]!))),
    )
    // Small margin: chord bounded in double precision, points stored in single.
    expect(Math.max(...cordes)).toBeLessThanOrEqual(R('CORDE_MAX_COURBES_DEG') * 1.001)
  })

  it('porte les courbes jusqu’au masque sans toucher ses altitudes', () => {
    const profil = Array.from({ length: NB_AZIMUTS }, () => 0)
    const courbes = Float32Array.of(170, 1, 171, 1)
    const masque = masqueDuRelief({ etat: 'RELIEF', altitudesDeg: profil, solM: 0, courbesDeg: courbes })
    expect(masque.courbesDeg).toBe(courbes)
    expect(masque.altitudesDeg).toEqual(profil)
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

describe('simplification d’une courbe de niveau (T-0395)', () => {
  const tolerance = R('TOLERANCE_COURBES_DEG')
  const cordeMax = R('CORDE_MAX_COURBES_DEG')
  /** Horizon points azimuth by azimuth, optional bump in middle. */
  const ligne = (n: number, pasDeg: number, bosseDeg = 0): Vec3[] =>
    Array.from({ length: n }, (_, i) =>
      versVecteur(i * pasDeg, i === Math.floor(n / 2) ? bosseDeg : 0),
    )

  it('garde les deux bouts et retire les points alignés sur le grand cercle', () => {
    const points = ligne(21, cordeMax / 20)
    expect(simplifieLigne(points, tolerance, cordeMax)).toEqual([0, 20])
  })

  it('coupe une ligne droite plus longue que la corde maximale', () => {
    const points = ligne(101, cordeMax / 20)
    const gardes = simplifieLigne(points, tolerance, cordeMax)
    for (let i = 1; i < gardes.length; i++) {
      expect(separationDeg(points[gardes[i - 1]!]!, points[gardes[i]!]!)).toBeLessThanOrEqual(cordeMax)
    }
    expect(gardes.length).toBeLessThan(points.length / 4)
  })

  it('garde un écart plus grand que la tolérance, efface un écart plus petit', () => {
    const pas = cordeMax / 20
    expect(simplifieLigne(ligne(11, pas, tolerance * 3), tolerance, cordeMax)).toContain(5)
    expect(simplifieLigne(ligne(11, pas, tolerance / 2), tolerance, cordeMax)).toEqual([0, 10])
  })
})
