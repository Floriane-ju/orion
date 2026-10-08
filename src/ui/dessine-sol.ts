/**
 * §4.1 — le sol du site, peint.
 *
 * Écarter les sommets sous l'horizon ne suffit pas : la bande de la Voie lactée est un TRAIT
 * ÉPAIS de la largeur d'une tranche de latitude, et sa largeur débordait sous l'horizon là où
 * ses sommets étaient déjà écartés. Un masque qui laisse passer la moitié d'un trait n'est pas
 * un masque. Le sol se peint donc, opaque, avant les repères.
 *
 * La frontière se cherche en espace écran — voir `balayage-ecran.ts`, qui porte la géométrie
 * et la raison de ce choix. Le halo d'horizon (T-0098) balaie exactement de la même façon.
 */

import { versVecteur, type Mat3, type Vec3 } from '../core/mat3.ts'
import { pointEcran, type Projecteur } from '../core/projection.ts'
import type { MasqueHorizon } from '../core/site.ts'
import { sousLeSol } from '../core/sol.ts'
import {
  frontiereEcran,
  remplitRegion,
  type FrontiereEcran,
} from './balayage-ecran.ts'
import { champVisible, horsDuChamp, type ChampVisible } from './champ-visible.ts'
import { calotte } from './traces-ciel.ts'

/**
 * La clé d'une frontière : la visée et rien d'autre. Le sol est fixe dans le repère du site —
 * `inverse` passe en J2000 par la matrice de ciel, le prédicat en revient par la même — donc
 * l'heure qui tourne ne le déplace pas à l'écran. Le recalcul ne se paie qu'au panoramique.
 */
export function cleVue(projecteur: Projecteur): string {
  const v = projecteur.vue
  return [
    v.mode,
    v.fovDeg,
    v.largeurPx,
    v.hauteurPx,
    v.azimutDeg,
    v.hauteurDeg,
    v.rotationDeg,
    v.decalageCentreXPx ?? 0,
  ].join('|')
}

let dernier: { cle: string; masque: MasqueHorizon; frontiere: FrontiereEcran } | null = null

/**
 * T-0397 — les courbes de niveau prêtes à projeter : les points en vecteurs du repère du site
 * (nord, est, zénith), et pour chaque polyligne son étendue et sa calotte englobante.
 *
 * Tout ceci est fixe tant que le masque l'est : la trigonométrie et les calottes se paient à la
 * première image, et chaque image suivante n'écarte une polyligne hors du champ que d'un
 * produit scalaire — un panoramique ne projette plus le tour d'horizon entier.
 */
interface CourbesPretes {
  /** Trois nombres par point ; un séparateur garde sa place, en NaN. */
  readonly directions: Float32Array
  readonly lignes: readonly LignePrete[]
}

/** Une polyligne : son premier point, celui qui suit son dernier, et sa calotte englobante. */
interface LignePrete {
  readonly debut: number
  readonly fin: number
  readonly englobe: ChampVisible | null
}

const pretesMemo = new WeakMap<Float32Array, CourbesPretes>()

function courbesPretes(courbes: Float32Array): CourbesPretes {
  const connues = pretesMemo.get(courbes)
  if (connues !== undefined) return connues
  const nbPoints = courbes.length / 2
  const directions = new Float32Array(nbPoints * 3)
  const lignes: LignePrete[] = []
  let debut = 0
  const ferme = (fin: number): void => {
    if (fin - debut < 2) return
    const points: Vec3[] = []
    for (let k = debut; k < fin; k++) {
      points.push({ x: directions[3 * k]!, y: directions[3 * k + 1]!, z: directions[3 * k + 2]! })
    }
    lignes.push({ debut, fin, englobe: calotte(points) })
  }
  for (let k = 0; k < nbPoints; k++) {
    const az = courbes[2 * k]!
    if (Number.isNaN(az)) {
      directions.fill(Number.NaN, 3 * k, 3 * k + 3)
      ferme(k)
      debut = k + 1
      continue
    }
    const v = versVecteur(az, courbes[2 * k + 1]!)
    directions[3 * k] = v.x
    directions[3 * k + 1] = v.y
    directions[3 * k + 2] = v.z
  }
  ferme(nbPoints)
  const pretes: CourbesPretes = Object.freeze({ directions, lignes: Object.freeze(lignes) })
  pretesMemo.set(courbes, pretes)
  return pretes
}

const point = pointEcran()

function traceCourbes(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  matriceCiel: Mat3,
  courbes: Float32Array,
  couleur: string,
): void {
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = matriceCiel
  const { directions, lignes } = courbesPretes(courbes)
  // Le champ, ramené de J2000 dans le repère du site : une rotation par image, plutôt qu'une
  // par calotte.
  const champJ2000 = champVisible(projecteur)
  const c = champJ2000.centre
  const champ: ChampVisible = {
    centre: {
      x: m11 * c.x + m12 * c.y + m13 * c.z,
      y: m21 * c.x + m22 * c.y + m23 * c.z,
      z: m31 * c.x + m32 * c.y + m33 * c.z,
    },
    rayonDeg: champJ2000.rayonDeg,
  }
  ctx.strokeStyle = couleur
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const { debut, fin, englobe } of lignes) {
    if (englobe !== null && horsDuChamp(champ, englobe.centre, englobe.rayonDeg)) continue
    let enchaine = false
    for (let j = 3 * debut; j < 3 * fin; j += 3) {
      const n = directions[j]!
      const e = directions[j + 1]!
      const u = directions[j + 2]!
      // Du repère du site vers J2000 : la transposée de la matrice de ciel, en scalaires.
      const projete = projecteur.projetteEn(
        m11 * n + m21 * e + m31 * u,
        m12 * n + m22 * e + m32 * u,
        m13 * n + m23 * e + m33 * u,
        point,
      )
      if (!projete) {
        enchaine = false
        continue
      }
      if (enchaine) ctx.lineTo(point.xPx, point.yPx)
      else ctx.moveTo(point.xPx, point.yPx)
      enchaine = true
    }
  }
  ctx.stroke()
}

/**
 * Peint le sol, puis ses courbes de niveau.
 *
 * T-0395 — la crête n'est plus soulignée d'un trait : les courbes de niveau dessinent déjà le
 * relief, et un liseré plus clair au sommet les coiffait d'une ligne qui ne suit aucune
 * altitude. Les courbes se tracent seules, sans balayage d'écran : ce qu'un relief plus proche
 * cache est déjà retiré dans le repère du site (`courbesNiveau`).
 */
export function dessineSol(
  ctx: CanvasRenderingContext2D,
  projecteur: Projecteur,
  matriceCiel: Mat3,
  masque: MasqueHorizon,
  couleurs: { readonly sol: string; readonly courbes: string },
): void {
  const cle = cleVue(projecteur)
  if (dernier === null || dernier.cle !== cle || dernier.masque !== masque) {
    dernier = { cle, masque, frontiere: frontiereEcran(projecteur, sousLeSol(masque, matriceCiel)) }
  }
  const { frontiere } = dernier
  remplitRegion(ctx, frontiere, couleurs.sol)
  if (masque.courbesDeg !== undefined && masque.courbesDeg.length > 0) {
    traceCourbes(ctx, projecteur, matriceCiel, masque.courbesDeg, couleurs.courbes)
  }
}
