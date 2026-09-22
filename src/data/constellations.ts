/**
 * §3.4 — Paquet des tracés de repérage : figures, frontières, astérismes, étoiles nommées.
 *
 * TROIS COUCHES DISTINCTES, souvent confondues à tort :
 *   FIGURES     segments reliant les étoiles principales. Aucune existence officielle :
 *               convention culturelle.
 *   FRONTIÈRES  découpage officiel des 88 constellations IAU. Ce sont des RÉGIONS du ciel,
 *               pas des dessins. Définies le long de méridiens et de parallèles B1875 : le
 *               paquet les conserve dans cette époque, et le rendu les précesse.
 *   ASTÉRISMES  motifs non officiels franchissant les frontières. Ce sont EUX que le
 *               débutant reconnaît. Couche obligatoire, pas un raffinement.
 *
 * ENCODAGE — le paquet est du JSON encodé en UTF-8 dans un `.bin`, contrairement aux
 * catalogues de §12.2. Le volume le justifie : quelques milliers de sommets, là où les
 * étoiles se comptent en dizaines de milliers. Un codec binaire économiserait une centaine
 * de kilo-octets sur un paquet qui en pèse deux cents, au prix d'un format de plus à
 * vérifier. Le chemin de contrôle d'intégrité, lui, reste le même que les autres paquets.
 */

export interface Segment {
  readonly ad1Deg: number
  readonly dec1Deg: number
  readonly ad2Deg: number
  readonly dec2Deg: number
}

export interface Figure {
  /** Code IAU à trois lettres : « AND », « ORI ». */
  readonly code: string
  /** Nom latin IAU — le nom officiel, sans traduction hasardeuse. */
  readonly nom: string
  /** Segments en coordonnées J2000, résolus depuis les identifiants HIP de la source. */
  readonly segments: readonly Segment[]
}

export interface Asterisme {
  readonly id: string
  readonly nom: string
  readonly segments: readonly Segment[]
}

/** Une arête de frontière suit soit un méridien, soit un parallèle de B1875. */
export type TypeArete = 'MERIDIEN' | 'PARALLELE'

export interface AreteFrontiere {
  readonly type: TypeArete
  /** Coordonnées B1875, telles que Delporte les a définies. Jamais pré-précessées. */
  readonly ad1Deg: number
  readonly dec1Deg: number
  readonly ad2Deg: number
  readonly dec2Deg: number
  /** Les deux constellations que l'arête sépare. */
  readonly codes: readonly [string, string]
}

export interface EtoileNommee {
  readonly adDeg: number
  readonly decDeg: number
  readonly magV: number
  /** Désignation Bayer, « α And ». Chaîne vide si l'étoile n'en porte pas. */
  readonly designation: string
  /** Nom propre, « Alpheratz ». Chaîne vide si l'étoile n'en porte pas. */
  readonly nomPropre: string
  /** Type spectral publié par le catalogue. Chaîne vide s'il est absent. */
  readonly spectre: string
  /** Distance en parsecs. `null` quand la parallaxe est absente ou non fiable. */
  readonly distancePc: number | null
  /** Code IAU à trois lettres de la constellation, tel qu'attribué par le catalogue. */
  readonly constellation: string
}

/**
 * Les deux formes d'une étoile nommée réunies — et la seule des deux qui existe quand
 * l'autre manque, sans tiret orphelin. Le paquet garantit qu'au moins une est non vide
 * (`scripts/build-catalogs.ts`).
 *
 * T-0287 — le nom vit ici, avec le type qui le porte : la fiche du planétarium et la carte
 * de pointage de §8.4 nomment la même étoile, et une seconde règle écrite ailleurs donnerait
 * deux vocabulaires pour un seul astre — c'est la leçon de T-0109.
 */
export function nomComplet(nommee: EtoileNommee): string {
  if (nommee.nomPropre === '') return nommee.designation
  if (nommee.designation === '') return nommee.nomPropre
  return `${nommee.nomPropre} — ${nommee.designation}`
}

export interface PaquetConstellations {
  readonly figures: readonly Figure[]
  readonly asterismes: readonly Asterisme[]
  readonly frontieres: readonly AreteFrontiere[]
  readonly etoilesNommees: readonly EtoileNommee[]
  /**
   * Segments écartés faute d'étoile résolue dans le catalogue chargé — des sommets Gaia
   * que HYG ne référence pas. Déclaré plutôt que passé sous silence : une figure amputée
   * doit être visible dans le manifeste, pas découverte à l'écran.
   */
  readonly segmentsIgnores: number
  readonly source: string
}

export function encodeConstellations(paquet: PaquetConstellations): ArrayBuffer {
  const octets = new TextEncoder().encode(JSON.stringify(paquet))
  return octets.buffer.slice(
    octets.byteOffset,
    octets.byteOffset + octets.byteLength,
  ) as ArrayBuffer
}

export function decodeConstellations(buffer: ArrayBuffer): PaquetConstellations {
  return JSON.parse(new TextDecoder().decode(buffer)) as PaquetConstellations
}

export const PAQUET_VIDE: PaquetConstellations = Object.freeze({
  figures: [],
  asterismes: [],
  frontieres: [],
  etoilesNommees: [],
  segmentsIgnores: 0,
  source: '',
})
