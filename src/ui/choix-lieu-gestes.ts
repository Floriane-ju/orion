/**
 * §4.1 — les gestes de la carte du site : glisser pour se déplacer, molette et pincement pour
 * zoomer, un appui sans glisser pour poser le site — et les touches, qui rejouent les mêmes
 * gestes (T-0363).
 *
 * La molette se lit comme sur la scène (`sourceMolette`) : un pincement au pavé zoome en
 * continu, un défilement à deux doigts déplace, une molette zoome d'un cran de carte.
 *
 * L'écouteur `wheel` est posé à la main : celui de React est passif, et `preventDefault()` y
 * resterait sans effet — la page défilerait sous la carte.
 * ponytail: ni mémoire de pavé ni `gesture*` de Safari, comme sur la scène ; à reprendre si la
 * molette d'un Mac s'y confond avec le défilement.
 */

import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import { C } from '../registry/lieu-carte.ts'
import { facteurZoom, sourceMolette } from './planetarium-gestes.ts'
import { deplaceVue, zoomeVue, type VueCarte } from './choix-lieu-calcul.ts'

type MajVue = (maj: (vue: VueCarte) => VueCarte) => void

/** Le pincement de la scène, continu, lu en niveaux de zoom : diviser le champ par f, c'est monter de log₂ f. */
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

    // Les appuis en cours : un doigt glisse, deux pincent.
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
        // Un second doigt fait un pincement, jamais une pose.
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

/** Ce qu'une touche fait de la vue, ou `'POSE'`, ou null si la touche n'est pas à la carte. */
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

/** Le gestionnaire `onKeyDown` de la carte. */
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
