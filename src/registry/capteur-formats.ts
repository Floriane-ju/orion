/**
 * §5.1 — Table des formats de capteur usuels, pour le mode boîtier `custom`.
 *
 * Un débutant lit le type de capteur et la résolution sur la fiche produit, jamais le pitch en
 * micromètres ni les dimensions exactes du capteur en millimètres. Cette table fournit les
 * dimensions par format — documentation constructeur, aucune marque de boîtier ni prix
 * commercial — et `pitchDepuisFormat` déduit le pitch de la résolution déclarée : voir
 * `resoutBoitier` dans `equipment.ts`.
 */

export type FormatCapteur = 'PLEIN_FORMAT' | 'APSC_NIKON' | 'APSC_CANON' | 'MICRO_4_3' | 'MOYEN_FORMAT'

export interface LigneFormatCapteur {
  readonly format: FormatCapteur
  readonly libelle: string
  readonly capteurLMm: number
  readonly capteurHMm: number
  readonly source: string
}

export const TABLE_FORMATS_CAPTEUR: readonly LigneFormatCapteur[] = Object.freeze(
  [
    {
      format: 'PLEIN_FORMAT',
      libelle: 'Plein format — 35,9 × 23,9 mm',
      capteurLMm: 35.9,
      capteurHMm: 23.9,
      source: 'PRD Annexe A — même valeur que le boîtier de référence',
    },
    {
      format: 'APSC_NIKON',
      // T-0264 — les quatre marques ont quitté l'intitulé : il demandait 450 px là où un
      // `<select>` fermé en offre 276, et rien n'y signalait la coupure. Elles sont dans la
      // glose de `format_capteur`, où la question « lequel est le mien ? » se pose vraiment.
      libelle: 'APS-C — 23,5 × 15,6 mm',
      capteurLMm: 23.5,
      capteurHMm: 15.6,
      source: 'documentation constructeur — même valeur que le recadrage APS-C de référence',
    },
    {
      format: 'APSC_CANON',
      libelle: 'APS-C Canon — 22,3 × 14,9 mm',
      capteurLMm: 22.3,
      capteurHMm: 14.9,
      source: 'documentation constructeur Canon — facteur de recadrage ×1,6',
    },
    {
      format: 'MICRO_4_3',
      libelle: 'Micro 4/3 — 17,3 × 13,0 mm',
      capteurLMm: 17.3,
      capteurHMm: 13.0,
      source: 'standard Four Thirds — spécification Olympus/Panasonic',
    },
    {
      format: 'MOYEN_FORMAT',
      libelle: 'Moyen format — 43,8 × 32,9 mm',
      capteurLMm: 43.8,
      capteurHMm: 32.9,
      source: 'documentation constructeur — capteur moyen format 33×44 (Fujifilm GFX, Hasselblad X)',
    },
  ].map(Object.freeze) as LigneFormatCapteur[],
)

/** T-0343 — la garde des frontières : une chaîne venue d'un fichier ou d'un `<select>`. */
export function estFormatCapteur(valeur: string): valeur is FormatCapteur {
  return TABLE_FORMATS_CAPTEUR.some((l) => l.format === valeur)
}

/**
 * La ligne d'un format. Plus de repli silencieux sur le plein format : un format inconnu est
 * refusé aux frontières (`estFormatCapteur`), et le typage garantit qu'il n'arrive pas ici.
 */
export function ligneFormatCapteur(format: FormatCapteur): LigneFormatCapteur {
  const ligne = TABLE_FORMATS_CAPTEUR.find((l) => l.format === format)
  if (ligne === undefined) throw new Error(`Format de capteur inconnu : ${String(format)}`)
  return ligne
}

/**
 * Le pitch se déduit géométriquement : la résolution totale et le ratio du format donnent la
 * largeur en pixels, et la largeur du capteur en mm rapportée à cette largeur donne le pitch.
 * Aucune constante de ratio séparée n'est nécessaire, le format la porte déjà.
 */
export function pitchDepuisFormat(ligne: LigneFormatCapteur, resolutionMpx: number): number {
  const ratio = ligne.capteurLMm / ligne.capteurHMm
  const resolutionLPx = Math.sqrt(resolutionMpx * 1_000_000 * ratio)
  return (ligne.capteurLMm * 1000) / resolutionLPx
}
