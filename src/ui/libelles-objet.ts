/**
 * What can be said of a ciel profond object without knowing the sky: designation, nom commun,
 * type, magnitude. Single place translating a type (catalogue list, its filter, fiche
 * "Type d'objet" field).
 */

import type { ObjetCielProfond, TypeObjet } from '../data/deepsky.ts'
import { nombre } from '../registry/ecriture.ts'

/** T-0049 — §6.3 types in French. Full `Record`: a type without label fails to compile. */
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
 * Type glyph (Material Symbols ligature). No astronomy drawings in the font: closest by SHAPE
 * (spiral, scattered dots, cloud) so list cards are recognised before read. Full `Record`.
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
 * First nom commun, or empty string (many entries have none).
 * Two separators: `|` joins names Orion assembles at pack build, `,` those OpenNGC stacks in
 * "Common names". Without the `,` split a row reads "Large Magellanic Cloud,Nubecula Major".
 */
export function nomCommun(objet: ObjetCielProfond): string {
  return objet.nomsCommuns === '' ? '' : (objet.nomsCommuns.split(/[|,]/)[0]?.trim() ?? '')
}

/** T-0282 — fiche header: designation, then the name one searches. */
export function titreFiche(objet: ObjetCielProfond): string {
  const nom = nomCommun(objet)
  return nom === '' ? objet.designation : `${objet.designation} — ${nom}`
}

export function libelleObjet(objet: ObjetCielProfond): string {
  const nom = nomCommun(objet) === '' ? '' : ` — ${nomCommun(objet)}`
  const mag = objet.vMag === null ? '' : ` · mag ${nombre(objet.vMag, 1)}`
  return `${objet.designation}${nom} · ${LIBELLE_TYPE_OBJET[objet.type]}${mag}`
}
