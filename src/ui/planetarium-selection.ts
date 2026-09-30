/**
 * §3.4 — Ce qu'un clic sur la scène a désigné, mis en mots.
 *
 * La géométrie a déjà tranché : `cibleSousLeCurseur` a rendu la cible la plus proche. Ne
 * reste qu'à la décrire pour le magasin de scène — et à ne jamais inventer ce que le
 * catalogue ne porte pas.
 *
 * T-0109 — le titre vient de `titreCible` : la fiche et la scène nomment le même astre, et
 * ce module ne garde que ce qu'il est seul à savoir dire, les lignes de détail.
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
