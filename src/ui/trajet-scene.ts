/**
 * §3.2, T-0394 — conduire un trajet dans le temps sur la scène.
 *
 * Le trajet écrit l'instant à chaque image, et le publie sur DEUX canaux. La scène lit le
 * sien à chaque image (`useInstantTrajet`) : la magnitude limite, le fond de ciel et
 * l'apparition des repères suivent la minute, et un trajet de 1,2 s n'en montrerait sinon que
 * deux ou trois paliers — revue DA §4.2, « les étoiles apparaissent, magnitude par magnitude ».
 * Le magasin de scène, lui, ne reçoit que l'instant d'arrivée — la boucle de rendu suspend
 * aussi sa publication (`enTrajet`) : chaque publication réveille la liste des cibles, qui
 * replace ses 14 000 lignes, et même deux fois par seconde le trajet saccadait en ciel profond.
 *
 * Le temps est FIGÉ pendant le trajet, comme après un `vaA` : la boucle de rendu laisse alors
 * l'instant à qui l'écrit. Tout autre geste sur le temps — transport, compteur, frise — réécrit
 * l'instant ou le mode, et le trajet s'efface devant lui au lieu de lui disputer l'horloge.
 */

import { courbeTrajet, ecartMontre, planTrajet, type PlanTrajet } from '../core/trajet-temps.ts'
import { pxParDegre } from '../core/curseur-temps.ts'
import { useSyncExternalStore } from 'react'
import { afficheInstant, borneInstant, etatScene, instant, majTemps, vaA } from './scene-etat.ts'
import { creeAbonnes } from './abonnes.ts'

/** Jeton du trajet en cours : en lancer un autre rend le précédent caduc. */
let courant = 0
/** La destination du trajet en cours, `null` hors trajet. */
let destination: number | null = null

/**
 * La destination du trajet en cours, `null` hors trajet. Les compteurs de l'instant l'affichent
 * pendant le trajet : on lit ce qu'on a demandé, le ciel le rejoint, et deux crans enchaînés
 * s'ajoutent au lieu que le second parte de l'heure que le premier traversait.
 */
export function destinationTrajet(): number | null {
  return destination
}

/** L'instant que le trajet traverse, image par image ; `null` hors trajet. */
let passage: number | null = null
const { abonne, notifie } = creeAbonnes()

function posePassage(ms: number | null): void {
  if (ms === passage) return
  passage = ms
  notifie()
}

/** Un trajet est-il en cours ? La boucle de rendu suspend alors sa publication. */
export function enTrajet(): boolean {
  return passage !== null
}

/**
 * L'instant du trajet en cours, à l'image près, `null` hors trajet. Réservé à ce qui doit le
 * suivre image par image et coûte peu : la scène et le curseur de la frise.
 */
export function useInstantTrajet(): number | null {
  return useSyncExternalStore(abonne, () => passage, () => null)
}

function mouvementReduit(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Va à `arriveeMs` en traversant le temps, ou en sautant quand le plan l'exige. `surArrivee`
 * n'est appelé qu'à l'arrivée effective — jamais pour un trajet interrompu. Rend le plan : à
 * l'appelant d'annoncer un saut que la lisibilité impose. `force` ignore le plafond de §3.2
 * (voir `planTrajet`).
 */
export function traverse(
  arriveeMs: number,
  surArrivee?: () => void,
  options: { readonly force?: boolean } = {},
): PlanTrajet {
  const jeton = ++courant
  destination = null
  const arrivee = borneInstant(arriveeMs)
  const { largeurPx, fovDeg } = etatScene().vue
  const plan = planTrajet({
    departMs: instant.ms,
    arriveeMs: arrivee,
    pxParDegre: pxParDegre(largeurPx, fovDeg),
    mouvementReduit: mouvementReduit(),
    ...options,
  })
  if (plan.saut) {
    vaA(arrivee)
    surArrivee?.()
    return plan
  }

  // Trajet forcé : les jours en trop se sautent d'abord, seuls les derniers se traversent.
  if (options.force === true) {
    const ecart = arrivee - instant.ms
    const montre = ecartMontre(ecart)
    if (montre !== ecart) vaA(arrivee - montre)
  }
  const depart = instant.ms
  majTemps({ modeTemps: 'FIGE' })
  destination = arrivee
  let debut: number | null = null
  let ecrit = depart
  const image = (ts: number): void => {
    // Interrompu : un autre trajet, ou un geste qui a réécrit l'instant ou relancé le temps.
    if (jeton !== courant) return
    if (instant.ms !== ecrit || etatScene().temps.modeTemps !== 'FIGE') {
      destination = null
      posePassage(null)
      return
    }
    debut ??= ts
    const t = Math.min(1, (ts - debut) / plan.dureeMs)
    ecrit = depart + (arrivee - depart) * courbeTrajet(t)
    instant.ms = ecrit
    if (t < 1) {
      posePassage(ecrit)
      return void requestAnimationFrame(image)
    }
    destination = null
    posePassage(null)
    afficheInstant(ecrit)
    surArrivee?.()
  }
  requestAnimationFrame(image)
  return plan
}
