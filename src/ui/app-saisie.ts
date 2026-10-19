/**
 * §4 et §5 — l'état de saisie de l'application : où l'on est, avec quoi on photographie.
 *
 * Chaque hook rend ses valeurs ET ses commandes sous les noms qu'attendent les panneaux,
 * pour qu'une région se garnisse d'un seul étalement plutôt que de seize propriétés
 * recopiées à la main.
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
 * Site et configuration ciel profond de l'Annexe A. `resolutionMpx` reprend la résolution du
 * boîtier de référence (33 Mpx) : sans elle, l'écran de départ n'aurait rien à calculer avant
 * la première saisie.
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
 * §12.3 — le lieu tel qu'il a été enregistré, relu au démarrage. `null` au premier
 * démarrage : les valeurs de l'Annexe A servent alors de départ.
 *
 * La date n'en fait pas partie : une séance se prépare pour la nuit qui vient, pas pour
 * celle du dernier rechargement.
 */
export interface DepartLieu {
  readonly latitude: string
  readonly longitude: string
  readonly altitude: string
  readonly bortle: string
  readonly sqm: string
}

/**
 * T-0267 — la nuit en cours, pas le jour civil : démarrer l'application à 2 h du matin sur
 * le terrain doit ouvrir le plan qu'on est en train d'exécuter, pas celui du soir suivant.
 * T-0355 — la nuit de l'instant que la scène a relu : un instant figé au rechargement garde
 * sa nuit. En `MAINTENANT`, l'horloge fait foi, avec le décalage que la scène a gardé.
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
 * §5.1 — les grandeurs du mode avancé : vides, aucune n'est présumée (§2.3). Le format de
 * capteur et la résolution, eux, partent de l'Annexe A (`DEFAUT`) — un écran de départ qui
 * n'aurait rien à calculer avant la première saisie ne démontrerait rien.
 */
const BOITIER_VIDE = {
  readNoiseE: '',
  seuilDoubleGainIso: '',
  zpSys: '',
  tailleRawMo: '',
} as const

export interface SaisieMateriel {
  /** T-0204 — identifiant d'une ligne de `boitiers.md`, ou `''` pour le mode personnalisé. */
  readonly boitierId: string
  readonly surBoitierId: (v: string) => void
  /** §5.1 — le type de capteur et la résolution, quand aucun boîtier n'est choisi. */
  readonly boitier: SaisieBoitier
  readonly surBoitier: (v: SaisieBoitier) => void
  /** §7.2 — ISO de capture, vide tant que celui du double gain convient. */
  readonly iso: string
  readonly surIso: (v: string) => void
  /** T-0404 — le parc d'objectifs, et l'identifiant de celui qui est monté (`''` : objectif libre). */
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

/** §12.3 — le matériel tel qu'il a été enregistré, relu au démarrage. */
export interface DepartMateriel {
  /** Absent d'un enregistrement antérieur à T-0204 : le mode personnalisé s'applique. */
  readonly boitierId?: string
  readonly boitier: SaisieBoitier
  readonly iso: string
  /** Absents d'un enregistrement antérieur à T-0404 : parc vide, objectif libre. */
  readonly objectifs?: readonly Objectif[]
  readonly objectifId?: string
  readonly focale: string
  readonly ouverture: string
  readonly capteurMode: CapteurMode
  readonly typeObjectif: TypeObjectif
  readonly suiviActif: boolean
  /** Absents d'un enregistrement venu d'ailleurs : le départ de la saisie s'applique. */
  readonly qualiteMes?: QualiteMiseEnStation
  readonly typeMonture?: TypeMonture
}

/**
 * Le matériel du premier démarrage : le format et la résolution de l'Annexe A (`DEFAUT`), le
 * reste vide ou à sa valeur la plus prudente. Partagé avec l'URL du plan (T-0431), qui en part
 * quand un champ manque ou se refuse.
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
  // Un identifiant disparu de la base — ligne supprimée, fichier édité — retombe sur le mode
  // personnalisé, avec les champs enregistrés : la saisie reste utilisable, rien n'est perdu.
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
  // Sous un objectif monté, l'ouverture est sa pleine ouverture : une ouverture fermée relue
  // d'un enregistrement antérieur ne se corrigerait plus, son champ n'existant plus.
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
   * T-0204 — quitter un boîtier de la base recopie ses grandeurs dans les champs : on repart
   * d'une copie modifiable plutôt que d'un formulaire vide. Le sens inverse ne recopie rien —
   * tant qu'un boîtier est choisi, c'est la base qui fait foi, pas ce qui traîne dans l'état.
   */
  function surBoitierId(id: string) {
    const quitte = id === '' ? ligneBoitier(boitierId) : null
    if (quitte !== null) surBoitier(quitte.saisie)
    // T-0205 — le poids d'une image reste saisissable sous un boîtier de la base : la ligne
    // préremplit le champ, elle ne le remplace pas. Le réglage RAW change sans changer d'appareil.
    const entre = ligneBoitier(id)
    if (entre !== null) surBoitier({ ...boitier, tailleRawMo: entre.saisie.tailleRawMo })
    setBoitierId(id)
  }

  /**
   * T-0404 — monter un objectif ramène le réglage dans ce qu'il permet : la focale dans sa
   * plage, l'ouverture à son plancher — on monte un objectif pour s'en servir à pleine
   * ouverture, c'est le régime du ciel profond. Sa projection devient celle de la scène.
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
   * Le texte de la focale ramenée dans la plage. Un champ vide prend la focale la plus courte :
   * sous une focale fixe le champ n'est plus affiché, et un vide y serait irréparable.
   */
  function focaleDans(objectif: Objectif, texte: string): string {
    const { valeur, refus } = reglageOptique(objectif, texte, '').focale
    if (!Number.isFinite(valeur)) return String(objectif.focaleMinMm)
    return refus !== null ? String(valeur) : texte
  }

  /** T-0404 — sous un zoom, l'ouverture suit la focale : c'est la pleine ouverture de l'objectif. */
  function surFocale(v: string) {
    const objectif = objectifActif(objectifs, objectifId)
    // Un champ vidé le temps d'être retapé n'est pas une focale : l'ouverture attend la suivante.
    if (objectif !== null && Number.isFinite(nombreDeTexte(v))) {
      surOuverture(String(plancherA(objectif, v)))
    }
    setFocale(v)
  }

  /**
   * Le parc édité : l'objectif monté qui en sort cède la place au premier du parc — l'objectif
   * libre ne revient que parc vide ; celui qui est modifié en place reborne le réglage, comme à
   * son montage.
   */
  function surObjectifs(parc: readonly Objectif[]) {
    // Le parc n'est jamais vidé : le dernier objectif est celui avec lequel on photographie.
    if (parc.length === 0) return
    setObjectifs(parc)
    const monte = objectifActif(parc, objectifId)
    if (monte === null) {
      monteDans(parc, parc[0]?.id ?? '')
      return
    }
    const focaleRetenue = focaleDans(monte, focale)
    setFocale(focaleRetenue)
    // T-0404 — l'ouverture ne se saisit plus : c'est la pleine ouverture de l'objectif.
    surOuverture(String(plancherA(monte, focaleRetenue)))
    if (monte.typeObjectif !== typeObjectif) surTypeObjectif(monte.typeObjectif)
  }

  /**
   * §5.1 — changer d'objectif change la projection, pas un réglage de rendu. Si la scène
   * regarde déjà « comme l'objectif », elle suit ; si elle est en planétarium, elle y reste.
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

/** Les cinq critères du score C-15, dans l'ordre où ils se règlent (§8.3). */
export const CRITERES_SCORING = Object.freeze([
  'cadrage',
  'hauteur',
  'signal',
  'fenetre',
  'lune',
] as const)

export type CritereScoring = (typeof CRITERES_SCORING)[number]

export interface SaisiePoids {
  /** Poids bruts tels qu'ils sont réglés. La normalisation à 1 appartient au moteur (§8.3). */
  readonly poids: PoidsScoring
  readonly surPoids: (critere: CritereScoring, valeur: number) => void
  /** Retour aux valeurs C-15 du registre, qui restent la référence (§2.1). */
  readonly surDefaut: () => void
}

/**
 * §8.3 et §2.4 — les poids de scoring se règlent, et rien ne les apprend.
 *
 * L'état vit ici, comme le reste de la saisie : relu au démarrage (T-0362) comme le lieu et le
 * matériel, jamais ajusté d'après les choix passés. Ce qui revient est ce qui a été réglé.
 */
export function useSaisiePoids(depart: PoidsScoring | null): SaisiePoids {
  const [poids, setPoids] = useState<PoidsScoring>(() => depart ?? poidsParDefaut())

  return {
    poids,
    surPoids: (critere, valeur) => setPoids((p) => Object.freeze({ ...p, [critere]: valeur })),
    surDefaut: () => setPoids(poidsParDefaut()),
  }
}
