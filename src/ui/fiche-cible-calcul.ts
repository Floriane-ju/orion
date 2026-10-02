/**
 * La chaîne de calcul de la fiche : d'une cible du catalogue jusqu'à « pose 13 s, 252 images,
 * 8,3 Go », en passant par §6.2 cadrage, §6.3 détectabilité et §7 pose.
 *
 * Aucune de ces fonctions ne connaît React : elles prennent des valeurs et rendent des
 * valeurs tracées. C'est ce qui rend la chaîne vérifiable de bout en bout.
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

/** Le matériel et le ciel sous lesquels une cible est évaluée. */
export interface ContexteFiche {
  readonly optique: ProfilOptique
  readonly capteurHMm: number
  readonly pitchUm: number
  readonly ouvertureN: number
  readonly boitier: Boitier
  readonly zeroSysteme: PointZeroSysteme
  /** §7.2 — l'ISO retenu, recommandé par le double gain ou choisi à la main. */
  readonly iso: IsoRetenu
  readonly sbCiel: number
  readonly mLimOeil: number | null
  /** Plafond de pose : monture avec suivi (§5.2), ou pose NPF sans suivi (§9.1). */
  readonly tMaxS: number | null
  /** Classe Bortle déclarée, quand elle l'est : elle conditionne le conseil filtre (§7.5). */
  readonly bortle: number | null
  readonly suiviActif: boolean
  readonly focaleMm: number
}

/**
 * T-0089 — l'état du ciel sous la Lune retenu par la fiche. Jamais implicite : soit la Lune
 * est évaluée à un instant nommé, soit elle ne l'est pas et la fiche dit pourquoi. Le fond
 * de ciel noir du site n'est jamais présenté comme le ciel de la nuit sans le dire.
 */
export type LuneFiche =
  | { readonly evaluee: true; readonly instant: Date; readonly ciel: CielSousLaLune }
  | { readonly evaluee: false; readonly cause: string }

/**
 * T-0268 — ce que le créneau de la nuit impose à la fiche, et rien d'autre.
 *
 * La masse d'air qui DOSE est celle du plan de séance : la moyenne du créneau (§7.6). La fiche
 * chiffrait la culmination, donc le meilleur instant de la nuit, et annonçait systématiquement
 * moins de temps que la capture n'en demande — 22 min là où le plan en alloue 23.
 *
 * `plusHaut` porte la variante affichée à côté : le plancher qu'on atteint en ne shootant
 * qu'autour du méridien. C'est un levier chiffré, pas la prévision.
 */
export interface CaptureNuit {
  readonly masseAir: Traced<number | null>
  /** §7.3 — la durée du créneau, qui décide du nombre de nuits. `null` sans créneau. */
  readonly dureeCreneauS: number | null
  /** §7.6 — le meilleur instant du créneau, ou `null` quand la nuit n'en offre aucun. */
  readonly plusHaut: PlusHautDuCreneau | null
  /**
   * La cause du moteur quand la nuit n'offre AUCUN créneau : relief, fenêtre, hauteur, cible
   * jamais levée. Le plan et la liste écartent alors la cible ; la fiche chiffrait quand même
   * une intégration, en repliant sur la culmination — 24 h et 1 108 poses affichées sous une
   * section « Créneau photo » qui venait de dire « cachée par le relief ». `null` sinon.
   */
  readonly exclusion: string | null
}

/** §7.6 — l'intégration au meilleur instant du créneau : un plancher, jamais la prévision. */
export interface Plancher {
  readonly plusHaut: PlusHautDuCreneau
  readonly extinction: FluxObjetReel
  readonly integration: PlanIntegration
}

export interface Resultat {
  /** §8.1 — le ciel sous la Lune tel qu'il a été retenu, ou la raison de son absence. */
  readonly lune: LuneFiche
  /** Fond de ciel effectivement employé : celui du site, dégradé par la Lune si elle l'est. */
  readonly sbCielEffectif: number
  /** `null` quand le catalogue ne donne pas les dimensions : §6.2 n'a alors rien à dire. */
  readonly cadrage: FicheCadrage | null
  readonly detect: Detectabilite
  readonly eCiel: Traced<number>
  readonly eObj: Traced<number> | null
  /**
   * §7.6 — l'extinction atmosphérique appliquée au flux de l'objet, avec la masse d'air et
   * la hauteur qui la produisent. Toujours présente : un refus se lit, il ne disparaît pas.
   */
  readonly extinction: FluxObjetReel | null
  /** T-0268 — le meilleur instant du créneau, celui que la variante « plancher » chiffre. */
  readonly plusHaut: PlusHautDuCreneau | null
  readonly pose: PoseUnitaire | null
  /** La cause de l'écart quand la nuit n'offre aucun créneau : rien n'est alors chiffré. */
  readonly exclusionCreneau: string | null
  readonly integration: PlanIntegration | null
  /**
   * T-0268 — la même cible au seul meilleur instant du créneau. `null` quand la nuit n'a pas
   * de créneau : il n'y a alors qu'une convention, et annoncer un plancher égal à la
   * prévision ferait croire à un arbitrage là où il n'y en a pas.
   */
  readonly plancher: Plancher | null
  readonly explique: Explication | null
}

export interface Conseils {
  readonly filtre: ConseilFiltre
  readonly recommandations: SortieRecommandations
}

/**
 * `permissif` est le mode C-03 = 3 de §7.2 : il n'est jamais déduit du contexte, il est
 * demandé. Une pose divisée par trois se choisit, elle ne s'applique pas en silence.
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
  // T-0089 — le plan de séance dose la pose sous le ciel réel de la nuit (§8.1) ; la fiche
  // le faisait sous le ciel noir du site, et annonçait donc une autre pose pour la même
  // cible. Un seul fond de ciel traverse maintenant toute la chaîne.
  const sbCiel = lune.evaluee ? lune.ciel.sbCielEffectif : contexte.sbCiel
  const a = objet.majAxArcmin
  const b = objet.minAxArcmin
  const m = objet.vMag

  // Sans grand axe au catalogue, aucun cadrage n'est produit — comme le plan de séance et la
  // liste de cibles le font déjà. Substituer une taille nulle donnerait un remplissage de 0 %,
  // un refus « trop petit » et une focale nécessaire infinie : trois verdicts sur une donnée
  // inventée, ce qui est pire que l'absence.
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
    // La tolérance lunaire du type d'objet (§6.3) n'est portée que si la Lune est évaluée :
    // annoncer « Lune sous l'horizon » sans l'avoir calculée serait une affirmation gratuite.
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
  // T-0268 — la masse d'air vient du créneau, comme dans `evalueCandidate` : c'est ce qui rend
  // la fiche incapable d'annoncer une autre intégration que la liste et le plan.
  const extinction = fluxObjetReel(eObj, capture.masseAir)
  const eObjReel = extinction.eObjReel.value

  // Extinction refusée hors du domaine de l'approximation plane : la chaîne s'arrête là,
  // et l'écran affiche le refus plutôt qu'une intégration extrapolée (§7.6, borne dure).
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
   * T-0268 — la nuit n'offre aucun créneau : le plan et la liste écartent la cible, la fiche
   * n'a donc rien à chiffrer non plus. Elle repliait sur la culmination et affichait « 24 h,
   * 1 108 poses » deux blocs sous « cachée par le relief » — sa propre section « Créneau »
   * la contredisait. La POSE reste, elle : elle ne tient qu'au fond de ciel et au boîtier,
   * et vaut cette nuit-là quelle que soit la cible.
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

  // §7.3 — la durée du créneau décide du nombre de nuits. Sans elle, la fiche restait muette
  // sur une intégration qui ne tient pas dans une nuit, là où le plan le disait.
  const integrationCommune = {
    eCiel: eCiel.value,
    tPoseS: pose.tRecommandeS.value,
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
 * T-0268, §7.6 — la même cible, éteinte au seul meilleur instant du créneau.
 *
 * Ce n'est pas un second verdict : la pose, le fond de ciel et la cible sont ceux de la
 * prévision, seule la masse d'air change. L'écart entre les deux durées est ce que coûte le
 * fait de shooter toute la fenêtre plutôt que l'heure du méridien — donc un levier chiffré.
 *
 * `null` sans créneau : le plancher vaudrait alors la prévision, et deux fois le même nombre
 * sous deux libellés différents fait croire à un arbitrage qui n'existe pas.
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
 * Le point d'explication §10.2 : les entrées que `sensibilites` (core/explain.ts) perturbe
 * une à la fois pour désigner le facteur dominant. `masse_air` est absente hors évaluation
 * lunaire (§7.6) — c'est le seul champ optionnel.
 */
interface PointExplicationFiche extends Readonly<Record<string, number>> {
  /** mag/arcsec² — brillance de surface de l'objet, §6.3. */
  readonly sb_obj: number
  /** mag/arcsec² — brillance de surface du fond de ciel. */
  readonly sb_ciel: number
  /** s — pose unitaire recommandée, §7.2. */
  readonly t_pose_s: number
  /** e⁻ — bruit de lecture retenu pour la pose. */
  readonly read_noise_e: number
  /** sans unité — SNR visé. */
  readonly snr_cible: number
  /** sans unité — masse d'air de la cible, §7.6. */
  readonly masse_air?: number
}

/**
 * §10.2 — la sensibilité est calculée sur la sortie qui porte le verdict : la durée
 * d'intégration requise. Les flux sont recalculés sans garde de domaine, pour que la
 * perturbation d'une entrée ne bute pas sur une borne de saisie.
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
  // §7.6 — la masse d'air entre dans la sensibilité comme les autres entrées : c'est ce qui
  // permet à §10.2 de désigner la HAUTEUR comme facteur dominant quand elle l'est, plutôt
  // que de laisser croire que seule la cible décide du temps de pose.
  const masseAirValeur = r.extinction.masseAir.value
  const point: PointExplicationFiche = {
    sb_obj: r.sbObj,
    sb_ciel: r.sbCiel,
    t_pose_s: r.pose.tRecommandeS.value,
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
      // §7.6 — sous le seuil d'imagerie, le créneau devient un levier chiffré et non une
      // recommandation de principe : l'extinction y double le temps d'intégration.
      hauteurFaible:
        r.hauteurEvaluationDeg !== null &&
        r.hauteurEvaluationDeg < K('SEUIL_HAUTEUR_IMAGERIE_DEG'),
    },
  })
}

/**
 * §7.5 et §10.3 — le conseil filtre et la recommandation d'équipement ne sont calculés qu'à
 * l'ouverture de l'explication. Jamais de bandeau, jamais de suggestion spontanée.
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
    // §7.5 — la dégradation lunaire déclenche le conseil filtre au même titre que le
    // Bortle : une nébuleuse en émission reste faisable sous Lune gibbeuse avec un
    // bi-bande, et c'est là que ça se dit.
    deltaSbLuneMag: r.lune.evaluee ? r.lune.ciel.delta.value : 0,
    // Sans cadrage, rien ne dit que le cadrage bloque : le conseil filtre reste ouvert.
    cadragePlanifiable: r.cadrage === null || r.cadrage.faisable,
    explicationDepliee: entree.explicationDepliee,
    eObj: r.eObj.value,
    eCiel: r.eCiel.value,
    tPoseS: r.pose.tRecommandeS.value,
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
