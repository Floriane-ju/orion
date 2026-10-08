/**
 * §9.3, T-0398 — la passe de filé hors du fil principal.
 *
 * Mesuré dans Firefox en Panorama, 30 min de filé : 50 ms par image pour la seule passe — un
 * quart de sélection et d'arcs, un quart de peinture, cinq mille traces —, sur un budget de
 * 33 ms. Aucune de ses fonctions ne dépasse 5 % du profil : rien ne se gagne sans en changer la
 * place. Elle se peint donc dans un worker, sur un `OffscreenCanvas`, et la boucle ne pose plus
 * que l'image reçue.
 *
 * L'image reçue porte la vue qu'elle a peinte, et la boucle peint TOUTE la scène avec cette
 * vue-là : fond, sol, cadre et traces restent d'un seul tenant. Peints avec la vue courante,
 * le relief et le ciel se décollaient sous un geste rapide. Le prix est une image de latence
 * pour l'ensemble, pas un décalage entre couches ; au repos, la dernière demande est celle de
 * la vue affichée, et l'image est exacte.
 *
 * Une seule demande en vol : celles qui arrivent entre-temps se remplacent, et seule la plus
 * récente part au retour. Un worker plus lent que la boucle saute des images au lieu de les
 * empiler.
 */

import type { LuneFile } from '../core/fond-lune-file.ts'
import type { Mat3, Vec3 } from '../core/mat3.ts'
import type { Vue } from '../core/projection.ts'
import type { MasqueHorizon } from '../core/site.ts'
import type { Etoile } from '../data/catalog.ts'
import type { ParametresFile, SortieDessinChamp } from './dessine-champ.ts'

/** Ce qu'une image de filé demande au worker : de quoi refaire le projecteur de la scène. */
export interface DemandeImageFile {
  readonly vue: Vue
  readonly matriceCiel: Mat3
  /** Le relief qui retient les traces sous l'horizon (§4.1), `null` quand la couche Sol est éteinte. */
  readonly masque: Pick<MasqueHorizon, 'altitudesDeg' | 'estHypothese'> | null
  readonly parametres: ParametresFile
  readonly axePoleNord: Vec3
  readonly latitudeDeg: number
  readonly sbCiel: number
  readonly vueRealiste: boolean
  readonly modeNuit: boolean
  /** T-0400 — la Lune retenue pour la séance, ou `null` : vue non réaliste, ou Lune couchée. */
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
      /** La vue de la demande peinte : celle avec laquelle la boucle peint le reste. */
      readonly vue: Vue
    }
  /** Le worker n'a pas de contexte 2D hors écran : la passe revient au fil principal. */
  | { readonly type: 'echec' }

/** Ce que le client emploie d'un `Worker` — un faux s'y substitue dans les tests. */
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
  /** La dernière image reçue, `null` avant la première. */
  derniere(): ImageFile | null
  /** Change à chaque image reçue : la boucle repeint quand il bouge. */
  version(): number
  /** Vrai quand le worker a échoué : la boucle repeint alors la passe elle-même. */
  enPanne(): boolean
  catalogue(etoiles: readonly Etoile[]): void
  demande(demande: DemandeImageFile): void
  ferme(): void
}

/** Le worker de la passe, ou `null` quand la plateforme n'a pas de quoi le faire tourner. */
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
  // Un module qui ne se charge pas, une exception dans la passe : le filé ne doit pas
  // disparaître pour autant, il retourne au fil principal.
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
