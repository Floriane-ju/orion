/**
 * T-0409 — UI goes light by day; mode nuit always wins (§11.1).
 * Instant = SCENE's, not clock: UI reads like the sky it drives (night at 21 h under a white
 * panel contradicted). Scene on now = real time. Site = entered one.
 * Light palette only sets an attribute; stylesheet excludes itself under mode nuit → no apply
 * order can leak light into the red. Canvas ignores the stylesheet.
 * T-0421 — during a trajet the store publishes only the arrival (UI flipped after the trip,
 * far from the sunset crossed) → also follow trajet instant per frame, in a render-nothing
 * component so only it re-renders.
 */

import { useEffect, useMemo } from 'react'
import { dansLeDomaineDesSeries, type Site } from '../core/ephem.ts'
import { soleilLeve } from '../core/nuit.ts'
import { MS_PAR_MINUTE } from '../core/unites.ts'
import { siteChiffrable } from './app-calcul.ts'
import { useTrancheScene, type EtatScene } from './scene-etat.ts'
import { useInstantTrajet } from './trajet-scene.ts'

export function appliqueJourClair(clair: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.jourClair = String(clair)
}

/**
 * Site's Sun up at this instant; `null` = undecidable (unreadable site, date outside series).
 * Memoised per minute: loop publishes instant every frame, 2 sunrise searches/frame wasteful.
 */
export function lecteurJourClair(lieu: Site): (ms: number) => boolean | null {
  let minute: number | null = null
  let clair: boolean | null = null
  return (ms) => {
    const courante = Math.floor(ms / MS_PAR_MINUTE)
    if (courante === minute) return clair
    minute = courante
    const date = new Date(courante * MS_PAR_MINUTE)
    clair = siteChiffrable(lieu) && dansLeDomaineDesSeries(date) ? soleilLeve(lieu, date) : null
    return clair
  }
}

export function JourClair({ site }: { readonly site: Site }): null {
  const { latitudeDeg, longitudeDeg, altitudeM } = site
  const lit = useMemo(
    () => lecteurJourClair({ latitudeDeg, longitudeDeg, altitudeM }),
    [latitudeDeg, longitudeDeg, altitudeM],
  )
  const selecteur = useMemo(() => (etat: EtatScene) => lit(etat.msAffiche), [lit])
  // Boolean: outside trajet re-renders only at sunrise/sunset, not each minute.
  const clairScene = useTrancheScene(selecteur)
  const trajetMs = useInstantTrajet()
  const clair = trajetMs === null ? clairScene : lit(trajetMs)
  useEffect(() => {
    if (clair !== null) appliqueJourClair(clair)
  }, [clair])
  return null
}
