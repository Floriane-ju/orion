/**
 * §8.1 — Fenêtre nocturne, et §4.1 — décalage du midi solaire vrai.
 *
 * Le milieu de nuit ne tombe pas à minuit légal : l'application centre ses créneaux sur le
 * milieu de nuit vrai, jamais sur l'heure ronde. À haute latitude, la nuit astronomique
 * peut être nulle une partie de l'année — le site n'est pas refusé pour autant, la période
 * concernée est annoncée.
 */

import { Body, SearchAltitude, SearchRiseSet } from 'astronomy-engine'
import { K } from '../registry/constants.ts'
import type { Site } from './ephem.ts'
import { observateur, verifieDomaineDesSeries, versDate } from './ephem.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { MIN_PAR_H, MS_PAR_MINUTE } from './unites.ts'

const JOURS_DE_RECHERCHE = 2

/** Sens de recherche d'astronomy-engine : +1 en montée, −1 en descente. */
const DESCENTE = -1
const MONTEE = +1

export type EtatNuit =
  /** Nuit astronomique complète : le Soleil descend sous −18°. */
  | 'NUIT_ASTRONOMIQUE'
  /** Le Soleil ne descend jamais sous −18° : crépuscule permanent. */
  | 'PAS_DE_NUIT_ASTRONOMIQUE'
  /** Le Soleil ne se lève pas : nuit polaire. */
  | 'NUIT_POLAIRE'

export interface FenetreNocturne {
  readonly etat: EtatNuit
  readonly coucherSoleil: Date | null
  readonly leverSoleil: Date | null
  readonly debutNuitAstronomique: Date | null
  readonly finNuitAstronomique: Date | null
  readonly milieuNuitVrai: Date | null
  readonly dureeNuitH: number
  /** Crépuscule nautique (−12°) : repli de planification quand la nuit noire est nulle. */
  readonly debutNautique: Date | null
  readonly finNautique: Date | null
  /**
   * Fenêtre effectivement retenue pour la planification : la nuit astronomique, ou la
   * fenêtre nautique en mode dégradé (§8.1). Jamais une durée négative.
   */
  readonly debutReference: Date | null
  readonly finReference: Date | null
  readonly dureeReferenceH: number
  /** Vrai quand la nuit astronomique est nulle et que la fenêtre nautique la remplace. */
  readonly modeDegrade: boolean
  /** Pénalité de fond de ciel appliquée et affichée en mode dégradé, mag/arcsec². */
  readonly penaliteSbMag: number
  /** Phrase adressée à l'utilisateur quand la nuit est dégradée ou absente. */
  readonly cause?: string
}

/**
 * Décalage du midi solaire vrai par rapport à l'heure légale, en minutes (§4.1).
 * Positif : le midi solaire tombe après le midi légal.
 */
export function offsetMidiSolaireMin(
  longitudeDeg: number,
  offsetFuseauH: number,
): Traced<number> {
  const DEG_PAR_HEURE = 360 / 24
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

/**
 * Fenêtre nocturne à partir d'un instant de départ — typiquement l'après-midi du jour
 * d'observation. Aucun appel réseau (§12.4).
 */
/** Intervalle pendant lequel le Soleil reste sous une hauteur donnée. */
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

  const nautique = fenetreSousHauteur(obs, coucherSoleil, K('HAUTEUR_CREPUSCULE_NAUTIQUE_DEG'))
  const { debut, fin } = fenetreSousHauteur(
    obs,
    coucherSoleil,
    K('HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG'),
  )

  if (debut === null || fin === null) {
    // §8.1 — nuit noire nulle : la fenêtre nautique est retenue en mode dégradé, avec sa
    // pénalité de fond de ciel chiffrée. Jamais une durée négative, jamais un plantage.
    const degrade = nautique.debut !== null && nautique.fin !== null
    return {
      etat: 'PAS_DE_NUIT_ASTRONOMIQUE',
      coucherSoleil,
      leverSoleil,
      debutNuitAstronomique: null,
      finNuitAstronomique: null,
      milieuNuitVrai: milieu(coucherSoleil, leverSoleil),
      dureeNuitH: 0,
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
    debutNautique: nautique.debut,
    finNautique: nautique.fin,
    debutReference: debut,
    finReference: fin,
    dureeReferenceH: dureeHeures(debut, fin),
    modeDegrade: false,
    penaliteSbMag: 0,
  }
}
