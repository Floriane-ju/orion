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
  /** Glose courte, une phrase au plus, visible au survol. */
  readonly glose: string
  /** Vrai si le libellé s'affiche sans bulle au survol : le nom seul suffit déjà. */
  readonly sansBulle?: boolean
  /** Deux à quatre phrases, dans la bulle d'une valeur tracée. */
  readonly explication: string
  /** Ce que ça change pour l'utilisateur, en une phrase actionnable. */
  readonly consequence: string
  readonly sections: readonly string[]
}

function terme(e: EntreeGlossaire): EntreeGlossaire {
  return Object.freeze(e)
}

export const GLOSSAIRE = Object.freeze({
  // §4.1 — profil Lieu
  latitude: terme({
    libelle: 'Latitude',
    glose: 'position nord-sud du lieu',
    sansBulle: true,
    explication:
      'Elle fixe la partie du ciel visible depuis chez vous. Plus on s’éloigne de l’équateur, ' +
      'plus le ciel de l’autre hémisphère reste bas.',
    consequence: 'Une erreur d’un degré décale d’autant la hauteur de chaque cible.',
    sections: ['4.1'],
  }),
  longitude: terme({
    libelle: 'Longitude',
    glose: 'position est-ouest du lieu',
    sansBulle: true,
    explication:
      'Elle ne change pas ce qui est visible, seulement à quelle heure. Elle décale le vrai ' +
      'milieu de la nuit.',
    consequence: 'Elle cale les horaires des créneaux.',
    sections: ['4.1'],
  }),
  altitude_site: terme({
    libelle: 'Altitude du site',
    glose: 'hauteur du lieu',
    sansBulle: true,
    explication: 'Elle joue très peu sur les calculs. Une valeur approchée suffit.',
    consequence: 'Cent mètres d’écart ne changent rien.',
    sections: ['4.1'],
  }),
  midi_solaire_vrai: terme({
    libelle: 'Décalage du midi solaire vrai',
    glose: 'écart au midi de l’horloge',
    explication:
      'Le milieu de la nuit ne tombe pas à minuit pile. L’écart dépend de la longitude et du ' +
      'fuseau horaire.',
    consequence: 'Les créneaux se centrent sur le vrai milieu de la nuit, pas sur minuit.',
    sections: ['4.1', '8.1'],
  }),
  circumpolaire: terme({
    libelle: 'Circumpolaire',
    glose: 'astre qui ne se couche jamais',
    explication:
      'Près du pôle, un astre tourne autour sans passer sous l’horizon. Il reste visible toute ' +
      'la nuit.',
    consequence: 'Il se photographie à toute heure, sans course contre la montre.',
    sections: ['4.1', '8.2'],
  }),
  seuil_imagerie: terme({
    libelle: 'Imagerie impossible sous δ',
    glose: 'limite pour la photo',
    explication:
      'Sous cette déclinaison, une cible ne dépasse jamais trente degrés de hauteur d’ici. ' +
      'L’atmosphère traversée gâche alors la photo.',
    consequence: 'Les cibles sous ce seuil sont hors de portée photo depuis ce lieu.',
    sections: ['4.1'],
  }),
  seuil_visuel: terme({
    libelle: 'Visuel impossible sous δ',
    glose: 'limite pour l’œil',
    explication:
      'L’œil se contente d’une cible plus basse que l’appareil photo. Sous cette déclinaison, ' +
      'même l’observation est impossible d’ici.',
    consequence: 'Entre les deux seuils, on peut observer mais pas photographier.',
    sections: ['4.1'],
  }),
  fond_de_ciel: terme({
    libelle: 'Fond de ciel',
    glose: 'luminosité du ciel nocturne',
    explication:
      'C’est la lumière du ciel lui-même, pollution lumineuse comprise. Plus le chiffre est ' +
      'grand, plus le ciel est noir.',
    consequence: 'Un ciel plus noir réduit le temps de pose total.',
    sections: ['2.2', '4.1'],
  }),
  bortle: terme({
    libelle: 'Bortle',
    glose: 'échelle de pollution lumineuse',
    explication:
      'Elle va de 1, ciel parfaitement noir, à 9, centre-ville. Elle sert d’estimation quand on ' +
      'n’a pas de mesure.',
    consequence: 'Une estimation à un cran près suffit.',
    sections: ['2.2', '4.1'],
  }),
  sqm: terme({
    libelle: 'SQM mesuré',
    glose: 'mesure réelle du ciel',
    explication:
      'Un SQM est un petit appareil qui mesure la noirceur du ciel. Une mesure est plus fiable ' +
      'que l’échelle de Bortle.',
    consequence: 'Si vous avez une mesure, elle remplace le Bortle.',
    sections: ['2.2', '4.1'],
  }),
  magnitude_limite_oeil: terme({
    libelle: 'Magnitude limite à l’œil nu',
    glose: 'étoile la plus faible visible',
    explication:
      'C’est l’étoile la plus faible visible à l’œil nu sous ce ciel, une fois les yeux habitués ' +
      'au noir. Elle découle du fond de ciel.',
    consequence: 'Sur place, elle sert de repère pour juger la qualité du ciel.',
    sections: ['2.2', '4.1'],
  }),

  // §5.1 — profil optique et capteur
  focale: terme({
    libelle: 'Focale',
    glose: 'longueur focale de l’objectif',
    sansBulle: true,
    explication:
      'Plus elle est longue, plus le champ est étroit et les objets grands. Elle entre dans ' +
      'presque tous les calculs.',
    consequence: 'Doubler la focale divise le champ par deux.',
    sections: ['5.1'],
  }),
  ouverture: terme({
    libelle: 'Ouverture',
    glose: 'nombre f de l’objectif',
    sansBulle: true,
    explication:
      'Plus le nombre f est petit, plus l’objectif collecte de lumière. C’est lui qui fixe le ' +
      'temps de pose.',
    consequence: 'Ouvrir d’un cran divise par deux le temps de pose nécessaire.',
    sections: ['5.1', '7.1'],
  }),
  champ: terme({
    libelle: 'Champ',
    glose: 'portion de ciel cadrée',
    sansBulle: true,
    explication:
      'C’est l’angle de ciel couvert par la photo. Il dépend de la taille du capteur et de la ' +
      'focale.',
    consequence: 'Comparez-le à la taille de la cible pour savoir si elle tient dans l’image.',
    sections: ['5.1', '6.2'],
  }),
  recadrage_capteur: terme({
    libelle: 'Format du capteur',
    glose: 'plein format ou APS-C',
    sansBulle: true,
    explication:
      'Le recadrage n’utilise que le centre du capteur. Il réduit le champ, sans grossir les ' +
      'détails.',
    consequence: 'Passer en recadrage cadre plus serré, sans rapprocher la cible.',
    sections: ['5.1'],
  }),
  format_capteur: terme({
    libelle: 'Type de capteur',
    glose: 'taille du capteur',
    explication:
      'C’est la taille physique du capteur : plein format, APS-C, micro 4/3. Elle figure sur la ' +
      'fiche technique de l’appareil. L’APS-C de Nikon, Sony, Pentax et Fujifilm mesure ' +
      '23,5 × 15,6 mm ; celui de Canon est un peu plus petit, et a sa propre ligne.',
    consequence: 'Se tromper de format fausse le champ sans alerte.',
    sections: ['5.1'],
  }),
  resolution_capteur: terme({
    libelle: 'Résolution',
    glose: 'nombre de mégapixels',
    explication: 'Elle figure sur la fiche technique de l’appareil. La valeur arrondie suffit.',
    consequence: 'Indispensable, avec le type de capteur, pour calculer le champ.',
    sections: ['5.1'],
  }),
  bruit_de_lecture: terme({
    libelle: 'Bruit de lecture',
    glose: 'bruit ajouté à chaque photo',
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
    consequence: 'Il désigne le meilleur ISO pour vos poses.',
    sections: ['5.1', '7.2'],
  }),
  poids_image: terme({
    libelle: 'Poids d’une image',
    glose: 'taille d’un fichier RAW',
    sansBulle: true,
    explication:
      'Multipliée par le nombre de poses, elle donne la place à prévoir sur la carte. Regardez ' +
      'la taille d’un RAW déjà pris.',
    consequence: 'Laissée vide, une taille type est utilisée [ESTIMÉ].',
    sections: ['5.1', '7.3'],
  }),
  point_zero_systeme: terme({
    libelle: 'Point zéro système',
    glose: 'sensibilité globale du matériel',
    explication:
      'Il résume en un chiffre l’efficacité de l’objectif et du capteur. Il se mesure sur un ' +
      'champ d’étoiles connu.',
    consequence: 'Facultatif : une erreur dessus change peu la pose conseillée.',
    sections: ['2.3', '5.1'],
  }),

  // §5.2 — profil Suivi
  suivi: terme({
    libelle: 'Suivi',
    glose: 'monture qui suit les étoiles',
    explication:
      'Une monture motorisée compense la rotation du ciel. Elle permet des poses bien plus ' +
      'longues.',
    consequence: 'Sans suivi, seules les photos grand champ sont possibles.',
    sections: ['5.2'],
  }),
  type_monture: terme({
    libelle: 'Monture',
    glose: 'ce qui suit les étoiles, et sa mise en station',
    explication:
      'Une équatoriale allemande doit se retourner quand la cible passe le méridien. Une monture ' +
      'sur rotule, non. Le même choix déclare la mise en station : au viseur polaire, les poses ' +
      'tiennent bien plus longtemps qu’à la boussole.',
    consequence: 'Elle fixe la pose maximale, et le retournement au méridien s’il y en a un.',
    sections: ['5.2', '8.2'],
  }),
  npf: terme({
    libelle: 'Pose maximale sans suivi',
    glose: 'pose avant que les étoiles filent',
    explication:
      'Sans suivi, les étoiles s’étirent en traits au-delà de cette durée. Elle dépend de la ' +
      'focale, de l’ouverture et de la zone du ciel visée.',
    consequence: 'Sans monture, ne posez pas plus longtemps.',
    sections: ['9.1'],
  }),

  // §6.3 — détectabilité
  magnitude_integree: terme({
    libelle: 'Magnitude intégrée',
    glose: 'éclat total de l’objet',
    explication:
      'C’est toute la lumière de l’objet, comme s’il était un point. Pour un objet étendu, elle ' +
      'trompe : sa lumière est étalée.',
    consequence: 'Ne jugez pas une nébuleuse ou une galaxie sur ce seul chiffre.',
    sections: ['6.3'],
  }),

  // §7 — moteur Pose
  masse_air: terme({
    libelle: 'Masse d’air',
    glose: 'épaisseur d’atmosphère traversée',
    explication:
      'Elle vaut 1 quand la cible est au zénith et grandit quand elle descend. Près de ' +
      'l’horizon, l’image se dégrade vite.',
    consequence: 'Photographiez la cible quand elle est haute.',
    sections: ['7.6', '8.2'],
  }),
  extinction_atmospherique: terme({
    libelle: 'Atténuation atmosphérique',
    glose: 'lumière perdue dans l’air',
    explication:
      'L’atmosphère absorbe une partie de la lumière de la cible. Plus la cible est basse, plus ' +
      'la perte est forte.',
    consequence: 'Viser haut peut diviser le temps de pose par deux.',
    sections: ['7.6'],
  }),
  pose_unitaire: terme({
    libelle: 'Pose unitaire',
    sansBulle: true,
    glose: 'durée d’une photo',
    explication:
      'C’est la durée conseillée pour chaque photo. Sous un ciel noir, elle est plus longue, pas ' +
      'plus courte.',
    consequence: 'Réglez cette durée sur l’appareil.',
    sections: ['7.2'],
  }),
  mode_permissif: terme({
    libelle: 'Mode permissif',
    glose: 'poses plus courtes',
    explication:
      'Il raccourcit les poses au prix d’un peu de qualité. Utile quand le vent, un ciel pollué ' +
      'ou un suivi imprécis gâchent des photos.',
    consequence: 'Par nuit calme, laissez-le désactivé.',
    sections: ['2.3', '7.2'],
  }),
  mon_boitier: terme({
    libelle: 'Mon boîtier',
    sansBulle: true,
    glose: 'votre appareil photo',
    explication:
      'Choisir le modèle apporte les caractéristiques de son capteur. La pose et l’ISO ' +
      'conseillés sont alors propres à votre appareil.',
    consequence: 'Absent de la liste : indiquez le type de capteur et la résolution.',
    sections: ['5.1'],
  }),
  iso_recommande: terme({
    libelle: 'ISO recommandé',
    glose: 'meilleur ISO pour ce boîtier',
    explication:
      'Au-delà de cet ISO, le bruit ne baisse plus. Monter plus haut réduit seulement la ' +
      'dynamique.',
    consequence: 'Réglez l’appareil sur cet ISO pour toute la séance.',
    sections: ['7.2'],
  }),
  snr_cible: terme({
    libelle: 'Qualité visée',
    sansBulle: true,
    glose: 'qualité de l’image finale',
    explication:
      'Plus elle est haute, plus l’image est lisse. Doubler la qualité demande quatre fois plus ' +
      'de temps.',
    consequence: 'Commencez modeste, quitte à compléter une autre nuit.',
    sections: ['7.3'],
  }),
  integration_totale: terme({
    libelle: 'Intégration totale',
    glose: 'temps de pose cumulé',
    explication:
      'C’est la somme de toutes les poses sur une cible. Elle peut se répartir sur plusieurs ' +
      'nuits.',
    consequence: 'Elle dit si la cible tient dans une nuit.',
    sections: ['7.3'],
  }),
  volume_stockage: terme({
    libelle: 'Volume de stockage',
    sansBulle: true,
    glose: 'place sur la carte',
    explication:
      'C’est le nombre de photos multiplié par la taille d’un fichier. Une seule cible peut ' +
      'remplir une carte de 32 Go.',
    consequence: 'Emportez une carte assez grande.',
    sections: ['7.3'],
  }),
  nombre_nuits: terme({
    libelle: 'Nombre de nuits',
    glose: 'nuits nécessaires',
    explication:
      'Quand le temps total dépasse une nuit, la cible se photographie sur plusieurs nuits. ' +
      'Chaque nuit demande ses propres darks.',
    consequence: 'Une cible longue devient une série de nuits ordinaires.',
    sections: ['7.3'],
  }),
  plan_calibration: terme({
    libelle: 'Plan de calibration',
    glose: 'photos de correction',
    explication:
      'Offsets, darks et flats corrigent les défauts du capteur et de l’objectif. À grande ' +
      'ouverture, les flats comptent le plus.',
    consequence: 'Prévoyez leur temps dans la séance.',
    sections: ['7.4'],
  }),
  dithering: terme({
    libelle: 'Dithering',
    glose: 'léger décalage entre photos',
    explication:
      'Décaler l’image de quelques pixels entre les poses efface les pixels chauds. Sans ' +
      'autoguidage, la dérive naturelle suffit.',
    consequence: 'Il ne coûte rien et améliore nettement l’image.',
    sections: ['7.4'],
  }),

  // §8.1 — fenêtre nocturne et Lune
  // §8.2 — créneau
  creneau: terme({
    libelle: 'Créneau d’observation',
    glose: 'quand photographier la cible',
    explication:
      'C’est le moment où la cible est assez haute, hors du relief et de nuit. Avec une ' +
      'équatoriale allemande, le retournement au méridien le coupe en deux.',
    consequence: 'Il dit si la cible tient en une nuit.',
    sections: ['8.2'],
  }),
  culmination: terme({
    libelle: 'Culminant',
    glose: 'heure où l’objet est au plus haut',
    explication:
      'C’est l’instant où la cible passe au méridien, plein sud depuis l’hémisphère nord. ' +
      'Elle y traverse le moins d’atmosphère : l’image est la plus nette et la moins voilée.',
    consequence: 'Centrez la séance sur cette heure quand la nuit le permet.',
    sections: ['8.2'],
  }),
  cause_exclusion: terme({
    libelle: 'Cause d’exclusion',
    glose: 'pourquoi la cible est écartée',
    explication:
      'Trop basse, cachée par le relief, gênée par la Lune ou jamais levée. Chaque cible écartée ' +
      'dit pourquoi.',
    consequence: 'La cause dit quoi changer : date, lieu ou cible.',
    sections: ['8.2'],
  }),

  // §8.4 — pointage
  mode_pointage: terme({
    libelle: 'Mode de pointage',
    glose: 'comment trouver la cible',
    explication:
      'Avec un grand champ, une carte suffit : le cadre contient toujours des étoiles repères. ' +
      'Avec un champ étroit, on saute d’étoile en étoile depuis une étoile brillante.',
    consequence: 'Il est choisi selon votre matériel.',
    sections: ['8.4'],
  }),
  angle_orientation: terme({
    libelle: 'Orientation du champ',
    glose: 'rotation du schéma',
    explication:
      'Le ciel tourne pendant la nuit. Le schéma est orienté comme vous verrez le ciel à cette ' +
      'heure.',
    consequence: 'Consultez-le à l’heure du pointage.',
    sections: ['8.4'],
  }),
  decalage_pointage: terme({
    libelle: 'Décalage de pointage',
    glose: 'écart jusqu’à la cible',
    explication:
      'C’est la distance entre l’étoile repère et la cible, en ascension droite et en ' +
      'déclinaison. Elle se reporte sur les cercles gradués de la monture.',
    consequence: 'Partez de l’étoile repère et déplacez-vous de cet écart.',
    sections: ['8.4'],
  }),

  // §11 — mode nuit
  luminance_mode_nuit: terme({
    libelle: 'Luminance du mode nuit',
    sansBulle: true,
    glose: 'luminosité de l’écran',
    explication:
      'Baissez-la au minimum confortable pour garder la vision de nuit. Sur un écran LCD, un peu ' +
      'de lumière passe toujours.',
    consequence: 'Plus l’écran est sombre, mieux vos yeux restent adaptés au noir.',
    sections: ['11.1'],
  }),

  // §3 — planétarium et rendu du ciel
  magnitude_limite_rendue: terme({
    libelle: 'Profondeur affichée',
    glose: 'étoiles les plus faibles affichées',
    explication:
      'Zoomer affiche des étoiles plus faibles. En vue réaliste, seules celles visibles depuis ' +
      'votre ciel apparaissent.',
    consequence: 'Désactivez la vue réaliste pour voir tout le catalogue.',
    sections: ['3.3'],
  }),

  // §9 — grand champ, prévisualisation et filé
  pose_max_cadre: terme({
    libelle: 'Pose max du cadre',
    sansBulle: true,
    glose: 'pose max sur tout le cadre',
    explication:
      'Les étoiles bougent plus vite loin du pôle. La pose retenue est celle de la zone du cadre ' +
      'la plus exigeante.',
    consequence: 'Cadrer plus près du pôle autorise des poses plus longues.',
    sections: ['9.1'],
  }),
  pole_celeste: terme({
    libelle: 'Centre de rotation',
    sansBulle: true,
    glose: 'centre de rotation du ciel',
    explication:
      'Les étoiles tournent autour de ce point, à une hauteur égale à votre latitude. Il est ' +
      'souvent hors du cadre.',
    consequence: 'Cadrez-le pour obtenir des cercles concentriques.',
    sections: ['9.3'],
  }),
  longueur_arc: terme({
    libelle: 'Longueur d’arc',
    sansBulle: true,
    glose: 'longueur des traînées',
    explication:
      'Plus la séquence dure, plus les traînées sont longues. Près du pôle, elles restent ' +
      'courtes.',
    consequence: 'Sous un dixième de la hauteur du cadre, les étoiles paraissent floues.',
    sections: ['9.3'],
  }),
  duree_file: terme({
    libelle: 'Temps de prise de vue',
    sansBulle: true,
    glose: 'durée totale photographiée',
    explication:
      'Jusqu’à la pose max du cadre, c’est une seule photo aux étoiles ponctuelles. Au-delà, ' +
      'c’est une séquence de poses dont les étoiles filent.',
    consequence: 'Doubler la durée double la longueur des traînées.',
    sections: ['9.3', '9.4'],
  }),
  intervalle_file: terme({
    libelle: 'Intervalle inter-pose',
    sansBulle: true,
    glose: 'pause entre deux poses',
    explication:
      'Chaque seconde de pause laisse un trou dans les traînées. La réduction de bruit longue ' +
      'pose de l’appareil crée une pause aussi longue que la pose.',
    consequence: 'Désactivez la réduction de bruit longue pose avant de partir.',
    sections: ['9.4'],
  }),
  n_poses_file: terme({
    libelle: 'Nombre de poses',
    sansBulle: true,
    glose: 'photos de la séquence',
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
