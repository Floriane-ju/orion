/**
 * §4.1 — l'édition du masque d'horizon telle qu'elle arrive à l'écran.
 *
 * Le rendu statique suffit : ce qui est vérifié, c'est que les relevés saisis remplacent
 * l'hypothèse plate et qu'ils restent effaçables un par un, pas une apparence.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MasqueHorizonSaisie } from '../src/ui/MasqueHorizon.tsx'
import { repereCardinal } from '../src/core/site.ts'
import { masqueDepuisPoints, masquePlat, type PointMasque } from '../src/core/site.ts'
import { libelleFlag } from '../src/registry/libelles.ts'

const RELEVES: readonly PointMasque[] = [
  { azimutDeg: 150, altitudeDeg: 22 },
  { azimutDeg: 210, altitudeDeg: 22 },
]

function ecran(points: readonly PointMasque[]): string {
  return renderToStaticMarkup(
    <MasqueHorizonSaisie
      points={points}
      surPoints={() => undefined}
      masque={points.length === 0 ? masquePlat() : masqueDepuisPoints(points)}
    />,
  )
}

describe('saisie du masque d’horizon §4.1', () => {
  it('affiche le masque plat comme une hypothèse tant que rien n’est relevé', () => {
    const rendu = ecran([])
    expect(rendu).toContain(libelleFlag('HYP'))
    expect(rendu).toContain('horizon plat')
    // Rien à effacer : la liste des relevés n'existe pas encore.
    expect(rendu).not.toContain('Effacer le relevé')
  })

  it('remplace l’hypothèse par les relevés saisis, chacun effaçable', () => {
    const rendu = ecran(RELEVES)
    expect(rendu).not.toContain(libelleFlag('HYP'))
    expect(rendu).toContain('150°')
    expect(rendu).toContain('22°')
    expect(rendu).toContain('Effacer le relevé de l’azimut 150')
    expect(rendu).toContain('Effacer le relevé de l’azimut 210')
    expect(rendu).toContain('Tout effacer')
  })

  it('offre les deux champs du couple azimut → hauteur d’obstruction', () => {
    const rendu = ecran([])
    expect(rendu).toContain('Azimut du relevé')
    expect(rendu).toContain('Hauteur d’obstruction')
    expect(rendu).toContain('Relever')
  })

  it('repère l’azimut par son point cardinal, compté depuis le nord', () => {
    expect(repereCardinal(0)).toBe('N')
    expect(repereCardinal(90)).toBe('E')
    expect(repereCardinal(180)).toBe('S')
    expect(repereCardinal(270)).toBe('O')
    expect(repereCardinal(350)).toBe('N')
  })
})
