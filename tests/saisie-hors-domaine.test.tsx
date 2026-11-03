/**
 * T-0208 — out-of-range input no longer blanks the screen.
 * Bug: latitude `456` → black page. `app-calcul.ts` converted lieu via bare `Number()`, value hit
 * `new Observer(456, …)`, `astronomy-engine` threw a STRING, not `Error`; all `refus()`
 * `instanceof` checks false, throw escaped a render `useMemo`, React unmounted the tree.
 * Two requirements, checked separately:
 *   - compute chain COMPLETES on out-of-range value, keeping the bound;
 *   - the producing field SAYS so, under the field and nowhere else.
 * No bound written here: from `DOMAINES`, like test values.
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

const rien = () => undefined

/** Value clearly out of domain, as the user would type it. */
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
      zpSys: '',
      tailleRawMo: '',
    },
    surBoitier: rien,
    iso: '',
    surIso: rien,
    objectifs: [],
    surObjectifs: rien,
    objectifId: '',
    surObjectifId: rien,
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

/** Site as the chain builds it: each quantity clamped into its domain. */
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
    // Checks ABSENCE of a throw: what blanked the screen.
    expect(() => evalueCiel(site, grandeursLieu(saisie))).not.toThrow()
    expect(evalueCiel(site, grandeursLieu(saisie)).ok).toBe(true)
  })

  it('la latitude de 456° est retenue à la borne du domaine', () => {
    const site = siteBorne(lieu({ latitude: '456' }))
    expect(site.latitudeDeg).toBe(DOMAINES.latitude_deg.max)
  })

  it('une levée que rien ne reconnaît se dit en français au lieu de démonter l’arbre', () => {
    // UNbounded site, as the chain built it before T-0208: `astronomy-engine` throws a string here;
    // `refus()` rethrew it from a React render.
    const brut = { latitudeDeg: 456, longitudeDeg: 5, altitudeM: 200 }
    const calcul = evalueCiel(brut, grandeursLieu(lieu({})))
    expect(calcul.ok).toBe(false)
    // T-0279 — library's English sentence goes to console, not screen.
    expect(calcul.ok === false && calcul.erreur).toContain('Calcul impossible')
    expect(calcul.ok === false && calcul.erreur).not.toMatch(/Latitude|range/)
  })

  it('un champ du lieu vidé n’est pas borné : le lieu cesse d’être chiffrable', () => {
    // §4.1 — empty latitude ≠ −90°, it's typing in progress (T-0149). Refusal propagates, scene
    // keeps last valid sky rather than inventing a lieu.
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
    const markup = renderToStaticMarkup(
      <PanneauMateriel {...materiel({ focale: horsPlage('focale_mm') })} />,
    )
    expect(markup).toContain('aria-invalid')
    expect(markup).toContain(DOMAINES.focale_mm.champ)
  })
})
