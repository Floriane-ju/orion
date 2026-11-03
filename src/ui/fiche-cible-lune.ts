/**
 * §8.1 fiche side — sky state under Lune for opened cible (T-0089).
 * T-0268 — evaluation instant no longer fiche's choice: cible créneau midpoint, plan de séance's
 * (`instantLune`, §8.1). Fiche took planétarium displayed instant → same night prepared at noon,
 * consulted at 23:30 gave two lunar gênes and two poses. Noon gêne describes no observation
 * anyway (cible under horizon).
 * Cible height passed to model = culmination, as plan (`altCulminationDeg`): both degrade the same
 * sky.
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
  /** Catalogue cible: its coordinates carry separation and height. */
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
    // §12.5 — instant outside series domain doesn't take fiche down: rest of chain holds, only Lune
    // missing, names its cause.
    if (erreur instanceof HorsDomaineSeriesError) {
      return { evaluee: false, cause: erreur.message }
    }
    throw erreur
  }
}
