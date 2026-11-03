/**
 * §8.2 — observation créneau per cible.
 *
 * Interval where a cible is simultaneously high enough, clear of relief, inside the nocturnal
 * window. 3 product rules:
 *   1. A DISCARDED CIBLE NAMES ITS CAUSE. `causeExclusion` isn't technical data: unexplained
 *      rejection = first source of distrust.
 *   2. RELIEF NAMED AS SUCH: cible behind a ridge isn't "too low"; the mask says so.
 *   3. A GERMAN EQUATORIAL MOUNT SPLITS THE CRÉNEAU AT THE MERIDIAN: tube hits pier →
 *      interruption mandatory, sensor orientation flips 180°.
 *
 * Catalogue coordinates J2000: precession moves a cible < 0,5° over catalogue lifetime, no
 * effect on a quarter-hour créneau.
 */

import { Horizon } from 'astronomy-engine'
import { degres, dureeMinLisible, nombreLibre } from '../registry/ecriture.ts'
import { K } from '../registry/constants.ts'
import type { TypeMonture } from './suivi.ts'
import type { Site } from './ephem.ts'
import { observateur } from './ephem.ts'
import type { MasqueHorizon } from './site.ts'
import {
  altitudeCulmination,
  latitudeAccessibleDeg,
  masseAir,
  masseAirBrute,
  obstructionDeg,
} from './site.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { MS_PAR_MINUTE, QUART_TOUR_DEG as ANGLE_DROIT_DEG } from './unites.ts'

export type CauseExclusion = 'HAUTEUR' | 'RELIEF' | 'LUNE' | 'HORS_FENETRE' | 'JAMAIS_LEVE'

export interface Intervalle {
  readonly debut: Date
  readonly fin: Date
}

export interface SousCreneau extends Intervalle {
  readonly dureeMin: number
  /** True for the portion after a GEM meridian flip. */
  readonly apresRetournement: boolean
}

export interface EntreeCreneau {
  readonly site: Site
  /** Right ascension in hours, déclinaison in degrees, catalogue coordinates. */
  readonly adH: number
  readonly decDeg: number
  readonly fenetre: Intervalle
  readonly masque: MasqueHorizon
  readonly seuilHauteurDeg?: number
  readonly typeMonture: TypeMonture
}

/**
 * T-0268 — hauteur of `masseAirMin` and the instant carrying it, in the SAME object. Read
 * separately (`masseAirMin` vs `heureCulmination`) they describe different events: time from
 * whole window, hauteur from samples passing threshold + relief only → screen announced a
 * hauteur at a time the cible doesn't reach. `instant` `null` when no sample passes: hauteur =
 * geometric culmination, unseen that night; no time to name, and it says so.
 */
export interface PlusHautDuCreneau {
  readonly altitudeDeg: number
  readonly instant: Date | null
}

export interface CreneauCible {
  readonly altCulminationDeg: Traced<number>
  readonly heureCulmination: Date | null
  readonly creneaux: readonly SousCreneau[]
  readonly dureeTotaleMin: Traced<number>
  readonly masseAirMin: Traced<number | null>
  /** T-0268 — hauteur priced by `masseAirMin`, with the instant it is reached. */
  readonly plusHaut: PlusHautDuCreneau
  /**
   * §7.6 — mean masse d'air over créneau, the one dosing flux extinction. `masseAirMin` = night's
   * best instant; the mean prices what capture pays.
   */
  readonly masseAirMoyenne: Traced<number | null>
  readonly circumpolaire: boolean
  readonly retournementMeridien: boolean
  readonly causeExclusion?: CauseExclusion
  readonly message: string
  /** Latitude below which the cible would become accessible, when hauteur excludes it. */
  readonly latitudeAccessibleDeg?: number
}

interface Echantillon {
  readonly instant: Date
  readonly altitudeDeg: number
  readonly azimutDeg: number
}

function echantillonne(entree: EntreeCreneau): readonly Echantillon[] {
  const obs = observateur(entree.site)
  const echantillons: Echantillon[] = []
  for (
    let t = entree.fenetre.debut.getTime();
    t <= entree.fenetre.fin.getTime();
    t += MS_PAR_MINUTE
  ) {
    const instant = new Date(t)
    const hz = Horizon(instant, obs, entree.adH, entree.decDeg, 'normal')
    echantillons.push({ instant, altitudeDeg: hz.altitude, azimutDeg: hz.azimuth })
  }
  return echantillons
}

function dureeMinutes(debut: Date, fin: Date): number {
  return (fin.getTime() - debut.getTime()) / MS_PAR_MINUTE
}

/** Splits visible-sample sequence into contiguous intervals, then at meridian when mount flips. */
function assembleCreneaux(
  visibles: readonly Echantillon[],
  culmination: Date | null,
  scindeAuMeridien: boolean,
): readonly SousCreneau[] {
  const creneaux: SousCreneau[] = []
  let debut: Echantillon | null = null
  let precedent: Echantillon | null = null

  const pousse = (a: Date, b: Date, apresRetournement: boolean): void => {
    if (b.getTime() > a.getTime()) {
      creneaux.push({ debut: a, fin: b, dureeMin: dureeMinutes(a, b), apresRetournement })
    }
  }

  const cloture = (): void => {
    if (debut === null || precedent === null) return
    const coupe =
      scindeAuMeridien &&
      culmination !== null &&
      culmination.getTime() > debut.instant.getTime() &&
      culmination.getTime() < precedent.instant.getTime()
    if (coupe && culmination !== null) {
      pousse(debut.instant, culmination, false)
      pousse(culmination, precedent.instant, true)
    } else {
      pousse(debut.instant, precedent.instant, false)
    }
    debut = null
  }

  for (const echantillon of visibles) {
    if (
      precedent !== null &&
      echantillon.instant.getTime() - precedent.instant.getTime() > MS_PAR_MINUTE
    ) {
      cloture()
    }
    debut ??= echantillon
    precedent = echantillon
  }
  cloture()
  return creneaux
}

/**
 * §7.6 — mean masse d'air of créneau samples. Mean, not culmination: a cible spends part of its
 * créneau lower, extinction is paid over whole capture; culmination announces best case as valid
 * all night. `null` once a sample leaves the plane-approximation domain: mean with false terms
 * is false, nothing extrapolated (§7.6 hard bound).
 */
function masseAirMoyenneCreneau(visibles: readonly Echantillon[]): Traced<number | null> {
  const altitudes = visibles.map((e) => e.altitudeDeg)
  const altMin = altitudes.length === 0 ? 0 : Math.min(...altitudes)
  // Both extreme hauteurs enter the trace: mean without bounds = orphan number, §7.6 requires
  // hauteur next to masse d'air.
  const inputs = {
    n_echantillons: visibles.length,
    alt_min_deg: altMin,
    alt_max_deg: altitudes.length === 0 ? 0 : Math.max(...altitudes),
  }

  if (altitudes.length === 0) {
    return trace({
      value: null,
      formula: 'MASSE_AIR_MOYENNE',
      inputs,
      flags: ['DONNEE_MANQUANTE'],
      note: 'Cible jamais visible dans ce créneau.',
    })
  }
  if (altMin < K('HAUTEUR_MIN_MASSE_AIR_DEG')) {
    return trace({
      value: null,
      formula: 'MASSE_AIR_MOYENNE',
      inputs,
      constants: ['HAUTEUR_MIN_MASSE_AIR_DEG'],
      flags: ['HORS_DOMAINE'],
      note:
        `La cible descend à ${degres(altMin, 1)} : trop basse pour chiffrer la masse d’air.`,
    })
  }
  const somme = altitudes.reduce((total, alt) => total + masseAirBrute(alt), 0)
  return trace({
    value: somme / altitudes.length,
    formula: 'MASSE_AIR_MOYENNE',
    inputs,
  })
}

export function creneauCible(entree: EntreeCreneau): CreneauCible {
  const seuil = entree.seuilHauteurDeg ?? K('SEUIL_HAUTEUR_IMAGERIE_DEG')
  const latitude = entree.site.latitudeDeg
  const altCulmination = altitudeCulmination(latitude, entree.decDeg)
  const circumpolaire = entree.decDeg > ANGLE_DROIT_DEG - Math.abs(latitude)
  const neSeLevePas = entree.decDeg < latitude - ANGLE_DROIT_DEG
  const retournementMeridien = entree.typeMonture === 'GEM'

  const echantillons = echantillonne(entree)
  const culminant = echantillons.reduce<Echantillon | null>(
    (meilleur, e) => (meilleur === null || e.altitudeDeg > meilleur.altitudeDeg ? e : meilleur),
    null,
  )
  const heureCulmination =
    culminant === null ||
    culminant.instant.getTime() === entree.fenetre.debut.getTime() ||
    culminant.instant.getTime() === entree.fenetre.fin.getTime()
      ? null
      : culminant.instant

  const assezHaut = echantillons.filter((e) => e.altitudeDeg > seuil)
  const visibles = assezHaut.filter(
    (e) => e.altitudeDeg > obstructionDeg(entree.masque, e.azimutDeg),
  )
  const creneaux = assembleCreneaux(visibles, heureCulmination, retournementMeridien)
  const dureeTotale = creneaux.reduce((somme, c) => somme + c.dureeMin, 0)
  // T-0268 — highest créneau sample kept WHOLE (hauteur + instant): split, a caller could pair
  // that hauteur with another time.
  const culminantVisible = visibles.reduce<Echantillon | null>(
    (meilleur, e) => (meilleur === null || e.altitudeDeg > meilleur.altitudeDeg ? e : meilleur),
    null,
  )
  const plusHaut: PlusHautDuCreneau = {
    altitudeDeg: culminantVisible?.altitudeDeg ?? altCulmination.value,
    instant: culminantVisible?.instant ?? null,
  }

  const commun = {
    altCulminationDeg: altCulmination,
    heureCulmination,
    creneaux,
    dureeTotaleMin: trace({
      value: dureeTotale,
      formula: 'DUREE_CRENEAU',
      inputs: { seuil_hauteur_deg: seuil, alt_culmination_deg: altCulmination.value },
      constants: entree.seuilHauteurDeg === undefined ? ['SEUIL_HAUTEUR_IMAGERIE_DEG'] : [],
    }),
    masseAirMin: masseAir(plusHaut.altitudeDeg),
    plusHaut,
    masseAirMoyenne: masseAirMoyenneCreneau(visibles),
    circumpolaire,
    retournementMeridien: retournementMeridien && creneaux.some((c) => c.apresRetournement),
  }

  if (neSeLevePas) {
    return {
      ...commun,
      causeExclusion: 'JAMAIS_LEVE',
      message:
        'Cette cible ne se lève jamais depuis ce lieu.',
    }
  }

  if (altCulmination.value <= seuil) {
    const latitudeAccessible = latitudeAccessibleDeg(entree.decDeg, seuil)
    return {
      ...commun,
      causeExclusion: 'HAUTEUR',
      latitudeAccessibleDeg: latitudeAccessible,
      message:
        `La cible ne monte pas au-delà de ${degres(altCulmination.value, 1)} d’ici : trop ` +
        `basse, il faut au moins ${seuil}°.`,
    }
  }

  if (assezHaut.length === 0) {
    return {
      ...commun,
      causeExclusion: 'HORS_FENETRE',
      message:
        'La cible passe haut, mais de jour à cette date. Essayez une autre saison.',
    }
  }

  if (visibles.length === 0) {
    const azimuts = assezHaut.map((e) => Math.round(e.azimutDeg))
    const azimutBloquant = azimuts[Math.floor(azimuts.length / 2)] ?? 0
    return {
      ...commun,
      causeExclusion: 'RELIEF',
      message:
        `Cachée par le relief (${degres(obstructionDeg(entree.masque, azimutBloquant), 0)} ` +
        `de haut vers l’azimut ${nombreLibre(azimutBloquant)}°).`,
    }
  }

  return {
    ...commun,
    message:
      `Créneau de ${dureeMinLisible(dureeTotale)} au-dessus de ${seuil}°` +
      (circumpolaire ? ', ne se couche jamais' : '') +
      (commun.retournementMeridien
        ? '. Retournement au méridien en cours de route : recadrer, puis relancer la séquence.'
        : '.'),
  }
}
