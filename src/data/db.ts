/**
 * §12.1, §12.3 — Local persistence on IndexedDB. Two data natures:
 *   - catalogue packages, object thumbnails: re-downloadable;
 *   - profils, sites, edited horizon masks, session plans: NOT — what `persistence.ts` JSON
 *     export must protect.
 */

import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { FormatCapteur } from '../registry/capteur-formats.ts'
import { NB_AZIMUTS } from '../core/site.ts'
import type { Objectif } from '../core/objectif.ts'
import type { ReliefConnu } from './relief.ts'

export const NOM_BASE = 'orion'
/**
 * 2 — added `images` store (§6.4). Bump destroys nothing: existing stores pass through upgrade,
 * only the new one is created.
 */
const VERSION_BASE = 2

/** Pre-Orion product name. See `reprendAncienneBase`. */
const NOM_BASE_ANCIEN = 'astrofort'
/** Migration flag, in `reglages` of destination base. */
const CLE_REPRISE = 'reprise-ancienne-base'

export interface SiteEnregistre {
  readonly id: string
  readonly nom: string
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  readonly altitudeM: number
  readonly fuseau: string
  readonly sqmMesure?: number
  readonly bortleDeclare?: number
  /** 360 values, one per azimuth degree; absent until relief known. */
  readonly masqueHorizon?: readonly number[]
  /** True = flat 0° fallback, no relief data (§4.1). */
  readonly masqueEstHypothese?: boolean
}

export interface ProfilMateriel {
  readonly id: string
  readonly nom: string
  readonly focaleMm: number
  readonly ouvertureN: number
  readonly typeObjectif: 'RECTILINEAIRE' | 'FISHEYE'
  /**
   * T-0404 — lens park + mounted one. `focaleMm`/`ouvertureN` stay the current setting (lens
   * bounds it, not replaces). Absent in older profil, or `objectifId` gone from park: free lens.
   */
  readonly objectifs?: readonly Objectif[]
  readonly objectifId?: string
  /**
   * T-0204 — id of a `boitiers.md` row. Absent or gone from base: custom mode with fields below.
   * Only the id is stored (not the body), so base fixes reach saved profils (§2.1).
   */
  readonly boitierId?: string
  /**
   * Sensor format + resolution entered (§5.1, custom mode); pitch derived, not persisted.
   * Not re-downloadable: missing from export, a re-imported profil would describe another
   * device's sensor (§12.3).
   */
  readonly formatCapteur: FormatCapteur
  readonly resolutionMpx?: number
  readonly readNoiseE?: number
  readonly seuilDoubleGainIso?: number
  readonly zpSys?: number
  readonly tailleRawMo?: number
  /** §7.2 — chosen capture ISO, if not the dual-gain threshold one. */
  readonly isoCapture?: number
  readonly capteurMode: 'FULL_FRAME' | 'APSC_CROP'
  readonly suiviActif: boolean
  readonly qualiteMes?: 'SOIGNEE' | 'APPROX' | 'INCONNUE'
  readonly typeMonture?: 'GEM' | 'TRACKER' | 'ALTAZ'
}

export interface PlanEnregistre {
  readonly id: string
  readonly nom: string
  readonly dateIso: string
  readonly siteId: string
  readonly profilId: string
  /** §2.1 registry version that produced this plan; update → recompute, old values never kept. */
  readonly versionRegistre: string
  readonly contenu: unknown
}

export interface PaquetStocke {
  readonly nom: string
  readonly version: string
  readonly donnees: ArrayBuffer
}

/**
 * §6.4 — a target's image, stored by designation.
 * Bytes stored, not address: image survives network loss (§12.5). `origine` + `credit` travel
 * with them, else a cached image shows without attribution = without right to be shown.
 * Credit never absent: encyclopedic image with unreadable author/licence is not stored; survey
 * cutout carries registry's fixed credit.
 */
export interface ImageStockee {
  readonly designation: string
  readonly origine: 'ENCYCLOPEDIE' | 'RELEVE'
  readonly octets: Blob
  readonly credit: CreditImage
  /** Address the bytes came from: traces displayed source. */
  readonly source: string
  readonly obtenueIso: string
}

export interface CreditImage {
  readonly auteur: string
  readonly licence: string
  readonly lien: string
}

interface OrionDB extends DBSchema {
  sites: { key: string; value: SiteEnregistre }
  profils: { key: string; value: ProfilMateriel }
  plans: { key: string; value: PlanEnregistre }
  paquets: { key: string; value: PaquetStocke }
  images: { key: string; value: ImageStockee }
  reglages: { key: string; value: unknown }
}

let instance: Promise<IDBPDatabase<OrionDB>> | null = null

/**
 * §12.5 — failed open not cached: base blocked by another tab or refused once must be retryable
 * at next gesture, not condemn the session.
 */
export function db(): Promise<IDBPDatabase<OrionDB>> {
  instance ??= ouvre().catch((erreur: unknown) => {
    instance = null
    throw erreur
  })
  return instance
}

async function ouvre(): Promise<IDBPDatabase<OrionDB>> {
  const base = await openDB<OrionDB>(NOM_BASE, VERSION_BASE, {
    upgrade(base) {
      // Create each store if missing: v1 upgrade adds `images` without touching stored profils,
      // sites, plans (§12.3).
      const cree = (nom: 'sites' | 'profils' | 'plans' | 'paquets' | 'images', cle?: string) => {
        if (base.objectStoreNames.contains(nom)) return
        base.createObjectStore(nom, cle === undefined ? undefined : { keyPath: cle })
      }
      cree('sites', 'id')
      cree('profils', 'id')
      cree('plans', 'id')
      cree('paquets', 'nom')
      cree('images', 'designation')
      if (!base.objectStoreNames.contains('reglages')) base.createObjectStore('reglages')
    },
  })
  await reprendAncienneBase(base)
  return base
}

type MagasinCle = 'sites' | 'profils' | 'plans' | 'paquets' | 'images'

/** Inline-key stores: key travels with value. */
async function copie<N extends MagasinCle>(
  source: IDBPDatabase<OrionDB>,
  cible: IDBPDatabase<OrionDB>,
  nom: N,
): Promise<void> {
  if (!source.objectStoreNames.contains(nom)) return
  for (const valeur of await source.getAll(nom)) await cible.put(nom, valeur)
}

/**
 * Product was called Astrofort, base carried its name. IndexedDB has no rename: copy then delete
 * source. Saves sites, profils, plans, edited masks: not re-downloadable (§12.3).
 * Flag in destination base: once set, no startup opens the old one.
 */
async function reprendAncienneBase(base: IDBPDatabase<OrionDB>): Promise<void> {
  if ((await base.get('reglages', CLE_REPRISE)) === true) return

  // No version: take base as is. Absent → born empty (no store, nothing to copy); delete
  // removes it at once.
  const ancienne = await openDB<OrionDB>(NOM_BASE_ANCIEN)
  await copie(ancienne, base, 'sites')
  await copie(ancienne, base, 'profils')
  await copie(ancienne, base, 'plans')
  await copie(ancienne, base, 'paquets')
  await copie(ancienne, base, 'images')
  // `reglages`: out-of-line key, not derivable from value → carried.
  if (ancienne.objectStoreNames.contains('reglages')) {
    for (const cle of await ancienne.getAllKeys('reglages')) {
      await base.put('reglages', await ancienne.get('reglages', cle), cle)
    }
  }
  ancienne.close()
  // Not awaited: another tab on old base would block it, and opening the new one. All already
  // copied; deferred delete loses nothing.
  void deleteDB(NOM_BASE_ANCIEN).catch(() => undefined)
  await base.put('reglages', true, CLE_REPRISE)
}

/**
 * §12.5 — packages re-downloadable: without IndexedDB (private browsing, quota, refused base),
 * just-served ones stay in memory for the session. Sky displays; only next offline startup is
 * lost, storage warning says so.
 */
const paquetsEnMemoire = new Map<string, ArrayBuffer>()

export async function litPaquet(nom: string): Promise<ArrayBuffer | null> {
  const enMemoire = paquetsEnMemoire.get(nom)
  if (enMemoire !== undefined) return enMemoire
  try {
    const enregistrement = await (await db()).get('paquets', nom)
    return enregistrement?.donnees ?? null
  } catch {
    return null
  }
}

export async function ecritPaquet(paquet: PaquetStocke): Promise<void> {
  try {
    await (await db()).put('paquets', paquet)
  } catch {
    paquetsEnMemoire.set(paquet.nom, paquet.donnees)
  }
}

/** True when base opens: otherwise nothing entered survives the session. */
export async function baseDisponible(): Promise<boolean> {
  try {
    await db()
    return true
  } catch {
    return false
  }
}

/**
 * §12.3 — targets chosen for the night (§8.3), stored by designation. In `reglages`, not a
 * separate store: séance setting, not entity (catalogue key list, worthless without catalogue).
 * No `VERSION_BASE` bump.
 */
const CLE_CIBLES_CHOISIES = 'cibles-choisies'

/**
 * Base output is VALIDATED, never trusted: tampered export, earlier version or console may leave
 * a non-string-list. Non-conforming → empty selection; screen re-asks the gesture, no crash.
 */
export async function litCiblesChoisies(): Promise<readonly string[]> {
  const brut = await (await db()).get('reglages', CLE_CIBLES_CHOISIES)
  if (!Array.isArray(brut)) return []
  return brut.filter((d): d is string => typeof d === 'string')
}

export async function ecritCiblesChoisies(designations: readonly string[]): Promise<void> {
  await (await db()).put('reglages', [...designations], CLE_CIBLES_CHOISIES)
}

/**
 * §4.1, §12.5 — site relief cached under coords at 0.001° (≈ 110 m, §4.1 precision): neighbour
 * under 55 m rereads the first profile, gap below tile resolution. In `reglages` like chosen
 * targets: no `VERSION_BASE` bump for 360 numbers/site. Output validated: not a complete profile
 * → null, relief re-requested from network.
 */
const MILLIEMES = 1000
/**
 * Version of the computation that produced the profile. Cached profile survives updates; without
 * it a fixed computation never applies to visited sites. Bump on any change of `profilRelief` or
 * its constants.
 */
// v4 (T-0365): cache also keeps site ground altitude, beside the profile.
const VERSION_PROFIL = 4

export function cleRelief(latDeg: number, lonDeg: number): string {
  return `relief:v${VERSION_PROFIL}:${Math.round(latDeg * MILLIEMES)},${Math.round(lonDeg * MILLIEMES)}`
}

export async function litRelief(cle: string): Promise<ReliefConnu | null> {
  const brut: unknown = await (await db()).get('reglages', cle)
  if (typeof brut !== 'object' || brut === null) return null
  const { profil, solM, courbes, silhouettes, crete, signatureCourbes } = brut as Record<string, unknown>
  if (!estProfil(profil)) return null
  if (typeof solM !== 'number' || !Number.isFinite(solM)) return null
  // T-0395 — unreadable contours cost only the contours; mask is valid.
  const courbesLues =
    courbes instanceof Float32Array &&
    courbes.length % 2 === 0 &&
    typeof signatureCourbes === 'string'
      ? {
          courbesDeg: courbes,
          signatureCourbes,
          ...(silhouettes instanceof Float32Array && silhouettes.length % 2 === 0
            ? { silhouettesDeg: silhouettes }
            : {}),
          ...(crete instanceof Float32Array && crete.length > 0 ? { creteDeg: crete } : {}),
        }
      : {}
  return { etat: 'RELIEF', altitudesDeg: profil, solM, ...courbesLues }
}

function estProfil(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === NB_AZIMUTS &&
    v.every((x) => typeof x === 'number' && Number.isFinite(x))
  )
}

export async function ecritRelief(cle: string, relief: ReliefConnu): Promise<void> {
  await (await db()).put(
    'reglages',
    {
      profil: [...relief.altitudesDeg],
      solM: relief.solM,
      ...(relief.courbesDeg === undefined
        ? {}
        : {
            courbes: relief.courbesDeg,
            signatureCourbes: relief.signatureCourbes,
            ...(relief.silhouettesDeg === undefined ? {} : { silhouettes: relief.silhouettesDeg }),
            ...(relief.creteDeg === undefined ? {} : { crete: relief.creteDeg }),
          }),
    },
    cle,
  )
}

export async function litImage(designation: string): Promise<ImageStockee | null> {
  return (await (await db()).get('images', designation)) ?? null
}

export async function ecritImage(image: ImageStockee): Promise<void> {
  await (await db()).put('images', image)
}
