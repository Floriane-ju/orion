/**
 * §4.1 — site map gestures: drag pans, wheel/pinch zooms, press without drag sets the site; keys
 * replay the same gestures (T-0363).
 * Wheel read as on scène (`sourceMolette`): trackpad pinch zooms continuously, two-finger scroll
 * pans, wheel zooms one map notch.
 * `wheel` listener added by hand: React's is passive, `preventDefault()` no-op → page scrolls
 * under map.
 * ponytail: no trackpad memory nor Safari `gesture*` (as scène); revisit if Mac wheel is confused
 * with scroll.
 */

import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import { C } from '../registry/lieu-carte.ts'
import { facteurZoom, sourceMolette } from './planetarium-gestes.ts'
import { deplaceVue, zoomeVue, type VueCarte } from './choix-lieu-calcul.ts'

type MajVue = (maj: (vue: VueCarte) => VueCarte) => void

/** Scène pinch, continuous, in zoom levels: field ÷ f = +log₂ f. */
function cransDePincement(deltaY: number): number {
  return -Math.log2(facteurZoom(deltaY, true))
}

interface Appui {
  readonly x: number
  readonly y: number
}

export function useGestesCarteLieu(
  toile: RefObject<HTMLCanvasElement | null>,
  majVue: MajVue,
  surPose: (px: number, py: number) => void,
): void {
  const pose = useRef(surPose)
  pose.current = surPose

  useEffect(() => {
    const element = toile.current
    if (element === null) return
    const boite = () => element.getBoundingClientRect()
    const local = (e: { clientX: number; clientY: number }): Appui => {
      const b = boite()
      return { x: e.clientX - b.left, y: e.clientY - b.top }
    }

    const surMolette = (e: WheelEvent) => {
      e.preventDefault()
      const { x, y } = local(e)
      const b = boite()
      const source = sourceMolette(e)
      if (source === 'DEFILEMENT') {
        majVue((v) => deplaceVue(v, -e.deltaX, -e.deltaY))
        return
      }
      const crans =
        source === 'PINCEMENT' ? cransDePincement(e.deltaY) : -Math.sign(e.deltaY) * C('CRAN_ZOOM_CARTE')
      majVue((v) => zoomeVue(v, crans, x, y, b.width, b.height))
    }

    // Active presses: one finger drags, two pinch.
    const appuis = new Map<number, Appui>()
    let depart: Appui | null = null
    let glisse = false

    const centreEtEcart = () => {
      const [a, b] = [...appuis.values()]
      if (a === undefined || b === undefined) return null
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ecart: Math.hypot(a.x - b.x, a.y - b.y) }
    }

    const surAppui = (e: PointerEvent) => {
      element.setPointerCapture(e.pointerId)
      appuis.set(e.pointerId, local(e))
      if (appuis.size === 1) {
        depart = local(e)
        glisse = false
      } else {
        // A second finger makes a pinch, never a set.
        glisse = true
      }
    }

    const surMouvement = (e: PointerEvent) => {
      const avant = appuis.get(e.pointerId)
      if (avant === undefined) return
      const pinceAvant = centreEtEcart()
      const ici = local(e)
      appuis.set(e.pointerId, ici)
      const pinceApres = centreEtEcart()
      if (pinceAvant !== null && pinceApres !== null && pinceAvant.ecart > 0) {
        const b = boite()
        const crans = Math.log2(pinceApres.ecart / pinceAvant.ecart)
        majVue((v) =>
          zoomeVue(
            deplaceVue(v, pinceApres.x - pinceAvant.x, pinceApres.y - pinceAvant.y),
            crans,
            pinceApres.x,
            pinceApres.y,
            b.width,
            b.height,
          ),
        )
        return
      }
      if (depart === null) return
      if (!glisse && Math.hypot(ici.x - depart.x, ici.y - depart.y) < C('SEUIL_GLISSER_PX')) return
      glisse = true
      majVue((v) => deplaceVue(v, ici.x - avant.x, ici.y - avant.y))
    }

    const surRelache = (e: PointerEvent) => {
      if (!appuis.delete(e.pointerId)) return
      if (appuis.size > 0) return
      if (!glisse && depart !== null) pose.current(depart.x, depart.y)
      depart = null
    }

    const surAnnule = (e: PointerEvent) => {
      appuis.delete(e.pointerId)
      depart = null
    }

    element.addEventListener('wheel', surMolette, { passive: false })
    element.addEventListener('pointerdown', surAppui)
    element.addEventListener('pointermove', surMouvement)
    element.addEventListener('pointerup', surRelache)
    element.addEventListener('pointercancel', surAnnule)
    return () => {
      element.removeEventListener('wheel', surMolette)
      element.removeEventListener('pointerdown', surAppui)
      element.removeEventListener('pointermove', surMouvement)
      element.removeEventListener('pointerup', surRelache)
      element.removeEventListener('pointercancel', surAnnule)
    }
  }, [toile, majVue])
}

/** What a key does to the view, or `'POSE'`, or null if the key isn't mapped. */
export function commandeCarteLieu(
  touche: string,
  vue: VueCarte,
  largeur: number,
  hauteur: number,
): VueCarte | 'POSE' | null {
  const pas = C('PAS_CLAVIER_FRACTION')
  switch (touche) {
    case 'ArrowLeft':
      return deplaceVue(vue, largeur * pas, 0)
    case 'ArrowRight':
      return deplaceVue(vue, -largeur * pas, 0)
    case 'ArrowUp':
      return deplaceVue(vue, 0, hauteur * pas)
    case 'ArrowDown':
      return deplaceVue(vue, 0, -hauteur * pas)
    case '+':
    case '=':
      return zoomeVue(vue, C('CRAN_ZOOM_CARTE'), largeur / 2, hauteur / 2, largeur, hauteur)
    case '-':
      return zoomeVue(vue, -C('CRAN_ZOOM_CARTE'), largeur / 2, hauteur / 2, largeur, hauteur)
    case 'Enter':
    case ' ':
      return 'POSE'
    default:
      return null
  }
}

/** Map `onKeyDown` handler. */
export function surToucheCarteLieu(
  e: KeyboardEvent<HTMLCanvasElement>,
  vue: VueCarte,
  majVue: MajVue,
  surPose: (px: number, py: number) => void,
): void {
  const { width, height } = e.currentTarget.getBoundingClientRect()
  const commande = commandeCarteLieu(e.key, vue, width, height)
  if (commande === null) return
  e.preventDefault()
  if (commande === 'POSE') surPose(width / 2, height / 2)
  else majVue(() => commande)
}
