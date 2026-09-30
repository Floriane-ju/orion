/**
 * §3.5 — Superposition du cadre matériel.
 *
 * Le cadre est un OBJET DE LA SCÈNE, projeté par le moteur de §3.3 : à grand champ, ses
 * bords ne sont pas des droites. Un rectangle dessiné à côtés droits mentirait sur ce que
 * l'objectif capture réellement — un objectif de 10 mm couvre 130° de diagonale, et cette
 * courbure est le fait dominant du cadrage grand champ.
 *
 * Ses dimensions viennent de §5.1, donc de l'arctangente, jamais de l'approximation
 * linéaire. C'est la couture entre le planétarium et tous les moteurs.
 *
 * T-0219 — le cadre s'inverse par la projection de L'OBJECTIF : gnomonique pour un
 * rectilinéaire, équidistante pour un fisheye. Un fisheye inversé en gnomonique dessinait le
 * cadre d'un autre objectif, et divergeait à 180° de champ.
 */

import { K } from '../registry/constants.ts'
import { degres } from '../registry/ecriture.ts'
import { RAPPORT_AXES_ORIENTATION } from '../registry/verdicts.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { directionDuPlan, matriceVue, rayonProjete, type ModeProjection } from './projection.ts'
import {
  DEG,
  applique,
  transpose,
  versVecteur,
  type Mat3,
  type Vec3,
} from './mat3.ts'
import { ARCMIN_PAR_DEG, DEMI_TOUR_DEG, ramene } from './unites.ts'

export interface ProfilCadre {
  readonly libelle: string
  /** Champ de la grande dimension du capteur (§5.1). */
  readonly fovLDeg: number
  readonly fovHDeg: number
  /** Projection physique de l'objectif : `MODE_CADRE` (rectilinéaire) ou `MODE_FISHEYE`. */
  readonly modeObjectif: ModeProjection
  readonly echApx: number
  /** Petite dimension du capteur : c'est elle qui donne la focale idéale d'une cible (§6.1). */
  readonly capteurHMm: number
  /** Pose affichée sur le cadre : optimale avec suivi, NPF sans (§7.2, §9.1). */
  readonly tPoseS: number | null
}

/** Demi-dimensions du cadre dans le plan de projection de son objectif, en unités de R. */
function demiPlan(profil: ProfilCadre): { readonly uMax: number; readonly vMax: number } {
  return {
    uMax: rayonProjete(profil.modeObjectif, (profil.fovLDeg / 2) * DEG),
    vMax: rayonProjete(profil.modeObjectif, (profil.fovHDeg / 2) * DEG),
  }
}

export interface Cadre {
  readonly profil: ProfilCadre
  readonly azimutDeg: number
  readonly hauteurDeg: number
  readonly rotationDeg: number
}

/**
 * Contour du cadre en directions J2000, prêt pour le projecteur. Chaque bord est une
 * polyligne : c'est ce qui rend la courbure visible en projection stéréographique.
 */
export function contourCadreJ2000(cadre: Cadre, matriceCiel: Mat3): readonly Vec3[] {
  const { uMax, vMax } = demiPlan(cadre.profil)
  const pas = Math.max(1, Math.round(K('SUBDIVISION_CADRE')))

  // Repère local du cadre, roulis compris ; puis retour au repère équatorial J2000.
  const versHorizon = transpose(
    matriceVue(cadre.azimutDeg, cadre.hauteurDeg, cadre.rotationDeg),
  )
  const versJ2000 = transpose(matriceCiel)

  const coins: readonly (readonly [number, number])[] = [
    [-uMax, -vMax],
    [uMax, -vMax],
    [uMax, vMax],
    [-uMax, vMax],
  ]

  const points: Vec3[] = []
  for (let c = 0; c < coins.length; c++) {
    const [u0, v0] = coins[c]!
    const [u1, v1] = coins[(c + 1) % coins.length]!
    for (let i = 0; i < pas; i++) {
      const f = i / pas
      const u = u0 + (u1 - u0) * f
      const v = v0 + (v1 - v0) * f
      const local = directionDuPlan(cadre.profil.modeObjectif, u, v)
      points.push(applique(versJ2000, applique(versHorizon, local)))
    }
  }
  return points
}

export interface CelluleCadre {
  /** Position du centre de la cellule dans le cadre, de −1 (gauche, bas) à +1 (droite, haut). */
  readonly uFrac: number
  readonly vFrac: number
  /** Direction J2000 du centre de la cellule : sa déclinaison est `asin(dir.z)`. */
  readonly dir: Vec3
}

/**
 * §9.1 — centres des cellules de la carte de pose, dans la géométrie du cadre RÉELLEMENT
 * dessiné (T-0142).
 *
 * `cartePoseMax` échantillonne la même grille dans le repère équatorial, à partir d'une visée
 * et d'un roulis. Ici la grille part du cadre de la scène — azimut, hauteur, roulis du
 * boîtier — pour que chaque valeur tombe sur le pixel qu'elle décrit. Même inverse que le
 * contour ci-dessus : c'est le même objectif, il n'y en a pas deux.
 *
 * Les points sont les CENTRES des cellules, non leurs bords : un nombre peint dans une case
 * vaut pour ce qu'elle couvre, pas pour le trait qui la borde.
 */
export function cellulesCadreJ2000(
  cadre: Cadre,
  matriceCiel: Mat3,
  cote: number,
): readonly CelluleCadre[] {
  const { uMax, vMax } = demiPlan(cadre.profil)
  const versHorizon = transpose(
    matriceVue(cadre.azimutDeg, cadre.hauteurDeg, cadre.rotationDeg),
  )
  const versJ2000 = transpose(matriceCiel)

  const cellules: CelluleCadre[] = []
  for (let ligne = 0; ligne < cote; ligne++) {
    // Ligne 0 en haut du cadre, comme la carte de §9.1 : v décroît quand la ligne augmente.
    const vFrac = 1 - (2 * ligne + 1) / cote
    for (let colonne = 0; colonne < cote; colonne++) {
      const uFrac = (2 * colonne + 1) / cote - 1
      const u = uFrac * uMax
      const v = vFrac * vMax
      const local = directionDuPlan(cadre.profil.modeObjectif, u, v)
      cellules.push({ uFrac, vFrac, dir: applique(versJ2000, applique(versHorizon, local)) })
    }
  }
  return cellules
}

// ---------------------------------------------------------------------------
// Cible dominante et rotation suggérée
// ---------------------------------------------------------------------------

export interface CibleDansCadre {
  readonly objet: ObjetCielProfond
  /** Taille angulaire du grand axe, en degrés. */
  readonly tailleDeg: number
}


/**
 * Objet dominant du cadre : le plus étendu parmi ceux qui y tombent. C'est lui qui porte
 * le taux de remplissage et la rotation suggérée (§6.2).
 */
export function cibleDominante(
  objets: readonly ObjetCielProfond[],
  cadre: Cadre,
  matriceCiel: Mat3,
): CibleDansCadre | null {
  const versCadre = matriceVue(cadre.azimutDeg, cadre.hauteurDeg, cadre.rotationDeg)
  const mode = cadre.profil.modeObjectif
  const { uMax, vMax } = demiPlan(cadre.profil)

  let meilleure: CibleDansCadre | null = null
  for (const objet of objets) {
    if (objet.majAxArcmin === null) continue
    const local = applique(versCadre, applique(matriceCiel, versVecteur(objet.adDeg, objet.decDeg)))
    if (mode === 'MODE_CADRE' && local.z <= 0) continue
    const s = Math.hypot(local.x, local.y)
    const facteur = s <= Number.EPSILON ? 0 : rayonProjete(mode, Math.atan2(s, local.z)) / s
    if (Math.abs(local.x * facteur) > uMax || Math.abs(local.y * facteur) > vMax) continue
    const tailleDeg = objet.majAxArcmin / ARCMIN_PAR_DEG
    if (meilleure === null || tailleDeg > meilleure.tailleDeg) {
      meilleure = { objet, tailleDeg }
    }
  }
  return meilleure
}

export interface RotationSuggeree {
  /**
   * Angle de boîtier à appliquer, en degrés. `null` quand aucun angle n'est suggérable : le
   * message dit alors POURQUOI, plutôt que de laisser un silence à interpréter (§6.2).
   */
  readonly angleDeg: number | null
  readonly message: string
}


/** Rapport grand axe / petit axe. `null` quand le catalogue ne donne pas le petit axe. */
function rapportAxes(objet: ObjetCielProfond): number | null {
  if (objet.majAxArcmin === null) return null
  if (objet.minAxArcmin === null || objet.minAxArcmin === 0) return null
  return objet.majAxArcmin / objet.minAxArcmin
}

/**
 * Direction du grand axe de la cible dans les axes du capteur, mesurée depuis la GRANDE
 * dimension du cadre, roulis du boîtier compris. `null` sans angle de position au catalogue.
 *
 * L'angle de position du catalogue est équatorial ; le cadre, lui, vit dans le repère de
 * l'observateur : la conversion passe par les vecteurs tangents, jamais par une soustraction
 * d'angles qui ignorerait la rotation de champ.
 */
export function angleGrandAxeDansCadre(
  cible: CibleDansCadre,
  cadre: Cadre,
  matriceCiel: Mat3,
): number | null {
  const posAng = cible.objet.posAngDeg
  return posAng === null ? null : angleAxeDansCadre(posAng, cible, cadre, matriceCiel)
}

function angleAxeDansCadre(
  posAng: number,
  cible: CibleDansCadre,
  cadre: Cadre,
  matriceCiel: Mat3,
): number {
  const ad = cible.objet.adDeg * DEG
  const dec = cible.objet.decDeg * DEG
  // Vecteurs tangents nord et est à la position de l'objet, en J2000.
  const nord: Vec3 = {
    x: -Math.sin(dec) * Math.cos(ad),
    y: -Math.sin(dec) * Math.sin(ad),
    z: Math.cos(dec),
  }
  const est: Vec3 = { x: -Math.sin(ad), y: Math.cos(ad), z: 0 }
  const pa = posAng * DEG
  const axe: Vec3 = {
    x: Math.cos(pa) * nord.x + Math.sin(pa) * est.x,
    y: Math.cos(pa) * nord.y + Math.sin(pa) * est.y,
    z: Math.cos(pa) * nord.z + Math.sin(pa) * est.z,
  }

  const versCadre = matriceVue(cadre.azimutDeg, cadre.hauteurDeg, cadre.rotationDeg)
  const local = applique(versCadre, applique(matriceCiel, axe))
  // Un axe n'a pas de sens : deux directions opposées décrivent la même orientation.
  const brut = Math.atan2(local.y, local.x) / DEG
  return ramene(brut, DEMI_TOUR_DEG)
}

/**
 * §3.5 et §6.2 — angle alignant le grand axe de la cible sur la grande dimension du capteur.
 *
 * Trois issues, et chacune est dite : l'angle quand il existe, la cible trop ronde pour que
 * l'orientation change quoi que ce soit, l'angle de position absent du catalogue. Un `null`
 * muet laisserait croire à un calcul en cours ou à un cadrage déjà optimal.
 */
export function rotationSuggeree(
  cible: CibleDansCadre,
  cadre: Cadre,
  matriceCiel: Mat3,
): RotationSuggeree {
  const rapport = rapportAxes(cible.objet)
  if (rapport === null) {
    return {
      angleDeg: null,
      message:
        `Forme de ${cible.objet.designation} inconnue : pas d’orientation conseillée.`,
    }
  }
  if (rapport <= RAPPORT_AXES_ORIENTATION) {
    return {
      angleDeg: null,
      message:
        `${cible.objet.designation} est presque ronde : l’orientation du boîtier ne change rien.`,
    }
  }
  const posAng = cible.objet.posAngDeg
  if (posAng === null) {
    return {
      angleDeg: null,
      message:
        `${cible.objet.designation} est allongée, mais son orientation est inconnue : pas ` +
        'd’angle conseillé.',
    }
  }

  // L'angle se mesure dans le cadre SANS roulis : il donne alors directement le roulis à
  // appliquer pour amener le grand axe sur la grande dimension du capteur.
  const angleAxe = angleAxeDansCadre(posAng, cible, { ...cadre, rotationDeg: 0 }, matriceCiel)

  const paysage = cadre.profil.fovLDeg >= cadre.profil.fovHDeg
  const brut = paysage ? angleAxe : angleAxe - 90
  const angleDeg = ramene(brut, DEMI_TOUR_DEG)

  return {
    angleDeg,
    message:
      `Tournez de ${degres(angleDeg, 0)} pour aligner ${cible.objet.designation} sur la ` +
      'longueur du capteur. Valable à cette heure seulement.',
  }
}
