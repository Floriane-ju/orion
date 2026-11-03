/**
 * §9.3 — filé d'étoiles preview. Checks what PRD says is missed elsewhere: pole in place
 * off-frame, arcs ≠ concentric circles (rectilinear), length varies with declination,
 * trailed star dimmer per pixel than point star.
 */

import { describe, expect, it } from 'vitest'
import {
  arcEtoile,
  diagnosticFile,
  poseParPixelS,
  longueurArcDeg,
  positionPole,
} from '../src/core/file-etoiles.ts'
import { axePoleDeDate, cielInstantane, epoqueAnnee } from '../src/core/horloges.ts'
import type { Site } from '../src/core/ephem.ts'
import {
  applique,
  rotationAutourDe,
  separationDeg,
  versVecteur,
  type Vec3,
} from '../src/core/mat3.ts'
import {
  porteeUtilePx,
  projecteur,
  type ModeProjection,
  type PointEcran,
  type Vue,
} from '../src/core/projection.ts'
import { K } from '../src/registry/constants.ts'

const SITE: Site = { latitudeDeg: 46.4, longitudeDeg: 6.697, altitudeM: 500 }
const DATE = new Date('2026-08-15T22:00:00Z')
const LARGEUR = 1200
const HAUTEUR = 800

function vue(options: {
  mode?: ModeProjection
  azimutDeg: number
  hauteurDeg: number
  fovDeg?: number
}): Vue {
  return {
    mode: options.mode ?? 'MODE_CADRE',
    fovDeg: options.fovDeg ?? 100,
    largeurPx: LARGEUR,
    hauteurPx: HAUTEUR,
    azimutDeg: options.azimutDeg,
    hauteurDeg: options.hauteurDeg,
    rotationDeg: 0,
  }
}

function proj(options: Parameters<typeof vue>[0]) {
  return projecteur(vue(options), cielInstantane(SITE, DATE).matrice)
}

/** Sky rotates around pole OF EPOCH (0,5° from J2000 pole in 2026). */
const AXE_POLE = axePoleDeDate(epoqueAnnee(DATE))

describe('§9.3 — centre de rotation', () => {
  it('rend le pôle dans le cadre à la hauteur de la latitude, azimut nord vrai', () => {
    // Frame centred on north celestial pole: azimuth 0, elevation = latitude.
    const pole = positionPole(
      proj({ azimutDeg: 0, hauteurDeg: SITE.latitudeDeg }),
      SITE.latitudeDeg,
      AXE_POLE,
    )
    expect(pole.dansCadre).toBe(true)
    expect(pole.altitudeDeg).toBeCloseTo(46.4, 6)
    expect(pole.azimutDeg).toBe(0)
    expect(pole.xPx).toBeCloseTo(LARGEUR / 2, 0)
    expect(pole.yPx).toBeCloseTo(HAUTEUR / 2, 0)
  })

  it('ne recentre pas le pôle quand il est hors du cadre', () => {
    const pole = positionPole(proj({ azimutDeg: 180, hauteurDeg: 30 }), SITE.latitudeDeg, AXE_POLE)
    expect(pole.dansCadre).toBe(false)
    // Projected point stays where projection puts it, even outside canvas.
    expect(pole.xPx === null || pole.xPx < 0 || pole.xPx > LARGEUR).toBe(true)
  })

  it('place le pôle sud sous l’horizon austral pour un site de l’hémisphère sud', () => {
    const pole = positionPole(proj({ azimutDeg: 180, hauteurDeg: 30 }), -33.9, AXE_POLE)
    expect(pole.azimutDeg).toBe(180)
    expect(pole.altitudeDeg).toBeCloseTo(33.9, 6)
  })
})

describe('§9.3 — longueur des arcs', () => {
  it('donne 5,01° en 20 min et 15,04° en 1 h à l’équateur céleste', () => {
    expect(longueurArcDeg(20, 0).value).toBeCloseTo(5.01, 2)
    expect(longueurArcDeg(60, 0).value).toBeCloseTo(15.04, 2)
    expect(longueurArcDeg(120, 0).value).toBeCloseTo(30.08, 2)
  })

  it('varie avec la déclinaison dans un même cadre', () => {
    expect(longueurArcDeg(60, -25).value).toBeCloseTo(13.63, 2)
    expect(longueurArcDeg(60, 60).value).toBeCloseTo(7.52, 2)
  })

  it('signale des traînées courtes sous la part du cadre du registre, pas au-delà', () => {
    const diagnostic = diagnosticFile({
      projecteur: proj({ azimutDeg: 180, hauteurDeg: 30 }),
      latitudeDeg: SITE.latitudeDeg,
      axePoleNord: AXE_POLE,
      dureeMin: 20,
      decMinAbsDeg: 0,
      decMaxAbsDeg: 60,
      hauteurCadreDeg: 100.2,
    })
    expect(diagnostic.longueurArcMaxDeg.value).toBeCloseTo(5.01, 2)
    // 5 % of frame height: stretched stars, not a filé.
    expect(diagnostic.fractionHauteurCadre).toBeCloseTo(0.05, 2)
    expect(diagnostic.messages.join(' ')).toMatch(/Traînées courtes/)
    expect(diagnostic.messages.join(' ')).not.toMatch(/Comptez/)

    // Long enough to cover frame share: no warning.
    const dureeLisibleMin =
      (K('FRACTION_CADRE_FILE_LISIBLE') * 100.2 * 60) / K('ROTATION_CIEL_DEG_H')
    const lisible = diagnosticFile({
      projecteur: proj({ azimutDeg: 180, hauteurDeg: 30 }),
      latitudeDeg: SITE.latitudeDeg,
      axePoleNord: AXE_POLE,
      dureeMin: dureeLisibleMin,
      decMinAbsDeg: 0,
      decMaxAbsDeg: 60,
      hauteurCadreDeg: 100.2,
    })
    expect(lisible.messages).toEqual([])
  })
})

describe('§9.3 — géométrie des arcs', () => {
  const etoile = versVecteur(60, 20)

  it('trace une polyligne échantillonnée au pas d’angle horaire du registre', () => {
    const arc = arcEtoile(proj({ azimutDeg: 90, hauteurDeg: 40 }), etoile, 60, AXE_POLE)
    const points = arc.segments.flat().length
    const attendu = Math.ceil(
      (K('ROTATION_CIEL_DEG_H') * 1) / K('PAS_ANGLE_HORAIRE_FILE_DEG'),
    )
    expect(points).toBeGreaterThan(attendu / 2)
    expect(arc.longueurPx).toBeGreaterThan(0)
  })

  it('n’est PAS un cercle concentrique dès que le pôle sort du centre de l’image', () => {
    const dispersion = (mode: ModeProjection, azimutDeg: number, hauteurDeg: number): number => {
      const projecteurVue = proj({ mode, azimutDeg, hauteurDeg, fovDeg: 120 })
      const pole = positionPole(projecteurVue, SITE.latitudeDeg, AXE_POLE)
      const arc = arcEtoile(projecteurVue, versVecteur(0, 60), 240, AXE_POLE)
      const rayons = arc.segments
        .flat()
        .map((p) => Math.hypot(p.xPx - pole.xPx!, p.yPx - pole.yPx!))
      const moyenne = rayons.reduce((s, v) => s + v, 0) / rayons.length
      return Math.max(...rayons.map((v) => Math.abs(v - moyenne))) / moyenne
    }

    // View centred ON pole: radial projection, arc = exact circle.
    expect(dispersion('MODE_FISHEYE', 0, SITE.latitudeDeg)).toBeLessThan(0.001)
    expect(dispersion('MODE_CADRE', 0, SITE.latitudeDeg)).toBeLessThan(0.001)

    // Off-centre pole, real cadrage: declination circle = conic, apparent radius varies
    // by several %; concentric circles would be wrong.
    expect(dispersion('MODE_CADRE', 20, 55)).toBeGreaterThan(0.02)
  })

  it('tronque les arcs au bord du cadre', () => {
    // 4 h: star crosses field and leaves it.
    const arc = arcEtoile(proj({ azimutDeg: 180, hauteurDeg: 30, fovDeg: 40 }), etoile, 240, AXE_POLE)
    expect(arc.tronque).toBe(true)
  })

  it('suit le sens de rotation du ciel : les étoiles dérivent vers l’ouest', () => {
    // Frame facing south: sky moves east → west, so left → right.
    const projecteurVue = proj({ azimutDeg: 180, hauteurDeg: 40, fovDeg: 60 })
    const centre = projecteurVue.inverse(LARGEUR / 2, HAUTEUR / 2)
    const arc = arcEtoile(projecteurVue, centre, 60, AXE_POLE)
    const points = arc.segments.flat()
    expect(points[points.length - 1]!.xPx).toBeGreaterThan(points[0]!.xPx)
  })
})

describe('§9.3 — brillance de la trace', () => {
  // Annexe A samplings: wide-angle (10 mm), telephoto (120 mm).
  const ECH_10MM = 105.6
  const ECH_120MM = 8.8

  it('compte la pose vue par un pixel du capteur, pas par un pixel d’écran', () => {
    // 105,6 "/px at 15,041 "/s: 7 s per pixel at celestial equator.
    expect(poseParPixelS(7200, ECH_10MM, 0)).toBeCloseTo(ECH_10MM / K('ROTATION_CIEL_DEG_H'), 3)
    // Independent of filé duration: longer sequence lengthens trace, doesn't brighten it.
    expect(poseParPixelS(28800, ECH_10MM, 0)).toBeCloseTo(poseParPixelS(7200, ECH_10MM, 0), 6)
    // Longer focale spreads same flux over more pixels → trace fades.
    expect(poseParPixelS(7200, ECH_120MM, 0)).toBeLessThan(poseParPixelS(7200, ECH_10MM, 0))
    // Near pole, star drifts slower → pixel receives it longer.
    expect(poseParPixelS(7200, ECH_10MM, 60)).toBeCloseTo(poseParPixelS(7200, ECH_10MM, 0) * 2, 3)
  })

  it('ne dépasse jamais la durée réellement posée', () => {
    // 1 s pose: pixel can't have seen star longer.
    expect(poseParPixelS(1, ECH_10MM, 0)).toBe(1)
  })
})

/** Exact star position after `angleDeg` of elapsed hour angle. */
function apres(etoile: Vec3, angleDeg: number): Vec3 {
  return applique(rotationAutourDe(AXE_POLE, -angleDeg), etoile)
}

/** Distance point → segment [a, b], px. */
function distanceAuSegment(p: PointEcran, a: PointEcran, b: PointEcran): number {
  const dx = b.xPx - a.xPx
  const dy = b.yPx - a.yPx
  const carre = dx * dx + dy * dy
  if (carre === 0) return Math.hypot(p.xPx - a.xPx, p.yPx - a.yPx)
  const t = Math.max(0, Math.min(1, ((p.xPx - a.xPx) * dx + (p.yPx - a.yPx) * dy) / carre))
  return Math.hypot(p.xPx - (a.xPx + t * dx), p.yPx - (a.yPx + t * dy))
}

describe('T-0024 — pas d’échantillonnage dérivé de la longueur projetée', () => {
  const projecteurVue = proj({ azimutDeg: 0, hauteurDeg: SITE.latitudeDeg, fovDeg: 120 })
  const BALAYAGE_480_MIN_DEG = K('ROTATION_CIEL_DEG_H') * 8
  const PAS_FIN = Math.ceil(BALAYAGE_480_MIN_DEG / K('PAS_ANGLE_HORAIRE_FILE_DEG'))

  /** Max gap polyline ↔ exact arc, px. */
  function ecartMaxPx(etoile: Vec3, dureeMin: number): number {
    const arc = arcEtoile(projecteurVue, etoile, dureeMin, AXE_POLE)
    const balayageDeg = K('ROTATION_CIEL_DEG_H') * (dureeMin / 60)
    let pire = 0
    // Exact arc sampled 10× finer than §9.3 step: the truth the polyline is judged against.
    const references = Math.ceil(balayageDeg / (K('PAS_ANGLE_HORAIRE_FILE_DEG') / 10))
    for (let i = 0; i <= references; i++) {
      const point = projecteurVue.projette(apres(etoile, (balayageDeg * i) / references))
      if (point === null) continue
      if (point.xPx < 0 || point.yPx < 0 || point.xPx > LARGEUR || point.yPx > HAUTEUR) continue
      let distance = Infinity
      for (const segment of arc.segments) {
        for (let j = 1; j < segment.length; j++) {
          distance = Math.min(distance, distanceAuSegment(point, segment[j - 1]!, segment[j]!))
        }
      }
      if (distance !== Infinity && distance > pire) pire = distance
    }
    return pire
  }

  it('reste sous le pixel pour l’arc le plus long du cadre', () => {
    // Celestial equator: longest trace, 8 h.
    expect(ecartMaxPx(versVecteur(0, 0), 480)).toBeLessThan(1)
    expect(ecartMaxPx(versVecteur(120, 20), 480)).toBeLessThan(1)
  })

  it('ne fait plus payer 481 pas à une étoile proche du pôle', () => {
    const polaire = arcEtoile(projecteurVue, versVecteur(0, 89.5), 480, AXE_POLE)
    const points = polaire.segments.flat().length
    expect(points).toBeLessThan(PAS_FIN / 4)
    // Trace faithful despite widened step: pixel length decides.
    expect(ecartMaxPx(versVecteur(0, 89.5), 480)).toBeLessThan(1)
  })

  it('garde le pas de §9.3 comme pas le plus fin : jamais de subdivision au-delà', () => {
    const equatoriale = arcEtoile(projecteurVue, versVecteur(0, 0), 480, AXE_POLE)
    expect(equatoriale.segments.flat().length).toBeLessThanOrEqual(PAS_FIN + 1)
  })
})

describe('T-0115 — un arc de filé est un cercle exact en projection stéréographique', () => {
  const DUREES_MIN = [5, 30, 120, 240, 480] as const

  it('ne sort une primitive de cercle qu’en MODE_PLANETARIUM', () => {
    const etoileVue = versVecteur(0, 20)
    const modes: readonly ModeProjection[] = ['MODE_PLANETARIUM', 'MODE_CADRE', 'MODE_FISHEYE']
    for (const mode of modes) {
      const arc = arcEtoile(
        proj({ mode, azimutDeg: 0, hauteurDeg: SITE.latitudeDeg, fovDeg: 90 }),
        etoileVue,
        240,
        AXE_POLE,
      )
      if (mode === 'MODE_PLANETARIUM') {
        expect(arc.cercle).not.toBeNull()
      } else {
        // Rectilinear: conic; equidistant: transcendental curve; polyline stays.
        expect(arc.cercle).toBeNull()
        expect(arc.segments.flat().length).toBeGreaterThan(1)
      }
    }
  })

  it('reste sous le pixel de la trajectoire réelle, du pôle sud au pôle nord', () => {
    // Reference NOT copied: trajectory reprojected point by point at 1/10 of §9.3 step,
    // compared to engine circle.
    let pireEcartPx = 0
    let cerclesJuges = 0
    for (const azimutDeg of [0, 120, 250]) {
      for (const hauteurDeg of [10, SITE.latitudeDeg, 80]) {
        const projecteurVue = proj({
          mode: 'MODE_PLANETARIUM',
          azimutDeg,
          hauteurDeg,
          fovDeg: K('FOV_MAX_DEG'),
        })
        // Pole offset up to 180°: declination sweeps pole to pole, RA covers full turn →
        // both sides of projected pole.
        for (let decDeg = -89; decDeg <= 89; decDeg += 2) {
          for (const raDeg of [0, 47, 133, 250, 310]) {
            for (const dureeMin of DUREES_MIN) {
              const etoileVue = versVecteur(raDeg, decDeg)
              const arc = arcEtoile(projecteurVue, etoileVue, dureeMin, AXE_POLE)
              if (arc.cercle === null) continue
              cerclesJuges++
              const cercle = arc.cercle
              const balayageDeg = K('ROTATION_CIEL_DEG_H') * (dureeMin / 60)
              const references = Math.ceil(balayageDeg / (K('PAS_ANGLE_HORAIRE_FILE_DEG') / 10))
              for (let i = 0; i <= references; i++) {
                const point = projecteurVue.projette(
                  apres(etoileVue, (balayageDeg * i) / references),
                )
                if (point === null) continue
                const ecart = Math.abs(
                  Math.hypot(point.xPx - cercle.xPx, point.yPx - cercle.yPx) - cercle.rayonPx,
                )
                if (ecart > pireEcartPx) pireEcartPx = ecart
              }
            }
          }
        }
      }
    }
    expect(cerclesJuges).toBeGreaterThan(1000)
    expect(pireEcartPx).toBeLessThan(1)
    // ~1000 circles vs trajectory at 1/10 §9.3 step: exhaustive sweep, near default Vitest
    // timeout under load → timeout declared explicitly.
  }, 20_000)

  it('couvre le balayage entier, sens compris, même au-delà du demi-tour', () => {
    // Circle extent must contain whole trajectory: sweep folded by a turn would leave real
    // positions outside arc at unchanged radius. Angle attests, not distance to centre.
    let balayagesLongs = 0
    for (const hauteurDeg of [10, 80]) {
      const projecteurVue = proj({
        mode: 'MODE_PLANETARIUM',
        azimutDeg: 0,
        hauteurDeg,
        fovDeg: K('FOV_MAX_DEG'),
      })
      for (let decDeg = -85; decDeg <= 85; decDeg += 5) {
        for (const raDeg of [0, 47, 133, 250, 310]) {
          const etoileVue = versVecteur(raDeg, decDeg)
          const arc = arcEtoile(projecteurVue, etoileVue, 480, AXE_POLE)
          if (arc.cercle === null) continue
          const cercle = arc.cercle
          if (Math.abs(cercle.balayageRad) > Math.PI) balayagesLongs++
          const balayageDeg = K('ROTATION_CIEL_DEG_H') * 8
          const sens = cercle.balayageRad < 0 ? -1 : 1
          for (let i = 0; i <= 200; i++) {
            const point = projecteurVue.projette(apres(etoileVue, (balayageDeg * i) / 200))
            if (point === null) continue
            const angle = Math.atan2(point.yPx - cercle.yPx, point.xPx - cercle.xPx)
            const depuisDebut =
              (((((angle - cercle.debutRad) * sens) % (2 * Math.PI)) + 2 * Math.PI) %
                (2 * Math.PI))
            // Angular tolerance: 1 px from centre, not an eyeballed margin.
            const unPixelRad = 1 / Math.max(cercle.rayonPx, 1)
            expect(depuisDebut).toBeLessThanOrEqual(Math.abs(cercle.balayageRad) + unPixelRad)
          }
        }
      }
    }
    // Sweep ≤ half a turn → vote-protected case unexercised, proves nothing.
    expect(balayagesLongs).toBeGreaterThan(0)
  })

  it('retombe sur la polyligne quand le cercle dégénère près de l’antipode de la visée', () => {
    const projecteurVue = proj({
      mode: 'MODE_PLANETARIUM',
      azimutDeg: 0,
      hauteurDeg: SITE.latitudeDeg,
      fovDeg: K('FOV_MAX_DEG'),
    })
    // Aim on pole: declination circle through aim antipode = view-frame equator, polar
    // distance 90°.
    const visee = projecteurVue.inverse(LARGEUR / 2, HAUTEUR / 2)
    const separationPoleDeg = separationDeg(visee, AXE_POLE)
    let degeneres = 0
    for (const raDeg of [0, 60, 140, 220, 300]) {
      // Declination s.t. circle grazes aim antipode.
      const decDeg = 90 - (180 - separationPoleDeg)
      const arc = arcEtoile(projecteurVue, versVecteur(raDeg, decDeg), 480, AXE_POLE)
      if (arc.cercle !== null) continue
      degeneres++
      // Trace doesn't cross image: no vertex beyond useful range → no phantom edge-to-edge chord.
      const portee = porteeUtilePx(projecteurVue.vue)
      for (const point of arc.segments.flat()) {
        expect(Math.hypot(point.xPx - LARGEUR / 2, point.yPx - HAUTEUR / 2)).toBeLessThanOrEqual(
          portee,
        )
      }
    }
    expect(degeneres).toBeGreaterThan(0)
  })

  it('garde une longueur cohérente : trop courte, la trace reste un disque', () => {
    const projecteurVue = proj({
      mode: 'MODE_PLANETARIUM',
      azimutDeg: 0,
      hauteurDeg: SITE.latitudeDeg,
      fovDeg: 60,
    })
    // Reference: fine polyline of SAME trajectory, summed chords.
    const longueurReferencePx = (etoileVue: Vec3, dureeMin: number): number => {
      const balayageDeg = K('ROTATION_CIEL_DEG_H') * (dureeMin / 60)
      const pas = 2000
      let total = 0
      let precedent = projecteurVue.projette(etoileVue)
      for (let i = 1; i <= pas; i++) {
        const point = projecteurVue.projette(apres(etoileVue, (balayageDeg * i) / pas))
        if (point !== null && precedent !== null) {
          total += Math.hypot(point.xPx - precedent.xPx, point.yPx - precedent.yPx)
        }
        precedent = point
      }
      return total
    }
    for (const decDeg of [0, 40, 75]) {
      for (const dureeMin of DUREES_MIN) {
        const etoileVue = versVecteur(0, decDeg)
        const arc = arcEtoile(projecteurVue, etoileVue, dureeMin, AXE_POLE)
        if (arc.cercle === null) continue
        // Chord underestimates arc: relative gap < 1/1000 at 2000 steps.
        expect(arc.longueurPx).toBeCloseTo(longueurReferencePx(etoileVue, dureeMin), 1)
      }
    }
    // Star near pole: 8 h trace < 1 px. `longueurPx` → draws a disc not a line (§9.3);
    // `segments` must carry the disc's start position.
    // Star at 1/1000 turn from pole OF DATE, not J2000 (precession already > 0,1° away).
    const ecart = 1e-4
    const vers = versVecteur(0, 0)
    const norme = Math.hypot(
      AXE_POLE.x + ecart * vers.x,
      AXE_POLE.y + ecart * vers.y,
      AXE_POLE.z + ecart * vers.z,
    )
    const quasiPolaire: Vec3 = {
      x: (AXE_POLE.x + ecart * vers.x) / norme,
      y: (AXE_POLE.y + ecart * vers.y) / norme,
      z: (AXE_POLE.z + ecart * vers.z) / norme,
    }
    const courte = arcEtoile(projecteurVue, quasiPolaire, 480, AXE_POLE)
    expect(courte.cercle).not.toBeNull()
    expect(courte.longueurPx).toBeLessThan(1)
    expect(courte.longueurPx).toBeCloseTo(longueurReferencePx(quasiPolaire, 480), 2)
    expect(courte.segments[0]?.[0]).toBeDefined()
  })
})
