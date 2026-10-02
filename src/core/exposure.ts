/**
 * §7.1 flux du fond de ciel · §7.2 pose unitaire · §7.3 nombre de poses et intégration.
 *
 * Trois points du PRD sont câblés ici, parce qu'ils sont contre-intuitifs :
 *
 *   1. LE FLUX DE FOND DE CIEL PAR PIXEL NE DÉPEND PAS DU DIAMÈTRE. Il dépend du rapport
 *      d'ouverture et du pas des pixels. Deux setups de même f/N et même pitch collectent
 *      le même fond de ciel par pixel, quel que soit leur diamètre.
 *   2. UN CIEL PLUS NOIR EXIGE DES POSES PLUS LONGUES, pas plus courtes : t_opt ∝ 1 / E_ciel.
 *   3. SNR ∝ √T. Doubler la qualité quadruple le temps.
 *   4. §7.6 — LE FLUX DE L'OBJET EST ATTÉNUÉ PAR L'ATMOSPHÈRE, PAS LE FOND DE CIEL. Une
 *      magnitude de catalogue est hors atmosphère ; une brillance de fond de ciel est relevée
 *      au sol, donc déjà éteinte. Atténuer les deux compterait l'extinction deux fois.
 *
 * Et aucune calibration : le point zéro est livré par boîtier, en lecture seule. L'optimum
 * de pose est plat, la plage utile [t/2 ; t×2] absorbe l'incertitude (§2.3, §7.1).
 */

import { K, plageK } from '../registry/constants.ts'
import { dureeLisible, nombre } from '../registry/ecriture.ts'
import { valide, type DomaineId } from '../registry/domains.ts'
import { VALEURS_OBTURATEUR_S } from '../registry/verdicts.ts'
import type { Flag, Traced } from './traced.ts'
import { trace } from './traced.ts'
import { S_PAR_H } from './unites.ts'


// ---------------------------------------------------------------------------
// §7.1 — estimateur de flux
// ---------------------------------------------------------------------------

export interface EntreeFlux {
  readonly sbMagArcsec2: number
  readonly zpSys: number
  readonly pitchUm: number
  readonly ouvertureN: number
  /** Vrai quand le point zéro vient du générique C-14 : la sortie porte [ESTIMÉ] (§2.3). */
  readonly zpEstime?: boolean
}

/** Rapport de flux entre deux sources séparées de `deltaMag` magnitudes : loi de Pogson. */
export function rapportDeFlux(deltaMag: number): number {
  return K('BASE_MAGNITUDE') ** (-deltaMag / K('POGSON'))
}

/**
 * Conversion brute d'une brillance de surface en flux, sans garde de domaine. Réservée aux
 * usages où la valeur est déjà validée : notamment le calcul de sensibilité de §10.2, qui
 * perturbe légèrement chaque entrée et ne doit pas buter sur une borne.
 */
export function fluxE(sb: number, zpSys: number, pitchUm: number, ouvertureN: number): number {
  return rapportDeFlux(sb - zpSys) * (pitchUm / ouvertureN) ** 2
}

function flux(entree: EntreeFlux, champ: DomaineId, formula: 'FLUX_CIEL' | 'FLUX_OBJET'): Traced<number> {
  const sb = valide(champ, entree.sbMagArcsec2)
  const zpSys = valide('zp_sys', entree.zpSys)
  const pitchUm = valide('pitch_um', entree.pitchUm)
  const ouvertureN = valide('ouverture_N', entree.ouvertureN)

  const flags: Flag[] = entree.zpEstime === true ? ['ESTIME'] : []
  return trace({
    value: fluxE(sb, zpSys, pitchUm, ouvertureN),
    formula,
    inputs: { sb: sb, zp_sys: zpSys, pitch_um: pitchUm, ouverture_N: ouvertureN },
    constants: entree.zpEstime === true ? ['POGSON', 'ZP_SYS_GENERIQUE'] : ['POGSON'],
    flags,
    ...(entree.zpEstime === true
      ? {
          note: 'Sensibilité du matériel estimée : la pose conseillée reste fiable.',
        }
      : {}),
  })
}

/** Flux du fond de ciel, e⁻/s/px. Refuse une brillance hors du domaine plutôt qu'extrapoler. */
export function fluxCiel(entree: EntreeFlux): Traced<number> {
  return flux(entree, 'sb_ciel', 'FLUX_CIEL')
}

/** Flux de l'objet, e⁻/s/px, à partir de sa brillance de surface (§6.3). */
export function fluxObjet(entree: EntreeFlux): Traced<number> {
  return flux(entree, 'sb_obj', 'FLUX_OBJET')
}

// ---------------------------------------------------------------------------
// §7.6 — atténuation atmosphérique par masse d'air
// ---------------------------------------------------------------------------

/**
 * Fraction du flux qui survit à la traversée, pour une masse d'air donnée. Sans trace :
 * consommée telle quelle par l'analyse de sensibilité de §10.2, qui perturbe la masse d'air
 * comme les autres entrées et ne doit pas buter sur une garde de domaine.
 */
export function attenuationBrute(masseAirX: number, kExtinction = K('EXTINCTION_V_MAG_PAR_MASSE_AIR')): number {
  return rapportDeFlux(kExtinction * masseAirX)
}

export interface FluxObjetReel {
  /** La masse d'air d'évaluation, telle que l'appelant l'a choisie et doit l'afficher. */
  readonly masseAir: Traced<number | null>
  readonly attenuation: Traced<number | null>
  /** E_obj × atténuation. `null` quand l'atténuation est refusée : rien n'est extrapolé. */
  readonly eObjReel: Traced<number | null>
  /**
   * E_obj réel aux deux bornes de k. Toute sortie qui en dépend — l'intégration — porte sa
   * fourchette plutôt qu'une valeur exacte (§2.1) : k est un ordre de grandeur.
   */
  readonly plageEObj: readonly [number, number] | null
}

/**
 * §7.6 — le flux qui atteint réellement le capteur.
 *
 * Trois cas, tous nommés à l'écran, aucun silencieux :
 *
 *   1. masse d'air connue et dans le domaine → atténuation appliquée ;
 *   2. masse d'air hors du domaine de l'approximation plane (sous ~15° de hauteur) →
 *      atténuation REFUSÉE. L'extrapoler sous-estimerait l'extinction là où elle est la plus
 *      forte, ce qui est le sens de l'erreur le plus coûteux ;
 *   3. hauteur inconnue — la cible n'a pas été évaluée à un instant chiffrable → aucune
 *      atténuation, et la sortie porte [HYP] : la durée annoncée est alors un PLANCHER, pas
 *      une estimation.
 */
export function fluxObjetReel(
  eObj: Traced<number>,
  masseAirCible: Traced<number | null>,
): FluxObjetReel {
  const x = masseAirCible.value
  const inputs = { masse_air: x, e_obj: eObj.value }
  const constants = ['EXTINCTION_V_MAG_PAR_MASSE_AIR', 'POGSON', 'BASE_MAGNITUDE'] as const

  if (x === null) {
    const attenuation = trace({
      value: 1,
      formula: 'ATTENUATION_ATMOSPHERIQUE',
      inputs,
      constants,
      flags: ['HYP'],
      note:
        'Hauteur de la cible inconnue : le temps annoncé est un minimum. Choisissez la cible ' +
        'dans le catalogue pour un calcul complet.',
    })
    return {
      masseAir: masseAirCible,
      attenuation,
      eObjReel: trace({
        value: eObj.value,
        formula: 'FLUX_OBJET_REEL',
        inputs,
        flags: ['HYP'],
      }),
      plageEObj: null,
    }
  }

  if (masseAirCible.flags?.includes('HORS_DOMAINE') === true) {
    const note =
      `Cible sous ${K('HAUTEUR_MIN_MASSE_AIR_DEG')}° : trop basse pour chiffrer la perte. ` +
      'Attendez qu’elle monte.'
    return {
      masseAir: masseAirCible,
      attenuation: trace({
        value: null,
        formula: 'ATTENUATION_ATMOSPHERIQUE',
        inputs,
        constants,
        flags: ['HORS_DOMAINE'],
        note,
      }),
      eObjReel: trace({
        value: null,
        formula: 'FLUX_OBJET_REEL',
        inputs,
        flags: ['HORS_DOMAINE'],
        note,
      }),
      plageEObj: null,
    }
  }

  const attenuationValeur = attenuationBrute(x)
  const bornesK = plageK('EXTINCTION_V_MAG_PAR_MASSE_AIR')
  // Un k plus grand éteint davantage : la borne haute de k donne la borne BASSE du flux.
  const plageAttenuation =
    bornesK === null
      ? null
      : ([attenuationBrute(x, bornesK[1]), attenuationBrute(x, bornesK[0])] as const)

  return {
    masseAir: masseAirCible,
    attenuation: trace({
      value: attenuationValeur,
      formula: 'ATTENUATION_ATMOSPHERIQUE',
      inputs,
      constants,
      ...(plageAttenuation === null ? {} : { range: plageAttenuation }),
      note:
        `${nombre((1 - attenuationValeur) * 100, 0)} % de la lumière perdue dans l’air à ` +
        'cette hauteur. Plus la cible est haute, moins la pose totale est longue.',
    }),
    eObjReel: trace({
      value: eObj.value * attenuationValeur,
      formula: 'FLUX_OBJET_REEL',
      inputs,
      constants,
      ...(plageAttenuation === null
        ? {}
        : { range: [eObj.value * plageAttenuation[0], eObj.value * plageAttenuation[1]] as const }),
      ...(eObj.flags === undefined ? {} : { flags: eObj.flags }),
    }),
    plageEObj:
      plageAttenuation === null
        ? null
        : [eObj.value * plageAttenuation[0], eObj.value * plageAttenuation[1]],
  }
}

// ---------------------------------------------------------------------------
// §7.2 — pose unitaire optimale
// ---------------------------------------------------------------------------

export type RegimePose = 'NOMINAL' | 'LIMITE_SUIVI'

export interface EntreePose {
  readonly eCiel: number
  /** `null` quand la base matériel ne donne pas la courbe du boîtier : repli à 3 e⁻. */
  readonly readNoiseE: number | null
  /** Plafond de la monture (§5.2), ou pose NPF quand il n'y a pas de suivi (§9.1). */
  readonly tMaxS: number | null
  /** Mode permissif C-03 = 3 : ciel pollué, suivi imprécis, vent. */
  readonly permissif?: boolean
  readonly zpEstime?: boolean
}

export interface PoseUnitaire {
  readonly tOptS: Traced<number>
  readonly tRecommandeS: Traced<number>
  /** Arrondie à une valeur d'obturateur usuelle : un boîtier ne propose pas 13,43 s. */
  readonly tAfficheeS: number
  /** [t/2 ; t×2], présentée comme équivalente (§2.3). */
  readonly plageUtileS: Traced<readonly [number, number]>
  readonly regime: RegimePose
  /** T-0383 — t_opt tombe sur la plus courte vitesse : le fond de ciel limite, pas la monture. */
  readonly limiteeParCiel: boolean
  readonly message: string
  /** Perte de rapport signal sur bruit quand la monture bride la pose. */
  readonly perteSnrBridee?: number
  /**
   * Présente uniquement en mode permissif : pose obtenue, perte de SNR consentie et raison
   * d'usage. Le mode raccourcit la pose d'un facteur trois — il doit être choisi, jamais subi.
   */
  readonly notePermissif?: string
  readonly readNoiseUtiliseE: number
  readonly readNoiseEstime: boolean
}

/** Perte de rapport signal sur bruit consentie pour un facteur C donné (§2.3). */
function perteSnr(c: number): number {
  return 1 - Math.sqrt(c / (c + 1))
}

/**
 * T-0383 — la pose arrondie tombe sur la plus courte vitesse de la table : sous un ciel que la
 * Lune éclaire, t_opt peut passer sous la seconde, et « 1 s » se lirait comme un choix.
 */
function auPlancherObturateur(tS: number): boolean {
  return arrondiObturateur(tS) === Math.min(...VALEURS_OBTURATEUR_S)
}

/** Valeur d'obturateur usuelle la plus proche (§2.3). */
export function arrondiObturateur(tS: number): number {
  return VALEURS_OBTURATEUR_S.reduce((meilleure, valeur) =>
    Math.abs(valeur - tS) < Math.abs(meilleure - tS) ? valeur : meilleure,
  )
}

export function poseUnitaire(entree: EntreePose): PoseUnitaire {
  const readNoiseEstime = entree.readNoiseE === null
  const rn = readNoiseEstime ? K('READ_NOISE_DEFAUT_E') : valide('read_noise_e', entree.readNoiseE!)
  const constanteC = entree.permissif === true ? 'FACTEUR_POSE_C_PERMISSIF' : 'FACTEUR_POSE_C_DEFAUT'
  const tOpt = (K(constanteC) * rn ** 2) / entree.eCiel
  /** Ce que la pose vaudrait sans le mode permissif : le mode s'annonce avec son coût. */
  const tOptDefaut = (K('FACTEUR_POSE_C_DEFAUT') * rn ** 2) / entree.eCiel

  const flags: Flag[] = []
  if (readNoiseEstime || entree.zpEstime === true) flags.push('ESTIME')

  const tOptS = trace({
    value: tOpt,
    formula: 'POSE_OPTIMALE',
    inputs: { c_facteur: K(constanteC), read_noise_e: rn, e_ciel: entree.eCiel },
    constants: readNoiseEstime ? [constanteC, 'READ_NOISE_DEFAUT_E'] : [constanteC],
    flags,
    ...(readNoiseEstime
      ? {
          note:
            `Bruit de lecture inconnu : ${K('READ_NOISE_DEFAUT_E')} e⁻ par défaut.`,
        }
      : {}),
  })

  const tMax = entree.tMaxS
  const bride = tMax !== null && tMax < tOpt
  const tRecommande = bride ? tMax : tOpt
  const regime: RegimePose = bride ? 'LIMITE_SUIVI' : 'NOMINAL'
  const limiteeParCiel = !bride && auPlancherObturateur(tRecommande)

  // C effectif atteint quand la monture bride : E_ciel × t / RN², d'où la perte de §2.3.
  const cEffectif = bride ? (entree.eCiel * tMax) / rn ** 2 : K(constanteC)
  const perte = perteSnr(cEffectif)

  // PLAGE_UTILE_POSE (§2.3) : le facteur 2 EST la formule tracée ci-dessous, pas un seuil.
  const plage: readonly [number, number] = [Math.floor(tRecommande / 2), Math.floor(tRecommande * 2)]

  return {
    tOptS,
    tRecommandeS: trace({
      value: tRecommande,
      formula: 'POSE_RETENUE',
      inputs: { t_opt_s: tOpt, t_max_suivi_s: tMax },
      flags,
    }),
    tAfficheeS: arrondiObturateur(tRecommande),
    plageUtileS: trace({
      value: plage,
      formula: 'PLAGE_UTILE_POSE',
      inputs: { t_recommande_s: tRecommande },
      note:
        `${plage[0]} s, ${arrondiObturateur(tRecommande)} s ou ${plage[1]} s : même résultat.`,
    }),
    regime,
    limiteeParCiel,
    message: bride
      ? `La monture limite la pose : environ ${nombre(perte * 100, 0)} % de qualité perdue. ` +
        'Le grand champ reste possible.'
      : limiteeParCiel
        ? `Ciel très lumineux : dès ${nombre(tRecommande, 2)} s, le bruit du fond de ciel ` +
          'couvre celui du capteur.'
      : entree.permissif === true
        ? 'Pose raccourcie à votre demande : moins de photos perdues, un peu moins de qualité.'
        : 'Poser plus longtemps n’apporterait presque rien.',
    ...(bride ? { perteSnrBridee: perte } : {}),
    ...(entree.permissif === true
      ? {
          notePermissif:
            `${arrondiObturateur(tRecommande)} s au lieu de ${arrondiObturateur(tOptDefaut)} s, ` +
            `pour ${nombre(perte * 100, 1)} % de qualité perdue au lieu de ` +
            `${nombre(perteSnr(K('FACTEUR_POSE_C_DEFAUT')) * 100, 1)} %.`,
        }
      : {}),
    readNoiseUtiliseE: rn,
    readNoiseEstime,
  }
}

// ---------------------------------------------------------------------------
// §7.3 — nombre de poses et intégration totale
// ---------------------------------------------------------------------------

export interface EntreeIntegration {
  readonly eObj: number
  readonly eCiel: number
  readonly tPoseS: number
  readonly readNoiseE: number
  readonly snrCible: number
  readonly tailleRawMo: number
  /** Durée exploitable d'une nuit sur cette cible (§8.2). Absente : pas de découpe. */
  readonly dureeCreneauS?: number | null
  /**
   * §7.6 — E_obj réel aux deux bornes du coefficient d'extinction. Présente, l'intégration
   * s'affiche avec sa fourchette : k est un ordre de grandeur, donc la durée aussi (§2.1).
   */
  readonly eObjPlage?: readonly [number, number] | null
}

export interface PlanIntegration {
  readonly tRequisS: Traced<number>
  readonly nPoses: Traced<number>
  readonly volumeGo: Traced<number>
  readonly nNuits?: Traced<number>
  /** Vrai quand l'intégration dépasse le plafond : la cible est annoncée hors de portée. */
  readonly horsDePortee: boolean
  readonly loiFondamentale: string
  readonly messages: readonly string[]
}

/** Temps d'intégration total requis pour un rapport signal sur bruit visé (§7.3). */
export function integrationRequiseS(entree: EntreeIntegration, snrCible: number): number {
  const { eObj, eCiel, tPoseS, readNoiseE } = entree
  return (snrCible ** 2 * (eObj + eCiel + readNoiseE ** 2 / tPoseS)) / eObj ** 2
}

export function planIntegration(entree: EntreeIntegration): PlanIntegration {
  const snrCible = valide('snr_cible', entree.snrCible)
  const plafondS = K('INTEGRATION_PLAFOND_H') * S_PAR_H
  const requis = integrationRequiseS(entree, snrCible)
  const horsDePortee = !Number.isFinite(requis) || requis > plafondS
  const tRequis = horsDePortee ? plafondS : requis

  const nPosesValeur = Math.ceil(tRequis / entree.tPoseS)
  const volume = (nPosesValeur * entree.tailleRawMo) / K('MO_PAR_GO')
  const inputs = {
    snr_cible: snrCible,
    e_obj: entree.eObj,
    e_ciel: entree.eCiel,
    t_pose_s: entree.tPoseS,
    read_noise_e: entree.readNoiseE,
  }

  // Un E_obj plus faible allonge l'intégration : la borne basse du flux donne la borne
  // HAUTE de la durée. La fourchette n'a pas de sens quand l'affichage est déjà plafonné.
  const plageEObj = entree.eObjPlage ?? null
  const plageT =
    plageEObj === null || horsDePortee
      ? null
      : ([
          integrationRequiseS({ ...entree, eObj: plageEObj[1] }, snrCible),
          integrationRequiseS({ ...entree, eObj: plageEObj[0] }, snrCible),
        ] as const)

  const messages: string[] = []
  if (horsDePortee) {
    messages.push(
      `Plus de ${K('INTEGRATION_PLAFOND_H')} h de pose : hors de portée. Essayez un ciel ` +
        'plus noir ou une cible plus brillante.',
    )
  }
  const doubleSnr = integrationRequiseS(entree, snrCible * 2)
  if (Number.isFinite(doubleSnr)) {
    messages.push(
      `Qualité ${snrCible * 2} au lieu de ${snrCible} : ${dureeLisible(doubleSnr)}, ` +
        'quatre fois plus.',
    )
  }

  const creneau = entree.dureeCreneauS ?? null
  const nNuitsValeur = creneau !== null && creneau > 0 ? Math.ceil(tRequis / creneau) : null
  if (nNuitsValeur !== null && nNuitsValeur > 1) {
    messages.push(
      `À répartir sur ${nNuitsValeur} nuits, avec des darks à chaque nuit.`,
    )
  }
  messages.push(
    `Prévoir ${nombre(volume, 1)} Go de carte.`,
  )

  return {
    tRequisS: trace({
      value: tRequis,
      formula: 'INTEGRATION_REQUISE',
      inputs,
      ...(plageT === null ? {} : { range: plageT, constants: ['EXTINCTION_V_MAG_PAR_MASSE_AIR'] }),
      ...(horsDePortee
        ? {
            flags: ['HORS_DOMAINE' as const],
            note: 'Hors de portée avec ce matériel.',
          }
        : {}),
    }),
    nPoses: trace({
      value: nPosesValeur,
      formula: 'NOMBRE_POSES',
      inputs: { t_requis_s: tRequis, t_pose_s: entree.tPoseS },
    }),
    volumeGo: trace({
      value: volume,
      formula: 'VOLUME_STOCKAGE',
      inputs: { n_poses: nPosesValeur, taille_raw_mo: entree.tailleRawMo },
      constants: ['MO_PAR_GO'],
    }),
    ...(nNuitsValeur === null
      ? {}
      : {
          nNuits: trace({
            value: nNuitsValeur,
            formula: 'NOMBRE_NUITS',
            inputs: { t_requis_s: tRequis, duree_creneau_s: creneau },
          }),
        }),
    horsDePortee,
    loiFondamentale: 'Doubler la qualité demande quatre fois plus de temps.',
    messages,
  }
}

