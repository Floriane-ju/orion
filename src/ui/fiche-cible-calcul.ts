/**
 * Fiche calc chain: catalogue cible → « pose 13 s, 252 images, 8,3 Go », via §6.2 cadrage, §6.3
 * détectabilité, §7 pose. No React: values in, traced values out → chain verifiable end to end.
 */

import { ficheCadrage, type FicheCadrage } from '../core/cadrage.ts'
import { dureeLisible } from '../registry/ecriture.ts'
import { detectabilite, type Detectabilite } from '../core/detectability.ts'
import {
  attenuationBrute,
  fluxCiel,
  fluxE,
  fluxObjet,
  fluxObjetReel,
  integrationRequiseS,
  planIntegration,
  poseUnitaire,
  type FluxObjetReel,
  type PlanIntegration,
  type PoseUnitaire,
} from '../core/exposure.ts'
import type { PlusHautDuCreneau } from '../core/creneaux.ts'
import type { CielSousLaLune } from '../core/moon.ts'
import { explication, type Explication } from '../core/explain.ts'
import {
  conseilFiltre,
  recommandationsEquipement,
  type ConseilFiltre,
  type SortieRecommandations,
} from '../core/recommandations.ts'
import { K } from '../registry/constants.ts'
import type { ProfilOptique } from '../core/optics.ts'
import { masseAir } from '../core/site.ts'
import type { Traced } from '../core/traced.ts'
import type { TypeObjet, ObjetCielProfond } from '../data/deepsky.ts'
import type { Boitier, IsoRetenu, PointZeroSysteme } from '../data/equipment.ts'
import { LIBELLE_VERDICT_DETECTABILITE } from '../registry/libelles.ts'

/** Matériel and sky under which a cible is evaluated. */
export interface ContexteFiche {
  readonly optique: ProfilOptique
  readonly capteurHMm: number
  readonly pitchUm: number
  readonly ouvertureN: number
  readonly boitier: Boitier
  readonly zeroSysteme: PointZeroSysteme
  /** §7.2 — retained ISO, recommended by double gain or hand-picked. */
  readonly iso: IsoRetenu
  readonly sbCiel: number
  readonly mLimOeil: number | null
  /** Pose cap: monture with suivi (§5.2), or NPF pose without suivi (§9.1). */
  readonly tMaxS: number | null
  /** Declared Bortle class, when it is: conditions filtre advice (§7.5). */
  readonly bortle: number | null
  readonly suiviActif: boolean
  readonly focaleMm: number
}

/**
 * T-0089 — sky state under Lune retained by fiche. Never implicit: Lune evaluated at a named
 * instant, or not and fiche says why. Black site fond never passed off as night sky.
 */
export type LuneFiche =
  | { readonly evaluee: true; readonly instant: Date; readonly ciel: CielSousLaLune }
  | { readonly evaluee: false; readonly cause: string }

/**
 * T-0268 — what the night créneau imposes on fiche, nothing else.
 * DOSING masse d'air = plan de séance's: créneau mean (§7.6). Fiche used culmination = night's best
 * instant → always announced less time than capture needs (22 min where plan allots 23).
 * `plusHaut` = variant shown beside: floor reached shooting only around meridian. A quantified
 * lever, not the forecast.
 */
export interface CaptureNuit {
  readonly masseAir: Traced<number | null>
  /** §7.3 — créneau duration, decides nights count. `null` without créneau. */
  readonly dureeCreneauS: number | null
  /** §7.6 — créneau best instant, or `null` when night offers none. */
  readonly plusHaut: PlusHautDuCreneau | null
  /**
   * Engine cause when night offers NO créneau: relief, fenêtre, hauteur, cible never risen. Plan
   * and list écartent the cible; fiche still computed an integration from culmination — 24 h and
   * 1 108 poses under a « Créneau photo » section that had just said « cachée par le relief ».
   * `null` otherwise.
   */
  readonly exclusion: string | null
}

/** §7.6 — integration at créneau best instant: a floor, never the forecast. */
export interface Plancher {
  readonly plusHaut: PlusHautDuCreneau
  readonly extinction: FluxObjetReel
  readonly integration: PlanIntegration
}

export interface Resultat {
  /** §8.1 — sky under Lune as retained, or reason for its absence. */
  readonly lune: LuneFiche
  /** Sky fond actually used: site's, degraded by Lune if evaluated. */
  readonly sbCielEffectif: number
  /** `null` when catalogue gives no dimensions: §6.2 has nothing to say. */
  readonly cadrage: FicheCadrage | null
  readonly detect: Detectabilite
  readonly eCiel: Traced<number>
  readonly eObj: Traced<number> | null
  /**
   * §7.6 — atmospheric extinction on object flux, with masse d'air and height producing it.
   * Always present: a refusal is read, doesn't vanish.
   */
  readonly extinction: FluxObjetReel | null
  /** T-0268 — créneau best instant, the one the « plancher » variant quantifies. */
  readonly plusHaut: PlusHautDuCreneau | null
  readonly pose: PoseUnitaire | null
  /** Cause of the écart when night offers no créneau: nothing quantified then. */
  readonly exclusionCreneau: string | null
  readonly integration: PlanIntegration | null
  /**
   * T-0268 — same cible at créneau best instant only. `null` without créneau: only a convention
   * then, and a floor equal to forecast would suggest arbitration where none exists.
   */
  readonly plancher: Plancher | null
  readonly explique: Explication | null
}

export interface Conseils {
  readonly filtre: ConseilFiltre
  readonly recommandations: SortieRecommandations
}

/**
 * `permissif` = C-03 = 3 mode of §7.2: requested, never deduced from context (pose ÷3 is chosen,
 * not silent).
 */
export function evalue(
  contexte: ContexteFiche,
  objet: ObjetCielProfond,
  snrCible: number,
  iso: IsoRetenu,
  lune: LuneFiche,
  capture: CaptureNuit,
  permissif = false,
): Resultat {
  const fovHDeg = contexte.optique.fovHDeg.value
  // T-0089 — plan de séance doses pose under night's real sky (§8.1); fiche did it under black site
  // sky, announcing another pose for same cible. One fond de ciel now runs the chain.
  const sbCiel = lune.evaluee ? lune.ciel.sbCielEffectif : contexte.sbCiel
  const a = objet.majAxArcmin
  const b = objet.minAxArcmin
  const m = objet.vMag

  // No grand axe in catalogue → no cadrage, as plan de séance and cibles list. A zero size gives
  // 0 % fill, « trop petit » refusal and infinite focale: three verdicts on invented data, worse
  // than absence.
  const cadrage =
    a === null || a <= 0
      ? null
      : ficheCadrage({
          fovHDeg,
          echApx: contexte.optique.echApx.value,
          capteurHMm: contexte.capteurHMm,
          tailleMajArcmin: a,
          tailleMinArcmin: b,
          posAngDeg: objet.posAngDeg,
        })

  const detect = detectabilite({
    mInt: m,
    aArcmin: a,
    bArcmin: b,
    typeObjet: objet.type,
    sbCiel,
    mLimOeil: contexte.mLimOeil,
    dMm: contexte.optique.dMm.value,
    // §6.3 object-type Lune tolerance carried only if Lune evaluated: « Lune sous l'horizon »
    // uncomputed = gratuitous claim.
    ...(lune.evaluee
      ? {
          lune: {
            altitudeDeg: lune.ciel.altLuneDeg,
            separationDeg: lune.ciel.separationDeg,
          },
        }
      : {}),
  })

  const zpEstime = contexte.zeroSysteme.estime
  const eCiel = fluxCiel({
    sbMagArcsec2: sbCiel,
    zpSys: contexte.zeroSysteme.valeur,
    pitchUm: contexte.pitchUm,
    ouvertureN: contexte.ouvertureN,
    zpEstime,
  })

  const plusHaut = capture.plusHaut

  const sbObj = detect.sbObj.value
  if (sbObj === null) {
    return {
      lune,
      sbCielEffectif: sbCiel,
      cadrage,
      detect,
      eCiel,
      eObj: null,
      extinction: null,
      plusHaut,
      pose: null,
      exclusionCreneau: capture.exclusion,
      integration: null,
      plancher: null,
      explique: null,
    }
  }

  const eObj = fluxObjet({
    sbMagArcsec2: sbObj,
    zpSys: contexte.zeroSysteme.valeur,
    pitchUm: contexte.pitchUm,
    ouvertureN: contexte.ouvertureN,
    zpEstime,
  })
  // T-0268 — masse d'air from créneau, as `evalueCandidate`: fiche can't announce an integration
  // different from list and plan.
  const extinction = fluxObjetReel(eObj, capture.masseAir)
  const eObjReel = extinction.eObjReel.value

  // Extinction refused outside plane-approximation domain: chain stops, screen shows refusal, not
  // extrapolated integration (§7.6, hard bound).
  if (eObjReel === null) {
    return {
      lune,
      sbCielEffectif: sbCiel,
      cadrage,
      detect,
      eCiel,
      eObj,
      extinction,
      plusHaut,
      pose: null,
      exclusionCreneau: capture.exclusion,
      integration: null,
      plancher: null,
      explique: null,
    }
  }

  const pose = poseUnitaire({
    eCiel: eCiel.value,
    readNoiseE: iso.readNoiseE,
    tMaxS: contexte.tMaxS,
    zpEstime,
    permissif,
  })

  /**
   * T-0268 — no créneau: plan and list écartent the cible, so fiche has nothing to quantify. It
   * used to fall back to culmination: « 24 h, 1 108 poses » two blocks under « cachée par le
   * relief », contradicting its own « Créneau » section. POSE stays: depends only on fond de ciel
   * and boîtier, valid that night whatever the cible.
   */
  if (capture.exclusion !== null) {
    return {
      lune,
      sbCielEffectif: sbCiel,
      cadrage,
      detect,
      eCiel,
      eObj,
      extinction: null,
      plusHaut,
      pose,
      exclusionCreneau: capture.exclusion,
      integration: null,
      plancher: null,
      explique: null,
    }
  }

  // §7.3 — créneau duration decides nights count. Without it fiche stayed mute on an integration
  // not fitting one night, where plan said it.
  const integrationCommune = {
    eCiel: eCiel.value,
    tPoseS: pose.tAfficheeS,
    readNoiseE: pose.readNoiseUtiliseE,
    snrCible,
    tailleRawMo: contexte.boitier.tailleRawMo,
    ...(capture.dureeCreneauS === null ? {} : { dureeCreneauS: capture.dureeCreneauS }),
  }

  const integration = planIntegration({
    ...integrationCommune,
    eObj: eObjReel,
    eObjPlage: extinction.plageEObj,
  })

  const plancher = plancherAuMeilleurInstant(plusHaut, eObj, integrationCommune)

  return {
    lune,
    sbCielEffectif: sbCiel,
    cadrage,
    detect,
    eCiel,
    eObj,
    extinction,
    plusHaut,
    pose,
    exclusionCreneau: null,
    integration,
    plancher,
    explique: expliqueVerdict(contexte, objet, snrCible, {
      cadrage,
      detect,
      eCiel,
      eObj,
      extinction,
      hauteurEvaluationDeg: plusHaut?.altitudeDeg ?? null,
      pose,
      integration,
      sbObj,
      sbCiel,
    }),
  }
}

/**
 * T-0268, §7.6 — same cible, extinguished at créneau best instant only.
 * Not a second verdict: pose, fond de ciel, cible are the forecast's; only masse d'air changes.
 * Gap between durations = cost of shooting whole window vs meridian hour → quantified lever.
 * `null` without créneau: floor = forecast, same number under two labels suggests non-existent
 * arbitration.
 */
function plancherAuMeilleurInstant(
  plusHaut: PlusHautDuCreneau | null,
  eObj: Traced<number>,
  commun: Omit<Parameters<typeof planIntegration>[0], 'eObj' | 'eObjPlage'>,
): Plancher | null {
  if (plusHaut === null) return null
  const extinction = fluxObjetReel(eObj, masseAir(plusHaut.altitudeDeg))
  const eObjReel = extinction.eObjReel.value
  if (eObjReel === null) return null
  return {
    plusHaut,
    extinction,
    integration: planIntegration({
      ...commun,
      eObj: eObjReel,
      eObjPlage: extinction.plageEObj,
    }),
  }
}

/**
 * §10.2 explanation point: inputs `sensibilites` (core/explain.ts) perturbs one at a time to name
 * dominant factor. `masse_air` absent outside lunar evaluation (§7.6) — only optional field.
 */
interface PointExplicationFiche extends Readonly<Record<string, number>> {
  /** mag/arcsec² — object surface brightness, §6.3. */
  readonly sb_obj: number
  /** mag/arcsec² — fond de ciel surface brightness. */
  readonly sb_ciel: number
  /** s — recommended pose unitaire, §7.2. */
  readonly t_pose_s: number
  /** e⁻ — read noise retained for the pose. */
  readonly read_noise_e: number
  /** unitless — target SNR. */
  readonly snr_cible: number
  /** unitless — cible masse d'air, §7.6. */
  readonly masse_air?: number
}

/**
 * §10.2 — sensitivity on the verdict-carrying output: required integration duration. Fluxes
 * recomputed without domain guard so perturbing an input doesn't hit an input bound.
 */
function expliqueVerdict(
  contexte: ContexteFiche,
  objet: ObjetCielProfond,
  snrCible: number,
  r: {
    readonly cadrage: FicheCadrage | null
    readonly detect: Detectabilite
    readonly eCiel: Traced<number>
    readonly eObj: Traced<number>
    readonly extinction: FluxObjetReel
    readonly hauteurEvaluationDeg: number | null
    readonly pose: PoseUnitaire
    readonly integration: PlanIntegration
    readonly sbObj: number
    readonly sbCiel: number
  },
): Explication {
  // §7.6 — masse d'air enters sensitivity like other inputs: lets §10.2 name HAUTEUR dominant
  // factor when it is, not imply only cible decides pose time.
  const masseAirValeur = r.extinction.masseAir.value
  const point: PointExplicationFiche = {
    sb_obj: r.sbObj,
    sb_ciel: r.sbCiel,
    t_pose_s: r.pose.tAfficheeS,
    read_noise_e: r.pose.readNoiseUtiliseE,
    snr_cible: snrCible,
    ...(masseAirValeur === null ? {} : { masse_air: masseAirValeur }),
  }
  const sortie = (v: PointExplicationFiche): number =>
    integrationRequiseS(
      {
        eObj:
          fluxE(v.sb_obj, contexte.zeroSysteme.valeur, contexte.pitchUm, contexte.ouvertureN) *
          (v.masse_air === undefined ? 1 : attenuationBrute(v.masse_air)),
        eCiel: fluxE(v.sb_ciel, contexte.zeroSysteme.valeur, contexte.pitchUm, contexte.ouvertureN),
        tPoseS: v.t_pose_s,
        readNoiseE: v.read_noise_e,
        snrCible: v.snr_cible,
        tailleRawMo: contexte.boitier.tailleRawMo,
      },
      v.snr_cible,
    )

  return explication({
    verdictN1:
      `Visible ${r.detect.verdict === null ? '—' : LIBELLE_VERDICT_DETECTABILITE[r.detect.verdict]}` +
      ` — environ ${dureeLisible(r.integration.tRequisS.value)} de pose au total.`,
    phraseFacteur: r.detect.explication,
    etapes: [
      { libelle: 'Brillance de surface de l’objet', trace: r.detect.sbObj },
      { libelle: 'Contraste sur le fond de ciel', trace: r.detect.deltaSb },
      { libelle: 'Flux du fond de ciel', trace: r.eCiel },
      { libelle: 'Flux de l’objet', trace: r.eObj },
      { libelle: 'Masse d’air de la cible', trace: r.extinction.masseAir },
      { libelle: 'Atténuation atmosphérique', trace: r.extinction.attenuation },
      { libelle: 'Flux de l’objet reçu au capteur', trace: r.extinction.eObjReel },
      { libelle: 'Pose optimale', trace: r.pose.tOptS },
      { libelle: 'Pose retenue', trace: r.pose.tRecommandeS },
      { libelle: 'Intégration requise', trace: r.integration.tRequisS },
      { libelle: 'Nombre de poses', trace: r.integration.nPoses },
      { libelle: 'Volume de stockage', trace: r.integration.volumeGo },
    ],
    sortie,
    point,
    contexte: {
      verdict: r.detect.verdict,
      typeObjet: objet.type,
      cibleImposee: true,
      cadrageRefuse: r.cadrage?.faisable === false,
      // §7.6 — under imaging threshold créneau = quantified lever, not principle recommendation:
      // extinction doubles integration time there.
      hauteurFaible:
        r.hauteurEvaluationDeg !== null &&
        r.hauteurEvaluationDeg < K('SEUIL_HAUTEUR_IMAGERIE_DEG'),
    },
  })
}

/**
 * §7.5, §10.3 — conseil filtre and équipement recommendation computed only when explanation is
 * opened. Never banner, never spontaneous suggestion.
 */
export function conseilsCible(
  contexte: ContexteFiche,
  r: Resultat,
  entree: {
    readonly typeObjet: TypeObjet
    readonly snrCible: number
    readonly explicationDepliee: boolean
  },
): Conseils | null {
  if (r.pose === null || r.integration === null || r.eObj === null) return null
  const filtre = conseilFiltre({
    typeObjet: entree.typeObjet,
    bortle: contexte.bortle,
    // §7.5 — Lune degradation triggers conseil filtre like Bortle: emission nebula doable under
    // gibbous Lune with a bi-bande, said here.
    deltaSbLuneMag: r.lune.evaluee ? r.lune.ciel.delta.value : 0,
    // Without cadrage nothing says cadrage blocks: conseil filtre stays open.
    cadragePlanifiable: r.cadrage === null || r.cadrage.faisable,
    explicationDepliee: entree.explicationDepliee,
    eObj: r.eObj.value,
    eCiel: r.eCiel.value,
    tPoseS: r.pose.tAfficheeS,
    readNoiseE: r.pose.readNoiseUtiliseE,
    snrCible: entree.snrCible,
    tailleRawMo: contexte.boitier.tailleRawMo,
  })
  return {
    filtre,
    recommandations: recommandationsEquipement({
      conseilFiltre: filtre,
      verdictDefavorable: r.detect.verdict === 'PHOTO_SEULE' || r.cadrage?.faisable === false,
      explicationDepliee: entree.explicationDepliee,
      leviersPresentes: (r.explique?.leviers ?? []).map((l) => l.code),
      verdictCadrage: r.cadrage?.verdict ?? null,
      focaleActuelleMm: contexte.focaleMm,
      focaleIdealeMm: r.cadrage?.focaleIdealeMm?.value ?? null,
      nTuiles: r.cadrage?.nTuiles?.value ?? null,
      regimeLimiteSuivi: r.pose.regime === 'LIMITE_SUIVI',
      suiviActif: contexte.suiviActif,
      tOptS: r.pose.tOptS.value,
      tMaxSuiviS: contexte.tMaxS,
    }),
  }
}
