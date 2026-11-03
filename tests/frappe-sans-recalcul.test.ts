/**
 * T-0291 — a keystroke with no effect on NUMBERS reruns no engine.
 * Defect: chain memos keyed on typed STRINGS. "45.5" + trailing zero = 2 texts, 1 latitude →
 * nuit, plan, catalogue notes recomputed (480 ms at CPU ×4).
 *
 * No browser (env `node`, no React renderer; `renderToStaticMarkup` renders once → no memo
 * survives). The chain's 3 hooks → harness with their semantics (deps by `Object.is`, cells
 * by call order), chain called twice. Tests React's contract.
 *
 * `useDeferredValue` returns value as-is: T-0291 deferral changes WHEN heavy calc runs, not
 * what triggers it; trigger is tested.
 * Spied engines = ticket's 3 cost stages: site nuit, plan de séance, catalogue notes.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { planSession, poidsParDefaut } from '../src/core/session.ts'
import { etatsCibles } from '../src/core/cibles-liste.ts'
import { nuitDeLInstant } from '../src/core/nuit-datee.ts'
import { decodeObjets, type ObjetCielProfond } from '../src/data/deepsky.ts'
import { BASE_BOITIERS } from '../src/data/boitiers.ts'
import { INDEX_VIDE } from '../src/core/index-ciel.ts'
import { useChaineCalcul } from '../src/ui/app-calcul.ts'
import { ouverturePlancher, plancherAuPas, type Objectif } from '../src/core/objectif.ts'
import { DEFAUT, type SaisieLieu, type SaisieMateriel } from '../src/ui/app-saisie.ts'

/** Harness. `vi.hoisted`: `vi.mock` is hoisted, a closure on a module `const` reads early. */
const harnais = vi.hoisted(() => {
  interface Cellule {
    readonly deps: readonly unknown[] | undefined
    readonly valeur: unknown
  }

  let cellules: Cellule[] = []
  let curseur = 0

  /** React's comparison: `Object.is` (`NaN` equals itself). */
  const memesDeps = (
    a: readonly unknown[] | undefined,
    b: readonly unknown[] | undefined,
  ): boolean =>
    a !== undefined && b !== undefined && a.length === b.length &&
    a.every((valeur, i) => Object.is(valeur, b[i]))

  return {
    /** Fresh screen: no warm memo. */
    demonte(): void {
      cellules = []
      curseur = 0
    },
    /** One more render, same screen. */
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
    // Deferral out of scope: tests what TRIGGERS the heavy calc.
    useDeferredValue: <T,>(valeur: T): T => valeur,
    // Altitude copied from relief = effect, outside the calc a keystroke reruns.
    useEffect: (): void => {},
    // Target selection (§8.3) = external store: outside a render only its READ matters;
    // subscription wakes nobody, keystroke doesn't touch it.
    useSyncExternalStore: <T,>(_abonne: unknown, lit: () => T): T => lit(),
  }
})

// §4.1 — relief = network resource resolved outside the calc: tests what the KEYSTROKE
// reruns; the awaiting hook has no state/effect to simulate.
vi.mock('../src/ui/relief-site.ts', async (importeReel) => ({
  ...(await importeReel<typeof import('../src/ui/relief-site.ts')>()),
  useReliefSite: () => ({ relief: null, enCharge: false }),
}))

vi.mock('../src/core/nuit.ts', async (importeReel) => {
  const reel = await importeReel<typeof import('../src/core/nuit.ts')>()
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

/** Real catalogue: `planSession` doesn't run on an empty list. */
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
 * What `useState` keeps stable in app but an input builder would recreate per call: sampled
 * relief, entered boîtier, weights, star sky. Fresh identity = changed dep = legit recalc →
 * test would measure its own tooling.
 */
const SAISIE_BOITIER = Object.freeze({
  formatCapteur: 'PLEIN_FORMAT',
  resolutionMpx: DEFAUT.resolutionMpx,
  readNoiseE: '',
  seuilDoubleGainIso: '',
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
    // §5.2 — German equatorial, careful polar alignment: ciel profond open, so plan has
    // targets and the 3 engines work.
    suiviActif: true,
    surSuiviActif: rien,
    qualiteMes: 'SOIGNEE',
    surQualiteMes: rien,
    typeMonture: 'GEM',
    surTypeMonture: rien,
    ...champs,
  }
}

/** Full input as screen holds it at an instant. */
type Saisie = readonly [SaisieLieu, SaisieMateriel]

function rendu([lieuSaisi, materielSaisi]: Saisie): void {
  harnais.rendu()
  useChaineCalcul({
    lieu: lieuSaisi,
    materiel: materielSaisi,
    catalogue: CATALOGUE,
    index: INDEX,
    poids: POIDS,
  })
}

/** Engines rerun by `frappe`, first render having primed everything. */
function moteursRelances(depart: Saisie, frappe: Saisie): number {
  rendu(depart)
  for (const moteur of MOTEURS) moteur.mockClear()
  rendu(frappe)
  return MOTEURS.reduce((total, moteur) => total + moteur.mock.calls.length, 0)
}

/** Same text + decimal zero: 2 inputs, 1 value. */
function zeroFinal(texte: string): string {
  return texte.includes('.') ? `${texte}0` : `${texte}.0`
}

/** Ticket's fields, one per chain stage: site, fond de ciel, optique. */
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
   * §7.2, T-0206 — under a database boîtier, typed ISO enters no calc: the row's double-gain
   * threshold designates it. Typing must cost nothing; `grandeursMateriel` neutralises it
   * BEFORE memoisation. First database row, not a copied id: `boitiers.md` is hand-edited.
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

  /** Negative control: a truly new value MUST rerun everything, else nothing is measured. */
  it('un degré de latitude en plus relance les trois moteurs', () => {
    const voisine = String(Number(DEFAUT.latitude) + 1)
    rendu([lieu(), materiel()])
    for (const moteur of MOTEURS) moteur.mockClear()
    rendu([lieu({ latitude: voisine }), materiel()])
    for (const moteur of MOTEURS) expect(moteur).toHaveBeenCalledTimes(1)
  })
})

/**
 * T-0433 — under a zoom each target is evaluated at its focale optimale (T-0407): turning the
 * ring changes no figure of list/plan, reruns neither.
 */
describe('T-0433 — sous un zoom, régler la focale ne relance ni la liste ni le plan', () => {
  const ZOOM: Objectif = {
    id: 'zoom',
    nom: '70–200 mm f/4–5,6',
    focaleMinMm: 70,
    focaleMaxMm: 200,
    ouvertureGrandAngleN: 4,
    ouvertureTeleN: 5.6,
    typeObjectif: 'RECTILINEAIRE',
  }
  // Aperture follows the ring as in app (`surFocale`): floor at focale.
  const reglage = (focaleMm: number): Saisie => [
    lieu(),
    materiel({
      objectifs: [ZOOM],
      objectifId: ZOOM.id,
      focale: String(focaleMm),
      ouverture: String(plancherAuPas(ouverturePlancher(ZOOM, focaleMm))),
    }),
  ]

  it('du grand-angle au télé, ni `planSession` ni `etatsCibles` ne repartent', () => {
    rendu(reglage(ZOOM.focaleMinMm))
    vi.mocked(planSession).mockClear()
    vi.mocked(etatsCibles).mockClear()
    rendu(reglage(ZOOM.focaleMaxMm))
    expect(planSession).not.toHaveBeenCalled()
    expect(etatsCibles).not.toHaveBeenCalled()
  })

  it('hors zoom, la même frappe relance bien la liste — sans quoi rien n’est mesuré', () => {
    const libre = (f: number): Saisie => [lieu(), materiel({ focale: String(f) })]
    rendu(libre(ZOOM.focaleMinMm))
    vi.mocked(etatsCibles).mockClear()
    rendu(libre(ZOOM.focaleMaxMm))
    expect(etatsCibles).toHaveBeenCalledTimes(1)
  })
})
