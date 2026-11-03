/**
 * T-0162 — number set by dragging it, eyes stay on what it commands.
 * `<input type=number>`/`range` need room barre basse lacks and pull value out of its sentence:
 * here value STAYS the displayed text, grabbed. Role `spinbutton` (numeric, no bounded course):
 * arrow keys → mouseless setting (§11.2).
 * Pointer captured at `pointerdown`: gesture continues outside word, nothing on `window`.
 * Knows neither value nature nor format: takes `texte` (written), returns `valeur` (set).
 *
 * NO STOP AT SCREEN EDGE: mouse crossing first cran locks pointer (Pointer Lock); move accumulates
 * in `movementX`, ghost cursor re-enters opposite edge (Blender-like; page can't warp real mouse).
 * Lock at first cran, not press: click stays click, no browser banner. Lock refused: capture
 * suffices, gesture stops at edge.
 *
 * Dotted underline + `prefixe` saying what it sets. Click without drag, or Enter → saisie:
 * `<input>` replaces it; Enter/blur applies, Échap abandons. Input exists only while typing.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Icone } from './Icone.tsx'
import { cransGlisse } from './compteur-glisse.ts'
import { nombreDeTexte } from '../registry/domains.ts'
import { encadre, ramene } from '../core/unites.ts'

export interface CompteurProps {
  /** Accessible name: shows a value, never what it denotes. */
  readonly libelle: string
  readonly valeur: number
  /** Value as written — month spelled out, rounded angle. */
  readonly texte: string
  /** What a cran adds. Reads pas, not model's: it's the gesture. */
  readonly pas: number
  readonly min?: number
  readonly max?: number
  /** What field sets: abbreviation before value. */
  readonly prefixe?: string
  /** Value width in chars: longest possible value, so field/neighbours never resize. */
  readonly largeur?: number
  readonly classe?: string
  readonly sur: (valeur: number, enGlisse?: boolean) => void
  /** Called at start of any setting (gesture absolute: caller freezes its reference). */
  readonly surDebut?: () => void
  /**
   * T-0292 — moved-drag release. `sur` gets `enGlisse` meanwhile: defer costly work, settle here.
   */
  readonly surFin?: () => void
}

interface Depart {
  readonly xPx: number
  readonly valeur: number
  /** Moved gesture ≠ click. */
  bouge: boolean
  /** Last value sent: same-cran move sends nothing (T-0292). */
  envoyee: number
  /** Pointer position w/o screen edge: `clientX` frozen under lock. */
  xPxCumule: number
  yPxCumule: number
}

interface Point {
  readonly x: number
  readonly y: number
}

/** Lock refused/absent (touch): capture keeps gesture, stops at edge. */
function verrouille(cible: HTMLElement): void {
  Promise.resolve(cible.requestPointerLock()).catch(() => undefined)
}

function deverrouille(cible: Element): void {
  if (document.pointerLockElement === cible) document.exitPointerLock()
}

/** Number saisie proposes: from texte, else raw valeur. */
export function nombreDuTexte(texte: string, valeur: number): string {
  return /-?\d+(?:[.,]\d+)?/.exec(texte)?.[0] ?? String(valeur)
}

/** Typed text value: French comma = point, else null. */
export function lisSaisie(tape: string): number | null {
  const nombre = nombreDeTexte(tape)
  return Number.isFinite(nombre) ? nombre : null
}

export function Compteur(props: CompteurProps) {
  const depart = useRef<Depart | null>(null)
  /** Text being typed; `null` outside saisie. */
  const [saisie, setSaisie] = useState<string | null>(null)
  /** True from press to release (click or drag). */
  const [appuye, setAppuye] = useState(false)
  const initiale = useRef('')
  /**
   * Cursor replacing locked mouse. Only presence = React state; position → DOM (else each locked
   * `pointermove` renders, T-0292).
   */
  const [fantome, setFantome] = useState(false)
  const placeFantome = useRef<Point>({ x: 0, y: 0 })
  const elFantome = useRef<HTMLSpanElement>(null)
  // Listener set once: reads latest `surFin`.
  const surFin = useRef(props.surFin)
  surFin.current = props.surFin

  // Échap releases mouse mid-gesture: drag stops where it is.
  useEffect(() => {
    function surVerrou(): void {
      const d = depart.current
      if (document.pointerLockElement !== null || d === null) return
      depart.current = null
      if (d.bouge) surFin.current?.()
      setAppuye(false)
      setFantome(false)
    }
    document.addEventListener('pointerlockchange', surVerrou)
    return () => document.removeEventListener('pointerlockchange', surVerrou)
  }, [])

  function borne(valeur: number): number {
    return encadre(valeur, props.min ?? -Infinity, props.max ?? Infinity)
  }

  function regle(valeur: number): void {
    props.surDebut?.()
    props.sur(borne(valeur))
  }

  function ouvreSaisie(): void {
    initiale.current = nombreDuTexte(props.texte, props.valeur)
    setSaisie(initiale.current)
  }

  /** Unchanged saisie sets nothing (else freezes time for nothing). */
  function fermeSaisie(applique: boolean): void {
    const tape = saisie
    setSaisie(null)
    if (!applique || tape === null || tape === initiale.current) return
    const nombre = lisSaisie(tape)
    if (nombre !== null) regle(nombre)
  }

  function surPointerDown(e: PointerEvent<HTMLSpanElement>): void {
    // Secondary button = context menu: capture would deny right-click.
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    depart.current = {
      xPx: e.clientX,
      valeur: props.valeur,
      bouge: false,
      envoyee: props.valeur,
      xPxCumule: e.clientX,
      yPxCumule: e.clientY,
    }
    setAppuye(true)
    props.surDebut?.()
  }

  function surPointerMove(e: PointerEvent<HTMLSpanElement>): void {
    const d = depart.current
    if (d === null) return
    if (document.pointerLockElement === e.currentTarget) {
      d.xPxCumule += e.movementX
      d.yPxCumule += e.movementY
      placeFantome.current = {
        x: ramene(d.xPxCumule, window.innerWidth),
        y: ramene(d.yPxCumule, window.innerHeight),
      }
      const el = elFantome.current
      if (el === null) setFantome(true)
      else {
        el.style.left = `${placeFantome.current.x}px`
        el.style.top = `${placeFantome.current.y}px`
      }
    } else {
      d.xPxCumule = e.clientX
      d.yPxCumule = e.clientY
    }
    const crans = cransGlisse(d.xPxCumule - d.xPx)
    // First cran = click/drag split: until crossed nothing moves, click stays possible.
    if (crans === 0 && !d.bouge) return
    if (!d.bouge && e.pointerType === 'mouse') verrouille(e.currentTarget)
    d.bouge = true
    const valeur = borne(d.valeur + crans * props.pas)
    if (valeur === d.envoyee) return
    d.envoyee = valeur
    props.sur(valeur, true)
  }

  function surPointerUp(e: PointerEvent<HTMLSpanElement>): void {
    const d = depart.current
    depart.current = null
    setAppuye(false)
    setFantome(false)
    deverrouille(e.currentTarget)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (d !== null && !d.bouge) ouvreSaisie()
    if (d?.bouge === true) props.surFin?.()
  }

  function surClavier(e: KeyboardEvent<HTMLSpanElement>): void {
    const sens = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0
    const recule = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (sens + recule === 0) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        ouvreSaisie()
      }
      return
    }
    e.preventDefault()
    regle(props.valeur + (sens + recule) * props.pas)
  }

  function surClavierSaisie(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') fermeSaisie(true)
    if (e.key === 'Escape') fermeSaisie(false)
  }

  const classes = props.classe === undefined ? 'compteur' : `compteur ${props.classe}`
  // Custom property not inline `width`: sheet keeps unit (`ch`), can override (inline wins always).
  const gabarit = (
    props.largeur === undefined ? {} : { '--compteur-largeur': props.largeur }
  ) as CSSProperties
  const prefixe =
    props.prefixe === undefined ? null : (
      <span className="compteur-prefixe" aria-hidden="true">
        {props.prefixe}
      </span>
    )

  if (saisie !== null) {
    return (
      <span className={`${classes} en-saisie`}>
        {prefixe}
        <input
          className="compteur-saisie"
          type="text"
          inputMode="decimal"
          autoFocus
          aria-label={props.libelle}
          size={Math.max(props.largeur ?? saisie.length, 1)}
          style={gabarit}
          value={saisie}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setSaisie(e.currentTarget.value)}
          onKeyDown={surClavierSaisie}
          onBlur={() => fermeSaisie(true)}
        />
      </span>
    )
  }

  return (
    <span
      role="spinbutton"
      tabIndex={0}
      aria-label={props.libelle}
      aria-valuenow={props.valeur}
      aria-valuetext={props.texte}
      {...(props.min === undefined ? {} : { 'aria-valuemin': props.min })}
      {...(props.max === undefined ? {} : { 'aria-valuemax': props.max })}
      className={appuye ? `${classes} appuye` : classes}
      onPointerDown={surPointerDown}
      onPointerMove={surPointerMove}
      onPointerUp={surPointerUp}
      onPointerCancel={(e) => {
        if (depart.current?.bouge === true) props.surFin?.()
        depart.current = null
        setAppuye(false)
        setFantome(false)
        deverrouille(e.currentTarget)
      }}
      onKeyDown={surClavier}
    >
      {prefixe}
      <span className="compteur-valeur" style={gabarit}>
        {props.texte}
      </span>
      {/* Outside barre: filtered/transformed ancestor turns `fixed` into `absolute`. */}
      {fantome &&
        createPortal(
          <span
            ref={elFantome}
            className="compteur-fantome"
            style={{ left: placeFantome.current.x, top: placeFantome.current.y }}
          >
            <Icone nom="arrow_range" />
          </span>,
          document.body,
        )}
    </span>
  )
}
