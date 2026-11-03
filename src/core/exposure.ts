/**
 * §7.1 fond de ciel flux · §7.2 pose unitaire · §7.3 number of poses and intégration.
 *
 * Counter-intuitive PRD points:
 *   1. SKY-BACKGROUND FLUX PER PIXEL IS DIAMETER-INDEPENDENT: depends on aperture ratio and
 *      pixel pitch. Same f/N and pitch → same fond de ciel per pixel, whatever the diameter.
 *   2. DARKER SKY NEEDS LONGER POSES: t_opt ∝ 1 / E_ciel.
 *   3. SNR ∝ √T: doubling quality quadruples time.
 *   4. §7.6 — OBJECT FLUX IS ATTENUATED BY ATMOSPHERE, NOT FOND DE CIEL. Catalogue magnitude is
 *      out of atmosphere; sky brillance is measured at ground, already extinct → attenuating
 *      both counts extinction twice.
 *
 * No calibration: zero point shipped per boîtier, read-only. Pose optimum is flat, useful
 * range [t/2 ; t×2] absorbs uncertainty (§2.3, §7.1).
 */

import { K, plageK } from '../registry/constants.ts'
import { dureeLisible, nombre } from '../registry/ecriture.ts'
import { valide, type DomaineId } from '../registry/domains.ts'
import { VALEURS_OBTURATEUR_S } from '../registry/verdicts.ts'
import type { Flag, Traced } from './traced.ts'
import { trace } from './traced.ts'
import { S_PAR_H } from './unites.ts'


// ---------------------------------------------------------------------------
// §7.1 — flux estimator
// ---------------------------------------------------------------------------

export interface EntreeFlux {
  readonly sbMagArcsec2: number
  readonly zpSys: number
  readonly pitchUm: number
  readonly ouvertureN: number
  /** True when zero point comes from generic C-14: output carries [ESTIMÉ] (§2.3). */
  readonly zpEstime?: boolean
}

/** Flux ratio between two sources `deltaMag` magnitudes apart: Pogson law. */
export function rapportDeFlux(deltaMag: number): number {
  return K('BASE_MAGNITUDE') ** (-deltaMag / K('POGSON'))
}

/**
 * Raw surface-brillance → flux conversion, no domain guard. For callers with validated values:
 * notably §10.2 sensitivity, which perturbs each input slightly and must not hit a bound.
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

/** Fond de ciel flux, e⁻/s/px. Refuses out-of-domain brillance instead of extrapolating. */
export function fluxCiel(entree: EntreeFlux): Traced<number> {
  return flux(entree, 'sb_ciel', 'FLUX_CIEL')
}

/** Object flux, e⁻/s/px, from its brillance de surface (§6.3). */
export function fluxObjet(entree: EntreeFlux): Traced<number> {
  return flux(entree, 'sb_obj', 'FLUX_OBJET')
}

// ---------------------------------------------------------------------------
// §7.6 — atmospheric attenuation by masse d'air
// ---------------------------------------------------------------------------

/**
 * Flux fraction surviving the crossing, per masse d'air. No trace: consumed as-is by §10.2
 * sensitivity, which perturbs masse d'air like other inputs and must not hit a domain guard.
 */
export function attenuationBrute(masseAirX: number, kExtinction = K('EXTINCTION_V_MAG_PAR_MASSE_AIR')): number {
  return rapportDeFlux(kExtinction * masseAirX)
}

export interface FluxObjetReel {
  /** Evaluation masse d'air, as the caller chose it and must display it. */
  readonly masseAir: Traced<number | null>
  readonly attenuation: Traced<number | null>
  /** E_obj × attenuation. `null` when attenuation refused: nothing extrapolated. */
  readonly eObjReel: Traced<number | null>
  /**
   * Real E_obj at both k bounds. Outputs depending on it (intégration) carry a range, not an
   * exact value (§2.1): k is an order of magnitude.
   */
  readonly plageEObj: readonly [number, number] | null
}

/**
 * §7.6 — flux actually reaching the sensor. 3 cases, all named on screen:
 *   1. masse d'air known, in domain → attenuation applied;
 *   2. masse d'air outside plane-approximation domain (hauteur < ~15°) → attenuation REFUSED:
 *      extrapolating underestimates extinction where strongest, the costlier error direction;
 *   3. hauteur unknown (cible not evaluated at a computable instant) → no attenuation, output
 *      carries [HYP]: announced duration is a FLOOR, not an estimate.
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
  // Larger k extinguishes more: k upper bound gives flux LOWER bound.
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
// §7.2 — optimal pose unitaire
// ---------------------------------------------------------------------------

export type RegimePose = 'NOMINAL' | 'LIMITE_SUIVI'

export interface EntreePose {
  readonly eCiel: number
  /** `null` when matériel base lacks the boîtier curve: fallback 3 e⁻. */
  readonly readNoiseE: number | null
  /** Mount cap (§5.2), or NPF pose when no suivi (§9.1). */
  readonly tMaxS: number | null
  /** Permissive mode C-03 = 3: polluted sky, imprecise suivi, wind. */
  readonly permissif?: boolean
  readonly zpEstime?: boolean
}

export interface PoseUnitaire {
  readonly tOptS: Traced<number>
  readonly tRecommandeS: Traced<number>
  /** Rounded to a usual shutter value: a boîtier doesn't offer 13,43 s. */
  readonly tAfficheeS: number
  /** [t/2 ; t×2], presented as equivalent (§2.3). */
  readonly plageUtileS: Traced<readonly [number, number]>
  readonly regime: RegimePose
  /** T-0383 — t_opt lands on shortest speed: fond de ciel limits, not the mount. */
  readonly limiteeParCiel: boolean
  readonly message: string
  /** SNR loss when the mount caps pose. */
  readonly perteSnrBridee?: number
  /**
   * Permissive mode only: pose obtained, accepted SNR loss, reason. Mode shortens pose ×3 —
   * must be chosen, never suffered.
   */
  readonly notePermissif?: string
  readonly readNoiseUtiliseE: number
  readonly readNoiseEstime: boolean
}

/** SNR loss accepted for a given factor C (§2.3). */
function perteSnr(c: number): number {
  return 1 - Math.sqrt(c / (c + 1))
}

/**
 * T-0383 — rounded pose lands on table's shortest speed: under a Lune-lit sky t_opt can drop
 * below 1 s, and "1 s" would read as a choice.
 */
function auPlancherObturateur(tS: number): boolean {
  return arrondiObturateur(tS) === Math.min(...VALEURS_OBTURATEUR_S)
}

/** Nearest usual shutter value (§2.3). */
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
  /** What the pose would be without permissive mode: mode announces its cost. */
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

  // Effective C reached when mount caps: E_ciel × t / RN², hence §2.3 loss.
  const cEffectif = bride ? (entree.eCiel * tMax) / rn ** 2 : K(constanteC)
  const perte = perteSnr(cEffectif)

  // PLAGE_UTILE_POSE (§2.3): factor 2 IS the formula traced below, not a threshold.
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
// §7.3 — number of poses and total intégration
// ---------------------------------------------------------------------------

export interface EntreeIntegration {
  readonly eObj: number
  readonly eCiel: number
  readonly tPoseS: number
  readonly readNoiseE: number
  readonly snrCible: number
  readonly tailleRawMo: number
  /** Usable night duration on this cible (§8.2). Absent: no splitting. */
  readonly dureeCreneauS?: number | null
  /**
   * §7.6 — real E_obj at both extinction-coefficient bounds. Present → intégration shown with
   * its range (k order of magnitude → so is duration, §2.1).
   */
  readonly eObjPlage?: readonly [number, number] | null
}

export interface PlanIntegration {
  readonly tRequisS: Traced<number>
  readonly nPoses: Traced<number>
  readonly volumeGo: Traced<number>
  readonly nNuits?: Traced<number>
  /** True when intégration exceeds the cap: cible announced out of reach. */
  readonly horsDePortee: boolean
  readonly loiFondamentale: string
  readonly messages: readonly string[]
}

/** Total intégration time required for a target SNR (§7.3). */
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

  // Lower E_obj lengthens intégration: flux lower bound → duration UPPER bound. Range
  // meaningless once display is already capped.
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

