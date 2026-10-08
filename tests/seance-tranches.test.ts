/**
 * T-0398 — un panoramique en Panorama ne réveille que ce qui lit la pose max.
 *
 * La pose max dépend de la déclinaison visée : le panneau Panorama la republie à chaque
 * mouvement. Les abonnés au magasin ENTIER se re-rendaient tous — la racine de l'application
 * comprise, jusqu'à 800 ms de rendu React sur deux secondes de geste. `useSyncExternalStore`
 * ne saute un rendu que si l'instantané lu est identique (`Object.is`) : c'est ce contrat que
 * chaque tranche doit tenir.
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
