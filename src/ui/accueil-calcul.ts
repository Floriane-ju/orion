/**
 * §1.5.1, §12.3, T-0448 — onboarding rules, without React.
 * No flag in `reglages`: finishing or skipping writes both records (`ecritAuDepart`), their
 * presence IS the memory. A tab closed mid-way proposes it again.
 */

import { nombreDeTexte } from '../registry/domains.ts'
import type { SaisieRestauree } from './app-donnees.ts'
import type { SaisieLieu, SaisieMateriel } from './app-saisie.ts'
import { profilAEnregistrer } from './saisie-persistee.ts'

export const ETAPES = Object.freeze(['bienvenue', 'lieu', 'materiel'] as const)

export type EtapeAccueil = (typeof ETAPES)[number]

/**
 * No IndexedDB: nothing would save, onboarding would return at every start.
 * `erreur`: unread base isn't an empty base.
 */
export function accueilAProposer(restauree: SaisieRestauree, indexedDbPresente: boolean): boolean {
  return (
    indexedDbPresente &&
    restauree.lieu === null &&
    restauree.materiel === null &&
    restauree.erreur === null
  )
}

function chiffrable(texte: string): boolean {
  return Number.isFinite(nombreDeTexte(texte))
}

const CHAMPS_LIEU = Object.freeze([
  'latitude',
  'longitude',
  'bortle',
] as const satisfies readonly (keyof SaisieLieu)[])

/** Custom boîtier: empty resolution saves (optional in the record) but the calcul refuses it. */
export function etapeValide(
  etape: EtapeAccueil,
  lieu: SaisieLieu,
  materiel: SaisieMateriel,
): boolean {
  if (etape === 'bienvenue') return true
  if (etape === 'lieu') return CHAMPS_LIEU.every((champ) => chiffrable(lieu[champ]))
  return (
    profilAEnregistrer(materiel) !== null &&
    (materiel.boitierId !== '' || chiffrable(materiel.boitier.resolutionMpx))
  )
}

export interface SaisieAccueil {
  readonly lieu: SaisieLieu | null
  readonly materiel: SaisieMateriel | null
}

/** Skipping keeps steps already validated; current and following ones fall to defaults. */
export function saisieDePassage(etape: EtapeAccueil, lieu: SaisieLieu): SaisieAccueil {
  return { lieu: etape === 'materiel' ? lieu : null, materiel: null }
}
