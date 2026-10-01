/**
 * §9.1, T-0169 — un rail maison, parce qu'un `range` natif ne sait pas montrer un seuil.
 *
 * Le seul rail de l'interface qui porte une décision — la pose unitaire — a besoin de deux
 * choses qu'aucun `input[type=range]` ne donne : un repère peint à une valeur arbitraire, et
 * une détente qui aimante le geste dessus. Les autres rails passent ici pour la même raison
 * qu'on ne garde pas deux grammaires de curseur à l'écran.
 *
 * Le geste est ABSOLU comme celui d'un `range` : la valeur est celle que désigne l'abscisse du
 * pointeur dans la course, donc un clic sur le rail y saute. Le pointeur est capturé au
 * `pointerdown`, ce qui laisse le glisser continuer hors du rail sans rien écouter sur
 * `window`.
 *
 * Le clavier n'accroche pas : une flèche est une intention précise, l'aimant lui volerait le
 * cran qu'elle vient de demander.
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
  /** Ce que le trait vaut, écrit sous lui. */
  readonly libelle: string
}

export interface CurseurProps {
  /** Nom accessible : le rail montre une position, jamais ce qu'elle règle. */
  readonly libelle: string
  readonly valeur: number
  readonly min: number
  readonly max: number
  readonly pas: Rail['pas']
  readonly echelle?: Rail['echelle']
  /** La valeur telle qu'elle s'écrit — « 25 s », « 40 % ». */
  readonly texte: string
  /**
   * Le seuil qui aimante le geste. Sa légende est peinte sous le trait, en clair : un repère
   * qui ne s'expliquerait qu'au survol n'existerait pas au doigt.
   */
  readonly accroche?: AccrocheCurseur
  readonly sur: (valeur: number) => void
}

function position(fraction: number): CSSProperties {
  return { left: pourcentCss(fraction) }
}

/** L'abscisse du repère, donnée à la feuille de style : c'est elle qui répartit les entretoises. */
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
    // Le bouton secondaire ouvre le menu contextuel : le capturer priverait d'un clic droit.
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
          {/* La légende n'est pas dans le trait : elle occupe toute la largeur du rail, et
              deux entretoises la poussent à l'abscisse du repère. C'est ce qui l'arrête au
              bord de la colonne de texte au lieu de la laisser déborder. */}
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
