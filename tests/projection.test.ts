/**
 * §3.3 — Moteur de rendu unifié.
 *
 * Le critère central du PRD n'est pas une image mais une propriété d'architecture : le même
 * pointage doit coïncider en MODE_PLANETARIUM et en MODE_CADRE, sans divergence
 * systématique. Une seule implémentation de la projection le garantit ; deux bases de code
 * le trahiraient, et le défaut serait invisible en développement.
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
 * Vue centrée sur l'axe x : le centre de visée est alors (1, 0, 0), et une direction à
 * l'angle θ du centre et à l'angle de position φ s'écrit sans passer par la machinerie
 * testée — le test ne se valide pas lui-même.
 */
function vueCentree(mode: Vue['mode'], fovDeg: number): Vue {
  return { ...vue(mode, fovDeg), azimutDeg: 0, hauteurDeg: 0, rotationDeg: 0 }
}

function directionA(thetaDeg: number, phiDeg: number) {
  const t = (thetaDeg * Math.PI) / 180
  const p = (phiDeg * Math.PI) / 180
  return { x: Math.cos(t), y: Math.sin(t) * Math.cos(p), z: Math.sin(t) * Math.sin(p) }
}

/** Distance de corde : `acos` perd la moitié de ses chiffres près de zéro. */
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
   * T-0065 — `projetteEn` existe pour que les boucles chaudes n'allouent rien ; `projette`
   * n'en est que l'emballage. Ce test est la garantie que §3.3 tient encore : deux formes
   * de la même projection, un seul résultat, y compris hors du domaine projetable et au
   * point singulier du fisheye.
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
      // Le centre de visée : c'est là que le fisheye prend sa branche singulière.
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

        // Même rayon depuis le centre du canevas : la direction est identique, seule la
        // distance radiale diffère — c'est la déformation de projection, pas un décalage.
        const angleA = Math.atan2(a!.yPx - HAUTEUR / 2, a!.xPx - LARGEUR / 2)
        const angleB = Math.atan2(b!.yPx - HAUTEUR / 2, b!.xPx - LARGEUR / 2)
        expect(angleA).toBeCloseTo(angleB, 9)

        // L'angle au centre de visée se relit dans le rayon projeté, par la réciproque de
        // §3.3 : c'est ce que le point portait avant T-0111, et la propriété reste vérifiée
        // là où elle se démontre — sur ce que la projection produit réellement.
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
      // Le rapport ne dépend que de θ, jamais de l'azimut : aucune divergence privilégiant
      // une direction du champ.
      for (const rapport of rapports) expect(rapport).toBeCloseTo(rapports[0]!, 9)
      // Les deux modes cadrent le même champ : ils coïncident exactement au bord, et
      // s'écartent de moins de 2 % au centre. C'est la déformation de projection, admise
      // par le PRD, et elle ne dépend que de θ.
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
    // Le point diamétralement opposé au centre n'est pas projetable : il est écarté, pas
    // renvoyé à l'infini.
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
   * T-0100 — non-régression du bug corrigé : un fond de ciel HORS TABLE ne suspend plus le
   * plafond. Sous la Lune, `sb_effectif` descend sous la dernière ligne de la table ; la
   * version fautive rendait alors la magnitude du zoom, donc PLUS d'étoiles qu'un ciel de
   * banlieue. Le plafond se pose au-delà du bord de table — T-0357 : au seuil de Schaefer,
   * sous la magnitude du bord —, et le déclare.
   */
  it('plafonne encore quand le fond de ciel sort de la table Bortle', () => {
    const horsTableClair = SB_PLAFOND_TABLE - 1
    const sousLaLune = magnitudeRendue(60, horsTableClair, true)
    expect(sousLaLune.value).toBeLessThan(M_LIM_OEIL_PLANCHER)
    expect(sousLaLune.value).toBeLessThan(magnitudeRendue(60, interpoleBortle(9).sb, true).value + 1e-9)
    expect(sousLaLune.note).toMatch(/plus clair que Bortle 9/)
    expect(sousLaLune.flags).toContain('HORS_DOMAINE')

    // L'autre bord : un SQM plus sombre que la table ne fait pas tomber le plafond non plus.
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
    // Stéréographique et équidistante passent 180° : ni 2·tan(θ/2) ni θ ne divergent. La
    // gnomonique, seule, reste dessous (T-0220).
    expect(fovMaxSelonMode('MODE_PLANETARIUM')).toBeGreaterThan(K('FOV_MAX_DEG'))
    expect(fovMaxSelonMode('MODE_FISHEYE')).toBeGreaterThan(K('FOV_MAX_DEG'))
    expect(fovMaxSelonMode('MODE_CADRE')).toBeLessThan(K('FOV_MAX_DEG'))
    // Le plancher lié au catalogue et le plafond lié à la projection sont indépendants : le
    // paquet Gaia ne change pas ce que tan(θ) fait au bord du champ.
    expect(bornesZoom(true, 'MODE_CADRE').fovMaxDeg).toBe(K('FOV_MAX_GNOMONIQUE_DEG'))
    expect(bornesZoom(false, 'MODE_CADRE').fovMaxDeg).toBe(K('FOV_MAX_GNOMONIQUE_DEG'))
  })

  it('garde une échelle utilisable au plafond gnomonique, là où 180° effondre la scène', () => {
    // R(θ) = tan(θ) et l'échelle vaut (largeur / 2) / R(fov / 2). Au plafond elle est du même
    // ordre que la demi-largeur du canevas ; à 180° elle s'annule à la précision machine et
    // toutes les étoiles tombent sur le pixel central — rien ne plante, tout disparaît.
    const auPlafond = echelleProjection(vue('MODE_CADRE', K('FOV_MAX_GNOMONIQUE_DEG')))
    const a180 = echelleProjection(vue('MODE_CADRE', K('FOV_MAX_DEG')))
    expect(auPlafond).toBeGreaterThan(1)
    expect(a180).toBeLessThan(auPlafond * 1e-9)
    // Les deux projections que le plafond de §3.3 conserve gardent, elles, une échelle du même
    // ordre de grandeur : ni 2·tan(θ/2) ni θ ne divergent à 90°.
    for (const mode of ['MODE_PLANETARIUM', 'MODE_FISHEYE'] as const) {
      expect(echelleProjection(vue(mode, K('FOV_MAX_DEG')))).toBeGreaterThan(auPlafond * 1e-9)
    }
  })

  it('couvre le coin du canevas, à tout champ et dans les trois modes', () => {
    // Le rayon de calotte sert à ÉCARTER : s'il sous-estime le champ, il efface de la
    // géométrie visible. Le coin du canevas est le point le plus éloigné du centre de visée —
    // sa séparation angulaire réelle doit tenir dans le rayon annoncé, y compris là où
    // l'approximation petit-angle (fov / 2) × diagonale se trompait le plus : au grand champ.
    for (const mode of ['MODE_PLANETARIUM', 'MODE_CADRE', 'MODE_FISHEYE'] as const) {
      for (const part of [0.02, 0.25, 0.6, 1]) {
        const v = vue(mode, fovMaxSelonMode(mode) * part)
        const p = projecteur(v, IDENTITE)
        const centre = p.inverse(LARGEUR / 2, HAUTEUR / 2)
        const coin = separationDeg(centre, p.inverse(0, 0))
        const rayon = rayonChampDeg(v)
        expect(rayon).toBeCloseTo(coin, 6)
        // Une calotte reste une calotte : jamais plus que le ciel entier.
        expect(rayon).toBeLessThan(K('FOV_MAX_DEG'))
      }
    }
  })

  it('borne l’équidistante à l’antipode, même quand le canevas le dépasse (T-0220)', () => {
    // Canevas portrait : au plafond, le coin est à plus de 180° du centre en R = θ. Au-delà
    // du cercle antipodal il n'y a plus de ciel — ni la calotte ni un clic ne le passent.
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
    // Centre de visée en (1, 0, 0) : l'antipode est (−1, 0, 0), à la longitude 180°.
    expect(p.projette(versVecteur(180 - 2 * marge, 0))).not.toBeNull()
    expect(p.projette(versVecteur(180 - marge / 2, 0))).toBeNull()
    expect(p.projette(versVecteur(180 + marge / 2, 0))).toBeNull()
  })

  it('voit au-delà de l’hémisphère au plafond stéréographique', () => {
    // Le plafond de la calotte valait FOV_MAX_DEG / 2 = 90° : au plafond stéréographique le
    // coin est plus loin que cela, et tout ce qui s'y trouve était écarté de la sélection.
    const auPlafond = rayonChampDeg(vue('MODE_PLANETARIUM', K('FOV_MAX_STEREOGRAPHIQUE_DEG')))
    expect(auPlafond).toBeGreaterThan(K('FOV_MAX_DEG') / 2)
  })

  it('refuse un point projeté hors de portée, singularité comprise', () => {
    // Près de l'antipode de la visée, le facteur radial diverge : le point est « projetable »
    // au sens de la formule, mais à des dizaines de milliers de pixels. Deux voisins d'une
    // polyligne y tombent de part et d'autre du canevas, et la corde traverse l'image.
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

    // Juste hors du champ affiché : toujours projeté, c'est ce qui permet aux polylignes de
    // sortir proprement de l'image.
    const horsChamp = proj.projette(versVecteur(vue.fovDeg, 0))
    expect(horsChamp).not.toBeNull()
    expect(Math.hypot(horsChamp!.xPx - vue.largeurPx / 2, horsChamp!.yPx - vue.hauteurPx / 2))
      .toBeGreaterThan(vue.largeurPx / 2)

    // À un degré de l'antipode : refusé.
    expect(proj.projette(versVecteur(179, 0))).toBeNull()
  })

  it('fait décroître le rayon d’une étoile avec sa magnitude', () => {
    expect(rayonEtoilePx(0)).toBeCloseTo(K('RAYON_ETOILE_R0_PX'), 9)
    expect(rayonEtoilePx(5) / rayonEtoilePx(0)).toBeCloseTo(10 ** (-0.15 * 5), 9)
    expect(rayonEtoilePx(6)).toBeLessThan(rayonEtoilePx(1))
  })
})

/**
 * T-0258 — le centre de visée sort de sous les cartes.
 *
 * Le canevas couvre toute la coque, mais le rail de la vue et le panneau de séance s'y posent en
 * permanence. Le pointage doit tomber au milieu de ce qui RESTE visible, sinon on change la
 * focale sans jamais voir le cadre qu'elle produit (§11.3).
 */
describe('T-0258 — le centre de visée décalé', () => {
  const DECALAGE_PX = -154

  function vueDecalee(): Vue {
    return { ...vueCentree('MODE_PLANETARIUM', 60), decalageCentreXPx: DECALAGE_PX }
  }

  it('pose la direction visée au centre décalé, pas au milieu du canevas', () => {
    const proj = projecteur(vueDecalee(), IDENTITE)
    // `vueCentree` vise l'axe x : c'est la direction que le pointage nomme, écrite sans passer
    // par la projection testée.
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
    // Le centre décalé n'est plus à égale distance des deux bords : garder la demi-largeur
    // rejetterait sur une calotte trop petite et effacerait la géométrie du bord opposé (T-0110).
    const droit = vueCentree('MODE_PLANETARIUM', 60)
    const decale = vueDecalee()
    expect(rayonChampDeg(decale)).toBeGreaterThan(rayonChampDeg(droit))

    const proj = projecteur(decale, IDENTITE)
    // Le coin le plus éloigné du centre décalé : à droite, puisque le centre est parti à gauche.
    // La calotte lui est TANGENTE — c'est sa définition : elle couvre le canevas sans le
    // déborder, et le coin opposé y tient donc aussi.
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
