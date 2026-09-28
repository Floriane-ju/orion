/**
 * §6.3 — Seuils de contraste de détection visuelle.
 *
 * LE POINT QUE 90 % DES APPLICATIONS RATENT : un instrument n'augmente jamais la brillance
 * de surface d'un objet étendu. Il augmente sa taille apparente, et c'est par elle que le
 * seuil de contraste baisse. La détection dépend donc du couple (ΔSB, taille apparente),
 * jamais de la seule magnitude limite.
 *
 * Modèle de référence : Blackwell (1946), popularisé par Clark, *Visual Astronomy of the
 * Deep Sky* (1990). Le seuil est ici exprimé directement en ΔSB — l'écart de brillance de
 * surface entre l'objet et le fond de ciel — plutôt qu'en contraste, pour être comparable
 * sans conversion à la sortie de §6.3.
 *
 * Les valeurs sont des VALEURS DE TRAVAIL, `[À VÉRIFIER]` contre les tables publiées, au
 * même titre que la colonne de magnitude limite de la table Bortle.
 *
 * Deux bornes, et aucune extrapolation entre les deux :
 *   - sous la plus petite taille tabulée, l'objet est traité comme ponctuel : c'est la
 *     magnitude intégrée qui décide, pas la brillance de surface ;
 *   - au-delà de la plus grande, le seuil PLAFONNE. Ce n'est pas une extrapolation : la
 *     sommation spatiale de l'œil est complète, agrandir davantage n'apporte plus rien.
 */

export interface LigneContraste {
  /** Taille apparente, grossissement déjà appliqué. */
  readonly tailleArcmin: number
  /** Écart de brillance de surface minimal pour une détection, mag/arcsec². */
  readonly seuilDeltaSb: number
}

export const TABLE_CONTRASTE: readonly LigneContraste[] = Object.freeze(
  [
    { tailleArcmin: 1, seuilDeltaSb: -0.5 },
    { tailleArcmin: 2, seuilDeltaSb: -0.9 },
    { tailleArcmin: 5, seuilDeltaSb: -1.3 },
    { tailleArcmin: 10, seuilDeltaSb: -1.55 },
    { tailleArcmin: 20, seuilDeltaSb: -1.75 },
    { tailleArcmin: 40, seuilDeltaSb: -1.9 },
    { tailleArcmin: 60, seuilDeltaSb: -1.95 },
    { tailleArcmin: 120, seuilDeltaSb: -2.0 },
  ].map(Object.freeze) as LigneContraste[],
)

export const SOURCE_TABLE_CONTRASTE =
  'Blackwell (1946), tel que popularisé par Clark, Visual Astronomy of the Deep Sky (1990). ' +
  'Valeurs de travail — [À VÉRIFIER] contre les tables publiées. Interpolation autorisée ' +
  'entre deux lignes ; au-delà de la dernière, le seuil plafonne par sommation spatiale ' +
  'complète, il n’est pas extrapolé.'

/** Sous cette taille apparente, l'objet est ponctuel : la magnitude intégrée décide seule. */
const TAILLE_PONCTUELLE_ARCMIN = TABLE_CONTRASTE[0]!.tailleArcmin

const PLATEAU = TABLE_CONTRASTE[TABLE_CONTRASTE.length - 1]!

/**
 * Seuil de contraste pour une taille apparente donnée. Retourne `null` pour un objet
 * ponctuel : il n'a pas de brillance de surface exploitable, et le verdict se joue alors
 * sur la seule magnitude intégrée.
 */
export function seuilContraste(tailleApparenteArcmin: number): number | null {
  if (!Number.isFinite(tailleApparenteArcmin)) return null
  if (tailleApparenteArcmin < TAILLE_PONCTUELLE_ARCMIN) return null
  if (tailleApparenteArcmin >= PLATEAU.tailleArcmin) return PLATEAU.seuilDeltaSb

  for (let i = 0; i < TABLE_CONTRASTE.length - 1; i++) {
    const basse = TABLE_CONTRASTE[i]!
    const haute = TABLE_CONTRASTE[i + 1]!
    if (tailleApparenteArcmin <= haute.tailleArcmin) {
      const fraction =
        (tailleApparenteArcmin - basse.tailleArcmin) / (haute.tailleArcmin - basse.tailleArcmin)
      return basse.seuilDeltaSb + fraction * (haute.seuilDeltaSb - basse.seuilDeltaSb)
    }
  }
  return PLATEAU.seuilDeltaSb
}
