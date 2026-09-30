/**
 * §12.4, §12.5 — le calcul astronomique ne touche jamais le réseau, et `mode_reseau`
 * reflète l'état réel plutôt que le relevé du démarrage.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { Body, positionCorps } from '../src/core/ephem.ts'
import {
  MATRICE_DEGRADATION,
  abonneModeReseau,
  modeReseauCourant,
} from '../src/data/degradation.ts'
import { SITE_REFERENCE } from './fixtures.ts'

const DEPART = new Date('2026-08-14T12:00:00Z')
const horsReseau = (etat: string) => MATRICE_DEGRADATION.filter((l) => l.horsReseau === etat)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('calcul sans réseau §12.4', () => {
  /** Toute sortie réseau devient une erreur : un appel caché ne peut plus passer inaperçu. */
  function interditLeReseau(): () => void {
    const echoue = () => {
      throw new Error('appel réseau interdit pendant un calcul astronomique (§12.4)')
    }
    vi.stubGlobal('fetch', echoue)
    vi.stubGlobal('XMLHttpRequest', echoue)
    return () => vi.unstubAllGlobals()
  }

  it('calcule les crépuscules sans émettre la moindre requête', () => {
    const rendre = interditLeReseau()
    try {
      const nuit = fenetreNocturne(SITE_REFERENCE, DEPART)
      expect(nuit.etat).toBe('NUIT_ASTRONOMIQUE')
      expect(nuit.debutNuitAstronomique).not.toBeNull()
    } finally {
      rendre()
    }
  })

  it('positionne le Soleil et la Lune sans réseau', () => {
    const rendre = interditLeReseau()
    try {
      for (const corps of [Body.Sun, Body.Moon, Body.Jupiter]) {
        const position = positionCorps(corps, DEPART, SITE_REFERENCE)
        expect(Number.isFinite(position.hauteurDeg)).toBe(true)
      }
    } finally {
      rendre()
    }
  })
})

describe('mode réseau §12.5', () => {
  it('bascule quand le navigateur perd le réseau', () => {
    let enLigne = true
    vi.stubGlobal('navigator', {
      get onLine() {
        return enLigne
      },
    })
    expect(modeReseauCourant()).toBe('EN_LIGNE')
    enLigne = false
    expect(modeReseauCourant()).toBe('HORS_LIGNE')
  })

  it('ne conclut pas au hors-ligne quand l’information n’existe pas', () => {
    vi.stubGlobal('navigator', {})
    expect(modeReseauCourant()).toBe('EN_LIGNE')
  })

  it('écoute les deux bascules et se désabonne proprement', () => {
    const ecouteurs = new Map<string, unknown>()
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: unknown) => ecouteurs.set(type, fn),
      removeEventListener: (type: string) => ecouteurs.delete(type),
    })
    const desabonne = abonneModeReseau(() => {})
    expect([...ecouteurs.keys()].sort()).toEqual(['offline', 'online'])
    desabonne()
    expect(ecouteurs.size).toBe(0)
  })
})

describe('matrice de dégradation §12.5', () => {
  it('distingue le noyau hors-ligne de ce qui tombe', () => {
    expect(horsReseau('COMPLET').length).toBeGreaterThan(horsReseau('TOMBE').length)
    // Le physique est calculable donc hors-ligne ; le probabiliste dépend d'un service.
    const meteo = MATRICE_DEGRADATION.find((l) => l.fonction.startsWith('Météo'))
    expect(meteo?.horsReseau).toBe('TOMBE')
    expect(meteo?.degradation).not.toBe('')
    const pose = MATRICE_DEGRADATION.find((l) => l.sections === '§7')
    expect(pose?.horsReseau).toBe('COMPLET')
  })

  it('donne une dégradation nommée à chaque fonction qui tombe', () => {
    for (const ligne of horsReseau('TOMBE')) {
      expect(ligne.degradation, ligne.fonction).not.toBe('')
    }
  })

  it('gèle la matrice : c’est un contrat, pas un état', () => {
    expect(Object.isFrozen(MATRICE_DEGRADATION)).toBe(true)
  })
})
