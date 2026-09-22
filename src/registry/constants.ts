/**
 * §2.1 — Registre de constantes de référence.
 *
 * Toute valeur qui n'est pas le résultat d'une formule vient d'ici. Chaque entrée porte
 * sa valeur, son unité, sa source nommée, sa tolérance et les sections consommatrices.
 *
 * Le registre est en lecture seule à l'exécution. Il n'existe aucun mécanisme
 * d'ajustement automatique : ni apprentissage, ni retour utilisateur, ni télémétrie.
 * Une prédiction reproductible est vérifiable ; une prédiction qui dérive ne l'est pas.
 */

export interface ConstantEntry {
  /** Référence au tableau du PRD : « C-03 » pour les conventionnelles, « A-… » pour les exactes. */
  readonly ref: string
  readonly libelle: string
  readonly valeur: number
  readonly unite: string
  readonly source: string
  /** `null` pour une constante exacte, sans tolérance. */
  readonly tolerance: string | null
  /**
   * Vrai quand la tolérance est « ordre de grandeur » : toute sortie qui en dépend
   * s'affiche avec sa plage, jamais comme une valeur exacte (§2.1, dernier critère).
   */
  readonly ordreDeGrandeur: boolean
  /**
   * Bornes déclarées de la tolérance, quand le PRD les chiffre. La plage générique de
   * `plageOrdreDeGrandeur` — un facteur deux — est une convention de repli : elle serait
   * fausse pour une constante dont le PRD annonce un intervalle plus étroit (§7.6, L-04).
   */
  readonly plage?: readonly [number, number]
  readonly sections: readonly string[]
  /** Constante conservée pour mémoire mais qu'aucun moteur ne doit consommer. */
  readonly deprecie?: string
}

function entree(e: ConstantEntry): ConstantEntry {
  return Object.freeze(e)
}

/** Constantes astronomiques exactes — aucune tolérance. */
const EXACTES = {
  ROTATION_CIEL_DEG_H: entree({
    ref: 'A-ROT',
    libelle: 'Rotation apparente du ciel',
    valeur: 15.041,
    unite: '°/h',
    source: 'constante astronomique exacte',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.1', '9.1', '9.3'],
  }),
  JOUR_SIDERAL_S: entree({
    ref: 'A-SID',
    libelle: 'Jour sidéral',
    valeur: 86164.09,
    unite: 's',
    source: 'constante astronomique exacte',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.1'],
  }),
  JOUR_SOLAIRE_S: entree({
    ref: 'A-SOL',
    libelle: 'Jour solaire moyen',
    valeur: 86400,
    unite: 's',
    source: 'constante astronomique exacte',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.1'],
  }),
  // §2.1 — conservées pour mémoire depuis que §3.2 ne propose plus de sauts par période :
  // une constante exacte et sourcée ne coûte rien à garder, et la table du PRD la cite.
  MOIS_SYNODIQUE_J: entree({
    ref: 'A-SYN',
    libelle: 'Mois synodique',
    valeur: 29.5306,
    unite: 'j',
    source: 'constante astronomique exacte',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['2.1'],
  }),
  ANNEE_TROPIQUE_J: entree({
    ref: 'A-TRO',
    libelle: 'Année tropique',
    valeur: 365.2422,
    unite: 'j',
    source: 'constante astronomique exacte',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['2.1'],
  }),
  PRECESSION_ARCSEC_AN: entree({
    ref: 'A-PRE',
    libelle: 'Précession générale',
    valeur: 50.29,
    unite: '"/an',
    source: 'constante astronomique exacte',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.1', '3.4'],
  }),
  RADIAN_EN_ARCSEC: entree({
    ref: 'A-RAD',
    libelle: 'Radian en arcsecondes',
    valeur: 206265,
    unite: '"/rad',
    source: 'constante astronomique exacte',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['5.1'],
  }),
  DAWES_NUMERATEUR: entree({
    ref: 'A-DAW',
    libelle: 'Numérateur de la limite de Dawes',
    valeur: 116,
    unite: '"·mm',
    source: 'limite de Dawes, 116 / D(mm)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['5.1'],
  }),
  REFRACTION_HORIZON_ARCMIN: entree({
    ref: 'A-REF',
    libelle: 'Réfraction à l’horizon vrai',
    valeur: 34,
    unite: "'",
    source: 'valeur conventionnelle de la réfraction à l’horizon',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['12.4'],
  }),
  EPOQUE_FRONTIERES_IAU: entree({
    ref: 'A-B1875',
    libelle: 'Époque des frontières IAU',
    valeur: 1875.0,
    unite: 'année (B)',
    source: 'découpage de Delporte (1930), coordonnées B1875.0',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.4'],
  }),
  HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG: entree({
    ref: 'A-CRE',
    libelle: 'Hauteur du Soleil définissant le crépuscule astronomique',
    valeur: -18,
    unite: '°',
    source: 'définition du crépuscule astronomique',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  HAUTEUR_CREPUSCULE_NAUTIQUE_DEG: entree({
    ref: 'A-CRN',
    libelle: 'Hauteur du Soleil définissant le crépuscule nautique',
    valeur: -12,
    unite: '°',
    source: 'définition du crépuscule nautique',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  POGSON: entree({
    ref: 'A-POG',
    libelle: 'Coefficient de l’échelle de Pogson',
    valeur: 2.5,
    unite: '—',
    source: 'définition de la magnitude',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['2.3', '6.3', '7.1', '3.3'],
  }),
  BASE_MAGNITUDE: entree({
    ref: 'A-BAS',
    libelle: 'Base de l’échelle des magnitudes',
    valeur: 10,
    unite: '—',
    source: 'définition de la magnitude — un rapport de flux de 100 pour 5 magnitudes',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['6.3', '7.1'],
  }),
  AIRE_ELLIPSE_DIAMETRES: entree({
    ref: 'A-ELL',
    libelle: 'Diviseur de l’aire d’une ellipse donnée par ses diamètres',
    valeur: 4,
    unite: '—',
    source: 'géométrie — aire = π / 4 × a × b quand a et b sont les diamètres',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['6.3'],
  }),
  MO_PAR_GO: entree({
    ref: 'A-GO',
    libelle: 'Mégaoctets par gigaoctet',
    valeur: 1024,
    unite: 'Mo/Go',
    source: 'préfixe binaire',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['7.3'],
  }),
  DEG_PAR_RADIAN_APPROX: entree({
    ref: 'A-DEP',
    libelle: 'Facteur 57,296 (deg/rad)',
    valeur: 57.296,
    unite: '°/rad',
    source: 'approximation petits angles',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['5.1'],
    deprecie:
      "Remplacée par l'arctangente (§5.1, Annexe C ligne 4) : l'approximation linéaire " +
      'donne 205,7° à 10 mm sur plein format, valeur physiquement impossible. ' +
      'Aucun moteur ne doit consommer cette entrée.',
  }),
} as const

/** Constantes conventionnelles — sourcées, avec tolérance. */
const CONVENTIONNELLES = {
  MIDI_JOUR_OBSERVATIONNEL_H: entree({
    ref: 'C-49',
    libelle: 'Heure locale séparant deux nuits d’observation',
    valeur: 12,
    unite: 'h',
    source: 'convention — le jour d’observation court d’un midi au suivant',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['4.1', '8.1'],
  }),
  SEUIL_HAUTEUR_IMAGERIE_DEG: entree({
    ref: 'C-01',
    libelle: 'Seuil de hauteur en imagerie (masse d’air 2)',
    valeur: 30,
    unite: '°',
    source: 'convention',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['4.1', '8.2'],
  }),
  SEUIL_HAUTEUR_VISUEL_DEG: entree({
    ref: 'C-02',
    libelle: 'Seuil de hauteur en visuel',
    valeur: 20,
    unite: '°',
    source: 'convention',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['4.1', '8.2'],
  }),
  FACTEUR_POSE_C_DEFAUT: entree({
    ref: 'C-03',
    libelle: 'Facteur de pose C, mode par défaut',
    valeur: 10,
    unite: '—',
    source: 'socle',
    tolerance: 'optimum plat, voir §2.3',
    ordreDeGrandeur: false,
    sections: ['7.2'],
  }),
  FACTEUR_POSE_C_PERMISSIF: entree({
    ref: 'C-03',
    libelle: 'Facteur de pose C, mode permissif',
    valeur: 3,
    unite: '—',
    source: 'socle',
    tolerance: 'optimum plat, voir §2.3',
    ordreDeGrandeur: false,
    sections: ['7.2'],
  }),
  ECHANTILLONNAGE_NOMINAL_MIN: entree({
    ref: 'C-04',
    libelle: 'Échantillonnage nominal, borne basse',
    valeur: 1,
    unite: '"/px',
    source: 'convention',
    tolerance: 'dépend du seeing',
    ordreDeGrandeur: false,
    sections: ['5.1'],
  }),
  ECHANTILLONNAGE_NOMINAL_MAX: entree({
    ref: 'C-04',
    libelle: 'Échantillonnage nominal, borne haute',
    valeur: 2,
    unite: '"/px',
    source: 'convention',
    tolerance: 'dépend du seeing',
    ordreDeGrandeur: false,
    sections: ['5.1'],
  }),
  ECHANTILLONNAGE_SOUS_MODERE_MAX: entree({
    ref: 'C-04',
    libelle: 'Sous-échantillonnage modéré, borne haute',
    valeur: 4,
    unite: '"/px',
    source: 'convention — au-delà, la résolution est limitée par le pixel, non par l’optique',
    tolerance: 'dépend du seeing',
    ordreDeGrandeur: false,
    sections: ['5.1'],
  }),
  SB_PIC_M42_MAG: entree({
    ref: 'C-SB42',
    libelle: 'Brillance de surface de pic du cœur de M42',
    valeur: 17,
    unite: 'mag/arcsec²',
    source:
      'Clark, « Surface Brightness of Deep Sky Objects » (2004) — même auteur que le modèle ' +
      'de seuil de contraste de §6.3. M42 est la nébuleuse diffuse la plus brillante du ciel : ' +
      'son pic borne par le haut la brillance de TOUTE nébuleuse diffuse, et une moyenne sur ' +
      'l’objet entier ne peut pas dépasser son propre pic. Une SB calculée plus brillante que ' +
      'celle-là ne mesure donc pas la nébuleuse — c’est une magnitude ponctuelle, celle de ' +
      'l’étoile excitatrice ou d’un objet apparié (T-0317).',
    tolerance: '±0,5 mag/arcsec² — la borne sert d’ordre de grandeur, pas de seuil fin',
    ordreDeGrandeur: false,
    sections: ['6.3', '12.2'],
  }),
  REMPLISSAGE_CADRE_MIN: entree({
    ref: 'C-05',
    libelle: 'Remplissage de cadre, borne basse',
    valeur: 1 / 3,
    unite: '—',
    source: 'convention',
    tolerance: 'subjectif',
    ordreDeGrandeur: false,
    sections: ['6.1', '6.2'],
  }),
  REMPLISSAGE_CADRE_MAX: entree({
    ref: 'C-05',
    libelle: 'Remplissage de cadre, borne haute',
    valeur: 1 / 2,
    unite: '—',
    source: 'convention',
    tolerance: 'subjectif',
    ordreDeGrandeur: false,
    sections: ['6.1', '6.2'],
  }),
  REMPLISSAGE_CADRE_CIBLE: entree({
    ref: 'C-05',
    libelle: 'Remplissage visé pour la focale idéale',
    valeur: 0.42,
    unite: '—',
    source: '§6.1 — milieu de la plage C-05, entre le tiers et la moitié du champ',
    tolerance: 'subjectif',
    ordreDeGrandeur: false,
    sections: ['6.1'],
  }),
  DIAMETRE_PIXELS_MIN: entree({
    ref: 'C-05',
    libelle: 'Diamètre en pixels sous lequel aucun détail n’est exploitable',
    valeur: 50,
    unite: 'px',
    source: '§6.2 — sous ce diamètre l’objet est un amas de pixels',
    tolerance: 'convention',
    ordreDeGrandeur: false,
    sections: ['6.2'],
  }),
  PUPILLE_JUMELLES_MM: entree({
    ref: 'C-11',
    libelle: 'Diamètre des jumelles de référence',
    valeur: 50,
    unite: 'mm',
    source: '§6.3 — jumelles 50 mm, matériel d’entrée le plus répandu',
    tolerance: 'convention',
    ordreDeGrandeur: false,
    sections: ['6.3'],
  }),
  READ_NOISE_DEFAUT_E: entree({
    ref: 'C-03',
    libelle: 'Bruit de lecture par défaut, boîtier inconnu',
    valeur: 3.0,
    unite: 'e⁻',
    source: '§7.2 — repli quand la base matériel ne donne pas la courbe du boîtier',
    tolerance: '[À VÉRIFIER] par boîtier ; le résultat porte [ESTIMÉ]',
    ordreDeGrandeur: false,
    sections: ['7.2'],
  }),
  TAILLE_RAW_MO_GENERIQUE: entree({
    ref: 'C-37',
    libelle: 'Taille de fichier RAW par défaut, boîtier inconnu',
    valeur: 25,
    unite: 'Mo',
    source: '§5.1 — repli quand le boîtier saisi ne donne pas sa taille de RAW',
    tolerance: 'ordre de grandeur ; le budget de stockage porte [ESTIMÉ]',
    ordreDeGrandeur: true,
    sections: ['5.1', '7.3', '9.4'],
  }),
  INTEGRATION_PLAFOND_H: entree({
    ref: 'C-03',
    libelle: 'Plafond d’intégration affichée',
    valeur: 24,
    unite: 'h',
    source: '§7.3 — au-delà, la cible est annoncée hors de portée du setup, pas chiffrée',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['7.3'],
  }),
  NPF_K_STRICT: entree({
    ref: 'C-06',
    libelle: 'Tolérance NPF, mode strict',
    valeur: 1.0,
    unite: '—',
    source: 'règle NPF',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['9.1'],
  }),
  NPF_K_TOLERANT: entree({
    ref: 'C-06',
    libelle: 'Tolérance NPF, mode tolérant',
    valeur: 2.0,
    unite: '—',
    source: 'règle NPF',
    tolerance: 'jamais appliqué en silence (§2.4)',
    ordreDeGrandeur: false,
    sections: ['9.1'],
  }),
  NPF_COEF_OUVERTURE: entree({
    ref: 'C-06',
    libelle: 'Coefficient d’ouverture de la règle NPF',
    valeur: 35,
    unite: 'mm·s',
    source: 'règle NPF — t = k × (35 × N + 30 × pitch_um) / (focale_mm × cos δ)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['9.1'],
  }),
  NPF_COEF_PITCH: entree({
    ref: 'C-06',
    libelle: 'Coefficient de pitch de la règle NPF',
    valeur: 30,
    unite: 'mm·s/µm',
    source: 'règle NPF — t = k × (35 × N + 30 × pitch_um) / (focale_mm × cos δ)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['9.1'],
  }),
  PLAFOND_POSE_SANS_AUTOGUIDAGE_S: entree({
    ref: 'C-07',
    libelle: 'Plafond de pose sans autoguidage',
    valeur: 240,
    unite: 's',
    source: 'convention terrain',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['5.2', '7.2'],
  }),
  RECOUVREMENT_MOSAIQUE: entree({
    ref: 'C-08',
    libelle: 'Recouvrement de mosaïque',
    valeur: 0.15,
    unite: '—',
    source: 'convention',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['6.2'],
  }),
  INTERVALLE_INTER_POSE_FILE_MAX_S: entree({
    ref: 'C-09',
    libelle: 'Intervalle inter-pose en filé',
    valeur: 1,
    unite: 's',
    source: 'socle',
    tolerance: 'contrainte dure',
    ordreDeGrandeur: false,
    sections: ['9.4'],
  }),
  PUPILLE_OEIL_ADAPTE_MM: entree({
    ref: 'C-11',
    libelle: 'Pupille de l’œil adapté à l’obscurité',
    valeur: 6.5,
    unite: 'mm',
    source: 'convention',
    tolerance: '5 à 8 mm selon l’âge',
    ordreDeGrandeur: false,
    sections: ['6.3'],
  }),
  T_REF_SOIGNE_200MM_S: entree({
    ref: 'C-12',
    libelle: 'Pose de référence à 200 mm, mise en station soignée',
    valeur: 120,
    unite: 's',
    source: 'socle (1 à 4 min)',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['5.2', '7.2'],
  }),
  T_REF_APPROX_200MM_S: entree({
    ref: 'C-13',
    libelle: 'Pose de référence à 200 mm, mise en station approximative',
    valeur: 45,
    unite: 's',
    source: 'socle',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['5.2', '7.2'],
  }),
  FOCALE_REFERENCE_SUIVI_MM: entree({
    ref: 'C-12/C-13',
    libelle: 'Focale de référence des poses de suivi',
    valeur: 200,
    unite: 'mm',
    source: 'socle — t_max_suivi = t_ref × (200 / focale_mm)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['5.2'],
  }),
  ZP_SYS_GENERIQUE: entree({
    ref: 'C-14',
    libelle: 'Point zéro système générique',
    valeur: 20.2,
    unite: 'mag',
    source: 'dérivé, voir §2.3',
    tolerance: '± 0,5 mag',
    ordreDeGrandeur: false,
    sections: ['2.3', '7.1'],
  }),
  POIDS_SCORING_CADRAGE: entree({
    ref: 'C-15',
    libelle: 'Poids de scoring — cadrage',
    valeur: 0.25,
    unite: '—',
    source: 'convention, réglable',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.3'],
  }),
  POIDS_SCORING_HAUTEUR: entree({
    ref: 'C-15',
    libelle: 'Poids de scoring — hauteur',
    valeur: 0.2,
    unite: '—',
    source: 'convention, réglable',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.3'],
  }),
  POIDS_SCORING_SNR: entree({
    ref: 'C-15',
    libelle: 'Poids de scoring — rapport signal sur bruit',
    valeur: 0.3,
    unite: '—',
    source: 'convention, réglable',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.3'],
  }),
  POIDS_SCORING_FENETRE: entree({
    ref: 'C-15',
    libelle: 'Poids de scoring — fenêtre d’observation',
    valeur: 0.15,
    unite: '—',
    source: 'convention, réglable',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.3'],
  }),
  POIDS_SCORING_LUNE: entree({
    ref: 'C-15',
    libelle: 'Poids de scoring — Lune',
    valeur: 0.1,
    unite: '—',
    source: 'convention, réglable',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.3'],
  }),
  HAUTEUR_MIN_MASSE_AIR_DEG: entree({
    ref: 'C-17',
    libelle: 'Hauteur sous laquelle l’approximation 1 / sin(alt) cesse d’être valide',
    valeur: 15,
    unite: '°',
    source: 'Annexe B — masse d’air valide au-dessus d’environ 15°',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['8.2'],
  }),
} as const

/**
 * §8.1 — Modèle de brillance lunaire de Krisciunas & Schaefer (1991).
 *
 * Les coefficients viennent de la publication, telle que le PRD la cite. Ils sont ici
 * plutôt qu'en dur dans le moteur pour la même raison que le reste du registre : une
 * constante recopiée dans un moteur devient invérifiable.
 */
const LUNE = {
  KS_MAGNITUDE_LUNE_PLEINE: entree({
    ref: 'L-01',
    libelle: 'Magnitude de la Lune à l’opposition, modèle KS91',
    valeur: 3.84,
    unite: 'mag',
    source: 'Krisciunas & Schaefer (1991), I*(α) = 10^(−0,4 × (3,84 + 0,026 |α| + 4e−9 α⁴))',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  KS_COEF_PHASE: entree({
    ref: 'L-01',
    libelle: 'Coefficient linéaire de l’angle de phase, modèle KS91',
    valeur: 0.026,
    unite: 'mag/°',
    source: 'Krisciunas & Schaefer (1991)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  KS_COEF_PHASE_4: entree({
    ref: 'L-01',
    libelle: 'Coefficient quartique de l’angle de phase, modèle KS91',
    valeur: 4e-9,
    unite: 'mag/°⁴',
    source: 'Krisciunas & Schaefer (1991)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  KS_RAYLEIGH_LOG: entree({
    ref: 'L-02',
    libelle: 'Amplitude de la diffusion de Rayleigh, en log₁₀',
    valeur: 5.36,
    unite: '—',
    source: 'Krisciunas & Schaefer (1991), f(ρ) = 10^5,36 × (1,06 + cos²ρ) + 10^(6,15 − ρ/40)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  KS_RAYLEIGH_CONSTANTE: entree({
    ref: 'L-02',
    libelle: 'Terme constant de la diffusion de Rayleigh',
    valeur: 1.06,
    unite: '—',
    source: 'Krisciunas & Schaefer (1991)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  KS_MIE_LOG: entree({
    ref: 'L-02',
    libelle: 'Amplitude de la diffusion de Mie, en log₁₀',
    valeur: 6.15,
    unite: '—',
    source: 'Krisciunas & Schaefer (1991)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  KS_MIE_ECHELLE_DEG: entree({
    ref: 'L-02',
    libelle: 'Échelle angulaire de la diffusion de Mie',
    valeur: 40,
    unite: '°',
    source: 'Krisciunas & Schaefer (1991)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  KS_MASSE_AIR_COEF: entree({
    ref: 'L-03',
    libelle: 'Coefficient de la masse d’air de Krisciunas & Schaefer',
    valeur: 0.96,
    unite: '—',
    source: 'Krisciunas & Schaefer (1991), X(Z) = (1 − 0,96 sin²Z)^(−1/2)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  EXTINCTION_V_MAG_PAR_MASSE_AIR: entree({
    ref: 'L-04',
    libelle: 'Coefficient d’extinction atmosphérique en bande V',
    valeur: 0.172,
    unite: 'mag/masse d’air',
    source: 'valeur de site de montagne retenue par Krisciunas & Schaefer (1991)',
    tolerance: 'ordre de grandeur — 0,15 à 0,30 selon la transparence du soir',
    ordreDeGrandeur: true,
    plage: [0.15, 0.3],
    sections: ['7.6', '8.1'],
  }),
  NANOLAMBERT_ECHELLE: entree({
    ref: 'L-05',
    libelle: 'Échelle de conversion brillance de surface → nanolamberts',
    valeur: 34.08,
    unite: 'nL',
    source: 'Garstang, via Krisciunas & Schaefer (1991) : B = 34,08 × exp(20,7233 − 0,92104 V)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  NANOLAMBERT_OFFSET: entree({
    ref: 'L-05',
    libelle: 'Terme constant de la conversion en nanolamberts',
    valeur: 20.7233,
    unite: '—',
    source: 'Garstang, via Krisciunas & Schaefer (1991)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  NANOLAMBERT_PENTE: entree({
    ref: 'L-05',
    libelle: 'Pente de la conversion en nanolamberts',
    valeur: 0.92104,
    unite: '1/mag',
    source: 'Garstang, via Krisciunas & Schaefer (1991)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.1'],
  }),
  PENALITE_SB_CREPUSCULE_NAUTIQUE_MAG: entree({
    ref: 'C-18',
    libelle: 'Pénalité de fond de ciel du crépuscule nautique',
    valeur: 1.0,
    unite: 'mag/arcsec²',
    source:
      '§8.1 — mode dégradé quand la nuit astronomique est nulle : la fenêtre nautique est ' +
      'retenue et sa pénalité de fond de ciel est chiffrée plutôt que passée sous silence',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['8.1'],
  }),
} as const

/** §8.3 — plan de session ordonné : budget de nuit et scoring. */
const PLANIFICATION = {
  TEMPS_MISE_EN_STATION_MIN: entree({
    ref: 'C-19',
    libelle: 'Temps de mise en station',
    valeur: 15,
    unite: 'min',
    source: '§8.3 — « temps_mise_en_station ≈ 15 min »',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['8.3'],
  }),
  TEMPS_POINTAGE_PAR_CIBLE_MIN: entree({
    ref: 'C-19',
    libelle: 'Temps de pointage par cible, sans GoTo',
    valeur: 10,
    unite: 'min',
    source: '§8.3 et §8.4 — cheminement ou carte directe, recadrage et vérification compris',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['8.3', '8.4'],
  }),
  TOLERANCE_LUNE_DELTA_SB_MAG: entree({
    ref: 'C-15',
    libelle: 'Dégradation lunaire annulant le score de Lune',
    valeur: 3.0,
    unite: 'mag/arcsec²',
    source: '§8.3 — S_lune = 1 − ΔSB_lune / 3,0, borné à [0 ; 1]',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.3'],
  }),
  ETENDUE_SCORE_HAUTEUR_DEG: entree({
    ref: 'C-15',
    libelle: 'Étendue de hauteur au-dessus du seuil saturant le score',
    valeur: 40,
    unite: '°',
    source: '§8.3 — S_hauteur = min(1, (alt_culmination − 30) / 40)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.3'],
  }),
  CIBLES_LISTEES_MAX: entree({
    ref: 'C-20',
    libelle: 'Nombre de lignes rendues par la liste du catalogue',
    valeur: 200,
    unite: '—',
    source:
      '§6.4 — « un plafond borne le nombre de résultats RENDUS, jamais l’étendue ' +
      'parcourue » : le filtre et la recherche tombent avant lui',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['6.4'],
  }),
  CIBLES_EVALUEES_MAX: entree({
    ref: 'C-20',
    libelle: 'Nombre de cibles soumises au calcul de créneau par la liste du catalogue',
    valeur: 200,
    unite: '—',
    source:
      '§6.4 — borne de calcul propre à la liste : le créneau coûte une éphéméride par ' +
      'cible, et la liste n’hérite pas du budget du plan de séance (C-20, §8.3)',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['6.4'],
  }),
  FACILITE_NOTE_MAX: entree({
    ref: 'C-20',
    libelle: 'Note maximale de facilité de prise de vue',
    valeur: 5,
    unite: '—',
    source:
      '§6.4 — échelle affichée. La note découpe le score C-15 de §8.3 en parts égales : ' +
      'l’échelle EST le seuillage, donc aucune borne de classe n’est à déclarer',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['6.4', '8.3'],
  }),
} as const

/** §8.4 — cheminement d'étoiles et carte de pointage. */
const POINTAGE = {
  FOV_SEUIL_CARTE_DIRECTE_DEG: entree({
    ref: 'C-21',
    libelle: 'Champ au-delà duquel la carte directe remplace le cheminement',
    valeur: 8,
    unite: '°',
    source: '§8.4 — au-delà, le cadre contient toujours plusieurs étoiles brillantes',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.4'],
  }),
  MAG_ANCRAGE_PRINCIPAL_MAX: entree({
    ref: 'C-21',
    libelle: 'Magnitude maximale de l’ancrage principal',
    valeur: 4.5,
    unite: 'mag',
    source: '§8.4 — fiabilité en ciel dégradé',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.4'],
  }),
  MAG_DEPART_CHEMINEMENT_MAX: entree({
    ref: 'C-21',
    libelle: 'Magnitude maximale de l’étoile de départ d’un cheminement',
    valeur: 3.5,
    unite: 'mag',
    source: '§8.4 — le point de départ doit être identifiable à l’œil nu sans hésitation',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.4'],
  }),
  MAG_SAUT_MAX: entree({
    ref: 'C-21',
    libelle: 'Magnitude maximale d’une étoile de saut',
    valeur: 6.5,
    unite: 'mag',
    source: '§8.4 — visible dans un chercheur',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.4'],
  }),
  RECOUVREMENT_SAUT: entree({
    ref: 'C-21',
    libelle: 'Fraction du champ de chercheur admise pour un saut',
    valeur: 0.7,
    unite: '—',
    source: '§8.4 — distance ≤ 0,7 × FOV_chercheur, recouvrement garanti',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.4'],
  }),
  SAUTS_MAX: entree({
    ref: 'C-21',
    libelle: 'Nombre maximal de sauts d’un cheminement',
    valeur: 5,
    unite: '—',
    source: '§8.4 — au-delà, l’app propose la contrainte à relâcher plutôt qu’un itinéraire',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['8.4'],
  }),
} as const

/** §7.5, §10.3 — conseil filtre chiffré, et §11.1 — mode nuit. */
const TERRAIN = {
  LARGEUR_BANDE_LARGE_NM: entree({
    ref: 'C-22',
    libelle: 'Largeur de bande de référence en large bande',
    valeur: 300,
    unite: 'nm',
    source:
      '§7.5 — fenêtre visible utile d’un capteur sans filtre, base du rapport de fond de ciel ' +
      'transmis par une bande étroite',
    tolerance: 'ordre de grandeur — dépend de la courbe du filtre infrarouge du boîtier',
    ordreDeGrandeur: true,
    sections: ['7.5', '10.3'],
  }),
  BORTLE_SEUIL_CONSEIL_FILTRE: entree({
    ref: 'C-22',
    libelle: 'Classe Bortle à partir de laquelle le conseil filtre se déclenche',
    valeur: 5,
    unite: '—',
    source: '§7.5 — déclenchement si SB dégradé par la Lune OU bortle ≥ 5',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['7.5', '10.3'],
  }),
  TUILES_SEUIL_FOCALE_COURTE: entree({
    ref: 'C-22',
    libelle: 'Nombre de tuiles au-delà duquel une focale plus courte est recommandée',
    valeur: 4,
    unite: '—',
    source: '§10.3 — « focale plus courte si MOSAIQUE_REQUISE et n_tuiles > 4 »',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['10.3'],
  }),
  LUMINANCE_PLANCHER_MODE_NUIT: entree({
    ref: 'C-23',
    libelle: 'Plancher du facteur de luminance du mode nuit',
    valeur: 0.02,
    unite: '—',
    source: '§11.1 — « réglable jusqu’à un plancher de ≈ 2 % de la luminance nominale »',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['11.1'],
  }),
} as const

/** §3.1 à §3.5 — pipeline temporel, moteur de rendu, tracés et cadre matériel. */
const RENDU = {
  EPOQUE_J2000_ANNEE: entree({
    ref: 'A-J2K',
    libelle: 'Année de l’époque de référence J2000,0',
    valeur: 2000,
    unite: 'année',
    source: 'époque standard J2000,0 — 1er janvier 2000 à 12 h TT',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.1', '3.3'],
  }),
  ANNEE_JULIENNE_J: entree({
    ref: 'A-JUL',
    libelle: 'Année julienne',
    valeur: 365.25,
    unite: 'j',
    source: 'définition de l’année julienne, unité des époques astronomiques',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.1'],
  }),
  OBLIQUITE_J2000_DEG: entree({
    ref: 'A-OBL',
    libelle: 'Obliquité de l’écliptique à J2000',
    valeur: 23.4392911,
    unite: '°',
    source: 'IAU 2006, valeur à l’époque J2000,0',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.1', '3.4'],
  }),
  FREQ_EPHEMERIDES_HZ: entree({
    ref: 'C-24',
    libelle: 'Fréquence de l’horloge d’éphémérides',
    valeur: 10,
    unite: 'Hz',
    source: '§3.1 — « horloge_ephemerides : 10 Hz par défaut »',
    tolerance: 'réglable de 1 à 60 Hz',
    ordreDeGrandeur: false,
    sections: ['3.1'],
  }),
  V_ECRAN_MIN_PERCEPTIBLE_PX_S: entree({
    ref: 'C-25',
    libelle: 'Vitesse écran sous laquelle le mouvement est imperceptible',
    valeur: 2,
    unite: 'px/s',
    source: '§3.2 — seuil perceptif, dérivé de la lisibilité et non de la machine',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['3.2'],
  }),
  V_ECRAN_LISIBLE_MAX_PX_S: entree({
    ref: 'C-25',
    libelle: 'Vitesse écran au-delà de laquelle le défilement devient rapide',
    valeur: 300,
    unite: 'px/s',
    source: '§3.2 — borne haute de la plage lisible',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['3.2'],
  }),
  V_ECRAN_REPLIEMENT_PX_S: entree({
    ref: 'C-25',
    libelle: 'Vitesse écran de repliement',
    valeur: 600,
    unite: 'px/s',
    source: '§3.2 — au-delà, le ciel devient illisible : l’app ne continue pas d’animer',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['3.2'],
  }),
  FACTEUR_DEFILEMENT_NORMAL: entree({
    ref: 'C-25',
    libelle: 'Facteur de défilement, vitesse normale',
    valeur: 150,
    unite: '×',
    source: '§3.2 — « normale ×150 → 2,5 min de ciel par seconde »',
    tolerance: 'écrêté par facteur_max sous 2° de champ',
    ordreDeGrandeur: false,
    sections: ['3.2'],
  }),
  FACTEUR_DEFILEMENT_RAPIDE: entree({
    ref: 'C-25',
    libelle: 'Facteur de défilement, vitesse rapide',
    valeur: 1500,
    unite: '×',
    source: '§3.2 — « rapide ×1500 → 25 min de ciel par seconde »',
    tolerance: 'écrêté par facteur_max sous 20° de champ',
    ordreDeGrandeur: false,
    sections: ['3.2'],
  }),
  MAG_BASE_RENDU: entree({
    ref: 'C-26',
    libelle: 'Magnitude limite de rendu au champ de référence',
    valeur: 6.5,
    unite: 'mag',
    source: '§3.3 — « mag_base = 6,5 à fov_ref = 60° »',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  FOV_REFERENCE_RENDU_DEG: entree({
    ref: 'C-26',
    libelle: 'Champ de référence de la profondeur de catalogue',
    valeur: 60,
    unite: '°',
    source: '§3.3 — « mag_base = 6,5 à fov_ref = 60° »',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  FOV_INITIAL_DEG: entree({
    ref: 'C-26',
    libelle: 'Champ de la scène à l’ouverture',
    valeur: 200,
    unite: '°',
    source:
      '§3.3 — convention produit (T-0239) : on arrive pour se repérer, pas pour viser. 200° ' +
      'montre l’horizon sud et le ciel au-dessus d’un seul coup d’œil, sous le plafond ' +
      'stéréographique. Distinct de FOV_REFERENCE_RENDU_DEG, qui ancre la profondeur de ' +
      'catalogue et ne bouge pas.',
    tolerance: 'convention produit — pilote le confort d’une vue, jamais un verdict.',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  MAG_LIMITE_OBJETS: entree({
    ref: 'C-26',
    libelle: 'Magnitude limite des objets du ciel profond, tous champs confondus',
    valeur: 11,
    unite: 'mag',
    source:
      'T-0195 — §3.3 asservit au zoom la profondeur des ÉTOILES : à 180°, 83 479 étoiles ' +
      'referment le canevas. Un marqueur de ciel profond ne représente pas un flux, il ' +
      'désigne un endroit, et on dézoome précisément pour se repérer. Plafond FIXE, choisi ' +
      'sur le comptage des paquets versionnés : 1 217 objets au ciel entier, environ 600 sur ' +
      'un champ de 180°, traçables par image et lisibles à l’œil. Il reste au-dessus de la ' +
      'profondeur du zoom partout dans les bornes de §3.3 (9,5 au plancher de 15°) : aucun ' +
      'objet aujourd’hui affiché ne disparaît.',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  FOV_MIN_AVEC_GAIA_DEG: entree({
    ref: 'C-26',
    libelle: 'Champ minimal avec le paquet Gaia chargé',
    valeur: 5,
    unite: '°',
    source: '§3.3 — « zoom utile au MVP : 5° de champ, avec le paquet Gaia chargé »',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  FOV_MIN_SANS_GAIA_DEG: entree({
    ref: 'C-26',
    libelle: 'Champ minimal sans le paquet Gaia',
    valeur: 15,
    unite: '°',
    source: '§3.3 — « sans ce paquet, l’app plafonne à 15° et le déclare »',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  FOV_MAX_DEG: entree({
    ref: 'C-26',
    libelle: 'Champ maximal du planétarium',
    valeur: 180,
    unite: '°',
    source: '§3.3 — projection stéréographique de 1° à 180°',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  FOV_MAX_STEREOGRAPHIQUE_DEG: entree({
    ref: 'C-26',
    libelle: 'Champ maximal en projection stéréographique',
    valeur: 300,
    unite: '°',
    source:
      '§3.3 — convention produit : R = 2·tan(θ/2) ne diverge qu’à θ = 180°, donc à 360° de ' +
      'champ. Le plafond de 180° du PRD n’était pas une limite de la projection mais celle ' +
      'de la gnomonique appliquée aux trois modes. À 300°, le bord est à θ = 150° et R = 7,46 ' +
      '— fini, monotone, inversible ; le ciel entier moins une calotte de 60° tient à l’écran, ' +
      'ce que le dézoom cherche. Au-delà, l’échelle s’effondre vers le point antipodal : à ' +
      '340° R = 22,9, soit un tiers du canevas pour les 20 derniers degrés de ciel.',
    tolerance:
      'convention produit — pilote le confort d’une vue, jamais un verdict. Écart assumé au ' +
      'plafond de 180° du PRD, comme FOV_MAX_GNOMONIQUE_DEG l’est en sens inverse (T-0095).',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  FOV_MAX_GNOMONIQUE_DEG: entree({
    ref: 'C-26',
    libelle: 'Champ maximal en projection gnomonique',
    valeur: 150,
    unite: '°',
    source:
      '§3.3 — convention produit : R = tan(θ) diverge à θ = 90°, donc à 180° de champ. ' +
      'À 150°, le bord est étiré 14,9 fois par rapport au centre (1/cos²(θ)) et la scène ' +
      'reste lisible ; à 160° l’étirement passe à 33, à 179° à 13 000, et à 180° l’échelle ' +
      'tombe à zéro — tout le ciel s’effondre sur le pixel central.',
    tolerance:
      'convention produit — pilote le confort d’une vue, jamais un verdict. Ni la ' +
      'stéréographique ni l’équidistante ne divergent à 90° : elles ont leur propre plafond.',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  FOV_MAX_EQUIDISTANTE_DEG: entree({
    ref: 'C-26',
    libelle: 'Champ maximal en projection équidistante',
    valeur: 300,
    unite: '°',
    source:
      '§3.3 — convention produit (T-0220) : R = θ ne diverge nulle part, le plafond de 180° ' +
      'n’était pas celui de la projection. 300° aligne le dézoom fisheye sur la ' +
      'stéréographique : basculer de l’une à l’autre ne rabote pas le champ. Au-delà de 180°, ' +
      'le cercle antipodal entre dans le canevas et borne le ciel dessiné.',
    tolerance:
      'convention produit — pilote le confort d’une vue, jamais un verdict. Écart assumé au ' +
      'plafond de 180° du PRD, comme FOV_MAX_STEREOGRAPHIQUE_DEG.',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  MARGE_ANTIPODE_EQUIDISTANTE_DEG: entree({
    ref: 'C-26',
    libelle: 'Marge autour de l’antipode de la visée, en projection équidistante',
    valeur: 5,
    unite: '°',
    source:
      '§3.3 — convention produit (T-0220) : en équidistante, tout le voisinage de l’antipode ' +
      'se projette sur le cercle R = π. Deux sommets voisins d’une polyligne de part et ' +
      'd’autre de l’antipode y tombent aux deux bouts d’un diamètre, et la corde traverse ' +
      'l’image. Cinq degrés couvrent les arêtes subdivisées (frontières à 2°, filé à 0,25°) ; ' +
      'un segment non subdivisé de plus de dix degrés peut encore enjamber l’antipode.',
    tolerance: 'convention produit — pilote l’aspect, jamais un verdict',
    ordreDeGrandeur: true,
    sections: ['3.3'],
  }),
  CHAMP_MAX_FISHEYE_DEG: entree({
    ref: 'C-26',
    libelle: 'Champ maximal couvert par un objectif fisheye',
    valeur: 180,
    unite: '°',
    source:
      '§5.1 — convention produit (T-0218) : le cercle image d’un fisheye courant couvre 180°. ' +
      'En équidistante, d / f dépasse π dès que le capteur déborde ce cercle (8 mm sur plein ' +
      'format : 258° en largeur) ; au-delà, le capteur ne reçoit plus de ciel.',
    tolerance:
      'convention produit — quelques fisheyes couvrent 190° à 220° ; le type d’objectif ne ' +
      'porte pas cette information, le cas courant est retenu.',
    ordreDeGrandeur: false,
    sections: ['5.1'],
  }),
  FACTEUR_ZOOM_CRAN: entree({
    ref: 'C-26',
    libelle: 'Facteur de champ d’un cran de zoom — molette ou touche',
    valeur: 1.1,
    unite: '—',
    source: '§3.3 — convention produit : un cran change le champ d’un dixième',
    tolerance: 'convention produit — pilote le confort du geste, jamais un verdict',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  PAS_VISEE_CLAVIER_FRACTION: entree({
    ref: 'C-26',
    libelle: 'Pas d’une touche fléchée, en fraction du champ affiché',
    valeur: 0.1,
    unite: '—',
    source:
      '§3.3 — convention produit : dix appuis traversent le champ affiché, et la tolérance ' +
      'de choix au clavier vaut ce même pas — sans pointeur, il n’y a pas de visée au pixel',
    tolerance: 'convention produit — pilote le confort du geste, jamais un verdict',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  RAYON_ETOILE_R0_PX: entree({
    ref: 'C-27',
    libelle: 'Rayon de rendu d’une étoile à la magnitude de référence',
    valeur: 4.0,
    unite: 'px',
    source:
      '§3.3 — r0 du modèle commun avec la prévisualisation §9.2, calibré à la définition de ' +
      'rendu de référence de 1920 px de large',
    tolerance: 'convention produit — pilote l’aspect, jamais un verdict',
    ordreDeGrandeur: false,
    sections: ['3.3', '9.2'],
  }),
  MAG_REFERENCE_RAYON: entree({
    ref: 'C-27',
    libelle: 'Magnitude de référence du rayon de rendu',
    valeur: 0,
    unite: 'mag',
    source: '§3.3 — mag_ref du modèle rayon_px = r0 × 10^(−0,15 × (mag − mag_ref))',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.3', '9.2'],
  }),
  COEF_RAYON_MAGNITUDE: entree({
    ref: 'C-27',
    libelle: 'Coefficient magnitude du rayon de rendu',
    valeur: 0.15,
    unite: '—',
    source: '§3.3 — rayon_px = r0 × 10^(−0,15 × (mag − mag_ref))',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.3', '9.2'],
  }),
  CELLULE_INDEX_DEG: entree({
    ref: 'C-28',
    libelle: 'Côté d’une cellule de l’index spatial équatorial',
    valeur: 10,
    unite: '°',
    source: '§3.3 — quadtree équatorial : seules les cellules intersectant le champ sont soumises',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  FOV_LABELS_CONSTELLATIONS_DEG: entree({
    ref: 'C-29',
    libelle: 'Champ au-delà duquel seuls les noms de constellations sont composés',
    valeur: 40,
    unite: '°',
    source: '§3.4 — hiérarchie de labels par zoom',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.4'],
  }),
  FOV_LABELS_OBJETS_DEG: entree({
    ref: 'C-29',
    libelle: 'Champ sous lequel les objets du ciel profond sont nommés',
    valeur: 10,
    unite: '°',
    source: '§3.4 — « fov < 10° → + noms propres et désignations des objets du ciel profond »',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.4'],
  }),
  MAG_LABEL_BAYER_MAX: entree({
    ref: 'C-29',
    libelle: 'Magnitude maximale d’une étoile portant sa désignation Bayer',
    valeur: 3.5,
    unite: 'mag',
    source: '§3.4 — « désignations Bayer des étoiles de mag ≤ 3,5 »',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.4'],
  }),
  LABELS_MAX: entree({
    ref: 'C-29',
    libelle: 'Nombre de labels affichés simultanément',
    valeur: 25,
    unite: '—',
    source: '§3.4 — « densité plafonnée à 25 labels simultanés, priorité à la magnitude »',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.4'],
  }),
  SUBDIVISION_FRONTIERE_DEG: entree({
    ref: 'C-30',
    libelle: 'Pas de subdivision d’une arête de frontière IAU',
    valeur: 2,
    unite: '°',
    source:
      '§3.4 — une arête suit un méridien ou un parallèle B1875 : la précession la courbe, ' +
      'elle n’est donc pas tracée comme un segment droit',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['3.4'],
  }),
  HORIZON_MOUVEMENTS_PROPRES_AN: entree({
    ref: 'C-30',
    libelle: 'Horizon temporel au-delà duquel les mouvements propres ignorés se voient',
    valeur: 1000,
    unite: 'année',
    source:
      '§3.3 — « mouvements propres ignorés, erreur inférieure à 0,1° sur ±1 000 ans pour la ' +
      'quasi-totalité des étoiles »',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['3.3', '3.4'],
  }),
  PROFILS_CADRE_MAX: entree({
    ref: 'C-31',
    libelle: 'Nombre de profils de cadre comparables simultanément',
    valeur: 3,
    unite: '—',
    source: '§3.5 — « jusqu’à trois profils comparés simultanément »',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.5'],
  }),
  /**
   * T-0097 — extension de rendu. §3.3 ne dit du fond de ciel que « plafonne mag_limite en vue
   * réaliste » : la couleur du fond n'y est pas spécifiée. Ces quatre entrées sont donc une
   * convention produit assumée, comme FOV_MAX_GNOMONIQUE_DEG (T-0095), et prd.md reste intact.
   */
  K_EXPOSITION_FOND_CIEL: entree({
    ref: 'C-38',
    libelle: 'Exposition du fond de ciel peint',
    valeur: 5.066e-5,
    unite: 'Y/nL',
    source:
      'extension de rendu — seule constante libre du modèle, calée pour que la luminance ' +
      'd’écran vaille 0,003 au fond de ciel le plus sombre de la table Bortle (21,9 mag/as², ' +
      'Bortle 1), soit juste au-dessus du noir. Le RAPPORT des luminances, lui, est physique : ' +
      'Y = K × B(sb) donne 36× entre Bortle 9 et Bortle 1, exactement le rapport des brillances.',
    tolerance: 'convention produit — pilote l’apparence d’un fond, jamais un verdict',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  CHROMA_FOND_CIEL_R: entree({
    ref: 'C-39',
    libelle: 'Chromaticité du fond de ciel — canal rouge',
    valeur: 0.62,
    unite: '—',
    source:
      'extension de rendu — teinte bleu-violet fixe du ciel nocturne, en lumière linéaire ; ' +
      'seule la luminance varie avec le fond de ciel, jamais la chromaticité.',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  CHROMA_FOND_CIEL_V: entree({
    ref: 'C-40',
    libelle: 'Chromaticité du fond de ciel — canal vert',
    valeur: 0.72,
    unite: '—',
    source: 'extension de rendu — voir CHROMA_FOND_CIEL_R',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  CHROMA_FOND_CIEL_B: entree({
    ref: 'C-41',
    libelle: 'Chromaticité du fond de ciel — canal bleu',
    valeur: 1,
    unite: '—',
    source: 'extension de rendu — canal de référence, voir CHROMA_FOND_CIEL_R',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  RAYON_TERRE_KM: entree({
    ref: 'A-TER',
    libelle: 'Rayon terrestre moyen',
    valeur: 6371,
    unite: 'km',
    source: 'rayon volumétrique moyen de la Terre (IUGG)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  HAUTEUR_COUCHE_EMISSIVE_KM: entree({
    ref: 'C-42',
    libelle: 'Hauteur de la couche émissive du ciel nocturne',
    valeur: 90,
    unite: 'km',
    source:
      'van Rhijn (1921) — la lueur atmosphérique est émise par une couche mince vers 90 km ' +
      '(raies OH vers 87 km, sodium vers 90 km, OI 557,7 nm vers 96 km). C’est cette couche, ' +
      'vue sous une épaisseur croissante quand on baisse la visée, qui éclaircit l’horizon.',
    tolerance: 'ordre de grandeur — 85 à 100 km selon l’émission dominante',
    ordreDeGrandeur: true,
    plage: [85, 100],
    sections: ['3.3'],
  }),
  PALIERS_HALO_HORIZON: entree({
    ref: 'C-43',
    libelle: 'Nombre de paliers de hauteur du halo d’horizon',
    valeur: 12,
    unite: '—',
    source:
      'T-0098, convention produit — le profil de van Rhijn est continu ; il est peint en ' +
      'paliers de hauteur égale parce que les courbes iso-hauteur ne sont pas des cercles à ' +
      'l’écran et qu’un dégradé de canevas les rendrait faux. À 12 paliers, la marche la plus ' +
      'visible (celle de l’horizon) vaut 0,17 mag/as², sous le seuil de perception d’un bord.',
    tolerance: 'convention produit — baisser ce nombre allège le rendu, jamais la fréquence d’image',
    ordreDeGrandeur: false,
    sections: ['3.3'],
  }),
  SUBDIVISION_CADRE: entree({
    ref: 'C-31',
    libelle: 'Nombre de points par bord du cadre matériel projeté',
    valeur: 16,
    unite: '—',
    source:
      '§3.5 — « à grand champ, ses bords ne sont PAS des droites dans le planétarium » : ' +
      'chaque bord est une polyligne projetée point par point',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['3.5'],
  }),
} as const

/** §9.1 à §9.4 — grand champ, prévisualisation et filé d'étoiles. */
const GRAND_CHAMP = {
  CELLULES_CARTE_POSE: entree({
    ref: 'C-32',
    libelle: 'Côté de la grille de la carte de pose maximale',
    valeur: 9,
    unite: '—',
    source:
      '§9.1 — « une carte, pas un nombre » : la pose max est échantillonnée par cellule du ' +
      'cadre, la déclinaison variant de plusieurs dizaines de degrés d’un bord à l’autre',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['9.1'],
  }),
  ECART_POSE_CADRE_SIGNIFICATIF: entree({
    ref: 'C-32',
    libelle: 'Rapport de pose entre zones du cadre déclenchant la proposition de recadrage',
    valeur: 2,
    unite: '—',
    source: '§9.1 — « l’app signale que le pôle tiendrait des poses bien plus longues »',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['9.1'],
  }),
  POSE_LONGUE_AVERTISSEMENT_S: entree({
    ref: 'C-32',
    libelle: 'Pose au-delà de laquelle la contrainte cesse d’être le filé',
    valeur: 1200,
    unite: 's',
    source:
      '§9.1 — « la valeur dépasse 20 min » : au-delà, ce sont le bruit thermique et le fond ' +
      'de ciel qui limitent, plus la rotation du ciel',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.1'],
  }),
  SEUIL_MAG_ETOILES_REELLES: entree({
    ref: 'C-33',
    libelle: 'Magnitude jusqu’à laquelle les étoiles de la prévisualisation sont catalographiées',
    valeur: 7.5,
    unite: 'mag',
    source: '§9.2 — SEUIL_REEL : environ 15 000 étoiles sur la sphère, positions exactes',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['9.2', '9.3'],
  }),
  SEMIS_MAG_MAX: entree({
    ref: 'C-33',
    libelle: 'Magnitude la plus faible du semis génératif',
    valeur: 12,
    unite: 'mag',
    source: '§9.2 — borne du fond génératif au-delà du seuil catalographié',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['9.2'],
  }),
  SEMIS_ETOILES_TOTAL: entree({
    ref: 'C-33',
    libelle: 'Nombre d’étoiles du semis génératif sur toute la sphère',
    valeur: 300000,
    unite: '—',
    source:
      '§9.2 — plafond de rendu : la MODULATION de densité par la latitude galactique est ' +
      'respectée, le comptage absolu ne l’est pas, et le rendu le déclare',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['9.2'],
  }),
  ECHELLE_LATITUDE_GALACTIQUE_DEG: entree({
    ref: 'C-33',
    libelle: 'Échelle de décroissance de la densité stellaire hors du plan galactique',
    valeur: 20,
    unite: '°',
    source: '§9.2 — densite(b) = d0 × exp( −|b| / 20° )',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.2'],
  }),
  MARGE_ANTIALIASING_PX: entree({
    ref: 'C-33',
    libelle: 'Débord d’anticrénelage toléré autour du canevas avant de rejeter un tracé',
    valeur: 1,
    unite: 'px',
    source:
      '§9.3 — le rejet d’un arc hors canevas doit être CONSERVATEUR : le rasteriseur étale un ' +
      'trait d’environ un demi-pixel au-delà de sa demi-largeur, et un rejet au ras du bord ' +
      'effacerait ce débord. Un pixel entier de mou rend le rejet prouvablement invisible.',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['9.3'],
  }),
  COUVERTURE_TRACES_MAX: entree({
    ref: 'C-33',
    libelle: 'Part du canevas que les traces du filé peuvent peindre',
    valeur: 0.4,
    unite: '—',
    source:
      '§9.3 — budget de rendu, réglé par la mesure (`pnpm bench:file --planetarium`, T-0119). ' +
      'C’est la SURFACE peinte qui se plafonne, pas le nombre d’étoiles : la surface vaut ' +
      'nombre × longueur × largeur, donc à budget d’étoiles constant elle croît avec la durée du ' +
      'filé et avec le champ. Au-delà d’une couverture de 1, chaque pixel est repeint plusieurs ' +
      'fois : la trace n’a plus de longueur lisible. Sans plafond, le pire cas mesuré peint ' +
      '535 % du canevas ; à 0,4 visé, la couverture obtenue tient dans 25–33 % de 60° à 180° et ' +
      'de 60 min à 480 min',
    tolerance: 'convention produit',
    ordreDeGrandeur: true,
    sections: ['9.3'],
  }),
  EFFECTIF_CIEL_MAX_APERCU: entree({
    ref: 'C-33',
    libelle: 'Étoiles du ciel entier au plus retenues par un aperçu de la scène',
    valeur: 45000,
    unite: '—',
    source:
      '§9.2 et §9.3 — T-0119 : plafond de COÛT, distinct du plafond de lisibilité, et commun aux ' +
      'deux aperçus. La couverture peinte borne ce que l’image montre, pas ce que la passe lit : ' +
      'un filé court, ou un champ étroit, peint peu par trace et en autorise donc des centaines ' +
      'de milliers ; l’aperçu de champ, lui, n’a pas de couverture à borner du tout et lisait le ' +
      'catalogue à pleine profondeur. Choisi par la mesure : filé 30 ms au pire cas et aperçu de ' +
      'champ 25 ms au plein ciel, contre ~33 ms d’intervalle de boucle — là où 60 000 mettait ' +
      'l’aperçu de champ à 32 ms, et l’absence de plafond à 181. Au-dessus du catalogue réel ' +
      '(25 791 étoiles) : le ciel reconnaissable n’est jamais écarté par le COÛT, seulement par ' +
      'la lisibilité',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.2', '9.3'],
  }),
  CASES_TABLE_PROFONDEUR_TRACE: entree({
    ref: 'C-34',
    libelle: 'Cases de la table de profondeur atteinte par pixel, en sinus de déclinaison',
    valeur: 128,
    unite: '—',
    source:
      '§9.3 — T-0119 : la profondeur atteinte par un pixel ne dépend que de la déclinaison, par ' +
      'la pose par pixel. La recalculer par étoile coûtait 134 ms pour deux cent mille étoiles, ' +
      'contre 2 ms par lecture de table. Cent vingt-huit cases en sinus de déclinaison : la ' +
      'quantité tabulée est plate vers les pôles, où la pose par pixel sature sur la durée de la ' +
      'séquence, et lisse à l’équateur céleste',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.2', '9.3'],
  }),
  NIVEAUX_OPACITE_ETOILE: entree({
    ref: 'C-34',
    libelle: 'Paliers d’opacité distincts dans le rendu d’une étoile',
    valeur: 16,
    unite: '—',
    source:
      '§9.2 — T-0119 : les étoiles se peignent par chemin partagé, un par couple ' +
      '(teinte, palier d’opacité), au lieu d’un ordre de tracé par étoile. Le nombre de paliers ' +
      'est donc le nombre d’ordres de peinture — seize paliers valent 5 % d’écart d’opacité ' +
      'entre deux voisins, sous le seuil de perception sur un champ d’étoiles, où la magnitude ' +
      'se lit d’abord au rayon',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.2', '9.3'],
  }),
  NIVEAUX_RAYON_ETOILE: entree({
    ref: 'C-34',
    libelle: 'Paliers de rayon distincts dans le rendu d’une étoile',
    valeur: 24,
    unite: '—',
    source:
      '§9.2 — T-0119 : une trace se peint au trait, et un chemin partagé ne porte qu’une largeur ' +
      'de trait. Les rayons se rangent donc par paliers géométriques entre le plancher ' +
      'd’antialiasing et l’étoile la plus brillante du paquet — vingt-quatre paliers valent moins ' +
      'de 12 % d’écart de rayon entre deux voisins, soit un dixième de pixel là où les étoiles ' +
      'sont nombreuses',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.2', '9.3'],
  }),
  ECHANTILLONS_COUVERTURE_FILE: entree({
    ref: 'C-33',
    libelle: 'Échantillons par côté du canevas pour estimer la couverture des traces',
    valeur: 5,
    unite: '—',
    source:
      '§9.3 — T-0119 : la couverture s’estime en moyennant `cos δ × échelle locale` sur une ' +
      'grille du canevas. Cinq par côté suffisent : la quantité moyennée varie doucement, et ' +
      'l’écart de plafond entre 5 et 17 échantillons par côté reste sous le pas du comptage ' +
      'cumulé de magnitudes',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.3'],
  }),
  PAS_COMPTAGE_CUMULE_MAG: entree({
    ref: 'C-33',
    libelle: 'Pas du comptage cumulé de magnitudes d’un index de ciel',
    valeur: 0.1,
    unite: 'mag',
    source:
      '§9.3 — T-0119 : résolution avec laquelle un budget de traces se convertit en plafond de ' +
      'magnitude. Le plafond n’est jamais rendu plus profond que la case atteinte, donc le pas ' +
      'borne la générosité du plafond, pas sa justesse ; un dixième de magnitude vaut moins de ' +
      '3 % d’écart d’effectif à la pente de comptage du ciel',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.3'],
  }),
  OPACITE_TRACE_MIN: entree({
    ref: 'C-34',
    libelle: 'Opacité sous laquelle une étoile ne laisse plus de trace peinte',
    valeur: 0.2,
    unite: '—',
    source:
      '§9.3 — sous cette opacité, l’étoile est trop loin sous le seuil d’enregistrement pour ' +
      'laisser une trace : sans ce plancher, des milliers de traces sous-liminaires s’additionnent ' +
      'et blanchissent une image qui, en vrai, resterait noire',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.2', '9.3'],
  }),
  PENTE_COMPTAGE_ETOILES: entree({
    ref: 'C-33',
    libelle: 'Pente du comptage d’étoiles par magnitude',
    valeur: 0.6,
    unite: '1/mag',
    source:
      '§9.2 — répartition euclidienne N(<m) ∝ 10^(0,6 m), utilisée pour tirer les magnitudes ' +
      'du semis génératif',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.2'],
  }),
  POLE_GALACTIQUE_AD_DEG: entree({
    ref: 'A-GAL',
    libelle: 'Ascension droite du pôle galactique nord',
    valeur: 192.85948,
    unite: '°',
    source: 'IAU 1958, valeurs J2000 (Hipparcos)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['9.2'],
  }),
  POLE_GALACTIQUE_DEC_DEG: entree({
    ref: 'A-GAL',
    libelle: 'Déclinaison du pôle galactique nord',
    valeur: 27.12825,
    unite: '°',
    source: 'IAU 1958, valeurs J2000 (Hipparcos)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['9.2'],
  }),
  LONGITUDE_GALACTIQUE_POLE_CELESTE_DEG: entree({
    ref: 'A-GAL',
    libelle: 'Longitude galactique du pôle céleste nord',
    valeur: 122.93192,
    unite: '°',
    source: 'IAU 1958, valeurs J2000 (Hipparcos)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['9.2'],
  }),
  SB_VOIE_LACTEE_PLAN_MAG: entree({
    ref: 'C-44',
    libelle: 'Brillance de surface de la Voie lactée dans le plan, à l’anticentre (l = 180°)',
    valeur: 21.0,
    unite: 'mag/as²',
    source:
      'extension de rendu — brillance de la bande en bande V hors du bulbe. Depuis T-0105 ' +
      'cette valeur est celle de l’ANTICENTRE : la modulation en longitude va de ' +
      'SB_VOIE_LACTEE_BULBE_MAG en l = 0° à cette valeur en l = 180°.',
    tolerance: 'ordre de grandeur — à confirmer sur source photométrique, jamais à caler sur le rendu',
    ordreDeGrandeur: true,
    sections: ['3.7'],
  }),
  SB_VOIE_LACTEE_BULBE_MAG: entree({
    ref: 'C-48',
    libelle: 'Brillance de surface de la Voie lactée au centre galactique (l = 0°, b = 0°)',
    valeur: 20.5,
    unite: 'mag/as²',
    source:
      'extension de rendu (T-0105) — les nuages du Sagittaire sont les parties les plus ' +
      'brillantes de la bande, environ une demi-magnitude au-dessus de l’anticentre, soit ' +
      'plus que l’écart entre deux crans de Bortle. Écart mesuré sur les cartes de lumière ' +
      'stellaire intégrée ; la valeur est un ordre de grandeur, pas une photométrie.',
    tolerance: 'ordre de grandeur — à confirmer sur source photométrique, jamais à caler sur le rendu',
    ordreDeGrandeur: true,
    sections: ['3.7'],
  }),
  CHROMA_VOIE_LACTEE_R: entree({
    ref: 'C-45',
    libelle: 'Chromaticité de la lumière stellaire intégrée — canal rouge',
    valeur: 1.0,
    unite: '—',
    source:
      'extension de rendu — la lumière stellaire galactique intégrée a B−V ≈ +0,9 ' +
      '(géantes K, plus le rougissement par la poussière) : elle est blanc-chaud, jamais ' +
      'magenta. Rapports bruts en lumière linéaire ; la normalisation qui rend la bande ' +
      'photométriquement comparable au fond est calculée, pas écrite ici.',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['3.7'],
  }),
  CHROMA_VOIE_LACTEE_V: entree({
    ref: 'C-46',
    libelle: 'Chromaticité de la lumière stellaire intégrée — canal vert',
    valeur: 0.86,
    unite: '—',
    source: 'extension de rendu — voir CHROMA_VOIE_LACTEE_R',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['3.7'],
  }),
  CHROMA_VOIE_LACTEE_B: entree({
    ref: 'C-47',
    libelle: 'Chromaticité de la lumière stellaire intégrée — canal bleu',
    valeur: 0.66,
    unite: '—',
    source: 'extension de rendu — voir CHROMA_VOIE_LACTEE_R',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['3.7'],
  }),
  PORTEE_PROJECTION_DIAGONALES: entree({
    ref: 'C-34',
    libelle: 'Portée utile d’un point projeté, en diagonales de canevas',
    valeur: 8,
    unite: 'diagonale',
    source:
      '§3.3 — au-delà, le facteur radial de la projection diverge : deux sommets voisins ' +
      'd’une polyligne tombent de part et d’autre du canevas et la corde qui les relie ' +
      'traverse l’image. Huit diagonales laissent passer tout ce qu’un champ de 180° peut ' +
      'porter à l’écran, et arrêtent le maillage du sol à plusieurs écrans du champ affiché',
    tolerance: 'convention produit — pilote l’aspect, jamais un verdict',
    ordreDeGrandeur: true,
    sections: ['3.3'],
  }),
  VIGNETTAGE_COINS_DIAPH: entree({
    ref: 'C-34',
    libelle: 'Assombrissement des coins du champ',
    valeur: 1.5,
    unite: 'diaphragme',
    source: '§9.2 — « 1 à 2 diaphragmes à f/2,8 »',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.2'],
  }),
  SNR_DETECTION_PREVISU: entree({
    ref: 'C-34',
    libelle: 'Rapport signal sur bruit d’une étoile tout juste enregistrée',
    valeur: 5,
    unite: '—',
    source: '§9.2 — seuil de détection retenu pour la profondeur atteinte, marquée [À CALCULER]',
    tolerance: 'convention produit',
    ordreDeGrandeur: false,
    sections: ['9.2'],
  }),
  SNR_RENDU_SATURATION: entree({
    ref: 'C-34',
    libelle: 'Rapport signal sur bruit saturant le rendu d’une étoile',
    valeur: 100,
    unite: '—',
    source:
      '§9.2 — étirement d’affichage de la prévisualisation : comme toute image ' +
      'astronomique, elle est étirée pour être lisible, et l’étirement est déclaré plutôt ' +
      'que caché',
    tolerance: 'convention produit — pilote l’aspect, jamais un verdict',
    ordreDeGrandeur: false,
    sections: ['9.2', '9.3'],
  }),
  PIXELS_PSF_ETOILE: entree({
    ref: 'C-34',
    libelle: 'Pixels sur lesquels s’étale l’image d’une étoile',
    valeur: 4,
    unite: 'px',
    source: '§9.2 — surface de bruit sommée pour la profondeur atteinte',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.2'],
  }),
  PAS_ANGLE_HORAIRE_FILE_DEG: entree({
    ref: 'C-35',
    libelle: 'Pas d’échantillonnage d’un arc de filé',
    valeur: 0.25,
    unite: '°',
    source:
      '§9.3 — « pas d’échantillonnage ≤ 0,25° d’angle horaire » : un cercle de déclinaison ne ' +
      'se projette pas en cercle, la polyligne suit la conique réelle',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['9.3'],
  }),
  PAS_ARC_FILE_PX: entree({
    ref: 'C-35',
    libelle: 'Corde maximale d’un segment d’arc de filé',
    valeur: 4,
    unite: 'px',
    source:
      '§9.3 — flèche c²/8R : à 4 px de corde, l’écart à la conique reste sous le pixel dès ' +
      'que le rayon projeté dépasse 2 px, donc pour tout arc visible (T-0024)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['9.3'],
  }),
  PRE_ECHANTILLONS_ARC_FILE: entree({
    ref: 'C-35',
    libelle: 'Segments du pré-échantillonnage de longueur d’arc',
    valeur: 4,
    unite: '—',
    source:
      '§9.3 — la longueur projetée s’estime avant d’être parcourue, pour ne pas parcourir ' +
      'un arc qu’on écartera (T-0022)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['9.3'],
  }),
  ECHANTILLONS_CERCLE_FILE: entree({
    ref: 'C-35',
    libelle: 'Positions projetées qui déterminent le cercle d’un arc',
    valeur: 5,
    unite: '—',
    source:
      '§9.3 — début, quarts, milieu et fin : trois d’entre elles déterminent le cercle ' +
      'stéréographique, les cinq donnent le balayage (T-0115)',
    tolerance: null,
    ordreDeGrandeur: false,
    sections: ['9.3'],
  }),
  DUREE_FILE_LISIBLE_MIN: entree({
    ref: 'C-35',
    libelle: 'Durée sous laquelle un filé ne se lit pas comme un filé',
    valeur: 60,
    unite: 'min',
    source: '§9.3 — « le filé lisible commence vers 1 h », déception numéro un du débutant',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.3'],
  }),
  DUREE_FILE_SPECTACULAIRE_MIN: entree({
    ref: 'C-35',
    libelle: 'Durée à partir de laquelle le filé devient spectaculaire',
    valeur: 120,
    unite: 'min',
    source: '§9.3 — « devient spectaculaire à partir de 2 h »',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['9.3'],
  }),
  T_POSE_FILE_MIN_S: entree({
    ref: 'C-36',
    libelle: 'Pose unitaire recommandée en filé, borne basse',
    valeur: 20,
    unite: 's',
    source: '§9.4 — « t_pose recommandé 20 à 30 s »',
    tolerance: 'convention terrain',
    ordreDeGrandeur: false,
    sections: ['9.4'],
  }),
  T_POSE_FILE_MAX_S: entree({
    ref: 'C-36',
    libelle: 'Pose unitaire recommandée en filé, borne haute',
    valeur: 30,
    unite: 's',
    source: '§9.4 — « t_pose recommandé 20 à 30 s »',
    tolerance: 'convention terrain',
    ordreDeGrandeur: false,
    sections: ['9.4'],
  }),
  DUREE_RAPPEL_BATTERIE_MIN: entree({
    ref: 'C-16',
    libelle: 'Durée de prise de vue au-delà de laquelle un rappel batterie s’affiche',
    valeur: 90,
    unite: 'min',
    source: 'convention terrain — seuil de rappel, aucune autonomie n’est modélisée',
    tolerance: 'ordre de grandeur',
    ordreDeGrandeur: true,
    sections: ['8.3', '9.4'],
  }),
} as const

/**
 * Domaine de validité des séries analytiques (§12.4). Hors de ces bornes, les corps du
 * système solaire sont masqués avec la cause nommée, jamais extrapolés en silence.
 */
const DOMAINE = {
  ANNEE_MIN_SERIES: entree({
    ref: 'D-MIN',
    libelle: 'Première année du domaine de validité des séries',
    valeur: 1700,
    unite: 'année',
    source: 'astronomy-engine — plage sur laquelle la bibliothèque est validée',
    tolerance: '[À VÉRIFIER] contre la documentation amont à chaque montée de version',
    ordreDeGrandeur: false,
    sections: ['3.1', '12.4'],
  }),
  ANNEE_MAX_SERIES: entree({
    ref: 'D-MAX',
    libelle: 'Dernière année du domaine de validité des séries',
    valeur: 2200,
    unite: 'année',
    source: 'astronomy-engine — plage sur laquelle la bibliothèque est validée',
    tolerance: '[À VÉRIFIER] contre la documentation amont à chaque montée de version',
    ordreDeGrandeur: false,
    sections: ['3.1', '12.4'],
  }),
} as const

/** Le registre complet, gelé. Aucun ajustement à l'exécution (§2.1). */
export const REGISTRE = Object.freeze({
  ...EXACTES,
  ...CONVENTIONNELLES,
  ...LUNE,
  ...PLANIFICATION,
  ...POINTAGE,
  ...TERRAIN,
  ...RENDU,
  ...GRAND_CHAMP,
  ...DOMAINE,
})

export type ConstantId = keyof typeof REGISTRE

/**
 * Lecture de la valeur d'une constante. Passer par cette fonction plutôt que par
 * `REGISTRE.X.valeur` garde le point de consommation traçable et refuse les entrées
 * dépréciées.
 */
export function K(id: ConstantId): number {
  const entree = REGISTRE[id]
  if (entree.deprecie !== undefined) {
    throw new Error(`Constante ${id} dépréciée et non consommable : ${entree.deprecie}`)
  }
  return entree.valeur
}

/** Référence citable dans un résultat tracé (§10.2). */
export interface ConstantRef {
  readonly id: ConstantId
  readonly ref: string
  readonly libelle: string
  readonly valeur: number
  readonly unite: string
  readonly source: string
  readonly tolerance: string | null
  readonly ordreDeGrandeur: boolean
  readonly plage?: readonly [number, number]
}

export function ref(id: ConstantId): ConstantRef {
  const { ref, libelle, valeur, unite, source, tolerance, ordreDeGrandeur, plage } = REGISTRE[id]
  return {
    id,
    ref,
    libelle,
    valeur,
    unite,
    source,
    tolerance,
    ordreDeGrandeur,
    ...(plage === undefined ? {} : { plage }),
  }
}

/**
 * Bornes déclarées d'une constante d'ordre de grandeur, quand le PRD les chiffre. Une
 * sortie qui consomme la constante encadre alors son résultat par ces bornes plutôt que
 * par la convention générique du facteur deux (§2.1, dernier critère).
 */
export function plageK(id: ConstantId): readonly [number, number] | null {
  return REGISTRE[id].plage ?? null
}
