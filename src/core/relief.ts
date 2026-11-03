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
import { ecartCourt, ramene, TOUR_DEG } from './unites.ts'

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
 * T-0438 — le même profil au pas de `PAS_AZIMUT_CRETE_DEG`, pour dessiner la crête : au degré,
 * un sommet lointain tombe entre deux azimuts et se dessine écrêté, en triangle.
 *
 * Sans le plancher du masque : au-dessus d'un lac ou d'une plaine, la rive d'en face est sous
 * l'horizontale, et ramenée à 0° sa forme disparaissait derrière un trait plat. Le plancher
 * vaut pour les créneaux, pas pour le dessin.
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
  // Le champ proche est laissé au relevé : le bruit du modèle y invente des secteurs entiers.
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
    // Un azimut sans aucune altitude lue n'a rien à dessiner sous l'horizontale.
    profil[a] = Math.min(haut === -Infinity ? min : haut, max)
  }
  return profil
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
  // T-0441 — le seuil du masque protège un HORIZON du bruit du modèle ; une courbe dessinée
  // sous le site n'en invente aucun. S'arrêter à 500 m laissait le plateau en aplat noir. En
  // deçà d'une maille, la grille ne résout plus rien.
  const minM = pas
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
  // T-0438 — une coupe née au milieu d'un segment, là où il passe derrière le relief, n'a pas
  // d'arête de grille pour la nommer : elle prend une clé négative, qu'aucune maille ne reprend.
  let cleLibre = -1
  const pasEchantillonDeg = R('PAS_AZIMUT_COURBES_DEG') / 2
  /**
   * T-0438 — le masquage se décide par morceau, pas par segment. À 10 km, une maille de 100 m
   * couvre un demi-degré d'azimut : décidé sur son seul milieu, un segment à cheval sur le
   * bord d'une arête passait tout entier devant elle, et les courbes croisaient les silhouettes.
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
    // Tous les points du découpage, et non les seuls bouts : tout près du site, une maille
    // couvre plusieurs degrés, et sa corde tirée droite coupait l'arc qu'elle remplace.
    // `simplifieLigne` retire ensuite ceux qui sont alignés.
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

/**
 * T-0438 — les lignes de silhouette : le bord d'un relief proche qui cache un terrain plus
 * lointain, au même format que les courbes. Ce sont elles qui détachent un versant de celui
 * qu'il masque — les courbes de niveau, qui suivent une altitude, s'y fondent.
 *
 * Le long de chaque azimut, un point est le bord d'une silhouette quand il se voit et que le
 * suivant ne se voit plus. Le dernier bord d'un azimut — rien ne se voit derrière — est la
 * crête de l'horizon : le sol la trace déjà de son contour, elle n'est pas reprise ici.
 *
 * Les bords d'azimuts voisins se raboutent quand leurs distances sont proches : un bord isolé,
 * ou une chaîne plus courte que `ETENDUE_MIN_SILHOUETTE_DEG`, n'est pas une arête mais un
 * accident du modèle, et ne se trace pas.
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

  // Par azimut, les bords : leur rang radial et leur hauteur apparente.
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
      // Un trou du modèle ne cache rien et ne montre rien : il ne compte pas.
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
    // T-0438 — les bords d'un azimut sont rangés du plus proche au plus lointain, qui est aussi
    // le plus haut : un raccord qui inverserait cet ordre croiserait deux silhouettes, ce
    // qu'aucun relief ne montre. Chaque bord ne cherche donc qu'au-delà du dernier pris.
    const suivants = bords[b]!
    let dernierPris = -1
    for (const p of bords[a]!) {
      // Parmi les bords à distance compatible, celui dont la hauteur continue le trait : au
      // plus proche en distance, un trait sautait d'une arête à sa voisine là où plusieurs
      // se resserrent, et dessinait un X.
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
  // T-0438 — interpolé entre les deux azimuts voisins, et non lu au plus proche : sur une arête
  // vue de biais, l'horizon devant change d'un demi-degré en un demi-degré d'azimut, et la
  // courbe qui passe derrière l'arête se voyait encore sur son premier segment — un trait
  // court qui pendait de la crête.
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
