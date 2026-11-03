/**
 * §8.3 — what decides whether a target enters the plan, before any time allocation.
 * Two stages, cheap → costly: hard-constraint pre-filter (arithmetic only), then full candidate
 * evaluation (ephemerides, §6/§7 engines). Every exclusion names its cause.
 */

import { K } from '../registry/constants.ts'
import { degres, nombre } from '../registry/ecriture.ts'
import { SaisieRefuseeError } from '../registry/domains.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { REMPLISSAGE_MIN_PLANIFIABLE, VERDICTS_PLANIFIABLES } from '../registry/verdicts.ts'
import {
  creneauCible,
  type CreneauCible,
  type EntreeCreneau,
  type Intervalle,
} from './creneaux.ts'
import { detectabilite, modulationDuType } from './detectability.ts'
import { ficheCadrage } from './cadrage.ts'
import { fluxCiel, fluxObjet, fluxObjetReel, planIntegration, poseUnitaire } from './exposure.ts'
import { cielSousLaLune, type CielSousLaLune } from './moon.ts'
import { altitudeCulmination } from './site.ts'
import {
  scoreCadrage,
  scoreFenetre,
  scoreGlobal,
  scoreHauteur,
  scoreLune,
  scoreSignal,
} from './session-score.ts'
import type {
  Candidate,
  CauseEcart,
  CibleEcartee,
  ContexteDe,
  ContexteSession,
  DetailScore,
  PoidsScoring,
} from './session-types.ts'
import { ARCMIN_PAR_DEG, DEG_PAR_HEURE, MIN_PAR_H, S_PAR_MIN } from './unites.ts'


/**
 * §8.1 — Moon evaluated at target créneau middle: degradation representative of the session, not
 * an arbitrary night instant. Exported: plan convention other screens reuse.
 */
export function instantLune(creneau: CreneauCible, repli: Date): Date {
  const premier = creneau.creneaux[0]
  const dernier = creneau.creneaux[creneau.creneaux.length - 1]
  if (premier === undefined || dernier === undefined) return repli
  return new Date((premier.debut.getTime() + dernier.fin.getTime()) / 2)
}

/**
 * §8.2 — target créneau input as the plan builds it. T-0222: fiche shows this créneau; rebuilding
 * input elsewhere risks differing threshold/mount → two créneaux for one target.
 */
export function entreeCreneau(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
  fenetre: Intervalle,
): EntreeCreneau {
  return {
    site: contexte.site,
    adH: objet.adDeg / DEG_PAR_HEURE,
    decDeg: objet.decDeg,
    fenetre,
    masque: contexte.masque,
    typeMonture: contexte.typeMonture,
    ...(contexte.seuilHauteurDeg === undefined ? {} : { seuilHauteurDeg: contexte.seuilHauteurDeg }),
  }
}

function creneauVide(creneau: CreneauCible): boolean {
  return creneau.causeExclusion !== undefined || creneau.dureeTotaleMin.value <= 0
}

/** Moon degradation at créneau middle, on target — §8.1 convention. */
function lunePourCreneau(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
  creneau: CreneauCible,
  fenetre: Intervalle,
  sbCielBase: number,
): CielSousLaLune {
  return cielSousLaLune({
    site: contexte.site,
    instant: instantLune(creneau, fenetre.debut),
    adH: objet.adDeg / DEG_PAR_HEURE,
    decDeg: objet.decDeg,
    altitudeCibleDeg: creneau.altCulminationDeg.value,
    sbCielNoirMag: sbCielBase,
  })
}

export interface CreneauLunaire {
  readonly creneau: CreneauCible
  /** Exclusion sentence when Moon hinders a Moon-set-only target's whole passage. */
  readonly exclusionLune: string | null
}

/**
 * §8.1 — "FENÊTRE UTILE = nuit_noire ∩ (Lune sous l'horizon OU tolérance du type)".
 * LOW tolerance (galaxy, reflection, dark — §6.3) under a really hindering Moon: shot only with
 * Moon set → créneau ∩ fenêtre utile. Nothing left → Moon = exclusion cause. Other tolerances
 * keep whole night; Moon costs points and integration time, not possibility.
 * Exported: fiche must hold the SAME créneau as plan (T-0268).
 */
export function creneauSousLaLune(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
  fenetre: Intervalle,
  sbCielBase: number,
): CreneauLunaire {
  const creneau = creneauCible(entreeCreneau(contexte, objet, fenetre))
  const modulation = modulationDuType(objet.type)
  if (creneauVide(creneau) || modulation.toleranceLune !== 'FAIBLE') {
    return { creneau, exclusionLune: null }
  }
  const { delta } = lunePourCreneau(contexte, objet, creneau, fenetre, sbCielBase)
  if (delta.value <= K('SEUIL_GENE_LUNE_DELTA_SB_MAG')) return { creneau, exclusionLune: null }

  const exclusionLune =
    `Lune trop gênante pendant tout son passage (ciel plus clair de ` +
    `${nombre(delta.value, 1)} mag/arcsec²). ${modulation.conseil}`
  const { debut, fin } = contexte.fenetreUtile
  const debutUtile = debut === null ? null : Math.max(debut.getTime(), fenetre.debut.getTime())
  const finUtile = fin === null ? null : Math.min(fin.getTime(), fenetre.fin.getTime())
  if (debutUtile === null || finUtile === null || finUtile <= debutUtile) {
    return { creneau, exclusionLune }
  }
  const sansLune = creneauCible(
    entreeCreneau(contexte, objet, { debut: new Date(debutUtile), fin: new Date(finUtile) }),
  )
  return creneauVide(sansLune)
    ? { creneau, exclusionLune }
    : { creneau: sansLune, exclusionLune: null }
}

/** Exclusion code of a refused créneau: cause comes from the engine, not here. */
function codeExclusionCreneau(creneau: CreneauCible): CauseEcart {
  if (creneau.causeExclusion === 'HAUTEUR' || creneau.causeExclusion === 'JAMAIS_LEVE') {
    return 'HAUTEUR'
  }
  return creneau.causeExclusion === 'RELIEF' ? 'RELIEF' : 'FENETRE'
}

/**
 * One target, evaluated end to end, or excluded naming its cause.
 * Domain refusal handled HERE, not by caller. A §7 engine refuses out-of-range input by THROWING
 * (its contract) but refusal is per-TARGET: bubbling drops the whole screen on one catalogue
 * object, forbidden by §12.5. A 100’ dark nebula at mag 14 exceeds the 26 mag/as² domain; other
 * targets keep their pose.
 * Guard was in `planSession` alone; both callers need it — §6.4 catalogue list arrived without
 * and crashed once a 300 mm optic narrowed the cadrage window enough to admit such objects.
 */
export function evalueCandidate(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
  fenetre: Intervalle,
  sbCielBase: number,
  poids: PoidsScoring,
): Candidate | CibleEcartee {
  try {
    return evalue(contexte, objet, fenetre, sbCielBase, poids)
  } catch (erreur) {
    if (!(erreur instanceof SaisieRefuseeError)) throw erreur
    return { designation: objet.designation, code: 'HORS_PORTEE', cause: erreur.message }
  }
}

function evalue(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
  fenetre: Intervalle,
  sbCielBase: number,
  poids: PoidsScoring,
): Candidate | CibleEcartee {
  const majAxArcmin = objet.majAxArcmin
  // §6.3 compares SB_obj to §2.2 fond de ciel, a V brightness. A B magnitude taken for V enters
  // with no colour term, and B−V isn't constant — on an emission nebula it depends on line ratio.
  // NGC7000, NGC1499, NGC6960, NGC3372 carry only B: excluded for lack of usable measure, not
  // oversight. Needs a source, not a conversion (T-0317).
  if (majAxArcmin === null || objet.vMag === null) {
    return {
      designation: objet.designation,
      code: 'DONNEE_MANQUANTE',
      cause:
        'Taille ou magnitude inconnue : pas de verdict possible.',
    }
  }

  const cadrage = ficheCadrage({
    fovHDeg: contexte.fovHDeg,
    echApx: contexte.echApx,
    capteurHMm: contexte.capteurHMm,
    tailleMajArcmin: majAxArcmin,
    tailleMinArcmin: objet.minAxArcmin,
    posAngDeg: objet.posAngDeg,
  })
  if (!cadrage.faisable || !VERDICTS_PLANIFIABLES.includes(cadrage.verdict)) {
    return {
      designation: objet.designation,
      code: 'CADRAGE',
      cause:
        (cadrage.cause ?? cadrage.message) +
        (cadrage.verdict === 'MOSAIQUE_REQUISE'
          ? ' Une mosaïque ne tient pas dans une nuit.'
          : ''),
    }
  }

  const { creneau, exclusionLune } = creneauSousLaLune(contexte, objet, fenetre, sbCielBase)
  if (creneauVide(creneau)) {
    return {
      designation: objet.designation,
      code: codeExclusionCreneau(creneau),
      cause: creneau.message,
    }
  }
  if (exclusionLune !== null) {
    return { designation: objet.designation, code: 'LUNE', cause: exclusionLune }
  }

  const { delta, sbCielEffectif, altLuneDeg, separationDeg } = lunePourCreneau(
    contexte,
    objet,
    creneau,
    fenetre,
    sbCielBase,
  )

  const detect = detectabilite({
    mInt: objet.vMag,
    aArcmin: majAxArcmin,
    bArcmin: objet.minAxArcmin,
    typeObjet: objet.type,
    sbCiel: sbCielEffectif,
    mLimOeil: contexte.mLimOeil,
    dMm: contexte.dMm,
    lune: { altitudeDeg: altLuneDeg, separationDeg },
  })
  const sbObj = detect.sbObj.value
  if (sbObj === null) {
    return {
      designation: objet.designation,
      code: 'DONNEE_MANQUANTE',
      cause: detect.explication,
    }
  }

  const fluxCommun = {
    zpSys: contexte.zpSys,
    pitchUm: contexte.pitchUm,
    ouvertureN: contexte.ouvertureN,
    zpEstime: contexte.zpEstime,
  }
  const eCiel = fluxCiel({ sbMagArcsec2: sbCielEffectif, ...fluxCommun })
  const eObj = fluxObjet({ sbMagArcsec2: sbObj, ...fluxCommun })
  // §7.6 — plan knows the créneau: retained masse d'air = its MEAN, not culmination's (real
  // capture cost, higher than night's best instant). fond de ciel keeps its ground-measured value.
  const extinction = fluxObjetReel(eObj, creneau.masseAirMoyenne)
  const eObjReel = extinction.eObjReel.value
  if (eObjReel === null) {
    return {
      designation: objet.designation,
      code: 'HAUTEUR',
      cause: extinction.eObjReel.note ?? 'Cible trop basse.',
    }
  }
  const pose = poseUnitaire({
    eCiel: eCiel.value,
    readNoiseE: contexte.readNoiseE,
    tMaxS: contexte.tMaxS,
    zpEstime: contexte.zpEstime,
  })
  const integration = planIntegration({
    eObj: eObjReel,
    eCiel: eCiel.value,
    tPoseS: pose.tAfficheeS,
    readNoiseE: pose.readNoiseUtiliseE,
    snrCible: contexte.snrCible,
    tailleRawMo: contexte.tailleRawMo,
    dureeCreneauS: creneau.dureeTotaleMin.value * S_PAR_MIN,
    eObjPlage: extinction.plageEObj,
  })
  if (integration.horsDePortee) {
    return {
      designation: objet.designation,
      code: 'HORS_PORTEE',
      cause: integration.messages[0] ?? 'Cible hors de portée de ce setup.',
    }
  }

  const tRequisMin = integration.tRequisS.value / S_PAR_MIN
  const detailScore: DetailScore = {
    cadrage: scoreCadrage(cadrage.remplissage.value),
    hauteur: scoreHauteur(creneau.altCulminationDeg.value),
    signal: scoreSignal(creneau.dureeTotaleMin.value, tRequisMin),
    fenetre: scoreFenetre(
      creneau.dureeTotaleMin.value,
      contexte.nuit.dureeReferenceH * MIN_PAR_H,
    ),
    lune: scoreLune(delta.value, detect.toleranceLune),
  }

  return {
    objet,
    creneau,
    cadrage,
    detect,
    pose,
    integration,
    extinction,
    deltaSbLuneMag: delta,
    sbCielEffectif,
    detailScore,
    score: scoreGlobal(detailScore, poids),
  }
}

/**
 * §6.4 — the two size bounds the pre-filter applies, exposed because catalogue list must SAY
 * them. "That fit your frame" suggested the opposite: the LOW bound cuts most, shortening focal
 * empties the list instead of filling it.
 */
export interface BornesTailleCadre {
  readonly minArcmin: number
  readonly maxArcmin: number
}

export function bornesTailleCadre(fovHDeg: number): BornesTailleCadre {
  return {
    minArcmin: fovHDeg * REMPLISSAGE_MIN_PLANIFIABLE * ARCMIN_PAR_DEG,
    maxArcmin: fovHDeg * ARCMIN_PAR_DEG,
  }
}

/**
 * Catalogue objects the LOW bound excludes. Counted over whole catalogue, not named exclusions:
 * caller caps those, a cap would announce too small a number.
 */
export function compteTropPetites(
  catalogue: readonly ObjetCielProfond[],
  fovHDeg: number,
): number {
  const { minArcmin } = bornesTailleCadre(fovHDeg)
  return catalogue.filter((o) => o.majAxArcmin !== null && o.majAxArcmin < minArcmin).length
}

export interface PreFiltrage {
  readonly candidates: readonly ObjetCielProfond[]
  /** Named exclusions, capped: a 12 000-line list helps nobody. */
  readonly ecartees: readonly CibleEcartee[]
  readonly comptes: ReadonlyMap<CauseEcart, number>
}

/**
 * Ephemeris-free pre-filter: hard constraints by arithmetic alone. Each exclusion carries its
 * cause; only surviving candidates (brightest) go to créneau computation, the costly step.
 * `plafond` = CALLER's compute bound, not a pre-filter property, NO default: forces each caller to
 * state what it pays. Catalogue list bounds its ephemerides (§6.4); plan de séance bounds nothing,
 * its input is the user's selection (§8.3) — cutting would silently drop a requested target.
 * `plafondEcartees` SEPARATE: bounds cap different costs. More candidates = one ephemeris each;
 * more named exclusions = one string. A caller answering "why not that one?" over the whole
 * catalogue (§6.4 list) needs all causes without paying all créneaux.
 */
export function preFiltre(
  contexte: ContexteSession,
  catalogue: readonly ObjetCielProfond[],
  plafond: number,
  plafondEcartees: number,
  /** T-0407 — under a zoom, size bounds = those of each target's focal. */
  contexteDe?: ContexteDe,
): PreFiltrage {
  const seuil = contexte.seuilHauteurDeg ?? K('SEUIL_HAUTEUR_IMAGERIE_DEG')
  const bornesDe = (objet: ObjetCielProfond): BornesTailleCadre =>
    bornesTailleCadre((contexteDe?.(objet) ?? contexte).fovHDeg)
  const cap = plafond
  const infini = Number.POSITIVE_INFINITY

  const retenues: ObjetCielProfond[] = []
  const ecartees: CibleEcartee[] = []
  const comptes = new Map<CauseEcart, number>()

  const ecarte = (objet: ObjetCielProfond, code: CauseEcart, cause: string): void => {
    comptes.set(code, (comptes.get(code) ?? 0) + 1)
    if (ecartees.length < plafondEcartees) {
      ecartees.push({ designation: objet.designation, code, cause })
    }
  }

  // §5.2 — domain lock comes BEFORE any target constraint: without suivi no ciel profond target is
  // plannable, whatever size/magnitude. Capping by NPF wasn't enough — a bright target stayed under
  // §7.3 integration cap and showed "photographiable" in 1 954 poses of 2 s on a fixed tripod.
  if (contexte.domaineCpFerme !== null) {
    for (const objet of catalogue) ecarte(objet, 'SUIVI', contexte.domaineCpFerme)
    return { candidates: [], ecartees, comptes }
  }

  for (const objet of catalogue) {
    const taille = objet.majAxArcmin
    if (taille === null || objet.vMag === null) {
      // Counted, not listed: thousands would drown the exclusions user can fix.
      comptes.set('DONNEE_MANQUANTE', (comptes.get('DONNEE_MANQUANTE') ?? 0) + 1)
      continue
    }
    const { minArcmin: tailleMin, maxArcmin: tailleMax } = bornesDe(objet)
    if (taille < tailleMin || taille > tailleMax) {
      ecarte(
        objet,
        'CADRAGE',
        `Taille de ${nombre(taille, 0)}’ : votre cadre convient de ${nombre(tailleMin, 0)}’ à ` +
          `${nombre(tailleMax, 0)}’.`,
      )
      continue
    }
    const alt = altitudeCulmination(contexte.site.latitudeDeg, objet.decDeg).value
    if (alt <= seuil) {
      ecarte(
        objet,
        'HAUTEUR',
        `Ne monte pas au-delà de ${degres(alt, 1)} d’ici : trop basse, il faut au moins ${seuil}°.`,
      )
      continue
    }
    retenues.push(objet)
  }

  return {
    candidates: retenues
      .sort((a, b) => (a.vMag ?? infini) - (b.vMag ?? infini))
      .slice(0, cap),
    ecartees,
    comptes,
  }
}
