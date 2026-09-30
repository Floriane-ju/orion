/**
 * §12.3 — Persistance du stockage et résistance à l'éviction.
 *
 * LE VOLUME N'EST PAS LE RISQUE. L'ÉVICTION EST LE RISQUE. Par défaut le stockage
 * navigateur est en « meilleur effort » : il peut être effacé sans avertissement sous
 * pression disque. Neuf mégaoctets de catalogues effacés en silence, c'est une application
 * vide au prochain démarrage hors réseau, sur le terrain, sans moyen de la recharger.
 *
 * Stratégie à trois étages :
 *   1. demander persist() dès la première visite, APRÈS la première action utile ;
 *   2. vérifier persisted() à chaque démarrage et avertir si le mode n'est pas accordé ;
 *   3. vérifier l'intégrité des catalogues au démarrage.
 */

import { db } from './db.ts'
import type { PlanEnregistre, ProfilMateriel, SiteEnregistre } from './db.ts'
import type { MasqueHorizon, PointMasque } from '../core/site.ts'
import { normalisePoids, type PoidsScoring } from '../core/session.ts'
import { type DomaineId, valide as valideDomaine } from '../registry/domains.ts'
import { TABLE_FORMATS_CAPTEUR, estFormatCapteur } from '../registry/capteur-formats.ts'

export interface EtatStockage {
  readonly persistant: boolean
  readonly supporte: boolean
  readonly quotaMo: number | null
  readonly usageMo: number | null
  /** Renseigné quand le mode persistant n'est pas accordé. */
  readonly avertissement?: string
}

const OCTETS_PAR_MO = 1024 * 1024

export const AVERTISSEMENT_SANS_BASE =
  'Stockage local indisponible : le ciel est chargé pour cette session, mais rien de ce que ' +
  'vous saisissez ne sera mémorisé.'

const AVERTISSEMENT_NON_PERSISTANT =
  'Le navigateur peut effacer vos données : installez l’application ou exportez-les.'

export async function etatStockage(): Promise<EtatStockage> {
  if (typeof navigator === 'undefined' || navigator.storage === undefined) {
    return {
      persistant: false,
      supporte: false,
      quotaMo: null,
      usageMo: null,
      avertissement:
        'Ce navigateur peut effacer vos données : exportez-les régulièrement.',
    }
  }
  const persistant = (await navigator.storage.persisted?.()) ?? false
  const estimation = (await navigator.storage.estimate?.()) ?? {}
  return {
    persistant,
    supporte: true,
    quotaMo: estimation.quota === undefined ? null : estimation.quota / OCTETS_PAR_MO,
    usageMo: estimation.usage === undefined ? null : estimation.usage / OCTETS_PAR_MO,
    ...(persistant ? {} : { avertissement: AVERTISSEMENT_NON_PERSISTANT }),
  }
}

/**
 * À n'appeler qu'après une première action utile de l'utilisateur : une demande non
 * motivée au chargement est refusée par réflexe (§12.3).
 */
export async function demandePersistance(): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.storage?.persist === undefined) {
    return false
  }
  return navigator.storage.persist()
}

const FORMAT_EXPORT = 'orion-export'
/** Format écrit quand le produit s'appelait Astrofort : relu, jamais réécrit. */
const FORMAT_EXPORT_ANCIEN = 'astrofort-export'

export interface ExportUtilisateur {
  readonly format: typeof FORMAT_EXPORT | typeof FORMAT_EXPORT_ANCIEN
  readonly version: number
  readonly exporteLe: string
  readonly sites: readonly SiteEnregistre[]
  readonly profils: readonly ProfilMateriel[]
  readonly plans: readonly PlanEnregistre[]
  /**
   * §8.3 — les poids de scoring réglés pour la séance, normalisés comme le plan les a
   * utilisés. Absents des exports antérieurs à leur réglage : un fichier sans eux reste
   * valide et repart des valeurs C-15.
   */
  readonly poids?: PoidsScoring
}

export const VERSION_EXPORT = 1

/**
 * Export JSON manuel — obligatoire au MVP. Une éviction ne doit jamais détruire une donnée
 * que l'utilisateur a produite. Les paquets de catalogues en sont exclus : ils se
 * retéléchargent.
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
    // Normalisés à l'écriture : c'est la forme que §8.3 déclare, et celle qui se relit sans
    // dépendre de l'échelle brute des curseurs.
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
 * Un fichier d'export est une donnée étrangère, au même titre qu'une saisie : il a pu être
 * retouché à la main entre deux machines. Sans contrôle champ par champ, un
 * `latitudeDeg: "abc"` entre en base et ressort en `NaN` à chaque démarrage — persisté,
 * donc rejoué. Les plages sont celles du registre §2.1, jamais réécrites ici.
 *
 * Un vérificateur rend `null` quand le champ passe, sinon la raison du refus.
 */
type Verificateur = (valeur: unknown) => string | null

const texte: Verificateur = (v) =>
  typeof v === 'string' && v !== '' ? null : 'doit être une chaîne non vide'

const booleen: Verificateur = (v) => (typeof v === 'boolean' ? null : 'doit être un booléen')

/** `contenu` d'un plan : structure libre, produite et relue par l'application elle-même. */
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

/** Le masque d'horizon est un tableau de 360 hauteurs, une par degré d'azimut (§4.1). */
const masqueHorizon: Verificateur = (v) => {
  if (!Array.isArray(v) || v.length !== 360) return 'doit être un tableau de 360 hauteurs'
  const hauteur = nombre('masque_horizon_deg')
  for (const [azimut, valeur] of v.entries()) {
    const raison = hauteur(valeur)
    if (raison !== null) return `à l’azimut ${azimut} : ${raison}`
  }
  return null
}

/** Les relevés saisis : un couple azimut → hauteur d'obstruction chacun (§4.1). */
const masquePoints: Verificateur = (v) => {
  if (!Array.isArray(v)) return 'doit être un tableau de relevés'
  const azimut = nombre('azimut_masque_deg')
  const hauteur = nombre('masque_horizon_deg')
  for (const [rang, releve] of v.entries()) {
    if (typeof releve !== 'object' || releve === null) return `relevé n°${rang + 1} : n’est pas un couple`
    const couple = releve as Record<string, unknown>
    const raison = azimut(couple.azimutDeg) ?? hauteur(couple.altitudeDeg)
    if (raison !== null) return `relevé n°${rang + 1} : ${raison}`
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
  masquePoints: optionnel(masquePoints),
}

const FORME_PROFIL: Forme = {
  id: texte,
  nom: texte,
  focaleMm: nombre('focale_mm'),
  ouvertureN: nombre('ouverture_N'),
  typeObjectif: parmi('RECTILINEAIRE', 'FISHEYE'),
  // T-0204 — `texte` et non `parmi(...)` : un identifiant absent de la base n'est pas un
  // fichier corrompu. La saisie retombe sur le mode personnalisé, et les champs ci-dessous,
  // eux, ont bien été exportés. Refuser l'import ferait perdre tout le profil pour une ligne.
  boitierId: optionnel(texte),
  formatCapteur: parmi(...TABLE_FORMATS_CAPTEUR.map((f) => f.format)),
  resolutionMpx: optionnel(nombre('resolution_mpx')),
  readNoiseE: optionnel(nombre('read_noise_e')),
  seuilDoubleGainIso: optionnel(nombre('seuil_double_gain_iso')),
  fullWellE: optionnel(nombre('full_well_e')),
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

/** Le refus nomme l'enregistrement fautif — par identifiant s'il en a un — et le champ. */
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
 * Les cinq poids C-15, quand le fichier les porte. Un poids hors domaine ferait un score
 * négatif ou NaN, donc un plan silencieusement arbitraire : il est refusé comme une saisie.
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
  // Tout est vérifié AVANT la transaction : un fichier abîmé n'écrit rien, pas même à moitié.
  valideEnregistrements('le site', FORME_SITE, candidat.sites as readonly unknown[])
  valideEnregistrements('le profil', FORME_PROFIL, candidat.profils as readonly unknown[])
  valideEnregistrements('le plan', FORME_PLAN, candidat.plans as readonly unknown[])
}

/**
 * Point d'entrée du réimport depuis un fichier. Tout échec — JSON illisible compris — sort
 * en `ExportInvalideError`, dont le texte est rédigé pour être affiché tel quel.
 */
export async function importeFichierUtilisateur(
  texte: string,
): Promise<PoidsScoring | null> {
  let donnees: unknown
  try {
    donnees = JSON.parse(texte)
  } catch {
    // Le détail de `JSON.parse` est la phrase anglaise du navigateur : le texte de
    // `ExportInvalideError` s'affiche tel quel, il ne la porte donc pas.
    throw new ExportInvalideError('le fichier n’est pas du JSON lisible.')
  }
  return importeDonneesUtilisateur(donnees)
}

/**
 * Réimport sans perte. Les entrées de même identifiant sont remplacées.
 *
 * Les poids de scoring ne vont pas en base : ils appartiennent à la saisie de la séance, pas
 * aux enregistrements. Ils sont rendus à l'appelant, qui les remet à l'écran (§8.3).
 */
export async function importeDonneesUtilisateur(donnees: unknown): Promise<PoidsScoring | null> {
  valide(donnees)
  const base = await db()
  const tx = base.transaction(['sites', 'profils', 'plans'], 'readwrite')
  await Promise.all([
    ...donnees.sites.map((site) => tx.objectStore('sites').put(site)),
    ...donnees.profils.map((profil) => tx.objectStore('profils').put(profil)),
    ...donnees.plans.map((plan) => tx.objectStore('plans').put(plan)),
    tx.done,
  ])
  return donnees.poids ?? null
}

/**
 * §4.1 — un seul site au MVP : son enregistrement porte toujours le même identifiant.
 */
export const ID_SITE_ACTIF = 'site-actif'

/** §5.1 — un seul profil matériel actif, pour la même raison qu'un seul site. */
const ID_PROFIL_ACTIF = 'profil-actif'

export interface SiteAExporter {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  readonly altitudeM: number
  /** §4.1 — le ciel déclaré, Bortle ou SQM. Absent quand la saisie ne le donne pas. */
  readonly bortleDeclare?: number
  readonly sqmMesure?: number
  readonly masque: MasqueHorizon
  readonly pointsMasque: readonly PointMasque[]
}

/** Le profil matériel de la séance sans son identité : elle est fixée à l'écriture. */
export type ProfilAEnregistrer = Omit<ProfilMateriel, 'id' | 'nom'>

/**
 * Écrit le site de la séance dès qu'il change : sans cela, le masque relevé à la main vivrait
 * en mémoire et disparaîtrait avec l'onglet, alors que c'est exactement le genre de donnée
 * que §12.3 doit protéger — elle ne se retélécharge pas.
 *
 * Les coordonnées non chiffrables sont refusées : un `NaN` persisté ressort à chaque
 * démarrage, et un export qui ne se réimporte pas ne protège rien.
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
    masquePoints: [...site.pointsMasque],
  }
  await (await db()).put('sites', enregistrement)
}

/**
 * Écrit le profil matériel de la séance. Même motif que le site : les grandeurs d'un boîtier
 * saisi à la main ne se retéléchargent pas, et sans elles un profil réimporté décrirait le
 * capteur d'un autre appareil (§12.3).
 */
export async function enregistreProfilActif(profil: ProfilAEnregistrer): Promise<void> {
  await (await db()).put('profils', {
    id: ID_PROFIL_ACTIF,
    nom: 'Matériel de la séance',
    ...profil,
  })
}

/** Le site actif tel qu'il a été enregistré, ou `null` au premier démarrage. */
export async function litSiteActif(): Promise<SiteEnregistre | null> {
  return (await (await db()).get('sites', ID_SITE_ACTIF)) ?? null
}

/** Le profil actif tel qu'il a été enregistré, ou `null` au premier démarrage. */
/**
 * T-0343 — la base est une frontière : un format de capteur qu'aucune ligne de la table ne
 * porte devenait en silence un plein format, donc un autre champ et un autre pitch. Il est
 * refusé avec sa cause, que la relecture affiche. Le reste du profil n'est pas re-borné ici :
 * un domaine resserré depuis l'écriture ne doit pas condamner un profil au démarrage.
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

/** Les relevés du site actif, tels qu'un import vient de les restaurer. */
export async function litPointsMasqueActif(): Promise<readonly PointMasque[]> {
  return (await litSiteActif())?.masquePoints ?? []
}
