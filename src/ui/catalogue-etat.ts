/**
 * §6.4 — what the catalogue shows: scope, search, the two filters.
 * T-0182 — fiche replaces the list in the panel, list unmounts: component-held input would reset
 * on return ("je regarde celle-là, puis je reviens à ma recherche"). State lives here, like
 * [[scene-etat]]: external store reads in SSR and browser, tests without DOM.
 */

import { useSyncExternalStore } from 'react'
import { DOMAINES } from '../registry/domains.ts'
import { TYPES_OBJET, type TypeObjet } from '../data/deepsky.ts'
import { creeAbonnes } from './abonnes.ts'
import { booleen, chaine, dans, garde, gardeAuDepart, litLocal } from '../data/stockage-local.ts'

export interface EtatCatalogue {
  /**
   * True at start: list first answers "que photographier cette nuit". Whole catalogue one tick
   * away: séance closed, not the object base.
   */
  readonly photographiablesSeules: boolean
  readonly recherche: string
  /** Retained filter types: none at start = none excluded. */
  readonly types: ReadonlySet<TypeObjet>
  readonly magMax: number
  /** Filters pane, collapsed at start, never restored: a gesture, not a setting. */
  readonly filtresOuverts: boolean
}

const ETAT_INITIAL: EtatCatalogue = Object.freeze({
  photographiablesSeules: true,
  recherche: '',
  types: new Set<TypeObjet>(),
  // Domain bound, never a number written here: the slider reads the same registre.
  magMax: DOMAINES.m_int.max,
  filtresOuverts: false,
})

const CLE_STOCKAGE = 'orion.catalogue'

/**
 * T-0362 — list reopens as left: "photographiables" box, search, both filters. Type unknown to the
 * current catalogue is dropped; out-of-domain magnitude falls to the bound.
 */
function restaure(depart: EtatCatalogue): EtatCatalogue {
  const lu = litLocal(CLE_STOCKAGE)
  if (lu === null) return depart
  const champs = garde<Partial<EtatCatalogue>>(lu, {
    photographiablesSeules: booleen,
    recherche: chaine,
    magMax: dans('m_int'),
  })
  // List saved with all types checked predates the chips: falls back to "none retained", else all
  // chips would show pressed.
  const retenus = Array.isArray(lu.types)
    ? TYPES_OBJET.filter((t) => (lu.types as unknown[]).includes(t))
    : null
  const types =
    retenus === null ? {} : { types: new Set<TypeObjet>(retenus.length === TYPES_OBJET.length ? [] : retenus) }
  return { ...depart, ...champs, ...types }
}

let etat: EtatCatalogue = restaure(ETAT_INITIAL)
const { abonne, notifie } = creeAbonnes()

gardeAuDepart(CLE_STOCKAGE, () => ({ ...etat, types: [...etat.types] }))

export function etatCatalogue(): EtatCatalogue {
  return etat
}

export function majCatalogue(retouche: Partial<EtatCatalogue>): void {
  etat = { ...etat, ...retouche }
  notifie()
}

/** Resets catalogue to start state. Tests only. */
export function reinitialiseCatalogue(): void {
  majCatalogue(ETAT_INITIAL)
}

export function useCatalogue(): EtatCatalogue {
  return useSyncExternalStore(abonne, etatCatalogue, etatCatalogue)
}
