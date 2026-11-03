/**
 * §9 + §11.2 — séance intention held once. Three things cross the whole screen:
 *   1. click on object IN THE SCÈNE opens its fiche, filled;
 *   2. filé settings set in panel, drawn in cadre;
 *   3. Panorama freezes scène time (filé = fixed composition).
 * None goes up to a common ancestor but app. As [[scene-etat]]: module state; external store
 * reads in SSR + browser, tests without DOM.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { K } from '../registry/constants.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { majTemps } from './scene-etat.ts'
import { S_PAR_MIN } from '../core/unites.ts'
import { creeAbonnes } from './abonnes.ts'
import type { EssaiZoom } from './zoom-calcul.ts'
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
 * T-0179 — the only first-rank switch (§11.3): decides what scène paints + what right panel
 * carries. Was checkbox "Peindre le filé sur toute la scène", promoted to named state.
 * Plan de nuit third: read lengthwise like the list; scène stays ciel profond, only panel changes.
 */
export type ModeInterface = 'CIEL_PROFOND' | 'PANORAMA' | 'PLAN'

/**
 * T-0182 — the two Ciel profond panel states. Not a tab: browse to choose, then read the
 * choice. Same place, one after the other; back returns the list as it was.
 */
export type VueCibles = 'LISTE' | 'FICHE'

/**
 * §9.2–§9.4 settings. Drive the panel AND the preview painted in cadre.
 * T-0374 — one saisie, temps de prise de vue; pose + interval derive from it with cadre pose
 * max (`planPanorama`): two sliders + a field for one intention was too many.
 */
export interface ReglagesFile {
  readonly dureeTotaleS: number
  /** T-0142 — §9.1 painted INSIDE the sensor cadre, masking it, rather than in panel. */
  readonly poseDansCadre: boolean
}

/**
 * What the last filé pass traced; `null` until one ran.
 * T-0154 — only real-catalogue effectif remains: tells if cadre offers a bright repère for
 * manual pointage. Semis + truncated arcs counted only for a panel sentence, now gone.
 */
export interface RenduFile {
  readonly reelles: number
}

/**
 * T-0362 — what fiche sets for the read cible: objectif de qualité, permissive mode, unfolded
 * explication. Held here to survive reload; reset when ANOTHER cible opens, as when fiche held
 * them — new fiche opens on the objectif plan allocates (T-0268).
 */
export interface ReglagesFiche {
  readonly snrCible: number
  /** §7.2 — permissive mode C-03 = 3, off by default: chosen, not suffered. */
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
   * §9.1 — pose max of aimed cadre, published by the panel that computes it. Decides if temps de
   * prise de vue fits one photo; scène + depth read it. `null` until computed. Never persisted.
   */
  readonly poseMaxCadreS: number | null
  /**
   * List card under pointer: scène draws the cadre the cible would get. Gesture, not
   * intention — never persisted.
   */
  readonly survolee: ObjetCielProfond | null
  /**
   * T-0408 — focale tried on fiche's ring. Here, not in fiche: scène paints the cadre it gives.
   * Trial, not setting — never persisted.
   */
  readonly essaiZoom: EssaiZoom | null
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
  survolee: null,
  essaiZoom: null,
}

const CLE_STOCKAGE = 'orion.seance'

/**
 * Cible stored by designation only: object comes from catalogue, loaded AFTER first render.
 * Waits for `relieCible` to find it; meanwhile panel shows list (fiche without cible can't exist).
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

const MODES_INTERFACE: readonly ModeInterface[] = Object.freeze(['CIEL_PROFOND', 'PANORAMA', 'PLAN'])
const VUES_CIBLES: readonly VueCibles[] = Object.freeze(['LISTE', 'FICHE'])

let etat: EtatSeance = restaure(ETAT_INITIAL)
const { abonne, notifie } = creeAbonnes()

/** Filé render isn't one: recounted at first pass. */
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
 * §3.4 — object clicked in scène opens its fiche. Gesture mustn't end on a dialog in mid-sky:
 * fiche replaces list, filled.
 * T-0113 then T-0182 — fiche went tab → card → panel. Contract kept: clicking an object MUST
 * get it read with no other gesture. Catalogue row goes through here too — one path, two
 * entries, else they diverge.
 */
export function ouvreCible(cible: ObjetCielProfond): void {
  designationARelire = null
  const autre = etat.cible?.designation !== cible.designation
  // List unmounts under pointer without emitting exit: hover forgotten here.
  pose({
    ...etat,
    cible,
    vueCibles: 'FICHE',
    survolee: null,
    ...(autre && { fiche: ETAT_INITIAL.fiche }),
  })
}

/**
 * T-0362 — cible kept from last visit, found in the just-arrived catalogue. No gesture: fiche
 * reopens as left, settings included. Designation gone from catalogue → forgotten.
 */
export function relieCible(catalogue: readonly ObjetCielProfond[]): void {
  if (designationARelire === null || catalogue.length === 0) return
  const designation = designationARelire
  designationARelire = null
  const cible = catalogue.find((o) => o.designation === designation)
  if (cible !== undefined) pose({ ...etat, cible })
}

/** Hover a list card; `null` when pointer leaves. */
export function survoleCible(objet: ObjetCielProfond | null): void {
  if (etat.survolee === objet) return
  pose({ ...etat, survolee: objet })
}

export function essaieFocale(essai: EssaiZoom): void {
  pose({ ...etat, essaiZoom: essai })
}

export function majFiche(retouche: Partial<ReglagesFiche>): void {
  pose({ ...etat, fiche: { ...etat.fiche, ...retouche } })
}

/** Fiche back: cible stays designated, what changes is the READING. */
export function montreListeCibles(): void {
  pose({ ...etat, vueCibles: 'LISTE' })
}

/**
 * What temps de prise de vue prescribes for aimed cadre: one photo, or filé cut into poses.
 * Mode deduced, not chosen — a menu beside the slider could contradict it. Single source for
 * painting pass, computing panel, depth.
 */
export function planDeSeance(courant: Pick<EtatSeance, 'file' | 'poseMaxCadreS'>): PlanPanorama {
  return planPanorama(courant.file.dureeTotaleS, courant.poseMaxCadreS)
}

export function majFile(retouche: Partial<ReglagesFile>): void {
  pose({ ...etat, file: { ...etat.file, ...retouche } })
}

/** T-0374 — writes only if value changes: panel republishes every render. */
export function posePoseMaxCadre(poseMaxCadreS: number | null): void {
  if (poseMaxCadreS !== etat.poseMaxCadreS) pose({ ...etat, poseMaxCadreS })
}

/** `null` when filé switches off: stale counters would lie about what is traced. */
export function poseRenduFile(rendu: RenduFile | null): void {
  pose({ ...etat, renduFile: rendu })
}

/**
 * T-0116 — filé pass painted per frame, its counters not. `poseRenduFile` writes to store →
 * React render; published every paint = 30/s (T-0056's bug). Loop calls this publisher at
 * diagnostic rate; only what CHANGED passes: stable or off filé costs no render.
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
 * §9.3 — Panorama freezes time. Animated vue stays §3: filé = fixed composition; scrolling
 * hours under accumulated arcs is meaningless. Back to Ciel profond thaws nothing: giving time
 * back to system clock = bottom-bar transport gesture (§3.2), not a mode side effect.
 */
export function poseMode(mode: ModeInterface): void {
  pose({ ...etat, mode, survolee: null })
  if (mode === 'PANORAMA') majTemps({ modeTemps: 'FIGE' })
}

/** Resets séance to start state. Tests only. */
export function reinitialiseSeance(): void {
  designationARelire = null
  pose(ETAT_INITIAL)
}

export function useSeance(): EtatSeance {
  return useSyncExternalStore(abonne, etatSeance, etatSeance)
}

/**
 * T-0398 — subscribe to a séance slice, not the whole, like `useTrancheScene` (T-0056) for
 * scène. In Panorama pose max follows aimed déclinaison, republishes per move: each `useSeance`
 * subscriber re-rendered, app root included.
 * Selector: module-level, `Object.is`-comparable return (what `useSyncExternalStore` compares
 * to skip a render).
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

export function essaiZoomSeance(etat: EtatSeance): EssaiZoom | null {
  return etat.essaiZoom
}

export function ficheSeance(etat: EtatSeance): ReglagesFiche {
  return etat.fiche
}
