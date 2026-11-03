/**
 * §5.1, T-0404 — parc objectif input: typed text → validated `Objectif`.
 * Fixed focale needs only focale + ouverture: empty max end reuses min (asking "135" twice for
 * a 135 mm is pointless).
 */

import { valideObjectif, type Objectif } from '../core/objectif.ts'
import type { TypeObjectif } from '../core/optics.ts'
import { nombreDeTexte } from '../registry/domains.ts'
import { nombreLibre } from '../registry/ecriture.ts'

/** A parc row as typed: empty max ends = fixed focale, constant ouverture. */
export interface SaisieObjectif {
  readonly focaleMin: string
  readonly focaleMax: string
  readonly ouvertureGrandAngle: string
  readonly ouvertureTele: string
}

/** Text of a parc objectif, for its row. */
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
 * Throws naming the faulty field (`valideObjectif`): nothing incoherent enters the parc.
 * Name not typed: it is the ring notation, quoted as is by §6.1.
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

/** "18–55 mm f/3,5–5,6", "135 mm f/2": notation engraved on the ring. */
export function caracteristiques(objectif: Objectif): string {
  const plage = (a: number, b: number) => (a === b ? nombreLibre(a) : `${nombreLibre(a)}–${nombreLibre(b)}`)
  return (
    `${plage(objectif.focaleMinMm, objectif.focaleMaxMm)} mm ` +
    `f/${plage(objectif.ouvertureGrandAngleN, objectif.ouvertureTeleN)}`
  )
}

/** Parc with this objectif added, or replaced in place if present. */
export function parcAvec(parc: readonly Objectif[], objectif: Objectif): readonly Objectif[] {
  return parc.some((o) => o.id === objectif.id)
    ? parc.map((o) => (o.id === objectif.id ? objectif : o))
    : [...parc, objectif]
}

/** What the reloaded profile says of the optics: its parc if any, else its single setting. */
export interface OptiqueDeDepart {
  readonly objectifs?: readonly Objectif[]
  readonly objectifId?: string
  readonly focale: string
  readonly ouverture: string
  readonly fisheye: boolean
}

/**
 * Parc at startup. Optics typed before the parc (or Annexe A's at first start) becomes its
 * first objectif, a fixed focale later editable to zoom or removable (else the starting
 * objectif was the one neither). A stored empty parc (emptied before the last objectif was
 * protected, or imported so) rebuilds the same way: an Optique card with no objectif offers
 * nothing to add. A mounted objectif gone from the parc yields to the first.
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
    // Unreadable starting optics makes no objectif: free objectif lets the user fix it.
    return { objectifs: [], objectifId: '' }
  }
}
