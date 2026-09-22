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
  /** Deux à quatre phrases, au clic. */
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
  masque_horizon: terme({
    libelle: 'Masque d’horizon',
    glose: 'relief qui cache l’horizon',
    explication:
      'Pour chaque direction, la hauteur sous laquelle arbres, collines ou bâtiments cachent le ' +
      'ciel. Sans relevé, l’horizon est supposé plat.',
    consequence: 'Sur un site encaissé, le renseigner évite de viser une cible cachée.',
    sections: ['4.1', '8.1'],
  }),
  hypothese: terme({
    // T-0275 — le badge s'écrit en toutes lettres : « [HYP] » était une abréviation interne
    // que cette entrée devait justement expliquer, ce qui la rendait circulaire.
    libelle: 'Hypothèse',
    glose: 'valeur supposée, non mesurée',
    explication:
      'Une valeur marquée [HYPOTHÈSE] comble une donnée absente par une hypothèse par ' +
      'défaut. Elle ' +
      'est affichée comme telle pour qu’aucune sortie qui en dépend ne passe pour une mesure.',
    consequence: 'Remplacer une hypothèse par une donnée réelle affine tout ce qui en découle.',
    sections: ['4.1', '2.3'],
  }),
  declinaison: terme({
    libelle: 'Déclinaison',
    glose: 'latitude d’un astre dans le ciel',
    explication:
      'C’est la position nord-sud d’un astre sur la voûte céleste. Avec votre latitude, elle ' +
      'fixe la hauteur maximale de la cible.',
    consequence: 'Comparée aux seuils du lieu, elle dit tout de suite si la cible est accessible.',
    sections: ['4.1', '8.2'],
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
  pitch: terme({
    libelle: 'Pitch',
    glose: 'taille d’un pixel',
    explication:
      'C’est la distance entre deux pixels du capteur. Il se déduit du type de capteur et de la ' +
      'résolution.',
    consequence: 'Rien à saisir : il est calculé pour vous.',
    sections: ['5.1'],
  }),
  echantillonnage: terme({
    libelle: 'Échantillonnage',
    glose: 'ciel couvert par pixel',
    explication:
      'L’échantillonnage dit combien de secondes d’arc de ciel tombent sur un pixel. Sous une ' +
      'seconde, on enregistre surtout du bruit ; au-delà de quatre, la résolution est limitée ' +
      'par le pixel et non par l’optique. Ce dernier régime est le régime normal du grand ' +
      'champ, pas un défaut.',
    consequence: 'Il fixe la taille en pixels de toute cible, et donc ce qui est cadrable.',
    sections: ['5.1', '6.2'],
  }),
  diametre_pupille: terme({
    libelle: 'Diamètre de pupille',
    glose: 'ouverture réelle de l’objectif',
    explication:
      'C’est le diamètre physique du faisceau entrant, égal à la focale divisée par le nombre ' +
      'f. Il commande la quantité de lumière collectée et le pouvoir séparateur théorique.',
    consequence: 'À focale égale, un plus grand diamètre gagne à la fois en flux et en finesse.',
    sections: ['5.1', '6.3'],
  }),
  pouvoir_separateur: terme({
    libelle: 'Pouvoir séparateur',
    glose: 'plus petit détail séparable',
    explication:
      'La limite de Dawes donne l’écart angulaire minimal entre deux étoiles encore ' +
      'distinguables, à partir du seul diamètre de la pupille. C’est une limite optique ' +
      'théorique, souvent hors d’atteinte car la turbulence ou l’échantillonnage limitent avant.',
    consequence:
      'Comparé à l’échantillonnage, il dit lequel des deux limite réellement l’image.',
    sections: ['5.1'],
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
  plein_format: terme({
    libelle: 'Plein format',
    glose: 'capteur au format argentique',
    explication:
      'Le plein format désigne un capteur de vingt-quatre sur trente-six millimètres, hérité du ' +
      'film. Il sert de référence pour comparer les champs entre matériels différents.',
    consequence: 'Toute focale équivalente citée ailleurs se rapporte à ce format.',
    sections: ['5.1'],
  }),
  type_objectif: terme({
    libelle: 'Type d’objectif',
    glose: 'rectilinéaire ou fisheye',
    explication:
      'Un objectif rectilinéaire conserve les lignes droites, un fisheye les courbe pour ' +
      'englober bien plus de ciel. À focale identique, les deux ne couvrent pas le même champ ' +
      'et ne se projettent pas de la même façon.',
    consequence: 'Le type choisi change le rendu du cadre et la superposition sur le ciel.',
    sections: ['5.1', '3.3'],
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
  capacite_saturation: terme({
    libelle: 'Capacité de saturation',
    glose: 'lumière maximale par pixel',
    explication:
      'C’est la quantité de lumière qu’un pixel encaisse avant de saturer. Elle se trouve sur ' +
      'Photons to Photos.',
    consequence: 'Facultatif : aucun calcul ne l’utilise pour l’instant.',
    sections: ['5.1'],
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
  mise_en_station: terme({
    libelle: 'Mise en station',
    glose: 'alignement sur le pôle',
    sansBulle: true,
    explication:
      'C’est l’alignement de l’axe de la monture sur le pôle céleste. Au viseur polaire, les ' +
      'poses tiennent bien plus longtemps qu’à la boussole.',
    consequence: 'La soigner est le moyen le moins cher d’allonger les poses.',
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
  pose_max_suivi: terme({
    libelle: 'Pose maximale avec suivi',
    glose: 'plafond imposé par la monture',
    explication:
      'La pose de suivi dépend de la qualité de la mise en station et de la focale employée, ' +
      'car l’erreur de suivi se mesure en secondes d’arc. Elle est plafonnée sans autoguidage. ' +
      'Les valeurs de référence sont des ordres de grandeur de terrain, affichés en plage.',
    consequence: 'Elle borne la pose unitaire retenue, même quand l’optimum calculé est plus long.',
    sections: ['5.2', '7.2'],
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
  rotation_de_champ: terme({
    libelle: 'Rotation de champ',
    glose: 'champ pivotant pendant la pose',
    explication:
      'Sur une monture altazimutale, le champ tourne lentement autour du centre visé pendant ' +
      'la pose. Les étoiles décrivent alors des arcs même avec un suivi parfait. Le phénomène ' +
      'n’est pas modélisé dans cette version.',
    consequence:
      'Avec ce type de monture, aucune pose unitaire n’est chiffrée pour le ciel profond.',
    sections: ['5.2'],
  }),
  // §6.1, §6.2 — cadrage
  domaine_cadrage: terme({
    libelle: 'Domaine de cadrage',
    glose: 'famille d’objets cadrables',
    explication:
      'Le domaine dit quelle famille d’objets ce matériel cadre proprement : longue focale, ' +
      'classique, grand champ ou très grand champ. Il se déduit du champ, sans rien demander ' +
      'd’autre. C’est le matériel qui choisit les cibles, pas l’inverse.',
    consequence: 'Chercher hors de son domaine mène à des cibles trop petites ou débordantes.',
    sections: ['6.1'],
  }),
  fenetre_cadrage: terme({
    libelle: 'Fenêtre de cadrage',
    glose: 'tailles bien cadrées ici',
    explication:
      'Un cadrage propre veut que l’objet occupe du tiers à la moitié de la petite dimension ' +
      'du champ. La fenêtre traduit cette règle en tailles angulaires réelles pour ce setup. ' +
      'C’est la contrainte sur la petite dimension qui décide : c’est elle qui limite.',
    consequence: 'Toute cible hors de cette fenêtre demande une autre focale, pas un recadrage.',
    sections: ['6.1'],
  }),
  remplissage: terme({
    libelle: 'Remplissage du champ',
    glose: 'part du cadre occupée',
    explication:
      'C’est la taille de la cible comparée au petit côté de l’image. Au-delà de cent pour cent, ' +
      'elle déborde ; très en dessous, elle se perd.',
    consequence: 'Visez une cible qui occupe du tiers à la moitié du cadre.',
    sections: ['6.2'],
  }),
  diametre_pixels: terme({
    libelle: 'Diamètre en pixels',
    sansBulle: true,
    glose: 'taille de l’objet en pixels',
    explication:
      'C’est la taille de la cible sur la photo. Sous une cinquantaine de pixels, on ne ' +
      'distingue aucun détail.',
    consequence: 'Recadrer ensuite n’ajoute rien : seule une focale plus longue aide.',
    sections: ['6.2'],
  }),
  focale_ideale: terme({
    libelle: 'Focale nécessaire',
    glose: 'focale pour bien cadrer',
    explication:
      'C’est la focale qui ferait bien remplir le cadre à cette cible. La plage donne les ' +
      'limites acceptables.',
    consequence: 'Elle dit de combien votre focale est trop courte.',
    sections: ['6.1'],
  }),
  mosaique: terme({
    libelle: 'Mosaïque',
    glose: 'plusieurs photos assemblées',
    explication:
      'La cible déborde du cadre : il faut plusieurs photos qui se chevauchent. Chaque photo ' +
      'demande son propre temps de pose.',
    consequence: 'Quatre tuiles demandent quatre fois plus de temps.',
    sections: ['6.2'],
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
  brillance_surface: terme({
    libelle: 'Brillance de surface',
    glose: 'éclat par zone de ciel',
    explication:
      'C’est la lumière de l’objet répartie sur sa surface. Plus le chiffre est grand, plus ' +
      'l’objet est pâle.',
    consequence: 'Comparée au fond de ciel, elle dit si l’objet ressort.',
    sections: ['6.3'],
  }),
  contraste_ciel: terme({
    libelle: 'Contraste sur le fond de ciel',
    glose: 'écart entre objet et ciel',
    explication:
      'Positif, l’objet est plus lumineux que le ciel autour. Négatif, il est plus pâle et seule ' +
      'une longue pose le révèle.',
    consequence: 'Un contraste négatif n’empêche pas la photo, il allonge la pose.',
    sections: ['6.3'],
  }),
  verdict_detectabilite: terme({
    libelle: 'Verdict de détectabilité',
    glose: 'œil, jumelles, télescope, photo',
    explication:
      'Les quatre verdicts sont évalués dans l’ordre et le premier satisfait gagne. Un ' +
      'instrument n’augmente jamais la brillance de surface : il agrandit l’objet, et c’est ' +
      'l’agrandissement qui abaisse le seuil de détection. Photo seulement n’est pas un refus, ' +
      'c’est une durée d’intégration.',
    consequence: 'Le verdict dit avec quoi sortir ce soir, pas si la cible est « bonne ».',
    sections: ['6.3'],
  }),
  tolerance_lune: terme({
    libelle: 'Tolérance à la Lune',
    glose: 'sensibilité au clair de Lune',
    explication:
      'Les nébuleuses en émission supportent la Lune avec un filtre bi-bande. Les galaxies ' +
      'demandent une nuit sans Lune.',
    consequence: 'Par nuit de Lune, préférez une nébuleuse en émission.',
    sections: ['6.3'],
  }),
  magnitude_limite_instrument: terme({
    libelle: 'Magnitude limite de l’instrument',
    glose: 'étoile la plus faible atteinte',
    explication:
      'Plus l’instrument est grand, plus il montre des étoiles faibles. Sur une nébuleuse, il ' +
      'agrandit sans rendre plus lumineux.',
    consequence: 'Utile pour les étoiles et les amas, pas pour les nébuleuses.',
    sections: ['6.3'],
  }),

  // §7 — moteur Pose
  flux_ciel: terme({
    libelle: 'Flux du fond de ciel',
    glose: 'lumière du ciel par pixel',
    explication:
      'C’est la lumière du fond de ciel reçue par chaque pixel. Elle dépend de l’ouverture et de ' +
      'la taille des pixels.',
    consequence: 'Plus elle est forte, plus les poses doivent être courtes.',
    sections: ['7.1'],
  }),
  flux_objet: terme({
    libelle: 'Flux de l’objet',
    glose: 'lumière de la cible par pixel',
    explication:
      'C’est la lumière de la cible reçue par chaque pixel. C’est le signal que la photo cherche ' +
      'à capter.',
    consequence: 'Deux fois moins de lumière demande quatre fois plus de temps.',
    sections: ['7.1'],
  }),
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
  plage_utile: terme({
    libelle: 'Plage utile de pose',
    glose: 'durées équivalentes',
    explication: 'Toute durée dans cette plage donne le même résultat. Inutile d’être précis.',
    consequence: 'Prenez la durée la plus pratique sur votre appareil.',
    sections: ['2.3', '7.2'],
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
  regime_pose: terme({
    libelle: 'Régime de pose',
    glose: 'ce qui limite la pose',
    explication:
      'En temps normal, la pose conseillée est la meilleure possible. Si la monture la limite, ' +
      'la photo perd un peu en qualité.',
    consequence: 'Si la monture limite, soignez la mise en station.',
    sections: ['7.2'],
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
  nombre_poses: terme({
    libelle: 'Nombre de poses',
    sansBulle: true,
    glose: 'combien de photos prendre',
    explication:
      'C’est le temps total divisé par la durée d’une pose. Il fixe aussi la place à prévoir sur ' +
      'la carte.',
    consequence: 'Vérifiez la place sur la carte avant de partir.',
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

  // §10.2 — explication de verdict
  facteur_dominant: terme({
    libelle: 'Facteur dominant',
    glose: 'ce qui décide du verdict',
    explication:
      'C’est la condition qui pèse le plus sur le résultat. Quand deux pèsent autant, les deux ' +
      'sont citées.',
    consequence: 'C’est là qu’il faut agir en premier.',
    sections: ['10.2'],
  }),
  levier: terme({
    libelle: 'Levier',
    glose: 'action pour améliorer',
    explication:
      'Les actions sont classées de la moins chère à la plus chère. Un achat n’arrive jamais en ' +
      'premier.',
    consequence: 'Le premier levier est toujours gratuit ou presque.',
    sections: ['10.2'],
  }),

  // §8.1 — fenêtre nocturne et Lune
  degradation_lunaire: terme({
    libelle: 'Dégradation lunaire',
    glose: 'ciel éclairé par la Lune',
    explication:
      'La Lune éclaircit le ciel, surtout pleine, haute et proche de la cible. Le chiffre dit de ' +
      'combien.',
    consequence: 'Une nuit de Lune reste utilisable, avec des poses plus courtes.',
    sections: ['8.1'],
  }),
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
  cause_exclusion: terme({
    libelle: 'Cause d’exclusion',
    glose: 'pourquoi la cible est écartée',
    explication:
      'Trop basse, cachée par le relief, gênée par la Lune ou jamais levée. Chaque cible écartée ' +
      'dit pourquoi.',
    consequence: 'La cause dit quoi changer : date, lieu ou cible.',
    sections: ['8.2'],
  }),

  // §8.3 — plan de session
  score_cible: terme({
    libelle: 'Score de cible',
    glose: 'départage les cibles',
    explication:
      'Il combine cadrage, hauteur, signal, durée disponible et Lune. Le poids de chaque critère ' +
      'se règle.',
    consequence: 'Quand deux cibles se chevauchent, la mieux notée passe.',
    sections: ['8.3'],
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
  mode_nuit: terme({
    libelle: 'Mode nuit',
    glose: 'rouge profond, sans bleu',
    explication:
      'Les bâtonnets de la rétine assurent la vision nocturne et s’effondrent au-delà de 640 nm : ' +
      'un rouge profond est vu sans les blanchir. L’adaptation à l’obscurité demande 20 à 30 ' +
      'minutes et se détruit en quelques secondes de lumière blanche — le mode est donc global ' +
      'et sans exception, pas un thème sombre.',
    consequence:
      'Une seule fenêtre blanche annule une demi-heure d’attente : aucune surface claire n’est ' +
      'affichée tant que le mode est actif.',
    sections: ['11.1'],
  }),
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
  deux_horloges: terme({
    libelle: 'Pipeline à deux horloges',
    glose: 'rendu rapide, éphémérides lentes',
    explication:
      'L’image est produite soixante fois par seconde, les positions planétaires dix fois ' +
      'seulement, et l’écart est comblé par interpolation. Les étoiles, elles, ne sont jamais ' +
      'interpolées : elles sont fixes, seule la matrice de rotation du ciel change. C’est ce ' +
      'découplage qui rend l’animation fluide, quel que soit le nombre d’étoiles.',
    consequence:
      'Ajouter des étoiles au catalogue ne ralentit pas l’animation : le coût suit ce qui est ' +
      'affiché, pas ce qui est stocké.',
    sections: ['3.1'],
  }),
  vitesse_ecran: terme({
    libelle: 'Vitesse à l’écran',
    glose: 'défilement perçu, en pixels/seconde',
    explication:
      'La vitesse utile ne se mesure pas en heures par seconde mais en pixels par seconde. ' +
      'Sous 2 px/s le mouvement est invisible ; au-delà de 600 px/s l’image se replie et le ' +
      'ciel devient illisible. Entre les deux se trouve la plage lisible.',
    consequence:
      'Le temps réel, à 0,13 px/s, ne montre rien : l’animation n’a d’intérêt qu’accélérée.',
    sections: ['3.2'],
  }),
  facteur_vitesse_max: terme({
    libelle: 'Plafond de défilement',
    glose: 'vitesse maximale encore lisible',
    explication:
      'Le plafond est dérivé de la lisibilité, pas de la puissance de la machine. Il dépend du ' +
      'zoom : un champ serré grandit l’échelle en pixels par degré, donc abaisse le facteur ' +
      'admissible. Un réglage fixe serait fluide en vue large et illisible en vue serrée.',
    consequence:
      'Zoomer ramène automatiquement le facteur sous le plafond, et l’application le signale.',
    sections: ['3.2'],
  }),
  magnitude_limite_rendue: terme({
    libelle: 'Profondeur affichée',
    glose: 'étoiles les plus faibles affichées',
    explication:
      'Zoomer affiche des étoiles plus faibles. En vue réaliste, seules celles visibles depuis ' +
      'votre ciel apparaissent.',
    consequence: 'Désactivez la vue réaliste pour voir tout le catalogue.',
    sections: ['3.3'],
  }),
  precession: terme({
    libelle: 'Précession',
    glose: 'lente dérive des coordonnées',
    explication:
      'L’axe de la Terre décrit un cône en 26 000 ans : les coordonnées d’un astre changent ' +
      'de 50,29 secondes d’arc par an, soit un degré tous les 71,6 ans. Les frontières IAU ' +
      'sont définies dans les coordonnées de 1875 ; sans correction, elles seraient décalées ' +
      'de plus de deux degrés aujourd’hui.',
    consequence:
      'Les positions sont précessées vers l’époque affichée ; ni les magnitudes ni les noms ' +
      'ne le sont, et les mouvements propres restent ignorés.',
    sections: ['3.1', '3.4'],
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
  trainee: terme({
    libelle: 'Traînée',
    sansBulle: true,
    glose: 'étirement des étoiles',
    explication:
      'C’est la longueur en pixels du trait laissé par une étoile pendant la pose. Au-delà d’un ' +
      'ou deux pixels, les étoiles ne sont plus rondes.',
    consequence: 'Raccourcissez la pose pour garder des étoiles rondes.',
    sections: ['9.1', '9.2'],
  }),
  profondeur_previsu: terme({
    libelle: 'Profondeur par photo',
    glose: 'étoiles les plus faibles photographiées',
    explication:
      'C’est jusqu’où la photo enregistre des étoiles faibles. Elle dépend de la pose, de ' +
      'l’objectif et du ciel.',
    consequence: 'Un ciel pollué ou une pose courte montrent moins d’étoiles.',
    sections: ['9.2'],
  }),
  semis_generatif: terme({
    libelle: 'Fond génératif',
    glose: 'étoiles générées, non catalographiées',
    explication:
      'Au-delà du seuil catalographié, les étoiles affichées sont générées par un semis à ' +
      'graine fixe : leurs positions individuelles sont fausses, leur densité est fidèle. La ' +
      'densité est modulée par la latitude galactique, sans quoi la bande de la Voie lactée ' +
      'n’apparaîtrait pas. Le même cadre donne toujours le même rendu.',
    consequence:
      'Aucun repérage ne doit s’appuyer sur ces étoiles-là, seulement sur les étoiles réelles.',
    sections: ['9.2'],
  }),
  voie_lactee: terme({
    libelle: 'Voie lactée',
    glose: 'bande modulée par le ciel',
    explication:
      'La bande est peinte comme une lumière qui s’AJOUTE au fond de ciel, hors ligne : sa ' +
      'brillance de surface s’additionne à celle du site, exactement comme le halo de la Lune. ' +
      'Elle s’efface donc d’elle-même quand le site est pollué — non parce qu’un seuil ' +
      'l’éteint, mais parce que sa lumière devient négligeable devant celle du ciel. ' +
      'L’application montre ce que vous verrez depuis ce lieu, pas une carte de référence. Sa ' +
      'brillance ne dépend que de la latitude galactique : le bulbe du Sagittaire est en vrai ' +
      'plus lumineux que le reste, et la Grande Faille n’est pas figurée.',
    consequence:
      'Si la bande disparaît du rendu, elle ne sortira pas non plus sur les images depuis ce site.',
    sections: ['9.2'],
  }),
  vignettage: terme({
    libelle: 'Vignettage',
    sansBulle: true,
    glose: 'coins plus sombres',
    explication:
      'Objectif grand ouvert, les coins de l’image sont plus sombres que le centre. Fermer d’un ' +
      'cran le réduit nettement.',
    consequence: 'Évitez de placer la cible dans un coin.',
    sections: ['9.2'],
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
    consequence: 'Comptez au moins une heure pour un filé lisible.',
    sections: ['9.3'],
  }),
  duree_file: terme({
    libelle: 'Durée d’accumulation',
    sansBulle: true,
    glose: 'durée totale de la séquence',
    explication: 'C’est le temps couvert par toutes les poses. Il fixe la longueur des traînées.',
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
      'C’est la durée totale divisée par la durée d’une pose et de sa pause. Les photos ' +
      's’empilent ensuite en mode éclaircir.',
    consequence: 'Prévoyez la place sur la carte.',
    sections: ['9.4'],
  }),

  ordre_de_grandeur: terme({
    libelle: 'Ordre de grandeur',
    glose: 'valeur approchée, affichée en plage',
    explication:
      'Certaines constantes du registre sont des conventions de terrain, pas des mesures. ' +
      'Toute sortie qui en dépend est affichée avec sa plage plutôt que comme un nombre exact.',
    consequence: 'Une valeur en plage se lit comme un repère à ajuster, pas comme une consigne.',
    sections: ['2.1'],
  }),
} as const satisfies Record<string, EntreeGlossaire>)

export type TermeGlossaire = keyof typeof GLOSSAIRE

export function glose(cle: TermeGlossaire): EntreeGlossaire {
  return GLOSSAIRE[cle]
}
