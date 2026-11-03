/**
 * §5.1 and §10.1 — numeric field: bound from registre, never the component; optional field left
 * empty = quantity declared unknown, not an error.
 * T-0209 — was local to `PanneauBoitier` (`ChampCapteur`), other screens used bare `<input>`: 3
 * writings → no `aria-invalid` anywhere, T-0192 needing a test for missing `inputMode`.
 * T-0208 — field itself says when its value was clamped into domain; cause reads at foot of the
 * field that produced it (only unambiguous place).
 * `glisse` — also set by dragging horizontally at domain step, like a counter
 * (`compteur-glisse.ts`) but same `<input>`, same size. Drag acts only on idle field with mouse:
 * typing field keeps text selection, finger keeps page scroll. Click without drag opens typing,
 * value selected; ↑ ↓ give the same step by keyboard.
 */

import { useId, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { nombreLibre } from '../registry/ecriture.ts'
import { DOMAINES, nombreDeTexte, type DomaineId } from '../registry/domains.ts'
import type { TermeGlossaire } from '../registry/glossaire.ts'
import { nombreSaisi } from './saisie-bornee.ts'
import type { Plage } from '../core/objectif.ts'
import { texteGlisse } from './compteur-glisse.ts'
import { Bulle } from './Bulle.tsx'
import { Etiquette } from './Terme.tsx'
import { Icone } from './Icone.tsx'
import { Mention } from './Mention.tsx'

/**
 * T-0199 — sign that a quantity is missing, at end of its field label. §11.1: red never alone,
 * glyph shape doubles it. `nomme` not `describedby`: glyph has no other name than the note.
 * Keyboard-reachable: bulle opens on `:focus-visible` (hover-only note doesn't exist without a
 * mouse).
 */
export function AlerteChamp({ note }: { readonly note: string }) {
  return (
    <Bulle texte={note} place="bas" nomme>
      <span className="alerte-champ" role="img" tabIndex={0}>
        <Icone nom="warning" />
      </span>
    </Bulle>
  )
}

export interface ChampDomaineProps {
  readonly domaine: DomaineId
  /** §10.1 — label is a glossaire key when the term is there. */
  readonly cle?: TermeGlossaire
  /** Plain label, for a field with no glossaire entry. */
  readonly libelle?: string
  /** Precision computed at point of use, added to `cle` bulle. */
  readonly precision?: string | undefined
  readonly valeur: string
  readonly surValeur: (v: string) => void
  /** Without it no output exists: placeholder announces the expected range. */
  readonly requis?: boolean
  /** T-0199 — what registre substitutes when the quantity stays empty. */
  readonly note?: string | undefined
  /** Domain unit, suffixed to label. Unneeded where label already carries it. */
  readonly unite?: boolean
  readonly placeholder?: string
  /** An INTEGER index doesn't open the decimal-separator keyboard (T-0192). */
  readonly inputMode?: 'decimal' | 'numeric'
  /** Field is dragged horizontally, at domain `pas`. */
  readonly glisse?: boolean
  /**
   * T-0404 — range narrower than domain: the mounted lens's. Refusal + placeholder cite it; domain
   * stays last-resort bound.
   */
  readonly plage?: Plage | undefined
}

/** Gesture start point: an empty field starts at the lower bound. */
function valeurDeDepart(texte: string, min: number): number {
  const n = nombreDeTexte(texte)
  return Number.isFinite(n) ? n : min
}

/** Drag and arrows, at domain step; `null` for a non-draggable field. */
function useGlisse(props: ChampDomaineProps) {
  const d = DOMAINES[props.domaine]
  const depart = useRef<{ readonly xPx: number; readonly valeur: number; bouge: boolean } | null>(null)
  const pas = 'pas' in d ? d.pas : undefined
  if (props.glisse !== true || pas === undefined) return null
  const domaine = { min: d.min, max: d.max, pas }

  return {
    onPointerDown(e: PointerEvent<HTMLInputElement>) {
      if (e.pointerType !== 'mouse' || e.button !== 0 || document.activeElement === e.currentTarget) return
      // No focus/selection on press: click vs drag not known yet.
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      depart.current = { xPx: e.clientX, valeur: valeurDeDepart(props.valeur, d.min), bouge: false }
    },
    onPointerMove(e: PointerEvent<HTMLInputElement>) {
      const g = depart.current
      if (g === null) return
      const dx = e.clientX - g.xPx
      const texte = texteGlisse(g.valeur, dx, domaine)
      if (!g.bouge && texteGlisse(g.valeur, 0, domaine) === texte) return
      g.bouge = true
      if (texte !== props.valeur) props.surValeur(texte)
    },
    onPointerUp(e: PointerEvent<HTMLInputElement>) {
      const g = depart.current
      depart.current = null
      if (g === null || g.bouge) return
      e.currentTarget.focus()
      e.currentTarget.select()
    },
    // `preventDefault` on `pointerdown` doesn't hold focus/selection everywhere: those are
    // `mousedown` effects, held too.
    onMouseDown(e: MouseEvent<HTMLInputElement>) {
      if (e.button === 0 && document.activeElement !== e.currentTarget) e.preventDefault()
    },
    onPointerCancel() {
      depart.current = null
    },
    onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      const sens = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0
      if (sens === 0) return
      e.preventDefault()
      // A keyboard step is a drag step: same rounding, same bound.
      const texte = texteGlisse(valeurDeDepart(props.valeur, d.min) + sens * pas, 0, domaine)
      props.surValeur(texte)
    },
  }
}

export function ChampDomaine(props: ChampDomaineProps) {
  const d = DOMAINES[props.domaine]
  const idRefus = useId()
  // Empty field isn't a faulty value: transient typing state (T-0149); consequence of absence
  // already said by `note` or the panel.
  // T-0404 — refusal waits for blur: "1" heading to "18" isn't a fault, per-keystroke announcement
  // shouted before number end. Value bounded at keystroke by the calcul chain; only the warning is
  // deferred.
  const [enFrappe, setEnFrappe] = useState(false)
  const refus =
    enFrappe || props.valeur.trim() === ''
      ? null
      : nombreSaisi(props.domaine, props.valeur, props.plage).refus
  const glisse = useGlisse(props)
  const bornes = props.plage ?? d
  const placeholder =
    props.placeholder ??
    (props.requis === true ? `${nombreLibre(bornes.min)} à ${nombreLibre(bornes.max)}` : 'inconnu')

  return (
    <label>
      <span className="libelle champ-titre">
        <span>
          {props.cle === undefined ? (
            props.libelle
          ) : (
            <Etiquette cle={props.cle} precision={props.precision} />
          )}
          {props.unite === true && <span className="casse-exacte"> ({d.unite})</span>}
        </span>
        {props.note !== undefined && <AlerteChamp note={props.note} />}
      </span>
      <input
        value={props.valeur}
        inputMode={props.inputMode ?? 'decimal'}
        placeholder={placeholder}
        {...(refus === null ? {} : { 'aria-invalid': true, 'aria-errormessage': idRefus })}
        onChange={(e) => props.surValeur(e.target.value)}
        onFocus={() => setEnFrappe(true)}
        onBlur={() => setEnFrappe(false)}
        {...(glisse === null ? {} : { className: 'champ-glisse', ...glisse })}
      />
      {refus !== null && (
        <Mention ton="erreur" id={idRefus} role="status">
          {refus}
        </Mention>
      )}
    </label>
  )
}
