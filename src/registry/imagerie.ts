/**
 * §6.4, §6.2 — Origine, cadrage et poids de l'image d'objet.
 *
 * Ce module existe pour deux raisons distinctes, et la seconde est la vraie.
 *
 * La première est la règle du projet : une largeur, une marge, un plafond de taille sont des
 * valeurs, elles ne s'écrivent pas dans un moteur.
 *
 * La seconde est §13.1. La promesse de confidentialité ne se lit plus dans l'architecture —
 * l'application émet désormais du trafic — elle se lit dans `ORIGINES_IMAGERIE`. Cette liste
 * est la source unique : la politique de sécurité du contenu de `vite.config.ts` en est
 * dérivée, et un test refuse toute divergence. Ajouter une origine ici est un amendement du
 * PRD, pas un détail d'implémentation.
 *
 * Une seule directive s'ouvre, et c'est `connect-src` : les octets sont téléchargés puis
 * rangés en IndexedDB, et affichés depuis un `blob:`. Aucun hôte tiers n'a donc à figurer
 * dans `img-src` — une surface à surveiller au lieu de deux.
 *
 * La liste ne compte plus qu'une origine, et ce n'est pas un allègement cosmétique : l'image
 * d'objet est désormais toujours une découpe de relevé, parce qu'elle porte le cadre de §6.2
 * et qu'un cadre ne se pose qu'à une échelle connue. Une image d'encyclopédie est cadrée par
 * son auteur, son champ n'est écrit nulle part. §6.4 décrit encore deux sources : l'écart est
 * assumé et arbitré à part, il ne s'amende pas depuis ce fichier.
 */

export interface OrigineImagerie {
  readonly origine: string
  /** Ce qui est transmis à ce tiers, en clair. C'est ce que §13.1 énumère. */
  readonly transmis: string
}

export const ORIGINES_IMAGERIE: readonly OrigineImagerie[] = Object.freeze(
  [
    {
      origine: 'https://alasky.cds.unistra.fr',
      transmis: 'les coordonnées équatoriales de la cible consultée',
    },
  ].map(Object.freeze) as OrigineImagerie[],
)

/**
 * L'hôte du service de découpe du CDS : l'alias canonique de la documentation.
 *
 * `alaskybis` et `alasky.u-strasbg.fr` répondent à l'identique — ce sont des alias du même
 * service. Un seul est câblé, et c'est le seul que la politique de sécurité autorise : trois
 * origines ouvertes pour un service seraient trois surfaces à surveiller pour rien.
 */
export const HOTE_DECOUPE = 'https://alasky.cds.unistra.fr'

export const CHEMIN_DECOUPE = '/hips-image-services/hips2fits'

/** Le relevé interrogé. Le même que celui que §6.2 nomme pour la prévisualisation du cadre. */
export const RELEVE_DECOUPE = 'CDS/P/DSS2/color'

export interface ValeurImagerie {
  readonly valeur: number
  readonly unite: string
  readonly source: string
  readonly tolerance: string
}

function valeur(v: ValeurImagerie): ValeurImagerie {
  return Object.freeze(v)
}

const IMAGERIE = Object.freeze({
  /**
   * La largeur demandée à la découpe. Une vignette d'illustration, pas une planche :
   * à cette largeur une découpe DSS2 pèse une dizaine de kilo-octets, ce qui rend le cache
   * par objet tenable.
   */
  LARGEUR_VIGNETTE_PX: valeur({
    valeur: 320,
    unite: 'px',
    source: 'convention d’affichage — mesuré à 9,5 ko pour une découpe DSS2 de 300 px',
    tolerance: 'sans objet — aucun verdict ne dépend de cette largeur',
  }),

  /**
   * Le champ de la découpe vaut la taille de l'objet multipliée par cette marge. Elle n'est
   * pas choisie à l'œil : 2,5 place l'objet à 40 % du champ, au milieu de la bande
   * CADRAGE_OPTIMAL de §6.2 (0,33 – 0,5). L'illustration cadre donc comme le PRD dit qu'on
   * cadre bien.
   */
  MARGE_CADRAGE_DECOUPE: valeur({
    valeur: 2.5,
    unite: '—',
    source: 'inverse du milieu de la bande CADRAGE_OPTIMAL de §6.2 (0,4)',
    tolerance: 'sans objet — cadrage d’illustration',
  }),

  /** Repli quand le catalogue ne donne aucune dimension : le cas est fréquent (§6.2). */
  CHAMP_DECOUPE_DEFAUT_DEG: valeur({
    valeur: 1,
    unite: '°',
    source: 'convention — ordre de grandeur du champ d’un instrument grand champ de §5.1',
    tolerance: 'sans objet — cadrage d’illustration',
  }),

  /** Bornes du champ demandé au service : en deçà il n'y a plus de relevé, au-delà plus d'objet. */
  CHAMP_DECOUPE_MIN_DEG: valeur({
    valeur: 0.05,
    unite: '°',
    source: 'résolution du relevé DSS2 — sous 3′ la découpe n’ajoute aucun détail',
    tolerance: 'sans objet — cadrage d’illustration',
  }),

  CHAMP_DECOUPE_MAX_DEG: valeur({
    valeur: 10,
    unite: '°',
    source: 'convention — au-delà la découpe montre le voisinage, plus la cible',
    tolerance: 'sans objet — cadrage d’illustration',
  }),

  /**
   * §6.2 — la largeur de l'encart de cadre, en part de la largeur de l'image.
   *
   * L'encart porte le cadre du capteur, avec la cible à sa taille réelle dedans. C'est la
   * seule façon dont le cadre se lit — au repos du moins, puisque le survol l'agrandit. Au
   * tiers, il reste assez grand pour qu'une cible de la moitié du cadre s'y distingue, sans
   * masquer la vue qu'il commente.
   */
  PART_ENCART_CADRE: valeur({
    valeur: 0.33,
    unite: '—',
    source: 'convention d’affichage — un tiers de la largeur, l’encart commente sans couvrir',
    tolerance: 'sans objet — cadrage d’illustration',
  }),

  /**
   * Plafond d'un fichier accepté. Une découpe reste sous les dizaines de kilo-octets ; ce
   * plafond n'existe donc pas pour elle, mais pour la réponse qui ne serait pas celle qu'on
   * croit — ranger dans IndexedDB ce que le service a rendu sans le peser mettrait §12.3 en
   * défaut pour une vignette.
   */
  POIDS_VIGNETTE_MAX_KO: valeur({
    valeur: 512,
    unite: 'ko',
    source: 'convention — vingt fois le poids observé d’une vignette, marge pour un format lourd',
    tolerance: 'sans objet — plafond de garde',
  }),

  /**
   * §6.4 — combien de vignettes une liste de résultats demande au réseau, en une fois.
   *
   * La vignette de liste ne se contentait que du cache : une recherche neuve rendait donc une
   * liste sans images, et il fallait ouvrir chaque fiche pour en obtenir une. Le motif du
   * plafond n'est pas le volume — soixante découpes pèsent une demi-douzaine de centaines de
   * kilo-octets au poids mesuré ci-dessus — c'est le nombre de requêtes envoyées à un service
   * public. Il est délibérément plus bas que `CIBLES_LISTEES_MAX` : ce qui est demandé est le
   * HAUT de la liste, pas la liste.
   */
  VIGNETTES_PRECHARGEES_MAX: valeur({
    valeur: 60,
    unite: '—',
    source: 'convention d’affichage — le haut de liste, à ~10 ko la découpe',
    tolerance: 'sans objet — aucun verdict ne dépend de ce plafond',
  }),

  /** Requêtes de préchargement menées de front. Le motif du plafond est le 429 du service. */
  PRECHARGE_SIMULTANEE_MAX: valeur({
    valeur: 2,
    unite: '—',
    source: 'politesse envers un service public — hips2fits répond 429 à une rafale',
    tolerance: 'sans objet — plafond de débit',
  }),

  /**
   * Le repos qu'attend le préchargement avant de partir. La liste se refiltre à chaque frappe :
   * sans ce délai, « pleiades » émettrait huit salves pour la seule dernière.
   */
  DELAI_PRECHARGE_MS: valeur({
    valeur: 400,
    unite: 'ms',
    source: 'convention d’interaction — au-dessus de la cadence de frappe soutenue',
    tolerance: 'sans objet — temporisation d’interface',
  }),
} satisfies Record<string, ValeurImagerie>)

export type IdImagerie = keyof typeof IMAGERIE

/** Lecture d'une valeur, sur le modèle de `K()` du registre §2.1. */
export function I(id: IdImagerie): number {
  return IMAGERIE[id].valeur
}

/** Crédit d'une découpe de relevé : elle n'a pas d'auteur individuel à nommer. */
export const CREDIT_RELEVE = Object.freeze({
  auteur: 'DSS2 couleur — relevé numérisé du ciel',
  licence: 'domaine public, distribué par le CDS (Strasbourg)',
  lien: 'https://aladin.cds.unistra.fr/hips/list',
})
