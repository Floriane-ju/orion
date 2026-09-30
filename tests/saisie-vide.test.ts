/**
 * §4.1 et §5.1 — effacer un champ pour le retaper est un état transitoire normal.
 *
 * Deux exigences distinctes, et T-0149 les sépare :
 *   - le message du moteur remonte, pas l'exception — un `throw` en rendu démonte l'arbre
 *     et l'écran devient noir ;
 *   - un champ MATÉRIEL effacé ne refuse que le matériel. Le ciel du lieu reste calculable,
 *     donc la scène reste dessinable.
 */

import { describe, expect, it } from 'vitest'
import {
  cielAffiche,
  evalueCiel,
  evalueMateriel,
  grandeursLieu,
  grandeursMateriel,
} from '../src/ui/app-calcul.ts'
import { DEFAUT, type SaisieLieu, type SaisieMateriel } from '../src/ui/app-saisie.ts'
import type { Site } from '../src/core/ephem.ts'

const rien = () => undefined

const SITE: Site = {
  latitudeDeg: Number(DEFAUT.latitude),
  longitudeDeg: Number(DEFAUT.longitude),
  altitudeM: Number(DEFAUT.altitude),
}

function lieu(champs: { readonly bortle: string; readonly sqm: string }): SaisieLieu {
  return {
    latitude: DEFAUT.latitude,
    surLatitude: rien,
    longitude: DEFAUT.longitude,
    surLongitude: rien,
    altitude: DEFAUT.altitude,
    surAltitude: rien,
    nuitIso: new Date().toISOString().slice(0, 10),
    surNuitIso: rien,
    bortle: champs.bortle,
    surBortle: rien,
    sqm: champs.sqm,
    surSqm: rien,
  }
}

const MATERIEL: SaisieMateriel = {
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
}

const LIEU = lieu({ bortle: DEFAUT.bortle, sqm: '' })

describe('saisie transitoirement vide', () => {
  it('Bortle et SQM effacés : erreur nommée, pas d’exception', () => {
    const ciel = evalueCiel(SITE, grandeursLieu(lieu({ bortle: '', sqm: '' })))
    expect(ciel.ok).toBe(false)
    if (!ciel.ok) expect(ciel.erreur).toContain('fond de ciel')
  })

  it('le Bortle du départ reste calculable', () => {
    expect(evalueCiel(SITE, grandeursLieu(LIEU)).ok).toBe(true)
  })

  it('le matériel du départ se chiffre', () => {
    expect(evalueMateriel(MATERIEL, grandeursMateriel(MATERIEL)).ok).toBe(true)
  })
})

/** T-0149 — ce qui doit rester vrai pour que la scène survive à un matériel incomplet. */
describe('champ matériel effacé', () => {
  const CHAMPS = ['focale', 'ouverture'] as const

  it.each(CHAMPS)('%s effacée : le matériel est refusé en nommant le champ', (champ) => {
    const saisie = { ...MATERIEL, [champ]: '' }
    const calcul = evalueMateriel(saisie, grandeursMateriel(saisie))
    expect(calcul.ok).toBe(false)
    if (!calcul.ok) expect(calcul.erreur).toContain('Saisie refusée')
  })

  it('résolution effacée : le matériel est refusé', () => {
    const saisie = { ...MATERIEL, boitier: { ...MATERIEL.boitier, resolutionMpx: '' } }
    const calcul = evalueMateriel(saisie, grandeursMateriel(saisie))
    expect(calcul.ok).toBe(false)
  })

  it.each(CHAMPS)('%s effacée : le ciel du lieu reste dessinable', (champ) => {
    // La scène ne demande que ces deux grandeurs-là : elles ne viennent pas du matériel.
    const ciel = evalueCiel(SITE, grandeursLieu(LIEU))
    const saisie = { ...MATERIEL, [champ]: '' }
    expect(evalueMateriel(saisie, grandeursMateriel(saisie)).ok).toBe(false)
    expect(ciel.ok).toBe(true)
    if (ciel.ok) {
      expect(Number.isFinite(ciel.ciel.sbCiel.value)).toBe(true)
      expect(Number.isFinite(ciel.ciel.mLimOeil.value)).toBe(true)
    }
  })
})

/**
 * Le Bortle effacé le temps d'en taper un autre refusait le ciel ENTIER, et le planétarium
 * disparaissait à chaque frappe. Le dernier ciel calculé tient l'écran ; le refus se dit
 * sous les champs.
 */
describe('champ du lieu effacé : la scène garde le dernier ciel', () => {
  const VALIDE = evalueCiel(SITE, grandeursLieu(LIEU))
  const REFUS = evalueCiel(SITE, grandeursLieu(lieu({ bortle: '', sqm: '' })))

  it('le refus ne remplace pas un ciel déjà calculé', () => {
    if (!VALIDE.ok) throw new Error('le ciel du départ doit être calculable')
    expect(cielAffiche(REFUS, VALIDE)).toBe(VALIDE)
  })

  it('sans ciel antérieur, le refus reste le seul état possible', () => {
    expect(cielAffiche(REFUS, null)).toBe(REFUS)
  })

  it('une saisie de nouveau valide reprend la main', () => {
    if (!VALIDE.ok) throw new Error('le ciel du départ doit être calculable')
    const autre = evalueCiel(SITE, grandeursLieu(lieu({ bortle: '3', sqm: '' })))
    expect(cielAffiche(autre, VALIDE)).toBe(autre)
  })
})
