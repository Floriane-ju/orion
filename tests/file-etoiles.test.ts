/**
 * §9.3 — Prévisualisation du filé d'étoiles.
 *
 * Ce que ce test vérifie est exactement ce que le PRD dit être raté ailleurs : le pôle est à
 * sa place même hors du cadre, les arcs ne sont pas des cercles concentriques en projection
 * rectilinéaire, leur longueur varie avec la déclinaison, et une étoile qui file est moins
 * brillante par pixel qu'une étoile ponctuelle.
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

/** Le ciel tourne autour du pôle DE L'ÉPOQUE, à un demi-degré du pôle J2000 en 2026. */
const AXE_POLE = axePoleDeDate(epoqueAnnee(DATE))

describe('§9.3 — centre de rotation', () => {
  it('rend le pôle dans le cadre à la hauteur de la latitude, azimut nord vrai', () => {
    // Cadre centré sur le pôle nord céleste : azimut 0, hauteur = latitude.
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
    // Le point projeté reste où la projection le met, hors bornes du canevas comprises.
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

  it('annonce qu’un filé lisible demande au moins une heure', () => {
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
    // 5 % de la hauteur du cadre : des étoiles étirées, pas un filé.
    expect(diagnostic.fractionHauteurCadre).toBeCloseTo(0.05, 2)
    expect(diagnostic.messages.join(' ')).toMatch(
      new RegExp(`au moins ${K('DUREE_FILE_LISIBLE_MIN')} min`),
    )
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

    // Vue centrée SUR le pôle : la projection étant radiale, l'arc y est exactement un cercle.
    expect(dispersion('MODE_FISHEYE', 0, SITE.latitudeDeg)).toBeLessThan(0.001)
    expect(dispersion('MODE_CADRE', 0, SITE.latitudeDeg)).toBeLessThan(0.001)

    // Pôle décentré, cadrage réel : le cercle de déclinaison devient une conique, et le
    // rayon apparent varie de plusieurs pour cent. Tracer des cercles concentriques serait faux.
    expect(dispersion('MODE_CADRE', 20, 55)).toBeGreaterThan(0.02)
  })

  it('tronque les arcs au bord du cadre', () => {
    // Quatre heures : l'étoile traverse le champ et en sort.
    const arc = arcEtoile(proj({ azimutDeg: 180, hauteurDeg: 30, fovDeg: 40 }), etoile, 240, AXE_POLE)
    expect(arc.tronque).toBe(true)
  })

  it('suit le sens de rotation du ciel : les étoiles dérivent vers l’ouest', () => {
    // Cadre au sud : le ciel passe de l'est vers l'ouest, donc de la gauche vers la droite.
    const projecteurVue = proj({ azimutDeg: 180, hauteurDeg: 40, fovDeg: 60 })
    const centre = projecteurVue.inverse(LARGEUR / 2, HAUTEUR / 2)
    const arc = arcEtoile(projecteurVue, centre, 60, AXE_POLE)
    const points = arc.segments.flat()
    expect(points[points.length - 1]!.xPx).toBeGreaterThan(points[0]!.xPx)
  })
})

describe('§9.3 — brillance de la trace', () => {
  // Échantillonnages du setup grand angle (10 mm) et du téléobjectif (120 mm) de l'Annexe A.
  const ECH_10MM = 105.6
  const ECH_120MM = 8.8

  it('compte la pose vue par un pixel du capteur, pas par un pixel d’écran', () => {
    // 105,6 "/px traversées à 15,041 "/s : sept secondes par pixel, à l'équateur céleste.
    expect(poseParPixelS(7200, ECH_10MM, 0)).toBeCloseTo(ECH_10MM / K('ROTATION_CIEL_DEG_H'), 3)
    // Elle NE dépend PAS de la durée du filé : allonger la séquence allonge la trace,
    // il ne l'éclaircit pas.
    expect(poseParPixelS(28800, ECH_10MM, 0)).toBeCloseTo(poseParPixelS(7200, ECH_10MM, 0), 6)
    // Une focale plus longue étale le même flux sur plus de pixels : la trace pâlit.
    expect(poseParPixelS(7200, ECH_120MM, 0)).toBeLessThan(poseParPixelS(7200, ECH_10MM, 0))
    // Près du pôle, l'étoile traîne moins vite et le pixel reçoit plus longtemps.
    expect(poseParPixelS(7200, ECH_10MM, 60)).toBeCloseTo(poseParPixelS(7200, ECH_10MM, 0) * 2, 3)
  })

  it('ne dépasse jamais la durée réellement posée', () => {
    // Pose d'une seconde : le pixel n'a pas vu l'étoile plus longtemps que ça.
    expect(poseParPixelS(1, ECH_10MM, 0)).toBe(1)
  })
})

/** Position exacte de l'étoile après `angleDeg` d'angle horaire écoulé. */
function apres(etoile: Vec3, angleDeg: number): Vec3 {
  return applique(rotationAutourDe(AXE_POLE, -angleDeg), etoile)
}

/** Distance d'un point au segment [a, b], en pixels. */
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

  /** Écart maximal entre la polyligne rendue et l'arc exact, en pixels. */
  function ecartMaxPx(etoile: Vec3, dureeMin: number): number {
    const arc = arcEtoile(projecteurVue, etoile, dureeMin, AXE_POLE)
    const balayageDeg = K('ROTATION_CIEL_DEG_H') * (dureeMin / 60)
    let pire = 0
    // L'arc exact est échantillonné dix fois plus finement que le pas de référence de §9.3 :
    // c'est lui la vérité contre laquelle la polyligne est jugée.
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
    // Équateur céleste : la trace la plus longue possible, huit heures durant.
    expect(ecartMaxPx(versVecteur(0, 0), 480)).toBeLessThan(1)
    expect(ecartMaxPx(versVecteur(120, 20), 480)).toBeLessThan(1)
  })

  it('ne fait plus payer 481 pas à une étoile proche du pôle', () => {
    const polaire = arcEtoile(projecteurVue, versVecteur(0, 89.5), 480, AXE_POLE)
    const points = polaire.segments.flat().length
    expect(points).toBeLessThan(PAS_FIN / 4)
    // La trace reste fidèle malgré le pas élargi : c'est la longueur en pixels qui décide.
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
        // Conique en rectilinéaire, courbe transcendante en équidistante : la polyligne reste.
        expect(arc.cercle).toBeNull()
        expect(arc.segments.flat().length).toBeGreaterThan(1)
      }
    }
  })

  it('reste sous le pixel de la trajectoire réelle, du pôle sud au pôle nord', () => {
    // La référence n'est PAS une valeur recopiée : c'est la trajectoire reprojetée point par
    // point, au dixième du pas de §9.3, et confrontée au cercle sorti par le moteur.
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
        // Écart au pôle jusqu'à 180° : la déclinaison balaie d'un pôle à l'autre, et les
        // ascensions droites couvrent le tour, donc les deux côtés du pôle projeté.
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
    // Un millier de cercles confrontés à leur trajectoire au dixième du pas de §9.3 : le
    // balayage est délibérément exhaustif et frôle le délai par défaut de Vitest sous charge.
    // Le délai est donc déclaré, plutôt que laissé au hasard de l'ordonnancement.
  }, 20_000)

  it('couvre le balayage entier, sens compris, même au-delà du demi-tour', () => {
    // L'étendue du cercle doit contenir toute la trajectoire : un balayage replié d'un tour
    // laisserait des positions réelles hors de l'arc tracé, sans que le rayon bouge d'un
    // pixel. C'est l'angle, pas la distance au centre, qui l'atteste.
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
            // Tolérance angulaire : un pixel vu du centre, jamais une marge choisie à vue.
            const unPixelRad = 1 / Math.max(cercle.rayonPx, 1)
            expect(depuisDebut).toBeLessThanOrEqual(Math.abs(cercle.balayageRad) + unPixelRad)
          }
        }
      }
    }
    // Sans au moins un balayage de plus d'un demi-tour, le cas que le vote protège n'a pas
    // été exercé et le test ne prouve rien.
    expect(balayagesLongs).toBeGreaterThan(0)
  })

  it('retombe sur la polyligne quand le cercle dégénère près de l’antipode de la visée', () => {
    const projecteurVue = proj({
      mode: 'MODE_PLANETARIUM',
      azimutDeg: 0,
      hauteurDeg: SITE.latitudeDeg,
      fovDeg: K('FOV_MAX_DEG'),
    })
    // Visée sur le pôle : le cercle de déclinaison qui passe par l'antipode de la visée est
    // celui de l'équateur du repère de vue, soit une distance polaire de 90°.
    const visee = projecteurVue.inverse(LARGEUR / 2, HAUTEUR / 2)
    const separationPoleDeg = separationDeg(visee, AXE_POLE)
    let degeneres = 0
    for (const raDeg of [0, 60, 140, 220, 300]) {
      // Déclinaison telle que le cercle de déclinaison frôle l'antipode de la visée.
      const decDeg = 90 - (180 - separationPoleDeg)
      const arc = arcEtoile(projecteurVue, versVecteur(raDeg, decDeg), 480, AXE_POLE)
      if (arc.cercle !== null) continue
      degeneres++
      // La trace ne traverse pas l'image : aucun sommet retenu au-delà de la portée utile,
      // donc aucune corde fantôme d'un bord à l'autre.
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
    // Référence : longueur de la polyligne fine de la MÊME trajectoire, sommée en cordes.
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
        // La corde sous-estime l'arc : l'écart relatif reste sous le millième à 2 000 pas.
        expect(arc.longueurPx).toBeCloseTo(longueurReferencePx(etoileVue, dureeMin), 1)
      }
    }
    // Étoile presque sur le pôle : huit heures durant, sa trace tient sous le pixel. C'est
    // `longueurPx` qui la fait dessiner en disque plutôt qu'en trait (§9.3), et `segments`
    // doit alors porter la position de départ que le disque utilise.
    // Étoile posée à un millième de tour du pôle DE LA DATE — pas du pôle J2000, dont la
    // précession l'écarte déjà de plus d'un dixième de degré.
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
