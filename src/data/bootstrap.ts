/**
 * §12.1, §12.2, §12.3 — App startup. Two ordered checks: catalogue integrity, storage state.
 * No white screen or raw technical error: each failure has a named cause + course of action.
 */

import { baseDisponible, ecritPaquet, litPaquet } from './db.ts'
import type { IntegritePaquet, ManifestePaquet } from './catalog.ts'
import { verifieIntegrite } from './catalog.ts'
import { decodeEtoilesPas, type Etoile } from './catalog.ts'
import { decodeObjetsPas, type ObjetCielProfond } from './deepsky.ts'
import {
  PAQUET_VIDE,
  decodeConstellations,
  type PaquetConstellations,
} from './constellations.ts'
import { modeReseauCourant, type ModeReseau } from './degradation.ts'
import { FOND_VIDE, decodeFondCarte, type FondCarte } from './fond-carte.ts'
import { AVERTISSEMENT_SANS_BASE, etatStockage, type EtatStockage } from './persistence.ts'
import { parTranches } from '../core/tranches.ts'
import { construitIndexPas, type IndexCiel } from '../core/index-ciel.ts'

export const CHEMIN_MANIFESTE = '/data/manifest.json'

export interface EtatPaquet {
  readonly manifeste: ManifestePaquet
  readonly integrite: IntegritePaquet
}

export interface EtatCatalogues {
  readonly paquets: readonly EtatPaquet[]
  readonly manifesteLu: boolean
  /** Course of action if a mandatory package is missing/corrupt. */
  readonly cause?: string
}

/**
 * T-0343 — manifest comes from network: verify before trust. Malformed entry would crash
 * `resoudPaquet` on a missing field; refused → falls back to « catalogues introuvables »
 * (already named by `verifieCatalogues`).
 */
export function estManifeste(brut: unknown): brut is readonly ManifestePaquet[] {
  return (
    Array.isArray(brut) &&
    brut.every(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Record<string, unknown>).nom === 'string' &&
        typeof (e as Record<string, unknown>).version === 'string' &&
        typeof (e as Record<string, unknown>).sha256 === 'string' &&
        typeof (e as Record<string, unknown>).octets === 'number' &&
        typeof (e as Record<string, unknown>).obligatoire === 'boolean',
    )
  )
}

async function chargeManifeste(): Promise<readonly ManifestePaquet[] | null> {
  try {
    const reponse = await fetch(CHEMIN_MANIFESTE)
    if (!reponse.ok) return null
    const brut: unknown = await reponse.json()
    return estManifeste(brut) ? brut : null
  } catch {
    return null
  }
}

/** IndexedDB package, else download + checksum verify + store. Hash mismatch is never served. */
async function resoudPaquet(manifeste: ManifestePaquet): Promise<EtatPaquet> {
  const local = await litPaquet(manifeste.nom)
  const integriteLocale = await verifieIntegrite(local, manifeste)
  if (integriteLocale === 'OK') return { manifeste, integrite: 'OK' }

  if (modeReseauCourant() === 'HORS_LIGNE') {
    return { manifeste, integrite: integriteLocale }
  }

  try {
    const reponse = await fetch(`/data/${manifeste.nom}-${manifeste.version}.bin`)
    if (!reponse.ok) return { manifeste, integrite: integriteLocale }
    const donnees = await reponse.arrayBuffer()
    const integrite = await verifieIntegrite(donnees, manifeste)
    if (integrite !== 'OK') return { manifeste, integrite: 'CORROMPU' }
    await ecritPaquet({ nom: manifeste.nom, version: manifeste.version, donnees })
    return { manifeste, integrite: 'OK' }
  } catch {
    return { manifeste, integrite: integriteLocale }
  }
}

async function verifieCatalogues(): Promise<EtatCatalogues> {
  const manifestes = await chargeManifeste()
  if (manifestes === null) {
    return {
      paquets: [],
      manifesteLu: false,
      cause:
        'Catalogues introuvables : rechargez la page une fois connecté ' +
        '(en développement : `pnpm data:build`).',
    }
  }

  const paquets = await Promise.all(manifestes.map(resoudPaquet))
  const manquants = paquets.filter(
    (p) => p.manifeste.obligatoire && p.integrite !== 'OK',
  )
  if (manquants.length === 0) return { paquets, manifesteLu: true }

  const noms = manquants.map((p) => p.manifeste.nom).join(', ')
  const horsLigne = modeReseauCourant() === 'HORS_LIGNE'
  return {
    paquets,
    manifesteLu: true,
    cause: horsLigne
      ? `Catalogues indisponibles hors connexion (${noms}) : ils se rechargeront au retour ` +
        'du réseau.'
      : `Catalogues indisponibles (${noms}) : rechargez la page ` +
        '(en développement : `pnpm data:build`).',
  }
}

export const PAQUET_OBJETS = 'openngc'
export const PAQUET_NOMS_OBJETS = 'openngc-noms'

/** §6.1 — Sharpless and Barnard: wide-field domain that OpenNGC lacks. */
export const PAQUET_OBJETS_COMPLEMENT = 'deepsky'
export const PAQUET_NOMS_OBJETS_COMPLEMENT = 'deepsky-noms'

async function decodePaireDeObjets(
  nomEnregistrements: string,
  nomChaines: string,
): Promise<readonly ObjetCielProfond[]> {
  const [enregistrements, chaines] = await Promise.all([
    litPaquet(nomEnregistrements),
    litPaquet(nomChaines),
  ])
  if (enregistrements === null || chaines === null) return []
  return parTranches(decodeObjetsPas({ enregistrements, chaines }))
}

/**
 * Deep-sky catalogue decoded from packages stored by `demarre()`.
 * Empty list if packages missing (cause named by `verifieCatalogues()`); §6, §7 engines stay
 * usable on hand-entered target (§12.5).
 * Two packages, one catalogue: OpenNGC = classic deep sky, `deepsky` = Sharpless/Barnard it
 * ignores. No overlap: NGC/IC duplicates dropped at source, not here (§6.1).
 */
export async function chargeObjetsCielProfond(): Promise<readonly ObjetCielProfond[]> {
  // T-0296 — reads start together, decodes in sequence: sliced, they would interleave and two
  // concurrent slices hold the thread twice as long.
  const ngc = await decodePaireDeObjets(PAQUET_OBJETS, PAQUET_NOMS_OBJETS)
  const complement = await decodePaireDeObjets(
    PAQUET_OBJETS_COMPLEMENT,
    PAQUET_NOMS_OBJETS_COMPLEMENT,
  )
  return [...ngc, ...complement]
}

const PAQUET_ETOILES = 'hyg'

/**
 * Star catalogue decoded from HYG package; serves cheminement and pointing map (§8.4). Empty if
 * package missing (named by `verifieCatalogues()`).
 */
export async function chargeEtoiles(): Promise<readonly Etoile[]> {
  const paquet = await litPaquet(PAQUET_ETOILES)
  return paquet === null ? [] : parTranches(decodeEtoilesPas(paquet))
}

const PAQUET_CONSTELLATIONS = 'constellations'

/** §3.4 — figures, astérismes, frontières. Package missing: stars still shown, sky correct. */
export async function chargeConstellations(): Promise<PaquetConstellations> {
  const paquet = await litPaquet(PAQUET_CONSTELLATIONS)
  return paquet === null ? PAQUET_VIDE : decodeConstellations(paquet)
}

const PAQUET_FOND_CARTE = 'fond-carte'

/** §12.5 — site map background. Absent: empty map, numeric input stays. */
export async function chargeFondCarte(): Promise<FondCarte> {
  const paquet = await litPaquet(PAQUET_FOND_CARTE)
  return paquet === null ? FOND_VIDE : decodeFondCarte(paquet)
}

/**
 * T-0296 — §3.3 index, built in slices (costliest startup stage). Built here with the
 * catalogues, not in the compute chain: `useMemo` can't yield, index needn't wait for a render.
 */
export async function construitIndexEtoiles(
  etoiles: readonly Etoile[],
): Promise<IndexCiel> {
  return parTranches(construitIndexPas(etoiles))
}

/** §3.3 — Gaia package deferred: its presence sets the zoom floor. */
const PAQUET_GAIA = 'gaia'

export function gaiaCharge(catalogues: EtatCatalogues): boolean {
  return catalogues.paquets.some(
    (p) => p.manifeste.nom === PAQUET_GAIA && p.integrite === 'OK',
  )
}

export interface EtatDemarrage {
  readonly modeReseau: ModeReseau
  readonly catalogues: EtatCatalogues
  readonly stockage: EtatStockage
}

export async function demarre(): Promise<EtatDemarrage> {
  const [catalogues, stockage, base] = await Promise.all([
    verifieCatalogues(),
    etatStockage(),
    baseDisponible(),
  ])
  return {
    modeReseau: modeReseauCourant(),
    catalogues,
    stockage: base ? stockage : { ...stockage, avertissement: AVERTISSEMENT_SANS_BASE },
  }
}

/** §12.1 — startup-failure state: screen naming failure and course of action, never empty sky. */
export function demarrageEchoue(): EtatDemarrage {
  return {
    modeReseau: modeReseauCourant(),
    catalogues: {
      paquets: [],
      manifesteLu: false,
      cause: 'Le démarrage a échoué : rechargez la page.',
    },
    stockage: {
      supporte: false,
      quotaMo: null,
      usageMo: null,
      avertissement: AVERTISSEMENT_SANS_BASE,
    },
  }
}
