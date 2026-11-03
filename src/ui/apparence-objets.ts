/**
 * §3.3, §6.3, §11.1 — what tells one deep-sky object from another on screen.
 * EDIT THIS FILE to change a marker colour: `APPARENCE_OBJET` gives, per each of the ten
 * `TYPES_OBJET`, radial gradient hue and edge hue. Nothing else decides them.
 * Not in registre §2.1 (as `ANCRES` in `couleurs.ts`): drawing decisions, no formula or verdict
 * reads them; registre holds only quantities a calcul reads.
 * Bytes, not CSS strings: mode nuit derives (perceived luminance on red channel only, §11.1)
 * instead of a hand-kept second table where a forgotten hue lets green into the dark.
 */

import { rayonEtoilePx } from '../core/projection.ts'
import { encadre } from '../core/unites.ts'
import { K } from '../registry/constants.ts'
import type { TypeObjet } from '../data/deepsky.ts'
import {
  ajusteContrasteSurFond,
  avecOpacite,
  luminanceFondRealiste,
  rougeEquivalent,
} from './couleurs.ts'

type Octets = readonly [number, number, number]

export interface ApparenceObjet {
  /** Gradient core: object matter colour. */
  readonly radiant: Octets
  /** Ellipse outline; also cross colour when catalogue has no dimensions. */
  readonly bord: Octets
}

/**
 * Families share a hue: 3 nebulae of different mechanism stay 3 nebulae to the eye; close hues
 * distinguish nothing on black.
 * T-0196 — catch-all (`INCONNU`, `AUTRE`) is GREY, not galaxy green: same radiant + slightly
 * darker outline = two indistinguishable green discs, legend promising a distinction scène didn't
 * hold. No classification isn't a family; grey announces none.
 * Radiant ALWAYS lighter than edge, dark nebula included: black core is true to the sky but on a
 * black canvas loses shape and extent, the marker's only job. A symbol, not a photograph.
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

/** Opacity at gradient centre. Below 1: fond de ciel stays readable through. */
const OPACITE_RADIANT_COEUR = 0.75
/** Opacity at gradient edge. Zero: halo fades out on the outline, doesn't stop there. */
const OPACITE_RADIANT_BORD = 0
/** Outline thickness. A bit over 1 px: it carries the object's shape. */
export const EPAISSEUR_BORD_PX = 1.5

/**
 * §3.4 — opacity of a marker the catalogue filters don't retain. Faded, not erased: rest of sky
 * stays readable under the selection, else its position is lost. 1/10: selection carries alone,
 * rejected persists as background texture. Type hue unrecognisable but POSITION still says
 * something, and click still returns it.
 */
export const OPACITE_OBJET_ESTOMPE = 0.1

/**
 * T-0357 — visible share of stars and landmarks of night sky, by Sun altitude. Zero Sun up, full
 * at end of civil twilight: first figure stars become visible, connecting lines useful again. Star
 * COUNT stays with limiting magnitude (`seuil-oeil.ts`); this fade only avoids a snap on a
 * background the twilight model freezes from 0 to −5° (Patat table edge). Moon and planets
 * (visible by day) skip it.
 */
export function apparitionReperes(altitudeSoleilDeg: number): number {
  return encadre(altitudeSoleilDeg / K('HAUTEUR_CREPUSCULE_CIVIL_DEG'), 0, 1)
}

/**
 * §8.4 / T-0324 — opacity of background stars under a pointage route. Higher than a rejected
 * marker's: background tells where we look. Low enough that circled route steps stand out without
 * searching, the only landmark the stripped scène keeps.
 */
export const OPACITE_ETOILE_PARCOURS = 0.35

export interface TeintesObjet {
  /** Central gradient stop. */
  readonly coeur: string
  /** Peripheral gradient stop. */
  readonly halo: string
  readonly bord: string
}

export type TeintesParType = Readonly<Record<TypeObjet, TeintesObjet>>

const TYPES = Object.keys(APPARENCE_OBJET) as readonly TypeObjet[]

function css(octets: Octets): string {
  return `rgb(${octets[0]} ${octets[1]} ${octets[2]})`
}

/** Full table, from a base hue → painted hue conversion. */
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
 * Two tables frozen once, like the two palettes of `couleurs.ts`: render loop asks per frame,
 * rebuilding only allocates.
 */
const TEINTES_JOUR = table(css)
const TEINTES_NUIT = table((o) => rougeEquivalent(o[0], o[1], o[2]))

/**
 * REFERENCE hue of a type: current mode's, without fond de ciel adjustment. Shown by the legend:
 * a colour convention, not an image state; sky brightness would change its meaning per Bortle.
 */
export function teintesReference(modeNuit: boolean): TeintesParType {
  return modeNuit ? TEINTES_NUIT : TEINTES_JOUR
}

/**
 * Realistic view: markers follow scène's other landmarks: hue keeps its contrast ratio on the
 * reference background, else an object vanishes under Bortle 9 sky (§3.7 forbids). One-entry
 * cache, as `paletteRealiste`: `sbCiel` doesn't change between frames.
 */
let cacheRealiste: { sb: number; teintes: TeintesParType } | null = null

/** Scène table. Mode nuit first: it overrides realistic view (§11.1). */
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

/** Below this radius antialiasing erases the disc: faintest star stays a point. */
export const RAYON_MIN_ETOILE_PX = K('RAYON_MIN_ETOILE_PX')

/** Planétarium cap only — §9.2 preview keeps the full law (simulates a sensor, not a map). */
export const RAYON_MAX_ETOILE_PX = K('RAYON_MAX_ETOILE_CIEL_PX')

/**
 * Star radius on planétarium: §3.3 law with §9.2 slope but a map r0 (T-0376); disc gradation
 * carries sky hierarchy.
 */
export function rayonEtoileCielPx(magV: number): number {
  const loi = (rayonEtoilePx(magV) * K('RAYON_ETOILE_CIEL_R0_PX')) / K('RAYON_ETOILE_R0_PX')
  return Math.min(RAYON_MAX_ETOILE_PX, Math.max(RAYON_MIN_ETOILE_PX, loi))
}
