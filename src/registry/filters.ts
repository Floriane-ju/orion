/**
 * §7.5, §10.3 — transmission table per filter family.
 * Family, not model: no brand, reference or price (§10.3). Only transmitted bandwidth, the one
 * quantity §7.1/§7.3 engines need for a gain.
 * Narrow band recommended ONLY on line emitters; on galaxy/reflection nebula it cuts signal as much
 * as fond de ciel. Table carries concerned object types; moteur refuses advice elsewhere.
 */

import type { TypeObjet } from '../data/deepsky.ts'

export type FamilleFiltre = 'AUCUN' | 'DUAL_BAND' | 'UHC' | 'OIII'

export interface LigneFiltre {
  readonly famille: FamilleFiltre
  readonly libelle: string
  /** Passbands, nm. Empty = no filter. */
  readonly bandesNm: readonly number[]
  /** Object types where filter keeps useful signal. */
  readonly typesUtiles: readonly TypeObjet[]
  readonly note: string
}

/** Emission objects: only ones narrow band doesn't cut. */
export const TYPES_EN_EMISSION: readonly TypeObjet[] = Object.freeze([
  'EMISSION',
  'RESTE_SUPERNOVA',
  'NEB_PLANETAIRE',
])

const TABLE_FILTRES: readonly LigneFiltre[] = Object.freeze(
  [
    {
      famille: 'AUCUN',
      libelle: 'Sans filtre — large bande',
      bandesNm: [],
      typesUtiles: [],
      note: 'Toute la lumière passe, pollution comprise.',
    },
    {
      famille: 'DUAL_BAND',
      libelle: 'Filtre bi-bande Hα / OIII',
      bandesNm: [7, 7],
      typesUtiles: TYPES_EN_EMISSION,
      note: 'Coupe pollution et Lune, garde les nébuleuses en émission. Inutile sur les galaxies.',
    },
    {
      famille: 'UHC',
      libelle: 'Filtre à bande passante élargie',
      bandesNm: [25],
      typesUtiles: TYPES_EN_EMISSION,
      note: 'Moins efficace qu’un bi-bande, mais plus tolérant sur les objectifs très ouverts.',
    },
    {
      famille: 'OIII',
      libelle: 'Filtre OIII seul',
      bandesNm: [6],
      typesUtiles: ['NEB_PLANETAIRE', 'RESTE_SUPERNOVA'],
      note: 'Réservé aux nébuleuses planétaires et aux restes de supernova.',
    },
  ].map(Object.freeze) as LigneFiltre[],
)

export function ligneFiltre(famille: FamilleFiltre): LigneFiltre {
  return TABLE_FILTRES.find((l) => l.famille === famille) ?? TABLE_FILTRES[0]!
}

export const SOURCE_TABLE_FILTRES = 'largeurs de bande usuelles.'
