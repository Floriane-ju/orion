/**
 * T-0431 — le matériel dans l'URL du plan : il fixe la pose, le cadrage et ce que le plan
 * écarte. Sans lui, le même lien donnait un autre plan sur l'autre appareil.
 *
 * L'URL porte le matériel EN ENTIER ou pas du tout (`capteur` en est le témoin) : un champ
 * absent vaut vide, comme à l'écran, et non la valeur que l'autre appareil avait en base —
 * un bruit de lecture d'un autre boîtier se serait glissé dans le calcul.
 *
 * Seul l'objectif monté voyage, pas le parc : l'autre appareil le monte s'il l'a déjà, sinon
 * l'ajoute au sien.
 */

import { MATERIEL_PAR_DEFAUT, type DepartMateriel, type SaisieMateriel } from './app-saisie.ts'
import { ligneBoitier } from '../data/boitiers.ts'
import type { CapteurMode, SaisieBoitier } from '../data/equipment.ts'
import { estFormatCapteur } from '../registry/capteur-formats.ts'
import { type DomaineId, nombreDeTexte, valide } from '../registry/domains.ts'
import type { Objectif } from '../core/objectif.ts'
import type { QualiteMiseEnStation, TypeMonture } from '../core/suivi.ts'
import type { TypeObjectif } from '../core/optics.ts'
import { objectifActif } from './objectif-saisie.ts'
import { objectifDeSaisie } from './parc-saisie.ts'

export type MaterielAEcrire = Pick<
  SaisieMateriel,
  | 'boitierId'
  | 'boitier'
  | 'iso'
  | 'objectifs'
  | 'objectifId'
  | 'focale'
  | 'ouverture'
  | 'capteurMode'
  | 'typeObjectif'
  | 'suiviActif'
  | 'qualiteMes'
  | 'typeMonture'
>

/** Le matériel lu dans l'URL ; l'objectif monté sans identifiant, que l'appareil lui donne. */
export interface MaterielUrl extends Omit<DepartMateriel, 'objectifs' | 'objectifId'> {
  readonly objectif: Objectif | null
}

export type Parametres = readonly (readonly [string, string])[]

/** La valeur en texte normalisé si elle est dans son domaine, `undefined` sinon. */
export function dansDomaine(domaine: DomaineId, texte: string | null): string | undefined {
  if (texte === null) return undefined
  try {
    return String(valide(domaine, nombreDeTexte(texte)))
  } catch {
    return undefined
  }
}

function parmi<T extends string>(valeurs: readonly T[], texte: string | null): T | undefined {
  return valeurs.find((v) => v === texte)
}

const CAPTEURS: readonly CapteurMode[] = ['FULL_FRAME', 'APSC_CROP']
const PROJECTIONS: readonly TypeObjectif[] = ['RECTILINEAIRE', 'FISHEYE']
const QUALITES: readonly QualiteMiseEnStation[] = ['SOIGNEE', 'APPROX', 'INCONNUE']
// T-0207 — l'altazimutale a quitté le sélecteur : une URL qui la porte retombe sur le départ.
const MONTURES: readonly TypeMonture[] = ['GEM', 'TRACKER']

/** Les grandeurs d'un boîtier personnalisé, et leur nom court dans l'URL. */
const CHAMPS_BOITIER = [
  ['mpx', 'resolutionMpx', 'resolution_mpx'],
  ['rn', 'readNoiseE', 'read_noise_e'],
  ['dg', 'seuilDoubleGainIso', 'seuil_double_gain_iso'],
  ['zp', 'zpSys', 'zp_sys'],
] as const satisfies readonly (readonly [string, keyof SaisieBoitier, DomaineId])[]

/** Les paramètres du matériel, champ en cours de frappe exclu. */
export function parametresMateriel(m: MaterielAEcrire): Parametres {
  const sortie: [string, string][] = []
  const ajoute = (cle: string, valeur: string | undefined) => {
    if (valeur !== undefined && valeur !== '') sortie.push([cle, valeur])
  }
  if (ligneBoitier(m.boitierId) !== null) {
    ajoute('boitier', m.boitierId)
  } else {
    ajoute('capt', m.boitier.formatCapteur)
    for (const [cle, champ, domaine] of CHAMPS_BOITIER) ajoute(cle, dansDomaine(domaine, m.boitier[champ]))
  }
  ajoute('raw', dansDomaine('taille_raw_mo', m.boitier.tailleRawMo))
  ajoute('iso', dansDomaine('iso_capture', m.iso))
  const monte = objectifActif(m.objectifs, m.objectifId)
  if (monte !== null) {
    ajoute('obj', `${monte.focaleMinMm}-${monte.focaleMaxMm},${monte.ouvertureGrandAngleN}-${monte.ouvertureTeleN}`)
  }
  ajoute('f', dansDomaine('focale_mm', m.focale))
  ajoute('N', dansDomaine('ouverture_N', m.ouverture))
  if (m.typeObjectif === 'FISHEYE') ajoute('proj', m.typeObjectif)
  ajoute('capteur', m.capteurMode)
  ajoute('suivi', m.suiviActif ? '1' : '0')
  ajoute('monture', m.typeMonture)
  ajoute('mes', m.qualiteMes)
  return sortie
}

/** « 24-70,2.8-4 » : la plage de focale, puis la pleine ouverture aux deux bouts. */
function objectifDe(texte: string | null, typeObjectif: TypeObjectif): Objectif | null {
  const [focales = '', ouvertures = ''] = (texte ?? '').split(',')
  const [focaleMin = '', focaleMax = ''] = focales.split('-')
  const [ouvertureGrandAngle = '', ouvertureTele = ''] = ouvertures.split('-')
  try {
    return objectifDeSaisie({ focaleMin, focaleMax, ouvertureGrandAngle, ouvertureTele }, '', typeObjectif)
  } catch {
    return null
  }
}

function boitierDe(params: URLSearchParams): Pick<DepartMateriel, 'boitierId' | 'boitier'> {
  const raw = dansDomaine('taille_raw_mo', params.get('raw'))
  const boitierId = params.get('boitier') ?? ''
  const ligne = ligneBoitier(boitierId)
  if (ligne !== null) {
    return { boitierId, boitier: { ...ligne.saisie, tailleRawMo: raw ?? ligne.saisie.tailleRawMo } }
  }
  const format = params.get('capt') ?? ''
  const champs = Object.fromEntries(
    CHAMPS_BOITIER.map(([cle, champ, domaine]) => [champ, dansDomaine(domaine, params.get(cle)) ?? '']),
  ) as Pick<SaisieBoitier, (typeof CHAMPS_BOITIER)[number][1]>
  return {
    boitier: {
      formatCapteur: estFormatCapteur(format) ? format : MATERIEL_PAR_DEFAUT.boitier.formatCapteur,
      ...champs,
      tailleRawMo: raw ?? '',
    },
  }
}

export function litMateriel(params: URLSearchParams): MaterielUrl | undefined {
  const capteurMode = parmi(CAPTEURS, params.get('capteur'))
  if (capteurMode === undefined) return undefined
  const d = MATERIEL_PAR_DEFAUT
  const typeObjectif = parmi(PROJECTIONS, params.get('proj')) ?? d.typeObjectif
  return {
    ...boitierDe(params),
    iso: dansDomaine('iso_capture', params.get('iso')) ?? d.iso,
    objectif: objectifDe(params.get('obj'), typeObjectif),
    focale: dansDomaine('focale_mm', params.get('f')) ?? d.focale,
    ouverture: dansDomaine('ouverture_N', params.get('N')) ?? d.ouverture,
    capteurMode,
    typeObjectif,
    suiviActif: params.get('suivi') === '1',
    qualiteMes: parmi(QUALITES, params.get('mes')) ?? 'INCONNUE',
    typeMonture: parmi(MONTURES, params.get('monture')) ?? 'TRACKER',
  }
}

const memeOptique = (a: Objectif, b: Objectif): boolean =>
  a.focaleMinMm === b.focaleMinMm &&
  a.focaleMaxMm === b.focaleMaxMm &&
  a.ouvertureGrandAngleN === b.ouvertureGrandAngleN &&
  a.ouvertureTeleN === b.ouvertureTeleN &&
  a.typeObjectif === b.typeObjectif

/**
 * Le matériel de départ : celui de l'URL, avec son objectif monté depuis le parc de l'appareil
 * — le même s'il y est déjà, ajouté sous `nouvelId` sinon.
 */
export function appliqueMaterielUrl(
  depart: DepartMateriel | null,
  url: { readonly materiel?: MaterielUrl },
  nouvelId: string,
): DepartMateriel | null {
  if (url.materiel === undefined) return depart
  const { objectif, ...reste } = url.materiel
  // L'objectif libre n'existe que parc vide : l'appareil en refait un de la focale et de
  // l'ouverture, comme au premier démarrage.
  if (objectif === null) return reste
  const parc = depart?.objectifs ?? []
  const present = parc.find((o) => memeOptique(o, objectif))
  return present !== undefined
    ? { ...reste, objectifs: parc, objectifId: present.id }
    : { ...reste, objectifs: [...parc, { ...objectif, id: nouvelId }], objectifId: nouvelId }
}
