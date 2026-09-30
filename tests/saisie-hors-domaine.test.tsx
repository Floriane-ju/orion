/**
 * T-0208 — une saisie hors plage n'efface plus l'écran.
 *
 * Le bug : taper `456` en latitude rendait la page noire. `app-calcul.ts` convertissait le
 * lieu par un `Number()` nu, la valeur atteignait `new Observer(456, …)`, et
 * `astronomy-engine` levait une CHAÎNE de caractères — pas une `Error`. Les `instanceof` de
 * `refus()` étaient tous faux, la levée repartait depuis un `useMemo` de rendu, et React
 * démontait l'arbre entier.
 *
 * Deux exigences, vérifiées séparément :
 *   - la chaîne de calcul ABOUTIT sur une valeur hors plage, en retenant la borne ;
 *   - le champ qui l'a produite le DIT, au pied du champ et pas ailleurs.
 *
 * Aucune borne n'est écrite ici : elles viennent de `DOMAINES`, comme les valeurs d'essai.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { masquePlat } from '../src/core/site.ts'
import { ChampsSite } from '../src/ui/ChampsSite.tsx'
import { PanneauMateriel } from '../src/ui/PanneauMateriel.tsx'
import {
  evalueCiel,
  evalueMateriel,
  grandeursLieu,
  grandeursMateriel,
  siteChiffrable,
} from '../src/ui/app-calcul.ts'
import { DEFAUT, type SaisieLieu, type SaisieMateriel } from '../src/ui/app-saisie.ts'
import { DOMAINES, borne, type DomaineId } from '../src/registry/domains.ts'
import { nombreSaisi } from '../src/ui/saisie-bornee.ts'
import { ouvreCarte } from '../src/ui/coque-etat.ts'

const rien = () => undefined

/** Une valeur franchement hors du domaine, écrite comme l'utilisateur la taperait. */
function horsPlage(domaine: DomaineId): string {
  return String(DOMAINES[domaine].max + 1)
}

function lieu(champs: Partial<Record<'latitude' | 'longitude' | 'altitude' | 'bortle' | 'sqm', string>>): SaisieLieu {
  return {
    latitude: DEFAUT.latitude,
    surLatitude: rien,
    longitude: DEFAUT.longitude,
    surLongitude: rien,
    altitude: DEFAUT.altitude,
    surAltitude: rien,
    nuitIso: new Date().toISOString().slice(0, 10),
    surNuitIso: rien,
    bortle: DEFAUT.bortle,
    surBortle: rien,
    sqm: '',
    surSqm: rien,
    ...champs,
  }
}

function materiel(champs: Partial<Record<'focale' | 'ouverture' | 'iso', string>>): SaisieMateriel {
  return {
    boitierId: '',
    surBoitierId: rien,
    boitier: {
      formatCapteur: 'PLEIN_FORMAT',
      resolutionMpx: DEFAUT.resolutionMpx,
      readNoiseE: '',
      seuilDoubleGainIso: '',
      fullWellE: '',
      zpSys: '',
      tailleRawMo: '',
    },
    surBoitier: rien,
    iso: '',
    surIso: rien,
    focale: DEFAUT.focale,
    surFocale: rien,
    ouverture: DEFAUT.ouverture,
    surOuverture: rien,
    capteurMode: 'FULL_FRAME',
    surCapteurMode: rien,
    typeObjectif: 'RECTILINEAIRE',
    surTypeObjectif: rien,
    suiviActif: false,
    surSuiviActif: rien,
    qualiteMes: 'INCONNUE',
    surQualiteMes: rien,
    typeMonture: 'TRACKER',
    surTypeMonture: rien,
    ...champs,
  }
}

/** Le site tel que la chaîne le construit : chaque grandeur ramenée dans son domaine. */
function siteBorne(saisie: SaisieLieu) {
  return {
    latitudeDeg: nombreSaisi('latitude_deg', saisie.latitude).valeur,
    longitudeDeg: nombreSaisi('longitude_deg', saisie.longitude).valeur,
    altitudeM: nombreSaisi('altitude_m', saisie.altitude).valeur,
  }
}

describe('le lieu hors domaine ne fait plus tomber la chaîne', () => {
  const CHAMPS_LIEU = [
    ['latitude', 'latitude_deg'],
    ['longitude', 'longitude_deg'],
    ['altitude', 'altitude_m'],
    ['bortle', 'bortle_declare'],
    ['sqm', 'sqm_mesure'],
  ] as const

  it.each(CHAMPS_LIEU)('%s hors plage : le ciel se calcule quand même', (champ, domaine) => {
    const saisie = lieu({ [champ]: horsPlage(domaine) })
    const site = siteBorne(saisie)
    expect(siteChiffrable(site)).toBe(true)
    // C'est L'ABSENCE de levée qui est vérifiée ici : c'est elle qui vidait l'écran.
    expect(() => evalueCiel(site, grandeursLieu(saisie))).not.toThrow()
    expect(evalueCiel(site, grandeursLieu(saisie)).ok).toBe(true)
  })

  it('la latitude de 456° est retenue à la borne du domaine', () => {
    const site = siteBorne(lieu({ latitude: '456' }))
    expect(site.latitudeDeg).toBe(DOMAINES.latitude_deg.max)
  })

  it('une levée que rien ne reconnaît se dit en français au lieu de démonter l’arbre', () => {
    // Le site NON borné, tel que la chaîne le construisait avant T-0208 : `astronomy-engine`
    // lève ici une chaîne de caractères. `refus()` la relançait depuis un rendu React.
    const brut = { latitudeDeg: 456, longitudeDeg: 5, altitudeM: 200 }
    const calcul = evalueCiel(brut, grandeursLieu(lieu({})))
    expect(calcul.ok).toBe(false)
    // T-0279 — la phrase anglaise de la bibliothèque part à la console, pas à l'écran.
    expect(calcul.ok === false && calcul.erreur).toContain('Calcul impossible')
    expect(calcul.ok === false && calcul.erreur).not.toMatch(/Latitude|range/)
  })

  it('un champ du lieu vidé n’est pas borné : le lieu cesse d’être chiffrable', () => {
    // §4.1 — une latitude vide n'est pas −90°, c'est une frappe en cours (T-0149). Le refus
    // remonte, et la scène garde le dernier ciel valable plutôt que d'inventer un lieu.
    const saisie = lieu({ latitude: '' })
    expect(siteChiffrable(siteBorne(saisie))).toBe(false)
    expect(evalueCiel(siteBorne(saisie), grandeursLieu(saisie)).ok).toBe(false)
  })
})

describe('le matériel hors domaine ne fait plus tomber la chaîne', () => {
  const CHAMPS_MATERIEL = [
    ['focale', 'focale_mm'],
    ['ouverture', 'ouverture_N'],
    ['iso', 'iso_capture'],
  ] as const

  it.each(CHAMPS_MATERIEL)('%s hors plage : le matériel se chiffre quand même', (champ, domaine) => {
    const saisie = materiel({ [champ]: horsPlage(domaine) })
    const calcul = evalueMateriel(saisie, grandeursMateriel(saisie))
    expect(calcul.ok).toBe(true)
  })

  it('la focale retenue est celle dont tout le reste est déduit', () => {
    const saisie = materiel({ focale: horsPlage('focale_mm') })
    const calcul = evalueMateriel(saisie, grandeursMateriel(saisie))
    expect(calcul.ok && calcul.focaleMm).toBe(DOMAINES.focale_mm.max)
  })
})

describe('le champ qui a borné le dit à son pied', () => {
  function ecranSite(champs: Parameters<typeof lieu>[0]): string {
    const saisie = lieu(champs)
    return renderToStaticMarkup(
      <ChampsSite
        latitude={saisie.latitude}
        surLatitude={rien}
        longitude={saisie.longitude}
        surLongitude={rien}
        altitude={saisie.altitude}
        bortle={saisie.bortle}
        surBortle={rien}
        sqm={saisie.sqm}
        surSqm={rien}
        masque={masquePlat()}
        cielRefus={null}
      />,
    )
  }

  it.each([
    ['latitude', 'latitude_deg'],
    ['longitude', 'longitude_deg'],
    ['bortle', 'bortle_declare'],
    ['sqm', 'sqm_mesure'],
  ] as const)('%s : le rendu aboutit et nomme la valeur retenue', (champ, domaine) => {
    const markup = ecranSite({ [champ]: horsPlage(domaine) })
    const attendu = borne(domaine, DOMAINES[domaine].max + 1).refus
    expect(attendu).not.toBeNull()
    expect(markup).toContain(DOMAINES[domaine].champ)
    expect(markup).toContain('aria-invalid')
    expect(markup).toContain(`${DOMAINES[domaine].max} ${DOMAINES[domaine].unite} retenu`)
  })

  it('un champ dans son domaine ne porte aucun aria-invalid', () => {
    expect(ecranSite({})).not.toContain('aria-invalid')
  })

  it('l’écran Matériel signale aussi le champ fautif', () => {
    // Le champ fautif est dans le corps de la carte, qui démarre replié donc non monté.
    ouvreCarte('OPTIQUE')
    const markup = renderToStaticMarkup(
      <PanneauMateriel {...materiel({ focale: horsPlage('focale_mm') })} />,
    )
    expect(markup).toContain('aria-invalid')
    expect(markup).toContain(DOMAINES.focale_mm.champ)
  })
})
