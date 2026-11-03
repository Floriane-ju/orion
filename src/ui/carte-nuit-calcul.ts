/**
 * §8.1 — what the "La nuit" card puts on its frise: positions as % of the viewed window + labels.
 * Instants come from `friseCiel`, nothing recomputed. Window centred on the instant: output isn't
 * placed, the frise scrolls.
 */

import type {
  FriseNuit,
  HauteurAstre,
  Intervalle,
  LuneDeLaNuit,
  PhaseCiel,
} from '../core/frise-nuit.ts'
import { degres, pourcentage } from '../registry/ecriture.ts'
import { encadre, MS_PAR_H, MS_PAR_MINUTE, POURCENT, QUART_TOUR_DEG as ZENITH_DEG } from '../core/unites.ts'
import { K } from '../registry/constants.ts'
import { heure, LOCALE } from './horaire.ts'

/** Hour number without suffix: "22 h" doesn't fit a tick. */
const HEURE_SEULE = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', hourCycle: 'h23' })

/**
 * Phase read by PATTERN, densest to empty: §11.1 confiscates hue, night red lacks luminance for
 * four greys.
 */
export const LIBELLE_PHASE_CIEL: Readonly<Record<PhaseCiel, string>> = Object.freeze({
  JOUR: 'Jour',
  CIVIL: 'Crépuscule civil',
  NAUTIQUE: 'Crépuscule nautique',
  ASTRONOMIQUE: 'Crépuscule astronomique',
  NUIT_NOIRE: 'Nuit noire',
})

export interface BandePhase {
  readonly cle: string
  readonly debut: string
  readonly largeur: string
  readonly phase: PhaseCiel
}

/**
 * One tick per round hour, even hours numbered (all labelled would touch). Parity by hour not
 * rank: frise scrolls, a label must not jump between ticks.
 */
export interface Repere {
  readonly cle: string
  readonly texte: string
  readonly position: string
  readonly majeur: boolean
  /** T-0418 — marker in daytime: label takes light fill + dark ink, not night/twilight black. */
  readonly jour: boolean
}

/**
 * Moon disc: lit side + terminator ellipse width. Waxing Moon lit on right in northern hemisphere,
 * left in south. Terminator = |1 − 2k| of diameter: zero at quarter, full at new/full Moon.
 * Darkens lit half below quarter, lights the other beyond.
 */
export interface DisqueLune {
  readonly eclaireADroite: boolean
  readonly terminateur: string
  readonly gibbeuse: boolean
}

function fraction(vue: Intervalle, instant: Date): number {
  const duree = vue.fin.getTime() - vue.debut.getTime()
  return (instant.getTime() - vue.debut.getTime()) / duree
}

function dansVue(vue: Intervalle, instant: Date): boolean {
  return instant >= vue.debut && instant <= vue.fin
}

/** Instant (ms) of a fraction of the viewed window: what a click or press aims at. */
export function instantFraction(vue: Intervalle, x: number): number {
  const debut = vue.debut.getTime()
  return debut + encadre(x, 0, 1) * (vue.fin.getTime() - debut)
}

/**
 * T-0419 — instant a drag of `dx` (fraction of width) from `departMs` puts under the cursor.
 * Frise scrolls under a fixed cursor: ribbon pulled, time comes opposite to the gesture (drag
 * right → past arrives).
 */
export function instantGlisse(vue: Intervalle, departMs: number, dx: number): number {
  return departMs - dx * (vue.fin.getTime() - vue.debut.getTime())
}

/** `WheelEvent.deltaMode` units (DOM): platform constants, not settings. */
export const WheelMode = Object.freeze({ PIXEL: 0, LIGNE: 1, PAGE: 2 } as const)

/**
 * T-0424 — drag (fraction of width, sense of `instantGlisse`) equivalent to a scroll, or `null`
 * if mostly vertical (stays with the page). Scroll right pushes ribbon left — future arrives, like
 * a left drag. Firefox counts wheel in lines: converted, else step = 1 px.
 */
export function glisseMolette(
  e: { readonly deltaX: number; readonly deltaY: number; readonly deltaMode: number },
  largeur: number,
  lignePx: number,
): number | null {
  if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return null
  const unite =
    e.deltaMode === WheelMode.LIGNE ? lignePx : e.deltaMode === WheelMode.PAGE ? largeur : 1
  return (-e.deltaX * unite) / largeur
}

/**
 * T-0390 — where a key leads on the frise, or `null` if not set by it. Frise scrolls with the
 * instant: arrows have no stop, Home/End go to window edges.
 */
export function instantClavier(vue: Intervalle, ms: number, touche: string): number | null {
  const pas = K('PAS_FRISE_CLAVIER_MIN') * MS_PAR_MINUTE
  switch (touche) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return ms - pas
    case 'ArrowRight':
    case 'ArrowUp':
      return ms + pas
    case 'Home':
      return vue.debut.getTime()
    case 'End':
      return vue.fin.getTime()
    default:
      return null
  }
}

/** Fraction written for CSS ("42.00%"): machine-read, hence the dot. */
export function pourcentCss(fraction: number): string {
  return `${(fraction * POURCENT).toFixed(2)}%`
}

/** Phases touching the viewed window; overflow is clipped by the frise. */
export function bandesPhases(frise: FriseNuit, vue: Intervalle): readonly BandePhase[] {
  return frise.segments
    .filter((s) => s.fin > vue.debut && s.debut < vue.fin)
    .map((s) => {
      const a = fraction(vue, s.debut)
      return {
        cle: String(s.debut.getTime()),
        debut: pourcentCss(a),
        largeur: pourcentCss(fraction(vue, s.fin) - a),
        phase: s.phase,
      }
    })
}

/** Without frise no marker is said daytime: fill stays night's. */
export function reperesHeures(vue: Intervalle, frise?: FriseNuit): readonly Repere[] {
  const premiere = Math.ceil(vue.debut.getTime() / MS_PAR_H) * MS_PAR_H
  const reperes: Repere[] = []
  for (let t = premiere; t <= vue.fin.getTime(); t += MS_PAR_H) {
    const instant = new Date(t)
    const texte = HEURE_SEULE.formatToParts(instant).find((p) => p.type === 'hour')?.value ?? ''
    const segment = frise?.segments.find((s) => s.debut.getTime() <= t && t < s.fin.getTime())
    reperes.push({
      cle: String(t),
      texte,
      position: pourcentCss(fraction(vue, instant)),
      majeur: Number(texte) % 2 === 0,
      jour: segment?.phase === 'JOUR',
    })
  }
  return reperes
}

/**
 * Horizon dash step as frise fractions: one hour, and place of first full hour. Dashes hooked to
 * hours scroll with them; a fixed screen step stayed still under a sliding sky.
 */
export function tiretsHorizon(vue: Intervalle): { readonly heure: number; readonly premiere: number } {
  const duree = vue.fin.getTime() - vue.debut.getTime()
  const premiere = Math.ceil(vue.debut.getTime() / MS_PAR_H) * MS_PAR_H
  return { heure: MS_PAR_H / duree, premiere: fraction(vue, new Date(premiere)) }
}

/** Instant shown on the frise, or `null` when outside the viewed window. */
export function curseurInstant(vue: Intervalle, instant: Date): string | null {
  return dansVue(vue, instant) ? pourcentCss(fraction(vue, instant)) : null
}

export function disqueLune(
  lune: { readonly illumination: number; readonly croissante: boolean },
  latitudeDeg: number,
): DisqueLune {
  const k = lune.illumination
  return {
    eclaireADroite: lune.croissante === latitudeDeg >= 0,
    terminateur: pourcentCss(Math.abs(1 - 2 * k)),
    gibbeuse: k > 1 / 2,
  }
}

/**
 * Frise vertical scale, shared by Sun and Moon: nadir bottom, zenith top, horizon middle. Sun
 * stays below horizon all night, curve must go down there; two scales in one band would be read
 * for each other.
 */
export function hauteurFrise(hauteurDeg: number): number {
  return (hauteurDeg + ZENITH_DEG) / (2 * ZENITH_DEG)
}

/**
 * Body curve as SVG points in a 100 × 100 frame stretched over the frise: x = % of viewed window,
 * y goes down. Points outside the window stay: stroke clipped at the edge, not stopped.
 */
export function pointsCourbe(hauteurs: readonly HauteurAstre[], vue: Intervalle): string {
  return hauteurs
    .map((p) => {
      const x = fraction(vue, p.instant) * POURCENT
      const y = (1 - hauteurFrise(p.hauteurDeg)) * POURCENT
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

/**
 * Body altitude at `instant`, read on its sampled curve: cursor dot must fall ON the stroke, not
 * on an ephemeris calcul drifting between samples. `null` off the curve.
 */
export function hauteurSurCourbe(hauteurs: readonly HauteurAstre[], instant: Date): number | null {
  const t = instant.getTime()
  const apres = hauteurs.findIndex((p) => p.instant.getTime() >= t)
  if (apres <= 0) return apres === 0 && hauteurs[0]!.instant.getTime() === t ? hauteurs[0]!.hauteurDeg : null
  const a = hauteurs[apres - 1]!
  const b = hauteurs[apres]!
  const k = (t - a.instant.getTime()) / (b.instant.getTime() - a.instant.getTime())
  return a.hauteurDeg + (b.hauteurDeg - a.hauteurDeg) * k
}

/** CSS ordinate of an altitude in the frise, from top: `pointsCourbe` frame. */
export function ordonneeFrise(hauteurDeg: number): string {
  return pourcentCss(1 - hauteurFrise(hauteurDeg))
}

export interface MarqueLune {
  readonly cle: string
  readonly position: string
  readonly fraction: number
  readonly texte: string
}

/** Moon rises and sets inside the viewed window: a stroke, and what the magnet says. */
export function marquesLune(frise: FriseNuit, vue: Intervalle): readonly MarqueLune[] {
  return frise.lune.evenements
    .filter((e) => dansVue(vue, e.instant))
    .map((e) => ({
      cle: String(e.instant.getTime()),
      position: pourcentCss(fraction(vue, e.instant)),
      fraction: fraction(vue, e.instant),
      texte: e.sens === 'LEVER' ? 'Lever de lune' : 'Coucher de lune',
    }))
}

/**
 * Hover magnet: pointer within `portee` (fraction of frise) of a Moon rise/set snaps to it.
 * Without: aiming a 1 px stroke with mouse/finger was luck. Nearest wins when two touch.
 */
export function aimante(
  pointeur: number,
  marques: readonly MarqueLune[],
  portee: number,
): { readonly fraction: number; readonly marque: MarqueLune | null } {
  const proche = marques
    .map((m) => ({ m, ecart: Math.abs(m.fraction - pointeur) }))
    .filter(({ ecart }) => ecart <= portee)
    .sort((a, b) => a.ecart - b.ecart)[0]
  return proche === undefined
    ? { fraction: pointeur, marque: null }
    : { fraction: proche.m.fraction, marque: proche.m }
}

/** Viewed-window Moon in one sentence: rise hours and highest altitude. */
export function resumeLuneFrise(lune: LuneDeLaNuit, vue: Intervalle): string {
  const levee = lune.levee
    .filter((i) => i.fin > vue.debut && i.debut < vue.fin)
    .map((i) => ({
      debut: i.debut < vue.debut ? vue.debut : i.debut,
      fin: i.fin > vue.fin ? vue.fin : i.fin,
    }))
  if (levee.length === 0) return 'Lune couchée.'
  const plages = levee.map((i) => `de ${heure(i.debut)} à ${heure(i.fin)}`).join(', ')
  const haute = Math.max(0, ...lune.hauteurs.filter((p) => dansVue(vue, p.instant)).map((p) => p.hauteurDeg))
  return `Lune levée ${plages}, jusqu’à ${degres(haute)} de hauteur.`
}

/** Phase at pointed instant: sense and lit fraction, "Décroissante 93%". */
export function libellePhaseLune(croissante: boolean, illumination: number): string {
  return `${croissante ? 'Croissante' : 'Décroissante'} ${pourcentage(illumination)}`
}

/**
 * Moon at pointed instant, one line: altitude or depth below horizon — "2° sous l'horizon" = will
 * rise, "40°" = not near. To the degree; zero reads "à l'horizon", not "à 0°".
 */
export function libelleLuneInstant(hauteurDeg: number): string {
  const degres = Math.abs(Math.round(hauteurDeg))
  if (degres === 0) return 'Lune à l’horizon'
  return hauteurDeg > 0 ? `Lune à ${degres}° de hauteur` : `Lune à ${degres}° sous l’horizon`
}
