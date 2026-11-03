/**
 * T-0082, §12.3 — user input survives reload, export carries it. Verified path = the real one:
 * input → saved to DB → read back → input. One-way proves nothing.
 * `fake-indexeddb/auto` supplies IndexedDB for Node.
 */

import 'fake-indexeddb/auto'
import type { Objectif } from '../src/core/objectif.ts'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/data/db.ts'
import {
  enregistreProfilActif,
  enregistreSiteActif,
  exporteDonneesUtilisateur,
  importeDonneesUtilisateur,
  litProfilActif,
  litSiteActif,
} from '../src/data/persistence.ts'
import {
  departLieu,
  departMateriel,
  profilAEnregistrer,
  siteAEnregistrer,
} from '../src/ui/saisie-persistee.ts'
import { DEFAUT, type SaisieLieu, type SaisieMateriel } from '../src/ui/app-saisie.ts'
import { masquePlat } from '../src/core/site.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import { BASE_BOITIERS } from '../src/data/boitiers.ts'

const RIEN = () => undefined

function saisieLieu(champs: Partial<SaisieLieu> = {}): SaisieLieu {
  return {
    latitude: '45.833',
    longitude: '6.865',
    altitude: '1200',
    nuitIso: '2026-08-21',
    bortle: '4.5',
    sqm: '',
    surLatitude: RIEN,
    surLongitude: RIEN,
    surAltitude: RIEN,
    surNuitIso: RIEN,
    surBortle: RIEN,
    surSqm: RIEN,
    ...champs,
  }
}

function saisieMateriel(champs: Partial<SaisieMateriel> = {}): SaisieMateriel {
  return {
    boitierId: '',
    surBoitierId: RIEN,
    boitier: {
      formatCapteur: 'PLEIN_FORMAT',
      resolutionMpx: '',
      readNoiseE: '',
      seuilDoubleGainIso: '',
      zpSys: '',
      tailleRawMo: '',
    },
    iso: '',
    focale: '135',
    ouverture: '2',
    capteurMode: 'APSC_CROP',
    typeObjectif: 'FISHEYE',
    suiviActif: true,
    qualiteMes: 'SOIGNEE',
    typeMonture: 'GEM',
    surBoitier: RIEN,
    surIso: RIEN,
    objectifs: [],
    surObjectifs: RIEN,
    objectifId: '',
    surObjectifId: RIEN,
    surFocale: RIEN,
    surOuverture: RIEN,
    surCapteurMode: RIEN,
    surTypeObjectif: RIEN,
    surSuiviActif: RIEN,
    surQualiteMes: RIEN,
    surTypeMonture: RIEN,
    ...champs,
  }
}

/** Full reload path: on-screen value written then read back. */
async function rechargeLieu(lieu: SaisieLieu) {
  const aEcrire = siteAEnregistrer(lieu, masquePlat())
  if (aEcrire !== null) await enregistreSiteActif(aEcrire)
  return departLieu(await litSiteActif())
}

async function rechargeMateriel(materiel: SaisieMateriel) {
  const aEcrire = profilAEnregistrer(materiel)
  if (aEcrire !== null) await enregistreProfilActif(aEcrire)
  return departMateriel(await litProfilActif())
}

beforeEach(async () => {
  const base = await db()
  const tx = base.transaction(['sites', 'profils'], 'readwrite')
  await Promise.all([tx.objectStore('sites').clear(), tx.objectStore('profils').clear(), tx.done])
})

describe('T-0082 — la saisie survit au rechargement', () => {
  it('rend le lieu et son ciel déclaré', async () => {
    const lieu = saisieLieu()

    expect(await rechargeLieu(lieu)).toEqual({
      latitude: lieu.latitude,
      longitude: lieu.longitude,
      altitude: lieu.altitude,
      bortle: lieu.bortle,
      sqm: '',
    })
  })

  it('garde vide le champ que l’utilisateur a vidé', async () => {
    // Measured SQM replaces Bortle: default Bortle must not return on reload (§4.1), else fond de
    // ciel changes by itself.
    const releve = await rechargeLieu(saisieLieu({ bortle: '', sqm: '21.2' }))
    expect(releve?.bortle).toBe('')
    expect(releve?.sqm).toBe('21.2')
  })

  it('rend le Bortle par défaut quand aucun fond de ciel n’a été enregistré', async () => {
    // Neither Bortle nor SQM: fond de ciel indeterminable from startup → whole compute chain
    // refused for a field the user never filled.
    const releve = await rechargeLieu(saisieLieu({ bortle: '', sqm: '' }))
    expect(releve?.bortle).toBe(DEFAUT.bortle)
    expect(releve?.sqm).toBe('')
  })

  it('rend le boîtier saisi à la main, grandeur par grandeur', async () => {
    // §5.1 — not re-downloadable: lost, profile would describe another device's sensor.
    const materiel = saisieMateriel({
      boitier: {
        formatCapteur: 'APSC_NIKON',
        resolutionMpx: '24',
        readNoiseE: '1.5',
        seuilDoubleGainIso: '800',
        zpSys: '21.4',
        tailleRawMo: '25',
      },
      iso: '1600',
    })

    expect(await rechargeMateriel(materiel)).toEqual({
      boitier: materiel.boitier,
      iso: materiel.iso,
      objectifs: materiel.objectifs,
      focale: materiel.focale,
      ouverture: materiel.ouverture,
      capteurMode: materiel.capteurMode,
      typeObjectif: materiel.typeObjectif,
      suiviActif: materiel.suiviActif,
      qualiteMes: materiel.qualiteMes,
      typeMonture: materiel.typeMonture,
    })
  })

  it('T-0207 — un profil altazimutal relu revient au type par défaut', async () => {
    // Selector no longer offers altazimutale: reading it back as-is gives a `<select>` without
    // matching option. File still accepts it.
    const materiel = await rechargeMateriel(saisieMateriel({ typeMonture: 'ALTAZ' }))
    expect(materiel?.typeMonture).toBe('TRACKER')
  })

  it('enregistre la valeur BORNÉE d’une saisie hors domaine', async () => {
    // T-0208 — Bortle 12 not dropped: clamped value saved, same one scene derives from. WYSIWYG.
    // Nothing un-reimportable enters DB: a clamped value is within the ranges reimport applies.
    const borne = await rechargeLieu(saisieLieu({ bortle: '12' }))
    expect(borne?.bortle).toBe(String(DOMAINES.bortle_declare.max))
  })

  it('n’écrit pas un champ vide, qui n’est pas un zéro', async () => {
    // Empty latitude saved as 0° would return every start as a site off the Gulf of Guinea: empty
    // is refused, not clamped.
    expect(siteAEnregistrer(saisieLieu({ latitude: '' }), masquePlat())).toBeNull()
    expect(profilAEnregistrer(saisieMateriel({ focale: '' }))).toBeNull()
  })
})

describe('T-0082 — l’export cesse d’être vide', () => {
  it('emporte le site et le profil de la séance, et son réimport les restaure', async () => {
    const lieu = saisieLieu()
    const materiel = saisieMateriel()
    const attenduLieu = await rechargeLieu(lieu)
    const attenduMateriel = await rechargeMateriel(materiel)

    const fichier = await exporteDonneesUtilisateur()
    expect(fichier.sites).toHaveLength(1)
    expect(fichier.profils).toHaveLength(1)

    const base = await db()
    const tx = base.transaction(['sites', 'profils'], 'readwrite')
    await Promise.all([tx.objectStore('sites').clear(), tx.objectStore('profils').clear(), tx.done])
    expect(await litSiteActif()).toBeNull()

    await importeDonneesUtilisateur(fichier)
    expect(departLieu(await litSiteActif())).toEqual(attenduLieu)
    expect(departMateriel(await litProfilActif())).toEqual(attenduMateriel)
  })
})

describe('T-0204 — le boîtier choisi survit au rechargement', () => {
  it('rend l’identifiant de la ligne, et non une copie de ses grandeurs', async () => {
    const choisi = BASE_BOITIERS[0]!
    const relu = await rechargeMateriel(saisieMateriel({ boitierId: choisi.id }))
    expect(relu?.boitierId).toBe(choisi.id)
  })

  it('n’enregistre aucun identifiant en mode personnalisé', async () => {
    expect((await rechargeMateriel(saisieMateriel()))?.boitierId).toBeUndefined()
  })

  it('accepte un identifiant disparu de la base plutôt que de refuser tout le profil', async () => {
    // A deleted row in the file must not lose focale, aperture, site with it: `useSaisieMateriel`
    // falls back to custom mode.
    const relu = await rechargeMateriel(saisieMateriel({ boitierId: 'boitier-disparu' }))
    expect(relu?.boitierId).toBe('boitier-disparu')
    expect(relu?.focale).toBe(saisieMateriel().focale)
  })
})

describe('T-0404 — le parc d’objectifs survit au rechargement', () => {
  const ZOOM: Objectif = {
    id: 'zoom',
    nom: '70-200',
    focaleMinMm: 70,
    focaleMaxMm: 200,
    ouvertureGrandAngleN: 4,
    ouvertureTeleN: 5.6,
    typeObjectif: 'RECTILINEAIRE',
  }

  it('rend le parc et l’objectif monté', async () => {
    const depart = await rechargeMateriel(
      saisieMateriel({ objectifs: [ZOOM], objectifId: ZOOM.id, focale: '135', ouverture: '8' }),
    )
    expect(depart?.objectifs).toEqual([ZOOM])
    expect(depart?.objectifId).toBe(ZOOM.id)
  })

  it('enregistre le réglage borné par l’objectif, celui qu’on voit', async () => {
    const depart = await rechargeMateriel(
      saisieMateriel({ objectifs: [ZOOM], objectifId: ZOOM.id, focale: '300', ouverture: '2' }),
    )
    expect(Number(depart?.focale)).toBe(ZOOM.focaleMaxMm)
    expect(Number(depart?.ouverture)).toBe(ZOOM.ouvertureTeleN)
  })

  it('un parc vidé revient vide : il ne se reconstruit pas depuis le réglage', async () => {
    const depart = await rechargeMateriel(saisieMateriel())
    expect(depart?.objectifs).toEqual([])
    expect(depart?.objectifId).toBeUndefined()
  })
})
