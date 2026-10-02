/**
 * §8.2 côté fiche — T-0222 : quand photographier la cible cette nuit, et sous quel ciel.
 *
 * Rien n'est recalculé à la façon de la fiche : fenêtre, masque, seuil, monture, fond de ciel
 * de base et instant lunaire passent par `prepareEvaluation`, `entreeCreneau` et `instantLune`,
 * les mêmes portes que le plan de séance. Une fiche qui annoncerait 22 h – 3 h quand le plan
 * alloue 23 h – 2 h serait un désaccord de plus, de ceux que T-0089 a déjà dû corriger.
 *
 * T-0268 — la fiche ne lit plus l'horloge de la scène. Elle le faisait pour dater sa Lune, ce
 * qui donnait deux gênes lunaires pour une seule nuit selon l'heure de consultation : préparer
 * à midi chiffrait la Lune de midi. Un créneau est une propriété de la NUIT, pas de l'instant
 * où on la regarde ; la Lune de la fiche l'est désormais aussi.
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

/** Tout ce que la nuit du plan impose à la fiche, assemblé en un seul endroit. */
export interface NuitFiche {
  readonly creneau: CreneauFiche
  readonly lune: LuneFiche
  readonly capture: CaptureNuit
}

export const CAUSE_NUIT_NON_CHIFFREE =
  'Pas de créneau photo : complétez le lieu, la date ou le matériel.'

/**
 * T-0268 — le créneau, la Lune et la masse d'air de la fiche, tirés de la MÊME nuit.
 *
 * Sans nuit chiffrable, rien n'est supposé : la Lune n'est pas évaluée et la masse d'air est
 * inconnue. `fluxObjetReel` traite déjà ce cas — la durée annoncée se présente en minimum, et
 * le dit à l'écran (§7.6, §12.5).
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
      // Nuit non chiffrable : ce n'est pas une cible écartée, c'est une saisie incomplète. La
      // durée annoncée se présente donc en minimum plutôt qu'en refus (§7.6, §12.5).
      capture: { masseAir: masseAir(null), dureeCreneauS: null, plusHaut: null, exclusion: null },
    }
  }

  // T-0382 — recoupé par la fenêtre utile comme au plan : une galaxie sous la Lune n'a pas le
  // même créneau qu'une nébuleuse en émission la même nuit.
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
    // Le fond de ciel de base du plan : ciel noir du site MOINS la pénalité de crépuscule
    // (§2.2). La fiche employait le ciel noir seul, donc une nuit un peu plus sombre que
    // celle que le plan dose.
    sbCielNoirMag: entree.sbCielBase,
  })

  // Créneau exclu ou vide : le plan et la liste écartent la cible, et la fiche porte la même
  // cause plutôt que de replier sur la culmination. Le repli chiffrait une intégration pour
  // une nuit qui n'en offre aucune — la cible cachée par le relief affichait 24 h de pose.
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
