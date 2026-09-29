/**
 * §3.3, §6.3, §11.1 — ce qui distingue un objet du ciel profond d'un autre à l'écran.
 *
 * C'EST LE FICHIER À ÉDITER pour changer une couleur de marqueur : `APPARENCE_OBJET` donne,
 * pour chacun des dix types de `TYPES_OBJET`, la teinte du dégradé radial et celle du bord.
 * Rien d'autre dans l'application ne décide de ces teintes.
 *
 * Ces couleurs ne sont pas au registre §2.1, et pour la même raison que la table `ANCRES` de
 * `couleurs.ts` : ce sont des décisions de dessin, aucune formule ne les consomme et aucun
 * verdict n'en dépend. Le registre ne porte que les grandeurs qu'un calcul lit.
 *
 * En octets et non en chaînes CSS : c'est ce qui permet de dériver le mode nuit — luminance
 * perçue ramenée sur le seul canal rouge (§11.1) — au lieu de tenir une seconde table à jour
 * à la main, où une teinte oubliée passerait un vert dans le noir.
 */

import { rayonEtoilePx } from '../core/projection.ts'
import type { TypeObjet } from '../data/deepsky.ts'
import {
  ajusteContrasteSurFond,
  avecOpacite,
  luminanceFondRealiste,
  rougeEquivalent,
} from './couleurs.ts'

type Octets = readonly [number, number, number]

export interface ApparenceObjet {
  /** Cœur du dégradé radial : la couleur de la matière de l'objet. */
  readonly radiant: Octets
  /** Contour de l'ellipse — et couleur de la croix quand le catalogue n'a pas de dimensions. */
  readonly bord: Octets
}

/**
 * Les familles partagent leur teinte : trois nébuleuses de mécanisme différent restent trois
 * nébuleuses à l'œil, et multiplier les teintes proches ne distingue plus rien sur fond noir.
 *
 * T-0196 — le fourre-tout (`INCONNU`, `AUTRE`) est GRIS, et non le vert des galaxies. Il
 * portait exactement leur radiant et ne s'en écartait que d'un contour un peu plus sombre :
 * à l'écran, deux disques verts qu'aucun œil ne sépare, et une légende qui promettait une
 * distinction que la scène ne tenait pas. Une classification absente n'est pas une famille —
 * le gris est la seule teinte qui n'en annonce aucune.
 *
 * Le radiant est TOUJOURS plus clair que le bord, y compris pour la nébuleuse obscure. Peindre
 * celle-ci d'un cœur noir était juste sur le fond — c'est ce qu'elle est, une absence de lumière
 * — mais sur un canevas noir, un dégradé noir n'est plus un dégradé : l'objet perdait sa forme
 * et son étendue, la seule chose que le marqueur a à dire. C'est un symbole, pas une photographie.
 */
export const APPARENCE_OBJET: Readonly<Record<TypeObjet, ApparenceObjet>> = Object.freeze({
  INCONNU: { radiant: [198, 205, 210], bord: [148, 158, 166] },
  GALAXIE: { radiant: [169, 236, 201], bord: [122, 200, 164] },
  AMAS_OUVERT: { radiant: [143, 199, 240], bord: [104, 160, 205] },
  AMAS_GLOB: { radiant: [143, 199, 240], bord: [104, 160, 205] },
  NEB_PLANETAIRE: { radiant: [233, 165, 220], bord: [196, 128, 184] },
  EMISSION: { radiant: [233, 165, 220], bord: [196, 128, 184] },
  REFLEXION: { radiant: [233, 165, 220], bord: [196, 128, 184] },
  NEB_OBSCURE: { radiant: [150, 110, 170], bord: [107, 74, 122] },
  RESTE_SUPERNOVA: { radiant: [180, 154, 232], bord: [143, 118, 196] },
  AUTRE: { radiant: [198, 205, 210], bord: [148, 158, 166] },
} satisfies Record<TypeObjet, ApparenceObjet>)

/** Opacité au centre du dégradé. En dessous de 1 : le fond de ciel reste lisible au travers. */
const OPACITE_RADIANT_COEUR = 0.75
/** Opacité au bord du dégradé. Nulle : le halo s'éteint sur le contour, il ne s'y arrête pas. */
const OPACITE_RADIANT_BORD = 0
/** Épaisseur du contour. Un peu plus qu'un pixel : c'est lui qui porte la forme de l'objet. */
export const EPAISSEUR_BORD_PX = 1.5

/**
 * §3.4 — opacité d'un marqueur que les filtres du catalogue ne retiennent pas. Estompé, pas
 * effacé : le reste du ciel doit rester lisible sous la sélection, sinon on ne voit plus où
 * elle tombe. Un dixième : la sélection porte seule, et l'écarté ne subsiste qu'en trame de
 * fond. La teinte du type n'y est plus reconnaissable, mais c'est la POSITION qu'un marqueur
 * écarté a encore à dire, et le clic la rend toujours.
 */
export const OPACITE_OBJET_ESTOMPE = 0.1

/**
 * §8.4 / T-0324 — opacité des étoiles de fond sous un parcours de pointage.
 *
 * Plus haute que celle d'un marqueur écarté : le fond n'est pas ce qu'on écarte, c'est ce qui
 * dit où l'on regarde. Assez basse pour que les étapes cerclées du trajet se détachent du semis
 * sans qu'on ait à les chercher — c'est le seul repère que la scène dépouillée garde encore.
 */
export const OPACITE_ETOILE_PARCOURS = 0.35

export interface TeintesObjet {
  /** Arrêt central du dégradé. */
  readonly coeur: string
  /** Arrêt périphérique du dégradé. */
  readonly halo: string
  readonly bord: string
}

export type TeintesParType = Readonly<Record<TypeObjet, TeintesObjet>>

const TYPES = Object.keys(APPARENCE_OBJET) as readonly TypeObjet[]

function css(octets: Octets): string {
  return `rgb(${octets[0]} ${octets[1]} ${octets[2]})`
}

/** La table complète, à partir d'une conversion teinte de base → teinte peinte. */
function table(peint: (octets: Octets) => string): TeintesParType {
  const teintes = {} as Record<TypeObjet, TeintesObjet>
  for (const type of TYPES) {
    const apparence = APPARENCE_OBJET[type]
    const radiant = peint(apparence.radiant)
    teintes[type] = Object.freeze({
      coeur: avecOpacite(radiant, OPACITE_RADIANT_COEUR),
      halo: avecOpacite(radiant, OPACITE_RADIANT_BORD),
      bord: peint(apparence.bord),
    })
  }
  return Object.freeze(teintes)
}

/**
 * Deux tables gelées une fois, comme les deux palettes de `couleurs.ts` : la boucle de rendu
 * les demande par image, et les reconstruire n'apporterait rien qu'une allocation.
 */
const TEINTES_JOUR = table(css)
const TEINTES_NUIT = table((o) => rougeEquivalent(o[0], o[1], o[2]))

/**
 * La teinte de RÉFÉRENCE d'un type : celle du mode courant, sans l'ajustement au fond de ciel.
 * C'est ce que montre la légende de la barre basse — elle nomme une convention de couleur, pas
 * l'état d'une image, et lui passer une brillance de ciel lui ferait dire autre chose à chaque
 * changement de Bortle.
 */
export function teintesReference(modeNuit: boolean): TeintesParType {
  return modeNuit ? TEINTES_NUIT : TEINTES_JOUR
}

/**
 * En vue réaliste, les marqueurs suivent les autres repères de la scène : leur teinte garde le
 * rapport de contraste qu'elle a sur le fond de référence, sinon un objet disparaît sous un
 * ciel de Bortle 9 — exactement ce que §3.7 interdit. Cache à une entrée, même raison que
 * `paletteRealiste` : la valeur de `sbCiel` ne change pas d'une image à l'autre.
 */
let cacheRealiste: { sb: number; teintes: TeintesParType } | null = null

/** La table de la scène. Mode nuit d'abord : il l'emporte sur la vue réaliste (§11.1). */
export function teintesObjets(
  modeNuit: boolean,
  vueRealiste: boolean,
  sbCiel: number,
): TeintesParType {
  if (modeNuit) return TEINTES_NUIT
  if (!vueRealiste) return TEINTES_JOUR
  if (cacheRealiste !== null && cacheRealiste.sb === sbCiel) return cacheRealiste.teintes
  const luminanceFond = luminanceFondRealiste(sbCiel)
  const teintes = table((o) => ajusteContrasteSurFond(css(o), luminanceFond).couleur)
  cacheRealiste = { sb: sbCiel, teintes }
  return teintes
}

/** Sous ce rayon, l'antialiasing efface le disque : la plus faible étoile reste un point. */
export const RAYON_MIN_ETOILE_PX = 0.7

/**
 * Au-dessus, Sirius ou Véga prenaient la taille d'une planète (`RAYON_CORPS_PX`) : une étoile
 * reste un point, même brillante. Plafond du planétarium seul — l'aperçu §9.2 garde la loi
 * complète, parce qu'il simule un capteur, pas une carte.
 */
export const RAYON_MAX_ETOILE_PX = 3

/** Rayon d'une étoile au planétarium : la loi §3.3 bornée par le plancher et le plafond. */
export function rayonEtoileCielPx(magV: number): number {
  return Math.min(RAYON_MAX_ETOILE_PX, Math.max(RAYON_MIN_ETOILE_PX, rayonEtoilePx(magV)))
}
