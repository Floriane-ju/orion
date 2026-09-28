/**
 * §2.2 — Table Bortle et brillance de fond de ciel.
 *
 * Le modèle linéaire du socle initial est remplacé par une table. Extrapolé vers Bortle 1
 * il donnait 23,4 mag/arcsec², valeur physiquement impossible : la lueur atmosphérique, la
 * lumière zodiacale et la lumière stellaire intégrée fixent un plancher autour de
 * 21,7 à 22,0 mag/arcsec². Aucun site terrestre ne descend en dessous.
 *
 * INTERPOLATION LINÉAIRE AUTORISÉE entre deux lignes.
 * EXTRAPOLATION INTERDITE au-delà de 1 et de 9.
 * Le SQM mesuré, s'il est saisi, PRÉVAUT toujours sur le Bortle estimé.
 */

export interface LigneBortle {
  readonly bortle: number
  /** Brillance du fond de ciel, mag/arcsec². */
  readonly sb: number
  /** Magnitude limite à l'œil nu. */
  readonly mLimOeil: number
}

/**
 * Lignes 4 et 8 : ancrages du socle. Colonne de magnitude limite : échelle de Bortle telle
 * que publiée (Sky & Telescope, 2001) — [À VÉRIFIER] contre la publication.
 */
export const TABLE_BORTLE: readonly LigneBortle[] = Object.freeze([
  { bortle: 1, sb: 21.9, mLimOeil: 7.8 },
  { bortle: 2, sb: 21.7, mLimOeil: 7.3 },
  { bortle: 3, sb: 21.5, mLimOeil: 6.8 },
  { bortle: 4, sb: 21.3, mLimOeil: 6.3 },
  { bortle: 5, sb: 20.6, mLimOeil: 5.8 },
  { bortle: 6, sb: 19.9, mLimOeil: 5.5 },
  { bortle: 7, sb: 19.2, mLimOeil: 5.0 },
  { bortle: 8, sb: 18.5, mLimOeil: 4.5 },
  { bortle: 9, sb: 18.0, mLimOeil: 4.0 },
].map(Object.freeze) as LigneBortle[])

export const SOURCE_TABLE_BORTLE =
  'Échelle de Bortle (Sky & Telescope, 2001) ; lignes 4 et 8 ancrées sur le socle. ' +
  'Interpolation autorisée entre deux lignes, extrapolation interdite hors [1 ; 9].'

const BORTLE_MIN = TABLE_BORTLE[0]!.bortle
const BORTLE_MAX = TABLE_BORTLE[TABLE_BORTLE.length - 1]!.bortle

/** Fond de ciel naturel le plus sombre atteignable, borne haute de la table. */
export const SB_PLANCHER_NATUREL = TABLE_BORTLE[0]!.sb

function encadre(bortle: number): readonly [LigneBortle, LigneBortle, number] {
  const bas = Math.floor(bortle)
  const indexBas = Math.min(bas - BORTLE_MIN, TABLE_BORTLE.length - 2)
  const ligneBasse = TABLE_BORTLE[indexBas]!
  const ligneHaute = TABLE_BORTLE[indexBas + 1]!
  return [ligneBasse, ligneHaute, bortle - ligneBasse.bortle]
}

export class BortleHorsTableError extends Error {
  readonly bortle: number

  constructor(bortle: number) {
    super(
      `Bortle ${bortle} hors de la table [${BORTLE_MIN} ; ${BORTLE_MAX}] : ` +
        'aucune extrapolation n’est produite hors de ces bornes.',
    )
    this.name = 'BortleHorsTableError'
    this.bortle = bortle
  }
}

/** Interpole la table pour un Bortle fractionnaire. Refuse toute valeur hors [1 ; 9]. */
export function interpoleBortle(bortle: number): LigneBortle {
  if (!Number.isFinite(bortle) || bortle < BORTLE_MIN || bortle > BORTLE_MAX) {
    throw new BortleHorsTableError(bortle)
  }
  const [basse, haute, fraction] = encadre(bortle)
  return {
    bortle,
    sb: basse.sb + fraction * (haute.sb - basse.sb),
    mLimOeil: basse.mLimOeil + fraction * (haute.mLimOeil - basse.mLimOeil),
  }
}

/**
 * Inversion de la colonne SB : d'une brillance mesurée vers la magnitude limite à l'œil nu.
 * Retourne `null` hors du domaine de la table plutôt que d'extrapoler.
 */
export function mLimOeilDepuisSb(sb: number): number | null {
  const sbMax = TABLE_BORTLE[0]!.sb
  const sbMin = TABLE_BORTLE[TABLE_BORTLE.length - 1]!.sb
  if (!Number.isFinite(sb) || sb > sbMax || sb < sbMin) return null

  for (let i = 0; i < TABLE_BORTLE.length - 1; i++) {
    const haute = TABLE_BORTLE[i]! // SB décroissante avec le Bortle
    const basse = TABLE_BORTLE[i + 1]!
    if (sb <= haute.sb && sb >= basse.sb) {
      const etendue = haute.sb - basse.sb
      if (etendue === 0) return haute.mLimOeil
      const fraction = (haute.sb - sb) / etendue
      return haute.mLimOeil + fraction * (basse.mLimOeil - haute.mLimOeil)
    }
  }
  return null
}

/** Magnitude limite à l'œil nu aux deux bords de la table. */
export const M_LIM_OEIL_PLAFOND = TABLE_BORTLE[0]!.mLimOeil
export const M_LIM_OEIL_PLANCHER = TABLE_BORTLE[TABLE_BORTLE.length - 1]!.mLimOeil
/** Fond de ciel le plus clair de la table, borne basse de son domaine. */
export const SB_PLAFOND_TABLE = TABLE_BORTLE[TABLE_BORTLE.length - 1]!.sb

export type BorneTableBortle = 'AUCUNE' | 'CIEL_PLUS_SOMBRE' | 'CIEL_PLUS_CLAIR'

export interface MLimOeilBorne {
  readonly value: number
  readonly borne: BorneTableBortle
}

/**
 * T-0100 — magnitude limite à l'œil nu, BORNÉE au bord de table hors domaine.
 *
 * `mLimOeilDepuisSb` rend `null` hors de la table, et c'est la bonne réponse tant qu'il s'agit
 * de publier une valeur : rien n'est extrapolé. Mais un appelant qui doit PLAFONNER quelque
 * chose ne peut rien faire d'un `null` — il finit par ne plus plafonner du tout, et un ciel de
 * pleine Lune montre alors plus d'étoiles qu'un ciel de banlieue. On borne donc au bord de
 * table en le déclarant, comme `contrast.ts` plafonne le seuil de Blackwell au dernier palier.
 */
export function mLimOeilBorne(sb: number): MLimOeilBorne {
  if (!Number.isFinite(sb)) return { value: M_LIM_OEIL_PLANCHER, borne: 'CIEL_PLUS_CLAIR' }
  if (sb > SB_PLANCHER_NATUREL) return { value: M_LIM_OEIL_PLAFOND, borne: 'CIEL_PLUS_SOMBRE' }
  if (sb < SB_PLAFOND_TABLE) return { value: M_LIM_OEIL_PLANCHER, borne: 'CIEL_PLUS_CLAIR' }
  return { value: mLimOeilDepuisSb(sb) ?? M_LIM_OEIL_PLANCHER, borne: 'AUCUNE' }
}
