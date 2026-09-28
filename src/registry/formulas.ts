/**
 * Annexe B — formulaire complet.
 *
 * Chaque formule est déclarée ici une seule fois, avec son expression littérale telle
 * qu'écrite dans le PRD. Les moteurs citent l'identifiant dans leur résultat tracé, ce qui
 * rend §10.2 « explication de verdict » dérivable au lieu d'être réécrite à la main.
 */

export interface FormulaEntry {
  readonly expression: string
  readonly unite: string
  readonly section: string
  /** Précision de lecture, quand l'expression seule ne suffit pas. */
  readonly note?: string
}

export const FORMULES = Object.freeze({
  // Optique et cadrage — §5.1, §6.1, §6.2
  // L'arctangente est utilisée partout, sans condition de bascule : l'approximation linéaire
  // donne 205,7° à 10 mm sur plein format.
  FOV: {
    expression: 'FOV_deg = 2 × atan( dimension_capteur_mm / (2 × focale_mm) )',
    unite: '°',
    section: '5.1',
  },
  // Objectif fisheye, projection équidistante R = f·θ : le champ est linéaire en d / f.
  // L'arctangente de §5.1 est la loi d'un rectilinéaire ; l'appliquer à un fisheye projetterait
  // en équidistante un champ de rectilinéaire (T-0218).
  FOV_FISHEYE: {
    expression: 'FOV_deg = min( dimension_capteur_mm / focale_mm × 180/π , CHAMP_MAX_FISHEYE_DEG )',
    unite: '°',
    section: '5.1',
  },
  DIAMETRE_PUPILLE: {
    expression: 'D_mm = focale_mm / ouverture_N',
    unite: 'mm',
    section: '5.1',
  },
  ECHANTILLONNAGE: {
    expression: 'ech_apx = 206 265 × pitch_um / focale_mm',
    unite: '"/px',
    section: '5.1',
  },
  DAWES: {
    expression: 'dawes_as = 116 / D_mm',
    unite: '"',
    section: '5.1',
  },
  REMPLISSAGE: {
    expression: 'remplissage = taille_objet_deg / FOV_H_deg',
    unite: '—',
    section: '6.2',
  },
  // φ est l’angle du grand axe de la cible dans le repère du cadre, roulis du boîtier compris
  // (§3.5). u et v sont la boîte englobante de l’ELLIPSE (§6.3), pas d’un rectangle : une cible
  // ronde resterait sinon grossie d’un facteur √2 à 45°, alors qu’un disque n’a pas
  // d’orientation. La corde du rectangle est écartée pour la raison inverse — elle donnerait à
  // 45° plus de marge qu’un grand axe aligné sur la grande dimension. À φ = 90° l’expression se
  // réduit exactement à REMPLISSAGE, ce qui préserve la calibration de la table de cadrage
  // (§6.2).
  REMPLISSAGE_ORIENTE: {
    expression:
      'u = √( maj²·cos²φ + min²·sin²φ ) · v = √( maj²·sin²φ + min²·cos²φ ) · ' +
      'remplissage = max( u / FOV_L_deg , v / FOV_H_deg )',
    unite: '—',
    section: '6.2',
  },
  DIAMETRE_PIXELS: {
    expression: 'diam_px = taille_objet_arcsec / ech_apx',
    unite: 'px',
    section: '6.2',
  },
  NOMBRE_TUILES: {
    expression: 'n_tuiles = ceil( taille / FOV × 1,15 )²',
    unite: '—',
    section: '6.2',
  },
  // Le PRD écrit « taille / (2 × 0,42) / 2 » et annonce 4 200 mm pour M84 : les deux ne
  // concordent pas. La focale visant 42 % du champ est retenue, et la plage affichée couvre
  // toute la fenêtre C-05 — sa borne basse est le 4 200 mm du PRD.
  FOCALE_IDEALE: {
    expression:
      'focale_ideale_mm = capteur_H_mm / ( 2 × tan( (taille_objet_deg / remplissage_cible) / 2 ) )',
    unite: 'mm',
    section: '6.1',
  },

  // Détectabilité — §6.3
  // Le facteur 2827,4 du PRD est ce produit, calculé plutôt qu’écrit en dur.
  AIRE_ELLIPSE: {
    expression: "aire_arcsec2 = (π / 4) × 3600 × a'_arcmin × b'_arcmin",
    unite: 'arcsec²',
    section: '6.3',
  },
  BRILLANCE_SURFACE: {
    expression: 'SB_obj = m_int + 2,5 × log10( aire_arcsec2 )',
    unite: 'mag/arcsec²',
    section: '6.3',
  },
  CONTRASTE: {
    expression: 'ΔSB = SB_ciel − SB_obj',
    unite: 'mag/arcsec²',
    section: '6.3',
  },
  GAIN_INSTRUMENTAL: {
    expression: 'gain_mag = 5 × log10( D_mm / 6,5 )',
    unite: 'mag',
    section: '6.3',
  },
  MAGNITUDE_LIMITE_INSTRUMENT: {
    expression: 'm_lim_instr = m_lim_oeil + gain_mag',
    unite: 'mag',
    section: '6.3',
  },
  GROSSISSEMENT: {
    expression: 'G = D_mm / pupille_oeil_mm',
    unite: '×',
    section: '6.3',
    note: 'Le grossissement qui montre le mieux un objet étendu.',
  },
  TAILLE_APPARENTE: {
    expression: 'taille_apparente_arcmin = taille_reelle_arcmin × G',
    unite: "'",
    section: '6.3',
    note: 'Un instrument agrandit l’objet sans le rendre plus lumineux.',
  },
  // Tables Blackwell / Clark embarquées. Au-delà de la plus grande taille tabulée, la sommation
  // spatiale est complète : le seuil plafonne, il n’est pas extrapolé.
  SEUIL_CONTRASTE: {
    expression: 'seuil_ΔSB = table_de_contraste( taille_apparente_arcmin )',
    unite: 'mag/arcsec²',
    section: '6.3',
  },

  // Pose et intégration — §7
  FLUX_CIEL: {
    expression: 'E_ciel = 10^( −0,4 × (SB_ciel − ZP_sys) ) × (pitch_um / N)²',
    unite: 'e⁻/s/px',
    section: '7.1',
  },
  FLUX_OBJET: {
    expression: 'E_obj = 10^( −0,4 × (SB_obj − ZP_sys) ) × (pitch_um / N)²',
    unite: 'e⁻/s/px',
    section: '7.1',
  },
  ATTENUATION_ATMOSPHERIQUE: {
    expression: 'attenuation = 10^( −0,4 × k × X )',
    unite: '—',
    section: '7.6',
    note: 'Une cible basse perd plus de lumière dans l’air : il faut poser plus longtemps.',
  },
  FLUX_OBJET_REEL: {
    expression: 'E_obj_reel = E_obj × attenuation',
    unite: 'e⁻/s/px',
    section: '7.6',
    note: 'Lumière de la cible qui atteint vraiment le capteur.',
  },
  POSE_OPTIMALE: {
    expression: 't_opt = C × RN² / E_ciel',
    unite: 's',
    section: '7.2',
  },
  POSE_RETENUE: {
    expression: 't_reco = min( t_opt, t_max_suivi )',
    unite: 's',
    section: '7.2',
  },
  SNR: {
    expression: 'SNR(T) = E_obj × T / √( (E_obj + E_ciel) × T + (T / t_pose) × RN² )',
    unite: '—',
    section: '7.3',
  },
  INTEGRATION_REQUISE: {
    expression: 'T_requis = SNR_cible² × ( E_obj + E_ciel + RN² / t_pose ) / E_obj²',
    unite: 's',
    section: '7.3',
  },
  NOMBRE_POSES: {
    expression: 'N_poses = ceil( T_requis / t_pose )',
    unite: '—',
    section: '7.3',
  },
  PERTE_SNR: {
    expression: 'perte_SNR = 1 − √( C / (C + 1) )',
    unite: '—',
    section: '2.3',
  },
  PLAGE_UTILE_POSE: {
    expression: 'plage_utile = [ t_opt / 2 ; t_opt × 2 ]',
    unite: 's',
    section: '2.3',
    note: 'Ces durées donnent le même résultat.',
  },
  VOLUME_STOCKAGE: {
    expression: 'volume_go = N_poses × taille_raw_mo / 1024',
    unite: 'Go',
    section: '7.3',
  },
  NOMBRE_NUITS: {
    expression: 'n_nuits = ceil( T_requis / duree_creneau_disponible )',
    unite: '—',
    section: '7.3',
  },
  TEMPS_DARKS: {
    expression: 'temps_darks_min = n_darks × t_pose_s / 60',
    unite: 'min',
    section: '7.4',
  },

  // Suivi et filé — §5.2, §9
  POSE_MAX_SUIVI: {
    expression: 't_max_suivi = t_ref × (200 / focale_mm), plafonné à 240 s',
    unite: 's',
    section: '5.2',
  },
  TRACE: {
    expression: 'trace_arcsec = 15,041 × t_s × cos(δ)',
    unite: '"',
    section: '9.1',
  },
  NPF: {
    expression: 't_npf = k × (35 × N + 30 × pitch_um) / ( focale_mm × cos(δ) )',
    unite: 's',
    section: '9.1',
  },
  ARC_FILE: {
    expression: 'arc_deg = 15,041 × duree_h × cos(δ)',
    unite: '°',
    section: '9.3',
  },
  NOMBRE_POSES_FILE: {
    expression: 'n_poses_file = floor( duree_s / (t_pose_s + intervalle_s) )',
    unite: '—',
    section: '9.4',
  },
  POSE_MAX_CADRE: {
    expression: 't_max_cadre = t_npf( δ_min_abs présent dans le cadre )',
    unite: 's',
    section: '9.1',
    note: 'C’est la zone la plus exigeante du cadre qui fixe la pose.',
  },
  MAGNITUDE_LIMITE_PREVISU: {
    expression:
      'm_lim = zp_sys − 2,5 × log10( F_seuil × (206 265 / (1000 × D_mm))² ) · ' +
      'F_seuil × t = ( S² + √(S⁴ + 4 S² n_px (E_ciel t + RN²)) ) / 2',
    unite: 'mag',
    section: '9.2',
    note: 'Dépend de la pose, de l’ouverture et du ciel.',
  },
  VIGNETTAGE: {
    expression: 'attenuation_diaph = v_coins × (r / r_max)²',
    unite: 'diaphragme',
    section: '9.2',
  },
  POSITION_POLE: {
    expression: 'altitude_pole = |latitude| · azimut_pole = 0 si latitude > 0, sinon 180',
    unite: '°',
    section: '9.3',
    note: 'Le pôle est souvent hors du cadre.',
  },
  INTENSITE_TRACE: {
    expression:
      'pose_par_pixel_s = duree_s / longueur_arc_px · ' +
      'opacite = min( 1, 10^( −(mag − m_lim(pose_par_pixel_s)) / 2,5 ) )',
    unite: '—',
    section: '9.3',
    note: 'Une étoile qui file paraît moins brillante.',
  },
  TROU_TRACE: {
    expression: 'trou_deg = 15,041 × intervalle_s / 3600 × cos(δ)',
    unite: '°',
    section: '9.4',
    note: 'Trou entre deux poses, irréparable ensuite.',
  },

  // Position et temps — §4, §8
  ALTITUDE_CULMINATION: {
    expression: 'alt_culmination = 90° − | latitude − δ |',
    unite: '°',
    section: '4.1',
  },
  MASSE_AIR: {
    expression: 'masse_air ≈ 1 / sin( alt )',
    unite: '—',
    section: '8.2',
    note: 'Valable au-dessus d’environ 15° de hauteur.',
  },
  MASSE_AIR_MOYENNE: {
    expression: 'X_moyen = moyenne( 1 / sin(alt_i) ) sur les échantillons du créneau',
    unite: '—',
    section: '8.2',
    note: 'Moyenne sur tout le créneau : plus forte qu’au point le plus haut.',
  },
  DECLINAISON_CIRCUMPOLAIRE: {
    expression: 'circumpolaire si δ > 90° − latitude',
    unite: '°',
    section: '4.1',
  },
  DECLINAISON_MIN_IMAGERIE: {
    expression: 'δ_min_imagerie = latitude − 60°',
    unite: '°',
    section: '4.1',
    note: 'La cible doit monter à 30° au moins.',
  },
  DECLINAISON_MIN_VISUEL: {
    expression: 'δ_min_visuel = latitude − 70°',
    unite: '°',
    section: '4.1',
    note: 'La cible doit monter à 20° au moins.',
  },
  TEMPS_SIDERAL_LOCAL: {
    expression: 'TSL = TSG(t) + longitude_deg / 15',
    unite: 'h',
    section: '3.1',
  },
  ANGLE_ROTATION_CIEL: {
    expression: 'angle_rotation = TSL × 15,041',
    unite: '°',
    section: '3.1',
  },
  ANGLE_HORAIRE: {
    expression: 'cos H = ( sin(h) − sin δ × sin φ ) / ( cos δ × cos φ )',
    unite: '°',
    section: '8.2',
  },
  DUREE_NUIT: {
    expression: 'duree_nuit_h = 2 × (180° − H) / 15,041, avec h = −18°',
    unite: 'h',
    section: '8.1',
  },
  OFFSET_MIDI_SOLAIRE: {
    expression: 'offset_midi_min = (longitude_deg / 15) × 60 − offset_fuseau_h × 60',
    unite: 'min',
    section: '4.1',
    note: 'Le vrai milieu de la nuit ne tombe pas à minuit.',
  },
  PRECESSION: {
    expression: 'precession_deg = 50,29 × n_annees / 3600',
    unite: '°',
    section: '3.1',
  },

  // Lune et fenêtre utile — §8.1
  ILLUMINATION_LUNE: {
    expression: 'illumination = ( 1 + cos(α) ) / 2, α = angle de phase',
    unite: '—',
    section: '8.1',
    note: 'Une Lune couchée ne gêne pas, quelle que soit sa phase.',
  },
  // Masse d’air du modèle de Krisciunas & Schaefer, valide jusqu’à l’horizon.
  MASSE_AIR_KS: {
    expression: 'X(Z) = ( 1 − 0,96 × sin²(Z) )^(−1/2)',
    unite: '—',
    section: '8.1',
  },
  DELTA_SB_LUNE: {
    expression:
      'B_lune = f(ρ) × I*(α) × 10^(−0,4 k X(Z_lune)) × ( 1 − 10^(−0,4 k X(Z_cible)) ) · ' +
      'ΔSB_lune = 2,5 × log10( (B_ciel + B_lune) / B_ciel )',
    unite: 'mag/arcsec²',
    section: '8.1',
    note: 'Une nuit de Lune reste utilisable : poses plus courtes, temps total plus long.',
  },
  // Fond de ciel peint — extension de rendu de §3.3 (T-0096)
  // La luminance d’écran est proportionnelle à la brillance physique du ciel : une seule
  // constante libre, l’exposition. Le rapport entre deux fonds de ciel n’est donc jamais
  // choisi, il est celui des brillances.
  LUMINANCE_FOND_CIEL: {
    expression: 'Y_ecran = K_exposition × B(sb) · (R,V,B)_lin = Y_ecran × (chroma_R, chroma_V, chroma_B)',
    unite: '—',
    section: '3.3',
  },
  // van Rhijn (1921) : la couche émissive est vue sous une épaisseur croissante quand la visée
  // baisse. Le terme d’extinction n’est pas décoratif — van Rhijn seul donnerait ×6 à
  // l’horizon, valeur non observée ; avec l’extinction, ×3,2.
  HALO_HORIZON: {
    expression:
      'vanRhijn(h) = 1 / √( 1 − (R / (R + H))² cos²h ) · ' +
      'facteur(h) = vanRhijn(h) × 10^(−0,4 k (X(h) − 1))',
    unite: '—',
    section: '3.3',
  },
  // Les brillances s’additionnent en nanolamberts, jamais en magnitudes : c’est déjà la règle
  // de ΔSB_lune (§8.1). Le rendu réemploie ce moteur, il ne le réécrit pas.
  SB_EFFECTIF_RENDU: {
    expression: 'B_total = B_site × facteur(h) + B_lune(ρ, h_lune, α) · sb_effectif = B⁻¹(B_total)',
    unite: 'mag/arcsec²',
    section: '3.3',
  },
  DUREE_NUIT_NAUTIQUE: {
    expression: 'fenetre_nautique = [ Soleil à −12° en descente ; Soleil à −12° en montée ]',
    unite: 'h',
    section: '8.1',
    note: 'Utilisée quand il n’y a pas de nuit complètement noire.',
  },

  // Créneaux et plan de session — §8.2, §8.3
  DUREE_CRENEAU: {
    expression: 'creneau = [ alt > seuil ] ∩ fenetre_utile ∩ [ alt > masque(azimut) ]',
    unite: 'min',
    section: '8.2',
    note: 'Dit si le nombre de poses tient dans la nuit.',
  },
  SCORE_CIBLE: {
    expression:
      'score = w_c·S_cadrage + w_h·S_hauteur + w_s·S_signal + w_f·S_fenetre + w_l·S_lune',
    unite: '—',
    section: '8.3',
    note: 'Poids réglables dans les réglages.',
  },
  SCORE_CADRAGE: {
    expression: 'S_cadrage = 1 − | remplissage − 0,42 | / 0,42',
    unite: '—',
    section: '8.3',
  },
  SCORE_HAUTEUR: {
    expression: 'S_hauteur = min( 1, (alt_culmination − 30) / 40 )',
    unite: '—',
    section: '8.3',
  },
  SCORE_SIGNAL: {
    expression: 'S_signal = min( 1, duree_creneau / T_requis )',
    unite: '—',
    section: '8.3',
  },
  SCORE_FENETRE: {
    expression: 'S_fenetre = duree_creneau / duree_nuit_noire',
    unite: '—',
    section: '8.3',
  },
  SCORE_LUNE: {
    expression: 'S_lune = 1 − ΔSB_lune / 3,0, borné à [0 ; 1]',
    unite: '—',
    section: '8.3',
  },
  BUDGET_NUIT: {
    expression:
      'budget = temps_capture + temps_calibration + temps_mise_en_station + temps_pointage × n_cibles',
    unite: 'min',
    section: '8.3',
    note: 'Si la nuit est trop courte, la cible la moins bien notée est retirée.',
  },

  // Cheminement et pointage — §8.4
  ANGLE_ZENITH: {
    expression: 'tan(q) = sin(H) / ( tan(φ) × cos(δ) − sin(δ) × cos(H) )',
    unite: '°',
    section: '8.4',
    note: 'Oriente le schéma de pointage comme le ciel à cette heure.',
  },
  DECALAGE_POINTAGE: {
    expression: 'Δad_h = AD_cible − AD_ancrage · Δdec_deg = δ_cible − δ_ancrage',
    unite: 'h, °',
    section: '8.4',
  },
  DISTANCE_SAUT: {
    expression: 'distance_saut_deg ≤ 0,7 × FOV_chercheur_deg',
    unite: '°',
    section: '8.4',
    note: 'Deux vues successives se chevauchent toujours.',
  },
  SEPARATION_ANGULAIRE: {
    expression: 'cos(d) = sin(δ₁)·sin(δ₂) + cos(δ₁)·cos(δ₂)·cos(AD₁ − AD₂)',
    unite: '°',
    section: '8.4',
  },

  // Conseil filtre et recommandation d'équipement — §7.5, §10.3
  GAIN_FILTRE: {
    expression: 'gain_snr = √( E_ciel_sans / E_ciel_avec )',
    unite: '—',
    section: '7.5',
    note: 'Le filtre bi-bande coupe la pollution lumineuse, pas les nébuleuses en émission.',
  },
  TRANSMISSION_FOND_DE_CIEL: {
    expression: 'fraction_transmise = Σ bandes_passantes_nm / largeur_bande_large_nm',
    unite: '—',
    section: '7.5',
  },

  // Rendu — §3.2, §3.3, §9.2
  MAGNITUDE_LIMITE_ZOOM: {
    expression: 'mag_limite = mag_base + 5 × log10( fov_ref / fov_courant )',
    unite: 'mag',
    section: '3.3',
  },
  RAYON_ETOILE: {
    expression: 'rayon_px = r0 × 10^( −0,15 × (mag − mag_ref) )',
    unite: 'px',
    section: '3.3',
  },
  DENSITE_GALACTIQUE: {
    expression: 'densite(b) = d0 × exp( −|b| / 20° )',
    unite: 'étoiles/deg²',
    section: '9.2',
  },
  MAGNITUDE_LIMITE_RENDUE: {
    expression: 'mag_rendue = min( mag_limite, m_lim_oeil )',
    unite: 'mag',
    section: '3.3',
    note: 'En vue réaliste, seules les étoiles visibles depuis ce ciel sont affichées.',
  },
  // Une seule implémentation : le mode ne change que la fonction radiale R. Deux bases de code
  // feraient diverger le cadre du planétarium et la prévisualisation.
  PROJECTION_RADIALE: {
    expression:
      'R(θ) = 2·tan(θ/2) [stéréographique] · tan(θ) [gnomonique] · θ [équidistante] · ' +
      'x = k·R·sin(φ), y = −k·R·cos(φ), k = (largeur_px / 2) / R(fov / 2)',
    unite: 'px',
    section: '3.3',
  },
  // Précession générale autour du pôle de l’écliptique. Ni nutation, ni termes planétaires du
  // développement IAU 2006 : à l’échelle de lecture d’un planétarium, l’écart reste très
  // inférieur au pixel sur le domaine des séries.
  PRECESSION_MATRICE: {
    expression:
      'P = R_x(−ε) · R_z(ψ) · R_x(ε), avec ψ = 50,29"/an × (époque − 2000)',
    unite: '—',
    section: '3.1',
  },
  // Interpolation linéaire entre deux échantillons d’éphémérides. Les étoiles ne sont JAMAIS
  // interpolées : seule la matrice de rotation du ciel change.
  INTERPOLATION_CORPS: {
    expression: 'pos(t) = pos(t₀) + ( pos(t₁) − pos(t₀) ) × (t − t₀) / (t₁ − t₀)',
    unite: '°',
    section: '3.1',
  },
  VITESSE_ECRAN: {
    expression: 'v_ecran = 15,041 × facteur × px_par_degre / 3600',
    unite: 'px/s',
    section: '3.2',
  },
  FACTEUR_VITESSE_MAX: {
    expression: 'facteur_max = 600 × 3600 / ( 15,041 × px_par_degre )',
    unite: '—',
    section: '3.2',
  },
  // Sert à désigner le facteur dominant d’un verdict.
  SENSIBILITE: {
    expression: 'sensibilite = | ∂ln(sortie) / ∂ln(variable) |',
    unite: '—',
    section: '10.2',
  },

  // Fond de ciel — §2.2
  // Interpolation autorisée entre deux lignes ; extrapolation interdite hors [1 ; 9].
  INTERPOLATION_BORTLE: {
    expression: 'SB(b) = SB(⌊b⌋) + (b − ⌊b⌋) × ( SB(⌈b⌉) − SB(⌊b⌋) )',
    unite: 'mag/arcsec²',
    section: '2.2',
  },
  // Utilisée quand un SQM mesuré prévaut sur le Bortle. Hors du domaine de la table, aucune
  // valeur n’est produite.
  INVERSION_BORTLE: {
    expression: 'm_lim_oeil = interpolation de la colonne « magnitude limite » à SB donnée',
    unite: 'mag',
    section: '2.2',
  },
  // Une mesure prévaut toujours sur une estimation : ce n’est pas un calcul, c’est une donnée.
  MESURE_SQM: {
    expression: 'SB_ciel = sqm_mesure',
    unite: 'mag/arcsec²',
    section: '2.2',
  },
} as const satisfies Record<string, FormulaEntry>)

export type FormulaId = keyof typeof FORMULES

export function formule(id: FormulaId): FormulaEntry & { readonly id: FormulaId } {
  return { id, ...FORMULES[id] }
}
