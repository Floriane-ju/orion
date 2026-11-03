/**
 * T-0208 — §4.1, §5.1: boundary typed TEXT → NUMBER an engine receives.
 * Lieu saisie went down chain via bare `Number()`: latitude 456° reached `astronomy-engine`,
 * which throws a string (not `Error`); render throw unmounts React tree → black screen.
 * Only the consumed value is corrected, not typed text: rewriting per keystroke would block
 * "45.6" ("456" is a legit transient).
 */

import { borne, DOMAINES, nombreDeTexte, type Bornage, type DomaineId } from '../registry/domains.ts'
import { nombreLibre } from '../registry/ecriture.ts'
import type { Plage } from '../core/objectif.ts'

/**
 * Text reading (empty field, decimal comma) lives in registry (T-0274).
 * T-0404 — `plage` narrows domain, never replaces it: mounted objectif's. Clamped as in domain,
 * cause names the objectif, not registry.
 */
export function nombreSaisi(champ: DomaineId, texte: string, plage?: Plage): Bornage {
  const valeur = nombreDeTexte(texte)
  const bornage = borne(champ, valeur)
  // Objectif plage fits inside domain (`valideObjectif`): it bounds even input the domain would
  // have moved elsewhere — 5 000 mm on 18-55 gives 55.
  if (plage === undefined || !Number.isFinite(valeur)) return bornage
  if (valeur >= plage.min && valeur <= plage.max) return bornage
  const d = DOMAINES[champ]
  const retenue = valeur < plage.min ? plage.min : plage.max
  return {
    valeur: retenue,
    refus:
      `Hors de l’objectif : ${d.champ} vaut ${nombreLibre(valeur)} ${d.unite}, hors de sa ` +
      `plage ${nombreLibre(plage.min)} à ${nombreLibre(plage.max)} ${d.unite} — ` +
      `${nombreLibre(retenue)} ${d.unite} retenu.`,
  }
}

/**
 * Optional field: empty → grandeur unknown (§2.3), nothing refused. Out of range → clamped.
 */
export function nombreSiRenseigne(
  champ: DomaineId,
  texte: string,
): { readonly valeur: number | undefined; readonly refus: string | null } {
  if (texte.trim() === '') return { valeur: undefined, refus: null }
  return nombreSaisi(champ, texte)
}
