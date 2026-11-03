/**
 * T-0275 — French enum VALUES, one exhaustive `Record` per union.
 * Glossaire (§10.1) names TERMS ("Tolérance à la Lune"), not what follows the colon; internal
 * codes leaked there ("Tolérance à la Lune : FAIBLE"). One table per union closes it.
 * COMPLETE `Record<Union, string>`: new verdict without label = compile error.
 * Pattern of `LIBELLE_TYPE_OBJET` (`src/ui/libelles-objet.ts`), lifted here because
 * `plan-texte.ts` (§11.2) needs it: export and screen carry the same verdicts.
 * Labels LOWERCASE: follow a colon in a sentence, not a title.
 * Imports TYPES only from core/data (as `filters.ts` with `TypeObjet`): registre keeps zero
 * runtime dependency.
 */

import type { LotCalibration } from '../core/calibration.ts'
import type { VerdictDetectabilite } from '../core/detectability.ts'
import type { DegradationLune } from '../core/session-score.ts'
import type { EtatNuit } from '../core/nuit.ts'
import type { ModePointage } from '../core/pointage.ts'
import type { CauseEcart } from '../core/session-types.ts'
import type { SourceSb } from '../core/fond-ciel.ts'
import type { Flag } from '../core/traced.ts'
import type { IntegritePaquet } from '../data/catalog.ts'
import type { DisponibiliteHorsLigne, ModeReseau } from '../data/degradation.ts'
import type { ZpSource } from '../data/equipment.ts'
import type { VerdictCadrage } from './verdicts.ts'

/** §6.2 — what the cadre does to the cible. */
export const LIBELLE_VERDICT_CADRAGE: Readonly<Record<VerdictCadrage, string>> = Object.freeze({
  MOSAIQUE_REQUISE: 'mosaïque requise',
  CADRAGE_SERRE: 'cadrage serré',
  CADRAGE_OPTIMAL: 'cadrage optimal',
  CADRAGE_LARGE: 'cadrage large',
  CADRAGE_PERDU: 'cible perdue dans le champ',
  HORS_DOMAINE: 'hors du domaine de cadrage',
})

/** §6.3 — what will see the cible. Labels from table deleted in 633b5f9. */
export const LIBELLE_VERDICT_DETECTABILITE: Readonly<Record<VerdictDetectabilite, string>> =
  Object.freeze({
    OEIL_NU: 'à l’œil nu',
    JUMELLES: 'aux jumelles',
    TELESCOPE: 'au télescope',
    PHOTO_SEULE: 'en photo seulement',
  })

/** What the Moon removes from the cible's photograph. */
export const LIBELLE_DEGRADATION_LUNE: Readonly<Record<DegradationLune, string>> = Object.freeze({
  AUCUNE: 'aucune',
  FAIBLE: 'faible',
  MOYENNE: 'moyenne',
  FORTE: 'forte',
})

/** §3.2 — what the night offers at this date and latitude. */
export const LIBELLE_ETAT_NUIT: Readonly<Record<EtatNuit, string>> = Object.freeze({
  NUIT_ASTRONOMIQUE: 'nuit astronomique complète',
  PAS_DE_NUIT_ASTRONOMIQUE: 'pas de nuit astronomique — crépuscule permanent',
  NUIT_POLAIRE: 'nuit polaire — le Soleil ne se lève pas',
})

/** §2.2 — origin of the retained fond de ciel. */
export const LIBELLE_SOURCE_SB: Readonly<Record<SourceSb, string>> = Object.freeze({
  TABLE_BORTLE: 'table de Bortle',
  SQM_MESURE: 'mesure au SQM',
})

/**
 * Meaning of a traceability flag: "20,2 mag [ESTIMÉ]". Form (caps in brackets) matches existing
 * moteur messages; changing it = two badges for one notion. Full glosses in `traced.ts`.
 */
export const LIBELLE_FLAG: Readonly<Record<Flag, string>> = Object.freeze({
  ESTIME: 'ESTIMÉ',
  HYP: 'HYPOTHÈSE',
  DONNEE_MANQUANTE: 'DONNÉE MANQUANTE',
  HORS_DOMAINE: 'HORS DOMAINE',
})

/** §6.3 — mention put where the catalogue carries no value. */
export const MENTION_DONNEE_MANQUANTE = `[${LIBELLE_FLAG.DONNEE_MANQUANTE}]`

/** T-0107 — reference star the packages don't name: table, parcours, fiche. */
export const SANS_NOM = 'sans nom'

/** §11.1 — how the instrument is brought onto the cible. */
export const LIBELLE_MODE_POINTAGE: Readonly<Record<ModePointage, string>> = Object.freeze({
  CARTE_DIRECTE: 'à la carte, directement',
  CHEMINEMENT: 'de proche en proche',
})

/** §8.3 — why a cible does not enter the plan. */
export const LIBELLE_CAUSE_ECART: Readonly<Record<CauseEcart, string>> = Object.freeze({
  DONNEE_MANQUANTE: 'donnée manquante au catalogue',
  CADRAGE: 'cadrage impossible',
  HAUTEUR: 'trop basse',
  RELIEF: 'cachée par le relief',
  FENETRE: 'hors de la fenêtre nocturne',
  HORS_PORTEE: 'hors de portée de ce matériel',
  CONFLIT_CRENEAU: 'créneau déjà pris',
  SUIVI: 'sans suivi, pas de ciel profond',
  LUNE: 'Lune trop gênante',
})

/** §7.4 — calibration lots. Workshop jargon rules: nobody says "noirs". */
export const LIBELLE_LOT_CALIBRATION: Readonly<Record<LotCalibration['type'], string>> =
  Object.freeze({
    FLATS: 'flats — plages uniformes',
    DARKS: 'darks — poses noires',
    OFFSETS: 'offsets — bruit de lecture',
  })

/** §7.1 — origin of the system zero point, shown wherever a pose is. */
export const LIBELLE_ZP_SOURCE: Readonly<Record<ZpSource, string>> = Object.freeze({
  BASE_MATERIEL: 'base matériel',
  GENERIQUE: 'valeur générique',
})

/** §12.5 — network state at startup. */
export const LIBELLE_MODE_RESEAU: Readonly<Record<ModeReseau, string>> = Object.freeze({
  EN_LIGNE: 'en ligne',
  HORS_LIGNE: 'hors ligne',
  DEGRADE: 'dégradé',
})

/** §12.5 — what a function becomes offline. */
export const LIBELLE_DISPONIBILITE_HORS_LIGNE: Readonly<
  Record<DisponibiliteHorsLigne, string>
> = Object.freeze({
  COMPLET: 'complet',
  COMPLET_SI_EN_CACHE: 'complet si déjà en cache',
  TOMBE: 'indisponible',
})

/** §12.2 — state of a data package against its manifest. */
export const LIBELLE_INTEGRITE_PAQUET: Readonly<Record<IntegritePaquet, string>> = Object.freeze({
  OK: 'intègre',
  CORROMPU: 'corrompu',
  ABSENT: 'absent',
})

/**
 * §10.2 — inputs of a traced value, as shown under it. `Traced.inputs` keys are free (each
 * `trace()` call writes them by hand): no exhaustive `Record` fits; render test keeps this table
 * complete (fails on any snake_case id reaching a main surface).
 * Formula EXPRESSION stays raw: `sb = m_int + 2,5·log(aire)` is the §10.2 level 3 deliverable,
 * closest to PRD; translating would erase it.
 */
export const LIBELLE_ENTREE: Readonly<Record<string, string>> = Object.freeze({
  a_arcmin: 'grand axe',
  aire_arcsec2: 'aire apparente',
  alt_culmination_deg: 'hauteur à la culmination',
  alt_deg: 'hauteur',
  alt_max_deg: 'hauteur maximale',
  alt_min_deg: 'hauteur minimale',
  b_arcmin: 'petit axe',
  b_deg: 'latitude galactique',
  bandes_nm: 'bandes passantes',
  bortle: 'classe de Bortle',
  c_facteur: 'facteur de pose C',
  capteur_h_mm: 'hauteur du capteur',
  d_mm: 'diamètre de l’objectif',
  dec_deg: 'déclinaison',
  dimension_capteur_mm: 'dimension du capteur',
  duree_creneau_s: 'durée du créneau',
  duree_min: 'durée',
  e_ciel: 'flux du fond de ciel',
  e_obj: 'flux de l’objet',
  ech_apx: 'échantillonnage',
  facteur: 'facteur',
  focale_mm: 'focale',
  fov_deg: 'champ',
  fov_h_deg: 'champ en hauteur',
  gain_mag: 'gain en magnitude',
  intervalle_s: 'intervalle entre poses',
  latitude_deg: 'latitude',
  longitude_deg: 'longitude',
  m_int: 'magnitude intégrée',
  m_lim_oeil: 'magnitude limite à l’œil',
  mag_limite_zoom: 'magnitude limite au zoom',
  masse_air: 'masse d’air',
  n_annees: 'années écoulées',
  n_darks: 'nombre de darks',
  n_echantillons: 'nombre d’échantillons',
  n_poses: 'nombre de poses',
  offset_fuseau_h: 'décalage du fuseau',
  pitch_um: 'taille du photosite',
  px_par_degre: 'pixels par degré',
  rayon_relatif: 'rayon relatif',
  read_noise_e: 'bruit de lecture',
  sb: 'brillance de surface',
  sb_ciel: 'brillance du fond de ciel',
  sb_effectif: 'brillance de surface effective',
  sb_obj: 'brillance de surface de l’objet',
  seuil_hauteur_deg: 'seuil de hauteur',
  snr_cible: 'qualité visée',
  sqm_mesure: 'mesure au SQM',
  t_max_suivi_s: 'pose maximale du suivi',
  t_opt_s: 'pose optimale',
  t_pose_s: 'pose unitaire',
  t_recommande_s: 'pose retenue',
  t_requis_s: 'intégration requise',
  taille_objet_arcsec: 'taille de l’objet',
  taille_objet_deg: 'taille de l’objet',
  taille_raw_mo: 'poids d’une image',
  tsg_h: 'temps sidéral de Greenwich',
  tsl_h: 'temps sidéral local',
  zp_sys: 'point zéro système',

  // §8.1 — lunar model
  ad_h: 'ascension droite',
  alt_cible_deg: 'hauteur de la cible',
  alt_lune_deg: 'hauteur de la Lune',
  angle_phase_deg: 'angle de phase',
  separation_deg: 'séparation à la Lune',
  sb_ciel_noir: 'fond de ciel sans Lune',

  // §8.3 — cible score and scoring weights
  s_cadrage: 'note de cadrage',
  s_fenetre: 'note de fenêtre',
  s_hauteur: 'note de hauteur',
  s_lune: 'note de Lune',
  s_signal: 'note de signal',
  w_cadrage: 'poids du cadrage',
  w_fenetre: 'poids de la fenêtre',
  w_hauteur: 'poids de la hauteur',
  w_lune: 'poids de la Lune',
  w_signal: 'poids du signal',

  // §8.4 — night budget
  calibration_min: 'temps de calibration',
  capture_min: 'temps de capture',
  mise_en_station_min: 'temps de mise en station',
  pointage_min: 'temps de pointage',

  // §6.2, §9 — cadre and filé geometry
  dec_min_abs_deg: 'déclinaison minimale',
  duree_totale_s: 'durée totale',
  e_ciel_px_s: 'flux du fond de ciel',
  fov_l_deg: 'champ en largeur',
  maj_deg: 'grand axe',
  min_deg: 'petit axe',
  phi_deg: 'angle du grand axe',
})

/**
 * Label of a traced input. Raw-key fallback deliberate: missing label must not hide the
 * traceability line; render test flags the omission, not an empty screen (§12.5).
 */
export function libelleEntree(cle: string): string {
  return LIBELLE_ENTREE[cle] ?? cle
}

/** Flag as written beside a value: "[ESTIMÉ]", "[HORS DOMAINE]". */
export function libelleFlag(drapeau: Flag): string {
  return `[${LIBELLE_FLAG[drapeau]}]`
}
