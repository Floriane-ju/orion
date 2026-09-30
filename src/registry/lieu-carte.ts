/**
 * §4.1, §13.1 — la carte où l'on pose le site d'un clic (T-0363).
 *
 * Source des tuiles : le serveur de tuiles d'OpenStreetMap. Sans clé, servi avec CORS, et ce
 * sont des PNG que le navigateur décode lui-même. Elles sont lues par `fetch` puis peintes
 * sur un canvas : `img-src` n'a aucun hôte tiers à nommer, seul `connect-src` s'ouvre.
 *
 * Ce qu'une requête transmet : le numéro de la tuile, donc la zone AFFICHÉE, à la précision
 * du zoom choisi — c'est ce que §13.1 énumère. Le Referer part avec l'origine de
 * l'application, à la différence du relief : la politique d'usage d'OSM exige un Referer
 * valide des applications web, et un client anonyme s'y fait bloquer.
 *
 * Hors réseau, le fond embarqué (Natural Earth) reste : la carte ne tombe pas, elle perd son
 * détail (§12.5).
 */

import type { OrigineTiers } from './origines.ts'

export const HOTE_CARTE = 'https://tile.openstreetmap.org'

export const ORIGINES_CARTE: readonly OrigineTiers[] = Object.freeze(
  [
    {
      origine: HOTE_CARTE,
      transmis:
        'la zone affichée sur la carte du site (numéros des tuiles au zoom choisi), tant que la carte est ouverte',
    },
  ].map(Object.freeze) as OrigineTiers[],
)

/** L'adresse d'une tuile OSM au zoom `z`. */
export function urlTuileCarte(z: number, x: number, y: number): string {
  return `${HOTE_CARTE}/${z}/${x}/${y}.png`
}

/** Crédit exigé par la licence ODbL, affiché sur la carte dès qu'une tuile y est peinte. */
export const CREDIT_CARTE = Object.freeze({
  auteur: '© les contributeurs d’OpenStreetMap',
  licence: 'ODbL',
  lien: 'https://www.openstreetmap.org/copyright',
})

export interface ValeurCarte {
  readonly valeur: number
  readonly unite: string
  readonly source: string
  readonly tolerance: string
}

function valeur(v: ValeurCarte): ValeurCarte {
  return Object.freeze(v)
}

const CARTE = Object.freeze({
  /** Côté d'une tuile OSM, en pixels. */
  COTE_TUILE_CARTE_PX: valeur({
    valeur: 256,
    unite: 'px',
    source: 'OSM — schéma de tuiles « slippy map »',
    tolerance: 'sans objet — format',
  }),

  /** Le monde entier tient dans la carte : au zoom 1, 512 px de large. */
  ZOOM_CARTE_MIN: valeur({
    valeur: 1,
    unite: '—',
    source: 'convention — la plus petite vue qui remplit la largeur de la carte « Site »',
    tolerance: 'sans objet — borne d’interface',
  }),

  /**
   * ≈ 1 m par pixel à 45° de latitude : on y distingue un chemin d'un champ. Plus fin ne
   * change rien au ciel — une seconde d'arc de latitude fait 30 m.
   */
  ZOOM_CARTE_MAX: valeur({
    valeur: 17,
    unite: '—',
    source: 'OSM — 2π × 6 378 137 m × cos 45° / 2²⁵ ≈ 0,84 m/px',
    tolerance: 'sans objet — borne d’interface',
  }),

  /** Une région de quelques centaines de kilomètres autour du site : on s'y repère. */
  ZOOM_CARTE_INITIAL: valeur({
    valeur: 8,
    unite: '—',
    source: 'convention — ≈ 400 m/px à 45°, une carte de 300 px couvre ≈ 120 km',
    tolerance: 'sans objet — vue d’ouverture',
  }),

  /**
   * Un cran de molette ou une touche `+`/`-`. Le cran de la scène (facteur 1,1 sur le champ)
   * ne vaudrait que 0,14 niveau : il faudrait cent crans pour passer du monde à la rue.
   */
  CRAN_ZOOM_CARTE: valeur({
    valeur: 0.5,
    unite: 'niveau',
    source: 'convention d’interaction — deux crans doublent l’échelle, 32 crans du monde à la rue',
    tolerance: 'sans objet — réglage d’interface',
  }),

  /** En deçà, un appui relâché est un clic ; au-delà, c'était un glisser. */
  SEUIL_GLISSER_PX: valeur({
    valeur: 4,
    unite: 'px',
    source: 'convention d’interaction — tremblement d’un clic à la souris ou au doigt',
    tolerance: 'sans objet — seuil d’interface',
  }),

  /** Pas d'une touche fléchée, en fraction du côté de la carte. */
  PAS_CLAVIER_FRACTION: valeur({
    valeur: 0.1,
    unite: '—',
    source: 'convention d’interaction — dix pas traversent la carte',
    tolerance: 'sans objet — réglage d’interface',
  }),

  /** Attente maximale d'une tuile : au-delà, le fond embarqué reste seul à cet endroit. */
  DELAI_MAX_TUILE_CARTE_MS: valeur({
    valeur: 10000,
    unite: 'ms',
    source: 'convention — une tuile de 20 ko passe en quelques secondes même en 3G',
    tolerance: 'sans objet — plafond de garde',
  }),

  /**
   * Tuiles gardées en mémoire : une carte de 300 × 200 px en montre une douzaine, le plafond
   * couvre une vingtaine de vues sans redemander ce qu'on vient de voir.
   */
  TUILES_CARTE_CACHE_MAX: valeur({
    valeur: 256,
    unite: '—',
    source: 'convention — 256 tuiles × 256² px × 4 octets ≈ 64 Mo au pire décodées',
    tolerance: 'sans objet — plafond de garde',
  }),
} satisfies Record<string, ValeurCarte>)

export type IdCarte = keyof typeof CARTE

/** Lecture d'une valeur, sur le modèle de `K()` du registre §2.1. */
export function C(id: IdCarte): number {
  return CARTE[id].valeur
}
