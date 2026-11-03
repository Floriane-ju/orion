/**
 * §11.2 — coque: scène fills all, rest overlays. T-0113 replaced lot 6's three columns (left
 * scène half the screen: 1440 px window, 20+24 rem panels = 700 px).
 *   - barre HAUTE names app; temps (horloge+frise, T-0411) moved to scène bottom (T-0413)
 *   - RAIL left of scène: vue toggles (T-0213), then menus Site, Boîtier, Optique (T-0437)
 *   - CARTES: plan de nuit, foldable
 *   - COLONNE DE DROITE: séance panel (long reads: catalogue, filé)
 *   - VISÉE top right, against panel (T-0414)
 *   - TEMPS bottom center of scène (T-0413)
 * Knows no content: takes six regions, places them (panels change, layout doesn't).
 * DOM order = tab order: topbar, scène, cartes, panneau, visée, temps. Follows reading, not screen
 * position (panel opened by keyboard from topbar = next node, not last).
 * Under repli: vertical flow (cartes under scène, panel after). No JS media query.
 */

import { useEffect, type ReactNode } from 'react'

import { GardeErreur } from './GardeErreur.tsx'
import { ancreTiroirs } from './tiroir-ancrage.ts'

export interface CoqueProps {
  /** Barre haute: identity. */
  readonly topbar: ReactNode
  /** T-0413 — temps (horloge, frise, retour au présent), scène bottom center. */
  readonly temps: ReactNode
  /** Scène: fills coque; other regions overlay. */
  readonly scene: ReactNode
  /** Over scène: vue rail, then plan de nuit card. */
  readonly cartes: ReactNode
  /** Séance panel, right column. */
  readonly lateral: ReactNode
  /** Visée, scène top right (T-0414). */
  readonly visee: ReactNode
  /** T-0325 — info page: last in DOM, covers all when anchor targets it. */
  readonly page: ReactNode
}

export function Coque(props: CoqueProps) {
  // T-0121 — tiroir windows open under button, re-clamped to screen; layout → coque, one listener.
  useEffect(ancreTiroirs, [])

  return (
    <div className="coque">
      {/* T-0310 — one boundary per region: a throw switches off that region only. */}
      <header className="coque-topbar">
        <GardeErreur region="la barre haute">{props.topbar}</GardeErreur>
      </header>
      <main className="coque-scene">
        <GardeErreur region="le ciel">{props.scene}</GardeErreur>
      </main>
      <div className="coque-cartes">
        <GardeErreur region="le plan de nuit">{props.cartes}</GardeErreur>
      </div>
      <div className="coque-droite">
        <GardeErreur region="le panneau de séance">{props.lateral}</GardeErreur>
      </div>
      <GardeErreur region="la visée">{props.visee}</GardeErreur>
      <div className="coque-temps">
        <GardeErreur region="le temps">{props.temps}</GardeErreur>
      </div>
      <GardeErreur region="la page d’information">{props.page}</GardeErreur>
    </div>
  )
}
