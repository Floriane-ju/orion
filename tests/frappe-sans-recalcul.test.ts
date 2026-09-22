/**
 * T-0291 — une frappe sans effet sur les NOMBRES ne relance aucun moteur.
 *
 * Le défaut mesuré : les mémos de la chaîne portaient sur les CHAÎNES saisies. Taper « 45.5 »
 * puis un zéro final donne deux textes et une seule latitude — la nuit, le plan et les notes
 * du catalogue se recalculaient quand même, 480 ms à CPU ×4 pour un caractère qui ne change
 * rien. Retaper la même valeur coûtait pareil.
 *
 * COMMENT LA VÉRIFICATION TIENT SANS NAVIGATEUR. L'environnement de test est `node` et le
 * dépôt n'embarque aucun moteur de rendu React : `renderToStaticMarkup` ne rend qu'une fois,
 * donc aucun mémo ne survit d'un rendu au suivant, et il n'y aurait rien à observer. Les trois
 * crochets que la chaîne utilise sont donc remplacés par un harnais qui reproduit leur
 * sémantique — dépendances comparées par `Object.is`, cellules indexées par ordre d'appel —,
 * et la chaîne est appelée deux fois de suite. Ce n'est pas React, c'est le contrat de React :
 * le mémo qui repart ici repartirait à l'écran.
 *
 * `useDeferredValue` y rend sa valeur telle quelle. Le report de T-0291 change QUAND le calcul
 * lourd tourne, pas ce qui le déclenche ; c'est le déclencheur qui est éprouvé ici, et le
 * mesurer sans report le rend indépendant de l'ordonnancement.
 *
 * Les trois moteurs espionnés sont ceux que le ticket nomme, et ce sont les trois étages du
 * coût : la nuit du site, le plan de la séance, les notes du catalogue.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fenetreNocturne } from '../src/core/night.ts'
import { planSession, poidsParDefaut } from '../src/core/session.ts'
import { etatsCibles } from '../src/core/cibles-liste.ts'
import { nuitDeLInstant } from '../src/core/nuit-datee.ts'
import { decodeObjets, type ObjetCielProfond } from '../src/data/deepsky.ts'
import { BASE_BOITIERS } from '../src/data/boitiers.ts'
import { INDEX_VIDE } from '../src/core/index-ciel.ts'
import { useChaineCalcul } from '../src/ui/app-calcul.ts'
import { DEFAUT, type SaisieLieu, type SaisieMateriel } from '../src/ui/app-saisie.ts'

/**
 * Le harnais de crochets. `vi.hoisted` parce que `vi.mock` est remonté en tête de fichier :
 * une fermeture sur un `const` de module y serait lue avant son initialisation.
 */
const harnais = vi.hoisted(() => {
  interface Cellule {
    readonly deps: readonly unknown[] | undefined
    readonly valeur: unknown
  }

  let cellules: Cellule[] = []
  let curseur = 0

  /** La comparaison de React, et rien d'autre : `Object.is`, donc `NaN` égal à lui-même. */
  const memesDeps = (
    a: readonly unknown[] | undefined,
    b: readonly unknown[] | undefined,
  ): boolean =>
    a !== undefined && b !== undefined && a.length === b.length &&
    a.every((valeur, i) => Object.is(valeur, b[i]))

  return {
    /** Un écran neuf : plus aucun mémo n'est chaud. */
    demonte(): void {
      cellules = []
      curseur = 0
    },
    /** Un rendu de plus du même écran. */
    rendu(): void {
      curseur = 0
    },
    useMemo<T>(calcul: () => T, deps?: readonly unknown[]): T {
      const cellule = cellules[curseur]
      if (cellule !== undefined && memesDeps(cellule.deps, deps)) {
        curseur += 1
        return cellule.valeur as T
      }
      const valeur = calcul()
      cellules[curseur] = { deps, valeur }
      curseur += 1
      return valeur
    },
    useRef<T>(initial: T): { current: T } {
      const cellule = cellules[curseur]
      const ref = cellule === undefined ? { current: initial } : (cellule.valeur as { current: T })
      cellules[curseur] = { deps: undefined, valeur: ref }
      curseur += 1
      return ref
    },
  }
})

vi.mock('react', async (importeReel) => {
  const reel = await importeReel<typeof import('react')>()
  return {
    ...reel,
    useMemo: harnais.useMemo,
    useRef: harnais.useRef,
    // Le report est hors sujet ici : ce test porte sur ce qui DÉCLENCHE le calcul lourd.
    useDeferredValue: <T,>(valeur: T): T => valeur,
  }
})

vi.mock('../src/core/night.ts', async (importeReel) => {
  const reel = await importeReel<typeof import('../src/core/night.ts')>()
  return { ...reel, fenetreNocturne: vi.fn(reel.fenetreNocturne) }
})

vi.mock('../src/core/session.ts', async (importeReel) => {
  const reel = await importeReel<typeof import('../src/core/session.ts')>()
  return { ...reel, planSession: vi.fn(reel.planSession) }
})

vi.mock('../src/core/cibles-liste.ts', async (importeReel) => {
  const reel = await importeReel<typeof import('../src/core/cibles-liste.ts')>()
  return { ...reel, etatsCibles: vi.fn(reel.etatsCibles) }
})

const MOTEURS = [
  vi.mocked(fenetreNocturne),
  vi.mocked(planSession),
  vi.mocked(etatsCibles),
]

const rien = () => undefined

/** Le catalogue réel : `planSession` ne tourne pas sur une liste vide, donc rien à observer. */
function openngc(): readonly ObjetCielProfond[] {
  const racine = join(import.meta.dirname, '..', 'public', 'data')
  const lit = (nom: string): ArrayBuffer => {
    const octets = readFileSync(join(racine, nom))
    return octets.buffer.slice(
      octets.byteOffset,
      octets.byteOffset + octets.byteLength,
    ) as ArrayBuffer
  }
  return decodeObjets({
    enregistrements: lit('openngc-1.bin'),
    chaines: lit('openngc-noms-1.bin'),
  })
}

const CATALOGUE = openngc()
const NUIT_ISO = nuitDeLInstant(new Date())

/**
 * Ce que `useState` tient stable dans l'application, et qu'un fabricant de saisie recréerait
 * à chaque appel : le relief relevé, le boîtier saisi, les poids, le ciel d'étoiles. Une
 * identité neuve serait une dépendance changée, donc un recalcul légitime — et le test
 * mesurerait alors son propre outillage.
 */
const POINTS_MASQUE = Object.freeze([])
const SAISIE_BOITIER = Object.freeze({
  formatCapteur: 'PLEIN_FORMAT',
  resolutionMpx: DEFAUT.resolutionMpx,
  readNoiseE: '',
  seuilDoubleGainIso: '',
  fullWellE: '',
  zpSys: '',
  tailleRawMo: '',
})
const POIDS = poidsParDefaut()
const INDEX = INDEX_VIDE

function lieu(champs: Partial<SaisieLieu> = {}): SaisieLieu {
  return {
    latitude: DEFAUT.latitude,
    surLatitude: rien,
    longitude: DEFAUT.longitude,
    surLongitude: rien,
    altitude: DEFAUT.altitude,
    surAltitude: rien,
    nuitIso: NUIT_ISO,
    surNuitIso: rien,
    bortle: DEFAUT.bortle,
    surBortle: rien,
    sqm: '',
    surSqm: rien,
    pointsMasque: POINTS_MASQUE,
    surPointsMasque: rien,
    ...champs,
  }
}

function materiel(champs: Partial<SaisieMateriel> = {}): SaisieMateriel {
  return {
    boitierId: '',
    surBoitierId: rien,
    boitier: SAISIE_BOITIER,
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
    // §5.2 — équatoriale allemande, mise en station soignée : le domaine ciel profond est
    // ouvert, donc le plan a des cibles à allouer et les trois moteurs ont du travail.
    suiviActif: true,
    surSuiviActif: rien,
    qualiteMes: 'SOIGNEE',
    surQualiteMes: rien,
    typeMonture: 'GEM',
    surTypeMonture: rien,
    ...champs,
  }
}

/** Une saisie complète, telle que l'écran la porte à un instant donné. */
type Saisie = readonly [SaisieLieu, SaisieMateriel]

function rendu([lieuSaisi, materielSaisi]: Saisie): void {
  harnais.rendu()
  useChaineCalcul({
    lieu: lieuSaisi,
    materiel: materielSaisi,
    catalogue: CATALOGUE,
    index: INDEX,
    tPoseFileS: 30,
    poids: POIDS,
  })
}

/** Les moteurs relancés par `frappe`, le premier rendu ayant tout amorcé. */
function moteursRelances(depart: Saisie, frappe: Saisie): number {
  rendu(depart)
  for (const moteur of MOTEURS) moteur.mockClear()
  rendu(frappe)
  return MOTEURS.reduce((total, moteur) => total + moteur.mock.calls.length, 0)
}

/** Le même texte, prolongé d'un zéro décimal : deux saisies, une seule valeur. */
function zeroFinal(texte: string): string {
  return texte.includes('.') ? `${texte}0` : `${texte}.0`
}

/** Les champs que le ticket nomme, un par étage de la chaîne : site, fond de ciel, optique. */
const CHAMPS = [
  ['latitude', DEFAUT.latitude, (v: string): Saisie => [lieu({ latitude: v }), materiel()]],
  ['Bortle', DEFAUT.bortle, (v: string): Saisie => [lieu({ bortle: v }), materiel()]],
  ['focale', DEFAUT.focale, (v: string): Saisie => [lieu(), materiel({ focale: v })]],
] as const

beforeEach(() => {
  harnais.demonte()
  for (const moteur of MOTEURS) moteur.mockClear()
})

describe('T-0291 — un caractère sans effet ne relance aucun moteur', () => {
  it('le premier rendu les appelle bien tous les trois — sans quoi il n’y a rien à observer', () => {
    rendu([lieu(), materiel()])
    for (const moteur of MOTEURS) expect(moteur).toHaveBeenCalled()
  })

  it.each(CHAMPS)('un zéro final sur %s ne relance rien', (_champ, depart, saisie) => {
    expect(moteursRelances(saisie(depart), saisie(zeroFinal(depart)))).toBe(0)
  })

  it.each(CHAMPS)('retaper la même valeur dans %s ne relance rien', (_champ, depart, saisie) => {
    expect(moteursRelances(saisie(depart), saisie(depart))).toBe(0)
  })

  /**
   * §7.2, T-0206 — sous un boîtier de la base, l'ISO saisi n'entre dans aucun calcul : c'est
   * le seuil de double gain de la ligne qui le désigne. Taper dedans ne doit donc rien coûter,
   * et c'est ce que `grandeursMateriel` obtient en le neutralisant AVANT la mémoïsation.
   *
   * La première ligne de la base, pas un identifiant recopié : `boitiers.md` s'édite à la
   * main, et un identifiant en dur ici mourrait à la première ligne retirée.
   */
  it('un ISO tapé sous un boîtier de la base ne relance rien', () => {
    const base = BASE_BOITIERS[0]!.id
    expect(
      moteursRelances(
        [lieu(), materiel({ boitierId: base, iso: '' })],
        [lieu(), materiel({ boitierId: base, iso: '3200' })],
      ),
    ).toBe(0)
  })

  /** Le contrôle négatif : une valeur vraiment neuve DOIT tout relancer, sinon rien n'est mesuré. */
  it('un degré de latitude en plus relance les trois moteurs', () => {
    const voisine = String(Number(DEFAUT.latitude) + 1)
    rendu([lieu(), materiel()])
    for (const moteur of MOTEURS) moteur.mockClear()
    rendu([lieu({ latitude: voisine }), materiel()])
    for (const moteur of MOTEURS) expect(moteur).toHaveBeenCalledTimes(1)
  })
})
