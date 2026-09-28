/**
 * Les gestes que la scène accepte : glisser pour promener la visée, molette et pincement
 * pour le champ, défilement à deux doigts pour promener aussi — et, depuis T-0069, les
 * touches, qui rejouent les mêmes gestes dans les mêmes bornes.
 *
 * Le zoom est posé à la main, hors de React : `onWheel` attache un écouteur passif, où
 * `preventDefault()` reste sans effet — le navigateur zoomerait alors toute la page par-dessus
 * le champ de la scène. Safari ajoute ses `gesture*`, qui zooment la page de leur côté.
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

/** Un cran de zoom — molette ou touche. Le pincement, lui, est continu : voir `deltaY`. */
const FACTEUR_ZOOM_CRAN = K('FACTEUR_ZOOM_CRAN')
/** Pincement au pavé : `deltaY` en pixels vers un facteur de champ, par l'exponentielle. */
const SENSIBILITE_PINCEMENT = 0.01
/** `WheelEvent.DOM_DELTA_PIXEL` : delta en pixels, le cas du pavé et des molettes sur macOS. */
const DOM_DELTA_PIXEL = 0
/** Un cran de molette vaut ±120 en `wheelDeltaY`, hérité de Windows et repris partout. */
const CRAN_WHEEL_DELTA = 120
/**
 * Le plancher, en pixels, d'un cran de molette — mesuré à 12–13 px sur une molette libre. Un pavé
 * démarre plus doucement, 1 à 3 px sur ses premiers événements : en dessous de ce plancher, un
 * `wheel` ambigu se lit comme un début de rafale de pavé, pas comme un cran.
 */
const SEUIL_CRAN_PX = 10
/**
 * Combien de temps un pavé reconnu garde la main sur les `wheel` ambigus. La rafale entretient
 * elle-même cette mémoire : le délai n'a qu'à couvrir l'écart entre deux de ses événements
 * — 15 ms mesurés — pas la durée du geste. Court exprès, pour que reprendre la souris rezoome.
 */
const MEMOIRE_PAVE_MS = 400
/** T-0069 — pas d'une touche fléchée, en fraction du champ affiché (§3.3, registre). */
const PAS_VISEE_FRACTION = K('PAS_VISEE_CLAVIER_FRACTION')
/** Les bornes du pointage, partagées avec les compteurs de la barre basse (T-0163). */
export const HAUTEUR_MIN_DEG = -90
export const HAUTEUR_MAX_DEG = 90

/**
 * Le facteur appliqué au champ pour un `wheel`. La molette avance par crans : facteur fixe. Le
 * pincement au pavé est continu — Chrome et Firefox le traduisent en `wheel` à `ctrlKey` — et son
 * amplitude est dans `deltaY` : l'exponentielle en fait un facteur multiplicatif continu, où deux
 * demi-gestes valent exactement le geste entier.
 */
export function facteurZoom(deltaY: number, pincement: boolean): number {
  if (pincement) return Math.exp(deltaY * SENSIBILITE_PINCEMENT)
  return deltaY > 0 ? FACTEUR_ZOOM_CRAN : 1 / FACTEUR_ZOOM_CRAN
}

/** Le champ ramené dans les bornes de §3.3 — les mêmes pour la molette et pour les touches. */
export function fovBorne(fovDeg: number, bornes: BornesZoom): number {
  return encadre(fovDeg, bornes.fovMinDeg, bornes.fovMaxDeg)
}

/** Ce qu'un `wheel` doit déclencher sur la scène. */
export type SourceGeste = 'PINCEMENT' | 'MOLETTE' | 'DEFILEMENT'

/** Ce qu'un `wheel` porte, indépendamment du geste qui l'a produit. */
interface DeltasMolette {
  readonly ctrlKey: boolean
  readonly deltaMode: number
  readonly deltaX: number
  readonly deltaY: number
  readonly wheelDeltaY?: number
}

/**
 * La marque d'un pavé, sans ambiguïté : le pincement, que le navigateur signale par `ctrlKey`, le
 * doigt qui dérive de côté, ou des deltas fractionnaires. Une molette, même à haute résolution,
 * ne fait rien de tout cela — ses crans sont entiers et strictement verticaux.
 */
export function signaturePave(e: DeltasMolette): boolean {
  if (e.ctrlKey) return true
  if (e.deltaMode !== DOM_DELTA_PIXEL) return false
  return e.deltaX !== 0 || !Number.isInteger(e.deltaY)
}

/**
 * Un `wheel` sur macOS peut venir de trois gestes qui ne doivent pas faire la même chose : le
 * pincement zoome, le défilement à deux doigts promène la visée, la molette zoome. Aucun
 * navigateur ne dit lequel c'est ; il faut le déduire de signaux, du plus sûr au moins sûr.
 *
 * Reste un cas indécidable : un delta entier, strictement vertical — une molette à haute
 * résolution en produit autant que la phase d'inertie d'un pavé. Deux indices le tranchent :
 * l'amplitude, un cran pesant plus qu'un début de rafale, et `paveRecent`, vrai tant que le pavé
 * vient de se signaler. Hors de ces deux cas on zoome, ce qu'on attend d'une souris.
 */
export function sourceMolette(e: DeltasMolette, paveRecent = false): SourceGeste {
  // Le pincement au pavé, seul geste que le navigateur signale lui-même — par `ctrlKey`.
  if (e.ctrlKey) return 'PINCEMENT'
  // Un delta en lignes plutôt qu'en pixels : Firefox ne le fait que pour une vraie molette.
  if (e.deltaMode !== DOM_DELTA_PIXEL) return 'MOLETTE'
  // Un pavé reconnu, ou un événement sans amplitude verticale : rien à zoomer.
  if (signaturePave(e) || e.deltaY === 0) return 'DEFILEMENT'
  // WebKit et Blink : un cran de molette vaut un multiple de 120 en `wheelDeltaY`.
  if (e.wheelDeltaY !== undefined && e.wheelDeltaY % CRAN_WHEEL_DELTA === 0) return 'MOLETTE'
  if (Math.abs(e.deltaY) < SEUIL_CRAN_PX) return 'DEFILEMENT'
  return paveRecent ? 'DEFILEMENT' : 'MOLETTE'
}

/**
 * `wheelDeltaY` est déprécié et absent des types du DOM, mais reste le seul signal fiable pour
 * distinguer un cran de molette d'un défilement au pavé dans WebKit et Blink.
 */
interface EvenementMolette extends WheelEvent {
  readonly wheelDeltaY?: number
}

/**
 * Safari macOS émet ces événements non standard pour le pincement au pavé, en plus — ou à la
 * place — du `wheel` à `ctrlKey`. Ils sont absents des types du DOM : on les déclare ici.
 */
interface EvenementGeste extends Event {
  readonly scale: number
}

/** Un tour complet ramené dans 0–360°, la plage de §3.5 comme celle de l'azimut. */
const tourBorne = (deg: number): number => ramene(deg, TOUR_DEG)

function hauteurBornee(deg: number): number {
  return encadre(deg, HAUTEUR_MIN_DEG, HAUTEUR_MAX_DEG)
}

/** La boîte du canevas, réduite à ce dont la rotation a besoin — testable sans DOM. */
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
 * §3.5 — le roulis du boîtier après un glisser autour du centre du canevas, borné à 0–360°.
 *
 * L'écart d'angle du pointeur se RETRANCHE du roulis : l'axe des ordonnées de l'écran descend
 * là où celui de la vue monte, si bien qu'un roulis croissant fait tourner le cadre dans le
 * sens antihoraire à l'écran. Sans ce signe, le cadre partirait à l'envers du geste.
 *
 * Le geste est continu et sans plafond : deux demi-gestes valent le geste entier, et un tour
 * complet ramène le cadre où il était.
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

/**
 * Le glisser à la souris : promener la visée, tourner le cadre avec Maj, et un clic sans
 * déplacement désigne une cible.
 */
export function usePointageSouris(entree: {
  readonly largeurPx: number
  readonly fovDeg: number
  readonly actions: ActionsScene
  readonly cibles: RefObject<readonly CibleEcran[]>
  /**
   * T-0085 — ce que le curseur désigne, écrit hors de React : la boucle de rendu le lit par
   * image. Passer par un état réactif rendrait React à chaque mouvement de souris.
   */
  readonly survol: RefObject<SurvolEcran | null>
  readonly surSelectionObjet: (objet: ObjetCielProfond) => void
}) {
  const glisse = useRef<{ x: number; y: number } | null>(null)
  const { largeurPx, fovDeg, actions, cibles, survol, surSelectionObjet } = entree

  /** Coordonnées du pointeur dans la définition de rendu, où vivent les cibles. */
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
        // T-0085 — hors glisser, le curseur révèle le nom que le seuil de zoom a masqué.
        // T-0109 — on ne range QUE la cible : c'est la scène qui la nomme et la place, avec
        // les fonctions des labels peints. Composer le texte ici en ferait un second
        // vocabulaire, désaccordé de celui du dessin — c'est le bogue d'origine. Le survol
        // ne touche ni à l'onglet ni à l'état de la scène.
        const point = pointCanevas(e)
        const cible = cibleSousLeCurseur(cibles.current, point.x, point.y)
        survol.current = cible === null ? null : { cible }
        return
      }
      survol.current = null
      const rect = e.currentTarget.getBoundingClientRect()

      // §3.5 — Maj enfoncée, le geste tourne le BOÎTIER, pas la visée : un geste continu, dans
      // les bornes 0–360°. Le pointage reste le glisser nu, qui est le geste de tous les jours.
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
      // Sans rayon : le pointeur garde la tolérance au pixel de `cibleSousLeCurseur`.
      choisitCible(cibles.current, point.x, point.y, surSelectionObjet)
    },
  }
}

/** Molette, pincement et défilement à deux doigts, posés hors de React sur le canevas. */
export function useGestesZoom(
  canevas: RefObject<HTMLCanvasElement | null>,
  gaiaCharge: boolean,
): void {
  useEffect(() => {
    const brut = canevas.current
    if (brut === null) return
    const cible: HTMLCanvasElement = brut
    // Les bornes sont relues à chaque geste, pas capturées : le plafond dépend de la
    // projection courante (T-0095), et la projection change sans démonter l'écouteur.
    const borne = (v: VueScene, fov: number): number => fovBorne(fov, bornesZoom(gaiaCharge, v.mode))

    // Le dernier instant où le pavé s'est signalé. La rafale entretient cette date d'elle-même :
    // tant qu'elle dure, ses événements ambigus restent du défilement, inertie comprise. Une
    // mémoire qui expire, et non un drapeau définitif : sinon reprendre la souris ne rezoome plus.
    let dernierPaveMs = Number.NEGATIVE_INFINITY

    function surMolette(e: WheelEvent): void {
      e.preventDefault()
      const molette = e as EvenementMolette
      if (signaturePave(molette)) dernierPaveMs = e.timeStamp
      const source = sourceMolette(molette, e.timeStamp - dernierPaveMs < MEMOIRE_PAVE_MS)
      if (source !== 'MOLETTE') dernierPaveMs = e.timeStamp
      if (source === 'DEFILEMENT') {
        // Deux doigts sur le pavé promènent le ciel comme le ferait un glisser : le ciel suit les
        // doigts, donc le signe des deltas s'inverse. Le champ est lu dans l'état, pas capturé.
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

    // Safari : `scale` est cumulée depuis le début du geste, on n'en garde que la variation.
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
 * §3.4 — ce qu'un choix de cible fait, quel que soit ce qui l'a déclenché.
 *
 * T-0069 — le clic et la touche Entrée passent par ici : c'est ce qui garantit que « le choix
 * est le même dans les deux cas ». Seule la tolérance de désignation diffère, parce qu'un
 * pointeur vise au pixel et pas une touche.
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
  // §3.4 — un objet du ciel profond ouvre sa fiche : le geste ne s'arrête pas sur un nom.
  if (decrite?.objet != null) surSelectionObjet(decrite.objet)
}

/** Le geste que porte une touche. Rien d'autre n'est intercepté : Tab et Échap doivent passer. */
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
    // `=` et `_` sont les touches non majuscules de `+` et `-` : les exiger avec Maj ferait
    // du zoom un geste à deux mains sur un clavier français comme sur un clavier anglais.
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
 * §3.3 / §3.5 — la vue après une touche, dans les bornes du glisser et de la molette.
 *
 * Le pas de visée est une FRACTION DU CHAMP, pas un nombre de degrés : à 5° de champ, un pas
 * fixe de plusieurs degrés ferait sauter la visée d'un bout à l'autre de l'image. C'est la
 * même règle que le glisser, où le déplacement vaut `fov / largeur` par pixel.
 *
 * Fonction pure : c'est elle qui se teste, le gestionnaire ne fait que la brancher.
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
    // Un cran de touche vaut un cran de molette : `facteurZoom` reste la seule source du
    // facteur, et `fovBorne` les seules bornes (T-0030).
    case 'ZOOM_AVANT':
      return { fovDeg: fovBorne(vue.fovDeg * facteurZoom(-1, false), bornes) }
    case 'ZOOM_ARRIERE':
      return { fovDeg: fovBorne(vue.fovDeg * facteurZoom(1, false), bornes) }
  }
}

/**
 * T-0069 — les raccourcis énoncés, une fois, pour les deux endroits qui les annoncent : la
 * description du canevas et le panneau Explorer. Les chiffres viennent du registre, sinon la
 * phrase promettrait un pas que le code n'applique pas.
 */
export const RACCOURCIS_CLAVIER =
  '← ↑ ↓ → déplacer la vue · + − zoomer · Entrée choisir l’objet au centre'

/**
 * T-0069 — WCAG 2.1.1 : le pilotage de la scène au clavier, dans les bornes du pointeur.
 *
 * Chaque appui n'écrit que l'azimut, la hauteur ou le champ : la boucle de rendu relit la vue
 * à chaque image, et son plafond d'images borne le travail quel que soit le rythme des touches
 * (T-0117). Rien à reporter, donc rien à replanifier par touche.
 */
export function usePilotageClavier(entree: {
  readonly largeurPx: number
  readonly hauteurPx: number
  /** T-0258 — « l'objet au centre » est celui qu'on voit au centre, pas celui du milieu du canevas. */
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
      // Les flèches feraient défiler la page et l'Espace la ferait sauter d'un écran : le
      // geste appartient à la scène tant qu'elle a le focus.
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
