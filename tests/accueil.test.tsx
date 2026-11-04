/**
 * T-0448 — onboarding: when it shows, what each step blocks, what skipping keeps, and that a
 * finished one does not come back. Saisies come from the real hooks: a stub would prove nothing
 * about first-start defaults.
 */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { masquePlat } from '../src/core/site.ts'
import { db } from '../src/data/db.ts'
import {
  enregistreProfilActif,
  enregistreSiteActif,
  litProfilActif,
  litSiteActif,
} from '../src/data/persistence.ts'
import { BASE_BOITIERS } from '../src/data/boitiers.ts'
import { Accueil, CorpsEtape } from '../src/ui/Accueil.tsx'
import {
  accueilAProposer,
  etapeValide,
  saisieDePassage,
  type EtapeAccueil,
} from '../src/ui/accueil-calcul.ts'
import {
  useSaisieLieu,
  useSaisieMateriel,
  type SaisieLieu,
  type SaisieMateriel,
} from '../src/ui/app-saisie.ts'
import type { SaisieRestauree } from '../src/ui/app-donnees.ts'
import {
  departLieu,
  departMateriel,
  profilAEnregistrer,
  siteAEnregistrer,
} from '../src/ui/saisie-persistee.ts'

function saisiesNeuves(): { readonly lieu: SaisieLieu; readonly materiel: SaisieMateriel } {
  let saisies: { lieu: SaisieLieu; materiel: SaisieMateriel } | undefined
  function Capture() {
    saisies = { lieu: useSaisieLieu(null), materiel: useSaisieMateriel(null) }
    return null
  }
  renderToStaticMarkup(<Capture />)
  if (saisies === undefined) throw new Error('hooks non rendus')
  return saisies
}

function rendu(etape: EtapeAccueil): string {
  const { lieu, materiel } = saisiesNeuves()
  return renderToStaticMarkup(<CorpsEtape etape={etape} lieu={lieu} materiel={materiel} />)
}

const NEUF: SaisieRestauree = Object.freeze({
  lieu: null,
  materiel: null,
  poids: null,
  erreur: null,
  ecritAuDepart: false,
})

describe('accueilAProposer', () => {
  it('propose sur un profil neuf', () => {
    expect(accueilAProposer(NEUF, true)).toBe(true)
  })

  it('se tait sans IndexedDB : rien ne s’enregistrerait, il reviendrait à chaque lancement', () => {
    expect(accueilAProposer(NEUF, false)).toBe(false)
  })

  it('se tait sur une base illisible', () => {
    expect(accueilAProposer({ ...NEUF, erreur: 'illisible' }, true)).toBe(false)
  })

  it('se tait dès qu’un lieu ou un matériel existe', () => {
    const { lieu, materiel } = saisiesNeuves()
    expect(accueilAProposer({ ...NEUF, lieu }, true)).toBe(false)
    expect(accueilAProposer({ ...NEUF, materiel }, true)).toBe(false)
  })
})

describe('etapeValide', () => {
  it('accepte les valeurs de départ à chaque étape', () => {
    const { lieu, materiel } = saisiesNeuves()
    for (const etape of ['bienvenue', 'lieu', 'materiel'] as const) {
      expect(etapeValide(etape, lieu, materiel)).toBe(true)
    }
  })

  it.each(['latitude', 'longitude', 'bortle'] as const)('refuse un lieu sans %s', (champ) => {
    const { lieu, materiel } = saisiesNeuves()
    expect(etapeValide('lieu', { ...lieu, [champ]: '' }, materiel)).toBe(false)
  })

  it('refuse un boîtier personnalisé sans résolution, pas un boîtier de la base', () => {
    const { lieu, materiel } = saisiesNeuves()
    const sansResolution = { ...materiel, boitier: { ...materiel.boitier, resolutionMpx: '' } }
    expect(etapeValide('materiel', lieu, sansResolution)).toBe(false)
    const ligne = BASE_BOITIERS[0]
    if (ligne === undefined) throw new Error('base vide')
    expect(etapeValide('materiel', lieu, { ...sansResolution, boitierId: ligne.id })).toBe(true)
  })

  it('refuse un matériel sans focale chiffrable', () => {
    const { lieu, materiel } = saisiesNeuves()
    const sansParc = { ...materiel, objectifs: [], objectifId: '', focale: '' }
    expect(etapeValide('materiel', lieu, sansParc)).toBe(false)
  })
})

describe('saisieDePassage', () => {
  it('garde le lieu validé seulement quand on passe le matériel', () => {
    const { lieu } = saisiesNeuves()
    expect(saisieDePassage('bienvenue', lieu)).toEqual({ lieu: null, materiel: null })
    expect(saisieDePassage('lieu', lieu)).toEqual({ lieu: null, materiel: null })
    expect(saisieDePassage('materiel', lieu)).toEqual({ lieu, materiel: null })
  })
})

describe('rendu', () => {
  it('ouvre sur la bienvenue, étape 1, sans retour', () => {
    const html = renderToStaticMarkup(<Accueil surFin={() => undefined} />)
    expect(html).toContain('Bienvenue sur Orion')
    expect(html).toContain('Passer')
    expect(html).toContain('Suivant')
    expect(html).not.toContain('Retour')
  })

  it('demande le lieu et le Bortle', () => {
    const { lieu } = saisiesNeuves()
    const html = rendu('lieu')
    expect(html).toContain(`value="${lieu.latitude}"`)
    expect(html).toContain(`value="${lieu.bortle}"`)
    expect(html).toContain('pollution lumineuse')
  })

  it('demande monture, boîtier et objectifs, sans ISO ni poids d’image', () => {
    const html = rendu('materiel')
    expect(html).toContain('Pas de suivi')
    expect(html).toContain('Personnalisé')
    expect(html).toContain('Ajouter un objectif')
    expect(html).not.toContain('avancees')
    expect(html).not.toContain('Plein format</option><option value="APSC_CROP"')
    expect(html).not.toContain('recommandé')
  })
})

describe('après l’onboarding', () => {
  beforeEach(async () => {
    const base = await db()
    await base.clear('sites')
    await base.clear('profils')
  })

  it('une base neuve le propose, la relecture après écriture ne le propose plus', async () => {
    expect(departLieu(await litSiteActif())).toBeNull()
    expect(departMateriel(await litProfilActif())).toBeNull()

    const { lieu, materiel } = saisiesNeuves()
    const site = siteAEnregistrer(lieu, masquePlat())
    const profil = profilAEnregistrer(materiel)
    if (site === null || profil === null) throw new Error('saisie de départ non chiffrable')
    await enregistreSiteActif(site)
    await enregistreProfilActif(profil)

    const relue = {
      ...NEUF,
      lieu: departLieu(await litSiteActif()),
      materiel: departMateriel(await litProfilActif()),
    }
    expect(accueilAProposer(relue, true)).toBe(false)
    expect(relue.lieu?.latitude).toBe(lieu.latitude)
  })
})
