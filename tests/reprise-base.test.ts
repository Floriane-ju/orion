/**
 * §12.3 — product was named Astrofort, IndexedDB base carried its name. IndexedDB can't rename a
 * base: content invisible on rename unless copied. Sites, profiles, plans, edited horizon masks
 * aren't re-downloadable = §12.3's protected category.
 * Separate file: `db()` memoises its connection per test module; reprise runs only on 1st call.
 */

import 'fake-indexeddb/auto'
import { deleteDB, openDB } from 'idb'
import { beforeAll, describe, expect, it } from 'vitest'
import { NOM_BASE, db, type ProfilMateriel, type SiteEnregistre } from '../src/data/db.ts'

const NOM_BASE_ANCIEN = 'astrofort'

const SITE: SiteEnregistre = {
  id: 'site-avant-renommage',
  nom: 'Col de la Faucille',
  latitudeDeg: 46.376,
  longitudeDeg: 6.021,
  altitudeM: 1323,
  fuseau: 'Europe/Paris',
  // Hand-edited mask = what a rename without reprise destroys.
  masqueHorizon: Array.from({ length: 360 }, (_, azimut) => (azimut < 180 ? 8 : 2)),
  masqueEstHypothese: false,
}

const PROFIL: ProfilMateriel = {
  id: 'profil-avant-renommage',
  nom: '200 mm sur trépied',
  focaleMm: 200,
  ouvertureN: 4,
  typeObjectif: 'RECTILINEAIRE',
  formatCapteur: 'APSC_NIKON',
  capteurMode: 'FULL_FRAME',
  suiviActif: false,
}

beforeAll(async () => {
  // "astrofort" base as the app left it: same stores, same keys.
  const ancienne = await openDB(NOM_BASE_ANCIEN, 2, {
    upgrade(base) {
      base.createObjectStore('sites', { keyPath: 'id' })
      base.createObjectStore('profils', { keyPath: 'id' })
      base.createObjectStore('plans', { keyPath: 'id' })
      base.createObjectStore('paquets', { keyPath: 'nom' })
      base.createObjectStore('images', { keyPath: 'designation' })
      base.createObjectStore('reglages')
    },
  })
  await ancienne.put('sites', SITE)
  await ancienne.put('profils', PROFIL)
  await ancienne.put('reglages', 'site-avant-renommage', 'site-actif')
  ancienne.close()
})

describe('reprise de la base d’avant le renommage', () => {
  it('recopie les données de l’utilisateur dans la base Orion', async () => {
    const base = await db()
    expect(await base.get('sites', SITE.id)).toEqual(SITE)
    expect(await base.get('profils', PROFIL.id)).toEqual(PROFIL)
    // Out-of-line-key store: key must travel separately, else setting lost.
    expect(await base.get('reglages', 'site-actif')).toBe('site-avant-renommage')
    expect(base.name).toBe(NOM_BASE)
  })

  it('supprime l’ancienne base une fois recopiée', async () => {
    await db()
    const bases = await indexedDB.databases()
    expect(bases.map((b) => b.name)).not.toContain(NOM_BASE_ANCIEN)
  })

  it('ne recopie pas une seconde fois ce que l’utilisateur a effacé depuis', async () => {
    const base = await db()
    await base.delete('sites', SITE.id)
    // "astrofort" base reappearing after reprise must not resurrect the site: flag set in target
    // base closes the door for good.
    const revenante = await openDB(NOM_BASE_ANCIEN, 1, {
      upgrade: (b) => void b.createObjectStore('sites', { keyPath: 'id' }),
    })
    await revenante.put('sites', SITE)
    revenante.close()

    // `db()` memoised: reprise doesn't replay, flag would refuse it anyway.
    expect(await (await db()).get('sites', SITE.id)).toBeUndefined()
    await deleteDB(NOM_BASE_ANCIEN)
  })
})
