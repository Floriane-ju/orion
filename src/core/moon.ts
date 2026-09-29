/**
 * §8.1 — Lune : phase, position, dégradation du fond de ciel et fenêtre utile.
 *
 * Deux règles du PRD gouvernent ce module :
 *
 *   1. UNE LUNE SOUS L'HORIZON NE DÉGRADE RIEN, quelle que soit sa phase. La phase seule
 *      n'est jamais un motif d'exclusion : c'est la hauteur qui décide.
 *   2. UNE NUIT DE LUNE N'EST PAS « PERDUE ». Elle a un fond de ciel plus élevé, donc des
 *      poses plus courtes et une intégration plus longue. Le moteur le chiffre au lieu de
 *      barrer la nuit.
 *
 * La dégradation vient du modèle de Krisciunas & Schaefer (1991), implémenté localement :
 * aucun appel réseau, aucune table externe.
 */

import { Body, Equator, Illumination, KM_PER_AU, SearchRiseSet } from 'astronomy-engine'
import { K } from '../registry/constants.ts'
import type { Site } from './ephem.ts'
import { observateur, positionCorps, verifieDomaineDesSeries, versDate } from './ephem.ts'
import type { FenetreNocturne } from './nuit.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { DEG, separationEquatorialeDeg } from './mat3.ts'
import { MIN_PAR_H, MS_PAR_MINUTE } from './unites.ts'

const ANGLE_DROIT_DEG = 90
const JOURS_DE_RECHERCHE = 2
const DESCENTE = -1
const MONTEE = 1

// ---------------------------------------------------------------------------
// Position et phase
// ---------------------------------------------------------------------------

export interface EtatLuneInstant {
  readonly altitudeDeg: number
  readonly azimutDeg: number
  readonly adH: number
  readonly decDeg: number
  /** Fraction illuminée du disque, de 0 (nouvelle) à 1 (pleine). */
  readonly illumination: number
  /** Angle de phase, en degrés : 0 à la pleine Lune, 180 à la nouvelle. */
  readonly anglePhaseDeg: number
  /**
   * Demi-diamètre apparent, en degrés, vu du SITE : la distance topocentrique, pas la
   * géocentrique — la Lune est 1 à 2 % plus grosse au zénith qu'à l'horizon.
   */
  readonly demiDiametreDeg: number
  readonly lever: Date | null
  readonly coucher: Date | null
  /** Vrai quand la Lune est sous l'horizon : elle n'entre alors dans aucun calcul. */
  readonly sousHorizon: boolean
}

export function etatLune(site: Site, date: Date): EtatLuneInstant {
  verifieDomaineDesSeries(date)
  const obs = observateur(site)
  const position = positionCorps(Body.Moon, date, site)
  const eclairement = Illumination(Body.Moon, date)
  return {
    altitudeDeg: position.hauteurDeg,
    azimutDeg: position.azimutDeg,
    adH: position.adH,
    decDeg: position.decDeg,
    illumination: eclairement.phase_fraction,
    anglePhaseDeg: eclairement.phase_angle,
    demiDiametreDeg: demiDiametreLuneDeg(date, site),
    lever: versDate(SearchRiseSet(Body.Moon, obs, MONTEE, date, JOURS_DE_RECHERCHE)),
    coucher: versDate(SearchRiseSet(Body.Moon, obs, DESCENTE, date, JOURS_DE_RECHERCHE)),
    sousHorizon: position.hauteurDeg <= 0,
  }
}


function demiDiametreLuneDeg(date: Date, site: Site): number {
  const distanceKm = Equator(Body.Moon, date, observateur(site), true, true).dist * KM_PER_AU
  return Math.asin(K('RAYON_MOYEN_LUNE_KM') / distanceKm) / DEG
}

/** Position de la Lune en coordonnées équatoriales de la date, sans calcul horizontal. */
function positionEquatorialeLune(date: Date, site: Site): {
  readonly adH: number
  readonly decDeg: number
} {
  const eq = Equator(Body.Moon, date, observateur(site), true, true)
  return { adH: eq.ra, decDeg: eq.dec }
}

// ---------------------------------------------------------------------------
// §8.1 — dégradation lunaire, modèle de Krisciunas & Schaefer (1991)
// ---------------------------------------------------------------------------

/** Masse d'air du modèle KS91, valide jusqu'à l'horizon contrairement à 1 / sin(alt). */
export function masseAirKS(hauteurDeg: number): number {
  const zenithal = (ANGLE_DROIT_DEG - hauteurDeg) * DEG
  const sin = Math.sin(zenithal)
  return 1 / Math.sqrt(1 - K('KS_MASSE_AIR_COEF') * sin * sin)
}

/** Brillance de surface en nanolamberts — l'unité dans laquelle le modèle additionne. */
export function nanolamberts(sbMagArcsec2: number): number {
  return (
    K('NANOLAMBERT_ECHELLE') *
    Math.exp(K('NANOLAMBERT_OFFSET') - K('NANOLAMBERT_PENTE') * sbMagArcsec2)
  )
}

/**
 * Transmission atmosphérique en bande V sur une masse d'air donnée : 10^(−0,4 k X).
 *
 * Exportée parce que le rendu du fond de ciel (T-0098) applique la MÊME extinction au halo
 * du site. Deux écritures de la même atténuation finiraient par diverger d'un facteur 0,4.
 */
export function extinctionV(masseAir: number): number {
  return (
    K('BASE_MAGNITUDE') ** (-(K('EXTINCTION_V_MAG_PAR_MASSE_AIR') * masseAir) / K('POGSON'))
  )
}

/** Illuminance hors atmosphère de la Lune à l'angle de phase donné. */
function illuminanceLune(anglePhaseDeg: number): number {
  const a = Math.abs(anglePhaseDeg)
  const magnitude =
    K('KS_MAGNITUDE_LUNE_PLEINE') + K('KS_COEF_PHASE') * a + K('KS_COEF_PHASE_4') * (a * a) ** 2
  return K('BASE_MAGNITUDE') ** (-magnitude / K('POGSON'))
}

/**
 * T-0346 — l'éclat de la Lune vue du site, rapporté à celui d'une pleine Lune au zénith :
 * 1 pour elle, 0 pour une Lune couchée. Même illuminance de phase et même extinction que le
 * terme B_lune ci-dessous, sans la diffusion — qui dépend d'une direction visée, et la frise
 * de la nuit n'en vise aucune. C'est ce que le halo de la frise représente.
 */
export function eclatLuneRelatif(anglePhaseDeg: number, hauteurDeg: number): number {
  if (hauteurDeg <= 0) return 0
  const reference = illuminanceLune(0) * extinctionV(masseAirKS(ANGLE_DROIT_DEG))
  return (illuminanceLune(anglePhaseDeg) * extinctionV(masseAirKS(hauteurDeg))) / reference
}

/** Fonction de diffusion : Rayleigh près de la Lune, Mie au-delà. */
export function diffusionKS(separation: number): number {
  const cos = Math.cos(separation * DEG)
  return (
    K('BASE_MAGNITUDE') ** K('KS_RAYLEIGH_LOG') * (K('KS_RAYLEIGH_CONSTANTE') + cos * cos) +
    K('BASE_MAGNITUDE') ** (K('KS_MIE_LOG') - separation / K('KS_MIE_ECHELLE_DEG'))
  )
}

export interface GeometrieLune {
  readonly altitudeLuneDeg: number
  readonly altitudeCibleDeg: number
  readonly separationDeg: number
  readonly anglePhaseDeg: number
}

export interface EntreeDeltaSbLune extends GeometrieLune {
  readonly sbCielNoirMag: number
}

/**
 * Brillance ajoutée par la Lune dans cette direction, en nanolamberts — le terme B_lune du
 * modèle KS91, avant toute conversion en magnitudes.
 *
 * Exposée séparément parce que le rendu du planétarium (T-0100) ADDITIONNE cette brillance à
 * celles du site et du crépuscule : additionner des magnitudes n'a pas de sens, et refaire ce
 * produit ailleurs donnerait deux halos lunaires pour un seul modèle.
 */
export function brillanceLuneNl(entree: GeometrieLune): number {
  // Règle 1 de ce module : une Lune sous l'horizon n'ajoute rien, quelle que soit sa phase.
  if (entree.altitudeLuneDeg <= 0 || entree.altitudeCibleDeg <= 0) return 0
  return (
    diffusionKS(entree.separationDeg) *
    illuminanceLune(entree.anglePhaseDeg) *
    extinctionV(masseAirKS(entree.altitudeLuneDeg)) *
    (1 - extinctionV(masseAirKS(entree.altitudeCibleDeg)))
  )
}

/**
 * Dégradation du fond de ciel imputable à la Lune, en mag/arcsec². Positive : le ciel est
 * plus clair d'autant. Nulle dès que la Lune est sous l'horizon, quelle que soit sa phase.
 */
export function deltaSbLune(entree: EntreeDeltaSbLune): Traced<number> {
  const inputs = {
    sb_ciel_noir: entree.sbCielNoirMag,
    alt_lune_deg: entree.altitudeLuneDeg,
    alt_cible_deg: entree.altitudeCibleDeg,
    separation_deg: entree.separationDeg,
    angle_phase_deg: entree.anglePhaseDeg,
  }
  const constants = [
    'KS_MAGNITUDE_LUNE_PLEINE',
    'KS_COEF_PHASE',
    'KS_COEF_PHASE_4',
    'KS_RAYLEIGH_LOG',
    'KS_RAYLEIGH_CONSTANTE',
    'KS_MIE_LOG',
    'KS_MIE_ECHELLE_DEG',
    'KS_MASSE_AIR_COEF',
    'EXTINCTION_V_MAG_PAR_MASSE_AIR',
    'NANOLAMBERT_ECHELLE',
    'NANOLAMBERT_OFFSET',
    'NANOLAMBERT_PENTE',
  ] as const

  if (entree.altitudeLuneDeg <= 0 || entree.altitudeCibleDeg <= 0) {
    return trace({
      value: 0,
      formula: 'DELTA_SB_LUNE',
      inputs,
      note: 'Lune couchée ou cible non levée : aucune gêne.',
    })
  }

  const bLune = brillanceLuneNl(entree)

  const bCiel = nanolamberts(entree.sbCielNoirMag)
  const delta = K('POGSON') * Math.log10((bCiel + bLune) / bCiel)

  return trace({
    value: delta,
    formula: 'DELTA_SB_LUNE',
    inputs,
    constants,
    note:
      `La Lune éclaircit le ciel de ${delta.toFixed(2)} mag/arcsec² sur cette cible : ` +
      'poses plus courtes, temps total plus long.',
  })
}

/** Fond de ciel effectif sous la Lune : plus la Lune éclaire, plus le ciel est clair. */
export function sbCielAvecLune(sbCielNoirMag: number, deltaSb: number): number {
  return sbCielNoirMag - deltaSb
}

export interface EntreeCielSousLaLune {
  readonly site: Site
  /** Instant auquel la Lune est évaluée. L'appelant le choisit, et l'annonce. */
  readonly instant: Date
  /** Coordonnées de la cible : ascension droite en heures, déclinaison en degrés. */
  readonly adH: number
  readonly decDeg: number
  /**
   * Hauteur de la cible retenue pour l'extinction sur son trajet. Le plan y met la
   * culmination (§8.1) : c'est la convention, et la fiche doit employer la même, sans quoi
   * les deux écrans dosent la même nuit différemment.
   */
  readonly altitudeCibleDeg: number
  readonly sbCielNoirMag: number
}

export interface CielSousLaLune {
  readonly delta: Traced<number>
  readonly sbCielEffectif: number
  readonly altLuneDeg: number
  readonly separationDeg: number
  /**
   * La hauteur de cible employée pour l'extinction sur son trajet, renvoyée telle que
   * l'appelant l'a fournie. §7.6 éteint le flux de l'objet à cette même hauteur : deux
   * conventions pour une seule grandeur donneraient deux poses sur un même écran.
   */
  readonly altitudeCibleDeg: number
  /** Fraction illuminée : ce qui se lit à l'écran, la phase nommée n'étant pas un nombre. */
  readonly illumination: number
}

/**
 * §8.1 — le fond de ciel qu'une cible voit sous la Lune, à un instant donné.
 *
 * Partagé entre le plan de séance et la fiche cible (T-0089) : deux écrans qui évaluent la
 * même cible la même nuit doivent appeler le même moteur, sinon ils annoncent deux poses.
 */
export function cielSousLaLune(entree: EntreeCielSousLaLune): CielSousLaLune {
  const lune = etatLune(entree.site, entree.instant)
  const posLune = positionEquatorialeLune(entree.instant, entree.site)
  const separation = separationEquatorialeDeg(entree.adH, entree.decDeg, posLune.adH, posLune.decDeg)
  const delta = deltaSbLune({
    sbCielNoirMag: entree.sbCielNoirMag,
    altitudeLuneDeg: lune.altitudeDeg,
    altitudeCibleDeg: entree.altitudeCibleDeg,
    separationDeg: separation,
    anglePhaseDeg: lune.anglePhaseDeg,
  })
  return {
    delta,
    sbCielEffectif: sbCielAvecLune(entree.sbCielNoirMag, delta.value),
    altLuneDeg: lune.altitudeDeg,
    separationDeg: separation,
    altitudeCibleDeg: entree.altitudeCibleDeg,
    illumination: lune.illumination,
  }
}

// ---------------------------------------------------------------------------
// §8.1 — fenêtre utile
// ---------------------------------------------------------------------------

export interface FenetreUtile {
  /** Sous-intervalle de la nuit où la Lune est sous l'horizon. */
  readonly debut: Date | null
  readonly fin: Date | null
  readonly dureeH: number
  /** Durée de la nuit de référence, affichée séparément de la fenêtre utile (§8.1). */
  readonly dureeNuitH: number
  readonly luneInterfere: boolean
  readonly note: string
}

function heuresEntre(debut: Date, fin: Date): number {
  return (fin.getTime() - debut.getTime()) / (MS_PAR_MINUTE * MIN_PAR_H)
}

/**
 * Fenêtre utile : la part de la nuit où la Lune est couchée. Les deux durées sont rendues
 * séparément — une fenêtre utile réduite doit rester lisible à côté de la nuit complète,
 * sinon l'utilisateur ne comprend pas ce que la Lune lui coûte.
 *
 * Un objet tolérant à la Lune (§6.3) reste planifiable sur toute la nuit : c'est
 * l'appelant qui arbitre, avec la dégradation chiffrée par `deltaSbLune`.
 */
export function fenetreUtile(site: Site, nuit: FenetreNocturne): FenetreUtile {
  const debut = nuit.debutReference
  const fin = nuit.finReference
  if (debut === null || fin === null) {
    return {
      debut: null,
      fin: null,
      dureeH: 0,
      dureeNuitH: 0,
      luneInterfere: false,
      note: 'Pas de nuit noire à cette date.',
    }
  }

  const dureeNuitH = heuresEntre(debut, fin)
  const pas = MS_PAR_MINUTE
  let meilleurDebut: Date | null = null
  let meilleureFin: Date | null = null
  let courantDebut: Date | null = null

  for (let t = debut.getTime(); t <= fin.getTime(); t += pas) {
    const instant = new Date(t)
    const sousHorizon = positionCorps(Body.Moon, instant, site).hauteurDeg <= 0
    if (sousHorizon && courantDebut === null) courantDebut = instant
    if ((!sousHorizon || t + pas > fin.getTime()) && courantDebut !== null) {
      const finCourante = new Date(sousHorizon ? t : t - pas)
      if (
        meilleurDebut === null ||
        meilleureFin === null ||
        finCourante.getTime() - courantDebut.getTime() >
          meilleureFin.getTime() - meilleurDebut.getTime()
      ) {
        meilleurDebut = courantDebut
        meilleureFin = finCourante
      }
      courantDebut = null
    }
  }

  if (meilleurDebut === null || meilleureFin === null) {
    return {
      debut: null,
      fin: null,
      dureeH: 0,
      dureeNuitH,
      luneInterfere: true,
      note:
        'Lune levée toute la nuit : préférez les nébuleuses en émission.',
    }
  }

  const dureeH = heuresEntre(meilleurDebut, meilleureFin)
  const luneInterfere = dureeH < dureeNuitH - pas / (MS_PAR_MINUTE * MIN_PAR_H)
  return {
    debut: meilleurDebut,
    fin: meilleureFin,
    dureeH,
    dureeNuitH,
    luneInterfere,
    note: luneInterfere
      ? `${dureeH.toFixed(2)} h sans Lune sur ${dureeNuitH.toFixed(2)} h de nuit.`
      : 'La Lune ne gêne pas cette nuit.',
  }
}
