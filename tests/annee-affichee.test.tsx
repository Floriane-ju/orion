/**
 * T-0360 — l'année affichée reste entre 1900 et 2100.
 *
 * La borne vit dans `DOMAINES.annee_affichee` et passe par `borneInstant`. Chaque chemin qui
 * écrit l'instant affiché est vérifié ici : un chemin oublié rouvrirait l'an 5000, où les
 * figures seraient dessinées comme en 2000 sans que rien ne le dise.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.tsx'
import { DOMAINES } from '../src/registry/domains.ts'
import { borneInstant, etatScene, instant, reinitialiseScene, vaA } from '../src/ui/scene-etat.ts'
import { instantSuivant } from '../src/ui/planetarium-boucle.ts'

const { min, max } = DOMAINES.annee_affichee
const PREMIER_MS = Date.UTC(min, 0, 1)
const DERNIER_MS = Date.UTC(max + 1, 0, 1) - 1
const DEDANS_MS = Date.UTC(2026, 7, 21, 22, 47)

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage
  vi.resetModules()
  reinitialiseScene()
})

describe('T-0360 — la borne de l’instant affiché', () => {
  it('laisse passer un instant de la plage et ramène les autres à ses bords', () => {
    expect(borneInstant(DEDANS_MS)).toBe(DEDANS_MS)
    expect(new Date(borneInstant(Date.UTC(1400, 0, 1))).getUTCFullYear()).toBe(min)
    expect(new Date(borneInstant(Date.UTC(12026, 0, 1))).getUTCFullYear()).toBe(max)
    expect(borneInstant(Date.UTC(5000, 0, 1))).toBe(DERNIER_MS)
    expect(borneInstant(Date.UTC(1000, 0, 1))).toBe(PREMIER_MS)
  })

  it('le compteur d’année envoie la scène au bord, pas au-delà', () => {
    vaA(Date.UTC(2500, 5, 1))
    expect(instant.ms).toBe(DERNIER_MS)
    expect(etatScene().msAffiche).toBe(DERNIER_MS)
    vaA(Date.UTC(1850, 5, 1))
    expect(etatScene().msAffiche).toBe(PREMIER_MS)
  })

  it('le compteur d’année annonce sa plage', () => {
    const html = renderToStaticMarkup(<App />)
    const annee = html.match(/<span role="spinbutton"[^>]*aria-label="Année"[^>]*>/)?.[0]
    expect(annee).toContain(`aria-valuemin="${min}"`)
    expect(annee).toContain(`aria-valuemax="${max}"`)
  })

  it('le transport s’arrête au bord, en avant comme en arrière', () => {
    const anime = { modeTemps: 'FIGE', facteur: 3600, decalageMs: 0, anime: true }
    const uneHeure = 3600 * 1000
    expect(instantSuivant(anime, DERNIER_MS - 1, uneHeure, 0)).toBe(DERNIER_MS)
    expect(instantSuivant({ ...anime, facteur: -3600 }, PREMIER_MS + 1, uneHeure, 0)).toBe(
      PREMIER_MS,
    )
    // En `MAINTENANT`, c'est le décalage gardé qui pourrait sortir de la plage.
    const maintenant = { ...anime, modeTemps: 'MAINTENANT', decalageMs: Date.UTC(3000, 0, 1) }
    expect(instantSuivant(maintenant, DEDANS_MS, 0, DEDANS_MS)).toBe(DERNIER_MS)
  })

  it('une scène relue au démarrage hors de la plage repart de son bord', async () => {
    const cles = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (c: string) => cles.get(c) ?? null,
        setItem: (c: string, v: string) => void cles.set(c, v),
      },
    })
    const { ecritScenePersistee } = await import('../src/data/scene-persistee.ts')
    ecritScenePersistee({ temps: { modeTemps: 'FIGE' }, ms: Date.UTC(4000, 0, 1) })
    vi.resetModules()
    const scene = await import('../src/ui/scene-etat.ts')
    expect(scene.instant.ms).toBe(DERNIER_MS)
  })
})
