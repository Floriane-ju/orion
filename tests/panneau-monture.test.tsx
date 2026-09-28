/**
 * T-0236 — §5.2 : la monture se saisit en un champ, et ce champ doit rester capable de dire
 * tout ce dont le moteur dépend.
 *
 * Le rendu est statique : rien n'est à cliquer pour qu'un profil se relise sur une option. Ce
 * qui se vérifie ici est que le pliage des trois champs en un seul n'a rien perdu — ni le
 * retournement au méridien (§8.2), ni les profils enregistrés avant ce ticket.
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  choixMonture,
  PanneauMateriel,
  PROFILS_MONTURE,
  type ChoixMonture,
} from '../src/ui/PanneauMateriel.tsx'
import { profilSuivi, type QualiteMiseEnStation, type TypeMonture } from '../src/core/suivi.ts'
import { DEFAUT, type SaisieMateriel } from '../src/ui/app-saisie.ts'
import { evalueMateriel, grandeursMateriel } from '../src/ui/app-calcul.ts'
import { ouvreCarte } from '../src/ui/coque-etat.ts'

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

function rendu(champs: Partial<SaisieMateriel> = {}): string {
  // Le champ Monture ferme la carte Boîtier, qui démarre repliée : sans la déplier, son corps
  // n'est pas monté et il n'y a rien à lire.
  ouvreCarte('BOITIER')
  const saisie = materiel(champs)
  const calcul = evalueMateriel(saisie, grandeursMateriel(saisie))
  return renderToStaticMarkup(
    <PanneauMateriel {...saisie} {...(calcul.ok ? { lectures: calcul } : {})} />,
  )
}

/**
 * L'option retenue par le champ Monture : React marque celle de `value` au rendu statique.
 * Le panneau porte d'autres `<select>` — le format de capteur, le recadrage — dont une option
 * est aussi marquée : la lecture se borne au bloc du champ, sinon elle lirait le premier venu.
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
    // Les valeurs des deux anciens champs : leur absence dit que le pliage est bien fait, et
    // pas seulement que les libellés ont changé.
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
    // §8.2 — le retournement tient au type de monture, pas à la qualité de la mise en station :
    // une équatoriale mal mise en station passe le méridien comme une autre.
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
   * §12.3 — un profil écrit avant ce ticket porte encore `INCONNUE`, et un profil plus ancien
   * encore une altazimutale (T-0207). Aucun des deux ne doit laisser le champ sur une valeur
   * qu'il ne propose pas : le `<select>` retomberait silencieusement sur sa première option.
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
