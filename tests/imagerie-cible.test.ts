/**
 * §6.4, §6.2 — target image resolver + cadre geometry laid on it.
 * No coordinate, magnitude or dimension written: objects from embedded packets, edge cases
 * SEARCHED by predicate (a copied value tests the copy). Network stubbed by address table:
 * tests resolver per response (404, 429, non-image body, oversized), not third-party uptime.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeObjets, type ObjetCielProfond } from '../src/data/deepsky.ts'
import { db, ecritImage } from '../src/data/db.ts'
import {
  cadreSurImage,
  champDecoupeDeg,
  imageEnCache,
  resoudImage,
  urlDecoupe,
} from '../src/data/imagerie-cible.ts'
import { fovDeg } from '../src/core/optics.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import { CREDIT_RELEVE, HOTE_DECOUPE, I } from '../src/registry/imagerie.ts'
import { paquet } from './fixtures.ts'

const ARCMIN_PAR_DEG = 60
const OCTETS_PAR_KO = 1024

const CATALOGUE: readonly ObjetCielProfond[] = [
  ...decodeObjets({ enregistrements: paquet('openngc-1.bin'), chaines: paquet('openngc-noms-1.bin') }),
  ...decodeObjets({ enregistrements: paquet('deepsky-1.bin'), chaines: paquet('deepsky-noms-1.bin') }),
]

/** First catalogue object satisfying the predicate; no hardcoded désignation. */
function trouve(predicat: (o: ObjetCielProfond) => boolean): ObjetCielProfond {
  const objet = CATALOGUE.find(predicat)
  expect(objet, 'aucun objet du catalogue ne satisfait ce cas').toBeDefined()
  return objet!
}

const SHARPLESS = trouve((o) => /^Sh2-\d+$/.test(o.designation))

describe('champ de la découpe §6.4', () => {
  it('applique la marge du registre à la taille du catalogue', () => {
    const objet = trouve((o) => {
      if (o.majAxArcmin === null) return false
      const brut = (o.majAxArcmin / ARCMIN_PAR_DEG) * I('MARGE_CADRAGE_DECOUPE')
      return brut > I('CHAMP_DECOUPE_MIN_DEG') && brut < I('CHAMP_DECOUPE_MAX_DEG')
    })
    expect(champDecoupeDeg(objet)).toBeCloseTo(
      (objet.majAxArcmin! / ARCMIN_PAR_DEG) * I('MARGE_CADRAGE_DECOUPE'),
      10,
    )
  })

  it('retombe sur le champ par défaut quand le catalogue ne donne aucune dimension', () => {
    const sansTaille = trouve((o) => o.majAxArcmin === null)
    expect(champDecoupeDeg(sansTaille)).toBe(I('CHAMP_DECOUPE_DEFAUT_DEG'))
  })

  it('borne le champ des deux côtés, sur tout le catalogue', () => {
    for (const objet of CATALOGUE) {
      const champ = champDecoupeDeg(objet)
      expect(champ, objet.designation).toBeGreaterThanOrEqual(I('CHAMP_DECOUPE_MIN_DEG'))
      expect(champ, objet.designation).toBeLessThanOrEqual(I('CHAMP_DECOUPE_MAX_DEG'))
    }
  })

  it('cadre le grand objet au plafond et le petit au plancher', () => {
    const grand = trouve(
      (o) =>
        o.majAxArcmin !== null &&
        (o.majAxArcmin / ARCMIN_PAR_DEG) * I('MARGE_CADRAGE_DECOUPE') > I('CHAMP_DECOUPE_MAX_DEG'),
    )
    expect(champDecoupeDeg(grand)).toBe(I('CHAMP_DECOUPE_MAX_DEG'))

    const petit = trouve(
      (o) =>
        o.majAxArcmin !== null &&
        o.majAxArcmin > 0 &&
        (o.majAxArcmin / ARCMIN_PAR_DEG) * I('MARGE_CADRAGE_DECOUPE') < I('CHAMP_DECOUPE_MIN_DEG'),
    )
    expect(champDecoupeDeg(petit)).toBe(I('CHAMP_DECOUPE_MIN_DEG'))
  })
})

describe('adresse de la découpe de relevé', () => {
  it('porte les coordonnées de l’objet et le champ calculé, sur l’hôte du registre', () => {
    const adresse = new URL(urlDecoupe(SHARPLESS))
    expect(`${adresse.protocol}//${adresse.host}`).toBe(HOTE_DECOUPE)
    expect(Number(adresse.searchParams.get('ra'))).toBe(SHARPLESS.adDeg)
    expect(Number(adresse.searchParams.get('dec'))).toBe(SHARPLESS.decDeg)
    expect(Number(adresse.searchParams.get('fov'))).toBe(champDecoupeDeg(SHARPLESS))
    expect(Number(adresse.searchParams.get('width'))).toBe(I('LARGEUR_VIGNETTE_PX'))
  })
})

// ---------------------------------------------------------------------------
// Full resolution, network stubbed
// ---------------------------------------------------------------------------

type Reponse = { readonly statut: number; readonly corps?: unknown; readonly type?: string; readonly poids?: number }

let appels: string[] = []
let table: readonly [RegExp, Reponse][] = []

function bouchonne(entrees: readonly [RegExp, Reponse][]): void {
  table = entrees
  vi.stubGlobal('fetch', (adresse: string) => {
    appels.push(String(adresse))
    const trouvee = table.find(([motif]) => motif.test(String(adresse)))
    const reponse = trouvee?.[1] ?? { statut: 404 }
    return Promise.resolve({
      ok: reponse.statut >= 200 && reponse.statut < 300,
      status: reponse.statut,
      json: () => Promise.resolve(reponse.corps),
      blob: () =>
        Promise.resolve(
          new Blob([new Uint8Array(reponse.poids ?? 1024)], { type: reponse.type ?? 'image/jpeg' }),
        ),
    })
  })
}

const DECOUPE_MOTIF = /hips2fits/

/** Catalogue object never resolved yet: cache is state shared across tests. */
let compteur = 0
function cibleNeuve(): ObjetCielProfond {
  const objet = CATALOGUE[compteur++ * 97 + 3]
  expect(objet).toBeDefined()
  return objet!
}

beforeEach(async () => {
  appels = []
  await (await db()).clear('images')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('résolution — une seule source', () => {
  it('demande la découpe du relevé, et n’interroge aucune encyclopédie', async () => {
    bouchonne([[DECOUPE_MOTIF, { statut: 200 }]])
    const image = await resoudImage(cibleNeuve())
    expect(image?.origine).toBe('RELEVE')
    expect(image?.credit).toStrictEqual(CREDIT_RELEVE)
    // Encyclopedic image framed by its author: field written nowhere → no cadre can be right
    // (§6.2).
    expect(appels.every((a) => DECOUPE_MOTIF.test(a))).toBe(true)
  })

  it('demande la découpe au champ de l’objet, pas à un champ de convention', async () => {
    bouchonne([[DECOUPE_MOTIF, { statut: 200 }]])
    const cible = cibleNeuve()
    await resoudImage(cible)
    const fov = Number(new URL(appels[0]!).searchParams.get('fov'))
    expect(fov).toBeCloseTo(champDecoupeDeg(cible), 10)
  })

  it('refuse un corps qui n’est pas une image, même annoncé 200', async () => {
    bouchonne([[DECOUPE_MOTIF, { statut: 200, type: 'text/html' }]])
    await expect(resoudImage(cibleNeuve())).resolves.toBeNull()
  })

  it('refuse un fichier au-delà du plafond de poids du registre', async () => {
    const trop = I('POIDS_VIGNETTE_MAX_KO') * OCTETS_PAR_KO + 1
    bouchonne([[DECOUPE_MOTIF, { statut: 200, poids: trop }]])
    await expect(resoudImage(cibleNeuve())).resolves.toBeNull()
  })

  it('ne ressert pas une image d’encyclopédie rangée par une visite antérieure', async () => {
    // Encyclopedic image field written nowhere: reserving it = cadre at invented scale.
    // Replace, don't reuse.
    const cible = cibleNeuve()
    await ecritImage({
      designation: cible.designation,
      origine: 'ENCYCLOPEDIE',
      octets: new Blob([new Uint8Array(8)], { type: 'image/jpeg' }),
      credit: { auteur: 'Quelqu’un', licence: 'CC BY-SA 4.0', lien: 'https://exemple.test' },
      source: 'https://upload.wikimedia.org/ancienne.jpg',
      obtenueIso: new Date().toISOString(),
    })

    bouchonne([[DECOUPE_MOTIF, { statut: 200 }]])
    const image = await resoudImage(cible)
    expect(image?.origine).toBe('RELEVE')
    expect(appels.filter((a) => DECOUPE_MOTIF.test(a))).toHaveLength(1)
  })
})

describe('résolution — échec, cache et débit', () => {
  it('rend null sans lever quand le service échoue', async () => {
    bouchonne([])
    await expect(resoudImage(cibleNeuve())).resolves.toBeNull()
  })

  it('rend null sans lever quand le réseau jette', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('réseau coupé')))
    await expect(resoudImage(cibleNeuve())).resolves.toBeNull()
  })

  it('lit le cache avant le réseau, et n’y retourne pas', async () => {
    bouchonne([[DECOUPE_MOTIF, { statut: 200 }]])
    const cible = cibleNeuve()
    const premiere = await resoudImage(cible)
    expect(premiere).not.toBeNull()
    const apresPremiere = appels.length

    const seconde = await resoudImage(cible)
    expect(appels.length).toBe(apresPremiere)
    expect(seconde?.source).toBe(premiere?.source)
    expect(await imageEnCache(cible.designation)).not.toBeNull()
  })

  it('n’émet qu’une résolution pour deux demandes simultanées', async () => {
    bouchonne([[DECOUPE_MOTIF, { statut: 200 }]])
    const cible = cibleNeuve()
    const [a, b] = await Promise.all([resoudImage(cible), resoudImage(cible)])
    expect(appels.filter((u) => DECOUPE_MOTIF.test(u))).toHaveLength(1)
    expect(a?.source).toBe(b?.source)
  })

  it('hors réseau et sans cache : rien, aucune requête, aucune erreur', async () => {
    bouchonne([[DECOUPE_MOTIF, { statut: 200 }]])
    vi.stubGlobal('navigator', { onLine: false })
    await expect(resoudImage(cibleNeuve())).resolves.toBeNull()
    expect(appels).toHaveLength(0)
  })

  it('hors réseau, une cible déjà consultée garde son image', async () => {
    bouchonne([[DECOUPE_MOTIF, { statut: 200 }]])
    const cible = cibleNeuve()
    const enLigne = await resoudImage(cible)
    expect(enLigne).not.toBeNull()

    appels = []
    vi.stubGlobal('navigator', { onLine: false })
    const horsLigne = await resoudImage(cible)
    expect(horsLigne?.source).toBe(enLigne?.source)
    expect(appels).toHaveLength(0)
  })

  it('range les octets, pas l’adresse : c’est ce qui survit à la coupure', async () => {
    bouchonne([[DECOUPE_MOTIF, { statut: 200 }]])
    const image = await resoudImage(cibleNeuve())
    expect(image?.octets).toBeInstanceOf(Blob)
    expect(image?.octets.size).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// §6.2 — capteur frame on the image
// ---------------------------------------------------------------------------

/**
 * 2 real fields at both ends of focale domain: wide-angle + telescope, same capteur. From §5.1
 * formula and input bounds, no number picked to pass.
 */
const COTE_CAPTEUR_MM = 36
const RAPPORT_24X36 = 2 / 3
const FOV_COURT = fovDeg(COTE_CAPTEUR_MM, DOMAINES.focale_mm.min).value
const FOV_LONG = fovDeg(COTE_CAPTEUR_MM, DOMAINES.focale_mm.max).value
const FOV_LONG_H = fovDeg(COTE_CAPTEUR_MM * RAPPORT_24X36, DOMAINES.focale_mm.max).value

describe('géométrie de l’encart §6.2', () => {
  it('réduit la cible à sa taille réelle dans le cadre', () => {
    const objet = trouve((o) => champDecoupeDeg(o) < FOV_LONG)
    const pose = cadreSurImage(objet, FOV_LONG, FOV_LONG_H, null)
    expect(pose.partObjetPct).toBeCloseTo((champDecoupeDeg(objet) / FOV_LONG) * 100, 10)
    expect(pose.partObjetPct).toBeLessThan(100)
  })

  it('fait déborder la cible du cadre quand elle est plus grande que lui', () => {
    // Mosaic not special to the formula: cut goes over 100 % of inset, inset clips it. Full
    // frame, object overflows = MOSAIQUE_REQUISE.
    const objet = trouve((o) => champDecoupeDeg(o) > FOV_LONG)
    expect(cadreSurImage(objet, FOV_LONG, FOV_LONG_H, null).partObjetPct).toBeGreaterThan(100)
  })

  it('donne la même lecture à toute cible, sans bascule de mode', () => {
    // One output shape only: no other way to read the cadre, else same question needs 2 gestures.
    for (const objet of CATALOGUE) {
      const pose = cadreSurImage(objet, FOV_LONG, FOV_LONG_H, null)
      expect(Object.keys(pose).sort(), objet.designation).toStrictEqual([
        'partObjetPct',
        'rotationDeg',
      ])
      expect(pose.partObjetPct, objet.designation).toBeGreaterThan(0)
      expect(Number.isFinite(pose.partObjetPct), objet.designation).toBe(true)
    }
  })

  it('grandit la cible dans le cadre quand la focale monte', () => {
    // Constant cut field, narrower cadre → target occupies more: only matériel varies.
    const objet = trouve((o) => champDecoupeDeg(o) < FOV_LONG)
    const large = cadreSurImage(objet, FOV_COURT, FOV_COURT, null).partObjetPct
    const serre = cadreSurImage(objet, FOV_LONG, FOV_LONG_H, null).partObjetPct
    expect(serre).toBeGreaterThan(large)
  })
})

describe('sens de rotation du cadre §6.2', () => {
  const objet = CATALOGUE[0]!
  const rotation = (angle: number | null, fovL = FOV_LONG, fovH = FOV_LONG_H) =>
    cadreSurImage(objet, fovL, fovH, angle).rotationDeg

  it('ne tourne rien sans angle de position au catalogue', () => {
    expect(rotation(null)).toBe(0)
  })

  it('laisse l’image droite quand le grand axe est déjà sur le grand côté du capteur', () => {
    // North up, East LEFT: major axis at 90° runs east-west = horizontal (landscape capteur's
    // long side).
    expect(rotation(90)).toBe(0)
  })

  it('couche un grand axe nord-sud sur le grand côté, dans le sens trigonométrique', () => {
    // Sign locked, not symmetric: at 0° object runs top to bottom of cut; quarter turn
    // COUNTERCLOCKWISE (negative in CSS) → horizontal. +90 would lay it too, but showing the
    // other end of object and other half of field.
    expect(rotation(0)).toBe(-90)
    expect(rotation(45)).toBe(-45)
    expect(rotation(135)).toBe(45)
  })

  it('perd le quart de tour sur un capteur en portrait, dont le grand côté est vertical', () => {
    expect(rotation(0, FOV_LONG_H, FOV_LONG)).toBe(0)
    expect(rotation(90, FOV_LONG_H, FOV_LONG)).toBe(90)
  })
})
