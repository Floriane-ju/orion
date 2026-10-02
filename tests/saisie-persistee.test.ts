/**
 * T-0082, §12.3 — ce que l'utilisateur saisit doit survivre au rechargement, et l'export
 * doit l'emporter. Le trajet vérifié ici est le trajet réel : saisie → enregistrement en
 * base → relecture → saisie. Un aller sans retour ne prouve rien.
 *
 * `fake-indexeddb/auto` fournit l'implémentation IndexedDB manquante à Node.
 */

import 'fake-indexeddb/auto'
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

/** Les commandes de la saisie ne servent à rien ici : c'est la valeur qui voyage. */
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

/** Le trajet complet d'un rechargement : ce qui est à l'écran, écrit puis relu. */
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
    // Un SQM mesuré remplace le Bortle : le Bortle par défaut ne doit pas revenir au
    // rechargement, sinon le fond de ciel changerait tout seul (§4.1).
    const releve = await rechargeLieu(saisieLieu({ bortle: '', sqm: '21.2' }))
    expect(releve?.bortle).toBe('')
    expect(releve?.sqm).toBe('21.2')
  })

  it('rend le Bortle par défaut quand aucun fond de ciel n’a été enregistré', async () => {
    // Ni Bortle ni SQM : le fond de ciel serait indéterminable dès le démarrage, et toute la
    // chaîne de calcul refusée pour un champ que l'utilisateur n'a jamais rempli.
    const releve = await rechargeLieu(saisieLieu({ bortle: '', sqm: '' }))
    expect(releve?.bortle).toBe(DEFAUT.bortle)
    expect(releve?.sqm).toBe('')
  })

  it('rend le boîtier saisi à la main, grandeur par grandeur', async () => {
    // §5.1 — ces grandeurs ne se retéléchargent pas : perdues, le profil décrirait le
    // capteur d'un autre appareil.
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
    // Le sélecteur ne propose plus l'altazimutale : la relire telle quelle donnerait un
    // `<select>` sans option correspondante. Le fichier, lui, reste accepté.
    const materiel = await rechargeMateriel(saisieMateriel({ typeMonture: 'ALTAZ' }))
    expect(materiel?.typeMonture).toBe('TRACKER')
  })

  it('enregistre la valeur BORNÉE d’une saisie hors domaine', async () => {
    // T-0208 — le Bortle 12 n'est plus jeté : c'est la valeur ramenée dans le domaine qui
    // s'enregistre, la même dont la scène est déduite. Ce qu'on voit est ce qu'on retrouve.
    // Rien d'irréimportable n'entre en base pour autant : une valeur bornée est, par
    // construction, dans les plages qu'applique le contrôle du réimport.
    const borne = await rechargeLieu(saisieLieu({ bortle: '12' }))
    expect(borne?.bortle).toBe(String(DOMAINES.bortle_declare.max))
  })

  it('n’écrit pas un champ vide, qui n’est pas un zéro', async () => {
    // Une latitude vide enregistrée à 0° reviendrait à chaque démarrage comme un site au
    // large du golfe de Guinée : un vide se refuse, il ne se borne pas.
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
    // Une ligne supprimée du fichier ne doit pas faire perdre la focale, l'ouverture et le
    // site avec elle : c'est `useSaisieMateriel` qui retombe sur le mode personnalisé.
    const relu = await rechargeMateriel(saisieMateriel({ boitierId: 'boitier-disparu' }))
    expect(relu?.boitierId).toBe('boitier-disparu')
    expect(relu?.focale).toBe(saisieMateriel().focale)
  })
})
