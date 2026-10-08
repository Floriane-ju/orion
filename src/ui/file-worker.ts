/**
 * §9.3, T-0398 — le worker qui peint la passe de filé (voir `file-hors-fil.ts`).
 *
 * Il refait le projecteur de la scène avec le moteur de §3.3, le filtre du sol compris : les
 * traces retombent au pixel où la boucle les aurait peintes. Ses index se construisent ici, à
 * la réception du catalogue — le semis de trois cent mille étoiles ne passe plus par le fil
 * principal.
 */

import { projecteur } from '../core/projection.ts'
import { projecteurSansSol } from '../core/sol.ts'
import type { Etoile } from '../data/catalog.ts'
import { dessineChamp } from './dessine-champ.ts'
import { indexFile } from './file-index.ts'
import type { MessageDuFile, MessageVersFile } from './file-hors-fil.ts'

/** La portée d'un worker dédié, réduite à ce qui sert : la bibliothèque DOM n'en a pas le type. */
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
    // La passe n'emploie que la part commune aux deux contextes 2D.
    ctx: ctx as unknown as CanvasRenderingContext2D,
    projecteur: d.masque === null ? brut : projecteurSansSol(brut, d.masque, d.matriceCiel),
    axePoleNord: d.axePoleNord,
    latitudeDeg: d.latitudeDeg,
    sbCiel: d.sbCiel,
    vueRealiste: d.vueRealiste,
    modeNuit: d.modeNuit,
  })
  const bitmap = toile.transferToImageBitmap()
  portee.postMessage({ type: 'image', bitmap, sortie, vue: d.vue }, [bitmap])
}
