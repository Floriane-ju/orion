/**
 * T-0192 — numeric field opens numeric keypad. Enumerates all numeric inputs of Site and
 * Matériel screens (incl. horizon mask) and checks `inputMode`: a future field missing it
 * would go unnoticed.
 * T-0149 — field cleared to retype must stay empty without browser correction: `type="number"`
 * breaks that. `inputMode` only picks keyboard → no numeric field may carry `type="number"`.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { masquePlat } from '../src/core/site.ts'
import { ChampsSite } from '../src/ui/ChampsSite.tsx'
import { PanneauMateriel } from '../src/ui/PanneauMateriel.tsx'

const rien = () => undefined

const ECRAN_SITE = renderToStaticMarkup(
  <ChampsSite
    latitude="45"
    surLatitude={rien}
    longitude="5"
    surLongitude={rien}
    altitude="200"
    bortle="4"
    surBortle={rien}
    sqm=""
    surSqm={rien}
    masque={masquePlat()}
    cielRefus={null}
  />,
)

const ECRAN_MATERIEL = renderToStaticMarkup(
  <PanneauMateriel
    boitierId=""
    surBoitierId={rien}
    boitier={{
      formatCapteur: 'PLEIN_FORMAT',
      resolutionMpx: '24',
      readNoiseE: '',
      seuilDoubleGainIso: '',
      zpSys: '',
      tailleRawMo: '',
    }}
    surBoitier={rien}
    iso=""
    surIso={rien}
    objectifs={[]}
    surObjectifs={rien}
    objectifId=""
    surObjectifId={rien}
    focale="200"
    surFocale={rien}
    ouverture="4"
    surOuverture={rien}
    capteurMode="FULL_FRAME"
    surCapteurMode={rien}
    typeObjectif="RECTILINEAIRE"
    surTypeObjectif={rien}
    suiviActif={false}
    surSuiviActif={rien}
    qualiteMes="INCONNUE"
    surQualiteMes={rien}
    typeMonture="TRACKER"
    surTypeMonture={rien}
  />)

/** All `<input>` tags of a render, minus checkboxes. */
function champsSaisie(markup: string): readonly string[] {
  const balises = markup.match(/<input\b[^>]*>/gu) ?? []
  return balises.filter((b) => !/type="checkbox"/u.test(b))
}

describe('inputMode des champs numériques §4.1 + §5.1 (T-0192)', () => {
  const champsSite = champsSaisie(ECRAN_SITE)
  const champsMateriel = champsSaisie(ECRAN_MATERIEL)

  it('l’écran Site expose bien les quatre champs numériques attendus', () => {
    // latitude, longitude, bortle, sqm; altitude read from relief, not typed.
    expect(champsSite.length).toBe(4)
  })

  it('l’écran Matériel expose bien les champs numériques attendus', () => {
    // resolution, RAW weight, ISO, focale, aperture, + 3 advanced-mode ones.
    expect(champsMateriel.length).toBe(8)
  })

  it.each([...champsSite, ...champsMateriel])(
    'chaque champ numérique porte un inputMode : %s',
    (balise) => {
      expect(balise).toMatch(/inputmode="(decimal|numeric)"/iu)
    },
  )

  it('aucun champ numérique ne gagne type="number" (T-0149)', () => {
    expect(ECRAN_SITE).not.toContain('type="number"')
    expect(ECRAN_MATERIEL).not.toContain('type="number"')
  })

  it('le Bortle, seul domaine entier (DOMAINES.bortle_declare), ouvre le clavier numérique strict', () => {
    const champBortle = champsSite.find((b) => b.includes('value="4"'))
    expect(champBortle).toBeDefined()
    expect(champBortle).toMatch(/inputmode="numeric"/iu)
  })
})
