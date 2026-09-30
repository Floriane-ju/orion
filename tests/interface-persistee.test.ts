/**
 * T-0362 — l'état de l'interface survit au rechargement : catalogue, fiche ouverte, mode,
 * filé, réglages de fiche et cartes se relisent tels qu'on les a laissés.
 *
 * Chaque magasin se relit au chargement de son module : un rechargement se simule donc en
 * réimportant les modules après `vi.resetModules()`, sur un stockage déjà rempli.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { objetGalaxie } from './fixtures.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import { PRESETS_SNR } from '../src/registry/verdicts.ts'

let cles: Map<string, string>

beforeEach(() => {
  cles = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (c: string) => cles.get(c) ?? null,
    setItem: (c: string, v: string) => void cles.set(c, v),
  })
  // `gardeAuDepart` s'abonne au départ de la page : une cible d'évènements suffit à le rejouer.
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Le départ de la page, puis un nouveau chargement des modules sur le même stockage. */
function recharge(): void {
  window.dispatchEvent(new Event('pagehide'))
  vi.resetModules()
}

describe('T-0362 — interface persistée', () => {
  it('le catalogue se rouvre avec sa case, sa recherche et ses filtres', async () => {
    const avant = await import('../src/ui/catalogue-etat.ts')
    const magMax = DOMAINES.m_int.min
    avant.majCatalogue({
      photographiablesSeules: false,
      recherche: 'andro',
      types: new Set(['GALAXIE'] as const),
      magMax,
    })
    recharge()
    const { etatCatalogue } = await import('../src/ui/catalogue-etat.ts')
    expect(etatCatalogue()).toMatchObject({ photographiablesSeules: false, recherche: 'andro', magMax })
    expect([...etatCatalogue().types]).toEqual(['GALAXIE'])
  })

  it('un catalogue abîmé ne rend que ses champs sains', async () => {
    cles.set(
      'orion.catalogue',
      JSON.stringify({ photographiablesSeules: false, magMax: 'x', types: ['PULSAR', 'GALAXIE'] }),
    )
    const { etatCatalogue } = await import('../src/ui/catalogue-etat.ts')
    const etat = etatCatalogue()
    expect(etat.photographiablesSeules).toBe(false)
    expect(etat.magMax).toBe(DOMAINES.m_int.max)
    expect([...etat.types]).toEqual(['GALAXIE'])
  })

  it('la fiche ouverte se rouvre dès que le catalogue arrive, réglages compris', async () => {
    const m31 = objetGalaxie({ designation: 'M31' })
    const snr = PRESETS_SNR.at(-1)!.valeur
    const avant = await import('../src/ui/seance-etat.ts')
    avant.ouvreCible(m31)
    avant.majFiche({ snrCible: snr, filtreDualBand: true })
    avant.majFile({ poseDansCadre: true })
    recharge()

    const apres = await import('../src/ui/seance-etat.ts')
    expect(apres.etatSeance().cible).toBeNull()
    expect(apres.etatSeance().vueCibles).toBe('FICHE')
    apres.relieCible([objetGalaxie({ designation: 'M42' }), m31])
    expect(apres.etatSeance().cible?.designation).toBe('M31')
    expect(apres.etatSeance().fiche).toMatchObject({ snrCible: snr, filtreDualBand: true })
    expect(apres.etatSeance().file.poseDansCadre).toBe(true)
  })

  it('ouvrir une AUTRE cible rend la fiche à ses réglages de départ', async () => {
    const { ouvreCible, majFiche, etatSeance } = await import('../src/ui/seance-etat.ts')
    ouvreCible(objetGalaxie({ designation: 'M31' }))
    const depart = etatSeance().fiche
    majFiche({ permissif: true })
    ouvreCible(objetGalaxie({ designation: 'M31' }))
    expect(etatSeance().fiche.permissif).toBe(true)
    ouvreCible(objetGalaxie({ designation: 'M33' }))
    expect(etatSeance().fiche).toStrictEqual(depart)
  })

  it('un préréglage de qualité inconnu du registre est oublié', async () => {
    cles.set('orion.seance', JSON.stringify({ fiche: { snrCible: -1 }, mode: 'AUTRE' }))
    const { etatSeance } = await import('../src/ui/seance-etat.ts')
    expect(PRESETS_SNR.map((p) => p.valeur)).toContain(etatSeance().fiche.snrCible)
    expect(etatSeance().mode).toBe('CIEL_PROFOND')
  })

  it('les cartes dépliées le restent', async () => {
    const avant = await import('../src/ui/coque-etat.ts')
    avant.basculeCarte('OPTIQUE')
    recharge()
    const { etatCoque } = await import('../src/ui/coque-etat.ts')
    expect(etatCoque().cartes.OPTIQUE.ouverte).toBe(true)
    expect(etatCoque().cartes.SITE.ouverte).toBe(false)
  })
})
