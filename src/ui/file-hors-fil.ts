/**
 * §9.3, T-0398 — filé pass off the main thread.
 * Measured Firefox, Panorama, 30 min filé: 50 ms/frame for the pass alone (¼ selection+arcs, ¼
 * paint, 5000 traces) vs 33 ms budget. No function above 5 % of profile: only moving it helps →
 * worker on an `OffscreenCanvas`; loop only places received image.
 * Image carries the vue it painted; loop paints the WHOLE scène with that vue: fond, sol, cadre,
 * traces stay one piece (current vue detached relief and sky on fast gestures). Price: one frame
 * latency for everything, not a layer offset; at rest last request = displayed vue's, image exact.
 * One request in flight: arrivals meanwhile replace each other, only latest leaves on return. A
 * worker slower than loop skips frames, doesn't queue.
 */

import type { LuneFile } from '../core/fond-lune-file.ts'
import type { Mat3, Vec3 } from '../core/mat3.ts'
import type { Vue } from '../core/projection.ts'
import type { MasqueHorizon } from '../core/site.ts'
import type { Etoile } from '../data/catalog.ts'
import type { ParametresFile, SortieDessinChamp } from './dessine-champ.ts'

/** What a filé frame asks of the worker: enough to rebuild the scène projecteur. */
export interface DemandeImageFile {
  readonly vue: Vue
  readonly matriceCiel: Mat3
  /** Relief retaining traces under horizon (§4.1), `null` when Sol layer is off. */
  readonly masque: Pick<MasqueHorizon, 'altitudesDeg' | 'estHypothese'> | null
  readonly parametres: ParametresFile
  readonly axePoleNord: Vec3
  readonly modeNuit: boolean
  /** T-0400 — Lune retained for séance, or `null`: non-réaliste view, or Lune set. */
  readonly lune: LuneFile | null
}

export type MessageVersFile =
  | { readonly type: 'catalogue'; readonly etoiles: readonly Etoile[] }
  | { readonly type: 'image'; readonly demande: DemandeImageFile }

export type MessageDuFile =
  | {
      readonly type: 'image'
      readonly bitmap: ImageBitmap
      readonly sortie: SortieDessinChamp
      /** Vue of the painted request: the one loop paints the rest with. */
      readonly vue: Vue
    }
  /** Worker has no offscreen 2D context: pass returns to main thread. */
  | { readonly type: 'echec' }

/** What client uses of a `Worker` — a fake replaces it in tests. */
export interface PortFile {
  postMessage(message: MessageVersFile): void
  onmessage: ((evenement: MessageEvent<MessageDuFile>) => void) | null
  onerror: ((evenement: ErrorEvent) => void) | null
  terminate(): void
}

export interface ImageFile {
  readonly bitmap: ImageBitmap
  readonly sortie: SortieDessinChamp
  readonly vue: Vue
}

export interface ClientFile {
  /** Last image received, `null` before the first. */
  derniere(): ImageFile | null
  /** Changes on each image received: loop repaints when it moves. */
  version(): number
  /** True when worker failed: loop then repaints the pass itself. */
  enPanne(): boolean
  catalogue(etoiles: readonly Etoile[]): void
  demande(demande: DemandeImageFile): void
  ferme(): void
}

/** Pass worker, or `null` when platform can't run one. */
export function creePortFile(): PortFile | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  return new Worker(new URL('./file-worker.ts', import.meta.url), { type: 'module' })
}

export function clientFile(port: PortFile): ClientFile {
  let derniere: ImageFile | null = null
  let version = 0
  let panne = false
  let enVol = false
  let enAttente: DemandeImageFile | null = null

  const envoie = (demande: DemandeImageFile): void => {
    enVol = true
    port.postMessage({ type: 'image', demande })
  }

  port.onmessage = ({ data }) => {
    if (data.type === 'echec') {
      panne = true
      return
    }
    derniere?.bitmap.close()
    derniere = { bitmap: data.bitmap, sortie: data.sortie, vue: data.vue }
    version++
    enVol = false
    const suivante = enAttente
    enAttente = null
    if (suivante !== null) envoie(suivante)
  }
  // Module load failure, exception in pass: filé must not vanish, returns to main thread.
  port.onerror = () => {
    panne = true
  }

  return {
    derniere: () => derniere,
    version: () => version,
    enPanne: () => panne,
    catalogue(etoiles) {
      port.postMessage({ type: 'catalogue', etoiles })
    },
    demande(demande) {
      if (enVol) enAttente = demande
      else envoie(demande)
    },
    ferme() {
      port.terminate()
      derniere?.bitmap.close()
      derniere = null
    },
  }
}
