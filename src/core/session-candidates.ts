/**
 * §8.3 — Ce qui décide si une cible entre au plan, avant toute allocation de temps.
 *
 * Deux étages, du moins cher au plus cher : le pré-filtrage par contrainte dure, qui ne
 * demande que de l'arithmétique, puis l'évaluation complète d'une candidate, qui appelle
 * les éphémérides et les moteurs de §6 et §7. Chaque exclusion nomme sa cause.
 */

import { K } from '../registry/constants.ts'
import { SaisieRefuseeError } from '../registry/domains.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { REMPLISSAGE_MIN_PLANIFIABLE, VERDICTS_PLANIFIABLES } from '../registry/verdicts.ts'
import {
  creneauCible,
  type CreneauCible,
  type EntreeCreneau,
  type Intervalle,
} from './creneaux.ts'
import { detectabilite } from './detectability.ts'
import { ficheCadrage } from './framing.ts'
import { fluxCiel, fluxObjet, fluxObjetReel, planIntegration, poseUnitaire } from './exposure.ts'
import { cielSousLaLune } from './moon.ts'
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
  ContexteSession,
  DetailScore,
  PoidsScoring,
} from './session-types.ts'

const MINUTES_PAR_HEURE = 60
const S_PAR_MINUTE = 60
const ARCMIN_PAR_DEG = 60
const HEURES_PAR_TOUR = 24
const DEG_PAR_HEURE = 360 / HEURES_PAR_TOUR

/**
 * §8.1 — la Lune est évaluée au milieu du créneau de la cible : c'est là que la dégradation
 * est représentative de la session, plutôt qu'à un instant arbitraire de la nuit. Exporté
 * parce que c'est une convention du plan, et qu'un autre écran doit pouvoir l'employer.
 */
export function instantLune(creneau: CreneauCible, repli: Date): Date {
  const premier = creneau.creneaux[0]
  const dernier = creneau.creneaux[creneau.creneaux.length - 1]
  if (premier === undefined || dernier === undefined) return repli
  return new Date((premier.debut.getTime() + dernier.fin.getTime()) / 2)
}

/**
 * §8.2 — l'entrée du créneau d'une cible, telle que le plan la construit. T-0222 : la fiche
 * affiche ce créneau ; reconstruire l'entrée ailleurs, c'est risquer un seuil ou une monture
 * qui diffère, donc deux créneaux pour la même cible.
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

/** Le code d'écart que porte un créneau refusé : la cause vient du moteur, pas d'ici. */
function codeExclusionCreneau(creneau: CreneauCible): CauseEcart {
  if (creneau.causeExclusion === 'HAUTEUR' || creneau.causeExclusion === 'JAMAIS_LEVE') {
    return 'HAUTEUR'
  }
  return creneau.causeExclusion === 'RELIEF' ? 'RELIEF' : 'FENETRE'
}

/**
 * Une cible, évaluée de bout en bout, ou écartée en nommant sa cause.
 *
 * Le refus de domaine est traité ICI et pas chez l'appelant. Un moteur de §7 refuse une
 * entrée hors de sa plage de validité en LEVANT — c'est son contrat, et il est juste. Mais
 * ce refus vaut pour UNE cible : le laisser remonter fait tomber l'écran entier sur un seul
 * objet du catalogue, ce que §12.5 interdit. Une nébuleuse obscure de 100’ à magnitude 14
 * dépasse les 26 mag/as² du domaine, et ce n'est pas une raison pour priver les autres
 * cibles de leur pose.
 *
 * La garde était chez `planSession` seul. Deux appelants la voulaient — la liste du
 * catalogue de §6.4 est arrivée sans, et l'écran est tombé dès qu'une optique de 300 mm a
 * rétréci la fenêtre de cadrage assez pour laisser entrer ces objets-là.
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
  // §6.3 compare SB_obj au fond de ciel de §2.2, qui est une brillance en V. Une magnitude B
  // prise pour une V y entrerait sans terme de couleur, et l'écart B−V n'est pas une constante
  // — sur une nébuleuse en émission il dépend du rapport des raies. NGC7000, NGC1499, NGC6960
  // et NGC3372 ne portent que B : elles sont écartées faute de mesure utilisable, pas par
  // oubli. Les faire remonter demande une source, pas une conversion (T-0317).
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

  const creneau = creneauCible(entreeCreneau(contexte, objet, fenetre))
  if (creneau.causeExclusion !== undefined || creneau.dureeTotaleMin.value <= 0) {
    return {
      designation: objet.designation,
      code: codeExclusionCreneau(creneau),
      cause: creneau.message,
    }
  }

  const { delta, sbCielEffectif, altLuneDeg, separationDeg } = cielSousLaLune({
    site: contexte.site,
    instant: instantLune(creneau, fenetre.debut),
    adH: objet.adDeg / DEG_PAR_HEURE,
    decDeg: objet.decDeg,
    altitudeCibleDeg: creneau.altCulminationDeg.value,
    sbCielNoirMag: sbCielBase,
  })

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
  // §7.6 — le plan connaît le créneau : la masse d'air retenue est sa MOYENNE, pas celle de
  // la culmination. C'est le coût réel de la capture, et il est plus élevé que le meilleur
  // instant de la nuit. Le fond de ciel, lui, reste à sa valeur relevée au sol.
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
    tPoseS: pose.tRecommandeS.value,
    readNoiseE: pose.readNoiseUtiliseE,
    snrCible: contexte.snrCible,
    tailleRawMo: contexte.tailleRawMo,
    dureeCreneauS: creneau.dureeTotaleMin.value * S_PAR_MINUTE,
    eObjPlage: extinction.plageEObj,
  })
  if (integration.horsDePortee) {
    return {
      designation: objet.designation,
      code: 'HORS_PORTEE',
      cause: integration.messages[0] ?? 'Cible hors de portée de ce setup.',
    }
  }

  const tRequisMin = integration.tRequisS.value / S_PAR_MINUTE
  const detailScore: DetailScore = {
    cadrage: scoreCadrage(cadrage.remplissage.value),
    hauteur: scoreHauteur(creneau.altCulminationDeg.value),
    signal: scoreSignal(creneau.dureeTotaleMin.value, tRequisMin),
    fenetre: scoreFenetre(
      creneau.dureeTotaleMin.value,
      contexte.nuit.dureeReferenceH * MINUTES_PAR_HEURE,
    ),
    lune: scoreLune(delta.value),
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
 * §6.4 — les deux bornes de taille que le pré-filtrage applique, exposées parce que la liste
 * du catalogue doit les DIRE. « Qui tiennent dans votre cadre » laissait attendre l'inverse
 * de ce qui se passe : c'est la borne BASSE qui coupe le plus, et réduire la focale vide la
 * liste au lieu de la remplir.
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
 * Combien d'objets du catalogue la borne BASSE écarte. Compté sur le catalogue entier, pas
 * sur les écartées nommées : celles-ci sont plafonnées par l'appelant, et un plafond ferait
 * annoncer un nombre plus petit que le vrai.
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
  /** Écartées nommées, plafonnées : une liste de douze mille lignes n'aide personne. */
  readonly ecartees: readonly CibleEcartee[]
  readonly comptes: ReadonlyMap<CauseEcart, number>
}

/**
 * Pré-filtrage sans éphéméride : les contraintes dures qui se tranchent à l'arithmétique
 * seule. Chaque exclusion porte sa cause, et seules les candidates survivantes — les plus
 * brillantes — vont au calcul de créneau, qui est le poste coûteux.
 */
/**
 * `plafond` est la borne de calcul de l'APPELANT, pas une propriété du pré-filtrage, et il n'a
 * PAS de valeur par défaut : c'est ce qui force chaque appelant à dire ce qu'il paie. La liste
 * du catalogue borne ses éphémérides (§6.4) ; le plan de séance ne borne plus rien, parce que
 * son entrée n'est plus le catalogue mais la sélection de l'utilisateur (§8.3) — y couper
 * serait écarter en silence une cible explicitement demandée.
 *
 * `plafondEcartees` est SÉPARÉ, et il le fallait : les deux bornes ne bornent pas le même
 * coût. Retenir plus de candidates coûte une éphéméride chacune ; nommer plus d'écartées ne
 * coûte qu'une chaîne. Un appelant qui doit répondre « pourquoi pas celle-là ? » sur tout le
 * catalogue — la liste de §6.4 — a besoin de toutes les causes sans payer tous les créneaux.
 */
export function preFiltre(
  contexte: ContexteSession,
  catalogue: readonly ObjetCielProfond[],
  plafond: number,
  plafondEcartees: number,
): PreFiltrage {
  const seuil = contexte.seuilHauteurDeg ?? K('SEUIL_HAUTEUR_IMAGERIE_DEG')
  const { minArcmin: tailleMin, maxArcmin: tailleMax } = bornesTailleCadre(contexte.fovHDeg)
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

  // §5.2 — le verrou du domaine passe AVANT toute contrainte de cible : sans suivi, aucune
  // cible ciel profond n'est planifiable, quelle que soit sa taille ou sa magnitude. Le plafonner
  // par la NPF ne suffisait pas — une cible brillante restait sous le plafond d'intégration de
  // §7.3 et s'affichait « photographiable » en 1 954 poses de 2 s sur un trépied fixe.
  if (contexte.domaineCpFerme !== null) {
    for (const objet of catalogue) ecarte(objet, 'SUIVI', contexte.domaineCpFerme)
    return { candidates: [], ecartees, comptes }
  }

  for (const objet of catalogue) {
    const taille = objet.majAxArcmin
    if (taille === null || objet.vMag === null) {
      // Comptées, pas listées une par une : elles sont des milliers, et une liste de
      // milliers de lignes noierait les exclusions que l'utilisateur peut corriger.
      comptes.set('DONNEE_MANQUANTE', (comptes.get('DONNEE_MANQUANTE') ?? 0) + 1)
      continue
    }
    if (taille < tailleMin || taille > tailleMax) {
      ecarte(
        objet,
        'CADRAGE',
        `Taille de ${taille.toFixed(0)}’ : votre cadre convient de ${tailleMin.toFixed(0)}’ à ` +
          `${tailleMax.toFixed(0)}’.`,
      )
      continue
    }
    const alt = altitudeCulmination(contexte.site.latitudeDeg, objet.decDeg).value
    if (alt <= seuil) {
      ecarte(
        objet,
        'HAUTEUR',
        `Ne monte pas au-delà de ${alt.toFixed(1)}° d’ici : trop basse, il faut au moins ${seuil}°.`,
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
