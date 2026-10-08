/**
 * §4.1 — le relief du terrain converti en élévations apparentes, une par degré d'azimut.
 *
 * Le long de chaque azimut, on lit l'altitude du terrain à pas réguliers jusqu'au rayon de
 * §4.1, et on garde le point vu le plus haut. Chaque point est abaissé de la chute due à la
 * rotondité, sur une Terre de rayon R / (1 − k) : la réfraction terrestre k rend le masque
 * APPARENT, comme le sont les hauteurs de cibles qui lui sont comparées.
 *
 *   e = atan( (h_point − h_œil − (1 − k)·d² / 2R) / d )
 *
 * L'œil est posé sur le modèle de terrain, pas à l'altitude saisie : les deux altitudes
 * comparées viennent alors du même modèle et du même datum, et une altitude de site laissée à
 * sa valeur par défaut ne met pas l'observateur sous terre.
 *
 * Le moteur ne sait rien des tuiles : il reçoit un altimètre. C'est `src/data/relief.ts` qui
 * le construit.
 */

import { K } from '../registry/constants.ts'
import { DOMAINES } from '../registry/domains.ts'
import { R } from '../registry/relief.ts'
import { DEG, versVecteur, type Vec3 } from './mat3.ts'
import { NB_AZIMUTS } from './site.ts'
import { TOUR_DEG } from './unites.ts'

const M_PAR_KM = 1000

/** L'altitude du terrain en mètres à ces coordonnées, ou null quand le modèle ne la connaît pas. */
export type Altimetre = (latDeg: number, lonDeg: number) => number | null

/** Élévation apparente d'un point à `distanceM`, `deniveleM` au-dessus de l'œil. */
export function elevationApparenteDeg(deniveleM: number, distanceM: number): number {
  const rayonM = K('RAYON_TERRE_KM') * M_PAR_KM
  const chuteM = ((1 - R('COEF_REFRACTION_TERRESTRE')) * distanceM ** 2) / (2 * rayonM)
  return Math.atan2(deniveleM - chuteM, distanceM) / DEG
}

/** Le point atteint en partant de (lat, lon) le long d'un grand cercle d'azimut donné. */
export function pointA(
  latDeg: number,
  lonDeg: number,
  azimutDeg: number,
  distanceM: number,
): { readonly latDeg: number; readonly lonDeg: number } {
  const delta = distanceM / (K('RAYON_TERRE_KM') * M_PAR_KM)
  const phi1 = latDeg * DEG
  const theta = azimutDeg * DEG
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  const phi2 = Math.asin(sinPhi2)
  const lambda =
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * sinPhi2,
    ) / DEG
  return { latDeg: phi2 / DEG, lonDeg: lonDeg + lambda }
}

/**
 * Les 360 élévations du relief vu depuis (lat, lon), ramenées au plancher du domaine du
 * masque : un horizon qui plonge sous 0° ne dévoile rien de plus, la hauteur minimale d'une
 * cible garde la main. Null sans altitude au site — le masque plat [HYP] s'appliquera.
 */
export function profilRelief(
  altitude: Altimetre,
  latDeg: number,
  lonDeg: number,
): readonly number[] | null {
  const sol = altitude(latDeg, lonDeg)
  if (sol === null) return null
  const oeilM = sol + R('HAUTEUR_OEIL_M')
  const pas = R('PAS_RADIAL_RELIEF_M')
  const nbPas = Math.floor((R('RAYON_RELIEF_KM') * M_PAR_KM) / pas)
  // Le champ proche est laissé au relevé : le bruit du modèle y invente des secteurs entiers.
  const premierPas = Math.max(1, Math.ceil(R('DISTANCE_MIN_RELIEF_M') / pas))
  const { min, max } = DOMAINES.masque_horizon_deg

  return Array.from({ length: NB_AZIMUTS }, (_, azimut) => {
    let haut = min
    for (let rang = premierPas; rang <= nbPas; rang++) {
      const d = rang * pas
      const point = pointA(latDeg, lonDeg, azimut, d)
      const h = altitude(point.latDeg, point.lonDeg)
      if (h === null) continue
      haut = Math.max(haut, elevationApparenteDeg(h - oeilM, d))
    }
    return Math.min(haut, max)
  })
}

/**
 * T-0395 — les courbes de niveau du terrain, vues depuis le site, en degrés d'azimut et de
 * hauteur apparente, déjà débarrassées de ce qu'un relief plus proche cache. Elles se dessinent
 * sur le sol et n'entrent dans aucun calcul.
 *
 * T-0397 — le format est celui de polylignes `[az, h, az, h, …]`, séparées par une paire de
 * NaN. Rendues en segments épars, elles coûtaient un sous-chemin chacun — près de dix mille sur
 * un site alpin, projetés et rastérisés à chaque image du panoramique. Enchaînées puis
 * simplifiées ici, une fois au chargement du relief, elles en coûtent quelques centaines.
 *
 * Les courbes sortent par carrés marchants d'une grille CARTÉSIENNE au pas du profil, centrée
 * sur le site. Une grille polaire avait des mailles de 17 m × 100 m à 1 km et de 520 m × 100 m
 * à 30 km : ses courbes descendaient en escalier. Une courbe suit une ALTITUDE, pas une
 * distance : elle dessine les versants, là où des cercles de distance ne dessinaient que la
 * courbure.
 *
 * Le masquage se décide dans l'azimut du milieu de chaque segment : il est caché quand le
 * terrain plus proche, d'au moins un pas, monte plus haut que lui. Décider par extrémité
 * hachait en pointillés les courbes rasantes, dont un bout sur deux frôle le terrain devant.
 */
export function courbesNiveau(
  altitude: Altimetre,
  latDeg: number,
  lonDeg: number,
): Float32Array | null {
  const sol = altitude(latDeg, lonDeg)
  if (sol === null) return null
  const oeilM = sol + R('HAUTEUR_OEIL_M')
  const pas = R('PAS_RADIAL_RELIEF_M')
  const rayonM = R('RAYON_RELIEF_KM') * M_PAR_KM
  const minM = R('DISTANCE_MIN_RELIEF_M')
  const equidistance = R('EQUIDISTANCE_COURBES_M')
  const devant = horizonDevant(altitude, latDeg, lonDeg, oeilM)

  // Grille est-nord autour du site. Un trou du modèle reprend l'altitude de l'œil : une courbe
  // s'y referme au pire sur un plat.
  const demi = Math.ceil(rayonM / pas)
  const cote = 2 * demi + 1
  const metresParDegLat = K('RAYON_TERRE_KM') * M_PAR_KM * DEG
  const metresParDegLon = metresParDegLat * Math.cos(latDeg * DEG)
  const h = new Float64Array(cote * cote)
  for (let j = 0; j < cote; j++) {
    const nord = (j - demi) * pas
    for (let i = 0; i < cote; i++) {
      const est = (i - demi) * pas
      h[j * cote + i] =
        altitude(latDeg + nord / metresParDegLat, lonDeg + est / metresParDegLon) ?? oeilM
    }
  }

  // T-0397 — une coupe se nomme par son arête et son niveau : deux mailles voisines retrouvent
  // le même point sous la même clé, et les segments se raboutent sans comparer de flottants.
  const nbAretes = 2 * cote * cote
  const horizontale = (i: number, j: number): number => 2 * (j * cote + i)
  const verticale = (i: number, j: number): number => 2 * (j * cote + i) + 1
  const lignes = raccords()

  const vers = (est: number, nord: number, niveau: number): readonly [number, number, number] => {
    const d = Math.hypot(est, nord)
    const az = ((Math.atan2(est, nord) / DEG) % TOUR_DEG + TOUR_DEG) % TOUR_DEG
    return [az, elevationApparenteDeg(niveau - oeilM, d), d]
  }
  const segment = (p: Coupe, q: Coupe, niveau: number): void => {
    const [azP, eP, dP] = vers(p.est, p.nord, niveau)
    const [azQ, eQ, dQ] = vers(q.est, q.nord, niveau)
    if (Math.min(dP, dQ) < minM || Math.max(dP, dQ) > rayonM) return
    const [azM, eM, dM] = vers((p.est + q.est) / 2, (p.nord + q.nord) / 2, niveau)
    if (eM < devant(azM, dM)) return
    lignes.relie(p.cle, azP, eP, q.cle, azQ, eQ)
  }

  for (let j = 0; j + 1 < cote; j++) {
    for (let i = 0; i + 1 < cote; i++) {
      // Coins : a (i, j), b (i+1, j), c (i+1, j+1), d (i, j+1) — est vers la droite, nord en haut.
      const a = h[j * cote + i]!
      const b = h[j * cote + i + 1]!
      const c = h[(j + 1) * cote + i + 1]!
      const d = h[(j + 1) * cote + i]!
      const bas = Math.min(a, b, c, d)
      const haut = Math.max(a, b, c, d)
      const e0 = (i - demi) * pas
      const n0 = (j - demi) * pas
      for (let k = Math.ceil(bas / equidistance); k * equidistance < haut; k++) {
        const niveau = k * equidistance
        // Toujours depuis le coin d'indice le plus bas : la maille voisine, qui voit la même
        // arête dans l'autre sens, calcule exactement le même point.
        const t = (u: number, v: number): number => (niveau - u) / (v - u)
        const cle = (arete: number): number => k * nbAretes + arete
        // Les bords que la courbe traverse, dans l'ordre a→b, b→c, c→d, d→a.
        const coupes: Coupe[] = []
        if (a < niveau !== b < niveau) {
          coupes.push({ cle: cle(horizontale(i, j)), est: e0 + t(a, b) * pas, nord: n0 })
        }
        if (b < niveau !== c < niveau) {
          coupes.push({ cle: cle(verticale(i + 1, j)), est: e0 + pas, nord: n0 + t(b, c) * pas })
        }
        if (c < niveau !== d < niveau) {
          coupes.push({ cle: cle(horizontale(i, j + 1)), est: e0 + t(d, c) * pas, nord: n0 + pas })
        }
        if (d < niveau !== a < niveau) {
          coupes.push({ cle: cle(verticale(i, j)), est: e0, nord: n0 + t(a, d) * pas })
        }
        // Deux coupes : un segment. Quatre (col) : deux, appariés dans l'ordre du tour.
        for (let m = 0; m + 1 < coupes.length; m += 2) segment(coupes[m]!, coupes[m + 1]!, niveau)
      }
    }
  }
  return lignes.polylignes(R('TOLERANCE_COURBES_DEG'), R('CORDE_MAX_COURBES_DEG'))
}

/** Le point où une courbe traverse une arête de la grille, en mètres vers l'est et le nord. */
interface Coupe {
  readonly cle: number
  readonly est: number
  readonly nord: number
}

/**
 * T-0397 — les segments visibles, raboutés par leurs coupes. Chaque coupe appartient à deux
 * mailles au plus, et chaque maille n'y fait passer qu'un segment : un sommet a deux voisins au
 * plus, et le graphe n'est fait que de chemins et de boucles.
 */
function raccords(): {
  relie(p: number, azP: number, eP: number, q: number, azQ: number, eQ: number): void
  polylignes(toleranceDeg: number, cordeMaxDeg: number): Float32Array
} {
  const points = new Map<number, readonly [number, number]>()
  const voisins = new Map<number, number[]>()
  const voisinsDe = (cle: number): number[] => {
    const connus = voisins.get(cle)
    if (connus !== undefined) return connus
    const neufs: number[] = []
    voisins.set(cle, neufs)
    return neufs
  }
  const retire = (de: number, vers: number): void => {
    const autour = voisins.get(de)!
    autour.splice(autour.indexOf(vers), 1)
  }
  /** Suit la ligne depuis `depart` en consommant ses liens : chacun ne se parcourt qu'une fois. */
  const parcourt = (depart: number): number[] => {
    const cles = [depart]
    for (let courant = depart; ; ) {
      const suivant = voisins.get(courant)?.[0]
      if (suivant === undefined) return cles
      retire(courant, suivant)
      retire(suivant, courant)
      cles.push(suivant)
      courant = suivant
    }
  }

  return {
    relie(p, azP, eP, q, azQ, eQ) {
      points.set(p, [azP, eP])
      points.set(q, [azQ, eQ])
      voisinsDe(p).push(q)
      voisinsDe(q).push(p)
    },
    polylignes(toleranceDeg, cordeMaxDeg) {
      const sortie: number[] = []
      const emet = (cles: readonly number[]): void => {
        const ligne = cles.map((c) => points.get(c)!)
        const gardes = simplifieLigne(
          ligne.map(([az, e]) => versVecteur(az, e)),
          toleranceDeg,
          cordeMaxDeg,
        )
        if (sortie.length > 0) sortie.push(Number.NaN, Number.NaN)
        for (const g of gardes) sortie.push(...ligne[g]!)
      }
      // Les bouts d'abord : une ligne ouverte se parcourt d'une extrémité à l'autre. Ce qui
      // reste ensuite n'a plus de bout : ce sont des boucles.
      for (const [cle, autour] of voisins) if (autour.length === 1) emet(parcourt(cle))
      for (const [cle, autour] of voisins) if (autour.length > 0) emet(parcourt(cle))
      return Float32Array.from(sortie)
    },
  }
}

/**
 * T-0397 — Douglas-Peucker sur la sphère : les indices des points à garder pour que la ligne
 * ne s'écarte jamais de plus de `toleranceDeg` de son tracé d'origine, et qu'aucune corde ne
 * dépasse `cordeMaxDeg`. Les deux bouts restent.
 *
 * L'écart se mesure à l'ARC entre les deux points gardés, pas au grand cercle qui le porte :
 * une courbe qui fait demi-tour au fond d'un vallon a sa pointe dans le prolongement de l'arc,
 * à une distance nulle du grand cercle — elle disparaîtrait.
 */
export function simplifieLigne(
  points: readonly Vec3[],
  toleranceDeg: number,
  cordeMaxDeg: number,
): number[] {
  const dernier = points.length - 1
  if (dernier < 1) return points.map((_, i) => i)
  // Au voisinage d'un point, le sinus d'un angle et sa corde se confondent avec l'angle.
  const seuil = Math.sin(toleranceDeg * DEG)
  const cosCordeMax = Math.cos(cordeMaxDeg * DEG)
  const garde = new Uint8Array(points.length)
  garde[0] = 1
  garde[dernier] = 1
  const pile: (readonly [number, number])[] = [[0, dernier]]
  for (let tranche = pile.pop(); tranche !== undefined; tranche = pile.pop()) {
    const [i, j] = tranche
    if (j - i < 2) continue
    const a = points[i]!
    const b = points[j]!
    let pire = i + 1
    let ecart = -1
    for (let k = i + 1; k < j; k++) {
      const d = ecartArc(points[k]!, a, b)
      if (d > ecart) {
        ecart = d
        pire = k
      }
    }
    const tropLongue = a.x * b.x + a.y * b.y + a.z * b.z < cosCordeMax
    // Une corde trop longue sur des points alignés se coupe au milieu : couper au pire point,
    // le premier venu à écart nul, gardait tous les points un à un.
    const coupe = ecart > seuil ? pire : tropLongue ? (i + j) >> 1 : -1
    if (coupe < 0) continue
    garde[coupe] = 1
    pile.push([i, coupe], [coupe, j])
  }
  const indices: number[] = []
  for (let k = 0; k <= dernier; k++) if (garde[k] === 1) indices.push(k)
  return indices
}

/** L'écart de `p` à l'arc `a → b`, en sinus d'angle — ou en corde, quand `p` tombe hors de l'arc. */
function ecartArc(p: Vec3, a: Vec3, b: Vec3): number {
  const n = produitVectoriel(a, b)
  const norme = Math.hypot(n.x, n.y, n.z)
  if (norme > Number.EPSILON) {
    const avantB = produitScalaire(produitVectoriel(a, p), n) >= 0
    const apresA = produitScalaire(produitVectoriel(p, b), n) >= 0
    if (avantB && apresA) return Math.abs(produitScalaire(p, n)) / norme
  }
  return Math.min(corde(p, a), corde(p, b))
}

function produitVectoriel(u: Vec3, v: Vec3): Vec3 {
  return { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x }
}

function produitScalaire(u: Vec3, v: Vec3): number {
  return u.x * v.x + u.y * v.y + u.z * v.z
}

function corde(u: Vec3, v: Vec3): number {
  return Math.hypot(u.x - v.x, u.y - v.y, u.z - v.z)
}
/**
 * La hauteur apparente la plus haute du terrain AVANT une distance donnée, dans un azimut :
 * ce qu'un point de courbe doit dépasser pour se voir. Le pas tout proche du point est exclu —
 * c'est le point lui-même, à la maille près.
 */
function horizonDevant(
  altitude: Altimetre,
  latDeg: number,
  lonDeg: number,
  oeilM: number,
): (azDeg: number, distanceM: number) => number {
  const pas = R('PAS_RADIAL_RELIEF_M')
  const nbRangs = Math.floor((R('RAYON_RELIEF_KM') * M_PAR_KM) / pas) + 1
  const premier = Math.max(1, Math.ceil(R('DISTANCE_MIN_RELIEF_M') / pas))
  const parDeg = 1 / R('PAS_AZIMUT_COURBES_DEG')
  const nbAz = Math.round(NB_AZIMUTS * parDeg)
  const table = new Float64Array(nbAz * nbRangs).fill(-Infinity)
  for (let a = 0; a < nbAz; a++) {
    let haut = -Infinity
    for (let r = premier; r < nbRangs; r++) {
      table[a * nbRangs + r] = haut
      const point = pointA(latDeg, lonDeg, a / parDeg, r * pas)
      const h = altitude(point.latDeg, point.lonDeg)
      if (h !== null) haut = Math.max(haut, elevationApparenteDeg(h - oeilM, r * pas))
    }
  }
  return (azDeg, distanceM) => {
    const a = Math.round(azDeg * parDeg) % nbAz
    const r = Math.min(nbRangs - 1, Math.floor(distanceM / pas) - 1)
    return r < 0 ? -Infinity : (table[a * nbRangs + r] ?? -Infinity)
  }
}
