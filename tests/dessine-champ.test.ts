/**
 * T-0402 — §9.3 : une trace filée a la largeur d'une tache stellaire et une teinte désaturée.
 *
 * Aucune largeur ni couleur recopiée : le test contrôle des RELATIONS — la largeur reste dans
 * l'encadrement du registre et ne suit plus le diamètre du disque, la teinte d'une étoile
 * s'approche du blanc sans s'y confondre.
 */

import { describe, expect, it } from 'vitest'
import { avanceeVersFil, cordesPourArc, largeurTracePx } from '../src/ui/dessine-champ.ts'
import { couleurTeinte, TEINTES } from '../src/ui/couleurs.ts'
import { rayonEtoilePx } from '../src/core/projection.ts'
import { K } from '../src/registry/constants.ts'

const canaux = (rgb: string): number[] => rgb.match(/\d+/g)!.slice(0, 3).map(Number)
const etendue = (rgb: string): number => Math.max(...canaux(rgb)) - Math.min(...canaux(rgb))

describe('largeur d’une trace filée', () => {
  it('reste dans l’encadrement du registre, même pour l’étoile la plus brillante', () => {
    const brillante = rayonEtoilePx(K('MAG_REFERENCE_RAYON') - 2)
    expect(2 * brillante).toBeGreaterThan(K('LARGEUR_TRACE_MAX_PX'))
    expect(largeurTracePx(brillante)).toBe(K('LARGEUR_TRACE_MAX_PX'))
    expect(largeurTracePx(rayonEtoilePx(K('SEUIL_MAG_ETOILES_REELLES')))).toBeGreaterThanOrEqual(
      K('LARGEUR_TRACE_MIN_PX'),
    )
  })

  it('croît avec l’éclat sans jamais décroître', () => {
    const largeurs = Array.from({ length: 12 }, (_, i) => largeurTracePx(rayonEtoilePx(8 - i)))
    largeurs.slice(1).forEach((l, i) => expect(l).toBeGreaterThanOrEqual(largeurs[i]!))
    expect(largeurs.at(-1)!).toBeGreaterThan(largeurs[0]!)
  })
})

describe('passage du disque au fil', () => {
  const rayon = rayonEtoilePx(K('MAG_REFERENCE_RAYON'))
  const fondu = rayon * K('LONGUEUR_FONDU_TRACE_RAYONS')

  it('part du disque au seuil, sans saut', () => {
    expect(avanceeVersFil(rayon, rayon)).toBe(0)
  })

  it('n’atteint le fil qu’au bout du fondu', () => {
    expect(avanceeVersFil(rayon + fondu / 2, rayon)).toBeCloseTo(1 / 2)
    expect(avanceeVersFil(rayon + fondu, rayon)).toBe(1)
    expect(avanceeVersFil(rayon + 2 * fondu, rayon)).toBe(1)
  })
})

describe('arc de grand rayon tracé en cordes', () => {
  it('chaque corde reste à moins de la flèche tolérée de son arc', () => {
    for (const rayon of [K('RAYON_ARC_NATIF_MAX_PX'), 1e5, 1e7]) {
      for (const balayage of [1e-6, 1e-3, -0.05]) {
        const n = cordesPourArc(rayon, balayage)
        const demiAngle = Math.abs(balayage) / n / 2
        expect(rayon * (1 - Math.cos(demiAngle))).toBeLessThanOrEqual(K('FLECHE_MAX_CORDE_PX') * (1 + 1e-6))
      }
    }
  })

  it('un arc court reste une seule corde', () => {
    expect(cordesPourArc(1e6, 1e-6)).toBe(1)
  })
})

describe('teinte d’une étoile', () => {
  it('se rapproche du blanc sans perdre sa couleur', () => {
    for (const i of [0, TEINTES - 1]) {
      const couleur = couleurTeinte(i, false)
      canaux(couleur).forEach((c) =>
        expect(255 - c).toBeLessThanOrEqual(Math.ceil(255 * (1 - K('DESATURATION_ETOILE')))),
      )
      expect(etendue(couleur)).toBeGreaterThan(0)
    }
  })

  it('en mode nuit, reste sur le seul canal rouge', () => {
    const [, v, b] = canaux(couleurTeinte(0, true))
    expect([v, b]).toEqual([0, 0])
  })
})
