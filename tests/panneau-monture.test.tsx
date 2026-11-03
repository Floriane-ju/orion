/**
 * T-0236 — §5.2: monture in one field, still expressing all the engine needs.
 * Static render (nothing to click for a profile re-read onto an option). Checks folding 3
 * fields into 1 lost nothing: neither méridien flip (§8.2) nor pre-ticket profiles.
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  choixMonture,
  PanneauMateriel,
  PROFILS_MONTURE,
  resumeBoitier,
  type ChoixMonture,
} from '../src/ui/PanneauMateriel.tsx'
import { profilSuivi, type QualiteMiseEnStation, type TypeMonture } from '../src/core/suivi.ts'
import { DEFAUT, type SaisieMateriel } from '../src/ui/app-saisie.ts'
import { evalueMateriel, grandeursMateriel } from '../src/ui/app-calcul.ts'
import { BASE_BOITIERS } from '../src/data/boitiers.ts'

const rien = () => undefined

const CHOIX = Object.keys(PROFILS_MONTURE) as readonly ChoixMonture[]

function materiel(champs: Partial<SaisieMateriel> = {}): SaisieMateriel {
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

function rendu(champs: Partial<SaisieMateriel> = {}): string {
  const saisie = materiel(champs)
  const calcul = evalueMateriel(saisie, grandeursMateriel(saisie))
  return renderToStaticMarkup(
    <PanneauMateriel {...saisie} {...(calcul.ok ? { lectures: calcul } : {})} />,
  )
}

/**
 * Option selected by Monture field (React marks the `value` one in static render). Panel has
 * other `<select>`s (capteur format, crop) with a marked option: read limited to the field's
 * block, else first found wins.
 */
function optionRetenue(html: string): string | undefined {
  const debut = html.indexOf('<option value="AUCUN"')
  const bloc = html.slice(debut, html.indexOf('</select>', debut))
  return /<option value="([A-Z_]+)" selected=""/u.exec(bloc)?.[1]
}

describe('T-0236 — la monture se choisit en un champ', () => {
  it('propose les cinq états', () => {
    const html = rendu()
    for (const choix of CHOIX) expect(html, choix).toContain(`value="${choix}"`)
  })

  it('ne pose plus l’interrupteur ni les deux sélecteurs d’avant', () => {
    const html = rendu()
    expect(html).not.toContain('Ma monture suit les étoiles')
    expect(html).not.toContain('Je ne sais pas')
    // Old fields' values: absence shows folding done, not just labels changed.
    for (const ancienne of ['SOIGNEE', 'APPROX', 'INCONNUE', 'TRACKER', 'GEM']) {
      expect(html, ancienne).not.toContain(`value="${ancienne}"`)
    }
  })

  it('relit chaque état sur l’option qui le décrit', () => {
    for (const choix of CHOIX) {
      expect(optionRetenue(rendu(PROFILS_MONTURE[choix])), choix).toBe(choix)
    }
  })

  it('garde le retournement au méridien quand la mise en station est approximative', () => {
    // §8.2 — flip depends on monture type, not polar alignment: a poorly aligned equatorial
    // crosses the méridien like any other.
    const profil = PROFILS_MONTURE.GEM_APPROX
    expect(profil.typeMonture).toBe('GEM')
    expect(profilSuivi({ ...profil, focaleMm: 200 }).retournementMeridien).toBe(true)
  })

  it('n’ouvre le ciel profond que sous un suivi déclaré', () => {
    for (const choix of CHOIX) {
      const suivi = profilSuivi({ ...PROFILS_MONTURE[choix], focaleMm: 200 })
      expect(suivi.domaineCpOuvert, choix).toBe(choix !== 'AUCUN')
    }
  })

  /**
   * §12.3 — pre-ticket profile still carries `INCONNUE`, older one an altazimuth (T-0207).
   * Neither may leave the field on a value it doesn't offer: `<select>` would silently fall
   * back to its first option.
   */
  it('relit les profils enregistrés avant lui sur une option existante', () => {
    const anciens: readonly (readonly [QualiteMiseEnStation, TypeMonture, ChoixMonture])[] = [
      ['INCONNUE', 'TRACKER', 'TRACKER_APPROX'],
      ['INCONNUE', 'GEM', 'GEM_APPROX'],
      ['SOIGNEE', 'ALTAZ', 'TRACKER_SOIGNE'],
    ]
    for (const [qualiteMes, typeMonture, attendu] of anciens) {
      expect(choixMonture({ suiviActif: true, qualiteMes, typeMonture }), attendu).toBe(attendu)
    }
  })
})

describe('carte Boîtier repliée — T-0282', () => {
  it('nomme le boîtier et l’état du suivi', () => {
    expect(resumeBoitier('', PROFILS_MONTURE.AUCUN)).toBe('Boîtier personnalisé · Pas de suivi')
    expect(resumeBoitier('', PROFILS_MONTURE.TRACKER_SOIGNE)).toBe('Boîtier personnalisé · Monture de suivi')
  })

  it('reprend le libellé de la base pour un boîtier connu', () => {
    const ligne = BASE_BOITIERS[0]!
    expect(resumeBoitier(ligne.id, PROFILS_MONTURE.GEM_APPROX)).toContain(ligne.libelle)
  })
})
