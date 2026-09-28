/**
 * §6.4, T-0052 — chercher un objet du catalogue par son nom.
 *
 * Un catalogue de ~14 000 entrées ne se parcourt pas, il s'interroge : dérouler ses 400
 * premières entrées ne montre que des IC et met M45 hors d'atteinte. Ce module répond à la
 * question ; T-0053 lui donne son champ.
 *
 * Ce qui se cherche est ce que `libelleObjet` affiche — la désignation et chacun des noms
 * communs — plus le nom français d'usage quand il en existe un (`registry/noms-fr.ts`,
 * T-0281) : le catalogue est anglais, l'utilisateur ne l'est pas. Ni horizon ni verdict
 * n'entrent ici — c'est la question de `lignesCatalogue`, qui les porte colonne par colonne
 * dans l'onglet Cibles. Chercher dans le catalogue, c'est chercher dans le catalogue entier,
 * y compris sous l'horizon.
 *
 * La portée n'est jamais plafonnée : `maxRendus` borne le nombre de résultats rendus, pas
 * l'étendue de la recherche. Aucun objet du catalogue n'est hors d'atteinte.
 */

import type { ObjetCielProfond } from '../data/deepsky.ts'
import { NOMS_FR } from '../registry/noms-fr.ts'

/**
 * T-0281 — ce qui est réduit ici est ce qui varie d'une main à l'autre sans changer d'objet :
 * la casse, les accents, les séparateurs et les zéros de cadrage. « NGC 224 », « ngc0224 » et
 * « NGC-224 » sont la même demande que le catalogue écrit « NGC0224 » ; « M 42 » est « M42 ».
 *
 * Les zéros ne tombent qu'en TÊTE d'un groupe de chiffres : « M100 » reste « M100 », sinon la
 * recherche d'un objet le confondrait avec un autre. Aucune dépendance.
 */
function normalise(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/(^|\D)0+(\d)/g, '$1$2')
}

/**
 * Tout ce sous quoi un objet peut être demandé : sa désignation, ses noms communs et, quand
 * l'usage francophone en a un, son nom français (§6.4). Les amonts séparent les noms tantôt
 * par « | », tantôt par « , » — les deux comptent, sans quoi « Orion Nebula » ne serait
 * qu'une occurrence interne de « Great Orion Nebula,Orion Nebula ».
 */
function nomsDe(objet: ObjetCielProfond): readonly string[] {
  return [
    objet.designation,
    ...objet.nomsCommuns.split(/[|,]/),
    ...(NOMS_FR[objet.designation] ?? '').split('|'),
  ]
}

/** Un préfixe passe devant une occurrence interne ; rien du tout ne passe pas. */
const RANG_PREFIXE = 0
const RANG_INTERNE = 1
const ABSENT = -1

function rangDe(objet: ObjetCielProfond, recherche: string): number {
  let rang = ABSENT
  for (const nom of nomsDe(objet)) {
    if (nom === '') continue
    const position = normalise(nom).indexOf(recherche)
    if (position === 0) return RANG_PREFIXE
    if (position > 0) rang = RANG_INTERNE
  }
  return rang
}

/**
 * Les objets du catalogue dont la désignation ou l'un des noms communs contient la saisie :
 * les préfixes d'abord, puis du plus brillant au plus faible — l'ordre dans lequel un
 * observateur pense au ciel, le même que celui de `lignesCatalogue`.
 *
 * Une saisie vide ne rend rien : proposer 14 000 entrées avant la première frappe est le
 * défaut qu'on corrige, pas un état par défaut.
 */
export function chercheCatalogue(
  catalogue: readonly ObjetCielProfond[],
  saisie: string,
  maxRendus: number,
): readonly ObjetCielProfond[] {
  const recherche = normalise(saisie.trim())
  if (recherche === '') return []

  const trouves: { objet: ObjetCielProfond; rang: number }[] = []
  for (const objet of catalogue) {
    const rang = rangDe(objet, recherche)
    if (rang !== ABSENT) trouves.push({ objet, rang })
  }

  // Un objet sans magnitude ne passe pas devant un objet qui en a une : l'absence part au
  // bout du tri plutôt que de valoir zéro (§6.3).
  trouves.sort(
    (a, b) =>
      a.rang - b.rang || (a.objet.vMag ?? Number.POSITIVE_INFINITY) - (b.objet.vMag ?? Number.POSITIVE_INFINITY),
  )
  return trouves.slice(0, maxRendus).map((t) => t.objet)
}
