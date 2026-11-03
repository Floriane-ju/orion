/**
 * §9.1, T-0169 — home-made rail: native `range` can't show a threshold. Pose unitaire rail needs
 * marker at arbitrary value + detente magnet; no native input gives them. Other rails use it too
 * (one cursor grammar).
 * ABSOLUTE gesture like `range`: value = pointer x in course; click jumps. Pointer captured at
 * `pointerdown` (drag continues off rail, nothing on `window`).
 * Keyboard doesn't snap: arrow = precise intent, magnet would steal the requested cran.
 */

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import {
  accrocheDansLaCourse,
  fractionDuRail,
  valeurDuRail,
  valeurQuantifiee,
  type Rail,
} from './curseur-glisse.ts'
import { encadre } from '../core/unites.ts'
import { pourcentCss } from './carte-nuit-calcul.ts'


export interface AccrocheCurseur {
  readonly valeur: number
  /** What tick is worth, written under it. */
  readonly libelle: string
}

export interface CurseurProps {
  /** Accessible name: rail shows a position, never what it sets. */
  readonly libelle: string
  readonly valeur: number
  readonly min: number
  readonly max: number
  readonly pas: Rail['pas']
  readonly echelle?: Rail['echelle']
  /** Value as written — « 25 s », « 40 % ». */
  readonly texte: string
  /** Threshold magneting gesture. Legend under tick, in clear (hover-only: absent on touch). */
  readonly accroche?: AccrocheCurseur
  readonly sur: (valeur: number) => void
}

function position(fraction: number): CSSProperties {
  return { left: pourcentCss(fraction) }
}

/** Marker x, handed to stylesheet which spreads the spacers. */
function abscisse(fraction: number): CSSProperties {
  return { '--curseur-x': pourcentCss(fraction) } as CSSProperties
}

export function Curseur(props: CurseurProps) {
  const tire = useRef(false)
  const rail: Rail = {
    min: props.min,
    max: props.max,
    pas: props.pas,
    ...(props.echelle === undefined ? {} : { echelle: props.echelle }),
    ...(props.accroche === undefined ? {} : { accroche: props.accroche.valeur }),
  }
  const marque = accrocheDansLaCourse(rail)

  function regle(e: PointerEvent<HTMLDivElement>): void {
    const boite = e.currentTarget.getBoundingClientRect()
    const fraction = boite.width <= 0 ? 0 : (e.clientX - boite.left) / boite.width
    props.sur(valeurDuRail(encadre(fraction, 0, 1), rail, boite.width))
  }

  function surPointerDown(e: PointerEvent<HTMLDivElement>): void {
    // Secondary button = context menu: capture would deny right-click.
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    tire.current = true
    regle(e)
  }

  function surPointerMove(e: PointerEvent<HTMLDivElement>): void {
    if (tire.current) regle(e)
  }

  function surPointerUp(e: PointerEvent<HTMLDivElement>): void {
    tire.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  function surClavier(e: KeyboardEvent<HTMLDivElement>): void {
    const sens =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -1
          : 0
    if (sens === 0) {
      if (e.key !== 'Home' && e.key !== 'End') return
      e.preventDefault()
      props.sur(e.key === 'Home' ? props.min : props.max)
      return
    }
    e.preventDefault()
    const pas = typeof props.pas === 'function' ? props.pas(props.valeur) : props.pas
    props.sur(valeurQuantifiee(props.valeur + sens * pas, rail))
  }

  return (
    <div
      className={marque === null ? 'curseur' : 'curseur avec-legende'}
      role="slider"
      tabIndex={0}
      aria-label={props.libelle}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      aria-valuenow={props.valeur}
      aria-valuetext={props.texte}
      onPointerDown={surPointerDown}
      onPointerMove={surPointerMove}
      onPointerUp={surPointerUp}
      onPointerCancel={surPointerUp}
      onKeyDown={surClavier}
    >
      <span className="curseur-rail" aria-hidden="true" />
      {marque !== null && props.accroche !== undefined && (
        <>
          <span
            className="curseur-accroche"
            style={position(fractionDuRail(marque, rail))}
            aria-hidden="true"
          />
          {/* Legend off-tick: rail-wide, 2 spacers push it to marker x (stops at text edge). */}
          <span
            className="curseur-legendes"
            style={abscisse(fractionDuRail(marque, rail))}
            aria-hidden="true"
          >
            <span className="curseur-legende">{props.accroche.libelle}</span>
          </span>
        </>
      )}
      <span
        className="curseur-pouce"
        style={position(fractionDuRail(props.valeur, rail))}
        aria-hidden="true"
      />
    </div>
  )
}
