/**
 * T-0431 — le plan de la nuit voyage par un lien.
 *
 * IndexedDB ne quitte pas l'appareil : un plan préparé au bureau n'existait pas sur le
 * téléphone emporté au champ. Le bouton de partage copie donc un lien qui porte ce qui fait
 * le plan — la nuit, le lieu, le matériel, les poids de scoring et les cibles choisies — et
 * qui l'emporte sur la base à l'ouverture. Le masque d'horizon (360 hauteurs) n'y tiendrait
 * pas : il reste à l'appareil.
 *
 * Hors partage, l'URL reste nue : le plan vit dans le stockage local, et une adresse qui
 * changeait à chaque coche n'apportait rien qu'un bouton ne donne mieux.
 *
 * L'URL est une saisie étrangère au même titre qu'un fichier d'import : chaque champ passe
 * par `DOMAINES`, et un champ refusé est ignoré seul, sans emporter le reste du plan.
 */

import { CRITERES_SCORING, DEFAUT, type DepartLieu } from './app-saisie.ts'
import { jourLocalIso } from '../core/nuit-datee.ts'
import type { PoidsScoring } from '../core/session.ts'
import { nombreDeTexte } from '../registry/domains.ts'
import {
  dansDomaine,
  litMateriel,
  parametresMateriel,
  type MaterielAEcrire,
  type MaterielUrl,
  type Parametres,
} from './plan-url-materiel.ts'

/** Ce que l'écran tient du plan, tel qu'il s'écrit dans l'URL. */
export interface PlanAEcrire {
  readonly nuitIso: string
  readonly latitude: string
  readonly longitude: string
  readonly altitude: string
  readonly bortle: string
  readonly sqm: string
  readonly cibles: readonly string[]
  readonly materiel?: MaterielAEcrire
  readonly poids?: PoidsScoring
}

/** Le lieu lu dans l'URL. Le ciel n'y est que s'il a été déclaré. */
export interface LieuUrl {
  readonly latitude: string
  readonly longitude: string
  readonly altitude: string
  readonly bortle?: string
  readonly sqm?: string
}

/** Ce que l'URL apporte, champ par champ : un champ absent laisse la base décider. */
export interface PlanUrl {
  readonly nuitIso?: string
  readonly lieu?: LieuUrl
  readonly materiel?: MaterielUrl
  readonly poids?: PoidsScoring
  readonly cibles?: readonly string[]
}

/** Un jour du calendrier, dans les années que la scène sait afficher. */
function nuitValide(texte: string | null): string | undefined {
  if (texte === null || !/^\d{4}-\d{2}-\d{2}$/.test(texte)) return undefined
  // `new Date` déborde en silence : le 31 février devient le 3 mars.
  if (jourLocalIso(new Date(`${texte}T00:00:00`)) !== texte) return undefined
  return dansDomaine('annee_affichee', texte.slice(0, 4)) === undefined ? undefined : texte
}

function lieuDe(params: URLSearchParams): LieuUrl | undefined {
  const latitude = dansDomaine('latitude_deg', params.get('lat'))
  const longitude = dansDomaine('longitude_deg', params.get('lon'))
  const altitude = dansDomaine('altitude_m', params.get('alt'))
  if (latitude === undefined || longitude === undefined || altitude === undefined) return undefined
  const bortle = dansDomaine('bortle_declare', params.get('bortle'))
  const sqm = dansDomaine('sqm_mesure', params.get('sqm'))
  const ciel = bortle !== undefined ? { bortle, sqm: '' } : sqm !== undefined ? { bortle: '', sqm } : {}
  return { latitude, longitude, altitude, ...ciel }
}

/** Les cinq poids C-15 dans l'ordre de `CRITERES_SCORING` ; un seul refusé les écarte tous. */
function poidsDe(texte: string | null): PoidsScoring | undefined {
  const valeurs = (texte ?? '').split(',').map((v) => dansDomaine('poids_scoring', v))
  if (valeurs.length !== CRITERES_SCORING.length || valeurs.includes(undefined)) return undefined
  return Object.fromEntries(
    CRITERES_SCORING.map((critere, i) => [critere, nombreDeTexte(valeurs[i] ?? '')]),
  ) as unknown as PoidsScoring
}

export function litPlanUrl(search: string): PlanUrl {
  const params = new URLSearchParams(search)
  const nuitIso = nuitValide(params.get('nuit'))
  const lieu = lieuDe(params)
  const materiel = litMateriel(params)
  const poids = poidsDe(params.get('poids'))
  // Une URL écrite par l'application porte toujours sa nuit : sans `cible`, sa sélection est
  // vide. Une URL nue, elle, ne dit rien de la sélection et laisse la base répondre.
  // ponytail: la virgule sépare parce qu'aucune désignation du catalogue n'en porte
  // (`M31`, `NGC7000`, `Sh2-155`) ; le jour où une en porte, revenir à `cible` répété.
  const cibles = (params.get('cible') ?? '').split(',').filter((c) => c !== '')
  const porteSelection = params.has('nuit') || cibles.length > 0
  return {
    ...(nuitIso === undefined ? {} : { nuitIso }),
    ...(lieu === undefined ? {} : { lieu }),
    ...(materiel === undefined ? {} : { materiel }),
    ...(poids === undefined ? {} : { poids }),
    ...(porteSelection ? { cibles } : {}),
  }
}

/** La virgule reste en clair : encodée `%2C`, les listes deviendraient illisibles dans la barre. */
function enClair(parametres: Parametres): string {
  return parametres
    .map(([cle, valeur]) => `${cle}=${encodeURIComponent(valeur).replaceAll('%2C', ',')}`)
    .join('&')
}

/**
 * La query string du plan, `?` compris. Un champ en cours de frappe n'y entre pas : l'URL
 * garde alors le dernier lieu complet plutôt qu'une latitude à moitié tapée.
 */
export function ecritPlanUrl(plan: PlanAEcrire): string {
  const parametres: (readonly [string, string])[] = [['nuit', plan.nuitIso]]
  const lieu = lieuDe(
    new URLSearchParams({
      lat: plan.latitude,
      lon: plan.longitude,
      alt: plan.altitude,
      bortle: plan.bortle,
      sqm: plan.sqm,
    }),
  )
  if (lieu !== undefined) {
    parametres.push(['lat', lieu.latitude], ['lon', lieu.longitude], ['alt', lieu.altitude])
    if (lieu.bortle !== undefined && lieu.bortle !== '') parametres.push(['bortle', lieu.bortle])
    if (lieu.sqm !== undefined && lieu.sqm !== '') parametres.push(['sqm', lieu.sqm])
  }
  if (plan.materiel !== undefined) parametres.push(...parametresMateriel(plan.materiel))
  if (plan.poids !== undefined) {
    const { poids } = plan
    parametres.push(['poids', CRITERES_SCORING.map((c) => String(poids[c])).join(',')])
  }
  if (plan.cibles.length > 0) parametres.push(['cible', plan.cibles.join(',')])
  return `?${enClair(parametres)}`
}

/** Le lieu de départ de la saisie : celui de l'URL s'il y en a un, complété par la base. */
export function appliqueLieuUrl(depart: DepartLieu | null, url: PlanUrl): DepartLieu | null {
  if (url.lieu === undefined) return depart
  const base = depart ?? { bortle: DEFAUT.bortle, sqm: '' }
  const { latitude, longitude, altitude, bortle, sqm } = url.lieu
  return {
    latitude,
    longitude,
    altitude,
    bortle: bortle ?? base.bortle,
    sqm: sqm ?? base.sqm,
  }
}

/** Le lien complet du plan, tel que le bouton de partage le copie. */
export function lienDuPlan(plan: PlanAEcrire): string {
  return `${location.origin}${location.pathname}${ecritPlanUrl(plan)}`
}
