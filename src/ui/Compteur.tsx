/**
 * T-0162 — un nombre qui se règle en le tirant, sans quitter des yeux ce qu'il commande.
 *
 * Un `<input type="number">` ou un rail `range` demandent une place que la barre basse n'a
 * pas, et sortent la valeur de la phrase qui la porte. Ici la valeur RESTE le texte affiché :
 * c'est lui qu'on attrape. Le rôle `spinbutton` est ce que la chose est réellement — une
 * valeur numérique sans course bornée — et il apporte les flèches du clavier, donc le même
 * réglage sans souris (§11.2).
 *
 * Le pointeur est capturé au `pointerdown` : le geste continue quand le curseur sort du mot,
 * ce qui est la règle du glisser, et il n'y a rien à écouter sur `window`.
 *
 * Le composant ne connaît ni la nature de la valeur ni son format : il reçoit ce qui s'écrit
 * (`texte`) et rend ce qui se règle (`valeur`). C'est ce qui lui permet de porter aussi bien
 * un mois en toutes lettres qu'un champ en degrés.
 *
 * UN CHAMP, PAS UN MOT. Le compteur a l'allure d'une saisie — un cadre, et un `prefixe` qui dit
 * ce qu'il règle, comme le « H » d'un éditeur graphique. Sous la souris, il se tire ; un clic
 * sans glisser, ou Entrée, l'ouvre en saisie : un `<input>` prend sa place, on tape le nombre,
 * Entrée ou la sortie du champ l'applique, Échap l'abandonne. Le champ de saisie n'existe que
 * le temps de la frappe : au repos, la valeur reste le texte qui s'affiche et s'annonce.
 */

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { cransGlisse } from './compteur-glisse.ts'
import { nombreDeTexte } from '../registry/domains.ts'

export interface CompteurProps {
  /** Nom accessible : le compteur affiche une valeur, jamais ce qu'elle désigne. */
  readonly libelle: string
  readonly valeur: number
  /** La valeur telle qu'elle s'écrit — un mois en toutes lettres, un angle arrondi. */
  readonly texte: string
  /** Ce qu'un cran ajoute. Le pas de lecture, pas celui du modèle : c'est le geste. */
  readonly pas: number
  readonly min?: number
  readonly max?: number
  /** Ce que le champ règle, en une abréviation posée devant la valeur. */
  readonly prefixe?: string
  /**
   * Largeur de la valeur, en caractères : celle de la plus longue qu'elle puisse prendre. Le
   * champ ne change plus de taille quand la valeur change, et ses voisins ne bougent pas.
   */
  readonly largeur?: number
  readonly classe?: string
  readonly sur: (valeur: number) => void
  /** Appelé au début de tout réglage : le geste est absolu, l'appelant gèle sa référence. */
  readonly surDebut?: () => void
}

interface Depart {
  readonly xPx: number
  readonly valeur: number
  /** Un geste qui a bougé n'est plus un clic : c'est ce qui distingue les deux intentions. */
  bouge: boolean
}

/** Le nombre que la saisie propose : celui qu'on lit dans le texte, sinon la valeur brute. */
export function nombreDuTexte(texte: string, valeur: number): string {
  return /-?\d+(?:[.,]\d+)?/.exec(texte)?.[0] ?? String(valeur)
}

/** Ce qu'une frappe vaut : la virgule française vaut le point, le reste ne vaut rien. */
export function lisSaisie(tape: string): number | null {
  const nombre = nombreDeTexte(tape)
  return Number.isFinite(nombre) ? nombre : null
}

export function Compteur(props: CompteurProps) {
  const depart = useRef<Depart | null>(null)
  /** Le texte en cours de frappe ; `null` hors saisie. */
  const [saisie, setSaisie] = useState<string | null>(null)
  const initiale = useRef('')

  function borne(valeur: number): number {
    return Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, valeur))
  }

  function regle(valeur: number): void {
    props.surDebut?.()
    props.sur(borne(valeur))
  }

  function ouvreSaisie(): void {
    initiale.current = nombreDuTexte(props.texte, props.valeur)
    setSaisie(initiale.current)
  }

  /** Une saisie inchangée ne règle rien : l'appliquer figerait le temps pour rien. */
  function fermeSaisie(applique: boolean): void {
    const tape = saisie
    setSaisie(null)
    if (!applique || tape === null || tape === initiale.current) return
    const nombre = lisSaisie(tape)
    if (nombre !== null) regle(nombre)
  }

  function surPointerDown(e: PointerEvent<HTMLSpanElement>): void {
    // Le bouton secondaire ouvre le menu contextuel : le capturer priverait d'un clic droit.
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    depart.current = { xPx: e.clientX, valeur: props.valeur, bouge: false }
    props.surDebut?.()
  }

  function surPointerMove(e: PointerEvent<HTMLSpanElement>): void {
    const d = depart.current
    if (d === null) return
    const crans = cransGlisse(e.clientX - d.xPx)
    // Le premier cran fait la différence entre un clic et un glisser : tant qu'il n'est pas
    // franchi, rien ne bouge et le clic reste possible.
    if (crans === 0 && !d.bouge) return
    d.bouge = true
    props.sur(borne(d.valeur + crans * props.pas))
  }

  function surPointerUp(e: PointerEvent<HTMLSpanElement>): void {
    const d = depart.current
    depart.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (d !== null && !d.bouge) ouvreSaisie()
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
  // Une propriété personnalisée et non un `width` en ligne : la feuille garde l'unité (`ch`) et
  // peut la surcharger, un style en ligne gagnerait contre toute règle.
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
      className={classes}
      onPointerDown={surPointerDown}
      onPointerMove={surPointerMove}
      onPointerUp={surPointerUp}
      onPointerCancel={() => {
        depart.current = null
      }}
      onKeyDown={surClavier}
    >
      {prefixe}
      <span className="compteur-valeur" style={gabarit}>
        {props.texte}
      </span>
    </span>
  )
}
