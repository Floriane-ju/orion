/**
 * §6.4 — la facilité de prise de vue, lue sur le score de §8.3.
 *
 * Ce module ne calcule RIEN de nouveau. Le score C-15 existe déjà, il agrège les cinq
 * critères — cadrage, hauteur, signal, fenêtre, Lune — et `evalueCandidate` le produit pour
 * chaque cible du catalogue. Ce fichier le discrétise, et c'est tout : un sixième critère
 * aurait été un jugement de plus à défendre, alors que la question posée est déjà tranchée.
 * Seule exception, T-0383 : la classe de dégradation lunaire plafonne la note — le poids de
 * la Lune dans le score est trop faible pour qu'une Lune proche y descende seule.
 *
 * Les classes sont des parts ÉGALES de l'échelle : `floor(score × max) + 1`. Une table de
 * seuils aurait été cinq nombres arbitraires dans un moteur, et — la plage réelle du score
 * allant d'environ 0,1 à 0,9 — des seuils mal placés auraient tassé le catalogue entier sur
 * une seule note, donc une lecture qui ne décide de rien.
 *
 * La note 0 ne sort jamais d'un score. Elle est réservée aux causes d'écart que le moteur
 * nomme, parce que `prd.md:83` interdit l'autre lecture : « "impossible" n'existe presque
 * jamais ; "combien de temps" existe toujours ». Une cible évaluée plancher donc à 1.
 */

import { K } from '../registry/constants.ts'
import { TABLE_FACILITE } from '../registry/verdicts.ts'
import type { Candidate, CauseEcart, CibleEcartee } from './session-types.ts'
import { degradationLune, type DegradationLune } from './session-score.ts'

export interface Facilite {
  readonly note: number
  readonly libelle: string
}

/**
 * Sans magnitude ni dimensions au catalogue, l'objet n'est pas difficile : il n'est pas
 * documenté. Lui donner 0 serait affirmer une impossibilité qu'aucun calcul n'a établie.
 */
const CODES_SANS_NOTE: readonly CauseEcart[] = Object.freeze(['DONNEE_MANQUANTE'])

/** La note d'une cible évaluée : de 1 à `FACILITE_NOTE_MAX`, jamais 0, jamais au-delà. */
export function noteDepuisScore(score: number): number {
  const max = K('FACILITE_NOTE_MAX')
  return Math.min(max, Math.floor(Math.max(0, score) * max) + 1)
}

/**
 * La note d'une cible écartée : 0, ou aucune note.
 *
 * `CONFLIT_CRENEAU` et `BUDGET` sont des causes d'ALLOCATION du plan de séance, pas des
 * propriétés de la cible : `evalueCandidate` ne les produit pas. Les compter comme 0 est sans
 * effet aujourd'hui, et reste juste si un appelant les fait remonter un jour.
 */
export function noteEcartee(code: CauseEcart): number | null {
  return CODES_SANS_NOTE.includes(code) ? null : 0
}

/** Le libellé de l'échelle, ou `null` si la table ne couvre pas cette note. */
export function libelleFacilite(note: number): string | null {
  return TABLE_FACILITE.find((ligne) => ligne.note === note)?.libelle ?? null
}

/**
 * T-0383 — le plafond qu'une Lune gênante impose à la note. Le score seul ne suffit pas : son
 * poids lunaire (0,1) laissait « idéale » une cible dont la fiche disait la dégradation forte.
 */
export function plafondLune(degradation: DegradationLune): number {
  if (degradation === 'FORTE') return K('FACILITE_NOTE_MAX_LUNE_FORTE')
  if (degradation === 'MOYENNE') return K('FACILITE_NOTE_MAX_LUNE_MOYENNE')
  return K('FACILITE_NOTE_MAX')
}

/** La facilité d'une cible telle que le moteur l'a évaluée, ou `null` faute de donnée. */
export function faciliteCible(r: Candidate | CibleEcartee): Facilite | null {
  const note =
    'objet' in r
      ? Math.min(
          noteDepuisScore(r.score.value),
          plafondLune(degradationLune(r.deltaSbLuneMag.value, r.detect.toleranceLune)),
        )
      : noteEcartee(r.code)
  if (note === null) return null
  const libelle = libelleFacilite(note)
  return libelle === null ? null : { note, libelle }
}
