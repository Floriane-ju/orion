/**
 * T-0030 — touchpad pinch zooms continuously, wheel keeps its notch.
 * DOM wiring (non-passive `wheel` listener, Safari `gesture*`) untestable outside a browser; here
 * the one calculation rule: where the field factor comes from, why notch ≠ gesture.
 */

import { describe, expect, it } from 'vitest'
import {
  facteurZoom,
  roulisApresGlisser,
  signaturePave,
  sourceMolette,
} from '../src/ui/Planetarium.tsx'
import { champPourCadrer } from '../src/ui/planetarium-gestes.ts'
import { K } from '../src/registry/constants.ts'

describe('facteur de zoom — un cran de molette, un geste continu', () => {
  it('garde le cran fixe de la molette, dans les deux sens', () => {
    const avant = facteurZoom(-120, false)
    const arriere = facteurZoom(120, false)
    expect(arriere).toBeGreaterThan(1)
    expect(avant).toBeLessThan(1)
    // Opposite notches cancel.
    expect(avant * arriere).toBeCloseTo(1, 12)
    // Notch ignores amplitude (≠ pinch).
    expect(facteurZoom(4, false)).toBe(arriere)
  })

  it('rend le pincement proportionnel à son amplitude', () => {
    const petit = facteurZoom(5, true)
    const grand = facteurZoom(40, true)
    expect(grand).toBeGreaterThan(petit)
    expect(petit).toBeGreaterThan(1)
    // Slow gesture: field change <1 %.
    expect(petit).toBeLessThan(1.06)
    // Two half gestures = whole: no drift with event cadence.
    expect(facteurZoom(20, true) * facteurZoom(20, true)).toBeCloseTo(facteurZoom(40, true), 12)
  })

  it('ne bouge pas le champ à delta nul', () => {
    expect(facteurZoom(0, true)).toBe(1)
  })
})

describe('source d’un `wheel` — pincement, molette, défilement', () => {
  const moletteChrome = { ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 100, wheelDeltaY: -120 }
  const paveDefile = { ctrlKey: false, deltaMode: 0, deltaX: -2, deltaY: 7.5, wheelDeltaY: -22.5 }
  const pavePince = { ctrlKey: true, deltaMode: 0, deltaX: 0, deltaY: 3, wheelDeltaY: -9 }

  it('lit le pincement au `ctrlKey`, quoi que disent les autres signaux', () => {
    expect(sourceMolette(pavePince)).toBe('PINCEMENT')
    expect(sourceMolette({ ...moletteChrome, ctrlKey: true })).toBe('PINCEMENT')
  })

  it('reconnaît un cran de molette à son multiple de 120', () => {
    expect(sourceMolette(moletteChrome)).toBe('MOLETTE')
    expect(sourceMolette({ ...moletteChrome, deltaY: -100, wheelDeltaY: 120 })).toBe('MOLETTE')
    // Firefox: wheel in lines, never the pad.
    expect(sourceMolette({ ctrlKey: false, deltaMode: 1, deltaX: 0, deltaY: 3 })).toBe('MOLETTE')
  })

  it('range le défilement à deux doigts à part, pour qu’il promène la visée', () => {
    expect(sourceMolette(paveDefile)).toBe('DEFILEMENT')
    // Vertical scroll not notch-sized stays a scroll.
    expect(sourceMolette({ ...paveDefile, deltaX: 0 })).toBe('DEFILEMENT')
    // Firefox px, no `wheelDeltaY`: small + fractional → pad.
    expect(sourceMolette({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 6.25 })).toBe(
      'DEFILEMENT',
    )
    expect(sourceMolette({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 120 })).toBe('MOLETTE')
  })

  it('zoome sur une molette libre, dont les crans sont fins et hors des multiples de 120', () => {
    // T-0124 measured: −13 px per notch, `wheelDeltaY` 39, never a multiple of 120.
    const moletteLibre = { ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: -13, wheelDeltaY: 39 }
    expect(sourceMolette(moletteLibre)).toBe('MOLETTE')
    // Firm notch zooms even while a pad has the hand.
    expect(sourceMolette(moletteChrome, true)).toBe('MOLETTE')
    expect(sourceMolette({ ...moletteLibre, deltaY: 0, wheelDeltaY: 0 })).toBe('DEFILEMENT')
  })

  it('laisse la rafale du pavé défiler, y compris pendant son inertie', () => {
    // T-0124 — measured ramp: finger drifts first, then inertia falls straight and fine.
    const rampe = [
      { deltaX: 0, deltaY: 1 },
      { deltaX: 2, deltaY: 3 },
      { deltaX: 3, deltaY: 8 },
      { deltaX: 0, deltaY: 2 },
      { deltaX: 0, deltaY: 1 },
    ]
    for (const { deltaX, deltaY } of rampe) {
      const e = { ctrlKey: false, deltaMode: 0, deltaX, deltaY, wheelDeltaY: -3 * deltaY }
      // `paveRecent` true from burst's 2nd event — the hook dates it.
      expect(sourceMolette(e, true)).toBe('DEFILEMENT')
    }
  })

  it('rend le zoom à la souris dès que la rafale du pavé s’est tue', () => {
    // Same notch pad or not: the T-0124 bug.
    const cran = { ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: -13, wheelDeltaY: 39 }
    expect(sourceMolette(cran, true)).toBe('DEFILEMENT')
    expect(sourceMolette(cran, false)).toBe('MOLETTE')
  })

  it('reconnaît le pavé à sa dérive, ses fractions et son pincement — jamais une molette', () => {
    expect(signaturePave(paveDefile)).toBe(true)
    expect(signaturePave(pavePince)).toBe(true)
    expect(signaturePave({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 6.25 })).toBe(true)
    expect(signaturePave(moletteChrome)).toBe(false)
    expect(signaturePave({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: -13 })).toBe(false)
    // Firefox lines: fractional delta ≠ pad.
    expect(signaturePave({ ctrlKey: false, deltaMode: 1, deltaX: 0, deltaY: 0.5 })).toBe(false)
  })
})

/**
 * T-0084 — frame rotation = continuous gesture on scene, Maj held. DOM wiring untestable outside
 * a browser; calculation rule is.
 */
describe('rotation du cadre au glisser §3.5', () => {
  const BOITE = { top: 0, left: 0, width: 800, height: 600 }
  // Three points on centred circle, at 0°, 90°, 180° screen angle.
  const droite = { x: 700, y: 300 }
  const bas = { x: 400, y: 500 }
  const gauche = { x: 100, y: 300 }

  it('suit le doigt : un glisser horaire à l’écran tourne le cadre du même angle', () => {
    // Right → bottom: clockwise quarter turn on screen = −90° roll.
    expect(roulisApresGlisser(180, BOITE, droite, bas)).toBeCloseTo(90, 9)
    // Return gives exactly the starting roll: gesture reversible.
    expect(roulisApresGlisser(90, BOITE, bas, droite)).toBeCloseTo(180, 9)
  })

  it('reste continu : deux demi-gestes valent le geste entier', () => {
    const entier = roulisApresGlisser(200, BOITE, droite, gauche)
    const enDeux = roulisApresGlisser(roulisApresGlisser(200, BOITE, droite, bas), BOITE, bas, gauche)
    expect(enDeux).toBeCloseTo(entier, 9)
  })

  it('borne le roulis à 0–360°, sans plafond sur le geste', () => {
    // Crossing zero doesn't block gesture: goes back through 360°.
    const franchi = roulisApresGlisser(10, BOITE, droite, bas)
    expect(franchi).toBeGreaterThanOrEqual(0)
    expect(franchi).toBeLessThan(360)
    expect(franchi).toBeCloseTo(280, 9)
  })

  it('ne bouge pas le cadre sans déplacement du pointeur', () => {
    expect(roulisApresGlisser(42, BOITE, droite, droite)).toBeCloseTo(42, 9)
  })
})

describe('champ du geste « Cadrer » — T-0283', () => {
  const BORNES = { fovMinDeg: K('FOV_MIN_AVEC_GAIA_DEG'), fovMaxDeg: K('FOV_MAX_STEREOGRAPHIQUE_DEG') }

  it('montre le cadre sur une part lisible de la scène', () => {
    const fovL = 17
    expect(champPourCadrer(fovL, BORNES)).toBe(fovL * K('CHAMP_CADRER_FACTEUR'))
  })

  it('reste dans les bornes du zoom pour un très petit ou très grand cadre', () => {
    expect(champPourCadrer(BORNES.fovMinDeg / 100, BORNES)).toBe(BORNES.fovMinDeg)
    expect(champPourCadrer(BORNES.fovMaxDeg, BORNES)).toBe(BORNES.fovMaxDeg)
  })
})
