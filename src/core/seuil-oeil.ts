/**
 * §3.3, T-0357 — naked-eye limiting magnitude under a sky BRIGHTER than Bortle 9: twilight.
 * Bortle table stops at 18 mag/arcsec², `mLimOeilBorne` clamps at its edge, magnitude 4. Right
 * just under full Moon, wrong at twilight: Sun barely set, background off-table, hundreds of
 * stars popped in at once. Schaefer (1990) threshold covers the whole eye domain, night → full day.
 * Doesn't replace the table: under dark sky its magnitudes are more pessimistic than Bortle. Used
 * only beyond the bright edge, RECALIBRATED on it (≈ −0.2 mag): limit continuous as sky leaves
 * the table.
 */

import { K } from '../registry/constants.ts'
import { M_LIM_OEIL_PLANCHER, SB_PLAFOND_TABLE } from '../registry/bortle.ts'
import { nanolamberts } from './moon.ts'

/** 10^x: Schaefer coefficients are published as decimal logarithms. */
function puissanceDeDix(x: number): number {
  return Math.exp(x * Math.LN10)
}

/** Raw Schaefer (1990): magnitude of faintest point detectable on this background. */
export function mLimSchaefer(sbMag: number): number {
  const fondNl = nanolamberts(sbMag)
  const diurne = fondNl > K('SCHAEFER_BASCULE_PHOTOPIQUE_NL')
  const c1 = puissanceDeDix(K(diurne ? 'SCHAEFER_LOG_C1_PHOTOPIQUE' : 'SCHAEFER_LOG_C1_SCOTOPIQUE'))
  const c2 = puissanceDeDix(K(diurne ? 'SCHAEFER_LOG_C2_PHOTOPIQUE' : 'SCHAEFER_LOG_C2_SCOTOPIQUE'))
  const seuil = c1 * (1 + Math.sqrt(c2 * fondNl)) ** 2
  return K('SCHAEFER_ZERO_MAG') - K('POGSON') * Math.log10(seuil)
}

const RACCORD_MAG = M_LIM_OEIL_PLANCHER - mLimSchaefer(SB_PLAFOND_TABLE)

/** Limiting magnitude under background brighter than Bortle table, continuous at its edge. */
export function mLimOeilCielClair(sbMag: number): number {
  return mLimSchaefer(sbMag) + RACCORD_MAG
}
