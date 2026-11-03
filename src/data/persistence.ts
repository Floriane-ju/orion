/**
 * §12.3 — Local storage and eviction resistance.
 * Storage stays « best effort »: `persist()` no longer requested. On Firefox it prompted every
 * new user for a minor risk: eviction only under disk pressure, catalogues re-download, night
 * plan travels in URL, rest in JSON export.
 */

import { db } from './db.ts'
import type { PlanEnregistre, ProfilMateriel, SiteEnregistre } from './db.ts'
import type { MasqueHorizon } from '../core/site.ts'
import { normalisePoids, type PoidsScoring } from '../core/session.ts'
import { type DomaineId, valide as valideDomaine } from '../registry/domains.ts'
import { TABLE_FORMATS_CAPTEUR, estFormatCapteur } from '../registry/capteur-formats.ts'
import { valideObjectif, type Objectif } from '../core/objectif.ts'

export interface EtatStockage {
  readonly supporte: boolean
  readonly quotaMo: number | null
  readonly usageMo: number | null
  /** Set when browser has no local storage. */
  readonly avertissement?: string
}

export const OCTETS_PAR_MO = 1024 * 1024

export const AVERTISSEMENT_SANS_BASE =
  'Stockage local indisponible : le ciel est chargé pour cette session, mais rien de ce que ' +
  'vous saisissez ne sera mémorisé.'

export async function etatStockage(): Promise<EtatStockage> {
  if (typeof navigator === 'undefined' || navigator.storage === undefined) {
    return {
      supporte: false,
      quotaMo: null,
      usageMo: null,
      avertissement:
        'Ce navigateur peut effacer vos données : exportez-les régulièrement.',
    }
  }
  const estimation = (await navigator.storage.estimate?.()) ?? {}
  return {
    supporte: true,
    quotaMo: estimation.quota === undefined ? null : estimation.quota / OCTETS_PAR_MO,
    usageMo: estimation.usage === undefined ? null : estimation.usage / OCTETS_PAR_MO,
  }
}

const FORMAT_EXPORT = 'orion-export'
/** Pre-Orion (Astrofort) format: reread, never rewritten. */
const FORMAT_EXPORT_ANCIEN = 'astrofort-export'

export interface ExportUtilisateur {
  readonly format: typeof FORMAT_EXPORT | typeof FORMAT_EXPORT_ANCIEN
  readonly version: number
  readonly exporteLe: string
  readonly sites: readonly SiteEnregistre[]
  readonly profils: readonly ProfilMateriel[]
  readonly plans: readonly PlanEnregistre[]
  /**
   * §8.3 — scoring weights tuned for the séance, normalised as plan used them. Absent in
   * pre-tuning exports: file stays valid, restarts from C-15 values.
   */
  readonly poids?: PoidsScoring
}

export const VERSION_EXPORT = 1

/**
 * Manual JSON export — mandatory at MVP: eviction must never destroy user-produced data.
 * Catalogue packages excluded (re-downloadable).
 */
export async function exporteDonneesUtilisateur(
  poids?: PoidsScoring,
): Promise<ExportUtilisateur> {
  const base = await db()
  const [sites, profils, plans] = await Promise.all([
    base.getAll('sites'),
    base.getAll('profils'),
    base.getAll('plans'),
  ])
  return {
    format: FORMAT_EXPORT,
    version: VERSION_EXPORT,
    exporteLe: new Date().toISOString(),
    sites,
    profils,
    plans,
    // Normalised at write: form §8.3 declares, rereadable without raw slider scale.
    ...(poids === undefined ? {} : { poids: normalisePoids(poids) }),
  }
}

export class ExportInvalideError extends Error {
  constructor(raison: string) {
    super(`Fichier d’export inexploitable : ${raison}`)
    this.name = 'ExportInvalideError'
  }
}

/**
 * Export file = foreign data, like an input: may be hand-edited between machines. Without
 * per-field check, `latitudeDeg: "abc"` enters base and returns `NaN` at every startup
 * (persisted → replayed). Ranges are §2.1 registry's, never rewritten here.
 * A checker returns `null` if field passes, else the refusal reason.
 */
type Verificateur = (valeur: unknown) => string | null

const texte: Verificateur = (v) =>
  typeof v === 'string' && v !== '' ? null : 'doit être une chaîne non vide'

const booleen: Verificateur = (v) => (typeof v === 'boolean' ? null : 'doit être un booléen')

/** Plan `contenu`: free structure, app-produced and app-reread. */
const quelconque: Verificateur = (v) => (v === undefined ? 'est absent' : null)

function nombre(domaine?: DomaineId): Verificateur {
  return (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'doit être un nombre fini'
    if (domaine === undefined) return null
    try {
      valideDomaine(domaine, v)
      return null
    } catch (erreur) {
      return erreur instanceof Error ? erreur.message : 'est hors du domaine attendu'
    }
  }
}

function parmi(...valeurs: readonly string[]): Verificateur {
  return (v) =>
    typeof v === 'string' && valeurs.includes(v)
      ? null
      : `doit valoir ${valeurs.map((x) => `« ${x} »`).join(', ')}`
}

function optionnel(verifie: Verificateur): Verificateur {
  return (v) => (v === undefined ? null : verifie(v))
}

/** Horizon mask = 360 heights, one per azimuth degree (§4.1). */
const masqueHorizon: Verificateur = (v) => {
  if (!Array.isArray(v) || v.length !== 360) return 'doit être un tableau de 360 hauteurs'
  const hauteur = nombre('masque_horizon_deg')
  for (const [azimut, valeur] of v.entries()) {
    const raison = hauteur(valeur)
    if (raison !== null) return `à l’azimut ${azimut} : ${raison}`
  }
  return null
}

type Forme = Readonly<Record<string, Verificateur>>

const FORME_SITE: Forme = {
  id: texte,
  nom: texte,
  latitudeDeg: nombre('latitude_deg'),
  longitudeDeg: nombre('longitude_deg'),
  altitudeM: nombre('altitude_m'),
  fuseau: texte,
  sqmMesure: optionnel(nombre('sqm_mesure')),
  bortleDeclare: optionnel(nombre('bortle_declare')),
  masqueHorizon: optionnel(masqueHorizon),
  masqueEstHypothese: optionnel(booleen),
}

const FORME_OBJECTIF: Forme = {
  id: texte,
  nom: texte,
  focaleMinMm: nombre('focale_mm'),
  focaleMaxMm: nombre('focale_mm'),
  ouvertureGrandAngleN: nombre('ouverture_N'),
  ouvertureTeleN: nombre('ouverture_N'),
  typeObjectif: parmi('RECTILINEAIRE', 'FISHEYE'),
}

/**
 * T-0404 — lens park: each field in its domain, then whole-lens coherence (an imported inverted
 * range would make aperture floor decrease while zooming).
 */
const parcObjectifs: Verificateur = (v) => {
  if (!Array.isArray(v)) return 'doit être une liste d’objectifs'
  // Two lenses with same id: one would hide the other at mount, removing one removes both.
  const ids = v.map((o: unknown) => (typeof o === 'object' && o !== null ? (o as { id?: unknown }).id : undefined))
  if (new Set(ids).size !== ids.length) return 'porte deux objectifs de même identifiant'
  for (const [index, element] of v.entries()) {
    if (typeof element !== 'object' || element === null) return `l’objectif n°${index + 1} n’est pas un objet`
    const objectif = element as Record<string, unknown>
    for (const [champ, verifie] of Object.entries(FORME_OBJECTIF)) {
      const raison = verifie(objectif[champ])
      if (raison !== null) return `l’objectif n°${index + 1}, « ${champ} » ${raison}`
    }
    try {
      valideObjectif(element as Objectif)
    } catch (erreur) {
      return `l’objectif n°${index + 1} : ${erreur instanceof Error ? erreur.message : 'incohérent'}`
    }
  }
  return null
}

const FORME_PROFIL: Forme = {
  id: texte,
  nom: texte,
  focaleMm: nombre('focale_mm'),
  ouvertureN: nombre('ouverture_N'),
  typeObjectif: parmi('RECTILINEAIRE', 'FISHEYE'),
  objectifs: optionnel(parcObjectifs),
  // Like `boitierId`: id absent from park → free lens.
  objectifId: optionnel(texte),
  // T-0204 — `texte`, not `parmi(...)`: id absent from base isn't a corrupt file; input falls
  // back to custom mode and fields below were exported. Refusing import would lose the whole
  // profil for one row.
  boitierId: optionnel(texte),
  formatCapteur: parmi(...TABLE_FORMATS_CAPTEUR.map((f) => f.format)),
  resolutionMpx: optionnel(nombre('resolution_mpx')),
  readNoiseE: optionnel(nombre('read_noise_e')),
  seuilDoubleGainIso: optionnel(nombre('seuil_double_gain_iso')),
  zpSys: optionnel(nombre('zp_sys')),
  tailleRawMo: optionnel(nombre('taille_raw_mo')),
  isoCapture: optionnel(nombre('iso_capture')),
  capteurMode: parmi('FULL_FRAME', 'APSC_CROP'),
  suiviActif: booleen,
  qualiteMes: optionnel(parmi('SOIGNEE', 'APPROX', 'INCONNUE')),
  typeMonture: optionnel(parmi('GEM', 'TRACKER', 'ALTAZ')),
}

const FORME_PLAN: Forme = {
  id: texte,
  nom: texte,
  dateIso: texte,
  siteId: texte,
  profilId: texte,
  versionRegistre: texte,
  contenu: quelconque,
}

/** Refusal names the faulty record (by id if any) and the field. */
function valideEnregistrements(section: string, forme: Forme, elements: readonly unknown[]): void {
  for (const [index, element] of elements.entries()) {
    if (typeof element !== 'object' || element === null || Array.isArray(element)) {
      throw new ExportInvalideError(`${section} n°${index + 1} n’est pas un objet`)
    }
    const enregistrement = element as Record<string, unknown>
    const identite =
      typeof enregistrement.id === 'string' && enregistrement.id !== ''
        ? `« ${enregistrement.id} »`
        : `n°${index + 1}`
    for (const [champ, verifie] of Object.entries(forme)) {
      const raison = verifie(enregistrement[champ])
      if (raison !== null) {
        throw new ExportInvalideError(`${section} ${identite}, champ « ${champ} » : ${raison}`)
      }
    }
  }
}

/**
 * The five C-15 weights, when file carries them. Out-of-domain weight → negative/NaN score,
 * silently arbitrary plan: refused like an input.
 */
const poidsScoring: Verificateur = (v) => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'doit être un objet'
  const champs = v as Record<string, unknown>
  const poids = nombre('poids_scoring')
  for (const critere of ['cadrage', 'hauteur', 'signal', 'fenetre', 'lune'] as const) {
    const raison = poids(champs[critere])
    if (raison !== null) return `« ${critere} » ${raison}`
  }
  return null
}

function valide(donnees: unknown): asserts donnees is ExportUtilisateur {
  if (typeof donnees !== 'object' || donnees === null) {
    throw new ExportInvalideError('le contenu n’est pas un objet JSON')
  }
  const candidat = donnees as Partial<ExportUtilisateur>
  if (candidat.format !== FORMAT_EXPORT && candidat.format !== FORMAT_EXPORT_ANCIEN) {
    throw new ExportInvalideError('ce n’est pas un export Orion')
  }
  if (candidat.version !== VERSION_EXPORT) {
    throw new ExportInvalideError(
      `version ${String(candidat.version)} non prise en charge (attendu ${VERSION_EXPORT})`,
    )
  }
  for (const champ of ['sites', 'profils', 'plans'] as const) {
    if (!Array.isArray(candidat[champ])) {
      throw new ExportInvalideError(`la section « ${champ} » est absente ou malformée`)
    }
  }
  const raisonPoids = optionnel(poidsScoring)(candidat.poids)
  if (raisonPoids !== null) {
    throw new ExportInvalideError(`les poids de scoring : ${raisonPoids}`)
  }
  // All verified BEFORE the transaction: damaged file writes nothing, not even half.
  valideEnregistrements('le site', FORME_SITE, candidat.sites as readonly unknown[])
  valideEnregistrements('le profil', FORME_PROFIL, candidat.profils as readonly unknown[])
  valideEnregistrements('le plan', FORME_PLAN, candidat.plans as readonly unknown[])
}

/**
 * Reimport entry point from a file. Any failure (unreadable JSON included) exits as
 * `ExportInvalideError`, text written to be shown as is.
 */
export async function importeFichierUtilisateur(
  texte: string,
): Promise<PoidsScoring | null> {
  let donnees: unknown
  try {
    donnees = JSON.parse(texte)
  } catch {
    // `JSON.parse` detail = browser's English sentence; `ExportInvalideError` text is shown as
    // is, so omitted.
    throw new ExportInvalideError('le fichier n’est pas du JSON lisible.')
  }
  return importeDonneesUtilisateur(donnees)
}

/**
 * Lossless reimport; same id → replaced. Scoring weights go to base with the rest and are also
 * returned to caller, who restores them on screen (§8.3).
 */
export async function importeDonneesUtilisateur(donnees: unknown): Promise<PoidsScoring | null> {
  valide(donnees)
  const base = await db()
  const tx = base.transaction(['sites', 'profils', 'plans', 'reglages'], 'readwrite')
  await Promise.all([
    // Manual horizon-mask readings left the UI: old exports carrying them are dropped, not
    // restored to base.
    ...donnees.sites.map((site) => {
      const { masquePoints: _retire, ...propre } = site as SiteEnregistre & { masquePoints?: unknown }
      return tx.objectStore('sites').put(propre)
    }),
    ...donnees.profils.map((profil) => tx.objectStore('profils').put(profil)),
    ...donnees.plans.map((plan) => tx.objectStore('plans').put(plan)),
    // T-0362 — import suspends writes until reload: without this write, reload rereads pre-import
    // weights.
    ...(donnees.poids === undefined
      ? []
      : [tx.objectStore('reglages').put(donnees.poids, CLE_POIDS)]),
    tx.done,
  ])
  return donnees.poids ?? null
}

/**
 * §8.3 — tuned scoring weights, in `reglages` like chosen targets: user-produced séance
 * setting → IndexedDB + export, not UI local storage. Storing ≠ learning (§2.4): returns what
 * was set, nothing else.
 */
const CLE_POIDS = 'poids-scoring'

/** Reread with import check: non-conforming value → C-15 values. */
export async function litPoidsScoring(): Promise<PoidsScoring | null> {
  const brut = await (await db()).get('reglages', CLE_POIDS)
  return brut !== undefined && poidsScoring(brut) === null ? (brut as PoidsScoring) : null
}

export async function enregistrePoidsScoring(poids: PoidsScoring): Promise<void> {
  await (await db()).put('reglages', { ...poids }, CLE_POIDS)
}

/** §4.1 — single site at MVP: fixed record id. */
export const ID_SITE_ACTIF = 'site-actif'

/** §5.1 — single active équipement profil, like site. */
const ID_PROFIL_ACTIF = 'profil-actif'

export interface SiteAExporter {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  readonly altitudeM: number
  /** §4.1 — declared sky, Bortle or SQM; absent if input lacks it. */
  readonly bortleDeclare?: number
  readonly sqmMesure?: number
  readonly masque: MasqueHorizon
}

/** Séance equipment profil without identity (fixed at write). */
export type ProfilAEnregistrer = Omit<ProfilMateriel, 'id' | 'nom'>

/**
 * Writes séance site on each change: else the hand-surveyed mask lives in memory, vanishes with
 * the tab — exactly what §12.3 must protect (not re-downloadable).
 * Non-finite coords refused: persisted `NaN` returns at every startup; an export that doesn't
 * reimport protects nothing.
 */
export async function enregistreSiteActif(site: SiteAExporter): Promise<void> {
  const coordonnees = [site.latitudeDeg, site.longitudeDeg, site.altitudeM]
  if (!coordonnees.every((n) => Number.isFinite(n))) return
  const enregistrement: SiteEnregistre = {
    id: ID_SITE_ACTIF,
    nom: 'Site de la séance',
    latitudeDeg: site.latitudeDeg,
    longitudeDeg: site.longitudeDeg,
    altitudeM: site.altitudeM,
    fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(site.bortleDeclare === undefined ? {} : { bortleDeclare: site.bortleDeclare }),
    ...(site.sqmMesure === undefined ? {} : { sqmMesure: site.sqmMesure }),
    masqueHorizon: [...site.masque.altitudesDeg],
    masqueEstHypothese: site.masque.estHypothese,
  }
  await (await db()).put('sites', enregistrement)
}

/**
 * Writes séance equipment profil. Same reason as site: hand-entered body quantities aren't
 * re-downloadable; without them a reimported profil describes another device's sensor (§12.3).
 */
export async function enregistreProfilActif(profil: ProfilAEnregistrer): Promise<void> {
  await (await db()).put('profils', {
    id: ID_PROFIL_ACTIF,
    nom: 'Matériel de la séance',
    ...profil,
  })
}

/** Stored active site, or `null` at first startup. */
export async function litSiteActif(): Promise<SiteEnregistre | null> {
  return (await (await db()).get('sites', ID_SITE_ACTIF)) ?? null
}

/**
 * Stored active profil, or `null` at first startup.
 * T-0343 — base is a boundary: a sensor format no table row carries silently became plein format
 * (other field + pitch). Refused with its cause, shown by reread. Rest of profil not re-bounded:
 * a domain tightened since write must not condemn a profil at startup.
 */
export async function litProfilActif(): Promise<ProfilMateriel | null> {
  const profil = (await (await db()).get('profils', ID_PROFIL_ACTIF)) ?? null
  if (profil !== null && !estFormatCapteur(profil.formatCapteur)) {
    throw new Error(
      `Profil enregistré illisible : format de capteur inconnu « ${String(profil.formatCapteur)} ».`,
    )
  }
  return profil
}
