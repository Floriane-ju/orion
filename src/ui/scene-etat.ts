/**
 * §3 + §9 — scène pointage + time, held once. Planétarium (§3) and grand champ (§9) show the
 * same photo: azimut, hauteur, boîtier rotation; per-view `useState` → cadrer in one ≠ other.
 * Module state, not React context: both views mounted side by side, only common ancestor = app;
 * external store reads same in SSR (`renderToStaticMarkup`) and browser.
 * ponytail: one store for whole document (only one scène); if two must coexist → context.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { K } from '../registry/constants.ts'
import { fovMaxSelonMode, type ModeProjection, type Vue } from '../core/projection.ts'
import type { ModeTemps } from '../core/curseur-temps.ts'
import type { EtapeParcours } from '../core/pointage.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { CouchesActives } from './dessine-ciel.ts'
import { encadre, MS_PAR_MINUTE } from '../core/unites.ts'
import {
  gardeSceneAuDepart,
  litScenePersistee,
  type ScenePersistee,
} from '../data/scene-persistee.ts'
import { creeAbonnes } from './abonnes.ts'
import { DOMAINES } from '../registry/domains.ts'

/**
 * Reference render resolution, §3.2 viewport. Starting point only: scène renders at box size
 * (`resolutionRendu`). Still the pixel budget render never exceeds + definition at first render,
 * before box measured.
 */
export const LARGEUR_SCENE_PX = 1920
export const HAUTEUR_SCENE_PX = 1080

/**
 * Canvas definition for a `largeurCss × hauteurCss` box.
 * Fixed definition forced 16/9 in non-16/9 box: `object-fit: contain` → black bars. Following
 * box fills it, no stretch/crop. Scale capped by reference pixel budget, not screen density:
 * Retina `devicePixelRatio` would double pixels per frame and the sky's frame counter.
 * ponytail: constant budget, not adaptive; if fast machines deserve more, frame counter decides.
 */
export function resolutionRendu(
  largeurCss: number,
  hauteurCss: number,
  densite: number,
): { readonly largeurPx: number; readonly hauteurPx: number } {
  const surface = Math.max(1, largeurCss * hauteurCss)
  const echelle = Math.min(densite, Math.sqrt((LARGEUR_SCENE_PX * HAUTEUR_SCENE_PX) / surface))
  return {
    largeurPx: Math.max(1, Math.round(largeurCss * echelle)),
    hauteurPx: Math.max(1, Math.round(hauteurCss * echelle)),
  }
}

/**
 * Pointage: what scène looks at, how it projects, over how many pixels.
 * §3.2 `Vue` minus roulis (belongs to boîtier, not vue).
 * T-0084 — rotation named ≠ `Vue.rotationDeg` ON PURPOSE: same name → store passed as-is to
 * `projecteur()` → planétarium vue rolled by cadre angle, cadre never looked rotated (only sky
 * turned behind it). §3.3: mode only affects radial R(θ); planétarium keeps zénith up, boîtier
 * rotates.
 */
export interface VueScene {
  readonly azimutDeg: number
  readonly hauteurDeg: number
  /** §3.5 `angle_rotation_cadre` — boîtier orientation, never vue roulis. */
  readonly rotationCadreDeg: number
  readonly fovDeg: number
  readonly mode: ModeProjection
  /** Render definition, measured on canvas box. */
  readonly largeurPx: number
  readonly hauteurPx: number
  /** T-0258 — offset between visée and canvas middle, in render pixels. */
  readonly decalageCentreXPx: number
}

/**
 * T-0258 — surfaces ALWAYS bordering the sky: vue rail left, séance panel right. Only these
 * move visée centre. Matériel cards + plan de nuit excluded: they fold; visée moving on fold is
 * worse than one offset once (cadre would jump when focale card opens).
 */
export const BORDURES_SCENE = Object.freeze(['.coque-rail', '.coque-lateral'] as const)

/** Box measured on screen, CSS px. A `DOMRect` is one. */
export interface BoiteEcran {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

/**
 * T-0258 — offset, render px, canvas middle → middle of free sky.
 * Canvas covers whole coque; 2 ALWAYS-open surfaces overlay it (vue rail left, séance panel
 * right). Aiming at canvas middle put visée under panel: can't judge cadre or read cible.
 * Permanent surfaces only; folding cards (Boîtier, Optique, Plan de nuit) would move visée per
 * gesture. Boxes MEASURED, never deduced from stylesheet widths: under repli the surfaces enter
 * the flow above/below scène, cover nothing, offset → 0 with no media query repeated here.
 */
export function decalageCentreScene(
  scene: BoiteEcran,
  obstacles: readonly BoiteEcran[],
  largeurPx: number,
): number {
  const largeurCss = scene.right - scene.left
  if (largeurCss <= 0) return 0
  let gauche = 0
  let droite = 0
  for (const obstacle of obstacles) {
    if (obstacle.bottom <= scene.top || obstacle.top >= scene.bottom) continue
    // Edge the surface bites: its middle decides. Rail/panel sit a gap off the edge, neither
    // touches it — flush test would miss them.
    if (obstacle.left + obstacle.right < scene.left + scene.right)
      gauche = Math.max(gauche, obstacle.right - scene.left)
    else droite = Math.max(droite, scene.right - obstacle.left)
  }
  gauche = encadre(gauche, 0, largeurCss)
  droite = encadre(droite, 0, largeurCss)
  // Two surfaces meeting leave no sky: canvas middle beats a centre set by overlap chance.
  if (gauche + droite >= largeurCss) return 0
  return (((gauche - droite) / 2) * largeurPx) / largeurCss
}

/**
 * §3.3 `Vue` for scène: no roulis. Cadre matériel rotates as scène object (§3.5); vue keeps
 * zénith up, else rotating boîtier turns whole sky, cadre outline stays still.
 */
export function vuePlanetarium(vue: VueScene): Vue {
  return {
    mode: vue.mode,
    fovDeg: vue.fovDeg,
    largeurPx: vue.largeurPx,
    hauteurPx: vue.hauteurPx,
    azimutDeg: vue.azimutDeg,
    hauteurDeg: vue.hauteurDeg,
    rotationDeg: 0,
    decalageCentreXPx: vue.decalageCentreXPx,
  }
}

/** Time: §3.2 temporal cursor mode, speed, anchor. */
export interface TempsScene {
  readonly modeTemps: ModeTemps
  /** Requested scroll factor, before cap by readability. */
  readonly facteur: number
  /**
   * CONSTANT offset displayed instant ↔ system clock, ms. `MAINTENANT` = "time flows", not
   * "today": resuming after picking 21 août restarts from 21 août, no jump to tonight. Null at
   * start (app opens on now); recomputed per resume; per-frame resync still forbids drift.
   */
  readonly decalageMs: number
}

/**
 * What scène draws. Switches live here, not in planétarium: driven from Explorer tab (far
 * across screen) since lot 6.
 */
export interface RenduScene {
  readonly couches: CouchesActives
  /** §3.3 — depth capped by fond de ciel rather than zoom. */
  readonly vueRealiste: boolean
  /**
   * §8.4 / T-0324 — pointage trajet scène shows, `null` normally.
   * Not a layer (boolean the rail drives): carries data one panel produces. Its presence strips
   * scène of all that doesn't help follow the trajet — `dessineCiel` applies the rule, not store.
   */
  readonly parcours: ParcoursScene | null
}

/** §8.4 — trajet to bring a cible into the cadre, as scène paints it. */
export interface ParcoursScene {
  /** Trajet cible: names the parcours in UI. */
  readonly designation: string
  /** From naked-eye-visible start to cible; single point in CARTE_DIRECTE mode. */
  readonly etapes: readonly EtapeParcours[]
  readonly adCibleH: number
  readonly decCibleDeg: number
}

/** §3.4 — object clicked in scène, described in plain words. */
export interface SelectionScene {
  readonly titre: string
  readonly lignes: readonly string[]
  /** Set for ciel profond objects only: only they open a fiche. */
  readonly objet: ObjetCielProfond | null
}

/**
 * T-0038 — what scène says about what it just rendered. Was planétarium local state; now read
 * in top-bar info menu (far in tree) → module store like pointage, readable in SSR + browser.
 * T-0248 — render diagnostic (fps, stars examined) removed: unread since T-0153, its publish
 * every 500 ms woke every subscriber, frozen time included.
 */
export interface LecturesScene {
  readonly selection: SelectionScene | null
}

/**
 * Cible the visée follows since "Cadrer". Equatorial coords stay fixed as sky turns; azimut/
 * hauteur recomputed per frame.
 */
export interface SuiviScene {
  readonly designation: string
  readonly adDeg: number
  readonly decDeg: number
}

export interface EtatScene {
  readonly vue: VueScene
  /** `null` once user moves the visée: hand not taken back. */
  readonly suivi: SuiviScene | null
  readonly temps: TempsScene
  readonly rendu: RenduScene
  readonly lectures: LecturesScene
  /**
   * Display clock, ms: instant the loop actually rendered. Published 2×/s, not per frame: panels
   * date readings without 60 redraws/s.
   */
  readonly msAffiche: number
}

/**
 * T-0360 — instant clamped into `DOMAINES.annee_affichee`, bounds included. Every displayed-
 * instant write goes through it: year counter, transport, reread scène. UTC rules, else bound
 * moves with workstation timezone.
 */
export function borneInstant(ms: number): number {
  const { min, max } = DOMAINES.annee_affichee
  return encadre(ms, Date.UTC(min, 0, 1), Date.UTC(max + 1, 0, 1) - 1)
}

/**
 * Displayed instant, ms. Rewritten per frame by render loop; outside reactive state → no
 * 60 React renders/s (§3).
 */
export const instant = { ms: Date.now() }

const ETAT_INITIAL: EtatScene = {
  vue: {
    azimutDeg: 180,
    hauteurDeg: K('SEUIL_HAUTEUR_IMAGERIE_DEG'),
    rotationCadreDeg: 0,
    fovDeg: K('FOV_INITIAL_DEG'),
    mode: 'MODE_PLANETARIUM',
    largeurPx: LARGEUR_SCENE_PX,
    hauteurPx: HAUTEUR_SCENE_PX,
    // Nothing measured yet: visée starts at middle, stays while nothing covers it; also SSR's
    // result (no boxes to measure).
    decalageCentreXPx: 0,
  },
  suivi: null,
  temps: { modeTemps: 'MAINTENANT', facteur: K('FACTEUR_DEFILEMENT_NORMAL'), decalageMs: 0 },
  rendu: {
    couches: {
      figures: true,
      frontieres: false,
      asterismes: false,
      cadre: true,
      horizon: true,
      voieLactee: true,
      // §4.1 — scène shows observable sky first: sol masks what is below.
      sol: true,
    },
    // T-0355 — scène opens on the sky as seen from the site.
    vueRealiste: true,
    parcours: null,
  },
  lectures: { selection: null },
  msAffiche: instant.ms,
}

/**
 * T-0355 — start state adjusted by what storage kept. Instant per mode: frozen/scrolling →
 * restart from instant left; `MAINTENANT` → from clock with same offset, else reload replays
 * elapsed minutes. Vue goes through `majVue` at first write, which reclamps over-cap field;
 * clamped here too for first render.
 */
function restaure(depart: EtatScene, lu: ScenePersistee): EtatScene {
  const temps = { ...depart.temps, ...lu.temps }
  const vue = { ...depart.vue, ...lu.vue }
  const ms = borneInstant(
    temps.modeTemps === 'MAINTENANT' ? Date.now() + temps.decalageMs : (lu.ms ?? Date.now()),
  )
  instant.ms = ms
  // Layer by layer, not a retyped `fromEntries`: a new `CouchesActives` layer fails to compile
  // until reread here.
  const lue = (c: keyof CouchesActives): boolean => lu.rendu?.couches?.[c] ?? depart.rendu.couches[c]
  const couches: CouchesActives = {
    figures: lue('figures'),
    frontieres: lue('frontieres'),
    asterismes: lue('asterismes'),
    cadre: lue('cadre'),
    horizon: lue('horizon'),
    voieLactee: lue('voieLactee'),
    sol: lue('sol'),
  }
  return {
    ...depart,
    vue: { ...vue, fovDeg: Math.min(vue.fovDeg, fovMaxSelonMode(vue.mode)) },
    temps,
    rendu: {
      ...depart.rendu,
      couches,
      vueRealiste: lu.rendu?.vueRealiste ?? depart.rendu.vueRealiste,
    },
    msAffiche: ms,
  }
}

let etat: EtatScene = restaure(ETAT_INITIAL, litScenePersistee())
const { abonne, notifie } = creeAbonnes()

/** Current snapshot. Identity changes only on write (`useSyncExternalStore` relies on it). */
export function etatScene(): EtatScene {
  return etat
}

type Retouche<T> = Partial<T> | ((precedent: T) => Partial<T>)

/**
 * T-0292 — no-op patch returns PREVIOUS slice, same identity. Else each counter notch rewrote
 * `modeTemps: 'FIGE'` on frozen time → every subscriber redrew for nothing.
 */
function applique<T extends object>(precedent: T, retouche: Retouche<T>): T {
  const partiel = typeof retouche === 'function' ? retouche(precedent) : retouche
  const change = (Object.keys(partiel) as (keyof T)[]).some((cle) => !Object.is(partiel[cle], precedent[cle]))
  return change ? { ...precedent, ...partiel } : precedent
}

function pose(suivant: EtatScene): void {
  etat = suivant
  notifie()
}

/**
 * T-0095 — champ clamped under its projection's cap on write, not at render. Only mandatory
 * path: wheel, pinch, keys, panel cursor, projection change all write here. Bounding elsewhere
 * misses the motivating case: 180° stereographic → gnomonique switch bounds champ, never mode.
 */
export function majVue(retouche: Retouche<VueScene>): void {
  ecritVue(retouche, false)
}

/**
 * Only moving the visée breaks suivi: zoom/boîtier rotation keeps cible centred, which is what
 * one does once cible cadrée.
 */
function ecritVue(retouche: Retouche<VueScene>, garderSuivi: boolean): void {
  const vue = applique(etat.vue, retouche)
  const fovMaxDeg = fovMaxSelonMode(vue.mode)
  if (vue === etat.vue && vue.fovDeg <= fovMaxDeg) return
  const deplacee = vue.azimutDeg !== etat.vue.azimutDeg || vue.hauteurDeg !== etat.vue.hauteurDeg
  pose({
    ...etat,
    vue: vue.fovDeg <= fovMaxDeg ? vue : { ...vue, fovDeg: fovMaxDeg },
    suivi: garderSuivi || !deplacee ? etat.suivi : null,
  })
}

/** "Cadrer": visée goes to cible and follows it until next pointage gesture. */
export function suisCible(suivi: SuiviScene, retouche: Partial<VueScene>): void {
  pose({ ...etat, suivi })
  ecritVue(retouche, true)
}

/** Render loop recentres visée on followed cible when time made it drift. */
export function recaleSuivi(azimutDeg: number, hauteurDeg: number): void {
  if (etat.suivi !== null) ecritVue({ azimutDeg, hauteurDeg }, true)
}

export function majTemps(retouche: Retouche<TempsScene>): void {
  const temps = applique(etat.temps, retouche)
  if (temps !== etat.temps) pose({ ...etat, temps })
}

export function majRendu(retouche: Retouche<RenduScene>): void {
  const rendu = applique(etat.rendu, retouche)
  if (rendu !== etat.rendu) pose({ ...etat, rendu })
}

export function majLectures(retouche: Retouche<LecturesScene>): void {
  const lectures = applique(etat.lectures, retouche)
  if (lectures !== etat.lectures) pose({ ...etat, lectures })
}

/**
 * Publishes rendered instant. Equality tested before notifying: frozen time, loop republishes
 * same instant 2×/s, nothing must redraw.
 */
export function afficheInstant(ms: number): void {
  if (ms === etat.msAffiche) return
  pose({ ...etat, msAffiche: ms })
}

/**
 * §3.2 — go to an instant: display clock jumps, time pauses. Without pause `MAINTENANT` resyncs
 * to system clock next frame; chosen instant lived 40 ms.
 */
export function vaA(ms: number): void {
  // T-0210 — year counter has no upper bound; date outside representable instants makes
  // `astronomy-engine` throw from render loop. Unreachable destination isn't a trip: stay.
  if (!Number.isFinite(ms)) return
  const borne = borneInstant(ms)
  instant.ms = borne
  majTemps({ modeTemps: 'FIGE' })
  // Display clock jumps with instant, not next frame: only canvas loop republished `msAffiche`
  // → loop-less screen (SSR, test) dated readings at start, not destination.
  afficheInstant(borne)
}

/**
 * §8.4 / T-0324 — show a pointage parcours + go to the time it will be followed. Gestures tied:
 * 2nd conditions 1st. Trajet = fixed stars but sky turns; visée computed for 22 h 47 misses
 * trajet by clock distance. Pointage time = time of all pointage aid (table, schéma, §8.4 angle
 * parallactique): diverging shows another moment's sky under mismatched figures.
 * Prior time state kept here, `masqueParcours` restores it. `vaA` FREEZES time (wanted while
 * reading trajet), but a clock stopped with unknown when/why is a bug, not a mode.
 */
let avantParcours: { readonly temps: TempsScene; readonly ms: number } | null = null

export function montreParcours(parcours: ParcoursScene, ms: number): void {
  if (etat.rendu.parcours === null) avantParcours = { temps: etat.temps, ms: instant.ms }
  majRendu({ parcours })
  vaA(ms)
}

/**
 * Closes parcours, gives clock back instant AND mode from before. Not `reprend`: it restarts
 * from DISPLAYED instant (still pointage's) and knows only `MAINTENANT` — running scroll lost.
 * Offset restored as-is (constant offset to system clock) → playback resumes where it would be.
 */
export function masqueParcours(): void {
  if (etat.rendu.parcours === null) return
  const avant = avantParcours
  avantParcours = null
  majRendu({ parcours: null })
  if (avant === null) return
  vaA(avant.ms)
  majTemps(avant.temps)
}

/**
 * §3.2 — give time back to flow, FROM displayed instant. Offset frozen here, not read per
 * frame: resume = gesture, system clock = cadence, not destination.
 */
export function reprend(): void {
  majTemps({ modeTemps: 'MAINTENANT', decalageMs: instant.ms - Date.now() })
}

/**
 * T-0355 — what persists between visits. Open parcours doesn't: persists the instant and mode
 * from BEFORE it (what `masqueParcours` restores).
 */
export function scenePersistee(courant: EtatScene, ms: number): ScenePersistee {
  const { azimutDeg, hauteurDeg, rotationCadreDeg, fovDeg, mode } = courant.vue
  const avant = courant.rendu.parcours === null ? null : avantParcours
  return {
    vue: { azimutDeg, hauteurDeg, rotationCadreDeg, fovDeg, mode },
    temps: avant?.temps ?? courant.temps,
    ms: avant?.ms ?? ms,
    rendu: {
      couches: { ...courant.rendu.couches } as Readonly<Record<string, boolean>>,
      vueRealiste: courant.rendu.vueRealiste },
  }
}

gardeSceneAuDepart(() => scenePersistee(etat, instant.ms))

/** Resets scène to start state. Tests only: app doesn't need it. */
export function reinitialiseScene(): void {
  instant.ms = Date.now()
  pose({ ...ETAT_INITIAL, msAffiche: instant.ms })
}

/**
 * T-0056 — subscribe to a store slice, not the whole. `useScene` wakes its component per write
 * (2×/s: loop republishes displayed instant + diagnostic). Component reading only a derived
 * value (epoch year, displayed minute) needs no redraw between identical publications.
 * Selector: module-level (stable identity), `Object.is`-comparable return (what
 * `useSyncExternalStore` compares to skip a render).
 */

/**
 * Displayed minute. Panels dating a reading subscribe to it, not the instant: within a minute
 * neither visibles list nor Lune position visibly changes. Module-level: `useTrancheScene`
 * requires stable selector.
 */
export function minuteAffichee(etat: EtatScene): number {
  return Math.floor(etat.msAffiche / MS_PAR_MINUTE)
}

export function useTrancheScene<T>(selecteur: (etat: EtatScene) => T): T {
  const lit = useCallback(() => selecteur(etatScene()), [selecteur])
  return useSyncExternalStore(abonne, lit, lit)
}

/** Pointage, time and render slices: identity changes only on their write. */
export function vueRealisteScene(etat: EtatScene): boolean {
  return etat.rendu.vueRealiste
}

export function vueScene(etat: EtatScene): VueScene {
  return etat.vue
}

export function tempsScene(etat: EtatScene): TempsScene {
  return etat.temps
}

export function renduScene(etat: EtatScene): RenduScene {
  return etat.rendu
}

/**
 * T-0324 — the only trajet shown. Separate slice: pointage aid recomputes a full path per
 * render; subscribing to whole render would restart it on every rail switch.
 */
export function parcoursScene(etat: EtatScene): ParcoursScene | null {
  return etat.rendu.parcours
}

export function suiviScene(etat: EtatScene): SuiviScene | null {
  return etat.suivi
}

/** Store commands, as scène and its gestures receive them. */
export interface ActionsScene {
  readonly majVue: typeof majVue
  readonly majTemps: typeof majTemps
  readonly majRendu: typeof majRendu
  readonly majLectures: typeof majLectures
  readonly vaA: typeof vaA
  readonly reprend: typeof reprend
}

/** Module functions: one object suffices, identity relaunches no effect. */
export const ACTIONS_SCENE: ActionsScene = Object.freeze({
  majVue,
  majTemps,
  majRendu,
  majLectures,
  vaA,
  reprend,
})

export function useScene(): {
  readonly vue: VueScene
  readonly temps: TempsScene
  readonly rendu: RenduScene
  readonly lectures: LecturesScene
  readonly msAffiche: number
  readonly instant: { ms: number }
  readonly actions: ActionsScene
} {
  const courant = useSyncExternalStore(abonne, etatScene, etatScene)
  return {
    vue: courant.vue,
    temps: courant.temps,
    rendu: courant.rendu,
    lectures: courant.lectures,
    msAffiche: courant.msAffiche,
    instant,
    actions: ACTIONS_SCENE,
  }
}
