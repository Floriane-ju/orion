/** §12.2, §12.3 — binary encoding, position fidelity, integrity check. */

import 'fake-indexeddb/auto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  OCTETS_PAR_ETOILE,
  decodeEtoiles,
  encodeEtoiles,
  sha256Hex,
  verifieIntegrite,
  type Etoile,
  type ManifestePaquet,
} from '../src/data/catalog.ts'
import { decodeObjets, encodeObjets, type ObjetCielProfond } from '../src/data/deepsky.ts'
import { aireEllipseArcsec2 } from '../src/core/detectability.ts'
import { K } from '../src/registry/constants.ts'
import { chercheCatalogue } from '../src/core/recherche-catalogue.ts'
import {
  chargeObjetsCielProfond,
  PAQUET_NOMS_OBJETS,
  PAQUET_NOMS_OBJETS_COMPLEMENT,
  PAQUET_OBJETS,
  PAQUET_OBJETS_COMPLEMENT,
} from '../src/data/bootstrap.ts'
import { ecritPaquet } from '../src/data/db.ts'

const RACINE = join(import.meta.dirname, '..')
const ARCSEC_PAR_DEG = 3600

/** Pseudo-random but deterministic positions, for a reproducible test. */
function echantillon(n: number): Etoile[] {
  const etoiles: Etoile[] = []
  for (let i = 0; i < n; i++) {
    etoiles.push({
      adDeg: (i * 137.508) % 360,
      decDeg: ((i * 53.7) % 180) - 90,
      magV: -1.46 + (i % 105) / 10,
      bv: -0.3 + (i % 21) / 10,
    })
  }
  return etoiles
}

describe('encodage des étoiles §12.2', () => {
  it('occupe exactement 12 octets par étoile', () => {
    expect(OCTETS_PAR_ETOILE).toBe(12)
    expect(encodeEtoiles(echantillon(1000)).byteLength).toBe(1000 * 12)
  })

  it('restitue 100 positions à moins d’une seconde d’arc de la source', () => {
    const source = echantillon(100)
    const decodees = decodeEtoiles(encodeEtoiles(source))
    for (let i = 0; i < source.length; i++) {
      const attendue = source[i]!
      const obtenue = decodees[i]!
      expect(Math.abs(obtenue.adDeg - attendue.adDeg) * ARCSEC_PAR_DEG).toBeLessThan(1)
      expect(Math.abs(obtenue.decDeg - attendue.decDeg) * ARCSEC_PAR_DEG).toBeLessThan(1)
      expect(obtenue.magV).toBeCloseTo(attendue.magV, 2)
      expect(obtenue.bv).toBeCloseTo(attendue.bv, 3)
    }
  })
})

describe('encodage du ciel profond §12.2', () => {
  const objets: ObjetCielProfond[] = [
    {
      designation: 'M31',
      nomsCommuns: 'Andromeda Galaxy|NGC0224',
      adDeg: 10.6847,
      decDeg: 41.269,
      type: 'GALAXIE',
      majAxArcmin: 190,
      minAxArcmin: 60,
      posAngDeg: 35,
      vMag: 3.4,
      bMag: 4.3,
      surfBr: 22.2,
    },
    {
      designation: 'Sh2-276',
      nomsCommuns: 'Barnard’s Loop',
      adDeg: 84.0,
      decDeg: -3.0,
      type: 'EMISSION',
      majAxArcmin: 600,
      minAxArcmin: 300,
      posAngDeg: null,
      vMag: null,
      bMag: null,
      surfBr: null,
    },
  ]

  it('fait un aller-retour sans perte utile', () => {
    const rendus = decodeObjets(encodeObjets(objets))
    expect(rendus[0]!.designation).toBe('M31')
    expect(rendus[0]!.nomsCommuns).toBe('Andromeda Galaxy|NGC0224')
    expect(rendus[0]!.vMag).toBeCloseTo(3.4, 2)
    expect(rendus[0]!.majAxArcmin).toBeCloseTo(190, 1)
    expect(rendus[1]!.designation).toBe('Sh2-276')
    // An object larger than a 10 mm champ must fit the encoding.
    expect(rendus[1]!.majAxArcmin).toBeCloseTo(600, 1)
  })

  it('distingue une donnée absente d’une valeur nulle', () => {
    const rendus = decodeObjets(encodeObjets(objets))
    expect(rendus[1]!.vMag).toBeNull()
    expect(rendus[1]!.posAngDeg).toBeNull()
  })
})

describe('intégrité des paquets §12.3', () => {
  const buffer = encodeEtoiles(echantillon(50))

  async function manifestePour(donnees: ArrayBuffer): Promise<ManifestePaquet> {
    return {
      nom: 'test',
      version: '1',
      nombreEntrees: 50,
      octets: donnees.byteLength,
      sha256: await sha256Hex(donnees),
      source: 'échantillon de test',
      obligatoire: true,
    }
  }

  it('valide un paquet intact', async () => {
    expect(await verifieIntegrite(buffer, await manifestePour(buffer))).toBe('OK')
  })

  it('refuse un paquet tronqué après interruption', async () => {
    const manifeste = await manifestePour(buffer)
    expect(await verifieIntegrite(buffer.slice(0, buffer.byteLength - 12), manifeste)).toBe(
      'CORROMPU',
    )
  })

  it('refuse un paquet altéré à taille constante', async () => {
    const manifeste = await manifestePour(buffer)
    const altere = buffer.slice(0)
    new DataView(altere).setFloat32(0, 123.456, true)
    expect(await verifieIntegrite(altere, manifeste)).toBe('CORROMPU')
  })

  it('signale un paquet absent sans lever d’erreur', async () => {
    expect(await verifieIntegrite(null, await manifestePour(buffer))).toBe('ABSENT')
  })
})

describe('paquets générés §12.2', () => {
  it('tient le budget de 10 Mo et correspond à son manifeste', async () => {
    const brut = await readFile(join(RACINE, 'public', 'data', 'manifest.json'), 'utf8').catch(
      () => null,
    )
    if (brut === null) {
      // Paquets generated by `pnpm data:build`; absence doesn't invalidate the codec.
      return
    }
    const manifeste = JSON.parse(brut) as ManifestePaquet[]
    const OCTETS_PAR_MO = 1024 * 1024
    const totalMo =
      manifeste.filter((p) => p.obligatoire).reduce((somme, p) => somme + p.octets, 0) /
      OCTETS_PAR_MO
    expect(totalMo).toBeLessThan(10)

    for (const paquet of manifeste) {
      const donnees = await readFile(
        join(RACINE, 'public', 'data', `${paquet.nom}-${paquet.version}.bin`),
      )
      const buffer = donnees.buffer.slice(
        donnees.byteOffset,
        donnees.byteOffset + donnees.byteLength,
      ) as ArrayBuffer
      expect(await verifieIntegrite(buffer, paquet), paquet.nom).toBe('OK')
    }
  })

  it('porte les Messier hors NGC : « M45 » se cherche par sa désignation', async () => {
    const lit = async (nom: string) =>
      await readFile(join(RACINE, 'public', 'data', `${nom}-1.bin`)).catch(() => null)
    const enregistrements = await lit('openngc')
    const chaines = await lit('openngc-noms')
    if (enregistrements === null || chaines === null) return

    const objets = decodeObjets({
      enregistrements: enregistrements.buffer.slice(
        enregistrements.byteOffset,
        enregistrements.byteOffset + enregistrements.byteLength,
      ) as ArrayBuffer,
      chaines: chaines.buffer.slice(
        chaines.byteOffset,
        chaines.byteOffset + chaines.byteLength,
      ) as ArrayBuffer,
    })

    // M45 is neither NGC nor IC: comes from OpenNGC's supplementary file, not `NGC.csv`.
    expect(chercheCatalogue(objets, 'M45', 10).map((o) => o.designation)).toContain('M45')
    expect(chercheCatalogue(objets, 'pleiades', 10).map((o) => o.designation)).toContain('M45')
  })
})

describe('Sharpless et Barnard §6.1', () => {
  const lit = async (nom: string): Promise<ArrayBuffer | null> => {
    const octets = await readFile(join(RACINE, 'public', 'data', nom)).catch(() => null)
    if (octets === null) return null
    return octets.buffer.slice(
      octets.byteOffset,
      octets.byteOffset + octets.byteLength,
    ) as ArrayBuffer
  }

  const litObjets = async (paquet: string): Promise<ObjetCielProfond[] | null> => {
    const [enregistrements, chaines] = await Promise.all([
      lit(`${paquet}-1.bin`),
      lit(`${paquet}-noms-1.bin`),
    ])
    if (enregistrements === null || chaines === null) return null
    return decodeObjets({ enregistrements, chaines })
  }

  it('porte la Boucle de Barnard, que ni NGC ni IC ne décrivent', async () => {
    const objets = await litObjets('deepsky')
    if (objets === null) return

    const boucle = objets.find((o) => o.designation === 'Sh2-276')
    expect(boucle?.nomsCommuns.split('|')).toContain("Barnard's Loop")
    expect(boucle?.type).toBe('EMISSION')
    // §6.3 — a nebula complex without integrated magnitude doesn't get magnitude 0.
    expect(boucle?.vMag).toBeNull()
    // La Boucle spans ~20 degrees: encoding must hold that size.
    const ARCMIN_PAR_DEG = 60
    expect(boucle!.majAxArcmin! / ARCMIN_PAR_DEG).toBeGreaterThan(10)
  })

  /**
   * T-0266 — source catalogue stores Barnard opacity class in column V. Taken as magnitude, B144
   * became an ŒIL_NU cible atop plan de nuit. Dark nebula absorbs, doesn't emit: no integrated
   * magnitude exists.
   */
  it('ne donne aucune magnitude à une nébuleuse obscure §6.3', async () => {
    const objets = await litObjets('deepsky')
    if (objets === null) return

    const obscures = objets.filter((o) => o.type === 'NEB_OBSCURE')
    expect(obscures.length).toBeGreaterThan(300)
    for (const objet of obscures) {
      expect(objet.vMag, objet.designation).toBeNull()
      expect(objet.bMag, objet.designation).toBeNull()
    }
  })

  /**
   * T-0317 — diffuse nebula's magnitude column sometimes holds its illuminating star's: Sh2-9
   * took V = 2.89 (σ Sco), spread over 17′ × 3′ → SB = 15.79 mag/arcsec², verdict ŒIL_NU.
   * Criterion physical, not empirical: a MEAN brightness can't exceed the PEAK of the brightest
   * diffuse nebula in the sky. Planétaires and amas outside the guard: former compact and truly
   * above that peak, latter bundles of point sources (surface brightness meaningless).
   */
  it('ne laisse aucune nébuleuse diffuse plus brillante que le pic de M42 §6.3', async () => {
    const [complement, ngc] = await Promise.all([litObjets('deepsky'), litObjets('openngc')])
    if (complement === null || ngc === null) return

    // AUTRE holds nebulae OpenNGC files under `Neb` without qualifying (M8, M16, M17, M20). Build
    // guard applies to them, so test checks it too.
    const DIFFUS = new Set(['EMISSION', 'REFLEXION', 'RESTE_SUPERNOVA', 'AUTRE'])
    const diffuses = [...ngc, ...complement].filter((o) => DIFFUS.has(o.type))
    expect(diffuses.length).toBeGreaterThan(0)

    for (const objet of diffuses) {
      if (objet.majAxArcmin === null) continue
      const aire = aireEllipseArcsec2(objet.majAxArcmin, objet.minAxArcmin ?? objet.majAxArcmin)
      for (const magnitude of [objet.vMag, objet.bMag]) {
        if (magnitude === null) continue
        const sb = magnitude + K('POGSON') * Math.log10(aire)
        expect(sb, `${objet.designation} (${objet.type})`).toBeGreaterThanOrEqual(
          K('SB_PIC_M42_MAG'),
        )
      }
    }
  })

  /**
   * T-0317 — size rounded to zero by encoding gives null area → infinite surface brightness.
   * Below paquet resolution, dimension is absent, not zero.
   */
  it('n’encode jamais une taille nulle, seulement une taille absente §12.2', async () => {
    const [complement, ngc] = await Promise.all([litObjets('deepsky'), litObjets('openngc')])
    if (complement === null || ngc === null) return

    for (const objet of [...ngc, ...complement]) {
      for (const taille of [objet.majAxArcmin, objet.minAxArcmin]) {
        if (taille !== null) expect(taille, objet.designation).toBeGreaterThan(0)
      }
    }
  })

  it('ne redouble aucune entrée d’OpenNGC', async () => {
    const [complement, ngc] = await Promise.all([litObjets('deepsky'), litObjets('openngc')])
    if (complement === null || ngc === null) return

    // Complementary paquet exists only for what OpenNGC ignores: two fiches for one sky object →
    // a §6.4 cible list that answers and is wrong.
    const designations = new Set(ngc.map((o) => o.designation))
    for (const objet of complement) {
      expect(designations.has(objet.designation), objet.designation).toBe(false)
      expect(objet.designation).toMatch(/^(Sh2-|B)\d+$/)
    }
    expect(complement.filter((o) => o.designation.startsWith('Sh2-')).length).toBeGreaterThan(200)
    expect(complement.filter((o) => o.designation.startsWith('B')).length).toBeGreaterThan(300)
  })
})

describe('chargement du catalogue ciel profond §6.1', () => {
  it('décode les objets rangés par le démarrage, et rend une liste vide sans paquet', async () => {
    // Fiche de cible draws examples from this list: end-to-end path (verified paquet →
    // IndexedDB → decoding) must be covered, not only the codec.
    expect(await chargeObjetsCielProfond()).toHaveLength(0)

    const lit = async (nom: string): Promise<ArrayBuffer> => {
      const octets = await readFile(join(RACINE, 'public', 'data', nom))
      return octets.buffer.slice(
        octets.byteOffset,
        octets.byteOffset + octets.byteLength,
      ) as ArrayBuffer
    }
    await ecritPaquet({ nom: PAQUET_OBJETS, version: '1', donnees: await lit('openngc-1.bin') })
    await ecritPaquet({
      nom: PAQUET_NOMS_OBJETS,
      version: '1',
      donnees: await lit('openngc-noms-1.bin'),
    })

    await ecritPaquet({
      nom: PAQUET_OBJETS_COMPLEMENT,
      version: '1',
      donnees: await lit('deepsky-1.bin'),
    })
    await ecritPaquet({
      nom: PAQUET_NOMS_OBJETS_COMPLEMENT,
      version: '1',
      donnees: await lit('deepsky-noms-1.bin'),
    })

    const objets = await chargeObjetsCielProfond()
    expect(objets.length).toBeGreaterThan(10000)
    const m31 = objets.find((o) => o.designation === 'M31')
    expect(m31?.majAxArcmin).toBeCloseTo(177.8, 1)
    expect(m31?.type).toBe('GALAXIE')

    // §6.1 — one catalogue for the cible list, two paquets to build it.
    expect(chercheCatalogue(objets, 'barnard', 20).map((o) => o.designation)).toContain('Sh2-276')
    expect(objets.some((o) => o.designation === 'B33')).toBe(true)
  })
})
