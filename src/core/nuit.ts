/**
 * §8.1 — fenêtre nocturne; §4.1 — true solar noon offset.
 * Mid-night ≠ legal midnight: créneaux centered on true mid-night, never round hour. At high
 * latitude nuit astronomique can be nil part of the year — site not refused, period announced.
 */

import { Body, SearchAltitude, SearchRiseSet } from 'astronomy-engine'
import { K } from '../registry/constants.ts'
import type { Site } from './ephem.ts'
import { observateur, positionCorps, verifieDomaineDesSeries, versDate } from './ephem.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { DEG_PAR_HEURE, MIN_PAR_H, MS_PAR_MINUTE } from './unites.ts'

const JOURS_DE_RECHERCHE = 2

/** astronomy-engine search direction: +1 rising, −1 setting. */
const DESCENTE = -1
const MONTEE = +1

export type EtatNuit =
  /** Full nuit astronomique: Sun below −18°. */
  | 'NUIT_ASTRONOMIQUE'
  /** Sun never below −18°: permanent twilight. */
  | 'PAS_DE_NUIT_ASTRONOMIQUE'
  /** Sun does not rise: polar night. */
  | 'NUIT_POLAIRE'

export interface FenetreNocturne {
  readonly etat: EtatNuit
  readonly coucherSoleil: Date | null
  readonly leverSoleil: Date | null
  readonly debutNuitAstronomique: Date | null
  readonly finNuitAstronomique: Date | null
  readonly milieuNuitVrai: Date | null
  readonly dureeNuitH: number
  /** Civil twilight (−6°): frise bound, enters no calculation. */
  readonly debutCivil: Date | null
  readonly finCivil: Date | null
  /** Nautical twilight (−12°): planning fallback when nuit noire is nil. */
  readonly debutNautique: Date | null
  readonly finNautique: Date | null
  /** Planning window: nuit astronomique, else nautical (degraded mode, §8.1). Never negative. */
  readonly debutReference: Date | null
  readonly finReference: Date | null
  readonly dureeReferenceH: number
  /** True when nuit astronomique nil, nautical window replaces it. */
  readonly modeDegrade: boolean
  /** fond de ciel penalty applied and shown in degraded mode, mag/arcsec². */
  readonly penaliteSbMag: number
  /** User-facing sentence when nuit degraded or absent. */
  readonly cause?: string
}

/** True solar noon offset vs legal time, minutes (§4.1). Positive: solar noon after legal noon. */
export function offsetMidiSolaireMin(
  longitudeDeg: number,
  offsetFuseauH: number,
): Traced<number> {
  const valeur =
    (longitudeDeg / DEG_PAR_HEURE) * MIN_PAR_H - offsetFuseauH * MIN_PAR_H
  return trace({
    value: valeur,
    formula: 'OFFSET_MIDI_SOLAIRE',
    inputs: { longitude_deg: longitudeDeg, offset_fuseau_h: offsetFuseauH },
    note: 'Le vrai milieu de la nuit ne tombe pas à minuit.',
  })
}

function milieu(debut: Date, fin: Date): Date {
  return new Date((debut.getTime() + fin.getTime()) / 2)
}

function dureeHeures(debut: Date, fin: Date): number {
  return (fin.getTime() - debut.getTime()) / (MS_PAR_MINUTE * MIN_PAR_H)
}

/** Interval during which Sun stays below a given altitude. */
function fenetreSousHauteur(
  obs: ReturnType<typeof observateur>,
  depart: Date,
  hauteurDeg: number,
): { readonly debut: Date | null; readonly fin: Date | null } {
  const debut = versDate(
    SearchAltitude(Body.Sun, obs, DESCENTE, depart, JOURS_DE_RECHERCHE, hauteurDeg),
  )
  const fin =
    debut === null
      ? null
      : versDate(SearchAltitude(Body.Sun, obs, MONTEE, debut, JOURS_DE_RECHERCHE, hauteurDeg))
  return { debut, fin }
}

/** Fenêtre nocturne from a start instant (typically observation-day afternoon). Offline (§12.4). */
export function fenetreNocturne(site: Site, depart: Date): FenetreNocturne {
  verifieDomaineDesSeries(depart)
  const obs = observateur(site)

  const coucherSoleil = versDate(
    SearchRiseSet(Body.Sun, obs, DESCENTE, depart, JOURS_DE_RECHERCHE),
  )
  const leverSoleil = versDate(
    SearchRiseSet(Body.Sun, obs, MONTEE, coucherSoleil ?? depart, JOURS_DE_RECHERCHE),
  )

  if (coucherSoleil === null || leverSoleil === null) {
    const soleilCirculaire = site.latitudeDeg >= 0 ? 'soleil de minuit' : 'nuit polaire'
    return {
      etat: 'NUIT_POLAIRE',
      coucherSoleil,
      leverSoleil,
      debutNuitAstronomique: null,
      finNuitAstronomique: null,
      milieuNuitVrai: null,
      dureeNuitH: 0,
      debutCivil: null,
      finCivil: null,
      debutNautique: null,
      finNautique: null,
      debutReference: null,
      finReference: null,
      dureeReferenceH: 0,
      modeDegrade: false,
      penaliteSbMag: 0,
      cause:
        `Le Soleil ne se couche pas à cette date (${soleilCirculaire}) : pas de nuit.`,
    }
  }

  const civil = fenetreSousHauteur(obs, coucherSoleil, K('HAUTEUR_CREPUSCULE_CIVIL_DEG'))
  const nautique = fenetreSousHauteur(obs, coucherSoleil, K('HAUTEUR_CREPUSCULE_NAUTIQUE_DEG'))
  const { debut, fin } = fenetreSousHauteur(
    obs,
    coucherSoleil,
    K('HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG'),
  )

  if (debut === null || fin === null) {
    // §8.1 — nil nuit noire: nautical window in degraded mode + quantified fond de ciel penalty.
    // Never negative duration, never a crash.
    const degrade = nautique.debut !== null && nautique.fin !== null
    return {
      etat: 'PAS_DE_NUIT_ASTRONOMIQUE',
      coucherSoleil,
      leverSoleil,
      debutNuitAstronomique: null,
      finNuitAstronomique: null,
      milieuNuitVrai: milieu(coucherSoleil, leverSoleil),
      dureeNuitH: 0,
      debutCivil: civil.debut,
      finCivil: civil.fin,
      debutNautique: nautique.debut,
      finNautique: nautique.fin,
      debutReference: nautique.debut,
      finReference: nautique.fin,
      dureeReferenceH: degrade ? dureeHeures(nautique.debut!, nautique.fin!) : 0,
      modeDegrade: degrade,
      penaliteSbMag: degrade ? K('PENALITE_SB_CREPUSCULE_NAUTIQUE_MAG') : 0,
      cause:
        'Pas de nuit complètement noire à cette date. ' +
        (degrade
          ? 'Mode dégradé : la partie la plus sombre est retenue, avec un ciel plus clair de ' +
            `${K('PENALITE_SB_CREPUSCULE_NAUTIQUE_MAG')} mag/arcsec² (pénalité de fond de ciel).`
          : 'Aucun moment assez sombre pour photographier.'),
    }
  }

  return {
    etat: 'NUIT_ASTRONOMIQUE',
    coucherSoleil,
    leverSoleil,
    debutNuitAstronomique: debut,
    finNuitAstronomique: fin,
    milieuNuitVrai: milieu(debut, fin),
    dureeNuitH: dureeHeures(debut, fin),
    debutCivil: civil.debut,
    finCivil: civil.fin,
    debutNautique: nautique.debut,
    finNautique: nautique.fin,
    debutReference: debut,
    finReference: fin,
    dureeReferenceH: dureeHeures(debut, fin),
    modeDegrade: false,
    penaliteSbMag: 0,
  }
}

/**
 * T-0409 — risen = between `astronomy-engine` rise and set (upper limb, refraction incl.), not at
 * an altitude chosen here: theme flips when the nuit frise says so. Up when next event is a set.
 * No rise/set in search window (soleil de minuit, nuit polaire): altitude sign decides.
 */
export function soleilLeve(site: Site, instant: Date): boolean {
  const obs = observateur(site)
  const coucher = versDate(SearchRiseSet(Body.Sun, obs, DESCENTE, instant, JOURS_DE_RECHERCHE))
  const lever = versDate(SearchRiseSet(Body.Sun, obs, MONTEE, instant, JOURS_DE_RECHERCHE))
  if (coucher !== null && lever !== null) return coucher < lever
  if (coucher !== null || lever !== null) return coucher !== null
  return positionCorps(Body.Sun, instant, site).hauteurDeg > 0
}
