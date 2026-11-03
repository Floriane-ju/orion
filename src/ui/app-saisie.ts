/**
 * §4 and §5 — app input state: where we are, what we shoot with.
 * Each hook returns values AND commands under the names panels expect: a region fills with one
 * spread, not sixteen hand-copied props.
 */

import { useState } from 'react'
import { poidsParDefaut, type PoidsScoring } from '../core/session.ts'
import type { CapteurMode, SaisieBoitier } from '../data/equipment.ts'
import { ligneBoitier } from '../data/boitiers.ts'
import type { QualiteMiseEnStation, TypeMonture } from '../core/suivi.ts'
import { nuitDeLInstant } from '../core/nuit-datee.ts'
import { borneInstant, etatScene, instant, majVue } from './scene-etat.ts'
import { modeObjectif, type TypeObjectif } from '../core/optics.ts'
import type { Objectif } from '../core/objectif.ts'
import { nombreDeTexte } from '../registry/domains.ts'
import { objectifActif, plancherA, reglageOptique } from './objectif-saisie.ts'
import { parcDeDepart } from './parc-saisie.ts'

/**
 * Site + deep-sky config of Annexe A. `resolutionMpx` takes reference boîtier resolution (33 Mpx):
 * else start screen has nothing to calcul before first input.
 */
export const DEFAUT = {
  latitude: '46.391',
  longitude: '6.697',
  altitude: '500',
  bortle: '4.5',
  focale: '120',
  ouverture: '2.8',
  resolutionMpx: '33',
}

export interface SaisieLieu {
  readonly latitude: string
  readonly surLatitude: (v: string) => void
  readonly longitude: string
  readonly surLongitude: (v: string) => void
  readonly altitude: string
  readonly surAltitude: (v: string) => void
  readonly nuitIso: string
  readonly surNuitIso: (v: string) => void
  readonly bortle: string
  readonly surBortle: (v: string) => void
  readonly sqm: string
  readonly surSqm: (v: string) => void
}

/**
 * §12.3 — lieu as saved, reread at startup. `null` on first start: Annexe A values seed. Date
 * excluded: a séance is prepared for the coming night, not the last reload's.
 */
export interface DepartLieu {
  readonly latitude: string
  readonly longitude: string
  readonly altitude: string
  readonly bortle: string
  readonly sqm: string
}

/**
 * T-0267 — current night, not civil day: starting at 2 am in the field opens the plan being run,
 * not next evening's. T-0355 — night of the instant scène reread: an instant frozen at reload
 * keeps its night. In `MAINTENANT`, clock rules, with the offset scène kept.
 */
export function nuitDeLaScene(): string {
  const { modeTemps, decalageMs } = etatScene().temps
  const ms = modeTemps === 'MAINTENANT' ? Date.now() + decalageMs : instant.ms
  return nuitDeLInstant(new Date(borneInstant(ms)))
}

export function useSaisieLieu(depart: DepartLieu | null): SaisieLieu {
  const [latitude, surLatitude] = useState(depart?.latitude ?? DEFAUT.latitude)
  const [longitude, surLongitude] = useState(depart?.longitude ?? DEFAUT.longitude)
  const [altitude, surAltitude] = useState(depart?.altitude ?? DEFAUT.altitude)
  const [bortle, surBortle] = useState(depart?.bortle ?? DEFAUT.bortle)
  const [sqm, surSqm] = useState(depart?.sqm ?? '')
  const [nuitIso, surNuitIso] = useState(nuitDeLaScene)

  return {
    latitude,
    surLatitude,
    longitude,
    surLongitude,
    altitude,
    surAltitude,
    nuitIso,
    surNuitIso,
    bortle,
    surBortle,
    sqm,
    surSqm,
  }
}

/**
 * §5.1 — advanced-mode quantities: empty, none presumed (§2.3). Sensor format + resolution start
 * from Annexe A (`DEFAUT`): a start screen with nothing to calcul proves nothing.
 */
const BOITIER_VIDE = {
  readNoiseE: '',
  seuilDoubleGainIso: '',
  zpSys: '',
  tailleRawMo: '',
} as const

export interface SaisieMateriel {
  /** T-0204 — id of a `boitiers.md` row, or `''` for custom mode. */
  readonly boitierId: string
  readonly surBoitierId: (v: string) => void
  /** §5.1 — sensor type and resolution, when no boîtier is chosen. */
  readonly boitier: SaisieBoitier
  readonly surBoitier: (v: SaisieBoitier) => void
  /** §7.2 — capture ISO, empty while the dual-gain one fits. */
  readonly iso: string
  readonly surIso: (v: string) => void
  /** T-0404 — lens park, and id of the mounted one (`''`: free lens). */
  readonly objectifs: readonly Objectif[]
  readonly surObjectifs: (v: readonly Objectif[]) => void
  readonly objectifId: string
  readonly surObjectifId: (v: string) => void
  readonly focale: string
  readonly surFocale: (v: string) => void
  readonly ouverture: string
  readonly surOuverture: (v: string) => void
  readonly capteurMode: CapteurMode
  readonly surCapteurMode: (v: CapteurMode) => void
  readonly typeObjectif: TypeObjectif
  readonly surTypeObjectif: (v: TypeObjectif) => void
  readonly suiviActif: boolean
  readonly surSuiviActif: (v: boolean) => void
  readonly qualiteMes: QualiteMiseEnStation
  readonly surQualiteMes: (v: QualiteMiseEnStation) => void
  readonly typeMonture: TypeMonture
  readonly surTypeMonture: (v: TypeMonture) => void
}

/** §12.3 — matériel as saved, reread at startup. */
export interface DepartMateriel {
  /** Absent from a pre-T-0204 record: custom mode applies. */
  readonly boitierId?: string
  readonly boitier: SaisieBoitier
  readonly iso: string
  /** Absent from a pre-T-0404 record: empty park, free lens. */
  readonly objectifs?: readonly Objectif[]
  readonly objectifId?: string
  readonly focale: string
  readonly ouverture: string
  readonly capteurMode: CapteurMode
  readonly typeObjectif: TypeObjectif
  readonly suiviActif: boolean
  /** Absent from a foreign record: input start applies. */
  readonly qualiteMes?: QualiteMiseEnStation
  readonly typeMonture?: TypeMonture
}

/**
 * First-start matériel: Annexe A format + resolution (`DEFAUT`), rest empty or at most prudent
 * value. Shared with plan URL (T-0431), which starts from it when a field is missing or refused.
 */
export const MATERIEL_PAR_DEFAUT: DepartMateriel = Object.freeze({
  boitier: Object.freeze({
    formatCapteur: 'PLEIN_FORMAT',
    resolutionMpx: DEFAUT.resolutionMpx,
    ...BOITIER_VIDE,
  }),
  iso: '',
  focale: DEFAUT.focale,
  ouverture: DEFAUT.ouverture,
  capteurMode: 'FULL_FRAME',
  typeObjectif: 'RECTILINEAIRE',
  suiviActif: false,
  qualiteMes: 'INCONNUE',
  typeMonture: 'TRACKER',
})

export function useSaisieMateriel(depart: DepartMateriel | null): SaisieMateriel {
  // An id gone from base (row deleted, file edited) falls back to custom mode with saved fields:
  // input usable, nothing lost.
  const [boitierId, setBoitierId] = useState(() =>
    ligneBoitier(depart?.boitierId ?? '') === null ? '' : (depart?.boitierId ?? ''),
  )
  const [boitier, surBoitier] = useState<SaisieBoitier>(depart?.boitier ?? MATERIEL_PAR_DEFAUT.boitier)
  const [iso, surIso] = useState(depart?.iso ?? MATERIEL_PAR_DEFAUT.iso)
  const [parcInitial] = useState(() =>
    parcDeDepart(
      {
        ...(depart?.objectifs === undefined ? {} : { objectifs: depart.objectifs }),
        ...(depart?.objectifId === undefined ? {} : { objectifId: depart.objectifId }),
        focale: depart?.focale ?? DEFAUT.focale,
        ouverture: depart?.ouverture ?? DEFAUT.ouverture,
        fisheye: depart?.typeObjectif === 'FISHEYE',
      },
      crypto.randomUUID(),
    ),
  )
  const [objectifs, setObjectifs] = useState<readonly Objectif[]>(parcInitial.objectifs)
  const [objectifId, setObjectifId] = useState(parcInitial.objectifId)
  const [focale, setFocale] = useState(depart?.focale ?? DEFAUT.focale)
  // Under a mounted lens, aperture = its full aperture: a stopped-down aperture reread from an old
  // record couldn't be corrected (field no longer exists).
  const [ouverture, surOuverture] = useState(() => {
    const monte = objectifActif(parcInitial.objectifs, parcInitial.objectifId)
    const focaleDepart = depart?.focale ?? DEFAUT.focale
    return monte === null ? (depart?.ouverture ?? DEFAUT.ouverture) : String(plancherA(monte, focaleDepart))
  })
  const d = depart ?? MATERIEL_PAR_DEFAUT
  const [capteurMode, surCapteurMode] = useState<CapteurMode>(d.capteurMode)
  const [typeObjectif, setTypeObjectif] = useState<TypeObjectif>(d.typeObjectif)
  const [suiviActif, surSuiviActif] = useState(d.suiviActif)
  const [qualiteMes, surQualiteMes] = useState<QualiteMiseEnStation>(d.qualiteMes ?? 'INCONNUE')
  const [typeMonture, surTypeMonture] = useState<TypeMonture>(d.typeMonture ?? 'TRACKER')

  /**
   * T-0204 — leaving a base boîtier copies its quantities into the fields: start from an editable
   * copy, not an empty form. Reverse copies nothing: while chosen, base rules.
   */
  function surBoitierId(id: string) {
    const quitte = id === '' ? ligneBoitier(boitierId) : null
    if (quitte !== null) surBoitier(quitte.saisie)
    // T-0205 — image weight stays editable under a base boîtier: row prefills, doesn't replace.
    // RAW setting changes without changing camera.
    const entre = ligneBoitier(id)
    if (entre !== null) surBoitier({ ...boitier, tailleRawMo: entre.saisie.tailleRawMo })
    setBoitierId(id)
  }

  /**
   * T-0404 — mounting a lens brings the setting within what it allows: focale in range, aperture
   * to its floor (mounted to be used wide open: deep-sky regime). Its projection becomes scène's.
   */
  function surObjectifId(id: string) {
    monteDans(objectifs, id)
  }

  function monteDans(parc: readonly Objectif[], id: string) {
    const objectif = objectifActif(parc, id)
    setObjectifId(objectif === null ? '' : id)
    if (objectif === null) return
    const focaleRetenue = focaleDans(objectif, focale)
    setFocale(focaleRetenue)
    surOuverture(String(plancherA(objectif, focaleRetenue)))
    surTypeObjectif(objectif.typeObjectif)
  }

  /**
   * Focale text clamped into range. Empty field takes the shortest focale: under a fixed focale
   * the field is hidden, an empty one would be unrecoverable.
   */
  function focaleDans(objectif: Objectif, texte: string): string {
    const { valeur, refus } = reglageOptique(objectif, texte, '').focale
    if (!Number.isFinite(valeur)) return String(objectif.focaleMinMm)
    return refus !== null ? String(valeur) : texte
  }

  /** T-0404 — under a zoom, aperture follows focale: it is the lens's full aperture. */
  function surFocale(v: string) {
    const objectif = objectifActif(objectifs, objectifId)
    // A field emptied mid-retype isn't a focale: aperture waits for the next.
    if (objectif !== null && Number.isFinite(nombreDeTexte(v))) {
      surOuverture(String(plancherA(objectif, v)))
    }
    setFocale(v)
  }

  /**
   * Edited park: a mounted lens leaving it yields to the park's first — free lens returns only on
   * empty park; one edited in place reclamps the setting, as at mounting.
   */
  function surObjectifs(parc: readonly Objectif[]) {
    // Park is never emptied: the last lens is the one shot with.
    if (parc.length === 0) return
    setObjectifs(parc)
    const monte = objectifActif(parc, objectifId)
    if (monte === null) {
      monteDans(parc, parc[0]?.id ?? '')
      return
    }
    const focaleRetenue = focaleDans(monte, focale)
    setFocale(focaleRetenue)
    // T-0404 — aperture no longer typed: it is the lens's full aperture.
    surOuverture(String(plancherA(monte, focaleRetenue)))
    if (monte.typeObjectif !== typeObjectif) surTypeObjectif(monte.typeObjectif)
  }

  /**
   * §5.1 — changing lens changes projection, not a render setting. Scène already "comme
   * l'objectif" → follows; planétarium → stays.
   */
  function surTypeObjectif(type: TypeObjectif) {
    setTypeObjectif(type)
    if (etatScene().vue.mode !== 'MODE_PLANETARIUM') majVue({ mode: modeObjectif(type) })
  }

  return {
    boitierId,
    surBoitierId,
    boitier,
    surBoitier,
    iso,
    surIso,
    objectifs,
    surObjectifs,
    objectifId,
    surObjectifId,
    focale,
    surFocale,
    ouverture,
    surOuverture,
    capteurMode,
    surCapteurMode,
    typeObjectif,
    surTypeObjectif,
    suiviActif,
    surSuiviActif,
    qualiteMes,
    surQualiteMes,
    typeMonture,
    surTypeMonture,
  }
}

/** The five C-15 score criteria, in the order they're set (§8.3). */
export const CRITERES_SCORING = Object.freeze([
  'cadrage',
  'hauteur',
  'signal',
  'fenetre',
  'lune',
] as const)

export type CritereScoring = (typeof CRITERES_SCORING)[number]

export interface SaisiePoids {
  /** Raw weights as set. Normalisation to 1 belongs to the moteur (§8.3). */
  readonly poids: PoidsScoring
  readonly surPoids: (critere: CritereScoring, valeur: number) => void
  /** Back to registre C-15 values, which stay the reference (§2.1). */
  readonly surDefaut: () => void
}

/**
 * §8.3 and §2.4 — scoring weights are set, never learned. State lives here like the rest of
 * input: reread at startup (T-0362) like lieu and matériel, never adjusted from past choices.
 */
export function useSaisiePoids(depart: PoidsScoring | null): SaisiePoids {
  const [poids, setPoids] = useState<PoidsScoring>(() => depart ?? poidsParDefaut())

  return {
    poids,
    surPoids: (critere, valeur) => setPoids((p) => Object.freeze({ ...p, [critere]: valeur })),
    surDefaut: () => setPoids(poidsParDefaut()),
  }
}
