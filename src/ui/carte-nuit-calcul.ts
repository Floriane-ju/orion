/**
 * §8.1 — ce que la carte « La nuit » pose sur sa frise : des positions en pourcentage de la
 * nuit, et les libellés qui vont avec. Les instants viennent de `friseNuit`, rien n'est
 * recalculé ici — la carte ne peut pas dater un crépuscule autrement que le plan.
 */

import type { FriseNuit, LuneDeLaNuit, PhaseCiel } from '../core/frise-nuit.ts'
import { MIN_PAR_H, MS_PAR_MINUTE, POURCENT } from '../core/unites.ts'
import { heure, LOCALE } from './horaire.ts'

const MS_PAR_H = MS_PAR_MINUTE * MIN_PAR_H
const ZENITH_DEG = 90

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
 * Une graduation par heure ronde, une sur deux porte son heure : toutes étiquetées, elles
 * se touchaient sur une nuit d'hiver de quatorze heures.
 */
export interface Repere {
  readonly cle: string
  readonly texte: string
  readonly position: string
  readonly majeur: boolean
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

/**
 * La Lune incrustée : à son heure en abscisse, à sa hauteur en ordonnée — l'horizon au bas
 * de la frise, le zénith en haut. Le disque porte sa phase, le halo son éclat.
 */
export interface IncrustationLune {
  readonly cle: string
  readonly position: string
  /** Fraction de la hauteur de la frise, sans unité : la feuille la multiplie. */
  readonly hauteur: string
  readonly eclat: string
  readonly disque: DisqueLune
}

function fraction(frise: FriseNuit, instant: Date): number {
  const duree = frise.fin.getTime() - frise.debut.getTime()
  return (instant.getTime() - frise.debut.getTime()) / duree
}

function pourcent(x: number): string {
  return `${(x * POURCENT).toFixed(2)}%`
}

export function bandesPhases(frise: FriseNuit): readonly BandePhase[] {
  return frise.segments.map((s) => {
    const a = fraction(frise, s.debut)
    return {
      cle: String(s.debut.getTime()),
      debut: pourcent(a),
      largeur: pourcent(fraction(frise, s.fin) - a),
      phase: s.phase,
    }
  })
}

export function reperesHeures(frise: FriseNuit): readonly Repere[] {
  const premiere = Math.ceil(frise.debut.getTime() / MS_PAR_H) * MS_PAR_H
  const reperes: Repere[] = []
  for (let t = premiere; t < frise.fin.getTime(); t += MS_PAR_H) {
    const instant = new Date(t)
    reperes.push({
      cle: String(t),
      texte: HEURE_SEULE.formatToParts(instant).find((p) => p.type === 'hour')?.value ?? '',
      position: pourcent(fraction(frise, instant)),
      majeur: reperes.length % 2 === 0,
    })
  }
  return reperes
}

/** L'instant affiché sur la frise, ou `null` quand il tombe hors de la nuit. */
export function curseurInstant(frise: FriseNuit, instant: Date): string | null {
  const x = fraction(frise, instant)
  return x < 0 || x > 1 ? null : pourcent(x)
}

export function disqueLune(
  lune: { readonly illumination: number; readonly croissante: boolean },
  latitudeDeg: number,
): DisqueLune {
  const k = lune.illumination
  return {
    eclaireADroite: lune.croissante === latitudeDeg >= 0,
    terminateur: pourcent(Math.abs(1 - 2 * k)),
    gibbeuse: k > 1 / 2,
  }
}

export function incrustationsLune(
  frise: FriseNuit,
  latitudeDeg: number,
): readonly IncrustationLune[] {
  // La Lune ne se pose que sous une graduation étiquetée : une par heure, les disques se
  // touchaient, et leurs halos se confondaient.
  const majeurs = new Set(reperesHeures(frise).filter((r) => r.majeur).map((r) => r.cle))
  return frise.lune.positions
    .filter((p) => majeurs.has(String(p.instant.getTime())))
    .map((p) => ({
      cle: String(p.instant.getTime()),
      position: pourcent(fraction(frise, p.instant)),
      hauteur: (p.hauteurDeg / ZENITH_DEG).toFixed(3),
      eclat: p.eclat.toFixed(2),
      disque: disqueLune(p, latitudeDeg),
    }))
}

export interface MarqueLune {
  readonly cle: string
  readonly position: string
  readonly fraction: number
  readonly texte: string
}

/** Les levers et couchers de la Lune tombés dans la frise : un trait, et ce que l'aimant dit. */
export function marquesLune(frise: FriseNuit): readonly MarqueLune[] {
  return frise.lune.evenements.map((e) => ({
    cle: String(e.instant.getTime()),
    position: pourcent(fraction(frise, e.instant)),
    fraction: fraction(frise, e.instant),
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

/** La Lune de la frise dite en une phrase : ses heures levées, et sa hauteur la plus grande. */
export function resumeLuneFrise(lune: LuneDeLaNuit): string {
  if (lune.levee.length === 0) return 'Lune couchée toute la nuit.'
  const plages = lune.levee.map((i) => `de ${heure(i.debut)} à ${heure(i.fin)}`).join(', ')
  const haute = Math.max(0, ...lune.positions.map((p) => p.hauteurDeg))
  return `Lune levée ${plages}, jusqu’à ${haute.toFixed(0)}° de hauteur.`
}

/** La phase à l'instant pointé : son sens et sa fraction éclairée, « Décroissante 93% ». */
export function libellePhaseLune(croissante: boolean, illumination: number): string {
  return `${croissante ? 'Croissante' : 'Décroissante'} ${(illumination * POURCENT).toFixed(0)}%`
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
