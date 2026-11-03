/**
 * T-0398 — a pan in Panorama wakes only what reads pose max.
 * Pose max depends on aimed declination: Panorama panel republishes at each move. Subscribers to
 * the WHOLE store all re-rendered (app root incl., up to 800 ms React render per 2 s gesture).
 * `useSyncExternalStore` skips a render only if snapshot identical (`Object.is`): each slice must
 * hold that contract.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  cibleSeance,
  etatSeance,
  ficheSeance,
  fileSeance,
  modeSeance,
  posePoseMaxCadre,
  reinitialiseSeance,
  vueCiblesSeance,
} from '../src/ui/seance-etat.ts'

beforeEach(() => reinitialiseSeance())

describe('tranches du magasin de séance (T-0398)', () => {
  it('gardent leur identité quand seule la pose max change', () => {
    const tranches = [cibleSeance, ficheSeance, fileSeance, modeSeance, vueCiblesSeance]
    const avant = tranches.map((t) => t(etatSeance()))
    posePoseMaxCadre(12.5)
    posePoseMaxCadre(13.25)
    const apres = tranches.map((t) => t(etatSeance()))
    apres.forEach((valeur, i) => expect(valeur).toBe(avant[i]))
  })
})
