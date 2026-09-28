/**
 * Tables énumérées du PRD — §6.2 verdicts de cadrage, §7.2 valeurs
 * d'obturateur, §7.3 objectifs de qualité, §7.4 prescriptions de calibration.
 *
 * Ce sont des tables déclarées, au même titre que la table Bortle : elles vivent dans le
 * registre et non dans les moteurs, pour la raison de §2.1 — une borne de classification
 * écrite en dur dans un moteur devient invérifiable et se met à diverger de sa source.
 *
 * Les bornes de remplissage 0,33 et 0,5 sont les mêmes que C-05 ; elles sont citées ici
 * depuis le registre plutôt que recopiées.
 */

import { K } from './constants.ts'

// ---------------------------------------------------------------------------
// §6.2 — verdict de cadrage par cible
// ---------------------------------------------------------------------------

export type VerdictCadrage =
  | 'MOSAIQUE_REQUISE'
  | 'CADRAGE_SERRE'
  | 'CADRAGE_OPTIMAL'
  | 'CADRAGE_LARGE'
  | 'CADRAGE_PERDU'
  | 'HORS_DOMAINE'

export interface LigneCadrage {
  readonly verdict: VerdictCadrage
  /** Borne basse, incluse, sur le remplissage du champ. */
  readonly remplissageMin: number
  /**
   * Faux quand le verdict interdit de présenter la cible comme cadrable. La cause est
   * toujours nommée, et aucun recadrage logiciel n'est proposé en compensation (§6.1).
   */
  readonly faisable: boolean
  readonly message: string
}

export const TABLE_CADRAGE: readonly LigneCadrage[] = Object.freeze(
  [
    {
      verdict: 'MOSAIQUE_REQUISE',
      remplissageMin: 1.0,
      faisable: true,
      message:
        'La cible déborde du cadre : il faut une mosaïque de plusieurs photos.',
    },
    {
      verdict: 'CADRAGE_SERRE',
      remplissageMin: K('REMPLISSAGE_CADRE_MAX'),
      faisable: true,
      message:
        'Cadrage serré : centrez avec soin.',
    },
    {
      verdict: 'CADRAGE_OPTIMAL',
      remplissageMin: K('REMPLISSAGE_CADRE_MIN'),
      faisable: true,
      message: 'Cadrage idéal.',
    },
    {
      verdict: 'CADRAGE_LARGE',
      remplissageMin: 0.15,
      faisable: true,
      message: 'Cadrage large : la cible apparaît avec son environnement.',
    },
    {
      verdict: 'CADRAGE_PERDU',
      remplissageMin: 0.02,
      faisable: false,
      message: 'Cible trop petite : perdue dans l’image.',
    },
    {
      verdict: 'HORS_DOMAINE',
      remplissageMin: 0,
      faisable: false,
      message: 'Cible bien trop petite pour cette focale.',
    },
  ].map(Object.freeze) as LigneCadrage[],
)

/** Le rapport d'axes au-delà duquel une orientation du boîtier est suggérée (§6.2). */
export const RAPPORT_AXES_ORIENTATION = 1.3

/**
 * §8.3 — verdicts de cadrage admis au pré-filtrage du plan de session. La mosaïque en est
 * exclue : elle demande autant de sessions partielles que de tuiles, ce qui n'est pas un
 * créneau d'une nuit.
 */
export const VERDICTS_PLANIFIABLES: readonly VerdictCadrage[] = Object.freeze([
  'CADRAGE_SERRE',
  'CADRAGE_OPTIMAL',
  'CADRAGE_LARGE',
])

/** Remplissage minimal d'une cible planifiable : la borne basse de CADRAGE_LARGE. */
export const REMPLISSAGE_MIN_PLANIFIABLE = Math.min(
  ...TABLE_CADRAGE.filter((l) => VERDICTS_PLANIFIABLES.includes(l.verdict)).map(
    (l) => l.remplissageMin,
  ),
)

// ---------------------------------------------------------------------------
// §7.2 — valeurs d'obturateur usuelles
// ---------------------------------------------------------------------------

/**
 * La pose retenue est arrondie à une valeur d'obturateur usuelle (§2.3) : un boîtier ne
 * propose pas 13,43 s, il propose 13 s.
 */
export const VALEURS_OBTURATEUR_S: readonly number[] = Object.freeze([
  1, 1.3, 1.6, 2, 2.5, 3.2, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30, 40, 50, 60, 90, 120, 180, 240,
])

// ---------------------------------------------------------------------------
// §7.3 — objectifs de qualité
// ---------------------------------------------------------------------------

export interface PresetSnr {
  readonly cle: string
  readonly libelle: string
  readonly valeur: number
}

export const PRESETS_SNR: readonly PresetSnr[] = Object.freeze(
  [
    { cle: 'APERCU', libelle: 'Aperçu', valeur: 5 },
    { cle: 'CORRECT', libelle: 'Correct', valeur: 10 },
    { cle: 'BON', libelle: 'Bon', valeur: 20 },
    { cle: 'EXCELLENT', libelle: 'Excellent', valeur: 30 },
  ].map(Object.freeze) as PresetSnr[],
)

/**
 * L'objectif de qualité par défaut — celui sur lequel la fiche s'ouvre ET celui que le plan de
 * séance alloue. T-0268 : les deux écrans le choisissaient chacun de leur côté, l'un par
 * indice, l'autre par un 10 recopié. Une seule valeur les rend incapables de diverger.
 */
const PRESET_CORRECT = PRESETS_SNR.find((p) => p.cle === 'CORRECT')
// Renommer la clé casse ici, nommément, au chargement du module — pas trois écrans plus loin
// sur une valeur `undefined` qui aurait traversé toute la chaîne de pose.
if (PRESET_CORRECT === undefined) {
  throw new Error('Préréglage de qualité « CORRECT » absent du registre.')
}

export const PRESET_SNR_DEFAUT: number = PRESET_CORRECT.valeur

// ---------------------------------------------------------------------------
// §7.4 — prescriptions de calibration
// ---------------------------------------------------------------------------

export interface PrescriptionCalibration {
  readonly type: 'FLATS' | 'DARKS' | 'OFFSETS'
  readonly min: number
  readonly max: number
  /** Nombre prescrit par défaut, à l'intérieur de la plage. */
  readonly defaut: number
  readonly consigne: string
}

/**
 * Ordonnées par importance décroissante, et c'est cet ordre qui est affiché : à f/2,8 sur
 * plein format, le vignettage atteint un à deux diaphragmes dans les coins — sans flats,
 * l'image garde un halo central que rien ne rattrape ensuite (§7.4).
 */
export const PRESCRIPTIONS_CALIBRATION: readonly PrescriptionCalibration[] = Object.freeze(
  [
    {
      type: 'FLATS',
      min: 20,
      max: 30,
      defaut: 25,
      consigne:
        'Sans toucher à la mise au point ni à l’orientation. Exposer à mi-saturation.',
    },
    {
      type: 'DARKS',
      min: 20,
      max: 50,
      defaut: 30,
      consigne:
        'Bouchon en place, même durée et même ISO. En fin de séance, capteur encore froid.',
    },
    {
      type: 'OFFSETS',
      min: 50,
      max: 100,
      defaut: 50,
      consigne:
        'Bouchon en place, pose la plus courte, même ISO. Réutilisables tant que l’ISO ne change pas.',
    },
  ].map(Object.freeze) as PrescriptionCalibration[],
)

/** Amplitude du décalage inter-pose (§7.4). */
export const DITHERING_PX = Object.freeze({ min: 5, max: 15 })

// ---------------------------------------------------------------------------
// §10.2 — identification du facteur dominant
// ---------------------------------------------------------------------------

/**
 * Écart relatif en deçà duquel deux sensibilités sont tenues pour équivalentes : les deux
 * variables sont alors présentées conjointement, aucune n'est désignée arbitrairement.
 */
export const TOLERANCE_EGALITE_SENSIBILITE = 0.1

export type CodeLevier =
  | 'CHANGER_CIBLE'
  | 'CRENEAU'
  | 'SITE_PLUS_SOMBRE'
  | 'PLUS_DE_TEMPS'
  | 'FILTRE_DUAL_BAND'
  | 'FOCALE_DIFFERENTE'

export interface LevierCatalogue {
  readonly code: CodeLevier
  readonly libelle: string
  readonly gain: string
  readonly cout: string
}

/**
 * §10.2 — leviers hiérarchisés par coût CROISSANT. L'ordre du tableau est l'ordre affiché,
 * et c'est lui qui tient la règle : jamais l'achat en premier.
 */
export const CATALOGUE_LEVIERS: readonly LevierCatalogue[] = Object.freeze(
  [
    {
      code: 'CHANGER_CIBLE',
      libelle: 'Changer de cible',
      gain: 'immédiat',
      cout: 'nul',
    },
    {
      code: 'CRENEAU',
      libelle: 'Attendre un meilleur créneau',
      gain: 'modéré — cible plus haute, Lune couchée',
      cout: 'report de la session',
    },
    {
      code: 'SITE_PLUS_SOMBRE',
      libelle: 'Se déplacer vers un site plus sombre',
      gain: 'fort en large bande',
      cout: 'déplacement',
    },
    {
      code: 'PLUS_DE_TEMPS',
      libelle: 'Intégrer plus longtemps',
      gain: 'quatre fois plus de temps pour deux fois plus de qualité',
      cout: 'temps de session',
    },
    {
      code: 'FILTRE_DUAL_BAND',
      libelle: 'Ajouter un filtre bi-bande',
      gain: 'fort, mais seulement sur les nébuleuses en émission',
      cout: 'achat',
    },
    {
      code: 'FOCALE_DIFFERENTE',
      libelle: 'Changer de focale',
      gain: 'sur le cadrage seulement',
      cout: 'achat',
    },
  ].map(Object.freeze) as LevierCatalogue[],
)

// ---------------------------------------------------------------------------
// §6.4 — facilité de prise de vue, lue sur le score de §8.3
// ---------------------------------------------------------------------------

export interface LigneFacilite {
  readonly note: number
  readonly libelle: string
}

/**
 * Les libellés de l'échelle, un par note de 0 à C-20 `FACILITE_NOTE_MAX`.
 *
 * Aucune borne de score n'est déclarée ici, et c'est le point : la note est un quintile de
 * l'échelle elle-même (§6.4). Une table de seuils aurait fait entrer des nombres arbitraires
 * dans un moteur, et aurait tassé le catalogue sur une seule classe.
 *
 * La note 0 ne se calcule pas — elle est réservée aux causes d'écart que le moteur nomme
 * (§8.3). Une cible évaluée avec succès plancher à 1 : « impossible » n'existe presque jamais.
 */
export const TABLE_FACILITE: readonly LigneFacilite[] = Object.freeze(
  [
    { note: 0, libelle: 'hors de portée' },
    { note: 1, libelle: 'très exigeante' },
    { note: 2, libelle: 'exigeante' },
    { note: 3, libelle: 'accessible' },
    { note: 4, libelle: 'confortable' },
    { note: 5, libelle: 'idéale' },
  ].map(Object.freeze) as LigneFacilite[],
)
