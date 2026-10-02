/**
 * §5.1 et §10.1 — un champ numérique : sa borne vient du registre, jamais du composant, et
 * laisser un champ facultatif vide n'est pas une erreur — c'est déclarer la grandeur inconnue.
 *
 * T-0209 — il était local à `PanneauBoitier` sous le nom `ChampCapteur`, et les autres écrans
 * posaient des `<input>` nus. Trois écritures du même champ, donc trois occasions d'oublier
 * quelque chose : c'est ainsi qu'aucun champ de l'application ne portait `aria-invalid`, et
 * que T-0192 a dû ajouter un test pour rattraper les `inputMode` manquants.
 *
 * T-0208 — le champ dit LUI-MÊME quand sa valeur a été ramenée dans le domaine. La cause se
 * lit au pied du champ qui l'a produite, pas en bas du panneau : c'est le seul endroit où
 * elle désigne sans ambiguïté la valeur à corriger.
 *
 * `glisse` — le champ se règle aussi en le tirant à l'horizontale, au pas de son domaine,
 * comme un compteur (`compteur-glisse.ts`) mais sans changer de forme : c'est le même
 * `<input>`, à la même taille. Le glisser n'agit que champ au repos et à la souris : un champ
 * en cours de frappe garde la sélection de texte, et un doigt garde le défilement de la page.
 * Un clic sans glisser ouvre la frappe, valeur sélectionnée ; ↑ et ↓ font le même cran au
 * clavier.
 */

import { useId, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { nombreLibre } from '../registry/ecriture.ts'
import { DOMAINES, nombreDeTexte, type DomaineId } from '../registry/domains.ts'
import type { TermeGlossaire } from '../registry/glossaire.ts'
import { nombreSaisi } from './saisie-bornee.ts'
import { texteGlisse } from './compteur-glisse.ts'
import { Bulle } from './Bulle.tsx'
import { Etiquette } from './Terme.tsx'
import { Icone } from './Icone.tsx'
import { Mention } from './Mention.tsx'

/**
 * T-0199 — le signe qui dit qu'une grandeur manque, posé au bout du libellé du champ qu'elle
 * concerne. §11.1 : le rouge ne porte jamais seul, la forme du glyphe le double.
 *
 * `nomme` plutôt que `describedby` : le glyphe n'a pas d'autre nom que la note. Il est
 * atteignable au clavier — la bulle s'ouvre sur `:focus-visible`, et une note qui ne sort
 * qu'au survol n'existe pas pour qui n'a pas de souris.
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
  /** §10.1 — le libellé est une clé du glossaire quand le terme y figure. */
  readonly cle?: TermeGlossaire
  /** Le libellé en clair, pour un champ qui n'a pas d'entrée au glossaire. */
  readonly libelle?: string
  /** Précision calculée au contact, ajoutée à la bulle de `cle`. */
  readonly precision?: string | undefined
  readonly valeur: string
  readonly surValeur: (v: string) => void
  /** Sans lui, la sortie n'existe pas : le placeholder annonce alors la plage attendue. */
  readonly requis?: boolean
  /** T-0199 — ce que le registre met à la place, quand la grandeur reste vide. */
  readonly note?: string | undefined
  /** L'unité du domaine, suffixée au libellé. Inutile là où le libellé la porte déjà. */
  readonly unite?: boolean
  readonly placeholder?: string
  /** Un indice ENTIER n'ouvre pas le clavier à séparateur décimal (T-0192). */
  readonly inputMode?: 'decimal' | 'numeric'
  /** Le champ se tire à l'horizontale, au `pas` de son domaine. */
  readonly glisse?: boolean
}

/** Le point de départ d'un geste : un champ vide part de la borne basse. */
function valeurDeDepart(texte: string, min: number): number {
  const n = nombreDeTexte(texte)
  return Number.isFinite(n) ? n : min
}

/** Glisser et flèches, au pas du domaine ; `null` pour un champ qui ne se tire pas. */
function useGlisse(props: ChampDomaineProps) {
  const d = DOMAINES[props.domaine]
  const depart = useRef<{ readonly xPx: number; readonly valeur: number; bouge: boolean } | null>(null)
  const pas = 'pas' in d ? d.pas : undefined
  if (props.glisse !== true || pas === undefined) return null
  const domaine = { min: d.min, max: d.max, pas }

  return {
    onPointerDown(e: PointerEvent<HTMLInputElement>) {
      if (e.pointerType !== 'mouse' || e.button !== 0 || document.activeElement === e.currentTarget) return
      // Ni focus ni sélection à l'appui : on ne sait pas encore si c'est un clic ou un glisser.
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
    // `preventDefault` au `pointerdown` ne retient pas partout le focus ni la sélection : ce
    // sont des effets du `mousedown`, qu'on retient donc aussi.
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
      // Un cran de clavier est un cran de glisser : le même arrondi, la même borne.
      const texte = texteGlisse(valeurDeDepart(props.valeur, d.min) + sens * pas, 0, domaine)
      props.surValeur(texte)
    },
  }
}

export function ChampDomaine(props: ChampDomaineProps) {
  const d = DOMAINES[props.domaine]
  const idRefus = useId()
  // Un champ vide n'est pas une valeur fautive : c'est un état transitoire de frappe (T-0149),
  // et la conséquence de son absence est déjà dite par `note` ou par le panneau.
  const refus = props.valeur.trim() === '' ? null : nombreSaisi(props.domaine, props.valeur).refus
  const glisse = useGlisse(props)
  const placeholder = props.placeholder ?? (props.requis === true ? `${nombreLibre(d.min)} à ${nombreLibre(d.max)}` : 'inconnu')

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
