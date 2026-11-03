/**
 * §3.4 — what a scène click designated, in words.
 * Geometry already decided (`cibleSousLeCurseur` returned the nearest target): describe it for
 * the scène store, never invent what the catalogue lacks.
 * T-0109 — title from `titreCible` (fiche and scène name the same body); module keeps only
 * the detail lines.
 */

import { titreCible } from './libelles-cibles.ts'
import { degres, nombre } from '../registry/ecriture.ts'
import type { SelectionScene } from './scene-etat.ts'
import type { CibleEcran } from './dessine-ciel.ts'
import { LIBELLE_TYPE_OBJET } from './libelles-objet.ts'

export function decritCible(cible: CibleEcran): SelectionScene {
  if (cible.type === 'OBJET' && cible.objet !== undefined) {
    const o = cible.objet
    return {
      titre: titreCible(cible),
      lignes: [
        LIBELLE_TYPE_OBJET[o.type],
        o.vMag === null ? 'magnitude intégrée absente du catalogue' : `magnitude ${nombre(o.vMag, 1)}`,
        o.majAxArcmin === null ? 'dimensions absentes' : `grand axe ${nombre(o.majAxArcmin, 1)}’`,
      ],
      objet: o,
    }
  }
  if (cible.type === 'CORPS' && cible.corps !== undefined) {
    const c = cible.corps
    return {
      titre: titreCible(cible),
      lignes: [
        `ascension droite ${nombre(c.adH, 3)} h · déclinaison ${degres(c.decDeg, 2)}`,
        `azimut ${degres(c.azimutDeg, 1)} · hauteur ${degres(c.hauteurDeg, 1)}`,
      ],
      objet: null,
    }
  }
  const nommee = cible.etoileNommee
  if (nommee !== undefined) {
    return {
      titre: titreCible(cible),
      lignes: [
        `magnitude ${nombre(nommee.magV, 2)} · constellation ${nommee.constellation}`,
        nommee.spectre === '' ? 'type spectral absent du catalogue' : `type spectral ${nommee.spectre}`,
        nommee.distancePc === null
          ? 'distance inconnue'
          : `distance ${nombre(nommee.distancePc, 1)} pc`,
      ],
      objet: null,
    }
  }
  const etoile = cible.etoile
  return {
    titre: titreCible(cible),
    lignes: [
      etoile === undefined
        ? ''
        : `magnitude ${nombre(etoile.magV, 2)} · indice B−V ${nombre(etoile.bv, 2)}`,
    ].filter((l) => l !== ''),
    objet: null,
  }
}
