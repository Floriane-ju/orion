/**
 * §8.2 — Créneau d'observation par cible.
 *
 * L'intervalle où une cible est simultanément assez haute, hors relief et dans la fenêtre
 * nocturne. Trois exigences produit sont câblées ici :
 *
 *   1. UNE CIBLE ÉCARTÉE NOMME SA CAUSE. `causeExclusion` n'est pas une donnée technique :
 *      une cible rejetée sans motif est la première source de méfiance envers l'application.
 *   2. LE RELIEF EST NOMMÉ COMME TEL. Une cible bloquée par une crête n'est pas « trop
 *      basse » : elle est derrière le relief, et le masque le dit.
 *   3. UNE MONTURE ÉQUATORIALE ALLEMANDE SCINDE LE CRÉNEAU AU MÉRIDIEN. Le tube heurte le
 *      pied : l'interruption est obligatoire, et l'orientation du capteur bascule de 180°.
 *
 * Les coordonnées du catalogue sont J2000 : la précession déplace une cible de moins d'un
 * demi-degré sur la durée de vie du catalogue, sans effet sur un créneau au quart d'heure.
 */

import { Horizon } from 'astronomy-engine'
import { K } from '../registry/constants.ts'
import type { TypeMonture } from './tracking.ts'
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
import { MS_PAR_MINUTE } from './unites.ts'

const ANGLE_DROIT_DEG = 90

export type CauseExclusion = 'HAUTEUR' | 'RELIEF' | 'LUNE' | 'HORS_FENETRE' | 'JAMAIS_LEVE'

export interface Intervalle {
  readonly debut: Date
  readonly fin: Date
}

export interface SousCreneau extends Intervalle {
  readonly dureeMin: number
  /** Vrai pour la portion suivant le retournement au méridien d'une monture GEM. */
  readonly apresRetournement: boolean
}

export interface EntreeCreneau {
  readonly site: Site
  /** Ascension droite en heures et déclinaison en degrés, coordonnées du catalogue. */
  readonly adH: number
  readonly decDeg: number
  readonly fenetre: Intervalle
  readonly masque: MasqueHorizon
  readonly seuilHauteurDeg?: number
  readonly typeMonture: TypeMonture
}

/**
 * T-0268 — la hauteur de `masseAirMin` et l'instant qui la porte, dans le MÊME objet.
 *
 * Les deux se lisaient séparément — `masseAirMin` d'un côté, `heureCulmination` de l'autre —
 * et ne décrivent pas le même événement : l'heure sort de la fenêtre entière, la hauteur des
 * seuls échantillons que le seuil et le relief laissent passer. Un écran qui les assemblait
 * annonçait une hauteur à une heure où la cible ne l'atteint pas.
 *
 * `instant` est `null` quand aucun échantillon ne passe : la hauteur vaut alors la culmination
 * géométrique, que cette nuit-là ne voit pas. Il n'y a pas d'heure à nommer, et c'est dit ainsi.
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
  /** T-0268 — la hauteur que `masseAirMin` chiffre, avec l'instant auquel elle est atteinte. */
  readonly plusHaut: PlusHautDuCreneau
  /**
   * §7.6 — la masse d'air moyenne sur le créneau, celle qui dose l'extinction du flux. La
   * masse d'air minimale ci-dessus est le meilleur instant de la nuit ; c'est la moyenne
   * qui chiffre ce que la capture paiera réellement.
   */
  readonly masseAirMoyenne: Traced<number | null>
  readonly circumpolaire: boolean
  readonly retournementMeridien: boolean
  readonly causeExclusion?: CauseExclusion
  readonly message: string
  /** Latitude sous laquelle la cible deviendrait accessible, quand la hauteur l'exclut. */
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

/**
 * Découpe la suite d'échantillons visibles en intervalles contigus, puis scinde au méridien
 * quand la monture impose un retournement.
 */
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
 * §7.6 — masse d'air moyenne des échantillons du créneau.
 *
 * La moyenne, et non la masse d'air de la culmination : une cible passe une partie de son
 * créneau plus bas, et l'extinction se paie sur toute la durée de capture. Prendre la
 * culmination annoncerait le meilleur cas comme s'il valait pour la nuit entière.
 *
 * `null` dès qu'un échantillon sort du domaine de l'approximation plane : une moyenne dont
 * une partie des termes est fausse est fausse, et rien n'est extrapolé (§7.6, borne dure).
 */
function masseAirMoyenneCreneau(visibles: readonly Echantillon[]): Traced<number | null> {
  const altitudes = visibles.map((e) => e.altitudeDeg)
  const altMin = altitudes.length === 0 ? 0 : Math.min(...altitudes)
  // Les deux hauteurs extrêmes entrent dans la trace : une moyenne sans les bornes qui la
  // produisent est un nombre orphelin, et §7.6 exige la hauteur à côté de la masse d'air.
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
        `La cible descend à ${altMin.toFixed(1)}° : trop basse pour chiffrer la masse d’air.`,
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
  // T-0268 — l'échantillon le plus haut du créneau est gardé ENTIER, hauteur et instant
  // ensemble : les dissocier laissait un appelant apparier cette hauteur à une autre heure.
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
        `La cible ne monte pas au-delà de ${altCulmination.value.toFixed(1)}° d’ici : trop ` +
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
        `Cachée par le relief (${obstructionDeg(entree.masque, azimutBloquant).toFixed(0)}° ` +
        `de haut vers l’azimut ${azimutBloquant}°).`,
    }
  }

  return {
    ...commun,
    message:
      `Créneau de ${dureeTotale.toFixed(0)} min au-dessus de ${seuil}°` +
      (circumpolaire ? ', ne se couche jamais' : '') +
      (commun.retournementMeridien
        ? '. Retournement au méridien en cours de route : recadrer, puis relancer la séquence.'
        : '.'),
  }
}
