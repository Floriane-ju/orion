/**
 * §3.2 / T-0411 — date, time and night frise are one setting, in the top bar.
 * T-0314 held the instant in a right-column panel, frise bottom-left (two places, not read as
 * linked). Now one row: clock, frise whose cursor IS that instant, return to present.
 * Dragging a counter scrolls the frise; clicking the frise changes the clock.
 * Transport removed (play, pause, 4 chevrons): product choice. Time set by dragging counters,
 * on the frise, or returning to present (also restores real flow). No fast-forward control.
 * T-0412 — row became a block over the sky, top-centre: clock + reading (phase, Lune), frise
 * full height, return to present as a square.
 * No `useScene()` here. Store publishes rendered instant 2×/s; subscribing whole would
 * re-render the bar at that rate (T-0056). Only the two clock pieces subscribe, per MINUTE.
 */

import { useRef, type ReactNode } from 'react'
import { nuitDeLInstant } from '../core/nuit-datee.ts'
import {
  dateAvec,
  LARGEURS_INSTANT,
  partiesHeure,
  partiesJour,
  type ChampInstant,
} from './horaire.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { Compteur } from './Compteur.tsx'
import { etatScene, majTemps, minuteAffichee, useTrancheScene, vaA } from './scene-etat.ts'
import { MS_PAR_MINUTE } from '../core/unites.ts'
import { DOMAINES } from '../registry/domains.ts'
import { destinationTrajet, traverse } from './trajet-scene.ts'

export interface PanneauTempsProps {
  /**
   * The plan's night follows the chosen instant: one date on screen.
   * T-0267 — the night's EVENING date, not the civil day: clock back to 00:30 stays in the
   * observed night instead of announcing the next.
   */
  readonly surNuitIso: (v: string) => void
  /** Night frise, after clock, return-to-present and astre; absent without sky. */
  readonly frise?: ReactNode
  /** Astre of the instant (Soleil or Lune), in its box before the frise; absent without sky. */
  readonly lecture?: ReactNode
}

export function PanneauTemps(props: PanneauTempsProps) {
  return (
    <section className="panneau-temps" role="region" aria-label="Temps de la scène">
      {/* Time above date, return to present, astre of the instant, then the frise extending
          them: four touching boxes. */}
      <div className="panneau-temps-date">
        <Heure surNuitIso={props.surNuitIso} />
        <Jour surNuitIso={props.surNuitIso} />
      </div>
      <BoutonMaintenant surNuitIso={props.surNuitIso} />
      {props.lecture !== undefined && <div className="panneau-temps-astre">{props.lecture}</div>}
      {props.frise}
    </section>
  )
}

/** One drag notch = one field unit: a day, a month, a second. */
const PAS_INSTANT = 1

/** T-0162 — instant pieces the drag sets, and the name they announce. */
const CHAMPS_INSTANT: Partial<
  Record<Intl.DateTimeFormatPartTypes, { readonly champ: ChampInstant; readonly libelle: string }>
> = {
  day: { champ: 'jour', libelle: 'Jour' },
  month: { champ: 'mois', libelle: 'Mois' },
  year: { champ: 'annee', libelle: 'Année' },
  hour: { champ: 'heure', libelle: 'Heure' },
  minute: { champ: 'minute', libelle: 'Minute' },
  second: { champ: 'seconde', libelle: 'Seconde' },
}

/** Month made human (1-12): that is what the counter announces. */
function valeurChamp(date: Date, champ: ChampInstant): number {
  if (champ === 'annee') return date.getFullYear()
  if (champ === 'mois') return date.getMonth() + 1
  if (champ === 'jour') return date.getDate()
  if (champ === 'heure') return date.getHours()
  if (champ === 'minute') return date.getMinutes()
  return date.getSeconds()
}

/**
 * Counters of an instant piece — same gesture for date and time.
 * T-0162 — each piece dragged horizontally (§11.2): advancing a day no longer means opening a
 * field, aiming its sub-field, closing it.
 * `depart` freezes the instant AT GESTURE START, else dragging months from a 31st re-reads an
 * already-shifted date each move and the day drifts.
 * Minute subscription lives in the piece showing it, not the panel: frise and return-to-present
 * need no redraw per beat (T-0056).
 */
function useCompteurs(props: PanneauTempsProps): {
  readonly date: Date
  readonly compteurs: (parties: readonly Intl.DateTimeFormatPart[]) => readonly ReactNode[]
} {
  const minute = useTrancheScene(minuteAffichee)
  const depart = useRef<Date | null>(null)
  // T-0394 — during a trajet, the requested instant, not the one the sky is crossing.
  const date = new Date(destinationTrajet() ?? minute * MS_PAR_MINUTE)

  /**
   * T-0292 — night follows the instant, but not each drag notch: changing night recomputes the
   * séance sky, and days chain one per notch. Sky + clock follow the gesture; night is set on
   * release (`soldeNuit`).
   * T-0394 — typed input or arrow CROSSES time to the requested instant in a FORCED trajet,
   * §3.2 cap ignored: a day change must be seen (product choice). Night set on the
   * DESTINATION, not the instant the trajet crosses.
   * Drag jumps: sky follows the finger instantly. A trajet restarted per notch repainted and
   * recomputed the scène endlessly, gesture lagged.
   */
  function va(champ: ChampInstant, valeur: number, enGlisse = false): void {
    const cible = dateAvec(depart.current ?? date, champ, valeur).getTime()
    if (enGlisse) return vaA(cible)
    traverse(cible, undefined, { force: true })
    soldeNuit()
  }

  function soldeNuit(): void {
    const ms = destinationTrajet() ?? etatScene().msAffiche
    props.surNuitIso(nuitDeLInstant(new Date(ms)))
  }

  /** Locale literals stay text: only numbers become counters. */
  function compteurs(parties: readonly Intl.DateTimeFormatPart[]): readonly ReactNode[] {
    return parties.map((partie, place) => {
      const reglage = CHAMPS_INSTANT[partie.type]
      if (reglage === undefined) return partie.value
      const champ = reglage.champ
      return (
        <Compteur
          key={place}
          libelle={reglage.libelle}
          valeur={valeurChamp(date, champ)}
          texte={partie.value}
          {...(LARGEURS_INSTANT[partie.type] === undefined
            ? {}
            : { largeur: LARGEURS_INSTANT[partie.type] })}
          pas={PAS_INSTANT}
          {...(champ === 'annee'
            ? { min: DOMAINES.annee_affichee.min, max: DOMAINES.annee_affichee.max }
            : {})}
          sur={(valeur, enGlisse) => va(champ, valeur, enGlisse)}
          surFin={soldeNuit}
          surDebut={() => {
            depart.current = date
          }}
        />
      )
    })
  }

  return { date, compteurs }
}

/** Day in digits, under the time. Weekday gone (T-0327): see `partiesJour`. */
function Jour(props: PanneauTempsProps) {
  const { date, compteurs } = useCompteurs(props)
  return <span className="panneau-temps-jour">{compteurs(partiesJour(date))}</span>
}

/** Time to the minute, fields same size as the date's (T-0327). */
function Heure(props: PanneauTempsProps) {
  const { date, compteurs } = useCompteurs(props)
  return <span className="panneau-temps-heure">{compteurs(partiesHeure(date))}</span>
}

/**
 * §3.2 — back to present instant, time restored to real flow, one gesture.
 * Without it, finding tonight from a chosen date meant dragging six counters to the current
 * time — a setting to aim where there is only a destination.
 */
function BoutonMaintenant(props: PanneauTempsProps) {
  function maintenant(): void {
    const present = new Date()
    // T-0394 — return is crossed, then time resumes on system clock, zero offset: trajet took
    // 1-2 s, playback resumes at the present instant, not the click's.
    traverse(present.getTime(), () => majTemps({ modeTemps: 'MAINTENANT', decalageMs: 0 }), {
      force: true,
    })
    props.surNuitIso(nuitDeLInstant(present))
  }

  return (
    <BoutonGlyphe
      icone="history"
      aide="Revenir à maintenant"
      variante="nu"
      classe="panneau-temps-maintenant"
      onClick={maintenant}
    />
  )
}
