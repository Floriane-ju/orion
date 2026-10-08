/**
 * §4.1, §12.5 — le relief d'un site : tuiles, cache par site, replis (T-0359).
 *
 * Le réseau est remplacé par un chargeur de tuiles synthétiques : ce qui est vérifié, c'est la
 * conduite face à chaque issue — tuile manquante, service qui lève, hors réseau, cache — et
 * jamais la disponibilité d'un service tiers.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleRelief, db, ecritRelief, litRelief } from '../src/data/db.ts'
import {
  altimetre,
  altitudeTerrarium,
  pixelMonde,
  resoudRelief,
  signatureCourbes,
  tuilesCouvrantes,
  type ChargeTuile,
} from '../src/data/relief.ts'
import { NB_AZIMUTS } from '../src/core/site.ts'
import { R } from '../src/registry/relief.ts'
import { DOMAINES, nombreDeTexte } from '../src/registry/domains.ts'
import { altitudeDuRelief } from '../src/ui/relief-site.ts'
import { SITE_REFERENCE } from './fixtures.ts'

const { latitudeDeg: LAT, longitudeDeg: LON } = SITE_REFERENCE
const cote = R('COTE_TUILE_PX')

/** Une tuile de plaine à l'altitude donnée. */
const plaine =
  (altitude: number): ChargeTuile =>
  async () =>
    new Float32Array(cote * cote).fill(altitude)

beforeEach(async () => {
  const base = await db()
  for (const cle of await base.getAllKeys('reglages')) {
    if (String(cle).startsWith('relief:')) await base.delete('reglages', cle)
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('format Terrarium et tuiles', () => {
  it('décode l’altitude depuis les trois canaux', () => {
    expect(altitudeTerrarium(R('DECALAGE_TERRARIUM_M') / cote, 0, 0)).toBe(0)
    expect(altitudeTerrarium(R('DECALAGE_TERRARIUM_M') / cote, 1, cote / 2)).toBe(1.5)
  })

  it('interpole l’altitude entre les centres de pixels, sans dépasser leurs valeurs', () => {
    // Une tuile dont l'altitude croît d'un mètre par colonne de pixels.
    const p = pixelMonde(LAT, LON, R('ZOOM_TUILE_RELIEF'))
    const tx = Math.floor(p.x / cote)
    const ty = Math.floor(p.y / cote)
    const pente = Float32Array.from({ length: cote * cote }, (_, i) => i % cote)
    const lit = altimetre(new Map([[`${tx}/${ty}`, pente]]))
    const attendue = p.x - 1 / 2 - tx * cote
    expect(lit(LAT, LON)).toBeCloseTo(attendue, 3)
  })

  it('place le site dans une des tuiles couvrantes, sous le plafond', () => {
    const tuiles = tuilesCouvrantes(LAT, LON)!
    expect(tuiles.length).toBeGreaterThan(1)
    expect(tuiles.length).toBeLessThanOrEqual(R('TUILES_RELIEF_MAX'))
    const p = pixelMonde(LAT, LON, R('ZOOM_TUILE_RELIEF'))
    const ici = { x: Math.floor(p.x / cote), y: Math.floor(p.y / cote) }
    expect(tuiles).toContainEqual(ici)
  })

  it('renonce près du pôle, où la maille écrasée ferait exploser le téléchargement', () => {
    expect(tuilesCouvrantes(89.5, LON)).toBeNull()
  })
})

describe('résolution du relief (§4.1, §12.5)', () => {
  it('convertit les tuiles en 360 élévations et les range en cache', async () => {
    const relief = await resoudRelief(LAT, LON, plaine(800))
    expect(relief.etat).toBe('RELIEF')
    if (relief.etat !== 'RELIEF') return
    expect(relief.altitudesDeg).toHaveLength(NB_AZIMUTS)
    expect(await litRelief(cleRelief(LAT, LON))).toEqual(relief)
  })

  it('rend l’altitude du sol au site, celle d’où l’œil regarde (T-0365)', async () => {
    const relief = await resoudRelief(LAT, LON, plaine(812))
    expect(relief.etat).toBe('RELIEF')
    if (relief.etat === 'RELIEF') expect(relief.solM).toBe(812)
  })

  it('lit les tuiles nord en haut : un terrain qui monte vers le nord cache le nord', async () => {
    // L'altitude croît vers le haut de chaque tuile, et de tuile en tuile vers le nord.
    const penteNord: ChargeTuile = async (_z, _x, y) =>
      Float32Array.from({ length: cote * cote }, (_, i) => -(y * cote + Math.floor(i / cote)) * 10)
    const relief = await resoudRelief(LAT, LON, penteNord)
    expect(relief.etat).toBe('RELIEF')
    if (relief.etat !== 'RELIEF') return
    expect(relief.altitudesDeg[0]).toBeGreaterThan(0)
    expect(relief.altitudesDeg[180]).toBe(0)
  })

  it('range les courbes de niveau avec le profil, et les relit (T-0395)', async () => {
    const relief = await resoudRelief(LAT, LON, plaine(800))
    if (relief.etat !== 'RELIEF') throw new Error('relief attendu')
    expect(relief.courbesDeg).toBeInstanceOf(Float32Array)
    expect(relief.signatureCourbes).toBe(signatureCourbes())
    const relu = await litRelief(cleRelief(LAT, LON))
    expect(relu?.courbesDeg).toEqual(relief.courbesDeg)
    expect(relu?.signatureCourbes).toBe(relief.signatureCourbes)
  })

  it('relit un ancien cache sans courbes, et ignore des courbes illisibles (T-0395)', async () => {
    const profil = Array.from({ length: NB_AZIMUTS }, () => 0)
    const cle = cleRelief(LAT, LON)
    await (await db()).put('reglages', { profil, solM: 640 }, cle)
    expect(await litRelief(cle)).toEqual({ etat: 'RELIEF', altitudesDeg: profil, solM: 640 })
    await (await db()).put('reglages', { profil, solM: 640, courbes: [[1, 2]], signatureCourbes: signatureCourbes() }, cle)
    expect(await litRelief(cle)).toEqual({ etat: 'RELIEF', altitudesDeg: profil, solM: 640 })
  })

  it('refait en ligne les courbes d’un cache qui n’en a pas, sinon le garde (T-0395)', async () => {
    const profil = Array.from({ length: NB_AZIMUTS }, () => 0)
    await ecritRelief(cleRelief(LAT, LON), { etat: 'RELIEF', altitudesDeg: profil, solM: 640 })
    const muet: ChargeTuile = async () => null
    expect(await resoudRelief(LAT, LON, muet)).toEqual({
      etat: 'RELIEF',
      altitudesDeg: profil,
      solM: 640,
    })
    const relief = await resoudRelief(LAT, LON, plaine(640))
    if (relief.etat !== 'RELIEF') throw new Error('relief attendu')
    expect(relief.signatureCourbes).toBe(signatureCourbes())
  })

  it('hors réseau, retrouve le relief d’un site déjà visité', async () => {
    const profil = Array.from({ length: NB_AZIMUTS }, (_, az) => az % 7)
    await ecritRelief(cleRelief(LAT, LON), { etat: 'RELIEF', altitudesDeg: profil, solM: 640 })
    vi.stubGlobal('navigator', { onLine: false })
    const chargeur = vi.fn(plaine(0))
    const relief = await resoudRelief(LAT, LON, chargeur)
    expect(relief).toEqual({ etat: 'RELIEF', altitudesDeg: profil, solM: 640 })
    expect(chargeur).not.toHaveBeenCalled()
  })

  it('hors réseau, un site inconnu rend une cause sans rien demander', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const chargeur = vi.fn(plaine(0))
    const relief = await resoudRelief(LAT, LON, chargeur)
    expect(relief.etat).toBe('INDISPONIBLE')
    expect(chargeur).not.toHaveBeenCalled()
  })

  it('une tuile manquante fait tomber tout le profil, sans le ranger', async () => {
    let appels = 0
    const troue: ChargeTuile = async () => (appels++ === 0 ? null : new Float32Array(cote * cote))
    const relief = await resoudRelief(LAT, LON, troue)
    expect(relief.etat).toBe('INDISPONIBLE')
    expect(await (await db()).get('reglages', cleRelief(LAT, LON))).toBeUndefined()
  })

  it('un service qui lève rend une cause lisible, jamais l’exception', async () => {
    const relief = await resoudRelief(LAT, LON, () => Promise.reject(new TypeError('Failed to fetch')))
    expect(relief.etat).toBe('INDISPONIBLE')
    if (relief.etat === 'INDISPONIBLE') expect(relief.cause).not.toMatch(/fetch|Error/)
  })

  it('refuse une tuile aux altitudes illisibles', async () => {
    const relief = await resoudRelief(LAT, LON, async () => new Float32Array(cote * cote).fill(NaN))
    expect(relief.etat).toBe('INDISPONIBLE')
  })

  it('ignore un cache hors du domaine du masque plutôt que de faire tomber le calcul', async () => {
    const horsDomaine = Array.from({ length: NB_AZIMUTS }, () => DOMAINES.masque_horizon_deg.max + 1)
    await ecritRelief(cleRelief(LAT, LON), { etat: 'RELIEF', altitudesDeg: horsDomaine, solM: 0 })
    const relief = await resoudRelief(LAT, LON, plaine(0))
    expect(relief.etat).toBe('RELIEF')
    if (relief.etat === 'RELIEF') expect(relief.altitudesDeg).not.toEqual(horsDomaine)
  })

  it('ignore un cache corrompu et redemande le relief', async () => {
    await (await db()).put('reglages', ['pas', 'un', 'profil'], cleRelief(LAT, LON))
    expect((await resoudRelief(LAT, LON, plaine(0))).etat).toBe('RELIEF')
  })
})

describe('altitude du site depuis le relief (T-0365)', () => {
  const profil = Array.from({ length: NB_AZIMUTS }, () => 0)
  const { min, max } = DOMAINES.altitude_m

  it('écrit le sol au mètre, que le champ relit', () => {
    const texte = altitudeDuRelief({ etat: 'RELIEF', altitudesDeg: profil, solM: 812.6 })
    expect(texte).not.toBeNull()
    expect(nombreDeTexte(texte!)).toBe(813)
  })

  it('n’écrit rien sans relief ni hors du domaine de saisie', () => {
    expect(altitudeDuRelief({ etat: 'INDISPONIBLE', cause: 'hors réseau' })).toBeNull()
    expect(altitudeDuRelief({ etat: 'RELIEF', altitudesDeg: profil, solM: min - 1 })).toBeNull()
    expect(altitudeDuRelief({ etat: 'RELIEF', altitudesDeg: profil, solM: max + 1 })).toBeNull()
  })
})
