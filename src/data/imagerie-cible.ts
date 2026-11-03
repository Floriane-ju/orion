/**
 * §6.4, §6.2 — target image: survey cutout + attribution + overlaid sensor frame.
 * Single source = what makes the frame possible. Encyclopedia image is framed by its author:
 * angular field written nowhere, no rectangle can be right. Cutout is requested at a chosen
 * field → gives the scale. §6.4 still describes two sources in reverse order: gap assumed,
 * arbitration not made here.
 * One refusal remains: weight cap, §12.3 outranks a thumbnail.
 * Failure never throws. No image = still complete target (§12.5); an error message would make
 * missing visual comfort look like an outage.
 */

import type { ObjetCielProfond } from './deepsky.ts'
import { ecritImage, litImage, type ImageStockee } from './db.ts'
import { modeReseauCourant } from './degradation.ts'
import {
  CHEMIN_DECOUPE,
  CREDIT_RELEVE,
  HOTE_DECOUPE,
  I,
  RELEVE_DECOUPE,
} from '../registry/imagerie.ts'
import { ARCMIN_PAR_DEG, POURCENT, QUART_TOUR_DEG as ANGLE_DROIT_DEG } from '../core/unites.ts'

const OCTETS_PAR_KO = 1024

/**
 * §6.4 — cutout field: object size widened by registry margin. A 71' and a 2' object aren't
 * viewed at the same field. Size absent → registry fallback; hence no frame on a target without
 * dimensions: field would be convention, not measure, rectangle would lie.
 */
export function champDecoupeDeg(objet: ObjetCielProfond): number {
  const taille = objet.majAxArcmin
  if (taille === null || !(taille > 0)) return I('CHAMP_DECOUPE_DEFAUT_DEG')
  const brut = (taille / ARCMIN_PAR_DEG) * I('MARGE_CADRAGE_DECOUPE')
  return Math.min(Math.max(brut, I('CHAMP_DECOUPE_MIN_DEG')), I('CHAMP_DECOUPE_MAX_DEG'))
}

/** Survey cutout address at object coordinates and requested field. */
function urlDecoupeAuChamp(objet: ObjetCielProfond, champDeg: number): string {
  const cote = I('LARGEUR_VIGNETTE_PX')
  const parametres = new URLSearchParams({
    hips: RELEVE_DECOUPE,
    width: String(cote),
    height: String(cote),
    fov: String(champDeg),
    projection: 'TAN',
    coordsys: 'icrs',
    ra: String(objet.adDeg),
    dec: String(objet.decDeg),
    format: 'jpg',
  })
  return `${HOTE_DECOUPE}${CHEMIN_DECOUPE}?${parametres.toString()}`
}

/** Cutout illustrating the object: framed on its size (§6.4). */
export function urlDecoupe(objet: ObjetCielProfond): string {
  return urlDecoupeAuChamp(objet, champDecoupeDeg(objet))
}

/**
 * §13.1 — no request says where it comes from; else browser attaches app origin to each call: no
 * profil/site/plan, but information nothing obliges to send. Origin list enumerates what leaves.
 */
const SANS_REFERENT: RequestInit = { referrerPolicy: 'no-referrer' }

async function octets(adresse: string): Promise<Blob | null> {
  const reponse = await fetch(adresse, SANS_REFERENT)
  if (!reponse.ok) return null
  const corps = await reponse.blob()
  if (!corps.type.startsWith('image/')) return null
  if (corps.size > I('POIDS_VIGNETTE_MAX_KO') * OCTETS_PAR_KO) return null
  return corps
}

/** Survey cutout, stored under object designation. */
async function decoupe(designation: string, adresse: string): Promise<ImageStockee | null> {
  const corps = await octets(adresse)
  if (corps === null) return null
  return {
    designation,
    origine: 'RELEVE',
    octets: corps,
    credit: CREDIT_RELEVE,
    source: adresse,
    obtenueIso: new Date().toISOString(),
  }
}

/**
 * In-flight resolutions by designation: else fiche + list thumbnail request the same image
 * twice at once → service answers 429.
 */
const enVol = new Map<string, Promise<ImageStockee | null>>()

/**
 * Target image: cache first, then network, never reverse.
 * Offline with no cache is not an error: it's this function's §12.5 line, degradation named =
 * §9.2 schematic frame, already rendered. Online, end-to-end failure returns `null`, no throw.
 */
export async function resoudImage(objet: ObjetCielProfond): Promise<ImageStockee | null> {
  const enCache = await litImage(objet.designation)
  // Earlier visit may have stored an encyclopedia image under this designation; its field is
  // written nowhere, reusing it would place the frame at an invented scale.
  if (enCache !== null && enCache.origine === 'RELEVE') return enCache
  if (modeReseauCourant() === 'HORS_LIGNE') return null

  const dejaEnVol = enVol.get(objet.designation)
  if (dejaEnVol !== undefined) return dejaEnVol

  const resolution = (async () => {
    try {
      const image = await decoupe(objet.designation, urlDecoupe(objet))
      if (image !== null) await ecritImage(image)
      return image
    } catch {
      return null
    }
  })().finally(() => enVol.delete(objet.designation))

  enVol.set(objet.designation, resolution)
  return resolution
}

/** Stored target image, never touches network (§6.4). */
export function imageEnCache(designation: string): Promise<ImageStockee | null> {
  return litImage(designation)
}

/**
 * §6.2 — sensor frame, read on the object cutout.
 * ONE WAY TO READ IT, WHATEVER THE FILL
 *   Frame lives in an inset, never overlaid on the large image: an overlay changed nature per
 *   target (frame IN image vs image IN frame), needing different gestures for the same question.
 *   Inset always answers: here is the frame, here is what target occupies. No special case:
 *   `partObjetPct` > 100 when target exceeds frame → cutout overflows inset, clipped = the mosaic
 *   picture (full frame, object spilling out).
 * FRAME DOES NOT ROTATE, IMAGE TILTS
 *   Tilted frame doesn't show what a sensor gives. Reversed relation reads better and is
 *   physically right: turning the body tilts the sky in the frame.
 *   Sign from projection. TAN cutout: North up, East left; position angle counts North→East =
 *   counter-clockwise on screen, CSS `rotate()` clockwise. Unrotated rectangle has long side
 *   horizontal = position angle a quarter turn off: frame would draw at `90 − angle`, so
 *   straightening it tilts image by `angle − 90`. Portrait sensor: long side already vertical,
 *   quarter turn drops.
 */
export interface CadreSurImage {
  /** Cutout's share of inset width, %. > 100: target overflows frame (mosaic), inset clips it. */
  readonly partObjetPct: number
  readonly rotationDeg: number
}

export function cadreSurImage(
  objet: ObjetCielProfond,
  fovLDeg: number,
  fovHDeg: number,
  angleBoitierDeg: number | null,
): CadreSurImage {
  return {
    partObjetPct: (champDecoupeDeg(objet) / fovLDeg) * POURCENT,
    rotationDeg:
      angleBoitierDeg === null
        ? 0
        : fovLDeg >= fovHDeg
          ? angleBoitierDeg - ANGLE_DROIT_DEG
          : angleBoitierDeg,
  }
}
