/**
 * §9.1 — pose max for point stars, per sky region.
 * No single pose max, one per declination. Grand champ spans tens of degrees of declination →
 * output = map; retained value = most constraining zone (lowest |dec|).
 * Grid = hardware frame, projected by same inverse as §3.5 (lens: gnomonic or equidistant,
 * T-0219): cell declination computed, not interpolated.
 */

import { K } from '../registry/constants.ts'
import { degres } from '../registry/ecriture.ts'
import { DEG, angleDeSinDeg, applique, transpose } from './mat3.ts'
import { directionDuPlan, matriceVue, rayonProjete, type ModeProjection } from './projection.ts'
import { npf, type ToleranceNpf } from './suivi.ts'
import { trace, type Traced } from './traced.ts'
import { QUART_TOUR_DEG as POLE_DEG } from './unites.ts'

export interface EntreeCartePose {
  readonly focaleMm: number
  readonly ouvertureN: number
  readonly pitchUm: number
  /** Hardware frame fields (§5.1), long then short dimension. */
  readonly fovLDeg: number
  readonly fovHDeg: number
  /** Lens projection: `MODE_CADRE` (rectilinear) or `MODE_FISHEYE`. */
  readonly modeObjectif: ModeProjection
  readonly centreAdDeg: number
  readonly centreDecDeg: number
  readonly rotationDeg: number
  readonly tolerance?: ToleranceNpf
  /** §5.2 — set when suivi active: operating pose stops being NPF. */
  readonly tMaxSuiviS?: number | null
}

export interface CellulePose {
  /** Frame position, −1 (left, bottom) → +1 (right, top). */
  readonly uFrac: number
  readonly vFrac: number
  readonly decDeg: number
  /** `null` at exact pole: NPF diverges, stops constraining. */
  readonly tNpfS: number | null
}

export type RegimeGrandChamp = 'NPF' | 'SUIVI'

export interface CartePoseMax {
  readonly cellules: readonly CellulePose[]
  /** Grid side; cells row by row, top to bottom. */
  readonly cote: number
  readonly tMaxCadreS: Traced<number | null>
  readonly zoneLimitante: string
  readonly decMinAbsDeg: number
  readonly decMaxAbsDeg: number
  /** Operating pose: NPF without suivi, mount ceiling with (§5.2). */
  readonly poseOperanteS: number | null
  readonly regime: RegimeGrandChamp
  readonly messages: readonly string[]
}

/** Cell pose for comparison: at exact pole NPF bounds nothing. */
function pose(tNpfS: number | null): number {
  return tNpfS ?? Infinity
}

function nommeZone(uFrac: number, vFrac: number, decDeg: number): string {
  const vertical = vFrac > 0 ? 'bord haut' : vFrac < 0 ? 'bord bas' : 'milieu'
  const horizontal = uFrac > 0 ? 'à droite' : uFrac < 0 ? 'à gauche' : 'au centre'
  return `${vertical} ${horizontal}, δ = ${degres(decDeg, 0)}`
}

/** Frame pose-max map; each cell's real declination via lens-projection inverse (§3.5). */
export function cartePoseMax(entree: EntreeCartePose): CartePoseMax {
  const cote = Math.max(1, Math.round(K('CELLULES_CARTE_POSE')))
  const uMax = rayonProjete(entree.modeObjectif, (entree.fovLDeg / 2) * DEG)
  const vMax = rayonProjete(entree.modeObjectif, (entree.fovHDeg / 2) * DEG)
  const versEquatorial = transpose(
    matriceVue(entree.centreAdDeg, entree.centreDecDeg, entree.rotationDeg),
  )

  const cellules: CellulePose[] = []
  let limitante: CellulePose | null = null
  let plusLongue: CellulePose | null = null
  let decMinAbs = POLE_DEG
  let decMaxAbs = 0

  for (let ligne = 0; ligne < cote; ligne++) {
    // Row 0 = frame top: v decreases as row grows.
    const vFrac = cote === 1 ? 0 : 1 - (2 * ligne) / (cote - 1)
    for (let colonne = 0; colonne < cote; colonne++) {
      const uFrac = cote === 1 ? 0 : (2 * colonne) / (cote - 1) - 1
      const u = uFrac * uMax
      const v = vFrac * vMax
      const local = directionDuPlan(entree.modeObjectif, u, v)
      const equatorial = applique(versEquatorial, local)
      const decDeg =
        angleDeSinDeg(equatorial.z)
      const tNpfS = npf({
        focaleMm: entree.focaleMm,
        ouvertureN: entree.ouvertureN,
        pitchUm: entree.pitchUm,
        decDeg,
        ...(entree.tolerance === undefined ? {} : { tolerance: entree.tolerance }),
      }).value
      const cellule: CellulePose = { uFrac, vFrac, decDeg, tNpfS }
      cellules.push(cellule)

      const absolue = Math.abs(decDeg)
      if (absolue < decMinAbs) decMinAbs = absolue
      if (absolue > decMaxAbs) decMaxAbs = absolue
      if (tNpfS !== null && (limitante === null || tNpfS < (limitante.tNpfS ?? Infinity))) {
        limitante = cellule
      }
      // Exact pole (no NPF) holds longest poses: its cell beats all others.
      if (plusLongue === null || pose(tNpfS) > pose(plusLongue.tNpfS)) plusLongue = cellule
    }
  }

  const zone = limitante as CellulePose | null
  const tMaxCadreS = trace({
    value: zone === null ? null : zone.tNpfS,
    formula: 'POSE_MAX_CADRE',
    inputs: {
      dec_min_abs_deg: decMinAbs,
      focale_mm: entree.focaleMm,
      ouverture_N: entree.ouvertureN,
      pitch_um: entree.pitchUm,
    },
    constants: [
      'NPF_COEF_OUVERTURE',
      'NPF_COEF_PITCH',
      entree.tolerance === 'TOLERANT' ? 'NPF_K_TOLERANT' : 'NPF_K_STRICT',
    ],
    ...(zone === null
      ? {
          flags: ['HORS_DOMAINE' as const],
          note:
            'Cadre centré sur le pôle : les étoiles n’y filent pas.',
        }
      : {}),
  })

  const suiviActif = entree.tMaxSuiviS !== undefined && entree.tMaxSuiviS !== null
  const regime: RegimeGrandChamp = suiviActif ? 'SUIVI' : 'NPF'
  const poseOperanteS = suiviActif ? entree.tMaxSuiviS! : (zone?.tNpfS ?? null)

  const messages: string[] = []
  const longue = plusLongue
  // Warning targets most polar zone (NPF stops constraining), whatever the rest of the frame.
  if (longue !== null && pose(longue.tNpfS) >= K('POSE_LONGUE_AVERTISSEMENT_S')) {
    const global = zone === null || zone.tNpfS! >= K('POSE_LONGUE_AVERTISSEMENT_S')
    messages.push(
      `${global ? 'Sur tout le cadre' : 'Près du pôle'}, plus de ` +
        `${K('POSE_LONGUE_AVERTISSEMENT_S')} s possibles : c’est le bruit et le ciel qui limitent ` +
        'la pose, plus le filé.',
    )
  }
  if (suiviActif) {
    messages.push(
      'Avec suivi, c’est la monture qui limite la pose, pas la rotation du ciel.',
    )
  }

  return {
    cellules,
    cote,
    tMaxCadreS,
    zoneLimitante: zone === null ? 'aucune : cadre centré sur le pôle' : nommeZone(zone.uFrac, zone.vFrac, zone.decDeg),
    decMinAbsDeg: decMinAbs,
    decMaxAbsDeg: decMaxAbs,
    poseOperanteS,
    regime,
    messages,
  }
}

/** §9.1 — trail recorded on sensor for a pose; ovalizes §9.2 preview stars beyond pose max. */
export function traceePx(tPoseS: number, decDeg: number, echApx: number): Traced<number> {
  // 1 °/h = 1 arcsec/s: rotation in arcsec per pose second, no conversion.
  const traceArcsec = K('ROTATION_CIEL_DEG_H') * tPoseS * Math.cos(decDeg * DEG)
  return trace({
    value: traceArcsec / echApx,
    formula: 'TRACE',
    inputs: { t_pose_s: tPoseS, dec_deg: decDeg, ech_apx: echApx },
    constants: ['ROTATION_CIEL_DEG_H'],
  })
}
