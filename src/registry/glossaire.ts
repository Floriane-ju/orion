/**
 * §10.1 — Glossaire contextuel.
 *
 * Le glossaire est indexé sur l'INTERFACE, pas sur un lexique : un terme n'y entre que s'il
 * apparaît dans une sortie de moteur, et aucun terme affiché ne peut en être absent.
 *
 * Cette seconde moitié de la règle est tenue par le typage plutôt que par une convention :
 * l'interface ne rend jamais un libellé littéral, elle rend une clé de ce fichier. Un terme
 * ajouté à l'écran sans définition ne compile pas, et le compilateur nomme la clé manquante.
 * C'est ce qui empêche la dérive documentaire.
 *
 * Le glossaire s'étend lot par lot, avec les moteurs qui produisent les termes. Les entrées
 * présentes ici sont celles du contrat d'entrée : §4 lieu, §5.1 optique, §5.2 suivi.
 */

export interface EntreeGlossaire {
  /** Libellé affiché dans l'interface. C'est lui qui est rendu, jamais une chaîne littérale. */
  readonly libelle: string
  /**
   * Glose courte, une phrase au plus, visible au survol. Absente, le libellé s'affiche sans
   * bulle : une glose qu'aucune surface ne montre n'est pas écrite (T-0386).
   */
  readonly glose?: string
  /**
   * Vrai si le libellé seul s'affiche sans bulle, alors que la glose sert ailleurs — dans la
   * bulle d'une valeur tracée.
   */
  readonly sansBulle?: boolean
  /**
   * Une à quatre phrases, facultatives. `{cle}` y est remplacé par l'entrée tracée de même
   * clé (`TracedValue`), là où une valeur de l'utilisateur éclaire la phrase.
   */
  readonly explication?: string
  /** Ce que ça change pour l'utilisateur, en une phrase actionnable — facultatif. */
  readonly consequence?: string
  /**
   * Ce que la bulle d'une valeur tracée ajoute à la glose. Absent : la glose seule. Le reste
   * — explication, conséquence, formule, entrées, constantes — se lit dans la rubrique
   * « Calcul » de la modale info (`CalculsAffiches`).
   */
  readonly bulle?: readonly ('explication' | 'consequence')[]
  readonly sections: readonly string[]
}

function terme(e: EntreeGlossaire): EntreeGlossaire {
  return Object.freeze(e)
}

export const GLOSSAIRE = Object.freeze({
  // §4.1 — profil Lieu
  latitude: terme({
    libelle: 'Latitude',
    sections: ['4.1'],
  }),
  longitude: terme({
    libelle: 'Longitude',
    sections: ['4.1'],
  }),
  altitude_site: terme({
    libelle: 'Altitude du site',
    sections: ['4.1'],
  }),
  midi_solaire_vrai: terme({
    libelle: 'Décalage du midi solaire vrai',
    glose: 'Écart au midi de l’horloge',
    explication:
      'Le milieu de la nuit ne tombe pas à minuit pile. L’écart dépend de la longitude et du ' +
      'fuseau horaire.',
    consequence: 'Les créneaux se centrent sur le vrai milieu de la nuit, pas sur minuit.',
    sections: ['4.1', '8.1'],
  }),
  circumpolaire: terme({
    libelle: 'Circumpolaire',
    glose: 'Astre qui ne se couche jamais',
    explication:
      'Près du pôle, un astre tourne autour sans passer sous l’horizon. Il reste visible toute ' +
      'la nuit.',
    consequence: 'Il se photographie à toute heure, sans course contre la montre.',
    sections: ['4.1', '8.2'],
  }),
  seuil_imagerie: terme({
    libelle: 'Imagerie impossible sous δ',
    glose: 'Limite pour la photo',
    explication:
      'Sous cette déclinaison, une cible ne dépasse jamais trente degrés de hauteur d’ici. ' +
      'L’atmosphère traversée gâche alors la photo.',
    consequence: 'Les cibles sous ce seuil sont hors de portée photo depuis ce lieu.',
    sections: ['4.1'],
  }),
  seuil_visuel: terme({
    libelle: 'Visuel impossible sous δ',
    glose: 'Limite visible pour l’œil',
    explication:
      'L’œil se contente d’une cible plus basse que l’appareil photo. Sous cette déclinaison, ' +
      'même l’observation est impossible d’ici.',
    consequence: 'Entre les deux seuils, on peut observer mais pas photographier.',
    sections: ['4.1'],
  }),
  fond_de_ciel: terme({
    libelle: 'Fond de ciel',
    glose: 'Luminosité du ciel nocturne',
    explication:
      'Pollution lumineuse comprise. Plus le chiffre est grand, plus le ciel est noir.',
    consequence: 'Un ciel plus noir réduit le temps de pose total.',
    sections: ['2.2', '4.1'],
    bulle: ['explication'],
  }),
  bortle: terme({
    libelle: 'Bortle',
    glose: 'Échelle de pollution lumineuse',
    explication: '1 : ciel parfaitement noir. 9 : centre-ville.',
    sections: ['2.2', '4.1'],
  }),
  sqm: terme({
    libelle: 'SQM mesuré',
    glose: 'Mesure réelle du ciel',
    explication: 'Petit appareil de mesure de la noirceur du ciel. Plus fiable que le Bortle.',
    consequence: 'Remplace le Bortle si présente.',
    sections: ['2.2', '4.1'],
  }),
  magnitude_limite_oeil: terme({
    libelle: 'Magnitude limite à l’œil nu',
    glose: 'Étoile la plus faible visible à l’œil nu',
    explication:
      'C’est l’étoile la plus faible visible à l’œil nu sous ce ciel, une fois les yeux habitués ' +
      'au noir. Elle découle du fond de ciel.',
    consequence: 'Sur place, elle sert de repère pour juger la qualité du ciel.',
    sections: ['2.2', '4.1'],
  }),

  // §5.1 — profil optique et capteur
  focale: terme({
    libelle: 'Focale',
    sections: ['5.1'],
  }),
  ouverture: terme({
    libelle: 'Ouverture',
    sections: ['5.1', '7.1'],
  }),
  champ: terme({
    libelle: 'Champ',
    glose: 'Portion de ciel cadrée',
    sansBulle: true,
    explication:
      'Angle de ciel couvert par la photo. Il dépend de la taille du capteur et de la focale.',
    consequence: 'Comparez-le à la taille de la cible pour savoir si elle tient dans l’image.',
    sections: ['5.1', '6.2'],
    bulle: ['explication'],
  }),
  recadrage_capteur: terme({
    libelle: 'Format du capteur',
    sections: ['5.1'],
  }),
  format_capteur: terme({
    libelle: 'Type de capteur',
    glose: 'Taille du capteur',
    explication: 'Plein format, APS-C, micro 4/3…',
    sections: ['5.1'],
  }),
  resolution_capteur: terme({
    libelle: 'Résolution',
    glose: 'Nombre de mégapixels',
    sections: ['5.1'],
  }),
  bruit_de_lecture: terme({
    libelle: 'Bruit de lecture',
    glose: 'Bruit ajouté à chaque photo',
    explication:
      'Le capteur ajoute un peu de bruit à chaque image, quelle que soit la pose. Plus il est ' +
      'faible, plus les poses peuvent être courtes.',
    consequence:
      'Valeur sur Photons to Photos ; laissé vide, une valeur type est utilisée [ESTIMÉ].',
    sections: ['5.1', '7.2'],
  }),
  seuil_double_gain: terme({
    libelle: 'Seuil de double gain',
    glose: 'ISO où le bruit chute',
    explication:
      'Beaucoup de capteurs voient leur bruit baisser d’un coup au-delà d’un certain ISO. Monter ' +
      'plus haut n’apporte ensuite plus rien.',
    sections: ['5.1', '7.2'],
  }),
  poids_image: terme({
    libelle: 'Poids d’une image',
    sections: ['5.1', '7.3'],
  }),
  point_zero_systeme: terme({
    libelle: 'Point zéro système',
    glose: 'Sensibilité globale du matériel',
    explication:
      'Il résume en un chiffre l’efficacité de l’objectif et du capteur. Il se mesure sur un ' +
      'champ d’étoiles connu.',
    consequence: 'Facultatif : une erreur dessus change peu la pose conseillée.',
    sections: ['2.3', '5.1'],
  }),

  // §5.2 — profil Suivi
  type_monture: terme({
    libelle: 'Monture',
    glose: 'Suivi des étoiles',
    sections: ['5.2', '8.2'],
  }),
  npf: terme({
    libelle: 'Pose maximale sans suivi',
    glose: 'Pose max avant que les étoiles filent',
    explication:
      'Sans suivi, les étoiles s’étirent en traits au-delà de cette durée. Elle dépend de la ' +
      'focale, de l’ouverture et de la zone du ciel visée.',
    consequence: 'Sans monture, ne posez pas plus longtemps.',
    sections: ['9.1'],
  }),

  // §6.3 — détectabilité
  magnitude_integree: terme({
    libelle: 'Magnitude intégrée',
    glose: 'Éclat total de l’objet',
    explication:
      'C’est toute la lumière de l’objet, comme s’il était un point. Pour un objet étendu, elle ' +
      'trompe : sa lumière est étalée.',
    sections: ['6.3'],
  }),

  // §7 — moteur Pose
  extinction_atmospherique: terme({
    libelle: 'Atténuation atmosphérique',
    glose: 'Lumière perdue dans l’air',
    explication:
      'L’atmosphère absorbe une partie de la lumière de la cible. Plus la cible est basse, plus ' +
      'la perte est forte.',
    consequence: 'Viser haut peut diviser le temps de pose.',
    sections: ['7.6'],
    bulle: ['explication', 'consequence'],
  }),
  pose_unitaire: terme({
    libelle: 'Pose unitaire',
    sansBulle: true,
    glose: 'Durée d’une photo',
    explication:
      'C’est la durée conseillée pour chaque photo. Sous un ciel noir, elle est plus longue : ' +
      'chaque photo ajoute le bruit de lecture du capteur, et la pose doit durer ' +
      'assez pour que la lumière du fond de ciel le noie. Un ciel noir en apporte moins vite.',
    consequence: 'Réglez cette durée sur l’appareil.',
    sections: ['7.2'],
    bulle: ['explication'],
  }),
  mode_permissif: terme({
    libelle: 'Mode permissif',
    glose: 'Poses plus courtes',
    explication:
      'Il raccourcit les poses au prix d’un peu de qualité. Utile quand le vent, un ciel pollué ' +
      'ou un suivi imprécis gâchent des photos.',
    consequence: 'Par nuit calme, laissez-le désactivé.',
    sections: ['2.3', '7.2'],
  }),
  mon_boitier: terme({
    libelle: 'Mon boîtier',
    sections: ['5.1'],
  }),
  iso_recommande: terme({
    libelle: 'ISO recommandé',
    glose: 'Meilleur ISO pour ce boîtier',
    explication:
      'Au-delà de cet ISO, le bruit ne baisse plus. Monter plus haut réduit seulement la ' +
      'dynamique.',
    sections: ['7.2'],
  }),
  snr_cible: terme({
    libelle: 'Qualité visée',
    sections: ['7.3'],
  }),
  integration_totale: terme({
    libelle: 'Intégration totale',
    glose: 'Temps de pose cumulé',
    explication:
      'C’est la somme de toutes les poses sur une cible. Elle peut se répartir sur plusieurs ' +
      'nuits.',
    consequence: 'Elle dit si la cible tient dans une nuit.',
    sections: ['7.3'],
    bulle: ['explication'],
  }),
  volume_stockage: terme({
    libelle: 'Volume de stockage',
    sansBulle: true,
    explication: 'Taille d’une image : {taille_raw_mo} Mo.',
    consequence: 'Emportez une carte assez grande.',
    sections: ['7.3'],
    bulle: ['explication'],
  }),
  nombre_nuits: terme({
    libelle: 'Nombre de nuits',
    glose: 'Nuits nécessaires',
    explication:
      'Quand le temps total dépasse une nuit, la cible se photographie sur plusieurs nuits. ' +
      'Chaque nuit demande ses propres darks.',
    consequence: 'Une cible longue devient une série de nuits ordinaires.',
    sections: ['7.3'],
    bulle: ['explication'],
  }),
  plan_calibration: terme({
    libelle: 'Plan de calibration',
    glose: 'Photos de correction',
    explication:
      'Offsets, darks et flats corrigent les défauts du capteur et de l’objectif. À grande ' +
      'ouverture, les flats comptent le plus.',
    consequence: 'Prévoyez leur temps dans la séance.',
    sections: ['7.4'],
    bulle: ['explication'],
  }),
  dithering: terme({
    libelle: 'Dithering',
    glose: 'Léger décalage entre photos',
    explication:
      'Décaler l’image de quelques pixels entre les poses efface les pixels chauds. Sans ' +
      'autoguidage, la dérive naturelle suffit.',
    consequence: 'Il ne coûte rien et améliore nettement l’image.',
    sections: ['7.4'],
  }),

  // §8.2 — créneau
  culmination: terme({
    libelle: 'Culminant',
    glose: 'Heure où l’objet est au plus haut',
    consequence: 'Centrez la séance sur cette heure quand la nuit le permet.',
    sections: ['8.2'],
  }),
  cause_exclusion: terme({
    libelle: 'Cause d’exclusion',
    sections: ['8.2'],
  }),

  // §8.4 — pointage
  mode_pointage: terme({
    libelle: 'Mode de pointage',
    glose: 'Comment trouver la cible',
    explication:
      'Avec un grand champ, une carte suffit : le cadre contient toujours des étoiles repères. ' +
      'Avec un champ étroit, on saute d’étoile en étoile depuis une étoile brillante.',
    consequence: 'Il est choisi selon votre matériel.',
    sections: ['8.4'],
  }),
  angle_orientation: terme({
    libelle: 'Orientation du champ',
    glose: 'Rotation du schéma',
    explication:
      'Le ciel tourne pendant la nuit. Le schéma est orienté comme vous verrez le ciel à cette ' +
      'heure.',
    consequence: 'Consultez-le à l’heure du pointage.',
    sections: ['8.4'],
    bulle: ['explication'],
  }),
  decalage_pointage: terme({
    libelle: 'Décalage de pointage',
    glose: 'Écart jusqu’à la cible',
    explication:
      'C’est la distance entre l’étoile repère et la cible, en ascension droite et en ' +
      'déclinaison. Elle se reporte sur les cercles gradués de la monture.',
    consequence: 'Partez de l’étoile repère et déplacez-vous de cet écart.',
    sections: ['8.4'],
  }),

  // §11 — mode nuit
  luminance_mode_nuit: terme({
    libelle: 'Luminance du mode nuit',
    sections: ['11.1'],
  }),

  // §3 — planétarium et rendu du ciel
  magnitude_limite_rendue: terme({
    libelle: 'Profondeur affichée',
    explication:
      'Zoomer affiche des étoiles plus faibles. En vue réaliste, seules celles visibles depuis ' +
      'votre ciel apparaissent.',
    sections: ['3.3'],
  }),

  // §9 — grand champ, prévisualisation et filé
  pose_max_cadre: terme({
    libelle: 'Pose max du cadre',
    sansBulle: true,
    glose: 'Pose max sur tout le cadre',
    explication:
      'Les étoiles bougent plus vite loin du pôle. La pose retenue est celle de la zone du cadre ' +
      'la plus exigeante.',
    consequence: 'Cadrer plus près du pôle autorise des poses plus longues.',
    sections: ['9.1'],
    bulle: ['explication'],
  }),
  pole_celeste: terme({
    libelle: 'Centre de rotation',
    sections: ['9.3'],
  }),
  longueur_arc: terme({
    libelle: 'Longueur d’arc',
    sansBulle: true,
    glose: 'Longueur des traînées',
    explication:
      'Plus la séquence dure, plus les traînées sont longues. Près du pôle, elles restent ' +
      'courtes.',
    consequence: 'Sous un dixième de la hauteur du cadre, les étoiles paraissent floues.',
    sections: ['9.3'],
    bulle: ['explication'],
  }),
  duree_file: terme({
    libelle: 'Temps de prise de vue',
    sections: ['9.3', '9.4'],
  }),
  intervalle_file: terme({
    libelle: 'Intervalle inter-pose',
    sansBulle: true,
    glose: 'Pause entre deux poses',
    explication:
      'Chaque seconde de pause laisse un trou dans les traînées.',
    consequence: 'Désactivez la réduction de bruit longue pose avant de partir.',
    sections: ['9.4'],
    bulle: ['explication'],
  }),
  n_poses_file: terme({
    libelle: 'Nombre de poses',
    sansBulle: true,
    glose: 'Photos de la séquence',
    explication:
      'C’est la durée totale divisée par la durée d’une pose, arrondie au-dessus. Les photos ' +
      's’empilent ensuite en mode éclaircir.',
    consequence: 'Prévoyez la place sur la carte.',
    sections: ['9.4'],
  }),

} as const satisfies Record<string, EntreeGlossaire>)

export type TermeGlossaire = keyof typeof GLOSSAIRE

export function glose(cle: TermeGlossaire): EntreeGlossaire {
  return GLOSSAIRE[cle]
}
