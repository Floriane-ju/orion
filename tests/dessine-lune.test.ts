/**
 * T-0353 — la Lune du planétarium : limbe éclairé tourné vers le Soleil à l'écran, terminateur
 * tiré de l'angle de phase.
 */
import { describe, expect, it } from 'vitest'
import { IDENTITE, versVecteur } from '../src/core/mat3.ts'
import { projecteur, type Vue } from '../src/core/projection.ts'
import { palette } from '../src/ui/couleurs.ts'
import {
  angleLimbeEclaireRad,
  dessineLune,
  dessineTrajetLune,
  rayonLunePx,
} from '../src/ui/dessine-lune.ts'
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

describe('dessineTrajetLune', () => {
  function trace(points: readonly ReturnType<typeof versVecteur>[], filtre = (_z: number) => true) {
    const brut = projecteur(VUE, IDENTITE)
    const proj = {
      ...brut,
      projetteEn: (x: number, y: number, z: number, out: Parameters<typeof brut.projetteEn>[3]) =>
        filtre(z) && brut.projetteEn(x, y, z, out),
    }
    const appels: { nom: string; lineWidth?: number; strokeStyle?: unknown }[] = []
    const etat: Record<string, unknown> = {}
    const ctx = new Proxy(etat, {
      get: (_c, cle) =>
        cle in etat
          ? etat[cle as string]
          : (..._a: unknown[]) =>
              appels.push({
                nom: String(cle),
                lineWidth: etat['lineWidth'] as number,
                strokeStyle: etat['strokeStyle'],
              }),
      set: (_c, cle, v) => {
        etat[cle as string] = v
        return true
      },
    }) as unknown as CanvasRenderingContext2D
    const longueur = dessineTrajetLune(ctx, proj, points, RAYON_LUNE_PX, 'blanc')
    return { appels, longueur, etat }
  }
  const pas = [170, 175, 180, 185, 190].map((az) => versVecteur(az, VUE.hauteurDeg))

  it('trace une bande large du diamètre, dans la teinte de la Lune', () => {
    const { appels, longueur, etat } = trace(pas)
    const stroke = appels.find((a) => a.nom === 'stroke')!
    expect(stroke.lineWidth).toBe(2 * RAYON_LUNE_PX)
    expect(stroke.strokeStyle).toBe('blanc')
    expect(longueur).toBeGreaterThan(RAYON_LUNE_PX)
    // Rendu au trait fin pour les passes suivantes.
    expect(etat['lineWidth']).toBe(1)
    expect(etat['lineCap']).toBe('butt')
  })

  it('se coupe là où un point ne se projette pas (sous le sol)', () => {
    const bas = versVecteur(180, -30)
    const points = [pas[0]!, pas[1]!, bas, pas[3]!, pas[4]!]
    const { appels } = trace(points, (z) => z > 0)
    expect(appels.filter((a) => a.nom === 'moveTo')).toHaveLength(2)
  })

  it('un seul point : longueur nulle', () => {
    expect(trace([pas[0]!]).longueur).toBe(0)
  })
})
