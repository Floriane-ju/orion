/**
 * T-0270 — §5.1: a calcul-chain `useMemo` never reads an input absent from its dependencies.
 * Defect seen on "Objectif fisheye": checkbox changes `materiel.typeObjectif`, read by
 * `evalueMateriel` but not in deps → champ and cadre projection stayed rectilinear until another
 * matériel field was touched.
 * No copied expected list: a `Proxy` SPIES real reads, compared to deps read from source. Input
 * added deep in an engine tomorrow is covered untouched — which `eslint-disable` on these
 * `useMemo` implies but doesn't deliver (no linter in repo, T-0060).
 * Spy sees only first-level accesses on saisie object (`materiel.boitier` yes,
 * `materiel.boitier.tailleRawMo` no) = React deps granularity.
 * T-0291 — engines take TWO inputs: saisie (non-numbers) + its bounded grandeurs (numbers). Spy
 * covers both; rule added: no chain dependency names a TEXT field that has a bounded grandeur.
 * Regression cost 480 ms per character for nothing: "45.5" ≠ "45.50" as strings, same latitude.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  evalueCiel,
  evalueMateriel,
  grandeursLieu,
  grandeursMateriel,
  profilsDeCadre,
} from '../src/ui/app-calcul.ts'
import { DEFAUT, type SaisieLieu, type SaisieMateriel } from '../src/ui/app-saisie.ts'
import { nuitDeLInstant } from '../src/core/nuit-datee.ts'

const SOURCE = readFileSync(fileURLToPath(new URL('../src/ui/app-calcul.ts', import.meta.url)), 'utf8')

const rien = () => undefined

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

function lieu(): SaisieLieu {
  return {
    latitude: DEFAUT.latitude,
    surLatitude: rien,
    longitude: DEFAUT.longitude,
    surLongitude: rien,
    altitude: DEFAUT.altitude,
    surAltitude: rien,
    nuitIso: nuitDeLInstant(new Date()),
    surNuitIso: rien,
    bortle: DEFAUT.bortle,
    surBortle: rien,
    sqm: '',
    surSqm: rien,
  }
}

const SITE = {
  latitudeDeg: Number(DEFAUT.latitude),
  longitudeDeg: Number(DEFAUT.longitude),
  altitudeM: Number(DEFAUT.altitude),
}

/** `saisie` fields actually read during `usage`, first-level accesses. */
function champsLus<T extends object>(saisie: T, usage: (espion: T) => unknown): string[] {
  const lus = new Set<string>()
  usage(
    new Proxy(saisie, {
      get(cible, propriete, recepteur) {
        if (typeof propriete === 'string') lus.add(propriete)
        return Reflect.get(cible, propriete, recepteur)
      },
    }),
  )
  return [...lus].sort()
}

/** The `useMemo(…)` call containing `marqueur`, parentheses matched. */
function appelUseMemo(marqueur: string): string {
  const marque = SOURCE.indexOf(marqueur)
  expect(marque, marqueur).toBeGreaterThan(-1)
  const debut = SOURCE.lastIndexOf('useMemo(', marque)
  let profondeur = 0
  for (let i = debut; i < SOURCE.length; i++) {
    if (SOURCE[i] === '(') profondeur++
    else if (SOURCE[i] === ')' && --profondeur === 0) return SOURCE.slice(debut, i + 1)
  }
  throw new Error(`Appel useMemo non refermé autour de ${marqueur}`)
}

/** `objet` fields named in this `useMemo`'s dependency list. */
function champsDeclares(marqueur: string, objet: string): string[] {
  const noms = [
    ...dependances(marqueur).matchAll(new RegExp(String.raw`\b${objet}\.(\w+)`, 'gu')),
  ].map((m) => m[1]!)
  return [...new Set(noms)].sort()
}

/** Text of this `useMemo`'s dependency list, brackets included. */
function dependances(marqueur: string): string {
  const appel = appelUseMemo(marqueur)
  return appel.slice(appel.lastIndexOf('['))
}

const MATERIEL = materiel()
const MATERIEL_BORNE = grandeursMateriel(MATERIEL)
const LIEU_BORNE = grandeursLieu(lieu())

describe('T-0270 — aucune entrée lue hors des dépendances (§5.1)', () => {
  it('le matériel : `calcul` déclare tout ce que `evalueMateriel` lit de la saisie', () => {
    const lus = champsLus(MATERIEL, (espion) => evalueMateriel(espion, MATERIEL_BORNE))
    expect(champsDeclares('evalueMateriel(materiel, materielBorne)', 'materiel')).toEqual(
      expect.arrayContaining(lus),
    )
  })

  it('le matériel : `calcul` déclare toutes les grandeurs bornées qu’il lit', () => {
    const lus = champsLus(MATERIEL_BORNE, (espion) => evalueMateriel(MATERIEL, espion))
    expect(champsDeclares('evalueMateriel(materiel, materielBorne)', 'materielBorne')).toEqual(
      expect.arrayContaining(lus),
    )
  })

  it('le cadre : `profilsCadre` déclare tout ce que `profilsDeCadre` lit', () => {
    const calcul = evalueMateriel(MATERIEL, MATERIEL_BORNE)
    const lus = champsLus(MATERIEL, (espion) => profilsDeCadre(calcul, espion))
    expect(champsDeclares('profilsDeCadre(calcul, materiel)', 'materiel')).toEqual(
      expect.arrayContaining(lus),
    )
  })

  it('le lieu : `cielSaisi` déclare toutes les grandeurs bornées que `evalueCiel` lit', () => {
    const lus = champsLus(LIEU_BORNE, (espion) => evalueCiel(SITE, espion))
    expect(champsDeclares('evalueCiel(site, lieuBorne)', 'lieuBorne')).toEqual(
      expect.arrayContaining(lus),
    )
  })

  /**
   * Site built from a literal, not a call: nothing to spy, same requirement — the 3 grandeurs
   * it copies = the 3 it depends on.
   */
  it('le site : `siteSaisi` déclare les trois grandeurs qu’il recopie', () => {
    expect(champsDeclares('latitudeDeg: lieuBorne.latitudeDeg', 'lieuBorne')).toEqual([
      'altitudeM',
      'latitudeDeg',
      'longitudeDeg',
    ])
  })

  /**
   * Ticket symptom, engine level: if ticking checkbox already changed nothing here, deps list
   * wouldn't be the subject. Échantillonnage doesn't move (`echApx` = pitch/focale, projection
   * not in it, §5.1); checkbox changes cadre CHAMP + projection mode.
   */
  it('cocher « Objectif fisheye » change le champ et la projection du cadre', () => {
    const saisieFisheye = materiel({ typeObjectif: 'FISHEYE' })
    const rectilineaire = evalueMateriel(MATERIEL, MATERIEL_BORNE)
    const fisheye = evalueMateriel(saisieFisheye, grandeursMateriel(saisieFisheye))
    if (!rectilineaire.ok || !fisheye.ok) throw new Error('matériel de référence non chiffrable')
    expect(fisheye.optique.fovHDeg.value).not.toBe(rectilineaire.optique.fovHDeg.value)
    expect(fisheye.optique.fovLDeg.value).not.toBe(rectilineaire.optique.fovLDeg.value)
    expect(profilsDeCadre(fisheye, materiel({ typeObjectif: 'FISHEYE' }))[0]?.modeObjectif).toBe(
      'MODE_FISHEYE',
    )
  })
})

/**
 * T-0291 — memoization on NUMBERS, never typed text. These 8 fields all have a bounded grandeur:
 * a dependency naming the text again would repay the whole nuit for a trailing zero.
 */
describe('T-0291 — aucune dépendance ne porte sur une chaîne saisie', () => {
  const MEMOS = [
    'latitudeDeg: lieuBorne.latitudeDeg',
    'evalueCiel(site, lieuBorne)',
    'evalueMateriel(materiel, materielBorne)',
    'profilsDeCadre(calcul, materiel)',
  ] as const

  /** Saisie text fields that have a bounded grandeur. */
  const TEXTES = /\b(?:lieu|materiel)\.(latitude|longitude|altitude|bortle|sqm|focale|ouverture|iso)\b/gu

  it.each(MEMOS)('les dépendances de « %s » sont des nombres', (marqueur) => {
    expect([...dependances(marqueur).matchAll(TEXTES)].map((m) => m[1])).toEqual([])
  })
})
