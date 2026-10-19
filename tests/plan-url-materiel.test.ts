/**
 * T-0431 — le matériel et les poids de scoring voyagent dans l'URL avec le plan : ce sont eux
 * qui fixent la pose, le cadrage et l'ordre des cibles. Sans eux, le même lien donnait un autre
 * plan sur l'autre appareil.
 */

import { describe, expect, it } from 'vitest'
import { ecritPlanUrl, litPlanUrl, type PlanAEcrire } from '../src/ui/plan-url.ts'
import { appliqueMaterielUrl, type MaterielAEcrire } from '../src/ui/plan-url-materiel.ts'
import { MATERIEL_PAR_DEFAUT, type DepartMateriel } from '../src/ui/app-saisie.ts'
import { BASE_BOITIERS } from '../src/data/boitiers.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import { poidsParDefaut } from '../src/core/session.ts'
import type { Objectif } from '../src/core/objectif.ts'

const LIGNE = BASE_BOITIERS[0]!

const ZOOM: Objectif = {
  id: 'zoom-a',
  nom: '24–70 mm f/2,8–4',
  focaleMinMm: 24,
  focaleMaxMm: 70,
  ouvertureGrandAngleN: 2.8,
  ouvertureTeleN: 4,
  typeObjectif: 'RECTILINEAIRE',
}

function materiel(champs: Partial<MaterielAEcrire> = {}): MaterielAEcrire {
  return {
    boitierId: LIGNE.id,
    boitier: { ...LIGNE.saisie, tailleRawMo: '30' },
    iso: '1600',
    objectifs: [ZOOM],
    objectifId: ZOOM.id,
    focale: '50',
    ouverture: '3.4',
    capteurMode: 'APSC_CROP',
    typeObjectif: 'RECTILINEAIRE',
    suiviActif: true,
    qualiteMes: 'SOIGNEE',
    typeMonture: 'GEM',
    ...champs,
  }
}

function plan(champs: Partial<PlanAEcrire> = {}): PlanAEcrire {
  return {
    nuitIso: '2026-10-24',
    latitude: '45.76',
    longitude: '4.84',
    altitude: '170',
    bortle: '4',
    sqm: '',
    cibles: [],
    materiel: materiel(),
    ...champs,
  }
}

const relu = (p: PlanAEcrire) => litPlanUrl(ecritPlanUrl(p))

describe('T-0431 — matériel dans l’URL', () => {
  it('reprend le boîtier de la base, l’ISO, l’objectif monté et la monture', () => {
    const depart = appliqueMaterielUrl(null, relu(plan()), 'nouvel-id')
    expect(depart).toEqual({
      boitierId: LIGNE.id,
      boitier: { ...LIGNE.saisie, tailleRawMo: '30' },
      iso: '1600',
      objectifs: [{ ...ZOOM, id: 'nouvel-id' }],
      objectifId: 'nouvel-id',
      focale: '50',
      ouverture: '3.4',
      capteurMode: 'APSC_CROP',
      typeObjectif: 'RECTILINEAIRE',
      suiviActif: true,
      qualiteMes: 'SOIGNEE',
      typeMonture: 'GEM',
    })
  })

  it('monte l’objectif déjà au parc plutôt que de le dupliquer', () => {
    const parc = [{ ...ZOOM, id: 'chez-b', nom: 'mon zoom' }]
    const base: DepartMateriel = { ...MATERIEL_PAR_DEFAUT, objectifs: parc, objectifId: 'chez-b' }
    const depart = appliqueMaterielUrl(base, relu(plan()), 'nouvel-id')
    expect(depart?.objectifs).toBe(parc)
    expect(depart?.objectifId).toBe('chez-b')
  })

  it('un boîtier personnalisé voyage avec ses grandeurs, les vides restent vides', () => {
    const boitier = { ...MATERIEL_PAR_DEFAUT.boitier, formatCapteur: 'APSC_CANON', zpSys: '20.5' } as const
    const url = relu(plan({ materiel: materiel({ boitierId: '', boitier }) }))
    const base: DepartMateriel = {
      ...MATERIEL_PAR_DEFAUT,
      boitier: { ...MATERIEL_PAR_DEFAUT.boitier, readNoiseE: '3' },
    }
    const depart = appliqueMaterielUrl(base, url, 'id')
    expect(depart?.boitierId).toBeUndefined()
    expect(depart?.boitier).toEqual(boitier)
  })

  it('l’objectif libre voyage par sa focale, son ouverture et sa projection', () => {
    const url = relu(
      plan({
        materiel: materiel({ objectifs: [], objectifId: '', focale: '14', ouverture: '2.8', typeObjectif: 'FISHEYE' }),
      }),
    )
    const depart = appliqueMaterielUrl(null, url, 'id')
    expect(depart).toMatchObject({ focale: '14', ouverture: '2.8', typeObjectif: 'FISHEYE' })
    expect(depart?.objectifs).toBeUndefined()
  })

  it('une URL sans matériel laisse celui de l’appareil', () => {
    const base: DepartMateriel = { ...MATERIEL_PAR_DEFAUT, iso: '800' }
    expect(appliqueMaterielUrl(base, litPlanUrl('?nuit=2026-10-24'), 'id')).toBe(base)
  })

  it('une valeur hors domaine retombe sur la valeur de départ, sans perdre le reste', () => {
    const hors = String(DOMAINES.iso_capture.max + 1)
    const ecrit = ecritPlanUrl(plan()).replace('iso=1600', `iso=${hors}`)
    const depart = appliqueMaterielUrl(null, litPlanUrl(ecrit), 'id')
    expect(depart?.iso).toBe(MATERIEL_PAR_DEFAUT.iso)
    expect(depart?.boitierId).toBe(LIGNE.id)
  })
})

describe('T-0431 — poids de scoring dans l’URL', () => {
  it('se relisent tels qu’ils se sont écrits', () => {
    const poids = { ...poidsParDefaut(), lune: DOMAINES.poids_scoring.max }
    expect(relu(plan({ poids })).poids).toEqual(poids)
  })

  it('un poids hors domaine écarte les cinq : ils ne valent qu’ensemble', () => {
    const poids = { ...poidsParDefaut(), lune: DOMAINES.poids_scoring.max + 1 }
    expect(relu(plan({ poids })).poids).toBeUndefined()
  })
})
