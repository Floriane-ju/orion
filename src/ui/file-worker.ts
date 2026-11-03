/**
 * §9.3, T-0398 — worker painting the filé pass (see `file-hors-fil.ts`).
 * Rebuilds scène projecteur with §3.3 engine, sol filter incl.: traces land where loop would paint
 * them. Indexes built here on catalogue receipt — 300000-star semis no longer crosses main thread.
 */

import { projecteur } from '../core/projection.ts'
import { projecteurSansSol } from '../core/sol.ts'
import type { Etoile } from '../data/catalog.ts'
import { dessineChamp } from './dessine-champ.ts'
import { indexFile } from './file-index.ts'
import type { MessageDuFile, MessageVersFile } from './file-hors-fil.ts'

/** Dedicated worker scope, reduced to what's used: DOM lib has no type for it. */
interface PorteeWorker {
  onmessage: ((evenement: MessageEvent<MessageVersFile>) => void) | null
  postMessage(message: MessageDuFile, transfert: Transferable[]): void
}

const portee = globalThis as unknown as PorteeWorker
let etoiles: readonly Etoile[] = []
let toile: OffscreenCanvas | null = null

portee.onmessage = ({ data }) => {
  if (data.type === 'catalogue') {
    etoiles = data.etoiles
    return
  }
  const d = data.demande
  const { largeurPx, hauteurPx } = d.vue
  if (toile === null || toile.width !== largeurPx || toile.height !== hauteurPx) {
    toile = new OffscreenCanvas(largeurPx, hauteurPx)
  }
  const ctx = toile.getContext('2d')
  if (ctx === null) {
    portee.postMessage({ type: 'echec' }, [])
    return
  }
  ctx.clearRect(0, 0, largeurPx, hauteurPx)
  const brut = projecteur(d.vue, d.matriceCiel)
  const sortie = dessineChamp({
    ...d.parametres,
    ...indexFile(etoiles),
    // Pass uses only the part common to both 2D contexts.
    ctx: ctx as unknown as CanvasRenderingContext2D,
    projecteur: d.masque === null ? brut : projecteurSansSol(brut, d.masque, d.matriceCiel),
    axePoleNord: d.axePoleNord,
    modeNuit: d.modeNuit,
    lune: d.lune,
  })
  const bitmap = toile.transferToImageBitmap()
  portee.postMessage({ type: 'image', bitmap, sortie, vue: d.vue }, [bitmap])
}
