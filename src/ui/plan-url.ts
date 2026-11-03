/**
 * T-0431 — the night plan travels by link.
 * IndexedDB stays on-device: a plan prepared at the office did not exist on the phone taken to
 * the field. Share button copies a link carrying what makes the plan (nuit, lieu, matériel,
 * scoring weights, chosen cibles), overriding the DB on open. Horizon mask (360 heights) does
 * not fit: stays on-device.
 * Outside sharing the URL stays bare (plan lives in local storage; an address changing per
 * tick adds nothing a button does not).
 * URL = foreign input like an import file: each field goes through `DOMAINES`, a refused field
 * is dropped alone, rest of the plan kept.
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

/** What the screen holds of the plan, as written in the URL. */
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

/** Lieu read from URL. Sky (bortle/sqm) present only if declared. */
export interface LieuUrl {
  readonly latitude: string
  readonly longitude: string
  readonly altitude: string
  readonly bortle?: string
  readonly sqm?: string
}

/** What the URL brings, per field: absent field → DB decides. */
export interface PlanUrl {
  readonly nuitIso?: string
  readonly lieu?: LieuUrl
  readonly materiel?: MaterielUrl
  readonly poids?: PoidsScoring
  readonly cibles?: readonly string[]
}

/** A calendar day, within years the scène can display. */
function nuitValide(texte: string | null): string | undefined {
  if (texte === null || !/^\d{4}-\d{2}-\d{2}$/.test(texte)) return undefined
  // `new Date` overflows silently: 31 Feb → 3 Mar.
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

/** The five C-15 weights in `CRITERES_SCORING` order; one refused drops all. */
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
  // URL written by the app always carries its nuit: without `cible`, selection is empty. Bare
  // URL says nothing of selection → DB answers.
  // ponytail: comma separates since no catalogue designation has one (`M31`, `NGC7000`,
  // `Sh2-155`); the day one does, go back to repeated `cible`.
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

/** Comma stays clear: encoded `%2C` would make lists unreadable in the address bar. */
function enClair(parametres: Parametres): string {
  return parametres
    .map(([cle, valeur]) => `${cle}=${encodeURIComponent(valeur).replaceAll('%2C', ',')}`)
    .join('&')
}

/** Plan query string, `?` included. Field being typed stays out: URL keeps last complete lieu. */
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

/** Starting lieu input: URL's if any, completed by the DB. */
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

/** Full plan link as the share button copies it. */
export function lienDuPlan(plan: PlanAEcrire): string {
  return `${location.origin}${location.pathname}${ecritPlanUrl(plan)}`
}
