/**
 * T-0372 — du coucher à la nuit, le ciel peint ne fait que s'assombrir.
 *
 * Deux défauts vus à l'écran : le zénith restait au plafond de luminance du jour jusqu'à 8,5°
 * de dépression (adaptation complète de l'œil), et la teinte glissait vers celle de la nuit
 * pendant que la luminance restait au plafond — un voile blanc naissait vers 8°, puis
 * s'effaçait. Le test suit la luminance relative de plusieurs directions, Soleil descendant.
 */
import { describe, expect, it } from 'vitest'
import {
  brillanceSoleilZenithNl,
  composantesCielSoleil,
  eclairageSoleil,
  sbZenithAvecCrepuscule,
} from '../src/core/fond-ciel-rendu.ts'
import { nanolamberts } from '../src/core/moon.ts'
import { DEG } from '../src/core/mat3.ts'
import { luminanceRelative } from '../src/ui/couleurs.ts'
import { interpoleBortle } from '../src/registry/bortle.ts'
import { K } from '../src/registry/constants.ts'

const SB_SITE = interpoleBortle(4).sb
const PAS_DEG = 0.25
const FIN_ASTRONOMIQUE_DEG = -K('HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG')
const FIN_CIVIL_DEG = -K('HAUTEUR_CREPUSCULE_CIVIL_DEG')

/** Directions (hauteur, azimut) ; le Soleil est à l'azimut 0. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [90, 0],
  [45, 90],
  [30, 180],
  [5, 0],
  [5, 90],
  [5, 180],
]

function luminance(depressionDeg: number, hauteurDeg: number, azimutDeg: number): number {
  const sb = sbZenithAvecCrepuscule(SB_SITE, depressionDeg)
  const bFond = Math.max(0, nanolamberts(sb) - brillanceSoleilZenithNl(depressionDeg))
  const e = eclairageSoleil(-depressionDeg, bFond, sb)
  const hs = -depressionDeg * DEG
  const h = hauteurDeg * DEG
  const cosRho =
    Math.sin(h) * Math.sin(hs) + Math.cos(h) * Math.cos(hs) * Math.cos(azimutDeg * DEG)
  const rho = Math.acos(Math.min(1, Math.max(-1, cosRho))) / DEG
  const c = composantesCielSoleil(e, hauteurDeg, rho)
  return luminanceRelative([c[0], c[1], c[2]])
}

describe('transition vers la nuit', () => {
  it.each(DIRECTIONS)(
    'à h = %s°, az = %s°, le ciel ne s’éclaircit jamais quand le Soleil descend',
    (h, az) => {
      let precedente = luminance(0, h, az)
      for (let d = PAS_DEG; d <= FIN_ASTRONOMIQUE_DEG; d += PAS_DEG) {
        const ici = luminance(d, h, az)
        expect(ici, `dépression ${d}°`).toBeLessThanOrEqual(precedente * (1 + 1e-9))
        precedente = ici
      }
    },
  )

  it('le zénith de fin de crépuscule civil est plus sombre qu’au coucher', () => {
    expect(luminance(FIN_CIVIL_DEG, 90, 0)).toBeLessThan(luminance(0, 90, 0))
  })
})
