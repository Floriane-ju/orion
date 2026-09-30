/**
 * T-0270 — §5.1 : un `useMemo` de la chaîne de calcul ne doit jamais lire une entrée absente
 * de ses dépendances.
 *
 * Le défaut se voyait sur « Objectif fisheye » : la case change `materiel.typeObjectif`, que
 * `evalueMateriel` lit, mais que la liste de dépendances ne nommait pas — le champ et la
 * projection du cadre restaient ceux de l'objectif rectilinéaire tant qu'aucun autre champ du
 * matériel n'était touché.
 *
 * La vérification ne recopie pas la liste attendue : elle ESPIONNE les lectures réelles avec
 * un `Proxy`, puis les confronte aux dépendances lues dans la source. Une entrée ajoutée
 * demain au fond d'un moteur est donc couverte sans que ce test soit retouché — c'est ce que
 * la directive `eslint-disable` posée sur ces `useMemo` laisse croire sans le faire, faute de
 * linter dans le dépôt (T-0060).
 *
 * L'espion ne voit que les accès de premier niveau sur l'objet de saisie (`materiel.boitier`
 * oui, `materiel.boitier.tailleRawMo` non) : c'est exactement la maille d'une liste de
 * dépendances React, donc la seule qui ait un sens ici.
 *
 * T-0291 — les moteurs reçoivent maintenant DEUX entrées : la saisie, pour ce qui n'est pas
 * un nombre, et ses grandeurs bornées, pour ce qui en est un. L'espion porte donc sur les
 * deux, et une discipline s'ajoute : aucune dépendance de la chaîne ne nomme plus un champ
 * TEXTE qui a une grandeur bornée. C'est la régression qui coûtait 480 ms par caractère sans
 * effet — « 45.5 » puis « 45.50 » ne sont pas la même chaîne, mais sont la même latitude.
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

/** Les champs de `saisie` réellement lus pendant `usage`, accès de premier niveau. */
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

/** L'appel `useMemo(…)` qui contient `marqueur`, parenthèses appariées. */
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

/** Les champs de `objet` nommés dans la liste de dépendances de ce `useMemo`. */
function champsDeclares(marqueur: string, objet: string): string[] {
  const noms = [
    ...dependances(marqueur).matchAll(new RegExp(String.raw`\b${objet}\.(\w+)`, 'gu')),
  ].map((m) => m[1]!)
  return [...new Set(noms)].sort()
}

/** Le texte de la liste de dépendances de ce `useMemo`, crochets compris. */
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
   * Le site se construit d'un littéral, pas d'un appel : rien à espionner, mais la même
   * exigence — les trois grandeurs qu'il recopie sont les trois dont il dépend.
   */
  it('le site : `siteSaisi` déclare les trois grandeurs qu’il recopie', () => {
    expect(champsDeclares('latitudeDeg: lieuBorne.latitudeDeg', 'lieuBorne')).toEqual([
      'altitudeM',
      'latitudeDeg',
      'longitudeDeg',
    ])
  })

  /**
   * Le symptôme du ticket, au niveau du moteur : si cocher la case ne changeait déjà rien ici,
   * la liste de dépendances ne serait pas le sujet.
   *
   * L'échantillonnage, lui, ne bouge pas — `echApx` vaut pitch/focale, la projection n'y entre
   * pas (§5.1). Ce que la case change est le CHAMP et le mode de projection du cadre.
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
 * T-0291 — la mémoïsation porte sur les NOMBRES, jamais sur le texte tapé.
 *
 * Ces huit champs ont tous une grandeur bornée, et c'est elle qui décide : une dépendance qui
 * nommerait de nouveau le texte ferait repayer toute la nuit pour un zéro final.
 */
describe('T-0291 — aucune dépendance ne porte sur une chaîne saisie', () => {
  const MEMOS = [
    'latitudeDeg: lieuBorne.latitudeDeg',
    'evalueCiel(site, lieuBorne)',
    'evalueMateriel(materiel, materielBorne)',
    'profilsDeCadre(calcul, materiel)',
  ] as const

  /** Les champs texte de la saisie dont une grandeur bornée existe. */
  const TEXTES = /\b(?:lieu|materiel)\.(latitude|longitude|altitude|bortle|sqm|focale|ouverture|iso)\b/gu

  it.each(MEMOS)('les dépendances de « %s » sont des nombres', (marqueur) => {
    expect([...dependances(marqueur).matchAll(TEXTES)].map((m) => m[1])).toEqual([])
  })
})
