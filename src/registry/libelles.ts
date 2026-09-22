/**
 * T-0275 — les VALEURS d'énumération en français, un `Record` exhaustif par union.
 *
 * Le glossaire (§10.1) nomme les TERMES : « Tolérance à la Lune », « Régime de pose ». Il ne
 * dit rien de ce qui s'écrit à droite du deux-points, et c'est par là que le code interne
 * sortait à l'écran — « Tolérance à la Lune : FAIBLE », « verdict : CADRAGE_LARGE ». Une
 * table par union ferme ce trou là où le glossaire ne pouvait pas : sur les valeurs.
 *
 * `Record<Union, string>` COMPLET, jamais partiel : ajouter un verdict sans lui donner de
 * libellé ne compile pas, et le compilateur nomme la valeur manquante. C'est le patron déjà
 * en vigueur pour `LIBELLE_TYPE_OBJET` (`src/ui/libelles-objet.ts`), remonté ici parce que
 * `plan-texte.ts` (§11.2) en a besoin aussi : l'export porte les mêmes verdicts que l'écran,
 * et deux tables de libellés finiraient par ne plus dire la même chose.
 *
 * Les libellés sont en MINUSCULE : ils suivent un deux-points dans une phrase, pas un titre.
 *
 * Ce fichier importe des TYPES du cœur et des données, sans rien en exécuter — même procédé
 * que `filters.ts` avec `TypeObjet`. Le registre reste sans dépendance à l'exécution.
 */

import type { LotCalibration } from '../core/calibration.ts'
import type { VerdictDetectabilite, ToleranceLune } from '../core/detectability.ts'
import type { RegimePose } from '../core/exposure.ts'
import type { EtatNuit } from '../core/night.ts'
import type { ModePointage } from '../core/pointage.ts'
import type { CauseEcart } from '../core/session-types.ts'
import type { SourceSb } from '../core/sky-background.ts'
import type { Flag } from '../core/traced.ts'
import type { IntegritePaquet } from '../data/catalog.ts'
import type { DisponibiliteHorsLigne, ModeReseau } from '../data/degradation.ts'
import type { ZpSource } from '../data/equipment.ts'
import type { VerdictCadrage } from './verdicts.ts'

/** §6.2 — ce que le cadre fait de la cible. */
export const LIBELLE_VERDICT_CADRAGE: Readonly<Record<VerdictCadrage, string>> = Object.freeze({
  MOSAIQUE_REQUISE: 'mosaïque requise',
  CADRAGE_SERRE: 'cadrage serré',
  CADRAGE_OPTIMAL: 'cadrage optimal',
  CADRAGE_LARGE: 'cadrage large',
  CADRAGE_PERDU: 'cible perdue dans le champ',
  HORS_DOMAINE: 'hors du domaine de cadrage',
})

/** §6.3 — ce qui verra la cible. Reprend les libellés de la table supprimée au commit 633b5f9. */
export const LIBELLE_VERDICT_DETECTABILITE: Readonly<Record<VerdictDetectabilite, string>> =
  Object.freeze({
    OEIL_NU: 'à l’œil nu',
    JUMELLES: 'aux jumelles',
    TELESCOPE: 'au télescope',
    PHOTO_SEULE: 'en photo seulement',
  })

/** §6.3 — ce que le type d'objet supporte de Lune. */
export const LIBELLE_TOLERANCE_LUNE: Readonly<Record<ToleranceLune, string>> = Object.freeze({
  FORTE: 'forte',
  MOYENNE: 'moyenne',
  FAIBLE: 'faible',
})

/** §7.2 — ce qui borne la pose unitaire. */
export const LIBELLE_REGIME_POSE: Readonly<Record<RegimePose, string>> = Object.freeze({
  NOMINAL: 'nominal',
  LIMITE_SUIVI: 'limité par le suivi',
})

/** §3.2 — ce que la nuit offre à cette date et cette latitude. */
export const LIBELLE_ETAT_NUIT: Readonly<Record<EtatNuit, string>> = Object.freeze({
  NUIT_ASTRONOMIQUE: 'nuit astronomique complète',
  PAS_DE_NUIT_ASTRONOMIQUE: 'pas de nuit astronomique — crépuscule permanent',
  NUIT_POLAIRE: 'nuit polaire — le Soleil ne se lève pas',
})

/** §2.2 — d'où vient le fond de ciel retenu. */
export const LIBELLE_SOURCE_SB: Readonly<Record<SourceSb, string>> = Object.freeze({
  TABLE_BORTLE: 'table de Bortle',
  SQM_MESURE: 'mesure au SQM',
})

/**
 * Ce qu'un drapeau de traçabilité dit de la valeur qu'il accompagne : « 20,2 mag [ESTIMÉ] ».
 * La forme — capitales entre crochets — est celle déjà employée par les messages des moteurs ;
 * en changer ici aurait fait cohabiter deux badges pour la même notion. Les gloses complètes
 * restent dans `traced.ts`.
 */
export const LIBELLE_FLAG: Readonly<Record<Flag, string>> = Object.freeze({
  ESTIME: 'ESTIMÉ',
  HYP: 'HYPOTHÈSE',
  DONNEE_MANQUANTE: 'DONNÉE MANQUANTE',
  HORS_DOMAINE: 'HORS DOMAINE',
})

/** §11.1 — comment on amène l'instrument sur la cible. */
export const LIBELLE_MODE_POINTAGE: Readonly<Record<ModePointage, string>> = Object.freeze({
  CARTE_DIRECTE: 'à la carte, directement',
  CHEMINEMENT: 'de proche en proche',
})

/** §8.3 — pourquoi une cible n'entre pas au plan. */
export const LIBELLE_CAUSE_ECART: Readonly<Record<CauseEcart, string>> = Object.freeze({
  DONNEE_MANQUANTE: 'donnée manquante au catalogue',
  CADRAGE: 'cadrage impossible',
  HAUTEUR: 'trop basse',
  RELIEF: 'cachée par le relief',
  FENETRE: 'hors de la fenêtre nocturne',
  HORS_PORTEE: 'hors de portée de ce matériel',
  CONFLIT_CRENEAU: 'créneau déjà pris',
  SUIVI: 'sans suivi, pas de ciel profond',
})

/** §7.4 — les lots de calibration. Le jargon d'atelier fait foi : personne ne dit « noirs ». */
export const LIBELLE_LOT_CALIBRATION: Readonly<Record<LotCalibration['type'], string>> =
  Object.freeze({
    FLATS: 'flats — plages uniformes',
    DARKS: 'darks — poses noires',
    OFFSETS: 'offsets — bruit de lecture',
  })

/** §7.1 — d'où vient le point zéro système, à afficher partout où une pose l'est. */
export const LIBELLE_ZP_SOURCE: Readonly<Record<ZpSource, string>> = Object.freeze({
  BASE_MATERIEL: 'base matériel',
  GENERIQUE: 'valeur générique',
})

/** §12.5 — l'état du réseau au démarrage. */
export const LIBELLE_MODE_RESEAU: Readonly<Record<ModeReseau, string>> = Object.freeze({
  EN_LIGNE: 'en ligne',
  HORS_LIGNE: 'hors ligne',
  DEGRADE: 'dégradé',
})

/** §12.5 — ce qu'une fonction devient sans réseau. */
export const LIBELLE_DISPONIBILITE_HORS_LIGNE: Readonly<
  Record<DisponibiliteHorsLigne, string>
> = Object.freeze({
  COMPLET: 'complet',
  COMPLET_SI_EN_CACHE: 'complet si déjà en cache',
  TOMBE: 'indisponible',
})

/** §12.2 — l'état d'un paquet de données face à son manifeste. */
export const LIBELLE_INTEGRITE_PAQUET: Readonly<Record<IntegritePaquet, string>> = Object.freeze({
  OK: 'intègre',
  CORROMPU: 'corrompu',
  ABSENT: 'absent',
})

/**
 * §10.2 — les entrées d'une valeur tracée, telles qu'elles s'affichent sous elle.
 *
 * Les clés de `Traced.inputs` sont libres : chaque appel de `trace()` les écrit à la main,
 * donc aucun `Record` exhaustif ne peut les couvrir et le compilateur ne peut pas garder
 * cette table complète. C'est le test de rendu qui le fait — il échoue sur tout identifiant
 * snake_case qui atteindrait une surface principale.
 *
 * L'EXPRESSION de la formule, elle, reste brute : `sb = m_int + 2,5·log(aire)` est le
 * livrable du niveau 3 de §10.2, celui qui se rapproche du PRD. La traduire l'effacerait.
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

  // §8.1 — modèle lunaire
  ad_h: 'ascension droite',
  alt_cible_deg: 'hauteur de la cible',
  alt_lune_deg: 'hauteur de la Lune',
  angle_phase_deg: 'angle de phase',
  separation_deg: 'séparation à la Lune',
  sb_ciel_noir: 'fond de ciel sans Lune',

  // §8.3 — score d'une cible et poids du scoring
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

  // §8.4 — budget de la nuit
  calibration_min: 'temps de calibration',
  capture_min: 'temps de capture',
  mise_en_station_min: 'temps de mise en station',
  pointage_min: 'temps de pointage',

  // §6.2, §9 — géométrie du cadre et du filé
  dec_min_abs_deg: 'déclinaison minimale',
  duree_totale_s: 'durée totale',
  e_ciel_px_s: 'flux du fond de ciel',
  fov_l_deg: 'champ en largeur',
  maj_deg: 'grand axe',
  min_deg: 'petit axe',
  phi_deg: 'angle du grand axe',
})

/**
 * Le libellé d'une entrée tracée. Le repli sur la clé brute est délibéré : une entrée sans
 * libellé ne doit pas faire disparaître la ligne de traçabilité — c'est le test de rendu qui
 * signale l'oubli, pas un écran vide (§12.5, un manque se lit).
 */
export function libelleEntree(cle: string): string {
  return LIBELLE_ENTREE[cle] ?? cle
}

/** Un drapeau tel qu'il s'écrit à côté d'une valeur : « [ESTIMÉ] », « [HORS DOMAINE] ». */
export function libelleFlag(drapeau: Flag): string {
  return `[${LIBELLE_FLAG[drapeau]}]`
}
