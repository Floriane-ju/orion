/**
 * §7.5, §10.3 — Table de transmission par famille de filtres.
 *
 * Une famille, pas un modèle : aucune marque, aucune référence commerciale, aucun prix
 * (§10.3). Ce qui est déclaré ici, c'est la largeur de bande transmise — la seule grandeur
 * dont les moteurs §7.1 et §7.3 ont besoin pour chiffrer un gain.
 *
 * Un filtre à bande étroite ne se recommande QUE sur un objet qui émet en raies. Sur une
 * galaxie ou une nébuleuse par réflexion, il coupe le signal autant que le fond de ciel :
 * la table porte donc les types d'objets concernés, et le moteur refuse le conseil ailleurs.
 */

import type { TypeObjet } from '../data/deepsky.ts'

export type FamilleFiltre = 'AUCUN' | 'DUAL_BAND' | 'UHC' | 'OIII'

export interface LigneFiltre {
  readonly famille: FamilleFiltre
  readonly libelle: string
  /** Bandes passantes transmises, en nanomètres. Vide pour l'absence de filtre. */
  readonly bandesNm: readonly number[]
  /** Types d'objets sur lesquels le filtre conserve le signal utile. */
  readonly typesUtiles: readonly TypeObjet[]
  readonly note: string
}

/** Les objets en émission : ce sont les seuls que la bande étroite ne coupe pas. */
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
