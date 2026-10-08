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

import { useCallback, useSyncExternalStore } from 'react'
import { K } from '../registry/constants.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { majTemps } from './scene-etat.ts'
import { S_PAR_MIN } from '../core/unites.ts'
import { creeAbonnes } from './abonnes.ts'
import { planPanorama, type PlanPanorama } from '../core/sequence-file.ts'
import { PRESET_SNR_DEFAUT, PRESETS_SNR } from '../registry/verdicts.ts'
import {
  booleen,
  chaine,
  dans,
  garde,
  gardeAuDepart,
  litLocal,
  objet,
  parmi,
} from '../data/stockage-local.ts'

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

/**
 * Réglages de §9.2 à §9.4. Ils pilotent le panneau ET l'aperçu peint dans le cadre.
 *
 * T-0374 — une seule saisie, le temps de prise de vue. La pose et l'intervalle s'en déduisent
 * avec la pose max du cadre (`planPanorama`) : deux curseurs et un champ pour une intention.
 */
export interface ReglagesFile {
  readonly dureeTotaleS: number
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

/**
 * T-0362 — ce que la fiche règle pour la cible lue : objectif de qualité, mode permissif,
 * explication dépliée. Tenus ici plutôt que dans la fiche pour survivre au
 * rechargement ; remis au défaut quand on ouvre une AUTRE cible, comme quand la fiche les
 * tenait — une fiche neuve s'ouvre sur l'objectif que le plan alloue (T-0268).
 */
export interface ReglagesFiche {
  readonly snrCible: number
  /** §7.2 — mode permissif C-03 = 3, désactivé par défaut : il se choisit, il ne se subit pas. */
  readonly permissif: boolean
  readonly explicationDepliee: boolean
}

export interface EtatSeance {
  readonly cible: ObjetCielProfond | null
  readonly mode: ModeInterface
  readonly vueCibles: VueCibles
  readonly file: ReglagesFile
  readonly fiche: ReglagesFiche
  readonly renduFile: RenduFile | null
  /**
   * §9.1 — pose max du cadre visé, publiée par le panneau qui la chiffre. Elle décide si le
   * temps de prise de vue tient en une photo : la scène et la profondeur la lisent ici.
   * `null` tant que le panneau ne l'a pas chiffrée. Recomptée, jamais persistée.
   */
  readonly poseMaxCadreS: number | null
}

const ETAT_INITIAL: EtatSeance = {
  cible: null,
  mode: 'CIEL_PROFOND',
  vueCibles: 'LISTE',
  file: {
    dureeTotaleS: K('DUREE_FILE_SPECTACULAIRE_MIN') * S_PAR_MIN,
    poseDansCadre: false,
  },
  fiche: {
    snrCible: PRESET_SNR_DEFAUT,
    permissif: false,
    explicationDepliee: false,
  },
  renduFile: null,
  poseMaxCadreS: null,
}

const CLE_STOCKAGE = 'orion.seance'

/**
 * La cible ne se range que par sa désignation : l'objet vient du catalogue, qui se charge
 * APRÈS le premier rendu. Elle attend ici que `relieCible` la retrouve ; d'ici là le panneau
 * montre la liste, puisqu'une fiche sans cible n'existe pas.
 */
let designationARelire: string | null = null

function restaure(depart: EtatSeance): EtatSeance {
  const lu = litLocal(CLE_STOCKAGE)
  if (lu === null) return depart
  if (chaine(lu.cible)) designationARelire = lu.cible as string
  const file = objet(lu.file)
  const fiche = objet(lu.fiche)
  return {
    ...depart,
    ...garde<Partial<EtatSeance>>(lu, {
      mode: parmi(MODES_INTERFACE),
      vueCibles: parmi(VUES_CIBLES),
    }),
    file: {
      ...depart.file,
      ...(file &&
        garde<Partial<ReglagesFile>>(file, {
          dureeTotaleS: dans('duree_prise_vue_s'),
          poseDansCadre: booleen,
        })),
    },
    fiche: {
      ...depart.fiche,
      ...(fiche &&
        garde<Partial<ReglagesFiche>>(fiche, {
          snrCible: (v) => PRESETS_SNR.some((p) => p.valeur === v),
          permissif: booleen,
          explicationDepliee: booleen,
        })),
    },
  }
}

const MODES_INTERFACE: readonly ModeInterface[] = Object.freeze(['CIEL_PROFOND', 'PANORAMA'])
const VUES_CIBLES: readonly VueCibles[] = Object.freeze(['LISTE', 'FICHE'])

let etat: EtatSeance = restaure(ETAT_INITIAL)
const { abonne, notifie } = creeAbonnes()

/** Le rendu du filé n'en est pas : il se recompte à la première passe. */
function seancePersistee(courant: EtatSeance): unknown {
  return {
    cible: courant.cible?.designation ?? designationARelire,
    mode: courant.mode,
    vueCibles: courant.vueCibles,
    file: courant.file,
    fiche: courant.fiche,
  }
}

gardeAuDepart(CLE_STOCKAGE, () => seancePersistee(etat))

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
  designationARelire = null
  const autre = etat.cible?.designation !== cible.designation
  pose({ ...etat, cible, vueCibles: 'FICHE', ...(autre && { fiche: ETAT_INITIAL.fiche }) })
}

/**
 * T-0362 — la cible gardée au dernier passage, retrouvée dans le catalogue qui vient d'arriver.
 * Sans geste : la fiche se rouvre telle qu'on l'a quittée, réglages compris. Une désignation
 * disparue du catalogue est oubliée.
 */
export function relieCible(catalogue: readonly ObjetCielProfond[]): void {
  if (designationARelire === null || catalogue.length === 0) return
  const designation = designationARelire
  designationARelire = null
  const cible = catalogue.find((o) => o.designation === designation)
  if (cible !== undefined) pose({ ...etat, cible })
}

export function majFiche(retouche: Partial<ReglagesFiche>): void {
  pose({ ...etat, fiche: { ...etat.fiche, ...retouche } })
}

/** Le retour de la fiche : la cible reste désignée, c'est la LECTURE qui change. */
export function montreListeCibles(): void {
  pose({ ...etat, vueCibles: 'LISTE' })
}

/**
 * Ce que le temps de prise de vue prescrit au cadre visé : une photo, ou un filé découpé en
 * poses. Le mode ne se choisit pas, il se déduit — un menu à côté du curseur pouvait le
 * contredire. Une seule source pour la passe qui peint, le panneau qui chiffre et la profondeur.
 */
export function planDeSeance(courant: Pick<EtatSeance, 'file' | 'poseMaxCadreS'>): PlanPanorama {
  return planPanorama(courant.file.dureeTotaleS, courant.poseMaxCadreS)
}

export function majFile(retouche: Partial<ReglagesFile>): void {
  pose({ ...etat, file: { ...etat.file, ...retouche } })
}

/** T-0374 — n'écrit que si la valeur change : le panneau la republie à chaque rendu. */
export function posePoseMaxCadre(poseMaxCadreS: number | null): void {
  if (poseMaxCadreS !== etat.poseMaxCadreS) pose({ ...etat, poseMaxCadreS })
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
  designationARelire = null
  pose(ETAT_INITIAL)
}

export function useSeance(): EtatSeance {
  return useSyncExternalStore(abonne, etatSeance, etatSeance)
}

/**
 * T-0398 — s'abonner à une tranche de la séance plutôt qu'à sa totalité, comme
 * `useTrancheScene` (T-0056) le fait pour la scène.
 *
 * En Panorama, la pose max suit la déclinaison visée et se republie à chaque mouvement :
 * chaque abonné à `useSeance` se re-rendait avec elle, la racine de l'application comprise.
 * Le sélecteur doit être défini au niveau du module et rendre une valeur comparable par
 * `Object.is` — c'est ce que `useSyncExternalStore` compare pour sauter un rendu.
 */
export function useTrancheSeance<T>(selecteur: (etat: EtatSeance) => T): T {
  const lit = useCallback(() => selecteur(etatSeance()), [selecteur])
  return useSyncExternalStore(abonne, lit, lit)
}

export function cibleSeance(etat: EtatSeance): ObjetCielProfond | null {
  return etat.cible
}

export function modeSeance(etat: EtatSeance): ModeInterface {
  return etat.mode
}

export function vueCiblesSeance(etat: EtatSeance): VueCibles {
  return etat.vueCibles
}

export function fileSeance(etat: EtatSeance): ReglagesFile {
  return etat.file
}

export function ficheSeance(etat: EtatSeance): ReglagesFiche {
  return etat.fiche
}
