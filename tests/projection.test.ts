/**
 * §3.3 — unified render engine. PRD central criterion = architecture property: same pointage
 * coincides in MODE_PLANETARIUM and MODE_CADRE. One projection implementation guarantees it; two
 * codebases would betray it, invisibly in dev.
 */

import { describe, expect, it } from 'vitest'
import {
  angleProjete,
  bornesZoom,
  echelleProjection,
  fovMaxSelonMode,
  etatProfondeur,
  magnitudeLimite,
  magnitudeRendue,
  matriceVue,
  pointEcran,
  porteeUtilePx,
  projecteur,
  rayonChampDeg,
  rayonEtoilePx,
  type Vue,
} from '../src/core/projection.ts'
import { DEG, IDENTITE, separationDeg, versVecteur } from '../src/core/mat3.ts'
import { K } from '../src/registry/constants.ts'
import {
  M_LIM_OEIL_PLAFOND,
  M_LIM_OEIL_PLANCHER,
  SB_PLAFOND_TABLE,
  SB_PLANCHER_NATUREL,
  interpoleBortle,
} from '../src/registry/bortle.ts'

const LARGEUR = 1920
const HAUTEUR = 1080

function vue(mode: Vue['mode'], fovDeg: number): Vue {
  return {
    mode,
    fovDeg,
    largeurPx: LARGEUR,
    hauteurPx: HAUTEUR,
    azimutDeg: 180,
    hauteurDeg: 40,
    rotationDeg: 0,
  }
}

/**
 * View centred on x axis: aim (1, 0, 0); direction at angle θ, position angle φ, written without
 * the tested machinery.
 */
function vueCentree(mode: Vue['mode'], fovDeg: number): Vue {
  return { ...vue(mode, fovDeg), azimutDeg: 0, hauteurDeg: 0, rotationDeg: 0 }
}

function directionA(thetaDeg: number, phiDeg: number) {
  const t = (thetaDeg * Math.PI) / 180
  const p = (phiDeg * Math.PI) / 180
  return { x: Math.cos(t), y: Math.sin(t) * Math.cos(p), z: Math.sin(t) * Math.sin(p) }
}

/** Chord distance: `acos` loses half its digits near zero. */
function corde(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

describe('projection unifiée §3.3', () => {
  it('projette le centre de visée au centre du canevas, quel que soit le mode', () => {
    for (const mode of ['MODE_PLANETARIUM', 'MODE_CADRE', 'MODE_FISHEYE'] as const) {
      const p = projecteur(vue(mode, 60), IDENTITE).projette(versVecteur(180, 40))
      expect(p, mode).not.toBeNull()
      expect(p!.xPx, mode).toBeCloseTo(LARGEUR / 2, 6)
      expect(p!.yPx, mode).toBeCloseTo(HAUTEUR / 2, 6)
    }
  })

  /**
   * T-0065 — `projetteEn` allocates nothing for hot loops; `projette` wraps it. Guards §3.3: same
   * result from both, incl. outside projectable domain and at fisheye singular point.
   */
  it('donne le même résultat en place et en allouant, dans les trois modes', () => {
    const out = pointEcran()
    for (const mode of ['MODE_PLANETARIUM', 'MODE_CADRE', 'MODE_FISHEYE'] as const) {
      const p = projecteur(vue(mode, 60), IDENTITE)
      for (let lon = 0; lon < 360; lon += 11) {
        for (let lat = -80; lat <= 80; lat += 13) {
          const v = versVecteur(lon, lat)
          const attendu = p.projette(v)
          const projete = p.projetteEn(v.x, v.y, v.z, out)
          expect(projete, `${mode} ${lon}/${lat}`).toBe(attendu !== null)
          if (attendu === null) continue
          expect(out.xPx, `${mode} ${lon}/${lat}`).toBe(attendu.xPx)
          expect(out.yPx, `${mode} ${lon}/${lat}`).toBe(attendu.yPx)
        }
      }
      // Aim centre: fisheye singular branch.
      const centre = versVecteur(180, 40)
      const attendu = p.projette(centre)!
      p.projetteEn(centre.x, centre.y, centre.z, out)
      expect(out.xPx, mode).toBe(attendu.xPx)
      expect(out.yPx, mode).toBe(attendu.yPx)
    }
  })

  it('fait coïncider planétarium et cadre sans divergence systématique', () => {
    const planetarium = projecteur(vueCentree('MODE_PLANETARIUM', 30), IDENTITE)
    const cadre = projecteur(vueCentree('MODE_CADRE', 30), IDENTITE)

    for (const thetaDeg of [1, 3, 7, 12, 15]) {
      const rapports: number[] = []
      for (let phi = 0; phi < 360; phi += 15) {
        const point = directionA(thetaDeg, phi)
        const a = planetarium.projette(point)
        const b = cadre.projette(point)
        expect(a).not.toBeNull()
        expect(b).not.toBeNull()

        // Same radius from canvas centre: same direction, only radial distance differs →
        // distortion.
        const angleA = Math.atan2(a!.yPx - HAUTEUR / 2, a!.xPx - LARGEUR / 2)
        const angleB = Math.atan2(b!.yPx - HAUTEUR / 2, b!.xPx - LARGEUR / 2)
        expect(angleA).toBeCloseTo(angleB, 9)

        // Angle at aim centre re-read from projected radius via §3.3 inverse (what the point
        // carried before T-0111): checks what projection produces.
        for (const [p, point] of [
          [planetarium, a!],
          [cadre, b!],
        ] as const) {
          const rayon = Math.hypot(point.xPx - LARGEUR / 2, point.yPx - HAUTEUR / 2)
          expect(angleProjete(p.vue.mode, rayon / p.echelle) / DEG).toBeCloseTo(thetaDeg, 9)
        }

        rapports.push(
          Math.hypot(a!.xPx - LARGEUR / 2, a!.yPx - HAUTEUR / 2) /
            Math.hypot(b!.xPx - LARGEUR / 2, b!.yPx - HAUTEUR / 2),
        )
      }
      // Ratio depends on θ only, never azimuth.
      for (const rapport of rapports) expect(rapport).toBeCloseTo(rapports[0]!, 9)
      // Both modes frame same field: coincide at edge, differ <2 % at centre (PRD-accepted
      // distortion, θ only).
      if (thetaDeg === 15) expect(rapports[0]!).toBeCloseTo(1, 9)
      else expect(Math.abs(rapports[0]! - 1)).toBeLessThan(0.02)
    }
  })

  it('ne projette rien à l’infini à 180° de champ en stéréographique', () => {
    const p = projecteur(vue('MODE_PLANETARIUM', K('FOV_MAX_DEG')), IDENTITE)
    for (let lon = 0; lon < 360; lon += 5) {
      for (let lat = -90; lat <= 90; lat += 5) {
        const point = p.projette(versVecteur(lon, lat))
        if (point === null) continue
        expect(Number.isFinite(point.xPx), `${lon}/${lat}`).toBe(true)
        expect(Number.isFinite(point.yPx), `${lon}/${lat}`).toBe(true)
      }
    }
    // Antipodal point not projectable: discarded, not sent to infinity.
    expect(p.projette(versVecteur(0, -40))).toBeNull()
  })

  it('écarte ce qui passe derrière le plan tangent en mode cadre', () => {
    const p = projecteur(vue('MODE_CADRE', 60), IDENTITE)
    expect(p.projette(versVecteur(0, -40))).toBeNull()
    expect(p.projette(versVecteur(90, 0))).toBeNull()
  })

  it('remplit exactement la largeur avec le champ demandé', () => {
    for (const mode of ['MODE_PLANETARIUM', 'MODE_CADRE', 'MODE_FISHEYE'] as const) {
      const v = vue(mode, 40)
      const p = projecteur(v, IDENTITE)
      const bord = p.inverse(LARGEUR, HAUTEUR / 2)
      expect(separationDeg(bord, versVecteur(180, 40)), mode).toBeCloseTo(20, 6)
      expect(echelleProjection(v), mode).toBeGreaterThan(0)
    }
  })

  it('retrouve la direction sous un point de l’écran', () => {
    for (const mode of ['MODE_PLANETARIUM', 'MODE_CADRE', 'MODE_FISHEYE'] as const) {
      const p = projecteur(vue(mode, 60), IDENTITE)
      const origine = versVecteur(190, 47)
      const ecran = p.projette(origine)
      expect(ecran).not.toBeNull()
      const retour = p.inverse(ecran!.xPx, ecran!.yPx)
      expect(corde(origine, retour), mode).toBeLessThan(1e-12)
    }
  })

  it('n’a pas de singularité au zénith : l’azimut y tient lieu de roulis', () => {
    const m = matriceVue(0, 90, 0)
    expect(m.every((c) => Number.isFinite(c))).toBe(true)
  })
})

describe('profondeur asservie au zoom §3.3', () => {
  it('donne la magnitude de base au champ de référence', () => {
    expect(magnitudeLimite(K('FOV_REFERENCE_RENDU_DEG')).value).toBeCloseTo(
      K('MAG_BASE_RENDU'),
      9,
    )
  })

  it('descend d’environ 5,4 magnitudes en passant de 60° à 5°', () => {
    expect(magnitudeLimite(5).value).toBeCloseTo(6.5 + 5 * Math.log10(12), 6)
  })

  it('plafonne la profondeur par le fond de ciel en vue réaliste', () => {
    const bortle8 = interpoleBortle(8)
    expect(magnitudeRendue(60, bortle8.sb, true).value).toBeCloseTo(bortle8.mLimOeil, 9)
    expect(magnitudeRendue(60, bortle8.sb, false).value).toBeCloseTo(K('MAG_BASE_RENDU'), 9)
    expect(magnitudeRendue(60, bortle8.sb, true).note).toMatch(/visibles depuis ce ciel/)
  })

  /**
   * T-0100 — regression: fond de ciel OFF-TABLE no longer suspends the cap. Under Moon
   * `sb_effectif` fell below table's last row; faulty version returned zoom magnitude → MORE stars
   * than suburban sky. Cap sits beyond table edge (T-0357: at Schaefer threshold) and declares it.
   */
  it('plafonne encore quand le fond de ciel sort de la table Bortle', () => {
    const horsTableClair = SB_PLAFOND_TABLE - 1
    const sousLaLune = magnitudeRendue(60, horsTableClair, true)
    expect(sousLaLune.value).toBeLessThan(M_LIM_OEIL_PLANCHER)
    expect(sousLaLune.value).toBeLessThan(magnitudeRendue(60, interpoleBortle(9).sb, true).value + 1e-9)
    expect(sousLaLune.note).toMatch(/plus clair que Bortle 9/)
    expect(sousLaLune.flags).toContain('HORS_DOMAINE')

    // Other edge: SQM darker than table doesn't drop the cap either.
    const horsTableSombre = magnitudeRendue(5, SB_PLANCHER_NATUREL + 1, true)
    expect(horsTableSombre.value).toBeCloseTo(M_LIM_OEIL_PLAFOND, 9)
  })

  it('déclare le catalogue épuisé sous la borne du paquet chargé', () => {
    const profondeurHyg = 9
    const large = etatProfondeur(60, profondeurHyg, null, false)
    expect(large.catalogueEpuise).toBe(false)
    const serre = etatProfondeur(5, profondeurHyg, null, false)
    expect(serre.catalogueEpuise).toBe(true)
    expect(serre.cause).toMatch(/magnitude 9/)
    expect(serre.cause).toMatch(/plus pauvre qu’en vrai/)
  })

  it('plafonne le zoom à 15° sans le paquet Gaia, et le déclare', () => {
    const sans = bornesZoom(false, 'MODE_PLANETARIUM')
    expect(sans.fovMinDeg).toBe(K('FOV_MIN_SANS_GAIA_DEG'))
    expect(sans.cause).toMatch(new RegExp(`${K('FOV_MIN_SANS_GAIA_DEG')}°`))
    const avec = bornesZoom(true, 'MODE_PLANETARIUM')
    expect(avec.fovMinDeg).toBe(K('FOV_MIN_AVEC_GAIA_DEG'))
    expect(avec.cause).toBeUndefined()
  })

  it('donne à chaque projection le plafond que sa fonction radiale supporte', () => {
    expect(fovMaxSelonMode('MODE_CADRE')).toBe(K('FOV_MAX_GNOMONIQUE_DEG'))
    expect(fovMaxSelonMode('MODE_PLANETARIUM')).toBe(K('FOV_MAX_STEREOGRAPHIQUE_DEG'))
    expect(fovMaxSelonMode('MODE_FISHEYE')).toBe(K('FOV_MAX_EQUIDISTANTE_DEG'))
    // Stereographic + equidistant pass 180° (neither 2·tan(θ/2) nor θ diverges); gnomonic alone
    // stays below (T-0220).
    expect(fovMaxSelonMode('MODE_PLANETARIUM')).toBeGreaterThan(K('FOV_MAX_DEG'))
    expect(fovMaxSelonMode('MODE_FISHEYE')).toBeGreaterThan(K('FOV_MAX_DEG'))
    expect(fovMaxSelonMode('MODE_CADRE')).toBeLessThan(K('FOV_MAX_DEG'))
    // Catalogue-bound floor ⊥ projection-bound cap: Gaia pack doesn't change tan(θ) at field edge.
    expect(bornesZoom(true, 'MODE_CADRE').fovMaxDeg).toBe(K('FOV_MAX_GNOMONIQUE_DEG'))
    expect(bornesZoom(false, 'MODE_CADRE').fovMaxDeg).toBe(K('FOV_MAX_GNOMONIQUE_DEG'))
  })

  it('garde une échelle utilisable au plafond gnomonique, là où 180° effondre la scène', () => {
    // R(θ) = tan(θ), scale = (width / 2) / R(fov / 2). At cap: same order as canvas half-width; at
    // 180° → machine zero, all stars on centre pixel (nothing crashes, everything disappears).
    const auPlafond = echelleProjection(vue('MODE_CADRE', K('FOV_MAX_GNOMONIQUE_DEG')))
    const a180 = echelleProjection(vue('MODE_CADRE', K('FOV_MAX_DEG')))
    expect(auPlafond).toBeGreaterThan(1)
    expect(a180).toBeLessThan(auPlafond * 1e-9)
    // Both projections kept by §3.3 cap keep a same-order scale: neither 2·tan(θ/2) nor θ diverges
    // at 90°.
    for (const mode of ['MODE_PLANETARIUM', 'MODE_FISHEYE'] as const) {
      expect(echelleProjection(vue(mode, K('FOV_MAX_DEG')))).toBeGreaterThan(auPlafond * 1e-9)
    }
  })

  it('couvre le coin du canevas, à tout champ et dans les trois modes', () => {
    // Calotte radius is used to DISCARD: underestimating erases visible geometry. Canvas corner =
    // farthest from aim centre; true angular separation must fit announced radius, incl. where
    // small-angle (fov / 2) × diagonal erred most: wide field.
    for (const mode of ['MODE_PLANETARIUM', 'MODE_CADRE', 'MODE_FISHEYE'] as const) {
      for (const part of [0.02, 0.25, 0.6, 1]) {
        const v = vue(mode, fovMaxSelonMode(mode) * part)
        const p = projecteur(v, IDENTITE)
        const centre = p.inverse(LARGEUR / 2, HAUTEUR / 2)
        const coin = separationDeg(centre, p.inverse(0, 0))
        const rayon = rayonChampDeg(v)
        expect(rayon).toBeCloseTo(coin, 6)
        // A calotte stays a calotte: ≤ whole sky.
        expect(rayon).toBeLessThan(K('FOV_MAX_DEG'))
      }
    }
  })

  it('borne l’équidistante à l’antipode, même quand le canevas le dépasse (T-0220)', () => {
    // Portrait canvas: at cap, corner >180° from centre in R = θ. Beyond antipodal circle no sky.
    const portrait: Vue = {
      ...vue('MODE_FISHEYE', K('FOV_MAX_EQUIDISTANTE_DEG')),
      largeurPx: HAUTEUR,
      hauteurPx: LARGEUR,
    }
    expect(rayonChampDeg(portrait)).toBe(K('FOV_MAX_DEG'))
    const coin = projecteur(portrait, IDENTITE).inverse(0, 0)
    const centre = projecteur(portrait, IDENTITE).inverse(HAUTEUR / 2, LARGEUR / 2)
    expect(separationDeg(centre, coin)).toBeCloseTo(K('FOV_MAX_DEG'), 6)
  })

  it('refuse en équidistante un point voisin de l’antipode, pour ne pas tirer de corde (T-0220)', () => {
    const p = projecteur(vueCentree('MODE_FISHEYE', K('FOV_MAX_EQUIDISTANTE_DEG')), IDENTITE)
    const marge = K('MARGE_ANTIPODE_EQUIDISTANTE_DEG')
    // Aim (1, 0, 0): antipode (−1, 0, 0), longitude 180°.
    expect(p.projette(versVecteur(180 - 2 * marge, 0))).not.toBeNull()
    expect(p.projette(versVecteur(180 - marge / 2, 0))).toBeNull()
    expect(p.projette(versVecteur(180 + marge / 2, 0))).toBeNull()
  })

  it('voit au-delà de l’hémisphère au plafond stéréographique', () => {
    // Calotte cap was FOV_MAX_DEG / 2 = 90°: at stereographic cap corner is farther, all there was
    // discarded.
    const auPlafond = rayonChampDeg(vue('MODE_PLANETARIUM', K('FOV_MAX_STEREOGRAPHIQUE_DEG')))
    expect(auPlafond).toBeGreaterThan(K('FOV_MAX_DEG') / 2)
  })

  it('refuse un point projeté hors de portée, singularité comprise', () => {
    // Near aim antipode radial factor diverges: "projectable" per formula, tens of thousands of px
    // away; polyline neighbours land either side of canvas, chord crosses image.
    const vue: Vue = {
      mode: 'MODE_PLANETARIUM',
      fovDeg: 60,
      largeurPx: 960,
      hauteurPx: 540,
      azimutDeg: 0,
      hauteurDeg: 0,
      rotationDeg: 0,
    }
    const proj = projecteur(vue, IDENTITE)
    const portee = porteeUtilePx(vue)
    expect(portee).toBeGreaterThan(Math.hypot(vue.largeurPx, vue.hauteurPx))

    const dansLeChamp = proj.projette(versVecteur(0, 0))
    expect(dansLeChamp).not.toBeNull()

    // Just outside field: still projected, lets polylines exit cleanly.
    const horsChamp = proj.projette(versVecteur(vue.fovDeg, 0))
    expect(horsChamp).not.toBeNull()
    expect(Math.hypot(horsChamp!.xPx - vue.largeurPx / 2, horsChamp!.yPx - vue.hauteurPx / 2))
      .toBeGreaterThan(vue.largeurPx / 2)

    // One degree from antipode: refused.
    expect(proj.projette(versVecteur(179, 0))).toBeNull()
  })

  it('fait décroître le rayon d’une étoile avec sa magnitude', () => {
    expect(rayonEtoilePx(0)).toBeCloseTo(K('RAYON_ETOILE_R0_PX'), 9)
    expect(rayonEtoilePx(5) / rayonEtoilePx(0)).toBeCloseTo(10 ** (-0.15 * 5), 9)
    expect(rayonEtoilePx(6)).toBeLessThan(rayonEtoilePx(1))
  })
})

/**
 * T-0258 — aim centre moves out from under the cards. Canvas covers whole shell but view rail +
 * session panel sit on it: pointage must land mid-VISIBLE area, else focale changes without ever
 * seeing the resulting cadre (§11.3).
 */
describe('T-0258 — le centre de visée décalé', () => {
  const DECALAGE_PX = -154

  function vueDecalee(): Vue {
    return { ...vueCentree('MODE_PLANETARIUM', 60), decalageCentreXPx: DECALAGE_PX }
  }

  it('pose la direction visée au centre décalé, pas au milieu du canevas', () => {
    const proj = projecteur(vueDecalee(), IDENTITE)
    // `vueCentree` aims at x axis: direction pointage names, written without the tested projection.
    const visee = proj.projette({ x: 1, y: 0, z: 0 })
    expect(visee).not.toBeNull()
    expect(visee!.xPx).toBeCloseTo(LARGEUR / 2 + DECALAGE_PX, 9)
    expect(visee!.yPx).toBeCloseTo(HAUTEUR / 2, 9)
    expect(proj.centreXPx).toBeCloseTo(LARGEUR / 2 + DECALAGE_PX, 9)
  })

  it('rend la direction visée quand on inverse son propre centre', () => {
    const proj = projecteur(vueDecalee(), IDENTITE)
    expect(corde(proj.inverse(proj.centreXPx, proj.centreYPx), { x: 1, y: 0, z: 0 })).toBeLessThan(
      1e-12,
    )
  })

  it('garde la même échelle : seul le centre bouge, pas le champ par pixel', () => {
    expect(echelleProjection(vueDecalee())).toBe(
      echelleProjection(vueCentree('MODE_PLANETARIUM', 60)),
    )
  })

  it('élargit la calotte de sélection jusqu’au bord devenu le plus lointain', () => {
    // Shifted centre not equidistant from the two edges: half-width would reject on too small a
    // calotte, erasing opposite edge geometry (T-0110).
    const droit = vueCentree('MODE_PLANETARIUM', 60)
    const decale = vueDecalee()
    expect(rayonChampDeg(decale)).toBeGreaterThan(rayonChampDeg(droit))

    const proj = projecteur(decale, IDENTITE)
    // Farthest corner from shifted centre: right. Calotte TANGENT to it (covers canvas without
    // overflow) → opposite corner fits too.
    const centre = proj.inverse(proj.centreXPx, proj.centreYPx)
    expect(separationDeg(proj.inverse(LARGEUR, 0), centre)).toBeCloseTo(rayonChampDeg(decale), 9)
    expect(separationDeg(proj.inverse(0, HAUTEUR), centre)).toBeLessThan(rayonChampDeg(decale))
  })

  it('sans décalage, projette exactement comme avant', () => {
    const sansChamp = projecteur(vueCentree('MODE_PLANETARIUM', 60), IDENTITE)
    const aZero = projecteur(
      { ...vueCentree('MODE_PLANETARIUM', 60), decalageCentreXPx: 0 },
      IDENTITE,
    )
    expect(aZero.centreXPx).toBe(sansChamp.centreXPx)
    expect(rayonChampDeg(aZero.vue)).toBe(rayonChampDeg(sansChamp.vue))
  })
})
