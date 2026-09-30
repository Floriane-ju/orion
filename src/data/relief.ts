/**
 * §4.1, §12.5 — le relief d'un site : le cache d'abord, les tuiles de terrain ensuite.
 *
 * Un échec ne lève jamais. Le masque plat [HYP] est le repli que §4.1 prévoit pour un site
 * sans donnée de relief : la saisie et le calcul continuent, et la cause se lit en une phrase
 * plutôt qu'en message d'erreur brut (T-0279). Hors réseau, un site déjà visité retrouve son
 * relief — c'est la ligne « Masque d'horizon » de la matrice §12.5.
 *
 * Les tuiles ne sont pas gardées, seul le profil de 360 élévations l'est : c'est lui que le
 * moteur consomme, et il pèse trois kilo-octets là où ses tuiles en pèsent mille cinq cents.
 */

import { profilRelief, type Altimetre } from '../core/relief.ts'
import { masqueDepuisRelief } from '../core/site.ts'
import { DEG } from '../core/mat3.ts'
import { K } from '../registry/constants.ts'
import { R, urlTuileRelief } from '../registry/relief.ts'
import { cleRelief, ecritRelief, litRelief } from './db.ts'
import { modeReseauCourant } from './degradation.ts'

export type ReliefSite =
  | { readonly etat: 'RELIEF'; readonly altitudesDeg: readonly number[] }
  | { readonly etat: 'INDISPONIBLE'; readonly cause: string }

/** Les altitudes d'une tuile, en mètres, ligne par ligne ; null quand elle n'a pas pu être lue. */
export type ChargeTuile = (z: number, x: number, y: number) => Promise<Float32Array | null>

const CANAUX_RGBA = 4
const LATITUDE_MAX_MERCATOR_DEG = Math.atan(Math.sinh(Math.PI)) / DEG

/** Terrarium : h = R × 256 + V + B / 256 − 32 768. */
export function altitudeTerrarium(rouge: number, vert: number, bleu: number): number {
  const base = R('COTE_TUILE_PX')
  return rouge * base + vert + bleu / base - R('DECALAGE_TERRARIUM_M')
}

/** Position en pixels mondiaux Web Mercator au zoom `z` : la tuile est ce nombre divisé par 256. */
export function pixelMonde(latDeg: number, lonDeg: number, z: number): { x: number; y: number } {
  const monde = R('COTE_TUILE_PX') * 2 ** z
  const phi = latDeg * DEG
  return {
    x: ((lonDeg + 180) / 360) * monde,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * monde,
  }
}

/** Les tuiles qui couvrent le rayon de §4.1 autour du site, ou null au-delà du plafond. */
export function tuilesCouvrantes(
  latDeg: number,
  lonDeg: number,
): readonly { readonly x: number; readonly y: number }[] | null {
  const z = R('ZOOM_TUILE_RELIEF')
  const cote = R('COTE_TUILE_PX')
  const nb = 2 ** z
  const rayonDeg = (R('RAYON_RELIEF_KM') / K('RAYON_TERRE_KM')) / DEG
  // Au-delà de la latitude où Mercator s'arrête (≈ 85,05°), il n'existe aucune tuile.
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
    // L'antiméridien se referme : la tuile à l'ouest de 0 est la dernière de la rangée.
    for (let x = x0; x <= x1; x++) tuiles.push({ x: ((x % nb) + nb) % nb, y })
  }
  return tuiles
}

/** §13.1 — la requête ne dit pas d'où elle vient. */
const SANS_REFERENT: RequestInit = { referrerPolicy: 'no-referrer' }

/** Une tuile téléchargée et décodée par le navigateur lui-même : aucun décodeur tiers. */
export const chargeTuileReseau: ChargeTuile = async (z, x, y) => {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null
  // Un service muet ne doit pas laisser le masque « en cours de chargement » pour la session.
  const reponse = await fetch(urlTuileRelief(z, x, y), {
    ...SANS_REFERENT,
    signal: AbortSignal.timeout(R('DELAI_MAX_TUILE_MS')),
  })
  if (!reponse.ok) return null
  const corps = await reponse.blob()
  if (!corps.type.startsWith('image/')) return null
  // Sans conversion : un profil de couleur appliqué aux octets fausserait les altitudes.
  // Limite connue : Firefox avec `privacy.resistFingerprinting` bruite `getImageData`, et le
  // profil obtenu est faux sans erreur. Aucune parade fiable ; le relevé manuel reste possible.
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

/** L'altimètre des tuiles chargées : le pixel le plus proche, au pas d'un pixel. */
function altimetre(tuiles: ReadonlyMap<string, Float32Array>): Altimetre {
  const z = R('ZOOM_TUILE_RELIEF')
  const cote = R('COTE_TUILE_PX')
  const nb = 2 ** z
  return (latDeg, lonDeg) => {
    const p = pixelMonde(latDeg, lonDeg, z)
    const px = Math.floor(p.x)
    const py = Math.floor(p.y)
    const tx = ((Math.floor(px / cote) % nb) + nb) % nb
    const ty = Math.floor(py / cote)
    const tuile = tuiles.get(`${tx}/${ty}`)
    if (tuile === undefined) return null
    const i = (py - ty * cote) * cote + (((px % cote) + cote) % cote)
    return tuile[i] ?? null
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
    // Une tuile manquante laisserait un secteur plat sans le dire : le profil entier tombe.
    if (altitudes === null || altitudes === undefined) {
      return { etat: 'INDISPONIBLE', cause: CAUSE_SERVICE }
    }
    tuiles.set(`${x}/${y}`, altitudes)
  }
  const profil = profilRelief(altimetre(tuiles), latDeg, lonDeg)
  if (profil === null || !dansLeDomaine(profil)) return { etat: 'INDISPONIBLE', cause: CAUSE_INVALIDE }
  return { etat: 'RELIEF', altitudesDeg: profil }
}

/**
 * Un profil — reçu ou relu du cache — que `masqueDepuisRelief` accepte. Un cache laissé par une
 * version antérieure ou retouché à la console lèverait sinon au rendu, dans la chaîne de calcul.
 */
function dansLeDomaine(profil: readonly number[]): boolean {
  try {
    masqueDepuisRelief(profil)
    return true
  } catch {
    return false
  }
}

/** Les résolutions en vol, par site : deux rendus rapprochés ne téléchargent pas deux fois. */
const enVol = new Map<string, Promise<ReliefSite>>()

/** Le relief d'un site : jamais une exception, toujours un profil ou une cause. */
export async function resoudRelief(
  latDeg: number,
  lonDeg: number,
  charge: ChargeTuile = chargeTuileReseau,
): Promise<ReliefSite> {
  const cle = cleRelief(latDeg, lonDeg)
  const enCache = await litRelief(cle).catch(() => null)
  if (enCache !== null && dansLeDomaine(enCache)) return { etat: 'RELIEF', altitudesDeg: enCache }
  if (modeReseauCourant() === 'HORS_LIGNE') return { etat: 'INDISPONIBLE', cause: CAUSE_HORS_LIGNE }

  const dejaEnVol = enVol.get(cle)
  if (dejaEnVol !== undefined) return dejaEnVol
  const resolution = depuisReseau(latDeg, lonDeg, charge).then(async (relief) => {
    // Un cache refusé (navigation privée, quota) ne retire rien au relief de la session.
    if (relief.etat === 'RELIEF') await ecritRelief(cle, relief.altitudesDeg).catch(() => undefined)
    return relief
  })
  enVol.set(cle, resolution)
  try {
    return await resolution
  } finally {
    enVol.delete(cle)
  }
}
