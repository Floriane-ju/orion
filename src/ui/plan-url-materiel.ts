/**
 * T-0431 — matériel in the plan URL: sets pose, cadrage and what the plan discards. Without it
 * the same link gave another plan on another device.
 * URL carries matériel WHOLE or not at all (`capteur` is the witness): absent field = empty as
 * on screen, not the other device's stored value (else another boîtier's read noise leaks in).
 * Only the mounted objectif travels, not the parc: other device mounts it if present, else
 * adds it.
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

/** Matériel read from URL; mounted objectif has no id, the device assigns one. */
export interface MaterielUrl extends Omit<DepartMateriel, 'objectifs' | 'objectifId'> {
  readonly objectif: Objectif | null
}

export type Parametres = readonly (readonly [string, string])[]

/** Value as normalised text if in its domain, else `undefined`. */
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
// T-0207 — altazimutale left the selector: a URL carrying it falls back to the default.
const MONTURES: readonly TypeMonture[] = ['GEM', 'TRACKER']

/** Custom boîtier quantities + short URL name. */
const CHAMPS_BOITIER = [
  ['mpx', 'resolutionMpx', 'resolution_mpx'],
  ['rn', 'readNoiseE', 'read_noise_e'],
  ['dg', 'seuilDoubleGainIso', 'seuil_double_gain_iso'],
  ['zp', 'zpSys', 'zp_sys'],
] as const satisfies readonly (readonly [string, keyof SaisieBoitier, DomaineId])[]

/** Matériel params, field being typed excluded. */
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

/** "24-70,2.8-4": focale range, then full ouverture at both ends. */
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

/** Starting matériel: URL's, objectif mounted from device parc (same if present, else added). */
export function appliqueMaterielUrl(
  depart: DepartMateriel | null,
  url: { readonly materiel?: MaterielUrl },
  nouvelId: string,
): DepartMateriel | null {
  if (url.materiel === undefined) return depart
  const { objectif, ...reste } = url.materiel
  // Free objectif exists only with empty parc: device rebuilds one from focale + ouverture, as
  // at first start.
  if (objectif === null) return reste
  const parc = depart?.objectifs ?? []
  const present = parc.find((o) => memeOptique(o, objectif))
  return present !== undefined
    ? { ...reste, objectifs: parc, objectifId: present.id }
    : { ...reste, objectifs: [...parc, { ...objectif, id: nouvelId }], objectifId: nouvelId }
}
