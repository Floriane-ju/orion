/**
 * §12.1, §12.3 — Persistance locale sur IndexedDB.
 *
 * Deux natures de données, à ne pas confondre :
 *   - les paquets de catalogues et les vignettes d'objets sont retéléchargeables ;
 *   - les profils, sites, masques d'horizon édités et plans de session ne le sont pas.
 * C'est cette seconde catégorie que l'export JSON de `persistence.ts` doit protéger.
 */

import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { FormatCapteur } from '../registry/capteur-formats.ts'
import { NB_AZIMUTS } from '../core/site.ts'
import type { ReliefConnu } from './relief.ts'

export const NOM_BASE = 'orion'
/**
 * 2 — ajout du magasin `images` (§6.4). Une montée de version ne détruit rien : les magasins
 * existants traversent la mise à niveau, seul le nouveau est créé.
 */
const VERSION_BASE = 2

/** Nom porté avant que le produit s'appelle Orion. Voir `reprendAncienneBase`. */
const NOM_BASE_ANCIEN = 'astrofort'
/** Drapeau de reprise, rangé dans `reglages` de la base d'arrivée. */
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
  /** 360 valeurs, une par degré d'azimut. Absent tant que le relief n'est pas connu. */
  readonly masqueHorizon?: readonly number[]
  /** Vrai quand le masque est le repli plat à 0°, faute de donnée de relief (§4.1). */
  readonly masqueEstHypothese?: boolean
}

export interface ProfilMateriel {
  readonly id: string
  readonly nom: string
  readonly focaleMm: number
  readonly ouvertureN: number
  readonly typeObjectif: 'RECTILINEAIRE' | 'FISHEYE'
  /**
   * T-0204 — identifiant d'une ligne de la base `boitiers.md`. Absent, ou disparu de la base :
   * le mode personnalisé s'applique, avec les champs ci-dessous. Le boîtier n'est pas recopié
   * dans le profil — seul son identifiant l'est, pour qu'une correction de la base profite
   * aussi aux profils déjà enregistrés (§2.1).
   */
  readonly boitierId?: string
  /**
   * Format de capteur et résolution saisis (§5.1, mode personnalisé) — le pitch s'en déduit,
   * il ne se persiste pas séparément. Ne se retéléchargent pas : sans eux dans l'export, un
   * profil réimporté décrirait le capteur d'un autre appareil (§12.3).
   */
  readonly formatCapteur: FormatCapteur
  readonly resolutionMpx?: number
  readonly readNoiseE?: number
  readonly seuilDoubleGainIso?: number
  readonly zpSys?: number
  readonly tailleRawMo?: number
  /** §7.2 — ISO de capture retenu, quand il n'est pas celui du seuil de double gain. */
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
  /**
   * Version du registre §2.1 ayant produit ce plan. Une mise à jour du registre déclenche
   * un recalcul, jamais une conservation avec les anciennes valeurs (§2.1).
   */
  readonly versionRegistre: string
  readonly contenu: unknown
}

export interface PaquetStocke {
  readonly nom: string
  readonly version: string
  readonly donnees: ArrayBuffer
}

/**
 * §6.4 — l'image d'une cible, rangée par sa désignation.
 *
 * Les octets sont stockés, pas l'adresse : c'est ce qui rend l'image visible après la
 * coupure réseau (§12.5). `origine` et `credit` voyagent avec eux, sans quoi une image
 * relue du cache s'afficherait sans son attribution — donc sans le droit de s'afficher.
 *
 * Le crédit n'est jamais absent : une image encyclopédique dont l'auteur ou la licence n'a
 * pas pu être lu n'est pas rangée, et une découpe de relevé porte le crédit fixe du registre.
 * Une image relue sans crédit serait une image qu'on n'a pas le droit d'afficher.
 */
export interface ImageStockee {
  readonly designation: string
  readonly origine: 'ENCYCLOPEDIE' | 'RELEVE'
  readonly octets: Blob
  readonly credit: CreditImage
  /** Adresse d'où les octets viennent, pour pouvoir remonter à la source affichée. */
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
 * §12.5 — une ouverture qui échoue n'est pas mise en cache : la base bloquée par un autre onglet,
 * ou refusée une fois, doit pouvoir être retentée au geste suivant plutôt que condamner la session.
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
      // Chaque magasin est créé s'il manque : la mise à niveau depuis une base en version 1
      // doit ajouter `images` sans toucher aux profils, sites et plans déjà rangés (§12.3).
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

/** Les magasins à clé en ligne se recopient valeur par valeur : la clé voyage avec elle. */
async function copie<N extends MagasinCle>(
  source: IDBPDatabase<OrionDB>,
  cible: IDBPDatabase<OrionDB>,
  nom: N,
): Promise<void> {
  if (!source.objectStoreNames.contains(nom)) return
  for (const valeur of await source.getAll(nom)) await cible.put(nom, valeur)
}

/**
 * Le produit s'appelait Astrofort, la base portait son nom. IndexedDB n'a pas d'opération de
 * renommage : la seule reprise possible est une copie, puis la suppression de la source. Ce
 * qu'elle sauve — sites, profils, plans, masques d'horizon édités — ne se retélécharge pas
 * (§12.3), donc la perdre au renommage aurait été la perdre tout court.
 *
 * Le drapeau vit dans la base d'arrivée : une fois posé, plus aucun démarrage n'ouvre l'ancienne.
 */
async function reprendAncienneBase(base: IDBPDatabase<OrionDB>): Promise<void> {
  if ((await base.get('reglages', CLE_REPRISE)) === true) return

  // Sans version : on prend la base telle qu'elle est. Absente, elle naît vide — sans magasin,
  // donc sans rien à copier — et la suppression qui suit la fait disparaître aussitôt.
  const ancienne = await openDB<OrionDB>(NOM_BASE_ANCIEN)
  await copie(ancienne, base, 'sites')
  await copie(ancienne, base, 'profils')
  await copie(ancienne, base, 'plans')
  await copie(ancienne, base, 'paquets')
  await copie(ancienne, base, 'images')
  // `reglages` est à clé hors ligne : elle ne se déduit pas de la valeur, il faut la porter.
  if (ancienne.objectStoreNames.contains('reglages')) {
    for (const cle of await ancienne.getAllKeys('reglages')) {
      await base.put('reglages', await ancienne.get('reglages', cle), cle)
    }
  }
  ancienne.close()
  // Non attendue : un autre onglet ouvert sur l'ancienne base la bloquerait, et l'ouverture de
  // la nouvelle avec elle. Tout est déjà copié ; une suppression différée ne perd rien.
  void deleteDB(NOM_BASE_ANCIEN).catch(() => undefined)
  await base.put('reglages', true, CLE_REPRISE)
}

/**
 * §12.5 — les paquets sont retéléchargeables : sans IndexedDB (navigation privée, quota, base
 * refusée), ceux que le réseau vient de servir restent en mémoire pour la session. Le ciel
 * s'affiche ; seul le prochain démarrage hors réseau est perdu, et l'avertissement de stockage
 * le dit.
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

/** Vrai quand la base s'ouvre : sans elle, rien de ce qui est saisi ne survit à la session. */
export async function baseDisponible(): Promise<boolean> {
  try {
    await db()
    return true
  } catch {
    return false
  }
}

/**
 * §12.3 — les cibles que l'utilisateur a choisies pour sa nuit (§8.3), rangées par désignation.
 *
 * Dans `reglages` plutôt que dans un magasin à part : c'est un réglage de séance, pas une
 * entité — une liste de clés du catalogue, qui ne se retélécharge pas mais ne vaut rien sans
 * lui. Aucune montée de `VERSION_BASE` n'est donc nécessaire.
 */
const CLE_CIBLES_CHOISIES = 'cibles-choisies'

/**
 * Ce que la base rend est VALIDÉ, jamais cru sur parole : un export retouché, une version
 * antérieure ou la console du navigateur peuvent y avoir laissé autre chose qu'une liste de
 * chaînes. Une valeur non conforme rend une sélection vide — l'écran redemande le geste, il
 * ne tombe pas.
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
 * §4.1, §12.5 — le relief d'un site, mis en cache sous ses coordonnées au millième de degré
 * (≈ 110 m, la précision que §4.1 juge suffisante) : un site voisin de moins de 55 m relit le
 * profil calculé depuis le premier, écart sous la résolution des tuiles. Dans `reglages` pour la même raison que
 * les cibles choisies : aucune montée de `VERSION_BASE` pour 360 nombres par site.
 *
 * Ce qui revient de la base est validé : une valeur qui n'est pas un profil complet rend null,
 * et le relief se redemande au réseau.
 */
const MILLIEMES = 1000
/**
 * Version du calcul qui a produit le profil. Un profil caché survit aux mises à jour : sans
 * elle, un calcul corrigé ne s'appliquerait jamais aux sites déjà visités. À monter à chaque
 * changement de `profilRelief` ou de ses constantes.
 */
// v4 (T-0365) : le cache garde aussi l'altitude du sol au site, à côté du profil.
const VERSION_PROFIL = 4

export function cleRelief(latDeg: number, lonDeg: number): string {
  return `relief:v${VERSION_PROFIL}:${Math.round(latDeg * MILLIEMES)},${Math.round(lonDeg * MILLIEMES)}`
}

export async function litRelief(cle: string): Promise<ReliefConnu | null> {
  const brut: unknown = await (await db()).get('reglages', cle)
  if (typeof brut !== 'object' || brut === null) return null
  const { profil, solM, courbes, signatureCourbes } = brut as Record<string, unknown>
  if (!estProfil(profil)) return null
  if (typeof solM !== 'number' || !Number.isFinite(solM)) return null
  // T-0395 — des courbes illisibles ne coûtent que les courbes : le masque, lui, est valide.
  const courbesLues =
    courbes instanceof Float32Array &&
    courbes.length % 2 === 0 &&
    typeof signatureCourbes === 'string'
      ? { courbesDeg: courbes, signatureCourbes }
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
        : { courbes: relief.courbesDeg, signatureCourbes: relief.signatureCourbes }),
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
