/**
 * §4.1, §12.5 — site relief: cache first, then terrain tiles.
 * Failure never throws. Flat mask [HYP] = §4.1 fallback for a site without relief: input and
 * computation go on, cause in one sentence not raw error (T-0279). Offline, a visited site finds
 * its relief — §12.5 matrix line « Masque d'horizon ».
 * Tiles not kept, only the 360-elevation profile the engine consumes: 3 KB vs 1.5 MB.
 */

import { courbesNiveau, creteFine, profilRelief, silhouettes, type Altimetre } from '../core/relief.ts'
import { masqueDepuisRelief } from '../core/site.ts'
import { DEG } from '../core/mat3.ts'
import {
  LATITUDE_MAX_MERCATOR_DEG,
  pixelMonde as pixelMondeCote,
  type PointMonde,
} from '../core/mercator.ts'
import { K } from '../registry/constants.ts'
import { R, urlTuileRelief } from '../registry/relief.ts'
import { cleRelief, ecritRelief, litRelief } from './db.ts'
import { modeReseauCourant } from './degradation.ts'

export interface ReliefConnu {
  readonly etat: 'RELIEF'
  readonly altitudesDeg: readonly number[]
  /** T-0365 — ground altitude at site, m: eye level over relief. */
  readonly solM: number
  /** T-0395 — visible contour lines (`courbesNiveau`); absent from old cache. */
  readonly courbesDeg?: Float32Array
  /** T-0438 — silhouette lines (`silhouettes`), drawn with contours. */
  readonly silhouettesDeg?: Float32Array
  /** T-0438 — fine-step ridge (`creteFine`), for ground drawing. */
  readonly creteDeg?: Float32Array
  /** What drew them — algorithm + equidistance: another signature redoes them. */
  readonly signatureCourbes?: string
}

export type ReliefSite = ReliefConnu | { readonly etat: 'INDISPONIBLE'; readonly cause: string }

/** Tile altitudes, m, row by row; null if unreadable. */
export type ChargeTuile = (z: number, x: number, y: number) => Promise<Float32Array | null>

const CANAUX_RGBA = 4

/** Terrarium : h = R × 256 + V + B / 256 − 32 768. */
export function altitudeTerrarium(rouge: number, vert: number, bleu: number): number {
  const base = R('COTE_TUILE_PX')
  return rouge * base + vert + bleu / base - R('DECALAGE_TERRARIUM_M')
}

/** Web Mercator world-pixel position at zoom `z`: tile = this / 256. */
export function pixelMonde(latDeg: number, lonDeg: number, z: number): PointMonde {
  return pixelMondeCote(latDeg, lonDeg, z, R('COTE_TUILE_PX'))
}

/** Tiles covering §4.1 radius around site; null beyond cap. */
export function tuilesCouvrantes(
  latDeg: number,
  lonDeg: number,
): readonly { readonly x: number; readonly y: number }[] | null {
  const z = R('ZOOM_TUILE_RELIEF')
  const cote = R('COTE_TUILE_PX')
  const nb = 2 ** z
  const rayonDeg = (R('RAYON_RELIEF_KM') / K('RAYON_TERRE_KM')) / DEG
  // No tile beyond latitude where Mercator stops (≈ 85,05°).
  if (Math.abs(latDeg) + rayonDeg > LATITUDE_MAX_MERCATOR_DEG) return null
  const dLon = rayonDeg / Math.cos(latDeg * DEG)
  const nordOuest = pixelMonde(latDeg + rayonDeg, lonDeg - dLon, z)
  const sudEst = pixelMonde(latDeg - rayonDeg, lonDeg + dLon, z)
  const x0 = Math.floor(nordOuest.x / cote)
  const x1 = Math.floor(sudEst.x / cote)
  const y0 = Math.floor(nordOuest.y / cote)
  const y1 = Math.floor(sudEst.y / cote)
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > R('TUILES_RELIEF_MAX')) return null
  const tuiles: { x: number; y: number }[] = []
  for (let y = y0; y <= y1; y++) {
    // Antimeridian wraps: tile west of 0 = last of the row.
    for (let x = x0; x <= x1; x++) tuiles.push({ x: ((x % nb) + nb) % nb, y })
  }
  return tuiles
}

/** §13.1 — request does not say where it comes from. */
const SANS_REFERENT: RequestInit = { referrerPolicy: 'no-referrer' }

/** Tile downloaded + decoded by browser: no third-party decoder. */
export const chargeTuileReseau: ChargeTuile = async (z, x, y) => {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null
  // Mute service must not leave mask « en cours de chargement » all session.
  const reponse = await fetch(urlTuileRelief(z, x, y), {
    ...SANS_REFERENT,
    signal: AbortSignal.timeout(R('DELAI_MAX_TUILE_MS')),
  })
  if (!reponse.ok) return null
  const corps = await reponse.blob()
  if (!corps.type.startsWith('image/')) return null
  // No conversion: colour profile would skew altitudes.
  // Known limit: Firefox `privacy.resistFingerprinting` noises `getImageData` → silently wrong
  // profile. No reliable workaround; manual survey stays possible.
  const image = await createImageBitmap(corps, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  })
  const cote = R('COTE_TUILE_PX')
  if (image.width !== cote || image.height !== cote) return null
  const toile = new OffscreenCanvas(cote, cote)
  const contexte = toile.getContext('2d')
  if (contexte === null) return null
  contexte.drawImage(image, 0, 0)
  const pixels = contexte.getImageData(0, 0, cote, cote).data
  const altitudes = new Float32Array(cote * cote)
  for (let i = 0; i < altitudes.length; i++) {
    const o = i * CANAUX_RGBA
    altitudes[i] = altitudeTerrarium(pixels[o] ?? 0, pixels[o + 1] ?? 0, pixels[o + 2] ?? 0)
  }
  return altitudes
}

/**
 * Loaded-tile altimeter, bilinear over the 4 neighbouring pixels.
 * T-0359 — nearest pixel let one peak dominate several azimuths (mask in plateaus). Bilinear
 * creates no peak: stays between surrounding pixel altitudes.
 */
export function altimetre(tuiles: ReadonlyMap<string, Float32Array>): Altimetre {
  const z = R('ZOOM_TUILE_RELIEF')
  const cote = R('COTE_TUILE_PX')
  const nb = 2 ** z
  const pixel = (px: number, py: number): number | null => {
    const tx = ((Math.floor(px / cote) % nb) + nb) % nb
    const ty = Math.floor(py / cote)
    const tuile = tuiles.get(`${tx}/${ty}`)
    if (tuile === undefined) return null
    return tuile[(py - ty * cote) * cote + (((px % cote) + cote) % cote)] ?? null
  }
  return (latDeg, lonDeg) => {
    const p = pixelMonde(latDeg, lonDeg, z)
    // Altitudes = pixel CENTRES.
    const gx = p.x - 1 / 2
    const gy = p.y - 1 / 2
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = gx - x0
    const fy = gy - y0
    const a = pixel(x0, y0)
    const b = pixel(x0 + 1, y0)
    const c = pixel(x0, y0 + 1)
    const d = pixel(x0 + 1, y0 + 1)
    if (a === null || b === null || c === null || d === null) return null
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
  }
}

const CAUSE_HORS_LIGNE =
  'Relief du terrain inconnu pour ce site hors réseau : il se charge à la première visite en ligne.'
const CAUSE_SERVICE = 'Relief du terrain indisponible : le service des tuiles n’a pas répondu.'
const CAUSE_POLE = 'Relief du terrain non calculé si près du pôle : la maille des tuiles s’y écrase.'
const CAUSE_INVALIDE = 'Relief du terrain indisponible : les tuiles reçues sont illisibles.'

async function depuisReseau(
  latDeg: number,
  lonDeg: number,
  charge: ChargeTuile,
): Promise<ReliefSite> {
  const couvrantes = tuilesCouvrantes(latDeg, lonDeg)
  if (couvrantes === null) return { etat: 'INDISPONIBLE', cause: CAUSE_POLE }
  const z = R('ZOOM_TUILE_RELIEF')
  let lues: (Float32Array | null)[]
  try {
    lues = await Promise.all(couvrantes.map(({ x, y }) => charge(z, x, y)))
  } catch {
    return { etat: 'INDISPONIBLE', cause: CAUSE_SERVICE }
  }
  const tuiles = new Map<string, Float32Array>()
  for (const [rang, { x, y }] of couvrantes.entries()) {
    const altitudes = lues[rang]
    // Missing tile = silent flat sector: whole profile fails.
    if (altitudes === null || altitudes === undefined) {
      return { etat: 'INDISPONIBLE', cause: CAUSE_SERVICE }
    }
    tuiles.set(`${x}/${y}`, altitudes)
  }
  const altitude = altimetre(tuiles)
  const profil = profilRelief(altitude, latDeg, lonDeg)
  // `profilRelief` null without ground; non-null profile ⇒ site altitude exists.
  const solM = altitude(latDeg, lonDeg)
  if (profil === null || solM === null || !dansLeDomaine(profil)) {
    return { etat: 'INDISPONIBLE', cause: CAUSE_INVALIDE }
  }
  const courbes = courbesNiveau(altitude, latDeg, lonDeg)
  const bords = silhouettes(altitude, latDeg, lonDeg)
  const crete = creteFine(altitude, latDeg, lonDeg)
  return {
    etat: 'RELIEF',
    altitudesDeg: profil,
    solM,
    ...(courbes === null || bords === null || crete === null
      ? {}
      : {
          courbesDeg: courbes,
          silhouettesDeg: bords,
          creteDeg: crete,
          signatureCourbes: signatureCourbes(),
        }),
  }
}

/**
 * Profile (received or from cache) that `masqueDepuisRelief` accepts. Cache from an earlier
 * version or console-edited would otherwise throw at render, in the compute chain.
 */
function dansLeDomaine(profil: readonly number[]): boolean {
  try {
    masqueDepuisRelief(profil)
    return true
  } catch {
    return false
  }
}

/**
 * T-0395 — contour-computation version; bump when `courbesNiveau` changes. Not in cache key:
 * offline, a visited site keeps its mask.
 */
const VERSION_COURBES = 10

export function signatureCourbes(): string {
  return [
    `v${VERSION_COURBES}`,
    R('EQUIDISTANCE_COURBES_M'),
    R('PAS_AZIMUT_COURBES_DEG'),
    R('TOLERANCE_COURBES_DEG'),
    R('CORDE_MAX_COURBES_DEG'),
    R('PROFONDEUR_MIN_SILHOUETTE_M'),
    R('ECART_RACCORD_SILHOUETTE'),
    R('ETENDUE_MIN_SILHOUETTE_DEG'),
    R('PAS_AZIMUT_CRETE_DEG'),
  ].join(':')
}

/** In-flight resolutions by site: two close renders don't download twice. */
const enVol = new Map<string, Promise<ReliefSite>>()

/** Site relief: never an exception, always a profile or a cause. */
export async function resoudRelief(
  latDeg: number,
  lonDeg: number,
  charge: ChargeTuile = chargeTuileReseau,
): Promise<ReliefSite> {
  const cle = cleRelief(latDeg, lonDeg)
  const lu = await litRelief(cle).catch(() => null)
  const enCache = lu !== null && dansLeDomaine(lu.altitudesDeg) ? lu : null
  const horsLigne = modeReseauCourant() === 'HORS_LIGNE'
  // T-0395 — absent/outdated contours redone online; offline or mute service, cached mask
  // stays good (what matters).
  if (enCache !== null && (horsLigne || enCache.signatureCourbes === signatureCourbes())) {
    return enCache
  }
  if (horsLigne) return { etat: 'INDISPONIBLE', cause: CAUSE_HORS_LIGNE }

  const dejaEnVol = enVol.get(cle)
  if (dejaEnVol !== undefined) return dejaEnVol
  const resolution = depuisReseau(latDeg, lonDeg, charge).then(async (relief) => {
    // Refused cache (private browsing, quota) removes nothing from session relief.
    if (relief.etat === 'RELIEF') await ecritRelief(cle, relief).catch(() => undefined)
    return relief
  })
  enVol.set(cle, resolution)
  try {
    const relief = await resolution
    return relief.etat === 'INDISPONIBLE' && enCache !== null ? enCache : relief
  } finally {
    enVol.delete(cle)
  }
}
