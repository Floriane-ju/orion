/**
 * T-0192 — un champ numérique ouvre le pavé numérique, pas le clavier alphabétique.
 *
 * Énumère tous les champs de saisie numérique de l'écran Site et de l'écran Matériel
 * (donc, par composition, du masque d'horizon qu'ils embarquent) et vérifie que chacun
 * porte un `inputMode`. Sans ce test, un futur champ ajouté sans `inputMode` passerait
 * inaperçu — c'est le risque que T-0192 corrige.
 *
 * T-0149 — le champ vidé pour être retapé doit rester vide sans correction du navigateur :
 * `type="number"` casse ça. `inputMode` ne le remplace pas, il choisit seulement le
 * clavier — donc aucun des champs numériques ne doit porter `type="number"`.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { masquePlat } from '../src/core/site.ts'
import { ChampsSite } from '../src/ui/ChampsSite.tsx'
import { PanneauMateriel } from '../src/ui/PanneauMateriel.tsx'
import { ouvreCarte } from '../src/ui/coque-etat.ts'

const rien = () => undefined

// Les cartes du matériel démarrent repliées, donc leur corps n'est pas monté : les champs
// qu'on énumère ici n'existent qu'une fois la carte dépliée.
ouvreCarte('BOITIER')
ouvreCarte('OPTIQUE')

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
  />,
)

/** Toutes les balises `<input>` d'un rendu, hors cases à cocher — pas des champs numériques. */
function champsSaisie(markup: string): readonly string[] {
  const balises = markup.match(/<input\b[^>]*>/gu) ?? []
  return balises.filter((b) => !/type="checkbox"/u.test(b))
}

describe('inputMode des champs numériques §4.1 + §5.1 (T-0192)', () => {
  const champsSite = champsSaisie(ECRAN_SITE)
  const champsMateriel = champsSaisie(ECRAN_MATERIEL)

  it('l’écran Site expose bien les quatre champs numériques attendus', () => {
    // latitude, longitude, bortle, sqm — l'altitude se lit sur le relief, elle ne se saisit pas.
    expect(champsSite.length).toBe(4)
  })

  it('l’écran Matériel expose bien les champs numériques attendus', () => {
    // résolution, poids RAW, ISO, focale, ouverture, + les trois du mode avancé.
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
