/**
 * §4.1 — terrain relief → apparent elevations, one per azimuth degree.
 * Per azimuth: read terrain altitude at regular steps up to §4.1 radius, keep highest point seen,
 * each lowered by Earth-curvature drop on radius R / (1 − k): terrestrial refraction k makes the
 * masque APPARENT, like the target altitudes compared to it.
 *   e = atan( (h_point − h_œil − (1 − k)·d² / 2R) / d )
 * Eye sits on the terrain model, not at entered altitude: both from same model and datum, so a
 * default site altitude doesn't put observer underground.
 * Engine ignores tiles: receives an altimeter, built by `src/data/relief.ts`.
 */

import { K } from '../registry/constants.ts'
import { DOMAINES } from '../registry/domains.ts'
import { R } from '../registry/relief.ts'
import { DEG, versVecteur, type Vec3 } from './mat3.ts'
import { NB_AZIMUTS } from './site.ts'
import { ecartCourt, ramene, TOUR_DEG } from './unites.ts'

const M_PAR_KM = 1000

/** Terrain altitude, metres, at coordinates; null when model doesn't know. */
export type Altimetre = (latDeg: number, lonDeg: number) => number | null

/** Apparent elevation of a point at `distanceM`, `deniveleM` above the eye. */
export function elevationApparenteDeg(deniveleM: number, distanceM: number): number {
  const rayonM = K('RAYON_TERRE_KM') * M_PAR_KM
  const chuteM = ((1 - R('COEF_REFRACTION_TERRESTRE')) * distanceM ** 2) / (2 * rayonM)
  return Math.atan2(deniveleM - chuteM, distanceM) / DEG
}

/** Point reached from (lat, lon) along a great circle of given azimuth. */
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
 * The 360 relief elevations seen from (lat, lon), floored at masque domain min: horizon diving
 * below 0° reveals nothing more, target min altitude keeps control. Null without site altitude —
 * flat masque [HYP] applies.
 */
export function profilRelief(
  altitude: Altimetre,
  latDeg: number,
  lonDeg: number,
): readonly number[] | null {
  const profil = profilSurAzimuts(
    altitude,
    latDeg,
    lonDeg,
    NB_AZIMUTS,
    DOMAINES.masque_horizon_deg.min,
  )
  return profil === null ? null : Array.from(profil)
}

/**
 * T-0438 — same profile at `PAS_AZIMUT_CRETE_DEG` step, to draw the crest: at 1°, a far summit
 * falls between two azimuths → clipped, triangular.
 * No masque floor: over a lake/plain far shore is below horizontal, floor at 0° hid its shape
 * behind a flat line. Floor is for créneaux, not drawing.
 */
export function creteFine(altitude: Altimetre, latDeg: number, lonDeg: number): Float32Array | null {
  const nbAz = Math.round(NB_AZIMUTS / R('PAS_AZIMUT_CRETE_DEG'))
  const profil = profilSurAzimuts(altitude, latDeg, lonDeg, nbAz, -Infinity)
  return profil === null ? null : Float32Array.from(profil)
}

function profilSurAzimuts(
  altitude: Altimetre,
  latDeg: number,
  lonDeg: number,
  nbAz: number,
  plancherDeg: number,
): Float64Array | null {
  const sol = altitude(latDeg, lonDeg)
  if (sol === null) return null
  const oeilM = sol + R('HAUTEUR_OEIL_M')
  const pas = R('PAS_RADIAL_RELIEF_M')
  const nbPas = Math.floor((R('RAYON_RELIEF_KM') * M_PAR_KM) / pas)
  // Near field left to the survey: model noise invents whole sectors there.
  const premierPas = Math.max(1, Math.ceil(R('DISTANCE_MIN_RELIEF_M') / pas))
  const { min, max } = DOMAINES.masque_horizon_deg
  const profil = new Float64Array(nbAz)
  for (let a = 0; a < nbAz; a++) {
    const azimut = (a * TOUR_DEG) / nbAz
    let haut = plancherDeg
    for (let rang = premierPas; rang <= nbPas; rang++) {
      const d = rang * pas
      const point = pointA(latDeg, lonDeg, azimut, d)
      const h = altitude(point.latDeg, point.lonDeg)
      if (h === null) continue
      haut = Math.max(haut, elevationApparenteDeg(h - oeilM, d))
    }
    // Azimuth without altitude read: nothing to draw below horizontal.
    profil[a] = Math.min(haut === -Infinity ? min : haut, max)
  }
  return profil
}

/**
 * T-0395 — terrain contour lines seen from site, azimuth/apparent-altitude degrees, already
 * stripped of what nearer relief hides. Drawn on ground, enter no calculation.
 * T-0397 — format = polylines `[az, h, az, h, …]` separated by a NaN pair. Scattered segments
 * cost a subpath each (~10 000 on an alpine site, projected+rasterized every pan frame); chained
 * and simplified once at relief load → a few hundred.
 * Marching squares on a CARTESIAN grid at profile step, centered on site. Polar grid: cells
 * 17 m × 100 m at 1 km, 520 m × 100 m at 30 km → staircase curves. A contour follows an ALTITUDE,
 * not a distance: draws slopes, where distance circles drew only curvature.
 * Masking decided at each segment's middle azimuth: hidden when nearer terrain (≥ 1 step) rises
 * above it. Per-endpoint decision dashed grazing curves (every other end grazes terrain ahead).
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
  // T-0441 — masque threshold protects an HORIZON from model noise; contour below site invents
  // none. Stopping at 500 m left plateau flat black. Under one cell the grid resolves nothing.
  const minM = pas
  const equidistance = R('EQUIDISTANCE_COURBES_M')
  const devant = horizonDevant(altitude, latDeg, lonDeg, oeilM)

  // East-north grid around site. Model hole takes eye altitude: contour closes on a flat at worst.
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

  // T-0397 — cut named by edge + level: neighbour cells find same point under same key → segments
  // join without float comparison.
  const nbAretes = 2 * cote * cote
  const horizontale = (i: number, j: number): number => 2 * (j * cote + i)
  const verticale = (i: number, j: number): number => 2 * (j * cote + i) + 1
  const lignes = raccords()

  const vers = (est: number, nord: number, niveau: number): readonly [number, number, number] => {
    const d = Math.hypot(est, nord)
    const az = ((Math.atan2(est, nord) / DEG) % TOUR_DEG + TOUR_DEG) % TOUR_DEG
    return [az, elevationApparenteDeg(niveau - oeilM, d), d]
  }
  // T-0438 — cut born mid-segment, behind relief, has no grid edge to name it: negative key, no
  // cell reuses it.
  let cleLibre = -1
  const pasEchantillonDeg = R('PAS_AZIMUT_COURBES_DEG') / 2
  /**
   * T-0438 — masking per piece, not per segment. At 10 km a 100 m cell spans 0.5° of azimuth:
   * decided on its middle alone, a segment straddling a ridge edge passed wholly in front →
   * contours crossed silhouettes.
   */
  const segment = (p: Coupe, q: Coupe, niveau: number): void => {
    const [azP, eP, dP] = vers(p.est, p.nord, niveau)
    const [azQ, eQ, dQ] = vers(q.est, q.nord, niveau)
    if (Math.min(dP, dQ) < minM || Math.max(dP, dQ) > rayonM) return
    const ecartAz = Math.abs(ecartCourt(azP, azQ, TOUR_DEG))
    const n = Math.max(1, Math.ceil(ecartAz / pasEchantillonDeg))
    const en = (t: number): readonly [number, number, number] =>
      vers(p.est + t * (q.est - p.est), p.nord + t * (q.nord - p.nord), niveau)
    const visible = (k: number): boolean => {
      const [az, e, d] = en((2 * k + 1) / (2 * n))
      return e >= devant(az, d)
    }
    // All split points, not just ends: near site a cell spans several degrees, chord cut the arc.
    // `simplifieLigne` then drops aligned ones.
    const relieMorceau = (de: number, a: number): void => {
      let cleA = de === 0 ? p.cle : cleLibre--
      let [azA, eA] = de === 0 ? [azP, eP] : en(de / n)
      for (let k = de + 1; k <= a; k++) {
        const cleB = k === n ? q.cle : cleLibre--
        const [azB, eB] = k === n ? [azQ, eQ] : en(k / n)
        lignes.relie(cleA, azA, eA, cleB, azB, eB)
        cleA = cleB
        azA = azB
        eA = eB
      }
    }
    let debut = -1
    for (let k = 0; k <= n; k++) {
      const vu = k < n && visible(k)
      if (vu && debut < 0) debut = k
      if (!vu && debut >= 0) {
        relieMorceau(debut, k)
        debut = -1
      }
    }
  }

  for (let j = 0; j + 1 < cote; j++) {
    for (let i = 0; i + 1 < cote; i++) {
      // Corners: a (i, j), b (i+1, j), c (i+1, j+1), d (i, j+1) — east right, north up.
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
        // Always from lowest-index corner: neighbour cell, seeing same edge reversed, computes the
        // exact same point.
        const t = (u: number, v: number): number => (niveau - u) / (v - u)
        const cle = (arete: number): number => k * nbAretes + arete
        // Edges crossed by contour, order a→b, b→c, c→d, d→a.
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
        // Two cuts: one segment. Four (saddle): two, paired in tour order.
        for (let m = 0; m + 1 < coupes.length; m += 2) segment(coupes[m]!, coupes[m + 1]!, niveau)
      }
    }
  }
  return lignes.polylignes(R('TOLERANCE_COURBES_DEG'), R('CORDE_MAX_COURBES_DEG'))
}

/**
 * T-0438 — silhouette lines: edge of nearby relief hiding farther terrain, contour format.
 * Detach a slope from the one it hides (contours follow altitude, blend in).
 * Per azimuth, a point is a silhouette edge when seen and next isn't. Last edge of an azimuth
 * (nothing seen behind) = horizon crest: ground already traces it, not repeated.
 * Neighbour-azimuth edges join when distances are close: isolated edge or chain shorter than
 * `ETENDUE_MIN_SILHOUETTE_DEG` = model artefact, not an arête → not drawn.
 */
export function silhouettes(
  altitude: Altimetre,
  latDeg: number,
  lonDeg: number,
): Float32Array | null {
  const sol = altitude(latDeg, lonDeg)
  if (sol === null) return null
  const oeilM = sol + R('HAUTEUR_OEIL_M')
  const pas = R('PAS_RADIAL_RELIEF_M')
  const nbRangs = Math.floor((R('RAYON_RELIEF_KM') * M_PAR_KM) / pas) + 1
  const premier = Math.max(1, Math.ceil(R('DISTANCE_MIN_RELIEF_M') / pas))
  const profondeurMin = Math.ceil(R('PROFONDEUR_MIN_SILHOUETTE_M') / pas)
  const ecart = R('ECART_RACCORD_SILHOUETTE')
  const parDeg = 1 / R('PAS_AZIMUT_COURBES_DEG')
  const nbAz = Math.round(NB_AZIMUTS * parDeg)

  // Per azimuth, the edges: radial rank + apparent height.
  const bords: { readonly rang: number; readonly e: number }[][] = []
  for (let a = 0; a < nbAz; a++) {
    const e = new Float64Array(nbRangs).fill(Number.NaN)
    for (let r = premier; r < nbRangs; r++) {
      const point = pointA(latDeg, lonDeg, a / parDeg, r * pas)
      const h = altitude(point.latDeg, point.lonDeg)
      if (h !== null) e[r] = elevationApparenteDeg(h - oeilM, r * pas)
    }
    const ici: { rang: number; e: number }[] = []
    let haut = -Infinity
    let bord: { rang: number; e: number } | null = null
    let caches = 0
    for (let r = premier; r < nbRangs; r++) {
      const er = e[r]!
      // Model hole hides nothing, shows nothing: ignored.
      if (Number.isNaN(er)) continue
      if (er >= haut) {
        if (bord !== null && caches >= profondeurMin) ici.push(bord)
        haut = er
        bord = { rang: r, e: er }
        caches = 0
      } else {
        caches++
      }
    }
    bords.push(ici)
  }

  const lignes = raccords()
  const cle = (a: number, rang: number): number => a * nbRangs + rang
  for (let a = 0; a < nbAz; a++) {
    const b = (a + 1) % nbAz
    // T-0438 — an azimuth's edges sorted nearest → farthest, also highest: a join reversing this
    // order would cross two silhouettes, which no relief shows. Each edge searches only beyond the
    // last taken.
    const suivants = bords[b]!
    let dernierPris = -1
    for (const p of bords[a]!) {
      // Among distance-compatible edges, the one whose height continues the line: nearest by
      // distance jumped between converging ridges, drawing an X.
      let meilleur = -1
      for (let j = dernierPris + 1; j < suivants.length; j++) {
        const q = suivants[j]!
        if (Math.abs(q.rang - p.rang) > ecart * p.rang) continue
        if (meilleur < 0 || Math.abs(q.e - p.e) < Math.abs(suivants[meilleur]!.e - p.e)) meilleur = j
      }
      if (meilleur < 0) continue
      dernierPris = meilleur
      const q = suivants[meilleur]!
      lignes.relie(cle(a, p.rang), a / parDeg, p.e, cle(b, q.rang), b / parDeg, q.e)
    }
  }
  return lignes.polylignes(
    R('TOLERANCE_COURBES_DEG'),
    R('CORDE_MAX_COURBES_DEG'),
    Math.ceil(R('ETENDUE_MIN_SILHOUETTE_DEG') * parDeg) + 1,
  )
}

/** Point where a contour crosses a grid edge, metres east and north. */
interface Coupe {
  readonly cle: number
  readonly est: number
  readonly nord: number
}

/**
 * T-0397 — visible segments joined by their cuts. Each cut belongs to ≤ 2 cells, each cell passes
 * one segment through it: vertex has ≤ 2 neighbours, graph = paths and loops only.
 */
function raccords(): {
  relie(p: number, azP: number, eP: number, q: number, azQ: number, eQ: number): void
  polylignes(toleranceDeg: number, cordeMaxDeg: number, minPoints?: number): Float32Array
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
  /** Follows line from `depart`, consuming its links: each walked once. */
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
    polylignes(toleranceDeg, cordeMaxDeg, minPoints = 2) {
      const sortie: number[] = []
      const emet = (cles: readonly number[]): void => {
        if (cles.length < minPoints) return
        const ligne = cles.map((c) => points.get(c)!)
        const gardes = simplifieLigne(
          ligne.map(([az, e]) => versVecteur(az, e)),
          toleranceDeg,
          cordeMaxDeg,
        )
        if (sortie.length > 0) sortie.push(Number.NaN, Number.NaN)
        for (const g of gardes) sortie.push(...ligne[g]!)
      }
      // Ends first: open line walked end to end. Remainder has no end: loops.
      for (const [cle, autour] of voisins) if (autour.length === 1) emet(parcourt(cle))
      for (const [cle, autour] of voisins) if (autour.length > 0) emet(parcourt(cle))
      return Float32Array.from(sortie)
    },
  }
}

/**
 * T-0397 — Douglas-Peucker on the sphere: indices to keep so line never strays more than
 * `toleranceDeg` from original and no chord exceeds `cordeMaxDeg`. Both ends kept.
 * Deviation measured to the ARC between kept points, not its great circle: a curve turning back
 * at a valley floor has its tip on the arc's extension, zero from great circle → would vanish.
 */
export function simplifieLigne(
  points: readonly Vec3[],
  toleranceDeg: number,
  cordeMaxDeg: number,
): number[] {
  const dernier = points.length - 1
  if (dernier < 1) return points.map((_, i) => i)
  // Near a point, angle sine and chord both ≈ the angle.
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
    // Too-long chord over aligned points splits at middle: splitting at worst point (first with
    // zero gap) kept every point one by one.
    const coupe = ecart > seuil ? pire : tropLongue ? (i + j) >> 1 : -1
    if (coupe < 0) continue
    garde[coupe] = 1
    pile.push([i, coupe], [coupe, j])
  }
  const indices: number[] = []
  for (let k = 0; k <= dernier; k++) if (garde[k] === 1) indices.push(k)
  return indices
}

/** Gap of `p` to arc `a → b`, as angle sine — or chord when `p` falls outside the arc. */
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
 * Highest apparent terrain height BEFORE a distance, in an azimuth: what a contour point must
 * exceed to be seen. Step next to the point excluded (it is the point, within a cell).
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
  // T-0438 — interpolated between neighbour azimuths, not nearest-read: on an obliquely seen
  // ridge the horizon ahead shifts 0.5° per 0.5° azimuth; a contour behind the ridge stayed
  // visible on its first segment (short stroke hanging off the crest).
  return (azDeg, distanceM) => {
    const r = Math.min(nbRangs - 1, Math.floor(distanceM / pas) - 1)
    if (r < 0) return -Infinity
    const x = ramene(azDeg, TOUR_DEG) * parDeg
    const a = Math.floor(x)
    const avant = table[(a % nbAz) * nbRangs + r] ?? -Infinity
    const apres = table[((a + 1) % nbAz) * nbRangs + r] ?? -Infinity
    if (avant === -Infinity || apres === -Infinity) return Math.max(avant, apres)
    return avant + (apres - avant) * (x - a)
  }
}
