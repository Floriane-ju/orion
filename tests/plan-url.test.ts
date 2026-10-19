/**
 * T-0431 — le plan de la nuit voyage par un lien : la nuit, le lieu et les cibles choisies
 * s'écrivent dans la query string et s'y relisent sur un autre appareil. Le trajet vérifié
 * est l'aller-retour : une écriture qui ne se relit pas ne transporte rien.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appliqueLieuUrl,
  ecritPlanUrl,
  lienDuPlan,
  litPlanUrl,
  type PlanAEcrire,
} from '../src/ui/plan-url.ts'
import { DEFAUT, nuitDeLaScene } from '../src/ui/app-saisie.ts'
import { avecPlanUrl } from '../src/ui/app-donnees.ts'
import { ciblesChoisies, reinitialiseCiblesChoisies } from '../src/ui/cibles-choisies.ts'
import { ecritCiblesChoisies, litCiblesChoisies } from '../src/data/db.ts'
import { reinitialiseScene } from '../src/ui/scene-etat.ts'
import { DOMAINES } from '../src/registry/domains.ts'

function plan(champs: Partial<PlanAEcrire> = {}): PlanAEcrire {
  return {
    nuitIso: '2026-10-24',
    latitude: '45.76',
    longitude: '4.84',
    altitude: '170',
    bortle: '4',
    sqm: '',
    cibles: ['M31', 'NGC7000'],
    ...champs,
  }
}

describe('T-0431 — plan de la nuit dans l’URL', () => {
  it('se relit tel qu’il s’est écrit', () => {
    const relu = litPlanUrl(ecritPlanUrl(plan()))
    expect(relu).toEqual({
      nuitIso: '2026-10-24',
      lieu: { latitude: '45.76', longitude: '4.84', altitude: '170', bortle: '4', sqm: '' },
      cibles: ['M31', 'NGC7000'],
    })
  })

  it('sépare les cibles d’une virgule lisible', () => {
    const ecrit = ecritPlanUrl(plan({ cibles: ['M31', 'M42', 'M44'] }))
    expect(ecrit).toContain('cible=M31,M42,M44')
    expect(litPlanUrl(ecrit).cibles).toEqual(['M31', 'M42', 'M44'])
  })

  it('garde le SQM quand c’est lui qui décrit le ciel', () => {
    const relu = litPlanUrl(ecritPlanUrl(plan({ bortle: '', sqm: '21.3' })))
    expect(relu.lieu).toMatchObject({ bortle: '', sqm: '21.3' })
  })

  it('n’écrit pas un champ en cours de frappe', () => {
    const ecrit = ecritPlanUrl(plan({ latitude: '4x' }))
    expect(new URLSearchParams(ecrit).has('lat')).toBe(false)
    expect(litPlanUrl(ecrit).lieu).toBeUndefined()
  })

  it('ignore une valeur hors domaine sans perdre le reste', () => {
    const hors = String(DOMAINES.latitude_deg.max + 1)
    const relu = litPlanUrl(`?nuit=2026-10-24&lat=${hors}&lon=4.84&alt=170&cible=M31`)
    expect(relu.lieu).toBeUndefined()
    expect(relu.nuitIso).toBe('2026-10-24')
    expect(relu.cibles).toEqual(['M31'])
  })

  it('ignore une nuit qui n’est pas un jour du calendrier', () => {
    expect(litPlanUrl('?nuit=2026-02-31').nuitIso).toBeUndefined()
    expect(litPlanUrl('?nuit=demain').nuitIso).toBeUndefined()
  })

  it('distingue une sélection vide d’une URL qui n’en dit rien', () => {
    expect(litPlanUrl('').cibles).toBeUndefined()
    expect(litPlanUrl(ecritPlanUrl(plan({ cibles: [] }))).cibles).toEqual([])
  })

  it('le lien copié est l’adresse de l’application suivie du plan', () => {
    vi.stubGlobal('location', { origin: 'https://orion.example', pathname: '/orion/', hash: '#info' })
    expect(lienDuPlan(plan())).toBe(`https://orion.example/orion/${ecritPlanUrl(plan())}`)
    vi.unstubAllGlobals()
  })

  it('le lieu de l’URL remplace celui enregistré, ou les valeurs de départ', () => {
    const url = litPlanUrl(ecritPlanUrl(plan()))
    const enregistre = { latitude: '1', longitude: '2', altitude: '3', bortle: '7', sqm: '' }
    expect(appliqueLieuUrl(enregistre, url)).toEqual(url.lieu)
    expect(appliqueLieuUrl(null, url)).toEqual(url.lieu)
    expect(appliqueLieuUrl(enregistre, {})).toBe(enregistre)
  })

  it('un lieu sans ciel déclaré garde le ciel enregistré', () => {
    const url = litPlanUrl('?lat=45.76&lon=4.84&alt=170')
    const enregistre = { latitude: '1', longitude: '2', altitude: '3', bortle: '', sqm: '20.5' }
    expect(appliqueLieuUrl(enregistre, url)).toMatchObject({ bortle: '', sqm: '20.5' })
    expect(appliqueLieuUrl(null, url)).toMatchObject({ bortle: DEFAUT.bortle, sqm: '' })
  })
})

describe('T-0431 — ouvrir le lien sur un autre appareil', () => {
  const RESTAUREE = Object.freeze({
    lieu: { latitude: '1', longitude: '2', altitude: '3', bortle: '7', sqm: '' },
    materiel: null,
    poids: null,
    erreur: null,
    planDeLUrl: false,
  })
  const NUIT_LOINTAINE = `${DOMAINES.annee_affichee.min + 1}-06-15`

  beforeEach(async () => {
    reinitialiseCiblesChoisies()
    reinitialiseScene()
    await ecritCiblesChoisies(['M42'])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const remplace = vi.fn()

  function ouvre(search: string, ouvreEcritures = true) {
    remplace.mockClear()
    vi.stubGlobal('location', { search, hash: '#info', pathname: '/orion/' })
    vi.stubGlobal('history', { state: null, replaceState: remplace })
    return avecPlanUrl(RESTAUREE, ['M42'], ouvreEcritures)
  }

  it('le plan enregistré quitte l’URL, le fragment reste', () => {
    ouvre('?nuit=2026-10-24&cible=M31')
    expect(remplace).toHaveBeenCalledWith(null, '', '/orion/#info')
  })

  it('une URL nue n’est pas réécrite', () => {
    ouvre('')
    expect(remplace).not.toHaveBeenCalled()
  })

  it('le plan non enregistré reste dans l’URL, seule copie qui survive au rechargement', () => {
    ouvre('?nuit=2026-10-24&cible=M31', false)
    expect(remplace).not.toHaveBeenCalled()
  })

  it('l’URL l’emporte sur la sélection, le lieu et la nuit enregistrés', async () => {
    const restauree = ouvre(
      `?nuit=${NUIT_LOINTAINE}&lat=45.76&lon=4.84&alt=170&bortle=4&cible=M31`,
    )
    expect([...ciblesChoisies()]).toEqual(['M31'])
    expect(restauree.lieu).toEqual({
      latitude: '45.76',
      longitude: '4.84',
      altitude: '170',
      bortle: '4',
      sqm: '',
    })
    expect(restauree.planDeLUrl).toBe(true)
    expect(nuitDeLaScene()).toBe(NUIT_LOINTAINE)
    await vi.waitFor(async () => expect(await litCiblesChoisies()).toEqual(['M31']))
  })

  it('une URL nue laisse la base répondre', () => {
    const restauree = ouvre('')
    expect([...ciblesChoisies()]).toEqual(['M42'])
    expect(restauree).toEqual(RESTAUREE)
  })

  it('une base illisible affiche l’URL sans rien y écrire', async () => {
    const restauree = ouvre('?nuit=2026-10-24&lat=45.76&lon=4.84&alt=170&cible=M31', false)
    expect([...ciblesChoisies()]).toEqual(['M31'])
    expect(restauree.planDeLUrl).toBe(false)
    expect(await litCiblesChoisies()).toEqual(['M42'])
  })
})
