/**
 * §9 + §11.2 — l'intention de séance : ce qu'on veut faire, tenu une seule fois.
 *
 * Trois choses doivent traverser l'écran de part en part :
 *
 *   1. un clic sur un objet DANS LA SCÈNE doit ouvrir sa fiche, garnie ;
 *   2. les réglages du filé se règlent au panneau mais se dessinent dans le cadre ;
 *   3. passer en Panorama fige le temps de la scène — un filé est une composition fixe.
 *
 * Aucun de ces trois chemins ne remonte à un ancêtre commun autre que l'application. Comme
 * pour [[scene-etat]], l'état vit donc dans le module : un magasin externe se lit aussi bien
 * en rendu serveur que dans le navigateur, et se teste sans DOM.
 */

import { useSyncExternalStore } from 'react'
import { K } from '../registry/constants.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { majTemps } from './scene-etat.ts'
import { S_PAR_MIN } from '../core/unites.ts'
import { creeAbonnes } from './abonnes.ts'


/** §9.2 aperçu d'une pose, §9.3 filé d'une durée accumulée : même moteur, durée différente. */
export type ModeApercu = 'CHAMP' | 'FILE'

/**
 * T-0179 — le seul commutateur de premier rang (§11.3) : il décide de ce que la scène peint et
 * de ce que le panneau de droite porte. C'est l'ancienne case « Peindre le filé sur toute la
 * scène » promue en état nommé — un état de cette portée ne se règle pas au troisième niveau
 * d'un panneau.
 */
export type ModeInterface = 'CIEL_PROFOND' | 'PANORAMA'

/**
 * T-0182 — les deux états du panneau en Ciel profond. Ce n'est pas un onglet : on parcourt
 * pour choisir, puis on lit ce qu'on a choisi. Les deux prennent la même place, l'un après
 * l'autre, et le retour ramène la liste telle qu'elle était.
 */
export type VueCibles = 'LISTE' | 'FICHE'

/** Réglages de §9.2 à §9.4. Ils pilotent le panneau ET l'aperçu peint dans le cadre. */
export interface ReglagesFile {
  readonly tPoseS: number
  readonly dureeTotaleMin: number
  readonly intervalleS: number
  /** T-0142 — §9.1 peinte DANS le cadre du capteur, qu'elle masque, plutôt qu'au panneau. */
  readonly poseDansCadre: boolean
}

/**
 * Ce que la dernière passe de filé a effectivement tracé. `null` tant qu'aucune n'a eu lieu.
 *
 * T-0154 — seul l'effectif du catalogue réel subsiste : c'est lui qui dit si le cadre offre un
 * repère brillant pour un pointage manuel. Le semis et les arcs tronqués ne se comptaient que
 * pour une phrase de panneau, et la phrase est partie.
 */
export interface RenduFile {
  readonly reelles: number
}

export interface EtatSeance {
  readonly cible: ObjetCielProfond | null
  readonly mode: ModeInterface
  readonly vueCibles: VueCibles
  readonly file: ReglagesFile
  readonly renduFile: RenduFile | null
}

const ETAT_INITIAL: EtatSeance = {
  cible: null,
  mode: 'CIEL_PROFOND',
  vueCibles: 'LISTE',
  file: {
    tPoseS: K('T_POSE_FILE_MAX_S'),
    dureeTotaleMin: K('DUREE_FILE_SPECTACULAIRE_MIN'),
    intervalleS: K('INTERVALLE_INTER_POSE_FILE_MAX_S'),
    poseDansCadre: false,
  },
  renduFile: null,
}

let etat: EtatSeance = ETAT_INITIAL
const { abonne, notifie } = creeAbonnes()

export function etatSeance(): EtatSeance {
  return etat
}

function pose(suivant: EtatSeance): void {
  etat = suivant
  notifie()
}

/**
 * §3.4 — un objet cliqué dans la scène ouvre sa fiche. Le geste ne se termine pas sur une
 * boîte de dialogue au milieu du ciel : la fiche prend la place de la liste, garnie.
 *
 * T-0113 puis T-0182 — la fiche est passée d'un onglet à une carte, puis de la carte au
 * panneau. Le contrat ne bouge pas et c'est lui qui compte : cliquer un objet DOIT le faire
 * lire sans autre geste. Une ligne du catalogue passe par ici aussi — un seul chemin, deux
 * entrées, sans quoi les deux se mettraient à diverger.
 */
export function ouvreCible(cible: ObjetCielProfond): void {
  pose({ ...etat, cible, vueCibles: 'FICHE' })
}

/** Le retour de la fiche : la cible reste désignée, c'est la LECTURE qui change. */
export function montreListeCibles(): void {
  pose({ ...etat, vueCibles: 'LISTE' })
}

/**
 * Durée d'accumulation qui désigne l'aperçu de champ plutôt qu'un filé. Ce n'est pas la borne
 * basse de §9.3 — le domaine `duree_file_min` ouvre le filé à 5 min — mais la valeur hors
 * domaine par laquelle le curseur bascule d'un aperçu à l'autre. Le prédicat et le curseur la
 * lisent au même endroit, faute de quoi une borne pourrait rendre le mode CHAMP inatteignable.
 */
export const DUREE_APERCU_CHAMP_MIN = 0

/**
 * Le mode d'aperçu se DÉDUIT de la durée d'accumulation, il ne se choisit pas : une durée nulle
 * ne décrit qu'une photo, une durée non nulle décrit des poses qu'on additionne. Un menu à côté
 * du curseur pouvait contredire le curseur — deux commandes pour une seule intention.
 */
export function modeApercu(file: ReglagesFile): ModeApercu {
  return file.dureeTotaleMin > DUREE_APERCU_CHAMP_MIN ? 'FILE' : 'CHAMP'
}

/**
 * La durée que l'aperçu accumule, en minutes — une seule source pour la passe qui la peint et
 * pour le diagnostic qui la chiffre. Une photo unique n'accumule pas rien : elle accumule sa
 * pose, et ses étoiles portent l'arc de cette pose. Les lire à zéro annonçait un ciel figé que
 * le cadre ne montre pas.
 */
export function dureeApercuMin(file: ReglagesFile): number {
  return modeApercu(file) === 'FILE' ? file.dureeTotaleMin : file.tPoseS / S_PAR_MIN
}

export function majFile(retouche: Partial<ReglagesFile>): void {
  pose({ ...etat, file: { ...etat.file, ...retouche } })
}

/** `null` quand le filé s'éteint : des compteurs périmés mentiraient sur ce qui est tracé. */
export function poseRenduFile(rendu: RenduFile | null): void {
  pose({ ...etat, renduFile: rendu })
}

/**
 * T-0116 — la passe de filé se peint par image ; ses compteurs, non.
 *
 * `poseRenduFile` écrit dans le magasin, donc déclenche un rendu React. Publiés à chaque
 * peinture, ils en feraient trente par seconde — le défaut de T-0056. La boucle appelle donc
 * ce publicateur au rythme du diagnostic, et il ne laisse passer que ce qui a CHANGÉ : un filé
 * stable, ou éteint, ne coûte alors plus aucun rendu.
 */
export function publicateurRenduFile(
  publie: (rendu: RenduFile | null) => void,
): (rendu: RenduFile | null) => void {
  let cle: string | null = null
  let amorce = false
  return (rendu) => {
    const suivante = rendu === null ? null : `${rendu.reelles}`
    if (amorce && suivante === cle) return
    amorce = true
    cle = suivante
    publie(rendu)
  }
}

/**
 * §9.3 — passer en Panorama fige le temps. La vue animée reste le §3 : un filé est une
 * composition fixe, et faire défiler l'heure sous des arcs déjà accumulés ne veut rien dire.
 *
 * Revenir en Ciel profond ne dégèle rien : rendre le temps à l'horloge système est un geste du
 * transport de la barre basse (§3.2), pas un effet de bord du mode.
 */
export function poseMode(mode: ModeInterface): void {
  pose({ ...etat, mode })
  if (mode === 'PANORAMA') majTemps({ modeTemps: 'FIGE' })
}

/** Remet la séance dans son état de départ. Réservé aux tests. */
export function reinitialiseSeance(): void {
  pose(ETAT_INITIAL)
}

export function useSeance(): EtatSeance {
  return useSyncExternalStore(abonne, etatSeance, etatSeance)
}
