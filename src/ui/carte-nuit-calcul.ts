/**
 * §8.1 — ce que la carte « La nuit » pose sur sa frise : des positions en pourcentage de la
 * fenêtre vue, et les libellés qui vont avec. Les instants viennent de `friseCiel`, rien
 * n'est recalculé ici. La fenêtre vue est centrée sur l'instant : ce qui en sort n'est pas
 * posé, la frise défile.
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

/** Le nombre de l'heure, sans son suffixe : « 22 h » ne tient pas dans une graduation. */
const HEURE_SEULE = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', hourCycle: 'h23' })

/**
 * La phase se lit à son MOTIF, du plus dense au vide : §11.1 confisque la teinte, et la nuit
 * rouge n'a pas assez de luminance pour étager quatre gris.
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
 * Une graduation par heure ronde, les heures paires portent leur nombre : toutes étiquetées,
 * elles se touchaient. La parité tient à l'heure et non au rang : la frise défile, une
 * étiquette ne doit pas sauter d'une graduation à l'autre.
 */
export interface Repere {
  readonly cle: string
  readonly texte: string
  readonly position: string
  readonly majeur: boolean
  /**
   * T-0418 — le repère tombe dans le jour : son étiquette prend un aplat clair, encre sombre,
   * au lieu de l'aplat noir de la nuit et des crépuscules.
   */
  readonly jour: boolean
}

/**
 * Le disque de la Lune : quel côté est éclairé, et la largeur de l'ellipse du terminateur.
 * Croissante, la Lune est éclairée à droite dans l'hémisphère nord, à gauche dans le sud.
 * Le terminateur mesure |1 − 2k| du diamètre : nul au quartier, plein à la nouvelle et à la
 * pleine Lune. Il assombrit la moitié éclairée sous le quartier, éclaire l'autre au-delà.
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

/** L'instant (ms) d'une fraction de la fenêtre vue : ce que vise un clic ou un appui. */
export function instantFraction(vue: Intervalle, x: number): number {
  const debut = vue.debut.getTime()
  return debut + encadre(x, 0, 1) * (vue.fin.getTime() - debut)
}

/**
 * T-0419 — l'instant qu'amène sous le curseur un glisser de `dx` (fraction de la largeur) parti
 * de `departMs`. La frise défile sous un curseur fixe : on tire le ruban, le temps vient en sens
 * inverse du geste — vers la droite, le passé arrive.
 */
export function instantGlisse(vue: Intervalle, departMs: number, dx: number): number {
  return departMs - dx * (vue.fin.getTime() - vue.debut.getTime())
}

/** Les unités de `WheelEvent.deltaMode` (DOM) : constantes de la plate-forme, pas des réglages. */
export const WheelMode = Object.freeze({ PIXEL: 0, LIGNE: 1, PAGE: 2 } as const)

/**
 * T-0424 — le glisser (fraction de la largeur, sens de `instantGlisse`) qu'équivaut un
 * défilement, ou `null` s'il est surtout vertical : celui-là reste à la page. Défiler vers la
 * droite pousse le ruban vers la gauche — l'avenir arrive, comme un glisser vers la gauche.
 * Firefox compte la molette en lignes : on les convertit, sans quoi le pas serait d'un pixel.
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
 * T-0390 — où mène une touche sur la frise, ou `null` si elle ne la règle pas. La frise
 * défile avec l'instant : les flèches n'ont pas de butée, Début et Fin mènent aux bords de
 * la fenêtre vue.
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

/** Une fraction écrite pour le CSS (« 42.00% ») : une machine la relit, d'où le point. */
export function pourcentCss(fraction: number): string {
  return `${(fraction * POURCENT).toFixed(2)}%`
}

/** Les phases qui touchent la fenêtre vue ; ce qui déborde, la frise le rogne. */
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

/** Sans frise, aucun repère n'est dit de jour : l'aplat reste celui de la nuit. */
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

/** L'instant affiché sur la frise, ou `null` quand il tombe hors de la fenêtre vue. */
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
 * L'échelle verticale de la frise, commune au Soleil et à la Lune : le nadir en bas, le zénith
 * en haut, l'horizon au milieu. Le Soleil passe sous l'horizon toute la nuit, sa courbe doit
 * y descendre ; deux échelles dans une même bande se liraient l'une pour l'autre.
 */
export function hauteurFrise(hauteurDeg: number): number {
  return (hauteurDeg + ZENITH_DEG) / (2 * ZENITH_DEG)
}

/**
 * La courbe d'un astre en points SVG, dans un repère de 100 × 100 étiré sur la frise : les
 * abscisses sont des pourcentages de la fenêtre vue, les ordonnées descendent vers le bas.
 * Les points hors de la fenêtre restent : le tracé se rogne au bord au lieu de s'y arrêter.
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

export interface MarqueLune {
  readonly cle: string
  readonly position: string
  readonly fraction: number
  readonly texte: string
}

/** Les levers et couchers de la Lune tombés dans la fenêtre vue : un trait, et ce que l'aimant dit. */
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
 * L'aimant du survol : un pointeur à moins de `portee` (en fraction de la frise) d'un lever
 * ou d'un coucher de Lune s'y accroche. Sans lui, viser un trait d'un pixel à la souris — ou
 * au doigt — tenait du hasard. Le plus proche l'emporte quand deux traits se touchent.
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

/** La Lune de la fenêtre vue dite en une phrase : ses heures levées, et sa hauteur la plus grande. */
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

/** La phase à l'instant pointé : son sens et sa fraction éclairée, « Décroissante 93% ». */
export function libellePhaseLune(croissante: boolean, illumination: number): string {
  return `${croissante ? 'Croissante' : 'Décroissante'} ${pourcentage(illumination)}`
}

/**
 * La Lune à l'instant pointé, en une ligne : sa hauteur, ou sa profondeur sous l'horizon —
 * « 2° sous l'horizon » dit qu'elle va se lever, « 40° » qu'elle n'est pas près de le faire.
 * Au degré près, zéro se dit « à l'horizon » plutôt que « à 0° ».
 */
export function libelleLuneInstant(hauteurDeg: number): string {
  const degres = Math.abs(Math.round(hauteurDeg))
  if (degres === 0) return 'Lune à l’horizon'
  return hauteurDeg > 0 ? `Lune à ${degres}° de hauteur` : `Lune à ${degres}° sous l’horizon`
}
