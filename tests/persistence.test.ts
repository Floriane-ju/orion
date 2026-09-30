/**
 * §12.3 — l'export JSON est la seule protection contre l'éviction pour ce qui ne se
 * retélécharge pas. Il n'a de valeur que si le réimport restaure sans perte.
 *
 * `fake-indexeddb/auto` fournit l'implémentation IndexedDB manquante à Node.
 */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type PlanEnregistre, type ProfilMateriel, type SiteEnregistre } from '../src/data/db.ts'
import {
  ExportInvalideError,
  ID_SITE_ACTIF,
  VERSION_EXPORT,
  enregistreSiteActif,
  exporteDonneesUtilisateur,
  importeDonneesUtilisateur,
  importeFichierUtilisateur,
  enregistrePoidsScoring,
  litPoidsScoring,
  litPointsMasqueActif,
} from '../src/data/persistence.ts'
import { masqueDepuisPoints, NB_AZIMUTS, obstructionDeg } from '../src/core/site.ts'
import { normalisePoids } from '../src/core/session.ts'

const SITE: SiteEnregistre = {
  id: 'site-reference',
  nom: 'Annexe A',
  latitudeDeg: 46.391,
  longitudeDeg: 6.697,
  altitudeM: 500,
  fuseau: 'Europe/Zurich',
  bortleDeclare: 4.5,
  // Le masque édité à la main est précisément ce qu'une éviction détruirait sans retour.
  masqueHorizon: Array.from({ length: 360 }, (_, azimut) => (azimut < 90 ? 12 : 3)),
  masqueEstHypothese: false,
}

const PROFIL: ProfilMateriel = {
  id: 'profil-1',
  nom: '135 mm sur tracker',
  focaleMm: 135,
  ouvertureN: 2.8,
  typeObjectif: 'RECTILINEAIRE',
  formatCapteur: 'PLEIN_FORMAT',
  capteurMode: 'FULL_FRAME',
  suiviActif: true,
  qualiteMes: 'SOIGNEE',
  typeMonture: 'TRACKER',
}

const PLAN: PlanEnregistre = {
  id: 'plan-1',
  nom: 'Nuit du 14 août',
  dateIso: '2026-08-14',
  siteId: SITE.id,
  profilId: PROFIL.id,
  versionRegistre: '1',
  contenu: { creneaux: [{ cible: 'M31', debut: '22:41', poses: 120 }] },
}

/** `db()` mémorise sa connexion : chaque test réécrit le jeu de départ plutôt que de
 * rouvrir une base neuve. */
beforeEach(async () => {
  const base = await db()
  const tx = base.transaction(['sites', 'profils', 'plans'], 'readwrite')
  await Promise.all([
    tx.objectStore('sites').put(SITE),
    tx.objectStore('profils').put(PROFIL),
    tx.objectStore('plans').put(PLAN),
    tx.done,
  ])
})

describe('export et réimport §12.3', () => {
  it('emporte toutes les données produites par l’utilisateur', async () => {
    const donnees = await exporteDonneesUtilisateur()
    expect(donnees.format).toBe('orion-export')
    expect(donnees.version).toBe(VERSION_EXPORT)
    expect(donnees.sites).toHaveLength(1)
    expect(donnees.profils).toHaveLength(1)
    expect(donnees.plans).toHaveLength(1)
  })

  it('restaure sans perte après une éviction du stockage', async () => {
    // Sérialisation réelle : c'est un fichier qui transite, pas des objets en mémoire.
    const fichier = JSON.stringify(await exporteDonneesUtilisateur())

    const base = await db()
    const vidage = base.transaction(['sites', 'profils', 'plans'], 'readwrite')
    await Promise.all([
      vidage.objectStore('sites').clear(),
      vidage.objectStore('profils').clear(),
      vidage.objectStore('plans').clear(),
      vidage.done,
    ])
    expect(await base.getAll('sites')).toHaveLength(0)

    await importeDonneesUtilisateur(JSON.parse(fichier))

    const apres = await exporteDonneesUtilisateur()
    expect(apres.sites[0]).toEqual(SITE)
    expect(apres.profils[0]).toEqual(PROFIL)
    expect(apres.plans[0]).toEqual(PLAN)
    expect(apres.sites[0]?.masqueHorizon).toHaveLength(360)
  })

  it('remplace l’entrée de même identifiant au lieu de la dupliquer', async () => {
    const renomme = { ...SITE, nom: 'Site renommé' }
    await importeDonneesUtilisateur({
      format: 'orion-export',
      version: VERSION_EXPORT,
      exporteLe: new Date().toISOString(),
      sites: [renomme],
      profils: [],
      plans: [],
    })
    const apres = await exporteDonneesUtilisateur()
    expect(apres.sites).toHaveLength(1)
    expect(apres.sites[0]?.nom).toBe('Site renommé')
  })

  // Le produit s'appelait Astrofort : un fichier sauvé sous ce nom reste la seule copie de
  // données que rien ne retélécharge. Le renommage ne doit pas la rendre illisible.
  it('relit un export écrit sous l’ancien nom du produit', async () => {
    const ancien = { ...SITE, id: 'site-ancien-format', nom: 'Site d’avant' }
    await importeDonneesUtilisateur({
      format: 'astrofort-export',
      version: VERSION_EXPORT,
      exporteLe: new Date().toISOString(),
      sites: [ancien],
      profils: [],
      plans: [],
    })
    const apres = await exporteDonneesUtilisateur()
    expect(apres.sites.map((site) => site.id)).toContain('site-ancien-format')
    // `beforeEach` réécrit le jeu de départ sans vider la base : ce site en plus fausserait
    // les tests suivants, qui comptent les leurs.
    await (await db()).delete('sites', ancien.id)
  })

  it('refuse un fichier étranger sans écraser les données en place', async () => {
    await expect(importeDonneesUtilisateur({ format: 'autre-appli' })).rejects.toThrow(
      ExportInvalideError,
    )
    await expect(
      importeDonneesUtilisateur({ format: 'orion-export', version: 99 }),
    ).rejects.toThrow(/version 99/)
    await expect(importeDonneesUtilisateur('pas un objet')).rejects.toThrow(ExportInvalideError)
    expect((await exporteDonneesUtilisateur()).sites[0]).toEqual(SITE)
  })
})

/** Un export bien formé autour de la section que le test veut abîmer. */
function exportAvec(sections: Partial<Record<'sites' | 'profils' | 'plans', readonly unknown[]>>) {
  return {
    format: 'orion-export',
    version: VERSION_EXPORT,
    exporteLe: new Date().toISOString(),
    sites: [],
    profils: [],
    plans: [],
    ...sections,
  }
}

describe('validation du réimport §12.3', () => {
  it('affiche une cause lisible quand le fichier n’est pas du JSON', async () => {
    await expect(importeFichierUtilisateur('{ ceci n’est pas du JSON')).rejects.toThrow(
      ExportInvalideError,
    )
    await expect(importeFichierUtilisateur('{ ceci n’est pas du JSON')).rejects.toThrow(/JSON/)
  })

  it('affiche une cause lisible quand la version de l’export est inconnue', async () => {
    await expect(
      importeFichierUtilisateur(JSON.stringify({ ...exportAvec({}), version: 99 })),
    ).rejects.toThrow(/version 99/)
  })

  it('refuse un site à latitude non numérique en nommant le champ et l’enregistrement', async () => {
    const abime = { ...SITE, id: 'site-abime', latitudeDeg: 'abc' }
    await expect(importeDonneesUtilisateur(exportAvec({ sites: [abime] }))).rejects.toThrow(
      /site-abime/,
    )
    await expect(importeDonneesUtilisateur(exportAvec({ sites: [abime] }))).rejects.toThrow(
      /latitude/,
    )
  })

  it('refuse une latitude hors de la plage du registre', async () => {
    const abime = { ...SITE, id: 'site-hors-plage', latitudeDeg: 120 }
    await expect(importeDonneesUtilisateur(exportAvec({ sites: [abime] }))).rejects.toThrow(
      /latitude/,
    )
  })

  it('refuse un profil dont l’énuméré est inconnu', async () => {
    const abime = { ...PROFIL, id: 'profil-abime', capteurMode: 'MOYEN_FORMAT' }
    await expect(importeDonneesUtilisateur(exportAvec({ profils: [abime] }))).rejects.toThrow(
      /capteurMode/,
    )
  })

  it('n’écrit rien à moitié quand un seul enregistrement est invalide', async () => {
    const valide = { ...SITE, id: 'site-valide', nom: 'Site valide' }
    const abime = { ...SITE, id: 'site-abime', altitudeM: null }
    await expect(
      importeDonneesUtilisateur(exportAvec({ sites: [valide, abime] })),
    ).rejects.toThrow(ExportInvalideError)
    const apres = await exporteDonneesUtilisateur()
    expect(apres.sites.map((s) => s.id)).toEqual([SITE.id])
  })

  it('accepte un export produit par l’application', async () => {
    const fichier = JSON.stringify(await exporteDonneesUtilisateur())
    await expect(importeFichierUtilisateur(fichier)).resolves.toBeNull()
  })
})

/**
 * §8.3 — les poids de scoring ne se retéléchargent pas non plus : réglés puis perdus, le plan
 * suivant serait réordonné par les valeurs C-15 sans que rien ne l'annonce.
 */
describe('poids de scoring §8.3 → §12.3', () => {
  it('part dans l’export, normalisé comme le plan l’a utilisé', async () => {
    const donnees = await exporteDonneesUtilisateur({
      cadrage: 0.6,
      hauteur: 0.6,
      signal: 0.6,
      fenetre: 0.6,
      lune: 0.6,
    })
    expect(donnees.poids).toBeDefined()
    const somme = Object.values(donnees.poids!).reduce((a, b) => a + b, 0)
    expect(somme).toBeCloseTo(1, 12)
  })

  it('revient tel quel à l’import, et la base le garde pour le rechargement', async () => {
    const poids = normalisePoids({ cadrage: 0.9, hauteur: 0.1, signal: 0.2, fenetre: 0.3, lune: 0.4 })
    const fichier = JSON.stringify(await exporteDonneesUtilisateur(poids))
    await expect(importeFichierUtilisateur(fichier)).resolves.toStrictEqual(poids)
    await expect(litPoidsScoring()).resolves.toStrictEqual(poids)
  })

  it('T-0362 — réglés, ils survivent au rechargement ; abîmés en base, ils retombent sur C-15', async () => {
    const poids = { cadrage: 0.5, hauteur: 0.1, signal: 0.2, fenetre: 0.1, lune: 0.1 }
    await enregistrePoidsScoring(poids)
    await expect(litPoidsScoring()).resolves.toStrictEqual(poids)
    await (await db()).put('reglages', { cadrage: 'x' }, 'poids-scoring')
    await expect(litPoidsScoring()).resolves.toBeNull()
  })

  it('reste absent des exports antérieurs, qui restent importables', async () => {
    const donnees = await exporteDonneesUtilisateur()
    expect(donnees.poids).toBeUndefined()
    await expect(importeDonneesUtilisateur(donnees)).resolves.toBeNull()
  })

  it('refuse un poids hors du domaine du registre plutôt que de fausser le score', async () => {
    const abime = exportAvec({})
    await expect(
      importeDonneesUtilisateur({
        ...abime,
        poids: { cadrage: 2, hauteur: 0.2, signal: 0.2, fenetre: 0.2, lune: 0.2 },
      }),
    ).rejects.toThrow(/cadrage/)
  })

  it('refuse un objet de poids incomplet : cinq critères ou aucun', async () => {
    await expect(
      importeDonneesUtilisateur({ ...exportAvec({}), poids: { cadrage: 0.2 } }),
    ).rejects.toThrow(ExportInvalideError)
  })
})

describe('masque d’horizon relevé à la main §4.1 → §12.3', () => {
  const RELEVES = [
    { azimutDeg: 150, altitudeDeg: 22 },
    { azimutDeg: 210, altitudeDeg: 22 },
  ]

  it('part dans l’export et revient à l’import, relevés compris', async () => {
    const masque = masqueDepuisPoints(RELEVES)
    await enregistreSiteActif({
      latitudeDeg: 46.391,
      longitudeDeg: 6.697,
      altitudeM: 500,
      masque,
      pointsMasque: RELEVES,
    })

    const fichier = JSON.stringify(await exporteDonneesUtilisateur())
    const base = await db()
    const vidage = base.transaction('sites', 'readwrite')
    await Promise.all([vidage.objectStore('sites').clear(), vidage.done])
    expect(await litPointsMasqueActif()).toHaveLength(0)

    await importeFichierUtilisateur(fichier)

    const restaure = (await base.getAll('sites')).find((s) => s.id === ID_SITE_ACTIF)
    expect(restaure?.masqueHorizon).toHaveLength(NB_AZIMUTS)
    expect(restaure?.masqueEstHypothese).toBe(false)
    expect(await litPointsMasqueActif()).toEqual(RELEVES)
    // Le profil restauré redonne le même relief qu'avant l'export.
    expect(restaure?.masqueHorizon?.[165]).toBe(obstructionDeg(masque, 165))
  })

  it('refuse un relevé hors domaine plutôt que de l’importer', async () => {
    await expect(
      importeDonneesUtilisateur({
        format: 'orion-export',
        version: VERSION_EXPORT,
        exporteLe: new Date().toISOString(),
        sites: [{ ...SITE, masquePoints: [{ azimutDeg: 12, altitudeDeg: 95 }] }],
        profils: [],
        plans: [],
      }),
    ).rejects.toThrow(ExportInvalideError)
  })

  it('n’enregistre pas un site dont les coordonnées ne sont pas chiffrables', async () => {
    const base = await db()
    await base.delete('sites', ID_SITE_ACTIF)
    await enregistreSiteActif({
      latitudeDeg: Number('abc'),
      longitudeDeg: 6.697,
      altitudeM: 500,
      masque: masqueDepuisPoints(RELEVES),
      pointsMasque: RELEVES,
    })
    expect(await base.get('sites', ID_SITE_ACTIF)).toBeUndefined()
  })
})
