/**
 * §6.4 — vignette prefetch for top of list: what it requests and doesn't.
 * Verifies a THROUGHPUT, not an image. Caps exist for a public service's 429: correct prefetch
 * counts requests, runs them 2 by 2, emits none offline, drops a stale result set.
 * No designation written: objects from embedded packs, disjoint slices. Network stubbed with HELD
 * promises, else concurrency unobservable.
 *
 * ponytail: wake-up of already-mounted vignettes checked at store level (`abonneImages`), not via
 * React render: suite runs in `node` env, no DOM. Upgrade: once a DOM dependency enters the
 * project, add a render to this test.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeObjets, type ObjetCielProfond } from '../src/data/deepsky.ts'
import { db } from '../src/data/db.ts'
import { I } from '../src/registry/imagerie.ts'
import {
  abonneImages,
  oublieImages,
  prechargeVignettes,
} from '../src/ui/image-cible-memoire.ts'
import { paquet } from './fixtures.ts'

const CATALOGUE: readonly ObjetCielProfond[] = decodeObjets({
  enregistrements: paquet('openngc-1.bin'),
  chaines: paquet('openngc-noms-1.bin'),
})

const PLAFOND = I('VIGNETTES_PRECHARGEES_MAX')
const DEBIT = I('PRECHARGE_SIMULTANEE_MAX')

/** Catalogue slice, disjoint from others. */
function tranche(rang: number, combien: number): readonly ObjetCielProfond[] {
  const debut = rang * combien
  const objets = CATALOGUE.slice(debut, debut + combien)
  expect(objets.length, 'le catalogue embarqué est trop court pour ce test').toBe(combien)
  return objets
}

// Stubbed network, HELD responses: makes concurrency observable

let appels: string[] = []
let enVol = 0
let volMax = 0
let retenues: (() => void)[] = []
/** Held image: request run to completion = end of chain. */
let reveils = 0
let seDesabonne: (() => void) | null = null

function bouchonne(): void {
  vi.stubGlobal('fetch', (adresse: string) => {
    appels.push(String(adresse))
    enVol += 1
    volMax = Math.max(volMax, enVol)
    return new Promise((resolution) => {
      retenues.push(() => {
        enVol -= 1
        resolution({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob([new Uint8Array(1024)], { type: 'image/jpeg' })),
        })
      })
    })
  })
}

/** Loop turns per awaited request. A guard, not a wait. */
const TOURS_PAR_REQUETE = 40

/** One loop turn: held work leaves, consumers resume queue. */
async function tour(): Promise<void> {
  for (const relache of retenues.splice(0)) relache()
  await new Promise((r) => setTimeout(r, 0))
}

/**
 * Waits until prefetch emitted `nouvelles` requests since `base`, then quiet.
 * Waits on a COUNT, never a delay: between requests a consumer crosses IndexedDB (read, write);
 * a suite parallel to ~60 files promises no timing.
 *
 * T-0215 — WHAT GOES QUIET IS NOT THE NETWORK BUT THE WORK IT FEEDS. Stub decrements `enVol` on
 * RESOLVE: consumer hasn't read blob nor written IndexedDB, image not yet retained. Old version
 * added 2 fixed turns after network silence = disguised duration; under load the chain overran →
 * last image unretained, 2 assertions fell (wake count; widened set re-requesting an image
 * supposedly in memory).
 * Exact condition: stub ALWAYS answers an image, so each emitted request yields a wake; done only
 * when both counts meet.
 */
async function attend(base: number, nouvelles: number): Promise<void> {
  for (let garde = 0; garde <= (nouvelles + 1) * TOURS_PAR_REQUETE; garde += 1) {
    if (
      retenues.length === 0 &&
      enVol === 0 &&
      appels.length - base >= nouvelles &&
      reveils === appels.length
    ) {
      return
    }
    await tour()
  }
  throw new Error(
    `préchargement inachevé : ${appels.length - base} requêtes sur ${nouvelles} attendues, ` +
      `${reveils} réveils sur ${appels.length} requêtes émises`,
  )
}

/**
 * Waits for the FIRST request, releasing nothing that leaves. Consumer reads IndexedDB before
 * emitting: one loop turn not surely enough → load-dependent suite.
 */
async function attendPremiere(): Promise<void> {
  for (let garde = 0; garde < TOURS_PAR_REQUETE; garde += 1) {
    if (appels.length > 0) return
    await tour()
  }
  throw new Error('aucune requête émise : le préchargement ne démarre pas')
}

/** Prefetches a set, awaits the NEW requests it must emit — no more, no less. */
async function prechargeEtAttend(
  objets: readonly ObjetCielProfond[],
  nouvelles: number,
): Promise<void> {
  const base = appels.length
  prechargeVignettes(objets)
  await attend(base, nouvelles)
  expect(appels.length - base).toBe(nouvelles)
}

/** Crop address carries coordinates, not the designation. */
function requetesPour(objets: readonly ObjetCielProfond[]): number {
  return appels.filter((adresse) => {
    const parametres = new URL(adresse).searchParams
    return objets.some(
      (o) =>
        Number(parametres.get('ra')) === o.adDeg && Number(parametres.get('dec')) === o.decDeg,
    )
  }).length
}

beforeEach(async () => {
  appels = []
  retenues = []
  enVol = 0
  volMax = 0
  reveils = 0
  // `oublieImages` empties subscribers: re-lay bench subscription after, never before.
  oublieImages()
  seDesabonne = abonneImages(() => {
    reveils += 1
  })
  await (await db()).clear('images')
  bouchonne()
})

afterEach(() => {
  seDesabonne?.()
  seDesabonne = null
  vi.unstubAllGlobals()
})

describe('plafond de requêtes §6.4', () => {
  it('ne demande que le haut de la liste, quelle que soit sa longueur', async () => {
    await prechargeEtAttend(tranche(0, PLAFOND * 3), PLAFOND)
  })

  it('mène les requêtes au débit du registre, jamais toutes de front', async () => {
    await prechargeEtAttend(tranche(1, PLAFOND), PLAFOND)
    expect(volMax).toBe(DEBIT)
  })

  it('ne redemande pas un jeu de résultats identique — la liste se recompose chaque minute', async () => {
    const jeu = tranche(2, DEBIT * 2)
    await prechargeEtAttend(jeu, jeu.length)
    await prechargeEtAttend(jeu, 0)
  })

  it('ne redemande pas une image déjà en mémoire de session', async () => {
    const jeu = tranche(3, DEBIT * 2)
    await prechargeEtAttend(jeu, jeu.length)

    // WIDENED set: same start, one more target; only the new one must leave.
    await prechargeEtAttend([...jeu, ...tranche(4, 1)], 1)
  })
})

describe('abandon d’un jeu périmé §6.4', () => {
  it('n’achève pas la liste précédente : ce qui n’est pas parti ne part plus', async () => {
    const perime = tranche(5, PLAFOND)
    const courant = tranche(6, DEBIT)

    prechargeVignettes(perime)
    await attendPremiere() // first requests leave, queue keeps the rest
    expect(appels.length).toBeLessThanOrEqual(DEBIT)

    await prechargeEtAttend(courant, courant.length)

    // Only requests in flight at switch time could concern the old set.
    expect(requetesPour(perime)).toBeLessThanOrEqual(DEBIT)
    expect(requetesPour(courant)).toBe(courant.length)
  })
})

describe('hors ligne §12.5', () => {
  it('n’émet aucune requête, et laisse le même jeu redemandable au retour du réseau', async () => {
    const jeu = tranche(7, DEBIT * 2)

    vi.stubGlobal('navigator', { onLine: false })
    await prechargeEtAttend(jeu, 0)

    // Offline refusal ≠ served request: else network return never catches up with displayed list.
    vi.stubGlobal('navigator', { onLine: true })
    await prechargeEtAttend(jeu, jeu.length)
  })
})

describe('réveil des vignettes montées §6.4', () => {
  it('notifie le magasin à chaque image retenue', async () => {
    const jeu = tranche(8, DEBIT * 2)
    // 2nd subscriber, distinct from bench's: checks EACH subscriber is notified (`attend` already
    // requires chain end).
    let prevenu = 0
    const desabonne = abonneImages(() => {
      prevenu += 1
    })

    await prechargeEtAttend(jeu, jeu.length)
    desabonne()

    // Without this notification a row that concluded absence stays imageless until panel remount.
    expect(prevenu).toBe(jeu.length)
  })
})
