/**
 * §3.6 — gestures the scène accepts: drag pans the aim, wheel + pinch set champ, two-finger
 * scroll pans too; since T-0069 keys replay the same gestures in the same bounds.
 * Zoom set by hand, outside React: `onWheel` attaches a passive listener where
 * `preventDefault()` has no effect → browser would zoom the whole page over the scène champ.
 * Safari adds its `gesture*`, zooming the page its own way.
 */

import { useEffect, useRef, type RefObject } from 'react'
import { K } from '../registry/constants.ts'
import { DEG } from '../core/mat3.ts'
import { bornesZoom, type BornesZoom } from '../core/projection.ts'
import { majLectures, majVue, type ActionsScene, type VueScene } from './scene-etat.ts'
import { decritCible } from './planetarium-selection.ts'
import { cibleSousLeCurseur, type CibleEcran, type SurvolEcran } from './dessine-ciel.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { encadre, ramene, TOUR_DEG } from '../core/unites.ts'

/** One zoom notch — wheel or key. Pinch is continuous: see `deltaY`. */
const FACTEUR_ZOOM_CRAN = K('FACTEUR_ZOOM_CRAN')
/** Trackpad pinch: `deltaY` in pixels → champ factor, via exponential. */
const SENSIBILITE_PINCEMENT = 0.01
/** `WheelEvent.DOM_DELTA_PIXEL`: pixel delta, trackpad and macOS wheels. */
const DOM_DELTA_PIXEL = 0
/** One wheel notch = ±120 in `wheelDeltaY`, inherited from Windows, kept everywhere. */
const CRAN_WHEEL_DELTA = 120
/**
 * Pixel floor of a wheel notch — measured 12–13 px on a free wheel. Trackpad starts softer,
 * 1-3 px on first events: below the floor an ambiguous `wheel` = trackpad burst start.
 */
const SEUIL_CRAN_PX = 10
/**
 * How long a recognised trackpad keeps control of ambiguous `wheel`s. Burst refreshes it
 * itself: delay only covers the gap between its events (15 ms measured), not gesture
 * duration. Short on purpose: picking the mouse back up zooms again.
 */
const MEMOIRE_PAVE_MS = 400
/** T-0069 — arrow-key step, fraction of displayed champ (§3.3, registre). */
const PAS_VISEE_FRACTION = K('PAS_VISEE_CLAVIER_FRACTION')
/** Pointage bounds, shared with the bottom-bar counters (T-0163). */
export const HAUTEUR_MIN_DEG = -90
export const HAUTEUR_MAX_DEG = 90

/**
 * Champ factor for a `wheel`. Wheel = notches: fixed factor. Trackpad pinch is continuous
 * (Chrome and Firefox translate it to `wheel` with `ctrlKey`), amplitude in `deltaY`:
 * exponential → continuous multiplicative factor, two half-gestures = the whole.
 */
export function facteurZoom(deltaY: number, pincement: boolean): number {
  if (pincement) return Math.exp(deltaY * SENSIBILITE_PINCEMENT)
  return deltaY > 0 ? FACTEUR_ZOOM_CRAN : 1 / FACTEUR_ZOOM_CRAN
}

/** Champ brought within §3.3 bounds — same for wheel and keys. */
export function fovBorne(fovDeg: number, bornes: BornesZoom): number {
  return encadre(fovDeg, bornes.fovMinDeg, bornes.fovMaxDeg)
}

/**
 * §6.4, T-0283 — champ where the matériel cadre is judged: a few cadres wide, within zoom
 * bounds. 8 wheel notches reached 93°, ~20 reached 30°: "Cadrer" jumps there at once.
 */
export function champPourCadrer(fovLDeg: number, bornes: BornesZoom): number {
  return fovBorne(fovLDeg * K('CHAMP_CADRER_FACTEUR'), bornes)
}

/** What a `wheel` must trigger on the scène. */
export type SourceGeste = 'PINCEMENT' | 'MOLETTE' | 'DEFILEMENT'

/** What a `wheel` carries, independent of the producing gesture. */
interface DeltasMolette {
  readonly ctrlKey: boolean
  readonly deltaMode: number
  readonly deltaX: number
  readonly deltaY: number
  readonly wheelDeltaY?: number
}

/**
 * Unambiguous trackpad mark: pinch (browser flags `ctrlKey`), sideways-drifting finger, or
 * fractional deltas. A wheel, even high-res, does none: integer, strictly vertical notches.
 */
export function signaturePave(e: DeltasMolette): boolean {
  if (e.ctrlKey) return true
  if (e.deltaMode !== DOM_DELTA_PIXEL) return false
  return e.deltaX !== 0 || !Number.isInteger(e.deltaY)
}

/**
 * A macOS `wheel` can come from three gestures that must not do the same: pinch zooms,
 * two-finger scroll pans the aim, wheel zooms. No browser says which → deduce from signals,
 * surest first.
 * One undecidable case: integer, strictly vertical delta (a high-res wheel produces as many as
 * a trackpad's inertia phase). Two hints: amplitude (a notch outweighs a burst start) and
 * `paveRecent`, true while the trackpad just signalled itself. Otherwise zoom, as for a mouse.
 */
export function sourceMolette(e: DeltasMolette, paveRecent = false): SourceGeste {
  // Trackpad pinch, only gesture the browser flags itself — via `ctrlKey`.
  if (e.ctrlKey) return 'PINCEMENT'
  // Line delta, not pixel: Firefox does it only for a real wheel.
  if (e.deltaMode !== DOM_DELTA_PIXEL) return 'MOLETTE'
  // Recognised trackpad, or event without vertical amplitude: nothing to zoom.
  if (signaturePave(e) || e.deltaY === 0) return 'DEFILEMENT'
  // WebKit and Blink: a wheel notch is a multiple of 120 in `wheelDeltaY`.
  if (e.wheelDeltaY !== undefined && e.wheelDeltaY % CRAN_WHEEL_DELTA === 0) return 'MOLETTE'
  if (Math.abs(e.deltaY) < SEUIL_CRAN_PX) return 'DEFILEMENT'
  return paveRecent ? 'DEFILEMENT' : 'MOLETTE'
}

/**
 * `wheelDeltaY`: deprecated, absent from DOM types, but the only reliable signal telling a
 * wheel notch from trackpad scroll in WebKit and Blink.
 */
interface EvenementMolette extends WheelEvent {
  readonly wheelDeltaY?: number
}

/**
 * Safari macOS non-standard events for trackpad pinch, in addition to or instead of `wheel`
 * with `ctrlKey`. Absent from DOM types: declared here.
 */
interface EvenementGeste extends Event {
  readonly scale: number
}

/** A full turn brought into 0–360°, §3.5's range as the azimuth's. */
const tourBorne = (deg: number): number => ramene(deg, TOUR_DEG)

function hauteurBornee(deg: number): number {
  return encadre(deg, HAUTEUR_MIN_DEG, HAUTEUR_MAX_DEG)
}

/** Canvas box, reduced to what rotation needs — testable without DOM. */
export interface BoiteCanevas {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

function angleAutourDuCentre(boite: BoiteCanevas, clientX: number, clientY: number): number {
  return (
    Math.atan2(
      clientY - (boite.top + boite.height / 2),
      clientX - (boite.left + boite.width / 2),
    ) / DEG
  )
}

/**
 * §3.5 — boîtier roll after a drag around the canvas centre, bounded 0–360°.
 * Pointer angle gap is SUBTRACTED from roll: screen y goes down where the view's goes up, so
 * growing roll turns the cadre counter-clockwise on screen; without this sign the cadre would
 * go against the gesture.
 * Continuous, uncapped: two half-gestures = the whole, a full turn returns the cadre.
 */
export function roulisApresGlisser(
  roulisDeg: number,
  boite: BoiteCanevas,
  depart: { readonly x: number; readonly y: number },
  arrivee: { readonly x: number; readonly y: number },
): number {
  const ecart =
    angleAutourDuCentre(boite, arrivee.x, arrivee.y) -
    angleAutourDuCentre(boite, depart.x, depart.y)
  return tourBorne(roulisDeg - ecart)
}

/** Mouse drag: pan the aim, Shift rotates the cadre; click without movement designates a target. */
export function usePointageSouris(entree: {
  readonly largeurPx: number
  readonly fovDeg: number
  readonly actions: ActionsScene
  readonly cibles: RefObject<readonly CibleEcran[]>
  /**
   * T-0085 — what the cursor designates, written outside React: render loop reads it per
   * frame. Reactive state would render React on every mouse move.
   */
  readonly survol: RefObject<SurvolEcran | null>
  readonly surSelectionObjet: (objet: ObjetCielProfond) => void
}) {
  const glisse = useRef<{ x: number; y: number } | null>(null)
  const { largeurPx, fovDeg, actions, cibles, survol, surSelectionObjet } = entree

  /** Pointer coordinates in the render definition, where targets live. */
  function pointCanevas(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect()
    const echelle = largeurPx / rect.width
    return { x: (e.clientX - rect.left) * echelle, y: (e.clientY - rect.top) * echelle }
  }

  return {
    onPointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
      glisse.current = { x: e.clientX, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
    },

    onPointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
      const depart = glisse.current
      if (depart === null) {
        // T-0085 — outside drag, cursor reveals the name the zoom threshold hid.
        // T-0109 — store ONLY the target: scène names and places it with the painted labels'
        // functions. Composing text here made a second vocabulary, out of tune with the drawing
        // (the original bug). Hover touches neither tab nor scène state.
        const point = pointCanevas(e)
        const cible = cibleSousLeCurseur(cibles.current, point.x, point.y)
        survol.current = cible === null ? null : { cible }
        return
      }
      survol.current = null
      const rect = e.currentTarget.getBoundingClientRect()

      // §3.5 — Shift held: gesture rotates the BOÎTIER, not the aim; continuous, 0–360°.
      // Pointage stays bare drag, the everyday gesture.
      if (e.shiftKey) {
        const arrivee = { x: e.clientX, y: e.clientY }
        actions.majVue((v) => ({
          rotationCadreDeg: roulisApresGlisser(v.rotationCadreDeg, rect, depart, arrivee),
        }))
        glisse.current = arrivee
        return
      }

      const echelle = largeurPx / rect.width
      const dx = (e.clientX - depart.x) * echelle
      const dy = (e.clientY - depart.y) * echelle
      const degresParPixel = fovDeg / largeurPx
      actions.majVue((v) => ({
        azimutDeg: tourBorne(v.azimutDeg - dx * degresParPixel),
        hauteurDeg: hauteurBornee(v.hauteurDeg + dy * degresParPixel),
      }))
      glisse.current = { x: e.clientX, y: e.clientY }
    },

    onPointerLeave(): void {
      survol.current = null
    },

    onPointerUp(e: React.PointerEvent<HTMLCanvasElement>): void {
      const depart = glisse.current
      glisse.current = null
      if (depart === null) return
      if (Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > 0) return
      const point = pointCanevas(e)
      // No radius: pointer keeps `cibleSousLeCurseur`'s pixel tolerance.
      choisitCible(cibles.current, point.x, point.y, surSelectionObjet)
    },
  }
}

/** Wheel, pinch and two-finger scroll, set outside React on the canvas. */
export function useGestesZoom(
  canevas: RefObject<HTMLCanvasElement | null>,
  gaiaCharge: boolean,
): void {
  useEffect(() => {
    const brut = canevas.current
    if (brut === null) return
    const cible: HTMLCanvasElement = brut
    // Bounds re-read per gesture, not captured: cap depends on current projection (T-0095),
    // which changes without unmounting the listener.
    const borne = (v: VueScene, fov: number): number => fovBorne(fov, bornesZoom(gaiaCharge, v.mode))

    // Last instant the trackpad signalled itself. Burst refreshes it: while it lasts, its
    // ambiguous events stay scrolling, inertia included. Expiring memory, not a permanent
    // flag, else picking the mouse back up would not zoom again.
    let dernierPaveMs = Number.NEGATIVE_INFINITY

    function surMolette(e: WheelEvent): void {
      e.preventDefault()
      const molette = e as EvenementMolette
      if (signaturePave(molette)) dernierPaveMs = e.timeStamp
      const source = sourceMolette(molette, e.timeStamp - dernierPaveMs < MEMOIRE_PAVE_MS)
      if (source !== 'MOLETTE') dernierPaveMs = e.timeStamp
      if (source === 'DEFILEMENT') {
        // Two fingers on the trackpad pan the sky as a drag: sky follows the fingers → delta
        // signs invert. Champ read from state, not captured.
        const largeurCss = cible.getBoundingClientRect().width
        majVue((v) => {
          const degresParPixel = v.fovDeg / largeurCss
          return {
            azimutDeg: tourBorne(v.azimutDeg + e.deltaX * degresParPixel),
            hauteurDeg: hauteurBornee(v.hauteurDeg - e.deltaY * degresParPixel),
          }
        })
        return
      }
      majVue((v) => ({ fovDeg: borne(v, v.fovDeg * facteurZoom(e.deltaY, source === 'PINCEMENT')) }))
    }

    // Safari: `scale` accumulates from gesture start, keep only the variation.
    let echelleGeste = 1
    function surGesteDebut(e: Event): void {
      e.preventDefault()
      echelleGeste = 1
    }
    function surGesteChange(e: Event): void {
      e.preventDefault()
      const echelle = (e as EvenementGeste).scale
      if (!Number.isFinite(echelle) || echelle <= 0) return
      const facteur = echelleGeste / echelle
      echelleGeste = echelle
      majVue((v) => ({ fovDeg: borne(v, v.fovDeg * facteur) }))
    }
    function surGesteFin(e: Event): void {
      e.preventDefault()
    }

    cible.addEventListener('wheel', surMolette, { passive: false })
    cible.addEventListener('gesturestart', surGesteDebut)
    cible.addEventListener('gesturechange', surGesteChange)
    cible.addEventListener('gestureend', surGesteFin)
    return () => {
      cible.removeEventListener('wheel', surMolette)
      cible.removeEventListener('gesturestart', surGesteDebut)
      cible.removeEventListener('gesturechange', surGesteChange)
      cible.removeEventListener('gestureend', surGesteFin)
    }
  }, [canevas, gaiaCharge])
}


/**
 * §3.4 — what choosing a target does, whatever triggered it.
 * T-0069 — click and Enter go through here: "the choice is the same in both cases".
 * Only designation tolerance differs: a pointer aims at the pixel, a key does not.
 */
export function choisitCible(
  cibles: readonly CibleEcran[],
  xPx: number,
  yPx: number,
  surSelectionObjet: (objet: ObjetCielProfond) => void,
  rayonPx?: number,
): void {
  const cible = cibleSousLeCurseur(cibles, xPx, yPx, rayonPx)
  const decrite = cible === null ? null : decritCible(cible)
  majLectures({ selection: decrite })
  // §3.4 — a ciel profond object opens its fiche: gesture does not stop at a name.
  if (decrite?.objet != null) surSelectionObjet(decrite.objet)
}

/** Gesture a key carries. Nothing else intercepted: Tab and Escape must pass. */
export type CommandeClavier =
  | 'VISEE_GAUCHE'
  | 'VISEE_DROITE'
  | 'VISEE_HAUT'
  | 'VISEE_BAS'
  | 'ZOOM_AVANT'
  | 'ZOOM_ARRIERE'
  | 'CHOISIR'

export function commandeClavier(touche: string): CommandeClavier | null {
  switch (touche) {
    case 'ArrowLeft':
      return 'VISEE_GAUCHE'
    case 'ArrowRight':
      return 'VISEE_DROITE'
    case 'ArrowUp':
      return 'VISEE_HAUT'
    case 'ArrowDown':
      return 'VISEE_BAS'
    // `=` and `_` are the unshifted keys of `+` and `-`: requiring Shift would make zoom a
    // two-handed gesture on French and English keyboards alike.
    case '+':
    case '=':
      return 'ZOOM_AVANT'
    case '-':
    case '_':
      return 'ZOOM_ARRIERE'
    case 'Enter':
    case ' ':
      return 'CHOISIR'
    default:
      return null
  }
}

/**
 * §3.3 / §3.5 — view after a key, within drag and wheel bounds.
 * Aim step = FRACTION OF CHAMP, not degrees: at 5° champ a fixed multi-degree step would jump
 * the aim across the image. Same rule as drag (`fov / largeur` per pixel).
 * Pure function: what gets tested, handler only wires it.
 */
export function viseeApresCommande(
  vue: VueScene,
  commande: Exclude<CommandeClavier, 'CHOISIR'>,
  bornes: BornesZoom,
): Partial<VueScene> {
  const pasDeg = vue.fovDeg * PAS_VISEE_FRACTION
  switch (commande) {
    case 'VISEE_GAUCHE':
      return { azimutDeg: tourBorne(vue.azimutDeg - pasDeg) }
    case 'VISEE_DROITE':
      return { azimutDeg: tourBorne(vue.azimutDeg + pasDeg) }
    case 'VISEE_HAUT':
      return { hauteurDeg: hauteurBornee(vue.hauteurDeg + pasDeg) }
    case 'VISEE_BAS':
      return { hauteurDeg: hauteurBornee(vue.hauteurDeg - pasDeg) }
    // Key notch = wheel notch: `facteurZoom` sole factor source, `fovBorne` sole bounds (T-0030).
    case 'ZOOM_AVANT':
      return { fovDeg: fovBorne(vue.fovDeg * facteurZoom(-1, false), bornes) }
    case 'ZOOM_ARRIERE':
      return { fovDeg: fovBorne(vue.fovDeg * facteurZoom(1, false), bornes) }
  }
}

/**
 * T-0069 — shortcuts stated once, for the two places announcing them: canvas description and
 * Explorer panel. Figures from the registry, else the sentence promises an unapplied step.
 */
export const RACCOURCIS_CLAVIER =
  '← ↑ ↓ → déplacer la vue · + − zoomer · Entrée choisir l’objet au centre · N mode nuit'

/**
 * T-0069 — WCAG 2.1.1: keyboard driving of the scène, within pointer bounds.
 * Each press writes only azimuth, height or champ: render loop re-reads the view per frame,
 * its frame cap bounds work whatever the key rate (T-0117). Nothing to defer or reschedule.
 */
export function usePilotageClavier(entree: {
  readonly largeurPx: number
  readonly hauteurPx: number
  /** T-0258 — "object at centre" = the one seen at centre, not the canvas middle one. */
  readonly decalageCentreXPx: number
  readonly gaiaCharge: boolean
  readonly cibles: RefObject<readonly CibleEcran[]>
  readonly surSelectionObjet: (objet: ObjetCielProfond) => void
}): { readonly onKeyDown: (e: React.KeyboardEvent<HTMLCanvasElement>) => void } {
  const { largeurPx, hauteurPx, decalageCentreXPx, gaiaCharge, cibles, surSelectionObjet } = entree

  return {
    onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>): void {
      const commande = commandeClavier(e.key)
      if (commande === null) return
      // Arrows would scroll the page, Space jump a screen: gesture belongs to a focused scène.
      e.preventDefault()
      if (commande === 'CHOISIR') {
        choisitCible(
          cibles.current,
          largeurPx / 2 + decalageCentreXPx,
          hauteurPx / 2,
          surSelectionObjet,
          largeurPx * PAS_VISEE_FRACTION,
        )
        return
      }
      majVue((v) => viseeApresCommande(v, commande, bornesZoom(gaiaCharge, v.mode)))
    },
  }
}
