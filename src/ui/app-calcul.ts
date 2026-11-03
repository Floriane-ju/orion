/**
 * §7 and §8 — app calcul chain, lieu + matériel → night plan.
 * Nothing drawn here: outputs memoised, handed to coque regions. Refused input / exceeded domain
 * names its cause instead of crashing (§12.5).
 */

import { useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { nombreLibre } from '../registry/ecriture.ts'
import { fenetreNocturne, offsetMidiSolaireMin, type FenetreNocturne } from '../core/nuit.ts'
import { midiDeLaNuit } from '../core/nuit-datee.ts'
import { etatsCibles, type EtatCible } from '../core/cibles-liste.ts'
import { fenetreUtile as calculeFenetreUtile, type FenetreUtile } from '../core/moon.ts'
import {
  planSession,
  type ContexteSession,
  type PlanSession,
  type PoidsScoring,
} from '../core/session.ts'
import {
  seuilsDeclinaison,
  type MasqueHorizon,
  type SeuilsSite,
} from '../core/site.ts'
import {
  FondDeCielIndeterminableError,
  fondDeCiel,
  type FondDeCiel,
} from '../core/fond-ciel.ts'
import { profilOptique, type ProfilOptique } from '../core/optics.ts'
import { fluxCiel } from '../core/exposure.ts'
import type { IndexCiel } from '../core/index-ciel.ts'
import type { ProfondeurSansPose } from './planetarium-materiel.ts'
import { npf, profilSuivi, type ProfilSuivi } from '../core/suivi.ts'
import { BortleHorsTableError } from '../registry/bortle.ts'
import { SaisieRefuseeError } from '../registry/domains.ts'
import { HorsDomaineSeriesError, type Site } from '../core/ephem.ts'
import type { ProfilCadre } from '../core/cadre.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import {
  capteurEffectif,
  isoRecommande,
  pointZeroSysteme,
  resoutBoitier,
  type Boitier,
  type CapteurEffectif,
  type IsoRetenu,
  type PointZeroSysteme,
} from '../data/equipment.ts'
import { boitierDeBase, ligneBoitier } from '../data/boitiers.ts'
import { K } from '../registry/constants.ts'
import type { Traced } from '../core/traced.ts'
import { modeObjectif } from '../core/optics.ts'
import type { SaisieLieu, SaisieMateriel } from './app-saisie.ts'
import { nombreSaisi, nombreSiRenseigne } from './saisie-bornee.ts'
import { objectifActif, reglageOptique } from './objectif-saisie.ts'
import { estZoom, ouverturePlancher, plancherAuPas } from '../core/objectif.ts'
import { zoomSur, type Zoom } from './zoom-calcul.ts'
import type { MaterielFile } from './planetarium-materiel.ts'
import { altitudeDuRelief, masqueDuRelief, useReliefSite } from './relief-site.ts'
import { PRESET_SNR_DEFAUT } from '../registry/verdicts.ts'
import type { ContexteFiche } from './fiche-cible-calcul.ts'
import { useCiblesChoisies } from './cibles-choisies.ts'
import type { PanneauFileProps } from './PanneauFile.tsx'

/**
 * Quality target for the night plan: "correct" per §7.3. T-0268: read from registre, not copied
 * (fiche opens on same preset; two `10`s drift).
 */
const PRESET_SNR_PLAN = PRESET_SNR_DEFAUT

/**
 * T-0291 — what regions with in-flight calcul say. Names state AND consequence: "Calcul en
 * cours…" alone suggests an empty screen; it shows the previous result, enough not to trust a
 * stale figure.
 */
export const RECALCUL_EN_COURS =
  'Recalcul en cours : les chiffres affichés sont ceux de la saisie précédente.'

/**
 * T-0149 — what LIEU and DATE give, independent of matériel. Separate from `Calcul`: different
 * failures (focale erased mid-typing doesn't make the night incalculable); scène needs only this
 * (§12.5).
 */
export type CalculCiel =
  | {
      readonly ok: true
      readonly nuit: FenetreNocturne
      readonly ciel: FondDeCiel
      readonly seuils: SeuilsSite
      readonly offsetMidi: Traced<number>
    }
  | { readonly ok: false; readonly erreur: string }

/** Sky when calculable — what scène and plan de séance consume. */
export type CielCalcule = Extract<CalculCiel, { readonly ok: true }>

/** §5.1, §5.2, §9.1 — what the declared MATÉRIEL produces, or the cause of its refusal. */
export type Calcul =
  | {
      readonly ok: true
      readonly optique: ProfilOptique
      readonly suivi: ProfilSuivi
      readonly poseNpf: Traced<number | null>
      readonly capteur: CapteurEffectif
      /** T-0208 — CLAMPED focale and aperture: everything else derives from them. */
      readonly focaleMm: number
      readonly ouvertureN: number
      /** §5.1 — retained boîtier: from base, or as described by input. */
      readonly boitier: Boitier
      readonly zeroSysteme: PointZeroSysteme
      readonly iso: IsoRetenu
      readonly noteRecadrage?: string
    }
  | { readonly ok: false; readonly erreur: string }

export interface ChaineCalcul {
  readonly calcul: Calcul
  /** T-0149 — site sky: computes even when matériel is incomplete. */
  readonly ciel: CalculCiel
  /**
   * Refusal cause of current INPUT when `ciel` is the previous input's; `null` once lieu is
   * calculable again.
   */
  readonly cielRefus: string | null
  readonly site: Site
  readonly masque: MasqueHorizon
  /** T-0369 — lieu changed, relief not there yet: planétarium flattens it. */
  readonly horizonEnAttente: boolean
  readonly fenetreUtile: FenetreUtile | null
  /** Selection index: built once, read by scène and Explorer tab. */
  readonly index: IndexCiel
  readonly profilsCadre: readonly ProfilCadre[]
  /** Absent when matériel isn't chiffrable: scène then overlays nothing. */
  readonly materielFile: MaterielFile | null
  /** §8.3 — night context, shared by plan de séance and catalogue list. */
  readonly contexteSession: ContexteSession | null
  /**
   * T-0407 — under zoom, each cible's context at its optimal focale, from the SAME deferred
   * generation as `contexteSession`. `null` outside zoom.
   */
  readonly zoom: Zoom | null
  readonly plan: PlanSession | null
  /**
   * §6.4 — ease note per designation, computed ONCE app-wide. Here not in a screen: TWO surfaces
   * show it (list, Cible card header); two moteur calls = two coverages to sync (card rated
   * cibles the list left empty); one map prevents contradiction.
   */
  readonly etatsCibles: ReadonlyMap<string, EtatCible>
  /** Matériel and sky under which fiche evaluates a cible (§6, §7). */
  readonly contexteFiche: ContexteFiche | null
  readonly panneauFile: PanneauFileProps | null
  /**
   * T-0291 — true while displayed plan, notes and list are the PREVIOUS input's (heavy calcul
   * left, not returned). Affected regions SAY so: a late figure that doesn't announce itself is a
   * wrong figure.
   */
  readonly recalculEnCours: boolean
}

export interface EntreeChaine {
  readonly lieu: SaisieLieu
  readonly materiel: SaisieMateriel
  readonly catalogue: readonly ObjetCielProfond[]
  /**
   * §3.3 — spatial index, received built. T-0296: building here forced building INSIDE a render
   * where nothing can yield; now built with catalogues (`app-donnees.ts`), in slices.
   */
  readonly index: IndexCiel
  /** §8.3 — C-15 weights as set; moteur normalises them. */
  readonly poids: PoidsScoring
}

/**
 * T-0291 — LIEU reduced to QUANTITIES, before any memo. Memoising on typed STRINGS: "45.5" vs
 * "45.50" = same latitude, different text → whole night recomputed for a no-effect char (480 ms at
 * 4× CPU). Clamping redone per render (free); its NUMBERS are the deps, so two inputs describing
 * one lieu share a key. `NaN` equals itself under `Object.is` (React's): field emptied mid-retype
 * relaunches nothing.
 */
export interface GrandeursLieu {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  readonly altitudeM: number
  /** §2.3 — `undefined` when field is empty: quantity declared unknown. */
  readonly bortleDeclare: number | undefined
  readonly sqmMesure: number | undefined
  readonly nuitIso: string
}

export function grandeursLieu(lieu: SaisieLieu): GrandeursLieu {
  return {
    latitudeDeg: nombreSaisi('latitude_deg', lieu.latitude).valeur,
    longitudeDeg: nombreSaisi('longitude_deg', lieu.longitude).valeur,
    altitudeM: nombreSaisi('altitude_m', lieu.altitude).valeur,
    bortleDeclare: nombreSiRenseigne('bortle_declare', lieu.bortle).valeur,
    sqmMesure: nombreSiRenseigne('sqm_mesure', lieu.sqm).valeur,
    nuitIso: lieu.nuitIso,
  }
}

/** T-0291 — MATÉRIEL reduced to quantities, same reason as lieu. */
export interface GrandeursMateriel {
  readonly focaleMm: number
  readonly ouvertureN: number
  /**
   * §7.2 — ISO fixed by input, `undefined` when nothing fixes it. T-0206: under a base boîtier its
   * row's dual-gain threshold designates ISO, typed value ignored. Filtered here, not in
   * `evalueMateriel`: typing in this field under a base boîtier changes NO dependency.
   */
  readonly isoSaisi: number | undefined
}

export function grandeursMateriel(materiel: SaisieMateriel): GrandeursMateriel {
  // T-0404 — under a mounted lens, setting is clamped to what it allows.
  const reglage = reglageOptique(
    objectifActif(materiel.objectifs, materiel.objectifId),
    materiel.focale,
    materiel.ouverture,
  )
  return {
    focaleMm: reglage.focale.valeur,
    ouvertureN: reglage.ouverture.valeur,
    isoSaisi:
      ligneBoitier(materiel.boitierId) !== null
        ? undefined
        : nombreSiRenseigne('iso_capture', materiel.iso).valeur,
  }
}

export function useChaineCalcul(entree: EntreeChaine): ChaineCalcul {
  const { lieu, materiel, catalogue, index, poids } = entree

  // §8.3 — read here, not a prop: selection shares no ancestor with the two composing buttons;
  // a prop would add one more relay between store and sole consumer.
  const choisies = useCiblesChoisies()

  // T-0291 — the two clamped inputs, recomputed per render: keys of everything below (a key
  // memoised on itself isn't one).
  const lieuBorne = grandeursLieu(lieu)
  const materielBorne = grandeursMateriel(materiel)

  /**
   * T-0208 — the three lieu quantities clamped into domain before any moteur. Closes the black
   * screen: `astronomy-engine` throws a STRING on latitude outside [−90, 90]; `refus()` didn't
   * recognise it and rethrew from a render.
   */
  const siteSaisi = useMemo(
    () => ({
      latitudeDeg: lieuBorne.latitudeDeg,
      longitudeDeg: lieuBorne.longitudeDeg,
      altitudeM: lieuBorne.altitudeM,
    }),
    [lieuBorne.latitudeDeg, lieuBorne.longitudeDeg, lieuBorne.altitudeM],
  )

  /**
   * T-0149, as for sky: a field emptied mid-retype isn't a lieu. Non-chiffrable site yields to the
   * last valid one; it feeds fenêtre utile, plan de séance and planétarium loop — no `NaN`
   * descends the chain.
   */
  const dernierSite = useRef<Site | null>(null)
  if (siteChiffrable(siteSaisi)) dernierSite.current = siteSaisi
  const site = dernierSite.current ?? siteSaisi

  /**
   * §4.1 — terrain relief. Without it (offline on unknown site, service mute) flat mask [HYP]
   * stays: §12.5 degradation fallback.
   */
  const { relief, enCharge: horizonEnAttente } = useReliefSite(site.latitudeDeg, site.longitudeDeg)
  const masque: MasqueHorizon = useMemo(() => masqueDuRelief(relief), [relief])

  /**
   * Altitude no longer typed: it's relief ground at the set lieu, however coordinates changed
   * (map, typing, drag). Without usable relief, field keeps its last value.
   */
  const { altitude, surAltitude } = lieu
  useEffect(() => {
    if (relief === null || horizonEnAttente) return
    const sol = altitudeDuRelief(relief)
    if (sol !== null && sol !== altitude) surAltitude(sol)
  }, [relief, horizonEnAttente, altitude, surAltitude])

  const cielSaisi = useMemo(
    () => evalueCiel(site, lieuBorne),
    [site, lieuBorne.bortleDeclare, lieuBorne.sqmMesure, lieuBorne.nuitIso],
  )

  /**
   * T-0149 cont. — lieu field emptied mid-retype refused the whole sky and scène vanished. Last
   * calculable sky stands as displayed sky; refusal cause reads beside its field (flickering
   * planétarium is unreadable, error stays said). While no input ever succeeded (profile reread
   * out of domain at first render) nothing to keep: refusal is the only state.
   */
  const dernierCiel = useRef<CielCalcule | null>(null)
  if (cielSaisi.ok) dernierCiel.current = cielSaisi
  const ciel = cielAffiche(cielSaisi, dernierCiel.current)
  // T-0208 — field clamping is said AT THAT FIELD (`ChampDomaine`); this line carries only what
  // no field says alone: Bortle table without fallback, indeterminable fond de ciel, incomplete
  // lieu.
  const cielRefus = cielSaisi.ok ? null : cielSaisi.erreur

  const calcul = useMemo(
    () => evalueMateriel(materiel, materielBorne),
    [
      materiel.boitierId,
      materiel.boitier,
      materiel.capteurMode,
      // T-0270 — lens projection enters the computed field: without it, ticking "fisheye" changed
      // nothing until another field was touched.
      materiel.typeObjectif,
      materiel.suiviActif,
      materiel.qualiteMes,
      materiel.typeMonture,
      materielBorne.focaleMm,
      materielBorne.ouvertureN,
      materielBorne.isoSaisi,
    ],
  )

  /**
   * T-0433 — under zoom each cible is evaluated at ITS focale (T-0407): the set ring enters
   * neither list nor plan, turning it relaunches nothing. Base context is chiffré at a fixed
   * reference focale — the tele, where `focaleOptimale` leads a cible of size→0 — and cibles
   * without dimensions land there. Aperture = floor, as setting under a lens (T-0404).
   */
  const objectif = objectifActif(materiel.objectifs, materiel.objectifId)
  const focaleListe = estZoom(objectif) ? objectif.focaleMaxMm : materielBorne.focaleMm
  const ouvertureListe = estZoom(objectif)
    ? plancherAuPas(ouverturePlancher(objectif, objectif.focaleMaxMm))
    : materielBorne.ouvertureN
  const reglageSuffit = !estZoom(objectif)
  const calculListe = useMemo(
    () =>
      reglageSuffit
        ? calcul
        : evalueMateriel(materiel, { ...materielBorne, focaleMm: focaleListe, ouvertureN: ouvertureListe }),
    // Outside zoom `calcul` already has all keys; under zoom dropped: follows the ring.
    [
      reglageSuffit ? calcul : null,
      materiel.boitierId,
      materiel.boitier,
      materiel.capteurMode,
      materiel.typeObjectif,
      materiel.suiviActif,
      materiel.qualiteMes,
      materiel.typeMonture,
      focaleListe,
      ouvertureListe,
      materielBorne.isoSaisi,
    ],
  )

  const fenetreUtile = useMemo(
    () => (ciel.ok ? calculeFenetreUtile(site, ciel.nuit) : null),
    [ciel, site],
  )

  /** §3.5 — cadre projected on scène, as the entered matériel defines it. */
  const profilsCadre = useMemo(
    () => profilsDeCadre(calcul, materiel),
    [calcul, materiel.capteurMode, materiel.typeObjectif],
  )

  /**
   * §9.2 — what fixes a pose's depth, pose excepted. T-0398: pose unitaire follows cadre's pose
   * max, hence aimed declination; joined in scène (reads the séance) so a pan no longer climbs to
   * the app chain.
   */
  const profondeurFile: ProfondeurSansPose | null = useMemo(() => {
    if (!calcul.ok || !ciel.ok) return null
    return {
      dMm: calcul.optique.dMm.value,
      zpSys: calcul.zeroSysteme.valeur,
      eCielPxS: fluxCiel({
        sbMagArcsec2: ciel.ciel.sbCiel.value,
        zpSys: calcul.zeroSysteme.valeur,
        pitchUm: calcul.capteur.pitchUm,
        ouvertureN: calcul.ouvertureN,
        zpEstime: calcul.zeroSysteme.estime,
      }).value,
      readNoiseE: calcul.iso.readNoiseE ?? K('READ_NOISE_DEFAUT_E'),
      zpEstime: calcul.zeroSysteme.estime,
    }
  }, [calcul, ciel])

  /**
   * What scène must know of the filé to overlay it in the cadre. Memoised, not assembled in JSX:
   * the filé pass republishes its render counters into the séance store, which renders the app; a
   * fresh identity per render would relaunch the pass → republish, endlessly.
   */
  const materielFile = useMemo(() => {
    if (!calcul.ok || !ciel.ok || profondeurFile === null) return null
    return {
      optique: {
        focaleMm: calcul.focaleMm,
        ouvertureN: calcul.ouvertureN,
        pitchUm: calcul.capteur.pitchUm,
      },
      profondeur: profondeurFile,
      sbCiel: ciel.ciel.sbCiel.value,
    }
  }, [calcul, ciel, profondeurFile])

  /**
   * §8.3 — sky, site, matériel under which a cible is evaluated for the night. Memoised apart from
   * the plan: TWO screens use it (plan de séance, catalogue list §6.4); a second context elsewhere
   * would announce another pose for the same cible — T-0089 disagreement.
   */
  const contexteSession = useMemo<ContexteSession | null>(() => {
    if (!calculListe.ok || !ciel.ok || fenetreUtile === null) return null
    return {
        site,
        nuit: ciel.nuit,
        fenetreUtile,
        masque,
        ...champsDeFocale(calculListe),
        capteurHMm: calculListe.capteur.capteurHMm,
        pitchUm: calculListe.capteur.pitchUm,
        zpSys: calculListe.zeroSysteme.valeur,
        zpEstime: calculListe.zeroSysteme.estime,
        readNoiseE: calculListe.iso.readNoiseE,
        tailleRawMo: calculListe.boitier.tailleRawMo,
        isoSession: calculListe.iso.iso,
        sbCielNoir: ciel.ciel.sbCiel.value,
        mLimOeil: ciel.ciel.mLimOeil.value,
        snrCible: PRESET_SNR_PLAN,
        typeMonture: materiel.typeMonture,
        poids,
    }
  }, [calculListe, ciel, masque, materiel.typeMonture, site, fenetreUtile, poids])

  /**
   * T-0291 — HEAVY CALCUL BOUNDARY. Downstream follows typing, doesn't carry it.
   * Above: a few ms (site sky, optical profile, cadre). Below: sweeps the whole catalogue — night
   * plan, ease notes, list readings; ~60 ms unthrottled, 4× on the §11.2 tablet, inside the
   * keystroke's render: input dropped.
   * `useDeferredValue` moves them to a lower-priority render: key painted with the PREVIOUS
   * context, then React resumes with the new. Same plan, only order changes.
   * Cost = visible lag, accepted if lagging regions say so (`recalculEnCours`). Context handed to
   * the app is the DEFERRED one, never the live input's — regions reading both would contradict
   * for one render.
   */
  // T-0436 — park compared by CONTENT: identically rebuilt array (link import, panel render) must
  // not relaunch list and plan (T-0433).
  const cleParc = JSON.stringify(materiel.objectifs)
  const parc = useMemo(() => materiel.objectifs, [cleParc])
  const zoom = useMemo(() => {
    if (contexteSession === null || !ciel.ok) return null
    return zoomSur({
      monte: objectif,
      parc,
      base: contexteSession,
      focaleMm: focaleListe,
      ouvertureN: ouvertureListe,
      evalue: (o, focaleMm, ouvertureN) => {
        const sous = { ...materiel, typeObjectif: o.typeObjectif }
        const c = evalueMateriel(sous, { ...materielBorne, focaleMm, ouvertureN })
        return c.ok
          ? {
              contexte: { ...contexteSession, ...champsDeFocale(c), objectifNom: o.nom },
              fiche: contexteFiche(c, ciel, sous, lieu),
            }
          : null
      },
    })
    // Same keys as `calcul`: `materiel` is new each render, its fields aren't.
  }, [
    objectif,
    parc,
    contexteSession,
    ciel,
    materiel.boitierId,
    materiel.boitier,
    materiel.capteurMode,
    materiel.typeObjectif,
    materiel.suiviActif,
    materiel.qualiteMes,
    materiel.typeMonture,
    focaleListe,
    ouvertureListe,
    materielBorne.isoSaisi,
    lieu.bortle,
  ])

  // T-0407 — context and zoom deferred TOGETHER: list and plan read the same generation.
  const courant = useMemo(() => ({ contexte: contexteSession, zoom }), [contexteSession, zoom])
  const differe = useDeferredValue(courant)
  const contexteDiffere = differe.contexte
  const zoomDiffere = differe.zoom
  const recalculEnCours = differe !== courant

  /**
   * §8.3 — plan orders ONLY the chosen cibles (§6.4). Guard is on the CATALOGUE, not the
   * selection: "catalogues en cours de vérification" and "aucune cible choisie" are distinct
   * states: first yields `null`, second an empty plan that speaks.
   * Selection skips `useDeferredValue`: ticking a cible isn't the heavy typing of T-0291; a
   * handful of cibles costs a few ephemerides.
   */
  const plan = useMemo(() => {
    if (contexteDiffere === null || catalogue.length === 0) return null
    return planSession(
      contexteDiffere,
      catalogue.filter((objet) => choisies.has(objet.designation)),
      zoomDiffere?.contexteDe,
    )
  }, [contexteDiffere, zoomDiffere, catalogue, choisies])

  /**
   * §6.4 — same deps as the plan, same reason: créneau is a property of the NIGHT, moving the time
   * cursor relaunches nothing.
   */
  const etats = useMemo(
    () =>
      contexteDiffere === null
        ? new Map<string, EtatCible>()
        : etatsCibles(contexteDiffere, catalogue, zoomDiffere?.contexteDe),
    [contexteDiffere, zoomDiffere, catalogue],
  )

  return {
    calcul,
    ciel,
    cielRefus,
    site,
    masque,
    horizonEnAttente,
    fenetreUtile,
    index,
    profilsCadre,
    materielFile,
    contexteSession: contexteDiffere,
    zoom: zoomDiffere,
    recalculEnCours,
    plan,
    etatsCibles: etats,
    contexteFiche:
      calcul.ok && ciel.ok ? contexteFiche(calcul, ciel, materiel, lieu) : null,
    panneauFile:
      calcul.ok && ciel.ok ? panneauFile(calcul, materiel, site) : null,
  }
}

/**
 * Sky scène draws: input's when it succeeds, else last that did. A refusal replaces displayed sky
 * only while none ever held.
 */
export function cielAffiche(saisi: CalculCiel, dernier: CielCalcule | null): CalculCiel {
  return saisi.ok ? saisi : (dernier ?? saisi)
}

/**
 * T-0208 — a lieu with a non-number quantity isn't a lieu: `new Observer` passes `NaN` without
 * throwing, whole chain returns `NaN`.
 */
export function siteChiffrable(site: Site): boolean {
  return (
    Number.isFinite(site.latitudeDeg) &&
    Number.isFinite(site.longitudeDeg) &&
    Number.isFinite(site.altitudeM)
  )
}

/**
 * §4.1, §2.2 — what lieu and date give, or refusal cause. T-0291: input is the CLAMPED lieu,
 * never typed text: first moteur of the heavy chain; what relaunches it must be a number, not a
 * keystroke.
 */
export function evalueCiel(site: Site, grandeurs: GrandeursLieu): CalculCiel {
  try {
    if (!siteChiffrable(site)) {
      return { ok: false, erreur: 'Saisie refusée : le lieu doit être entièrement chiffré.' }
    }
    const depart = midiDeLaNuit(grandeurs.nuitIso)
    const offsetFuseauH = -new Date().getTimezoneOffset() / 60
    return {
      ok: true,
      nuit: fenetreNocturne(site, depart),
      ciel: fondDeCiel({
        ...(grandeurs.sqmMesure === undefined ? {} : { sqmMesure: grandeurs.sqmMesure }),
        ...(grandeurs.bortleDeclare === undefined
          ? {}
          : { bortleDeclare: grandeurs.bortleDeclare }),
      }),
      seuils: seuilsDeclinaison(site.latitudeDeg),
      offsetMidi: offsetMidiSolaireMin(site.longitudeDeg, offsetFuseauH),
    }
  } catch (erreur) {
    return refus(erreur)
  }
}

/**
 * §5.1, §5.2, §9.1 — what declared matériel produces, or refusal cause. T-0149: lieu no longer
 * enters here: a focale erased mid-retype refused night and fond de ciel too, scène vanished.
 */
/**
 * T-0204 — calcul boîtier: base row when chosen, else input. Base rules while a boîtier is
 * chosen, not a copy frozen in profile: fixing a `boitiers.md` row recalculates plans at
 * restart (§2.1). T-0205: except image weight, from input even under a base boîtier: RAW
 * setting, not a sensor quantity; row only gives a start.
 */
function boitierCourant(materiel: SaisieMateriel): Boitier {
  const ligne = ligneBoitier(materiel.boitierId)
  return ligne === null
    ? resoutBoitier(materiel.boitier)
    : boitierDeBase(ligne, materiel.boitier.tailleRawMo)
}

export function evalueMateriel(
  materiel: SaisieMateriel,
  grandeurs: GrandeursMateriel,
): Calcul {
  try {
    const boitier = boitierCourant(materiel)
    const capteur = capteurEffectif(boitier, materiel.capteurMode)
    const focaleMm = grandeurs.focaleMm
    const ouvertureN = grandeurs.ouvertureN
    return {
      ok: true,
      optique: profilOptique({ focaleMm, ouvertureN, typeObjectif: materiel.typeObjectif, ...capteur }),
      suivi: profilSuivi({
        suiviActif: materiel.suiviActif,
        qualiteMes: materiel.qualiteMes,
        typeMonture: materiel.typeMonture,
        focaleMm,
      }),
      // §9.1 — NPF stays displayed even with suivi, informative. Declination 0: most constraining
      // sky zone; per-cell map comes in lot 5.
      poseNpf: npf({ focaleMm, ouvertureN, pitchUm: capteur.pitchUm, decDeg: 0 }),
      capteur,
      focaleMm,
      ouvertureN,
      boitier,
      zeroSysteme: pointZeroSysteme(boitier),
      iso: isoRecommande(boitier, grandeurs.isoSaisi ?? null),
      ...(capteur.noteRecadrage === undefined ? {} : { noteRecadrage: capteur.noteRecadrage }),
    }
  } catch (erreur) {
    return refus(erreur)
  }
}

/**
 * Refused input / exceeded domain: cause named, not swallowed. T-0208: never rethrown.
 * `astronomy-engine` throws STRINGS, not `Error`: the four `instanceof` were false, throw
 * restarted from a render `useMemo`, React unmounted the tree — silent black screen.
 */
function refus(erreur: unknown): { readonly ok: false; readonly erreur: string } {
  if (
    erreur instanceof BortleHorsTableError ||
    erreur instanceof FondDeCielIndeterminableError ||
    erreur instanceof HorsDomaineSeriesError ||
    erreur instanceof SaisieRefuseeError
  ) {
    return { ok: false, erreur: erreur.message }
  }
  // T-0279 — unknown throw = library English sentence: goes to console, screen says what to do.
  console.error('Orion — calcul refusé', erreur)
  return { ok: false, erreur: 'Calcul impossible pour cette saisie : vérifiez le lieu, la date et le matériel.' }
}

export function profilsDeCadre(calcul: Calcul, materiel: SaisieMateriel): readonly ProfilCadre[] {
  if (!calcul.ok) return []
  const boitier = calcul.boitier
  const focaleMm = calcul.focaleMm
  const ouvertureN = calcul.ouvertureN
  // §3.5 — one profile, the declared matériel's: scène shows what THIS matériel would capture.
  // Array stays an array (T-0234, Annexe C n° 24): comparing optiques needs saved profiles;
  // nothing prevents extending.
  const mode = materiel.capteurMode
  const capteur = capteurEffectif(boitier, mode)
  const optique = profilOptique({
    focaleMm,
    ouvertureN,
    typeObjectif: materiel.typeObjectif,
    ...capteur,
  })
  return [
    {
      libelle: `${nombreLibre(focaleMm)} mm f/${nombreLibre(ouvertureN)} — ${mode === 'FULL_FRAME' ? 'plein format' : 'recadrage APS-C'}`,
      fovLDeg: optique.fovLDeg.value,
      fovHDeg: optique.fovHDeg.value,
      echApx: optique.echApx.value,
      capteurHMm: capteur.capteurHMm,
      modeObjectif: modeObjectif(materiel.typeObjectif),
      tPoseS: calcul.suivi.tMaxSuiviS.value ?? calcul.poseNpf.value,
    },
  ]
}

/**
 * T-0407 — what focale fixes in the night context, nothing else: base and each zoom focale's
 * context use it, so no field is forgotten.
 */
function champsDeFocale(calcul: Calcul & { ok: true }) {
  return {
    focaleMm: calcul.focaleMm,
    fovHDeg: calcul.optique.fovHDeg.value,
    echApx: calcul.optique.echApx.value,
    dMm: calcul.optique.dMm.value,
    ouvertureN: calcul.ouvertureN,
    tMaxS: calcul.suivi.tMaxSuiviS.value ?? calcul.poseNpf.value,
    // §5.2 — domain lock, not only the pose cap: without suivi NPF alone let bright cibles pass,
    // chiffrées in thousands of 2 s poses.
    domaineCpFerme: calcul.suivi.cause,
  } as const
}

function contexteFiche(
  calcul: Calcul & { ok: true },
  ciel: CalculCiel & { ok: true },
  materiel: SaisieMateriel,
  lieu: SaisieLieu,
): ContexteFiche {
  return {
    optique: calcul.optique,
    capteurHMm: calcul.capteur.capteurHMm,
    pitchUm: calcul.capteur.pitchUm,
    ouvertureN: calcul.ouvertureN,
    boitier: calcul.boitier,
    zeroSysteme: calcul.zeroSysteme,
    iso: calcul.iso,
    sbCiel: ciel.ciel.sbCiel.value,
    mLimOeil: ciel.ciel.mLimOeil.value,
    // Without suivi NPF caps the pose (§9.1) — never nothing.
    tMaxS: calcul.suivi.tMaxSuiviS.value ?? calcul.poseNpf.value,
    bortle: nombreSiRenseigne('bortle_declare', lieu.bortle).valeur ?? null,
    suiviActif: materiel.suiviActif,
    focaleMm: calcul.focaleMm,
  }
}

function panneauFile(
  calcul: Calcul & { ok: true },
  materiel: SaisieMateriel,
  site: Site,
): PanneauFileProps {
  return {
    site,
    focaleMm: calcul.focaleMm,
    ouvertureN: calcul.ouvertureN,
    pitchUm: calcul.capteur.pitchUm,
    capteurLMm: calcul.capteur.capteurLMm,
    capteurHMm: calcul.capteur.capteurHMm,
    fovLDeg: calcul.optique.fovLDeg.value,
    fovHDeg: calcul.optique.fovHDeg.value,
    tailleRawMo: calcul.boitier.tailleRawMo,
    modeObjectif: modeObjectif(materiel.typeObjectif),
  }
}
