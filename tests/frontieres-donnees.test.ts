/**
 * T-0343 — ce qui entre de l'extérieur est vérifié avant d'être cru.
 *
 * Trois frontières : le manifeste servi par le réseau, le paquet de constellations, le format
 * de capteur écrit dans un fichier ou dans la base. Aucune ne doit lever au démarrage, et
 * aucune ne doit transformer en silence une valeur inconnue en valeur par défaut.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { estManifeste } from '../src/data/bootstrap.ts'
import { PAQUET_VIDE, decodeConstellations } from '../src/data/constellations.ts'
import {
  TABLE_FORMATS_CAPTEUR,
  estFormatCapteur,
  ligneFormatCapteur,
  type FormatCapteur,
} from '../src/registry/capteur-formats.ts'
import { db } from '../src/data/db.ts'
import { litProfilActif } from '../src/data/persistence.ts'

const octets = (texte: string): ArrayBuffer => new TextEncoder().encode(texte).buffer as ArrayBuffer

describe('T-0343 — frontières des données', () => {
  it('refuse un manifeste mal formé', () => {
    expect(estManifeste({ nom: 'hyg' })).toBe(false)
    expect(estManifeste([{ nom: 'hyg', version: '1' }])).toBe(false)
    expect(
      estManifeste([
        { nom: 'hyg', version: '1', sha256: 'ab', octets: 2, obligatoire: true, source: '', nombreEntrees: 0 },
      ]),
    ).toBe(true)
  })

  it('un paquet de constellations illisible rend le paquet vide, sans lever', () => {
    expect(decodeConstellations(octets('{pas du json'))).toBe(PAQUET_VIDE)
    expect(decodeConstellations(octets('{"figures": 3}'))).toBe(PAQUET_VIDE)
  })

  it('un format de capteur inconnu est refusé, jamais changé en plein format', () => {
    for (const { format } of TABLE_FORMATS_CAPTEUR) expect(estFormatCapteur(format)).toBe(true)
    expect(estFormatCapteur('APS_C')).toBe(false)
    expect(() => ligneFormatCapteur('APS_C' as FormatCapteur)).toThrow(/inconnu/)
  })

  it('un profil enregistré au format inconnu est refusé à la relecture, avec sa cause', async () => {
    await (await db()).put('profils', {
      id: 'profil-actif',
      nom: 'forgé',
      focaleMm: 50,
      ouvertureN: 2,
      typeObjectif: 'RECTILINEAIRE',
      formatCapteur: 'APS_C' as FormatCapteur,
      capteurMode: 'FULL_FRAME',
      suiviActif: false,
    })
    await expect(litProfilActif()).rejects.toThrow(/format de capteur inconnu/)
  })
})
