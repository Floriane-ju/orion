/**
 * §5.1 — Equipment base: camera bodies picked from a list.
 * Base = `boitiers.md`, markdown table read as is: hand-editable, no TS to add a body, no
 * generated artifact able to drift.
 * A row projects onto `SaisieBoitier`, so `resoutBoitier` resolves it like any input (format →
 * dimensions, resolution → pitch, registry bounds/fallbacks): no validation rewritten, a badly
 * filled base is refused like a badly typed input.
 */

import source from './boitiers.md?raw'
import { resoutBoitier, type Boitier, type SaisieBoitier } from './equipment.ts'
import { valide } from '../registry/domains.ts'
import { estFormatCapteur } from '../registry/capteur-formats.ts'

export interface LigneBoitier {
  readonly id: string
  readonly libelle: string
  readonly marque: string
  readonly saisie: SaisieBoitier
  /** Full read-noise curve per ISO; empty when base lacks it. */
  readonly readNoiseE: Readonly<Record<number, number>>
  readonly source: string
}

/** Table column order; reader refuses a row with fewer. */
const COLONNES = 10

/**
 * Table rows: lines starting with `|`, minus header and its rule. File also holds a column
 * documentation table; header `| id |` marks base start and separates the two.
 */
function lignes(texte: string): readonly (readonly string[])[] {
  const debut = texte.indexOf('\n| id |')
  const table = debut === -1 ? '' : texte.slice(debut)
  return table
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.slice(1, l.lastIndexOf('|')).split('|').map((c) => c.trim()))
    .filter((c) => c.length === COLONNES && c[0] !== 'id' && !c[0]!.startsWith('---'))
}

/** `ISO:valeur` space-separated; each value passes registry bound. */
function courbeReadNoise(cellule: string): Readonly<Record<number, number>> {
  const points: Record<number, number> = {}
  for (const point of cellule.split(/\s+/).filter((p) => p !== '')) {
    const [iso, e] = point.split(':')
    points[valide('iso_capture', Number(iso))] = valide('read_noise_e', Number(e))
  }
  return Object.freeze(points)
}

function ligneBoitierDepuis(cellules: readonly string[]): LigneBoitier {
  // Saturation capacity: base column, read by no computation, absent from input.
  const [id, libelle, formatCapteur, resolutionMpx, tailleRawMo, seuilDoubleGainIso, courbe, , zpSys, src] =
    cellules as [string, string, string, string, string, string, string, string, string, string]
  const readNoiseE = courbeReadNoise(courbe)
  // T-0343 — base is a file: misspelled format used to become plein format.
  if (!estFormatCapteur(formatCapteur)) {
    throw new Error(`Base boîtiers, ligne ${id} : format de capteur inconnu « ${formatCapteur} ».`)
  }
  return Object.freeze({
    id,
    libelle,
    // Brand (selector group) = first word of model, no extra column.
    marque: libelle.split(' ')[0]!,
    saisie: Object.freeze({
      formatCapteur,
      resolutionMpx,
      // Input carries one read noise, full curve alongside; this one serves return to custom
      // mode (single field).
      readNoiseE: String(readNoiseE[Number(seuilDoubleGainIso)] ?? ''),
      seuilDoubleGainIso,
      zpSys,
      tailleRawMo,
    }),
    readNoiseE,
    source: src,
  })
}

export const BASE_BOITIERS: readonly LigneBoitier[] = Object.freeze(
  lignes(source).map(ligneBoitierDepuis),
)

export function ligneBoitier(id: string): LigneBoitier | null {
  return BASE_BOITIERS.find((l) => l.id === id) ?? null
}

/**
 * Resolved body of a base row. Same path as manual input, but read-noise curve complete: ISO
 * forced outside recommended tier keeps true value, not registry generic (gap up to ×3 on pose,
 * far beyond useful-range absorption).
 * T-0205 — `tailleRawMo` = only per-row user override: current RAW setting
 * (compressed/lossless/uncompressed), not sensor; varies per shot.
 */
export function boitierDeBase(ligne: LigneBoitier, tailleRawMo?: string): Boitier {
  const saisie =
    tailleRawMo === undefined ? ligne.saisie : { ...ligne.saisie, tailleRawMo }
  return resoutBoitier(saisie, {
    id: ligne.id,
    libelle: ligne.libelle,
    source: ligne.source,
    readNoiseE: ligne.readNoiseE,
  })
}
