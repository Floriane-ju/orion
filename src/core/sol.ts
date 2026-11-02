/**
 * §3.3 / §4.1 — le sol du site, opposé au projecteur plutôt qu'au dessin.
 *
 * Masquer ce qui est sous l'horizon pourrait se peindre : un polygone noir par-dessus la
 * scène. Ce serait un second code de géométrie — la frontière du polygone est la projection
 * d'un grand cercle, elle se referme différemment selon la visée, et §3.3 interdit qu'une
 * deuxième projection existe quelque part.
 *
 * Ici, rien n'est peint : le fond de ciel est déjà noir, et une direction sous le sol devient
 * simplement NON PROJETABLE. Toutes les passes de rendu traversent `projetteEn` et savent
 * déjà traiter ce cas — la polyligne se rompt, la boucle par étoile passe au suivant, la cible
 * de clic n'est jamais poussée. Le masque, la rupture des tracés et la disparition des cibles
 * sortent donc d'une seule décision, prise à un seul endroit.
 *
 * Le sol suit le relief relevé au panneau Lieu (§4.1). Sans relevé, le masque est le repli
 * plat à 0° : le test se réduit alors au signe de la composante verticale, sans une seule
 * fonction transcendante — c'est le cas courant, il ne paie pas le cas général.
 */

import { DEG, type Mat3, type Vec3 } from './mat3.ts'
import { obstructionDessinDeg, type MasqueHorizon } from './site.ts'
import { pointEcran, type PointEcran, type Projecteur } from './projection.ts'

/** Prédicat d'une image : la direction J2000 est-elle sous le sol du site ? */
export type TestSol = (x: number, y: number, z: number) => boolean

/**
 * Compose le prédicat pour une matrice de ciel donnée. Il n'alloue rien : la boucle par
 * étoile l'appelle des milliers de fois par image (T-0065), et les composantes du vecteur
 * horizontal restent des scalaires locaux.
 */
export function sousLeSol(masque: MasqueHorizon, matriceCiel: Mat3): TestSol {
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = matriceCiel

  if (masque.estHypothese) {
    // Horizon plat supposé : sous le sol ⟺ hauteur négative ⟺ verticale négative.
    return (x, y, z) => m31 * x + m32 * y + m33 * z < 0
  }

  return (x, y, z) => {
    const haut = m31 * x + m32 * y + m33 * z
    const nord = m11 * x + m12 * y + m13 * z
    const est = m21 * x + m22 * y + m23 * z
    const obstruction = obstructionDessinDeg(masque, Math.atan2(est, nord) / DEG)
    if (obstruction === 0) return haut < 0
    // Comparaison des sinus plutôt que des angles : elle évite l'arc sinus, et vaut pour une
    // direction de norme quelconque — la matrice de ciel est une rotation, la norme se lit
    // donc sur le vecteur d'entrée.
    return haut < Math.sin(obstruction * DEG) * Math.sqrt(x * x + y * y + z * z)
  }
}

/**
 * T-0098 — la direction J2000 est-elle SOUS cette hauteur au-dessus de l'horizon ?
 *
 * Même géométrie que `sousLeSol`, à ceci près que la frontière est un parallèle de hauteur et
 * non le relief : c'est ce prédicat que le halo d'horizon balaie, palier par palier. Le
 * partager avec le sol garantit qu'un palier et la crête se referment de la même façon.
 */
export function sousLaHauteur(hauteurDeg: number, matriceCiel: Mat3): TestSol {
  const [, , , , , , m31, m32, m33] = matriceCiel
  const sin = Math.sin(hauteurDeg * DEG)
  return (x, y, z) =>
    m31 * x + m32 * y + m33 * z < sin * Math.sqrt(x * x + y * y + z * z)
}

/**
 * Le même projecteur, aveugle à ce qui est sous le sol.
 *
 * `inverse` n'est pas filtré : elle répond ce que le curseur désigne, y compris le sol. Un
 * point de l'écran a une direction même quand rien n'y est dessiné.
 */
export function projecteurSansSol(
  base: Projecteur,
  masque: MasqueHorizon,
  matriceCiel: Mat3,
): Projecteur {
  const enterre = sousLeSol(masque, matriceCiel)
  return {
    ...base,
    projetteEn(x, y, z, out) {
      if (enterre(x, y, z)) return false
      return base.projetteEn(x, y, z, out)
    },
    projette(v: Vec3): PointEcran | null {
      if (enterre(v.x, v.y, v.z)) return null
      const out = pointEcran()
      return base.projetteEn(v.x, v.y, v.z, out) ? out : null
    },
  }
}
