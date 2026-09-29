/**
 * T-0353 — la Lune du planétarium : limbe éclairé tourné vers le Soleil à l'écran, terminateur
 * tiré de l'angle de phase.
 */
import { describe, expect, it } from 'vitest'
import { IDENTITE, versVecteur } from '../src/core/mat3.ts'
import { projecteur, type Vue } from '../src/core/projection.ts'
import { palette } from '../src/ui/couleurs.ts'
import { angleLimbeEclaireRad, dessineLune, rayonLunePx } from '../src/ui/dessine-lune.ts'
import { RAYON_LUNE_PX } from '../src/ui/libelles-cibles.ts'

const VUE: Vue = {
  mode: 'MODE_PLANETARIUM',
  fovDeg: 60,
  largeurPx: 960,
  hauteurPx: 540,
  azimutDeg: 180,
  hauteurDeg: 45,
  rotationDeg: 0,
}

describe('angleLimbeEclaireRad', () => {
  // Matrice identité : les vecteurs sont déjà horizontaux, la Lune est au centre de la vue.
  const proj = projecteur(VUE, IDENTITE)
  const lune = versVecteur(VUE.azimutDeg, VUE.hauteurDeg)
  const centre = proj.projette(lune)!

  it('regarde vers le bas quand le Soleil est plus bas dans le même azimut', () => {
    const angle = angleLimbeEclaireRad(proj, lune, versVecteur(VUE.azimutDeg, -20), centre)!
    expect(Math.sin(angle)).toBeGreaterThan(Math.abs(Math.cos(angle)))
  })

  it('tourne avec le Soleil : même hauteur, deux azimuts opposés, deux côtés opposés', () => {
    const est = angleLimbeEclaireRad(proj, lune, versVecteur(VUE.azimutDeg - 60, 45), centre)!
    const ouest = angleLimbeEclaireRad(proj, lune, versVecteur(VUE.azimutDeg + 60, 45), centre)!
    expect(Math.sign(Math.cos(est))).toBe(-Math.sign(Math.cos(ouest)))
  })
})

describe('dessineLune', () => {
  function terminateur(anglePhaseDeg: number) {
    const appels: { rx: number; antihoraire: boolean }[] = []
    const ctx = new Proxy(
      {
        ellipse: (_x: number, _y: number, rx: number, ..._r: unknown[]) =>
          appels.push({ rx, antihoraire: _r[4] === true }),
      },
      { get: (cible, cle) => (cle in cible ? cible[cle as 'ellipse'] : () => undefined), set: () => true },
    ) as unknown as CanvasRenderingContext2D
    dessineLune(ctx, { xPx: 0, yPx: 0 }, RAYON_LUNE_PX, 0, anglePhaseDeg, palette(false))
    return appels[0]!
  }

  it('pleine Lune : le terminateur épouse le bord opposé', () => {
    const t = terminateur(0)
    expect(t.rx).toBeCloseTo(RAYON_LUNE_PX)
    expect(t.antihoraire).toBe(false)
  })

  it('premier quartier : le terminateur est un diamètre', () => {
    expect(terminateur(90).rx).toBeCloseTo(0)
  })

  it('croissant : le terminateur se creuse du côté éclairé', () => {
    const t = terminateur(135)
    expect(t.rx).toBeCloseTo(RAYON_LUNE_PX * Math.SQRT1_2)
    expect(t.antihoraire).toBe(true)
  })
})

describe('rayonLunePx', () => {
  const lune = versVecteur(VUE.azimutDeg, VUE.hauteurDeg)
  const rayon = (fovDeg: number, demiDiametreDeg: number | null): number => {
    const proj = projecteur({ ...VUE, fovDeg }, IDENTITE)
    return rayonLunePx(proj, lune, proj.projette(lune)!, demiDiametreDeg)
  }
  // Un demi-diamètre quelconque : le test vérifie la projection, pas l'éphéméride.
  const DEMI_DIAMETRE_DEG = 0.25

  it('garde le disque lisible au champ large', () => {
    expect(rayon(VUE.fovDeg, DEMI_DIAMETRE_DEG)).toBe(RAYON_LUNE_PX)
    expect(rayon(VUE.fovDeg, null)).toBe(RAYON_LUNE_PX)
  })

  it('prend la taille réelle du disque une fois zoomé', () => {
    const fovDeg = 1
    const r = rayon(fovDeg, DEMI_DIAMETRE_DEG)
    expect(r).toBeGreaterThan(RAYON_LUNE_PX)
    // Au centre d'un champ étroit, l'échelle est celle du champ : ½ ° sur 1 ° ≈ demi-largeur.
    expect(r).toBeCloseTo((VUE.largeurPx * DEMI_DIAMETRE_DEG) / fovDeg, -1)
    expect(rayon(fovDeg, 2 * DEMI_DIAMETRE_DEG) / r).toBeCloseTo(2, 1)
  })
})
