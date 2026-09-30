/**
 * T-0342 — §12.5 : sans IndexedDB, l'application démarre quand même et le dit.
 *
 * La base est rendue inutilisable en remplaçant `indexedDB.open` par une ouverture qui échoue ;
 * le réseau sert le manifeste et les paquets. Rien n'est une valeur de ciel : le paquet est
 * un tampon d'octets arbitraires, et seul son chemin jusqu'au lecteur est vérifié.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demarre, demarrageEchoue } from '../src/data/bootstrap.ts'
import { litPaquet } from '../src/data/db.ts'
import { AVERTISSEMENT_SANS_BASE } from '../src/data/persistence.ts'

const OCTETS = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer

async function sha256Hex(donnees: ArrayBuffer): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', donnees)
  return [...new Uint8Array(empreinte)].map((o) => o.toString(16).padStart(2, '0')).join('')
}

describe('T-0342 — démarrage sans IndexedDB', () => {
  const openOrigine = indexedDB.open.bind(indexedDB)

  beforeEach(async () => {
    const empreinte = await sha256Hex(OCTETS)
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('refusée', 'InvalidStateError')
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('manifest.json')
          ? new Response(
              JSON.stringify([
                { nom: 'epreuve', version: '1', obligatoire: true, sha256: empreinte, octets: 8 },
              ]),
            )
          : new Response(OCTETS.slice(0)),
      ),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    indexedDB.open = openOrigine
  })

  it('sert les paquets du réseau et annonce que rien ne sera mémorisé', async () => {
    const etat = await demarre()
    expect(etat.catalogues.cause).toBeUndefined()
    expect(etat.stockage.avertissement).toBe(AVERTISSEMENT_SANS_BASE)
    const lu = await litPaquet('epreuve')
    expect(lu === null ? null : [...new Uint8Array(lu)]).toEqual([...new Uint8Array(OCTETS)])
  })

  it('l’état de repli nomme une cause au lieu de laisser un écran vide', () => {
    const etat = demarrageEchoue()
    expect(etat.catalogues.cause).toMatch(/\S/)
    expect(etat.stockage.avertissement).toBe(AVERTISSEMENT_SANS_BASE)
  })
})
