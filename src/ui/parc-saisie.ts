/**
 * §5.1, T-0404 — la saisie d'un objectif du parc : du texte tapé à l'`Objectif` validé.
 *
 * Une focale fixe ne demande qu'une focale et une ouverture : le bout max laissé vide reprend
 * le min. Exiger deux fois « 135 » pour un 135 mm serait une question sans objet.
 */

import { valideObjectif, type Objectif } from '../core/objectif.ts'
import type { TypeObjectif } from '../core/optics.ts'
import { nombreDeTexte } from '../registry/domains.ts'
import { nombreLibre } from '../registry/ecriture.ts'

/** Une ligne du parc telle qu'elle se tape : les bouts max vides valent focale fixe, ouverture constante. */
export interface SaisieObjectif {
  readonly focaleMin: string
  readonly focaleMax: string
  readonly ouvertureGrandAngle: string
  readonly ouvertureTele: string
}

/** Le texte d'un objectif du parc, pour l'afficher dans sa ligne. */
export function saisieDe(objectif: Objectif): SaisieObjectif {
  const fixe = objectif.focaleMinMm === objectif.focaleMaxMm
  const constante = objectif.ouvertureGrandAngleN === objectif.ouvertureTeleN
  return {
    focaleMin: String(objectif.focaleMinMm),
    focaleMax: fixe ? '' : String(objectif.focaleMaxMm),
    ouvertureGrandAngle: String(objectif.ouvertureGrandAngleN),
    ouvertureTele: constante ? '' : String(objectif.ouvertureTeleN),
  }
}

/**
 * Lève en nommant le champ fautif (`valideObjectif`) : rien d'incohérent n'entre au parc.
 * Le nom n'est plus saisi : c'est la notation de bague, que §6.1 cite telle quelle.
 */
export function objectifDeSaisie(saisie: SaisieObjectif, id: string, typeObjectif: TypeObjectif): Objectif {
  const sinon = (texte: string, repli: string) => nombreDeTexte(texte.trim() === '' ? repli : texte)
  const objectif = {
    id,
    nom: '',
    focaleMinMm: nombreDeTexte(saisie.focaleMin),
    focaleMaxMm: sinon(saisie.focaleMax, saisie.focaleMin),
    ouvertureGrandAngleN: nombreDeTexte(saisie.ouvertureGrandAngle),
    ouvertureTeleN: sinon(saisie.ouvertureTele, saisie.ouvertureGrandAngle),
    typeObjectif,
  }
  return valideObjectif({ ...objectif, nom: caracteristiques(objectif) })
}

/** « 18–55 mm f/3,5–5,6 », « 135 mm f/2 » : la notation gravée sur la bague. */
export function caracteristiques(objectif: Objectif): string {
  const plage = (a: number, b: number) => (a === b ? nombreLibre(a) : `${nombreLibre(a)}–${nombreLibre(b)}`)
  return (
    `${plage(objectif.focaleMinMm, objectif.focaleMaxMm)} mm ` +
    `f/${plage(objectif.ouvertureGrandAngleN, objectif.ouvertureTeleN)}`
  )
}

/** Le parc avec cet objectif ajouté, ou remplacé à sa place s'il y était déjà. */
export function parcAvec(parc: readonly Objectif[], objectif: Objectif): readonly Objectif[] {
  return parc.some((o) => o.id === objectif.id)
    ? parc.map((o) => (o.id === objectif.id ? objectif : o))
    : [...parc, objectif]
}

/** Ce que le profil relu dit de l'optique : son parc s'il en a un, sinon son seul réglage. */
export interface OptiqueDeDepart {
  readonly objectifs?: readonly Objectif[]
  readonly objectifId?: string
  readonly focale: string
  readonly ouverture: string
  readonly fisheye: boolean
}

/**
 * Le parc au démarrage. L'optique saisie avant le parc — ou celle de l'Annexe A au premier
 * démarrage — devient son premier objectif, une focale fixe qu'on peut ensuite éditer en zoom
 * ou retirer : sans cela, l'objectif de départ restait le seul qu'on ne pouvait ni l'un ni
 * l'autre. Un parc enregistré vide — vidé avant que le dernier objectif ne soit protégé, ou
 * importé tel — se reconstruit de même : une carte Optique sans objectif n'offre plus rien à
 * ajouter. Un objectif monté disparu du parc cède la place au premier.
 */
export function parcDeDepart(
  depart: OptiqueDeDepart,
  id: string,
): { readonly objectifs: readonly Objectif[]; readonly objectifId: string } {
  if (depart.objectifs !== undefined && depart.objectifs.length > 0) {
    const monte = depart.objectifs.find((o) => o.id === depart.objectifId) ?? depart.objectifs[0]
    return { objectifs: depart.objectifs, objectifId: monte?.id ?? '' }
  }
  try {
    const saisie = { focaleMin: depart.focale, focaleMax: '', ouvertureGrandAngle: depart.ouverture, ouvertureTele: '' }
    const objectif = objectifDeSaisie(saisie, id, depart.fisheye ? 'FISHEYE' : 'RECTILINEAIRE')
    return { objectifs: [objectif], objectifId: id }
  } catch {
    // Une optique de départ illisible ne fait pas d'objectif : l'objectif libre la laisse corriger.
    return { objectifs: [], objectifId: '' }
  }
}
