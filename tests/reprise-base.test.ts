/**
 * §12.3 — le produit s'appelait Astrofort, la base IndexedDB portait son nom. IndexedDB ne
 * renomme pas une base : au renommage, ce qu'elle contenait devient invisible si personne ne
 * le recopie. Sites, profils, plans et masques d'horizon édités ne se retéléchargent pas —
 * c'est exactement la catégorie que §12.3 protège.
 *
 * Fichier à part : `db()` mémorise sa connexion pour toute la durée d'un module de test, et la
 * reprise ne se joue qu'au premier appel.
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
  // Le masque édité à la main est précisément ce qu'un renommage sans reprise détruirait.
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
  // Une base « astrofort » telle que l'application la laissait : mêmes magasins, mêmes clés.
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
    // Magasin à clé hors ligne : la clé doit voyager séparément, sinon le réglage se perd.
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
    // Une base « astrofort » qui réapparaîtrait après la reprise ne doit pas ressusciter le
    // site : le drapeau posé dans la base d'arrivée ferme la porte définitivement.
    const revenante = await openDB(NOM_BASE_ANCIEN, 1, {
      upgrade: (b) => void b.createObjectStore('sites', { keyPath: 'id' }),
    })
    await revenante.put('sites', SITE)
    revenante.close()

    // `db()` est mémoïsé : la reprise ne se rejoue pas, et le drapeau la refuserait de toute façon.
    expect(await (await db()).get('sites', SITE.id)).toBeUndefined()
    await deleteDB(NOM_BASE_ANCIEN)
  })
})
