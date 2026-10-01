/**
 * §9.3 — Prévisualisation du filé d'étoiles.
 *
 * Trois choses doivent être EXACTES, et c'est là-dessus que la plupart des simulateurs
 * trichent :
 *
 *   1. LE PÔLE. Il est très souvent hors du cadre, et une prévisualisation qui le force dans
 *      l'image est fausse : elle induit un cadrage raté sur le terrain. L'application donne sa
 *      position réelle, hors bornes du canevas s'il le faut, et sa direction depuis la visée.
 *   2. LA GÉOMÉTRIE. En projection rectilinéaire, un cercle de déclinaison ne se projette pas
 *      en cercle : c'est une conique. Tracer des cercles concentriques est le raccourci
 *      classique, et il est faux à 130° de champ. Ici, chaque arc est la même étoile balayée
 *      en angle horaire et projetée par le moteur de §3.3.
 *      T-0115 — sauf en stéréographique, où le cercle n'est pas un raccourci mais une
 *      IDENTITÉ : `MODE_PLANETARIUM` projette par 2/(1 + z), soit R = 2·tan(θ/2) depuis
 *      l'antipode de la visée. Cette projection est conforme et conserve les cercles, donc un
 *      cercle de déclinaison s'y projette en cercle exact du plan. La mise en garde ci-dessus
 *      porte sur la rectilinéaire (`MODE_CADRE`) et sur l'équidistante (`MODE_FISHEYE`), qui
 *      ne les conservent pas : la polyligne y reste seule.
 *   3. LA LONGUEUR. Elle varie comme cos δ d'une étoile à l'autre dans le même cadre.
 *
 * Et le point que ratent la plupart des simulateurs : une étoile qui file est MOINS BRILLANTE
 * PAR PIXEL qu'une étoile ponctuelle, puisque le même flux s'étale sur toute la trace.
 */

import { K } from '../registry/constants.ts'
import { nombre } from '../registry/ecriture.ts'
import { DEG, applique, rotationAutourDe, separationDeg, type Vec3 } from './mat3.ts'
import { pointEcran, porteeUtilePx, type PointEcran, type Projecteur, type Vue } from './projection.ts'
import { trace, type Traced } from './traced.ts'
import { DEMI_TOUR_DEG, ecartCourt, encadre, MIN_PAR_H, ramene, TOUR_RAD } from './unites.ts'

export interface PositionPole {
  /** **Doit piloter l'affichage** : hors cadre, les arcs restent centrés hors du canevas. */
  readonly dansCadre: boolean
  /** Position dans le canevas. Peut être hors bornes, et le reste : rien n'est recentré. */
  readonly xPx: number | null
  readonly yPx: number | null
  readonly altitudeDeg: number
  readonly azimutDeg: number
}

/**
 * §9.3 — position du centre de rotation. Le pôle céleste est fixe dans le référentiel local :
 * son altitude vaut la latitude du site, son azimut le nord vrai dans l'hémisphère nord.
 */
export function positionPole(
  projecteur: Projecteur,
  latitudeDeg: number,
  axePoleNord: Vec3,
): PositionPole {
  const nord = latitudeDeg >= 0
  const pole: Vec3 = nord
    ? axePoleNord
    : { x: -axePoleNord.x, y: -axePoleNord.y, z: -axePoleNord.z }
  const largeur = projecteur.vue.largeurPx
  const hauteur = projecteur.vue.hauteurPx
  const point = projecteur.projette(pole)
  const dansCadre =
    point !== null &&
    point.xPx >= 0 &&
    point.yPx >= 0 &&
    point.xPx <= largeur &&
    point.yPx <= hauteur

  return {
    dansCadre,
    xPx: point?.xPx ?? null,
    yPx: point?.yPx ?? null,
    altitudeDeg: Math.abs(latitudeDeg),
    azimutDeg: nord ? 0 : DEMI_TOUR_DEG,
  }
}

/** §9.3 — longueur d'arc, variable d'une étoile à l'autre dans le même cadre. */
export function longueurArcDeg(dureeMin: number, decDeg: number): Traced<number> {
  return trace({
    value: K('ROTATION_CIEL_DEG_H') * (dureeMin / MIN_PAR_H) * Math.cos(decDeg * DEG),
    formula: 'ARC_FILE',
    inputs: { duree_min: dureeMin, dec_deg: decDeg },
    constants: ['ROTATION_CIEL_DEG_H'],
  })
}

/**
 * T-0115 — arc EXACT, en projection stéréographique seulement. Angles en radians, dans le
 * repère du canevas : `debutRad` est l'angle du départ vu du centre, `balayageRad` l'étendue
 * signée, négative quand l'arc tourne dans le sens antihoraire de l'écran.
 */
export interface ArcCercle {
  readonly xPx: number
  readonly yPx: number
  readonly rayonPx: number
  readonly debutRad: number
  readonly balayageRad: number
}

/** Boîte englobante d'un tracé, en pixels du canevas. */
export interface BoiteEcran {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export interface ArcFile {
  /** Polylignes en pixels — plusieurs dès que l'étoile sort du cadre puis y revient. */
  readonly segments: readonly (readonly PointEcran[])[]
  /**
   * Arc de cercle exact quand la projection en conserve un (T-0115). `segments` ne porte
   * alors que la position de départ : le tracé passe par `ctx.arc`, pas par la polyligne.
   */
  readonly cercle: ArcCercle | null
  readonly longueurPx: number
  /** Vrai quand l'étoile entre ou sort du champ pendant la séquence. */
  readonly tronque: boolean
  /**
   * Boîte englobante exacte de l'arc de cercle, `null` pour la polyligne.
   *
   * La polyligne se borne déjà elle-même : elle rompt son segment dès qu'un point sort du
   * canevas. Le cercle exact de T-0115, lui, part chez `ctx.arc` en un seul ordre, balayage
   * entier — un cercle de dix-sept mille pixels de rayon dont rien ne touche l'écran se
   * peignait donc intégralement. C'est cette boîte qui permet de le rejeter avant.
   */
  readonly boite: BoiteEcran | null
}

/**
 * L'arc ne touche pas le canevas, demi-trait compris : il n'y a rien à peindre.
 *
 * Le test porte sur la boîte, jamais sur un échantillonnage du balayage : une boîte disjointe
 * du canevas PROUVE que l'arc en est absent, là où des points espacés pourraient rater un
 * coin. Un arc dont la boîte recouvre l'écran sans le traverser sera peint pour rien — c'est
 * le prix de la certitude, et il est bien moindre que celui qu'on retire.
 */
export function arcInvisible(arc: ArcFile, vue: Vue, demiTraitPx: number): boolean {
  const b = arc.boite
  if (b === null) return false
  return (
    b.maxX < -demiTraitPx ||
    b.maxY < -demiTraitPx ||
    b.minX > vue.largeurPx + demiTraitPx ||
    b.minY > vue.hauteurPx + demiTraitPx
  )
}

/** Sous-arc du balayage, exprimé comme `ArcCercle` : prêt à partir chez `ctx.arc`. */
export interface SousArc {
  readonly debutRad: number
  readonly balayageRad: number
}

/** Ce point du cercle tombe-t-il dans le canevas élargi du demi-trait ? */
function dansCanevas(
  cercle: ArcCercle,
  angleRad: number,
  vue: Vue,
  margePx: number,
): boolean {
  const x = cercle.xPx + cercle.rayonPx * Math.cos(angleRad)
  const y = cercle.yPx + cercle.rayonPx * Math.sin(angleRad)
  return (
    x >= -margePx &&
    y >= -margePx &&
    x <= vue.largeurPx + margePx &&
    y <= vue.hauteurPx + margePx
  )
}

/**
 * Portions du balayage dont le tracé touche réellement le canevas.
 *
 * T-0115 confie l'arc à `ctx.arc` en un seul ordre, balayage entier. C'est exact et c'est
 * rapide à CALCULER — cinq projections au lieu de centaines — mais le rasteriseur, lui, parcourt
 * tout ce qu'on lui donne : un cercle de dix-sept mille pixels de rayon dont un dixième traverse
 * l'écran se peignait en entier. La polyligne qu'il a remplacée, elle, rompait son tracé au
 * bord. Cette fonction rend au cercle ce que la polyligne faisait gratuitement.
 *
 * Le découpage est EXACT, jamais échantillonné. Un cercle ne franchit le bord du canevas qu'aux
 * angles où il coupe l'une des quatre droites qui le portent : entre deux franchissements
 * consécutifs, il est tout entier dedans ou tout entier dehors, et le point milieu tranche. La
 * portion gardée est donc bornée par de vrais points de franchissement, pas par le pas d'un
 * échantillonnage qui pourrait raser un coin.
 */
export function arcsVisibles(
  cercle: ArcCercle,
  vue: Vue,
  margePx: number,
): readonly SousArc[] {
  const { rayonPx: r, xPx: cx, yPx: cy, debutRad, balayageRad } = cercle
  const etendue = Math.abs(balayageRad)
  if (etendue === 0 || r <= 0) return []
  const sens = balayageRad < 0 ? -1 : 1

  // Angles de franchissement des quatre droites du canevas élargi, ramenés dans le balayage.
  // `coupures` est exprimé en AVANCÉE le long du balayage, pas en angle absolu : le sens et
  // les tours multiples s'y résorbent, et le tri suffit ensuite.
  const coupures: number[] = [0, etendue]
  const ajoute = (angleRad: number): void => {
    for (let t = ramene((angleRad - debutRad) * sens, TOUR_RAD); t < etendue; t += TOUR_RAD) coupures.push(t)
  }
  for (const x of [-margePx, vue.largeurPx + margePx]) {
    const cos = (x - cx) / r
    if (cos >= -1 && cos <= 1) {
      const a = Math.acos(cos)
      ajoute(a)
      ajoute(-a)
    }
  }
  for (const y of [-margePx, vue.hauteurPx + margePx]) {
    const sin = (y - cy) / r
    if (sin >= -1 && sin <= 1) {
      const a = Math.asin(sin)
      ajoute(a)
      ajoute(Math.PI - a)
    }
  }
  coupures.sort((a, b) => a - b)

  const gardes: SousArc[] = []
  for (let i = 0; i < coupures.length - 1; i++) {
    const debut = coupures[i]!
    const fin = coupures[i + 1]!
    if (fin - debut <= 0) continue
    if (!dansCanevas(cercle, debutRad + sens * (debut + fin) / 2, vue, margePx)) continue
    const precedent = gardes[gardes.length - 1]
    // Deux portions gardées qui se touchent forment un seul ordre de tracé : sans cette
    // fusion, un cercle qui traverse l'écran de part en part partirait en quatre `ctx.arc`.
    if (precedent !== undefined && Math.abs(precedent.debutRad + precedent.balayageRad - (debutRad + sens * debut)) < Number.EPSILON * TOUR_RAD) {
      gardes[gardes.length - 1] = {
        debutRad: precedent.debutRad,
        balayageRad: precedent.balayageRad + sens * (fin - debut),
      }
    } else {
      gardes.push({ debutRad: debutRad + sens * debut, balayageRad: sens * (fin - debut) })
    }
  }
  return gardes
}

/**
 * Arc décrit par une étoile pendant la durée d'accumulation.
 *
 * L'appareil est fixe au sol : c'est le ciel qui tourne. Balayer l'angle horaire revient donc
 * à faire tourner l'étoile autour du pôle céleste dans le repère équatorial, la matrice de
 * l'image restant celle de l'instant de départ. Le code de projection est celui de §3.3, sans
 * une ligne de géométrie propre au filé.
 */
/**
 * T-0024 — longueur projetée d'un segment de polyligne, en pixels.
 *
 * Une flèche de polyligne vaut c²/8R pour une corde c sur un rayon projeté R : à 4 px de
 * corde, l'écart à la conique reste sous le pixel dès que le rayon dépasse 2 px, donc pour
 * tout arc visible. C'est la fidélité que §9.3 demande, tenue là où elle se juge.
 */
const PAS_ARC_PX = K('PAS_ARC_FILE_PX')
/** Segments du pré-échantillonnage qui estime la longueur projetée avant de la parcourir. */
const PRE_ECHANTILLONS = K('PRE_ECHANTILLONS_ARC_FILE')

/**
 * Longueur projetée approchée de l'arc, ou `null` si l'étoile n'est pas projetable partout.
 *
 * T-0111 — les longueurs se somment en `sqrt` et non en `Math.hypot` : la mise à l'échelle
 * anti-dépassement de `hypot` n'a rien à protéger sur une différence de deux abscisses de
 * canevas, et elle se payait à chaque pas de chaque arc.
 */
function longueurApprocheePx(
  projecteur: Projecteur,
  etoile: Vec3,
  balayageDeg: number,
  axePoleNord: Vec3,
): number | null {
  const rotation = rotationAutourDe(axePoleNord, -balayageDeg / PRE_ECHANTILLONS)
  let position = etoile
  let precedent = projecteur.projette(position)
  if (precedent === null) return null
  let longueur = 0
  for (let i = 0; i < PRE_ECHANTILLONS; i++) {
    position = applique(rotation, position)
    const point = projecteur.projette(position)
    if (point === null) return null
    const dx = point.xPx - precedent.xPx
    const dy = point.yPx - precedent.yPx
    longueur += Math.sqrt(dx * dx + dy * dy)
    precedent = point
  }
  return longueur
}

/**
 * T-0115 — positions projetées qui suffisent à un arc stéréographique : début, quarts,
 * milieu, fin. Trois d'entre elles déterminent le cercle, les cinq donnent le balayage.
 */
const ECHANTILLONS_CERCLE = K('ECHANTILLONS_CERCLE_FILE')
/**
 * Tampons de passe, hissés hors de la fonction pour le motif de `pointEcran` (T-0065) :
 * cinq positions et quatre écarts par étoile, des milliers d'étoiles par image — autant de
 * tableaux morts qui rendraient l'addition en saccades pendant un panoramique.
 */
const xsCercle = new Float64Array(ECHANTILLONS_CERCLE)
const ysCercle = new Float64Array(ECHANTILLONS_CERCLE)
const ecartsCercle = new Float64Array(ECHANTILLONS_CERCLE - 1)

/** Cet angle est-il traversé par le balayage ? Sert à borner l'arc, pas le cercle entier. */
function dansBalayage(angleRad: number, debutRad: number, balayageRad: number): boolean {
  const sens = balayageRad < 0 ? -1 : 1
  const depuisDebut = ramene((angleRad - debutRad) * sens, TOUR_RAD)
  return depuisDebut <= Math.abs(balayageRad)
}

/**
 * T-0115 — arc exact en projection stéréographique, ou `null` s'il faut la polyligne.
 *
 * `MODE_PLANETARIUM` projette par 2/(1 + z) : c'est la stéréographique depuis l'antipode de
 * la visée, elle est conforme et elle conserve les cercles. Le cercle de déclinaison balayé
 * par l'étoile s'y projette donc en cercle EXACT — cinq projections remplacent les centaines
 * de la polyligne sans rien approcher. La géométrie de §9.3 n'est pas relâchée, elle est
 * résolue en fermé.
 *
 * Deux replis, et ils portent le même défaut : un cercle de déclinaison qui frôle l'antipode
 * de la visée s'y projette en DROITE, rayon infini. La polyligne reprend alors la main.
 */
function arcStereographique(
  projecteur: Projecteur,
  etoile: Vec3,
  balayageDeg: number,
  axePoleNord: Vec3,
): ArcFile | null {
  const [r11, r12, r13, r21, r22, r23, r31, r32, r33] = rotationAutourDe(
    axePoleNord,
    -balayageDeg / (ECHANTILLONS_CERCLE - 1),
  )
  const out = pointEcran()
  let px = etoile.x
  let py = etoile.y
  let pz = etoile.z
  for (let i = 0; i < ECHANTILLONS_CERCLE; i++) {
    if (i > 0) {
      const x = r11 * px + r12 * py + r13 * pz
      const y = r21 * px + r22 * py + r23 * pz
      const z = r31 * px + r32 * py + r33 * pz
      px = x
      py = y
      pz = z
    }
    // Premier repli : une seule position non projetable, et l'arc passe au voisinage de la
    // singularité. La polyligne l'y coupe, un cercle ajusté sur les autres ne le ferait pas.
    if (!projecteur.projetteEn(px, py, pz, out)) return null
    xsCercle[i] = out.xPx
    ysCercle[i] = out.yPx
  }

  // Cercle circonscrit au départ, au milieu et à la fin. Trois points d'un cercle le
  // déterminent : rien n'est ajusté au sens des moindres carrés, il n'y a pas de résidu.
  const ax = xsCercle[0]!
  const ay = ysCercle[0]!
  const bx = xsCercle[2]!
  const by = ysCercle[2]!
  const cx = xsCercle[ECHANTILLONS_CERCLE - 1]!
  const cy = ysCercle[ECHANTILLONS_CERCLE - 1]!
  const det = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  // Positions confondues (durée nulle) ou alignées : il n'y a pas de cercle à tracer.
  if (det === 0) return null
  const a2 = ax * ax + ay * ay
  const b2 = bx * bx + by * by
  const c2 = cx * cx + cy * cy
  const centreX = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / det
  const centreY = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / det
  const rayonPx = Math.sqrt((ax - centreX) ** 2 + (ay - centreY) ** 2)
  // Second repli : au-delà de la portée utile, le rayon diverge et le cercle n'est plus une
  // position mais le voisinage de la singularité (§3.3). Le seuil existe déjà pour ce motif,
  // aucune constante nouvelle. `!(… <= …)` attrape aussi un rayon non fini.
  if (!(rayonPx <= porteeUtilePx(projecteur.vue))) return null

  const debutRad = Math.atan2(ay - centreY, ax - centreX)
  let angleAvant = debutRad
  let vote = 0
  for (let i = 1; i < ECHANTILLONS_CERCLE; i++) {
    const angle = Math.atan2(ysCercle[i]! - centreY, xsCercle[i]! - centreX)
    const ecart = ecartCourt(angleAvant, angle, TOUR_RAD)
    ecartsCercle[i - 1] = ecart
    vote += ecart > 0 ? 1 : ecart < 0 ? -1 : 0
    angleAvant = angle
  }
  // Le balayage écran peut dépasser le demi-tour : un écart de plus de 180° se replie alors
  // du mauvais côté et retirerait un tour entier. Le sens vient donc d'un VOTE — le balayage
  // total restant sous le tour complet, un seul des quatre écarts peut dépasser 180°, et les
  // trois autres tranchent. Chaque écart est ensuite ramené dans ce sens.
  const sens = vote >= 0 ? 1 : -1
  let balayageRad = 0
  for (let i = 0; i < ECHANTILLONS_CERCLE - 1; i++) {
    const ecart = ecartsCercle[i]!
    balayageRad += ecart * sens < 0 ? ecart + sens * TOUR_RAD : ecart
  }

  // Boîte englobante EXACTE de l'arc : ses deux extrémités, plus ceux des quatre extrêmes du
  // cercle que le balayage traverse réellement. C'est elle qui dit si la trace sort du cadre.
  let minX = Math.min(ax, cx)
  let maxX = Math.max(ax, cx)
  let minY = Math.min(ay, cy)
  let maxY = Math.max(ay, cy)
  for (let angle = 0; angle < TOUR_RAD; angle += Math.PI / 2) {
    if (!dansBalayage(angle, debutRad, balayageRad)) continue
    const x = centreX + rayonPx * Math.cos(angle)
    const y = centreY + rayonPx * Math.sin(angle)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  return {
    segments: [[{ xPx: ax, yPx: ay }]],
    cercle: { xPx: centreX, yPx: centreY, rayonPx, debutRad, balayageRad },
    // Longueur d'arc, pas somme de cordes : c'est elle qui décide disque contre trait.
    longueurPx: rayonPx * Math.abs(balayageRad),
    tronque:
      minX < 0 || minY < 0 || maxX > projecteur.vue.largeurPx || maxY > projecteur.vue.hauteurPx,
    boite: { minX, minY, maxX, maxY },
  }
}

export function arcEtoile(
  projecteur: Projecteur,
  etoile: Vec3,
  dureeMin: number,
  axePoleNord: Vec3,
): ArcFile {
  const largeur = projecteur.vue.largeurPx
  const hauteur = projecteur.vue.hauteurPx
  const balayageDeg = K('ROTATION_CIEL_DEG_H') * (dureeMin / MIN_PAR_H)
  if (projecteur.vue.mode === 'MODE_PLANETARIUM') {
    const exact = arcStereographique(projecteur, etoile, balayageDeg, axePoleNord)
    if (exact !== null) return exact
  }
  const pasDeg = K('PAS_ANGLE_HORAIRE_FILE_DEG')
  // Pas de référence de §9.3 : 0,25° d'angle horaire, soit 481 positions à 480 min. Il reste
  // le pas LE PLUS FIN — rien ne gagne à subdiviser plus loin.
  const pasFin = Math.max(1, Math.ceil(balayageDeg / pasDeg))
  // T-0024 — une étoile à un degré du pôle décrit une trace de quelques pixels : elle payait
  // les mêmes 481 pas qu'une étoile de l'équateur céleste traversant tout le cadre. Le
  // comptage suit désormais la longueur PROJETÉE, là où se juge la fidélité à la conique.
  // Estimation impossible (étoile non projetable sur tout le balayage) : on garde le pas fin.
  const estimation = longueurApprocheePx(projecteur, etoile, balayageDeg, axePoleNord)
  const pas =
    estimation === null
      ? pasFin
      : encadre(Math.ceil(estimation / PAS_ARC_PX), 1, pasFin)
  // Rotation élémentaire autour du pôle céleste de l'époque, appliquée de proche en proche :
  // l'angle horaire croît, donc l'ascension droite apparente décroît d'autant.
  // T-0111 — la matrice est déstructurée ici et le produit écrit à la main dans la boucle :
  // `applique` alloue un vecteur par pas, soit un objet mort par position de chaque étoile,
  // et cette seule allocation pesait un quart de la passe. L'ordre des opérations est celui
  // de `applique`, au terme près : la trajectoire reste bit à bit la même.
  const [r11, r12, r13, r21, r22, r23, r31, r32, r33] = rotationAutourDe(
    axePoleNord,
    -balayageDeg / pas,
  )

  const segments: PointEcran[][] = []
  let courant: PointEcran[] = []
  let longueurPx = 0
  let tronque = false
  let precedentX = 0
  let precedentY = 0
  let precedent = false
  let px = etoile.x
  let py = etoile.y
  let pz = etoile.z
  // Point de travail unique : seules les positions RETENUES deviennent un objet. Les autres
  // — non projetables — n'en coûtaient un que pour être aussitôt jetées.
  const out = pointEcran()

  for (let i = 0; i <= pas; i++) {
    if (i > 0) {
      const x = r11 * px + r12 * py + r13 * pz
      const y = r21 * px + r22 * py + r23 * pz
      const z = r31 * px + r32 * py + r33 * pz
      px = x
      py = y
      pz = z
    }
    const projetable = projecteur.projetteEn(px, py, pz, out)
    const xPx = out.xPx
    const yPx = out.yPx
    const dedans = projetable && xPx >= 0 && yPx >= 0 && xPx <= largeur && yPx <= hauteur
    if (projetable) {
      // Le point qui sort est conservé : sans lui, la trace s'arrêterait avant le bord.
      courant.push({ xPx, yPx })
      if (precedent) {
        const dx = xPx - precedentX
        const dy = yPx - precedentY
        longueurPx += Math.sqrt(dx * dx + dy * dy)
      }
    }
    if (!dedans) {
      tronque = true
      if (courant.length > 0) segments.push(courant)
      courant = []
      precedent = false
    } else {
      precedentX = xPx
      precedentY = yPx
      precedent = true
    }
  }
  if (courant.length > 0) segments.push(courant)

  // Pas de boîte : la polyligne s'est bornée elle-même, segment par segment, en rompant dès
  // qu'un point sortait du canevas.
  return { segments, cercle: null, longueurPx, tronque, boite: null }
}

/**
 * §9.3 — temps que l'étoile passe sur UN pixel pendant la séquence.
 *
 * C'est le point que ratent la plupart des simulateurs : une étoile qui file est moins
 * brillante par pixel qu'une étoile ponctuelle, puisque le même flux s'étale sur toute la
 * trace. La pose vue par un pixel n'est pas la durée de la séquence, mais cette durée divisée
 * par la longueur de la trace — et c'est elle qui décide si la trace ressort du fond de ciel.
 */
export function poseParPixelS(dureeS: number, echApx: number, decDeg: number): number {
  // Un degré par heure vaut une arcseconde par seconde : le temps de traversée d'un pixel se
  // lit directement dans l'échantillonnage. Il ne dépend PAS de la durée de la séquence —
  // allonger le filé allonge la trace, il ne l'éclaircit pas.
  const traverseeS = echApx / (K('ROTATION_CIEL_DEG_H') * Math.max(Math.cos(decDeg * DEG), Number.EPSILON))
  return Math.min(dureeS, traverseeS)
}

export interface EntreeCouvertureFile {
  readonly projecteur: Projecteur
  /** Durée d'accumulation dessinée, en minutes. Nulle avec suivi : il n'y a pas de trace. */
  readonly dureeMin: number
  /** Fraction du canevas que les traces peuvent peindre (§9.3). */
  readonly couvertureMax: number
  /** Largeur de trait de référence, en pixels. */
  readonly largeurTraceRefPx: number
}

/**
 * §9.3 — T-0119 : combien d'étoiles le ciel peut porter sans que le filé cesse d'être lisible.
 *
 * Ce qui doit être borné n'est PAS le nombre d'étoiles, c'est la SURFACE PEINTE. Au-delà d'une
 * couverture de 1, chaque pixel du ciel est repeint plusieurs fois : la trace n'a plus de longueur
 * visible, le fond de ciel du planétarium disparaît dessous, et le temps de peinture est dépensé à
 * effacer ce qui vient d'être peint.
 *
 * Le raisonnement ne compte pas des étoiles, il compte des TRAVERSÉES. Un pixel donné est peint
 * autant de fois qu'il voit passer une étoile pendant la séquence. Le nombre de passages sur un
 * pixel vaut donc `densité d'étoiles × largeur angulaire de la trace × chemin parcouru`, soit
 * `n · w · ωT·cos δ` — et la couverture moyenne du canevas est la moyenne de cette quantité sur
 * le canevas. Inversée, elle donne l'effectif du ciel que la couverture visée autorise.
 *
 * Cette forme est ce qui rend le plafond STABLE. Trois écueils tombent d'eux-mêmes :
 *
 *   - **L'inclinaison de la visée.** Un plafond fondé sur la longueur d'arc au centre du champ
 *     s'effondre en visant le pôle, où cos δ tend vers zéro : la trace centrale est minuscule,
 *     mais le champ contient tout le reste du ciel. Ici cos δ est moyenné SUR LE CANEVAS, donc
 *     la visée polaire compte les longues traces de son bord au lieu de les ignorer.
 *   - **L'étirement de la projection.** La largeur angulaire d'une trace se lit par l'échelle
 *     LOCALE, mesurée en chaque échantillon : en stéréographique plein ciel le facteur radial
 *     diverge vers le bord, et une échelle unique se tromperait d'un facteur trois.
 *   - **Les étoiles hors du champ.** Compter des traversées, c'est compter ce qui passe, et non
 *     ce qui est là au premier instant. La moitié des traces d'un filé de huit heures vient
 *     d'étoiles qui n'étaient pas encore dans le champ ; un modèle d'appartenance les oublie.
 *
 * Rend `+Infinity` quand il n'y a pas de trace à borner — suivi actif, ou pose si brève que la
 * couverture est négligeable. L'appelant lit alors « aucun plafond », pas « plafond énorme ».
 */
export function effectifCielPourCouverture(entree: EntreeCouvertureFile): number {
  const balayageRad = longueurArcDeg(entree.dureeMin, 0).value * DEG
  if (balayageRad <= 0 || entree.largeurTraceRefPx <= 0) return Infinity

  const { projecteur } = entree
  const cotes = K('ECHANTILLONS_COUVERTURE_FILE')
  let somme = 0
  let retenus = 0
  for (let i = 0; i < cotes; i++) {
    for (let j = 0; j < cotes; j++) {
      // Échantillons au CENTRE des cellules d'une grille : les bords du canevas ne comptent pas
      // double, et le coin — où l'échelle stéréographique diverge le plus — ne domine pas la
      // moyenne à lui seul.
      const xPx = ((i + 1 / 2) / cotes) * projecteur.vue.largeurPx
      const yPx = ((j + 1 / 2) / cotes) * projecteur.vue.hauteurPx
      const direction = projecteur.inverse(xPx, yPx)
      // Échelle LOCALE, en radians par pixel : la séparation angulaire entre deux directions
      // distantes d'un pixel. Elle donne la largeur angulaire de la trace à cet endroit.
      const radParPx = separationDeg(direction, projecteur.inverse(xPx + 1, yPx)) * DEG
      if (!Number.isFinite(radParPx) || radParPx <= 0) continue
      // `z` est la composante polaire de la direction J2000 — le même repère que la pose par
      // pixel : son arc sinus est la déclinaison, donc `cos δ` vaut la norme de la part
      // équatoriale. La précession depuis J2000 vaut quelques minutes d'arc, sans effet sur une
      // moyenne qui règle un plafond de rendu.
      const cosDec = Math.hypot(direction.x, direction.y)
      somme += cosDec * radParPx * entree.largeurTraceRefPx
      retenus++
    }
  }
  if (retenus === 0) return Infinity
  const solideMoyenParEtoile = (somme / retenus) * balayageRad
  if (solideMoyenParEtoile <= 0) return Infinity
  // `couverture = (N / 4π) × solide balayé par étoile`, inversée sur N.
  return (entree.couvertureMax * 2 * TOUR_RAD) / solideMoyenParEtoile
}

export interface EntreeDiagnosticFile {
  readonly projecteur: Projecteur
  readonly latitudeDeg: number
  /** Direction J2000 du pôle céleste nord de l'époque affichée (§3.1). */
  readonly axePoleNord: Vec3
  readonly dureeMin: number
  /** Déclinaisons extrêmes présentes dans le cadre (§9.1). */
  readonly decMinAbsDeg: number
  readonly decMaxAbsDeg: number
  /** Hauteur du champ couvert par le cadre, en degrés. */
  readonly hauteurCadreDeg: number
}

export interface DiagnosticFile {
  readonly pole: PositionPole
  /** Arc le plus long du cadre : celui de la déclinaison la plus faible en valeur absolue. */
  readonly longueurArcMaxDeg: Traced<number>
  readonly longueurArcMinDeg: Traced<number>
  /** Part de la hauteur du cadre couverte par l'arc le plus long. */
  readonly fractionHauteurCadre: number
  readonly messages: readonly string[]
}

export function diagnosticFile(entree: EntreeDiagnosticFile): DiagnosticFile {
  const pole = positionPole(entree.projecteur, entree.latitudeDeg, entree.axePoleNord)
  const longueurArcMaxDeg = longueurArcDeg(entree.dureeMin, entree.decMinAbsDeg)
  const longueurArcMinDeg = longueurArcDeg(entree.dureeMin, entree.decMaxAbsDeg)
  const fractionHauteurCadre = longueurArcMaxDeg.value / entree.hauteurCadreDeg

  const messages: string[] = []
  const pourcent = nombre(fractionHauteurCadre * 100, 0)
  // T-0374 — le seuil porte sur ce que l'œil voit, la part du cadre que l'arc traverse, et non
  // sur une durée : à focale longue, vingt minutes font déjà un filé ; au fisheye, une heure
  // n'en fait pas toujours un.
  if (fractionHauteurCadre < K('FRACTION_CADRE_FILE_LISIBLE')) {
    messages.push(
      `Traînées courtes (${pourcent} % du cadre) : des étoiles étirées plutôt qu’un filé.`,
    )
  }

  return { pole, longueurArcMaxDeg, longueurArcMinDeg, fractionHauteurCadre, messages }
}
