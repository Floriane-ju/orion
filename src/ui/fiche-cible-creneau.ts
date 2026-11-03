/**
 * §8.2 fiche side — T-0222: when to photograph cible tonight, under which sky.
 * Nothing recomputed fiche-style: fenêtre, masque, seuil, monture, base fond de ciel, Lune instant
 * go through `prepareEvaluation`, `entreeCreneau`, `instantLune` — plan de séance's doors. Fiche
 * announcing 22 h – 3 h where plan allots 23 h – 2 h = one more disagreement (T-0089 had to fix).
 * T-0268 — fiche no longer reads scène clock (it dated its Lune with it → two lunar gênes per
 * night by consultation time: noon preparation priced noon's Lune). Créneau is a property of the
 * NIGHT, not of viewing instant; so is fiche's Lune.
 */

import { prepareEvaluation } from '../core/cibles-liste.ts'
import type { CreneauCible } from '../core/creneaux.ts'
import { masseAir } from '../core/site.ts'
import { creneauSousLaLune, instantLune } from '../core/session-candidates.ts'
import type { ContexteSession } from '../core/session-types.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { CaptureNuit, LuneFiche } from './fiche-cible-calcul.ts'
import { lunePourCible } from './fiche-cible-lune.ts'
import { S_PAR_MIN } from '../core/unites.ts'


export type CreneauFiche =
  | { readonly chiffre: true; readonly creneau: CreneauCible }
  | { readonly chiffre: false; readonly cause: string }

/** All the plan night imposes on fiche, assembled in one place. */
export interface NuitFiche {
  readonly creneau: CreneauFiche
  readonly lune: LuneFiche
  readonly capture: CaptureNuit
}

export const CAUSE_NUIT_NON_CHIFFREE =
  'Pas de créneau photo : complétez le lieu, la date ou le matériel.'

/**
 * T-0268 — fiche créneau, Lune and masse d'air, from the SAME night.
 * No priceable night: nothing assumed — Lune not evaluated, masse d'air unknown. `fluxObjetReel`
 * handles it: duration shown as minimum, says so on screen (§7.6, §12.5).
 */
export function nuitFiche(
  contexte: ContexteSession | null,
  objet: ObjetCielProfond,
): NuitFiche {
  const entree = contexte === null ? null : prepareEvaluation(contexte)
  if (contexte === null || entree === null) {
    return {
      creneau: { chiffre: false, cause: CAUSE_NUIT_NON_CHIFFREE },
      lune: { evaluee: false, cause: CAUSE_NUIT_NON_CHIFFREE },
      // Unpriceable night: incomplete saisie, not an écartée cible. Duration shown as minimum, not
      // refusal (§7.6, §12.5).
      capture: { masseAir: masseAir(null), dureeCreneauS: null, plusHaut: null, exclusion: null },
    }
  }

  // T-0382 — intersected with useful fenêtre as in plan: a galaxy under Lune has not the same
  // créneau as an emission nebula that night.
  const { creneau, exclusionLune } = creneauSousLaLune(
    contexte,
    objet,
    entree.fenetre,
    entree.sbCielBase,
  )
  const lune = lunePourCible({
    site: contexte.site,
    instant: instantLune(creneau, entree.fenetre.debut),
    objet,
    // Plan base fond de ciel: site black sky MINUS crépuscule penalty (§2.2). Fiche used black sky
    // alone → night slightly darker than plan's.
    sbCielNoirMag: entree.sbCielBase,
  })

  // Excluded/empty créneau: plan and list écartent cible; fiche carries same cause, not fallback
  // to culmination (priced an integration for a night offering none: relief-hidden cible showed
  // 24 h pose).
  const sansCreneau = creneau.causeExclusion !== undefined || creneau.dureeTotaleMin.value <= 0
  const exclusion = sansCreneau ? creneau.message : exclusionLune

  return {
    creneau: { chiffre: true, creneau },
    lune,
    capture: exclusion !== null
      ? {
          masseAir: masseAir(null),
          dureeCreneauS: null,
          plusHaut: null,
          exclusion,
        }
      : {
          masseAir: creneau.masseAirMoyenne,
          dureeCreneauS: creneau.dureeTotaleMin.value * S_PAR_MIN,
          plusHaut: creneau.plusHaut,
          exclusion: null,
        },
  }
}
