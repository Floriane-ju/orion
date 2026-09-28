/**
 * §8.1 côté fiche — l'état du ciel sous la Lune pour la cible ouverte (T-0089).
 *
 * T-0268 — l'instant d'évaluation n'est plus un choix propre à la fiche : c'est le milieu du
 * créneau de la cible, celui du plan de séance (`instantLune`, §8.1). La fiche prenait
 * l'instant affiché par le planétarium, si bien que la même nuit préparée à midi et consultée
 * à 23 h 30 donnait deux gênes lunaires — et deux poses. Une gêne lunaire évaluée à midi ne
 * décrit d'ailleurs aucune observation : la cible y est sous l'horizon.
 *
 * La hauteur de cible passée au modèle est la culmination, exactement comme le plan
 * (`altCulminationDeg`) : c'est ce qui garantit que les deux écrans dégradent le même ciel.
 */

import { cielSousLaLune } from '../core/moon.ts'
import { HorsDomaineSeriesError, type Site } from '../core/ephem.ts'
import { altitudeCulmination } from '../core/site.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { LuneFiche } from './fiche-cible-calcul.ts'
import { DEG_PAR_HEURE } from '../core/unites.ts'


export interface EntreeLuneCible {
  readonly site: Site
  readonly instant: Date
  /** La cible du catalogue : ses coordonnées portent la séparation et la hauteur. */
  readonly objet: ObjetCielProfond
  readonly sbCielNoirMag: number
}

export function lunePourCible(entree: EntreeLuneCible): LuneFiche {
  const objet = entree.objet
  try {
    return {
      evaluee: true,
      instant: entree.instant,
      ciel: cielSousLaLune({
        site: entree.site,
        instant: entree.instant,
        adH: objet.adDeg / DEG_PAR_HEURE,
        decDeg: objet.decDeg,
        altitudeCibleDeg: altitudeCulmination(entree.site.latitudeDeg, objet.decDeg).value,
        sbCielNoirMag: entree.sbCielNoirMag,
      }),
    }
  } catch (erreur) {
    // §12.5 — un instant hors du domaine des séries ne fait pas tomber la fiche : le reste
    // de la chaîne vaut encore, seule la Lune manque, et elle nomme sa cause.
    if (erreur instanceof HorsDomaineSeriesError) {
      return { evaluee: false, cause: erreur.message }
    }
    throw erreur
  }
}
