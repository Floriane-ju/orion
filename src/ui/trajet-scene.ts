/**
 * §3.2, T-0394 — conduire un trajet dans le temps sur la scène.
 *
 * Le trajet écrit l'instant ET le publie à chaque image. La publication ordinaire, deux fois
 * par seconde, suffit à dater des lectures ; elle ne suffit pas ici : la magnitude limite, le
 * fond de ciel et l'apparition des repères suivent la minute publiée, et un trajet de 1,2 s
 * n'en montrerait que deux ou trois paliers. Revue DA §4.2 — « les étoiles apparaissent,
 * magnitude par magnitude » : c'est l'information que porte le trajet, sans elle il ne serait
 * qu'un mouvement.
 *
 * Le temps est FIGÉ pendant le trajet, comme après un `vaA` : la boucle de rendu laisse alors
 * l'instant à qui l'écrit. Tout autre geste sur le temps — transport, compteur, frise — réécrit
 * l'instant ou le mode, et le trajet s'efface devant lui au lieu de lui disputer l'horloge.
 */

import { courbeTrajet, ecartMontre, planTrajet, type PlanTrajet } from '../core/trajet-temps.ts'
import { pxParDegre } from '../core/curseur-temps.ts'
import { afficheInstant, borneInstant, etatScene, instant, majTemps, vaA } from './scene-etat.ts'

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
      return
    }
    debut ??= ts
    const t = Math.min(1, (ts - debut) / plan.dureeMs)
    ecrit = depart + (arrivee - depart) * courbeTrajet(t)
    instant.ms = ecrit
    afficheInstant(ecrit)
    if (t < 1) return void requestAnimationFrame(image)
    destination = null
    surArrivee?.()
  }
  requestAnimationFrame(image)
  return plan
}
