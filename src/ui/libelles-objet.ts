/**
 * Ce qu'on peut dire d'un objet du ciel profond sans rien savoir du ciel : sa désignation,
 * son nom commun, son type, sa magnitude.
 *
 * Un seul endroit où traduire un type — la liste du catalogue, son filtre et le champ
 * « Type d'objet » de la fiche y puisent tous.
 */

import type { ObjetCielProfond, TypeObjet } from '../data/deepsky.ts'
import { nombre } from '../registry/ecriture.ts'

/**
 * T-0049 — les types de §6.3 en français. Le `Record` complet fait refuser par le
 * compilateur un type ajouté sans libellé.
 */
export const LIBELLE_TYPE_OBJET: Readonly<Record<TypeObjet, string>> = Object.freeze({
  INCONNU: 'type inconnu',
  GALAXIE: 'galaxie',
  AMAS_OUVERT: 'amas ouvert',
  AMAS_GLOB: 'amas globulaire',
  NEB_PLANETAIRE: 'nébuleuse planétaire',
  EMISSION: 'nébuleuse en émission',
  REFLEXION: 'nébuleuse par réflexion',
  NEB_OBSCURE: 'nébuleuse obscure',
  RESTE_SUPERNOVA: 'reste de supernova',
  AUTRE: 'autre type',
})

/**
 * Le glyphe d'un type, en ligature Material Symbols. La police n'a aucun dessin astronomique :
 * chacun est le plus proche par la FORME (une spirale, des points épars, un nuage), pour que la
 * carte de liste se reconnaisse avant d'être lue. Même `Record` complet que les libellés : un
 * type ajouté sans glyphe ne compile pas.
 */
export const ICONE_TYPE_OBJET: Readonly<Record<TypeObjet, string>> = Object.freeze({
  INCONNU: 'help',
  GALAXIE: 'cyclone',
  AMAS_OUVERT: 'scatter_plot',
  AMAS_GLOB: 'blur_on',
  NEB_PLANETAIRE: 'trip_origin',
  EMISSION: 'cloud',
  REFLEXION: 'filter_drama',
  NEB_OBSCURE: 'contrast',
  RESTE_SUPERNOVA: 'flare',
  AUTRE: 'star',
})

/**
 * Le premier nom commun, ou la chaîne vide : beaucoup d'entrées n'en portent aucun.
 *
 * Deux séparateurs, parce que la source en emploie deux : `|` sépare les noms qu'Orion
 * assemble à la construction du paquet, la virgule ceux qu'OpenNGC empile déjà dans son
 * champ « Common names ». Sans la seconde coupe, une ligne de liste annonce
 * « Large Magellanic Cloud,Nubecula Major » pour un seul objet.
 */
export function nomCommun(objet: ObjetCielProfond): string {
  return objet.nomsCommuns === '' ? '' : (objet.nomsCommuns.split(/[|,]/)[0]?.trim() ?? '')
}

/** T-0282 — l'en-tête de la fiche : la désignation, puis le nom qu'on cherche. */
export function titreFiche(objet: ObjetCielProfond): string {
  const nom = nomCommun(objet)
  return nom === '' ? objet.designation : `${objet.designation} — ${nom}`
}

export function libelleObjet(objet: ObjetCielProfond): string {
  const nom = nomCommun(objet) === '' ? '' : ` — ${nomCommun(objet)}`
  const mag = objet.vMag === null ? '' : ` · mag ${nombre(objet.vMag, 1)}`
  return `${objet.designation}${nom} · ${LIBELLE_TYPE_OBJET[objet.type]}${mag}`
}
