/**
 * PRD enumerated tables — §6.2 cadrage verdicts, §7.2 shutter values, §7.3 quality targets,
 * §7.4 calibration prescriptions.
 * Declared tables like Bortle, in registre not moteurs (§2.1): a classification bound hardcoded
 * in a moteur is unverifiable and drifts from its source. Fill bounds 0,33 / 0,5 = C-05, cited
 * from registre.
 */

import { K } from './constants.ts'

// §6.2 — cadrage verdict per cible

export type VerdictCadrage =
  | 'MOSAIQUE_REQUISE'
  | 'CADRAGE_SERRE'
  | 'CADRAGE_OPTIMAL'
  | 'CADRAGE_LARGE'
  | 'CADRAGE_PERDU'
  | 'HORS_DOMAINE'

export interface LigneCadrage {
  readonly verdict: VerdictCadrage
  /** Lower bound, inclusive, on field fill. */
  readonly remplissageMin: number
  /**
   * False: verdict forbids presenting the cible as frameable. Cause always named; no software
   * reframing offered instead (§6.1).
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

/** Axis ratio beyond which a boîtier orientation is suggested (§6.2). */
export const RAPPORT_AXES_ORIENTATION = 1.3

/**
 * §8.3 — cadrage verdicts admitted to plan de session pre-filter. Mosaic excluded: needs as many
 * partial sessions as tiles, not one créneau.
 */
export const VERDICTS_PLANIFIABLES: readonly VerdictCadrage[] = Object.freeze([
  'CADRAGE_SERRE',
  'CADRAGE_OPTIMAL',
  'CADRAGE_LARGE',
])

/** Minimum fill of a plannable cible: lower bound of CADRAGE_LARGE. */
export const REMPLISSAGE_MIN_PLANIFIABLE = Math.min(
  ...TABLE_CADRAGE.filter((l) => VERDICTS_PLANIFIABLES.includes(l.verdict)).map(
    (l) => l.remplissageMin,
  ),
)

// §7.2 — usual shutter values

/** Pose rounded to usual shutter value (§2.3): boîtier offers 13 s, not 13,43 s. */
export const VALEURS_OBTURATEUR_S: readonly number[] = Object.freeze([
  1, 1.3, 1.6, 2, 2.5, 3.2, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30, 40, 50, 60, 90, 120, 180, 240,
])

// §7.3 — quality targets

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
 * Default quality target: fiche opens on it AND plan de séance allocates it. T-0268: two screens
 * chose separately (index vs copied 10); one value prevents divergence.
 */
const PRESET_CORRECT = PRESETS_SNR.find((p) => p.cle === 'CORRECT')
// Renaming the key breaks here at module load, named; not 3 screens later on `undefined`.
if (PRESET_CORRECT === undefined) {
  throw new Error('Préréglage de qualité « CORRECT » absent du registre.')
}

export const PRESET_SNR_DEFAUT: number = PRESET_CORRECT.valeur

// §7.4 — calibration prescriptions

export interface PrescriptionCalibration {
  readonly type: 'FLATS' | 'DARKS' | 'OFFSETS'
  readonly min: number
  readonly max: number
  /** Default prescribed count, within range. */
  readonly defaut: number
  readonly consigne: string
}

/**
 * Decreasing importance = display order. f/2,8 full frame: vignetting 1-2 stops in corners;
 * without flats a central halo stays (§7.4).
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

/** Inter-pose offset amplitude (§7.4). */
export const DITHERING_PX = Object.freeze({ min: 5, max: 15 })

// §10.2 — dominant factor identification

/**
 * Relative gap under which two sensitivities count equivalent: both variables shown, none
 * arbitrarily designated.
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
 * §10.2 — levers by INCREASING cost. Array order = display order = the rule: never purchase first.
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

// §6.4 — shooting ease, read from the §8.3 score

export interface LigneFacilite {
  readonly note: number
  readonly libelle: string
}

/**
 * Scale labels, one per note 0 to C-20 `FACILITE_NOTE_MAX`.
 * No score bound declared, on purpose: note = quintile of the scale itself (§6.4); a threshold
 * table would put arbitrary numbers in a moteur and pile catalogue in one class.
 * Note 0 never computed: reserved for gap causes the moteur names (§8.3). A successfully
 * evaluated cible floors at 1: "impossible" almost never exists.
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
