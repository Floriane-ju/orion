/**
 * §5.1, T-0404 — la saisie d'un objectif du parc : du texte tapé à l'`Objectif` validé.
 *
 * Une focale fixe ne demande qu'une focale et une ouverture : le bout télé laissé vide reprend
 * celui du grand-angle. Exiger deux fois « 135 » pour un 135 mm serait une question sans objet.
 */

import { valideObjectif, type Objectif } from '../core/objectif.ts'
import { nombreDeTexte } from '../registry/domains.ts'
import { nombreLibre } from '../registry/ecriture.ts'

export interface SaisieObjectif {
  readonly nom: string
  readonly focaleMin: string
  readonly focaleMax: string
  readonly ouvertureGrandAngle: string
  readonly ouvertureTele: string
  readonly fisheye: boolean
}

export const SAISIE_OBJECTIF_VIDE: SaisieObjectif = Object.freeze({
  nom: '',
  focaleMin: '',
  focaleMax: '',
  ouvertureGrandAngle: '',
  ouvertureTele: '',
  fisheye: false,
})

/** Le texte d'un objectif déjà enregistré, pour le rééditer. */
export function saisieDe(objectif: Objectif): SaisieObjectif {
  const fixe = objectif.focaleMinMm === objectif.focaleMaxMm
  const constante = objectif.ouvertureGrandAngleN === objectif.ouvertureTeleN
  return {
    nom: objectif.nom,
    focaleMin: String(objectif.focaleMinMm),
    focaleMax: fixe ? '' : String(objectif.focaleMaxMm),
    ouvertureGrandAngle: String(objectif.ouvertureGrandAngleN),
    ouvertureTele: constante ? '' : String(objectif.ouvertureTeleN),
    fisheye: objectif.typeObjectif === 'FISHEYE',
  }
}

/** Lève en nommant le champ fautif (`valideObjectif`) : rien d'incohérent n'entre au parc. */
export function objectifDeSaisie(saisie: SaisieObjectif, id: string): Objectif {
  const sinon = (texte: string, repli: string) => nombreDeTexte(texte.trim() === '' ? repli : texte)
  return valideObjectif({
    id,
    nom: saisie.nom.trim(),
    focaleMinMm: nombreDeTexte(saisie.focaleMin),
    focaleMaxMm: sinon(saisie.focaleMax, saisie.focaleMin),
    ouvertureGrandAngleN: nombreDeTexte(saisie.ouvertureGrandAngle),
    ouvertureTeleN: sinon(saisie.ouvertureTele, saisie.ouvertureGrandAngle),
    typeObjectif: saisie.fisheye ? 'FISHEYE' : 'RECTILINEAIRE',
  })
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
 * l'autre. Un parc enregistré, même vidé, est rendu tel quel. Un objectif monté disparu du
 * parc cède la place au premier.
 */
export function parcDeDepart(
  depart: OptiqueDeDepart,
  id: string,
): { readonly objectifs: readonly Objectif[]; readonly objectifId: string } {
  if (depart.objectifs !== undefined) {
    const monte = depart.objectifs.find((o) => o.id === depart.objectifId) ?? depart.objectifs[0]
    return { objectifs: depart.objectifs, objectifId: monte?.id ?? '' }
  }
  try {
    const saisie = {
      ...SAISIE_OBJECTIF_VIDE,
      nom: id,
      focaleMin: depart.focale,
      ouvertureGrandAngle: depart.ouverture,
      fisheye: depart.fisheye,
    }
    const objectif = objectifDeSaisie(saisie, id)
    return { objectifs: [{ ...objectif, nom: caracteristiques(objectif) }], objectifId: id }
  } catch {
    // Une optique de départ illisible ne fait pas d'objectif : l'objectif libre la laisse corriger.
    return { objectifs: [], objectifId: '' }
  }
}
