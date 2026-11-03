/**
 * §11.3, T-0153 — sentence saying where scène points: visée, cap, champ.
 * Held centre of a bottom bar also carrying lieu + legend. Bar unmounted: sentence + legend →
 * top bar, lieu → "Site" card on scène. Sentence still read without a click.
 * T-0163 — no longer dates image (time panel carries same instant, settable); keeps visée, cap,
 * champ; its 5 numbers drag horizontally.
 * T-0411 — top bar carries time: sentence → bottom-left of scène, where frise was.
 * T-0414 — time → bottom-centre: sentence → top-right of scène, against séance panel.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { Site } from '../core/ephem.ts'
import { cielInstantane } from '../core/horloges.ts'
import { bornesZoom } from '../core/projection.ts'
import { Compteur } from './Compteur.tsx'
import { HAUTEUR_MAX_DEG, HAUTEUR_MIN_DEG } from './planetarium-gestes.ts'
import { majVue, useScene } from './scene-etat.ts'
import {
  courtVisee,
  segmentsVisee,
  viseeVersVue,
  type ChampVisee,
  type SegmentVisee,
} from './scene-lecture.ts'
import { TOUR_DEG, ramene } from '../core/unites.ts'


/**
 * T-0163 — what one drag notch adds to each reading. GESTURE step, not model's: visée to 0.1°,
 * cap to the degree. Both visée angles keep finest step — set on a cible.
 */
const PAS_VISEE: Readonly<Record<ChampVisee, number>> = Object.freeze({
  AD: 0.1,
  DEC: 0.1,
  AZIMUT: 1,
  HAUTEUR: 0.5,
  FOV: 0.5,
  ROTATION: 1,
})

/**
 * T-0153 — separate component, not one more bar line: scène store republishes instant 2×/s,
 * subscribing from `BarreHaut` would render its tiroirs at that rate (T-0056). Here it costs
 * only this sentence.
 */
export function Visee(props: { readonly site: Site; readonly gaiaCharge: boolean }) {
  const { vue, msAffiche } = useScene()
  const date = useMemo(() => new Date(msAffiche), [msAffiche])
  const ciel = useMemo(() => cielInstantane(props.site, date), [props.site, date])
  const segments = segmentsVisee(vue, ciel.matrice)
  const bornes = bornesZoom(props.gaiaCharge, vue.mode)
  const cadre = useHauteurPubliee()

  /**
   * The 5 numbers are scène INPUTS. 3 direct; AD and δ go through visée reciprocal: horizontal
   * pointage of the requested equatorial direction at displayed instant.
   */
  function regle(champ: ChampVisee, valeur: number): void {
    const [ad, dec] = [segments[0]!.valeurDeg, segments[1]!.valeurDeg]
    if (champ === 'AD') return majVue(viseeVersVue(valeur, dec, ciel.matrice))
    if (champ === 'DEC') return majVue(viseeVersVue(ad, valeur, ciel.matrice))
    if (champ === 'AZIMUT') return majVue({ azimutDeg: ramene(valeur, TOUR_DEG) })
    if (champ === 'HAUTEUR') return majVue({ hauteurDeg: valeur })
    if (champ === 'ROTATION') return majVue({ rotationCadreDeg: valeur })
    // Cap reset by store; floor depends on loaded paquet.
    majVue({ fovDeg: valeur })
  }

  /** Azimut and AD wrap: bounding them would stop the gesture at north. */
  function encadrement(champ: ChampVisee): { readonly min?: number; readonly max?: number } {
    if (champ === 'DEC' || champ === 'HAUTEUR') {
      return { min: HAUTEUR_MIN_DEG, max: HAUTEUR_MAX_DEG }
    }
    if (champ === 'FOV') return { min: bornes.fovMinDeg, max: bornes.fovMaxDeg }
    if (champ === 'ROTATION') return { min: 0, max: TOUR_DEG }
    return {}
  }

  /**
   * Field width = longest value's, read at both ends of its travel: resizing under the finger
   * shifts neighbours while aimed at. AD and azimut unbounded (wrap) → travel = full turn.
   */
  function largeur(champ: ChampVisee): number {
    const { min = 0, max = TOUR_DEG } = encadrement(champ)
    return Math.max(courtVisee(champ, min).length, courtVisee(champ, max).length)
  }

  // Six prefixed fields, not a sentence: each dragged or typed, prefix says what it sets.
  // Full sentence stays canvas's (`ligneVisee`), which announces it.
  const compteur = (segment: SegmentVisee) => (
    <Compteur
      key={segment.champ}
      libelle={segment.libelle}
      prefixe={segment.prefixe}
      valeur={segment.valeurDeg}
      texte={segment.court}
      largeur={largeur(segment.champ)}
      pas={PAS_VISEE[segment.champ]}
      {...encadrement(segment.champ)}
      sur={(valeur) => regle(segment.champ, valeur)}
    />
  )

  // T-0163 — sentence no longer dates image: bar carries same instant, two clocks contradict to
  // the second.
  return (
    <div ref={cadre} className="coque-visee">
      {segments.map(compteur)}
    </div>
  )
}

/**
 * T-0414 — matériel cards go under visée: both share scène top-right, visée has a height the
 * stylesheet doesn't know (narrow window wraps fields). Publishes it on root, where column reads
 * it; unmounted, reserves nothing.
 */
function useHauteurPubliee() {
  const cadre = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const element = cadre.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const racine = document.documentElement
    const observateur = new ResizeObserver(() => {
      racine.style.setProperty('--visee-haut', `${element.offsetHeight}px`)
    })
    observateur.observe(element)
    return () => {
      observateur.disconnect()
      racine.style.removeProperty('--visee-haut')
    }
  }, [])
  return cadre
}
