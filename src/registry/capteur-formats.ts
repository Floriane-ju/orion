/**
 * §5.1 — Common sensor-format table for `custom` body mode.
 * Beginners read sensor type + resolution on the product sheet, never pitch in µm or exact mm.
 * Table gives dimensions per format (manufacturer docs, no body brand/price);
 * `pitchDepuisFormat` derives pitch from declared resolution: see `resoutBoitier` in
 * `equipment.ts`.
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
      // T-0264 — 4 brands left the label: it asked 450 px, closed `<select>` offers 276, cut
      // unsigned. They're in `format_capteur` gloss, where « which is mine? » is asked.
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

/** T-0343 — boundary guard: string from a file or a `<select>`. */
export function estFormatCapteur(valeur: string): valeur is FormatCapteur {
  return TABLE_FORMATS_CAPTEUR.some((l) => l.format === valeur)
}

/**
 * A format's row. No silent fallback to plein format: unknown format refused at boundaries
 * (`estFormatCapteur`), typing guarantees it never arrives here.
 */
export function ligneFormatCapteur(format: FormatCapteur): LigneFormatCapteur {
  const ligne = TABLE_FORMATS_CAPTEUR.find((l) => l.format === format)
  if (ligne === undefined) throw new Error(`Format de capteur inconnu : ${String(format)}`)
  return ligne
}

/**
 * Pitch derived geometrically: total resolution + format ratio → width in px; sensor mm width
 * over it → pitch. No separate ratio constant: format carries it.
 */
export function pitchDepuisFormat(ligne: LigneFormatCapteur, resolutionMpx: number): number {
  const ratio = ligne.capteurLMm / ligne.capteurHMm
  const resolutionLPx = Math.sqrt(resolutionMpx * 1_000_000 * ratio)
  return (ligne.capteurLMm * 1000) / resolutionLPx
}
