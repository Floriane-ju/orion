/**
 * §7 et §8 — la chaîne de calcul de l'application, d'un lieu et d'un matériel jusqu'au plan
 * de la nuit.
 *
 * Rien n'est dessiné ici : chaque sortie est mémoïsée et distribuée aux régions de la coque.
 * Une saisie refusée ou un domaine dépassé nomme sa cause plutôt que de faire tomber
 * l'application (§12.5).
 */

import { useDeferredValue, useMemo, useRef } from 'react'
import { fenetreNocturne, offsetMidiSolaireMin, type FenetreNocturne } from '../core/night.ts'
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
  masqueDepuisPoints,
  masquePlat,
  seuilsDeclinaison,
  type MasqueHorizon,
  type SeuilsSite,
} from '../core/site.ts'
import {
  FondDeCielIndeterminableError,
  fondDeCiel,
  type FondDeCiel,
} from '../core/sky-background.ts'
import { profilOptique, type ProfilOptique } from '../core/optics.ts'
import { fluxCiel } from '../core/exposure.ts'
import type { IndexCiel } from '../core/index-ciel.ts'
import type { EntreeProfondeur } from '../core/galactique.ts'
import { npf, profilSuivi, type ProfilSuivi } from '../core/tracking.ts'
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
import { modeObjectif } from './PanneauMateriel.tsx'
import type { SaisieLieu, SaisieMateriel } from './app-saisie.ts'
import { nombreSaisi, nombreSiRenseigne } from './saisie-bornee.ts'
import type { MaterielFile } from './planetarium-materiel.ts'
import { PRESET_SNR_DEFAUT } from '../registry/verdicts.ts'
import type { ContexteFiche } from './fiche-cible-calcul.ts'
import type { PanneauFileProps } from './PanneauFile.tsx'

/**
 * Objectif de qualité retenu pour le plan de la nuit : « correct » au sens de §7.3.
 *
 * T-0268 — lu dans le registre, pas recopié : la fiche ouvre sur ce même préréglage, et deux
 * 10 écrits à deux endroits finissent par ne plus valoir la même chose.
 */
const PRESET_SNR_PLAN = PRESET_SNR_DEFAUT

/**
 * T-0291 — ce que disent les régions dont le calcul est encore en vol.
 *
 * La phrase nomme l'état ET sa conséquence. « Calcul en cours… » seul laisserait croire que
 * l'écran est vide ; ce qu'il montre est un résultat, juste celui d'avant, et c'est la seule
 * chose qu'un observateur doit savoir pour ne pas se fier à un chiffre périmé.
 */
export const RECALCUL_EN_COURS =
  'Recalcul en cours : les chiffres affichés sont ceux de la saisie précédente.'

/**
 * T-0149 — ce que le LIEU et la DATE donnent, sans rien savoir du matériel.
 *
 * Séparé de `Calcul` parce que les deux tombent pour des raisons différentes : une focale
 * effacée en cours de frappe ne rend pas la nuit incalculable, et la scène n'a besoin que
 * de ce bloc-ci pour se dessiner (§12.5).
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

/** Le ciel quand il est calculable — ce que la scène et le plan de séance consomment. */
export type CielCalcule = Extract<CalculCiel, { readonly ok: true }>

/** §5.1, §5.2 et §9.1 — ce que le MATÉRIEL déclaré produit, ou la cause de son refus. */
export type Calcul =
  | {
      readonly ok: true
      readonly optique: ProfilOptique
      readonly suivi: ProfilSuivi
      readonly poseNpf: Traced<number | null>
      readonly capteur: CapteurEffectif
      /** T-0208 — la focale et l'ouverture BORNÉES : celles dont tout le reste est déduit. */
      readonly focaleMm: number
      readonly ouvertureN: number
      /** §5.1 — le boîtier retenu : celui de la base, ou celui que la saisie décrit. */
      readonly boitier: Boitier
      readonly zeroSysteme: PointZeroSysteme
      readonly iso: IsoRetenu
      readonly noteRecadrage?: string
    }
  | { readonly ok: false; readonly erreur: string }

export interface ChaineCalcul {
  readonly calcul: Calcul
  /** T-0149 — le ciel du site : il se calcule même quand le matériel est incomplet. */
  readonly ciel: CalculCiel
  /**
   * La cause du refus de la SAISIE en cours, quand `ciel` est celui de la saisie précédente.
   * `null` dès que le lieu saisi est de nouveau calculable.
   */
  readonly cielRefus: string | null
  readonly site: Site
  readonly masque: MasqueHorizon
  readonly fenetreUtile: FenetreUtile | null
  /** Index de sélection : construit une fois, lu par la scène et par l'onglet Explorer. */
  readonly index: IndexCiel
  readonly profilsCadre: readonly ProfilCadre[]
  /** Absent quand le matériel n'est pas chiffrable : la scène n'incruste alors rien. */
  readonly materielFile: MaterielFile | null
  /** §8.3 — le contexte de la nuit, partagé par le plan de séance et la liste du catalogue. */
  readonly contexteSession: ContexteSession | null
  readonly plan: PlanSession | null
  /**
   * §6.4 — la note de facilité par désignation, calculée UNE fois pour toute l'application.
   *
   * Elle vit ici et pas dans un écran parce que DEUX surfaces l'affichent — la liste du
   * catalogue et l'en-tête de la carte Cible. Deux appels au moteur, même identiques, sont
   * deux couvertures à garder d'accord : la carte notait des cibles que la liste laissait
   * vides. Une seule map les rend incapables de se contredire.
   */
  readonly etatsCibles: ReadonlyMap<string, EtatCible>
  /** Le matériel et le ciel sous lesquels la fiche évalue une cible (§6, §7). */
  readonly contexteFiche: ContexteFiche | null
  readonly panneauFile: PanneauFileProps | null
  /**
   * T-0291 — vrai tant que le plan, les notes et la liste affichés sont ceux de la saisie
   * PRÉCÉDENTE : le calcul lourd est parti, il n'a pas encore rendu.
   *
   * Les régions concernées le DISENT. Un chiffre en retard qui ne s'annonce pas est un chiffre
   * faux : c'est la seule contrepartie du report, et elle se paie à l'écran, pas en silence.
   */
  readonly recalculEnCours: boolean
}

export interface EntreeChaine {
  readonly lieu: SaisieLieu
  readonly materiel: SaisieMateriel
  readonly catalogue: readonly ObjetCielProfond[]
  /**
   * §3.3 — l'index spatial, reçu tout fait. T-0296 : le construire ici obligeait à le
   * construire DANS un rendu, où rien ne peut rendre la main ; il se bâtit maintenant avec
   * les catalogues (`app-donnees.ts`), par tranches.
   */
  readonly index: IndexCiel
  /** §9.2 — la pose unitaire du filé, réglée dans le panneau du même nom. */
  readonly tPoseFileS: number
  /** §8.3 — les poids C-15 tels qu'ils sont réglés ; le moteur les normalise. */
  readonly poids: PoidsScoring
}

/**
 * T-0291 — le LIEU ramené à ses GRANDEURS, avant le moindre mémo.
 *
 * La chaîne mémoïsait sur les CHAÎNES tapées. « 45.5 » puis « 45.50 » désignent la même
 * latitude mais pas le même texte : la nuit entière se recalculait pour un caractère sans
 * effet — 480 ms à CPU ×4. Le bornage se refait à chaque rendu, ce qui ne coûte rien — lire
 * un texte n'est pas calculer une nuit —, et ce sont ses NOMBRES qui servent de dépendances.
 * Deux saisies qui décrivent le même lieu partagent alors la même clé.
 *
 * `NaN` s'y compare à lui-même sous `Object.is`, celui dont React se sert : un champ vidé le
 * temps d'être retapé ne relance donc rien non plus.
 */
export interface GrandeursLieu {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  readonly altitudeM: number
  /** §2.3 — `undefined` quand le champ est vide : la grandeur est déclarée inconnue. */
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

/** T-0291 — le MATÉRIEL ramené à ses grandeurs, pour la même raison que le lieu. */
export interface GrandeursMateriel {
  readonly focaleMm: number
  readonly ouvertureN: number
  /**
   * §7.2 — l'ISO que la saisie fixe, `undefined` quand rien ne le fixe.
   *
   * T-0206 — sous un boîtier de la base, c'est le seuil de double gain de sa ligne qui désigne
   * l'ISO, et la valeur saisie est ignorée. Le filtre est ici et non dans `evalueMateriel`
   * pour que taper dans ce champ sous un boîtier de la base ne change AUCUNE dépendance :
   * sans effet sur le calcul, donc sans effet sur la nuit.
   */
  readonly isoSaisi: number | undefined
}

export function grandeursMateriel(materiel: SaisieMateriel): GrandeursMateriel {
  return {
    focaleMm: nombreSaisi('focale_mm', materiel.focale).valeur,
    ouvertureN: nombreSaisi('ouverture_N', materiel.ouverture).valeur,
    isoSaisi:
      ligneBoitier(materiel.boitierId) !== null
        ? undefined
        : nombreSiRenseigne('iso_capture', materiel.iso).valeur,
  }
}

export function useChaineCalcul(entree: EntreeChaine): ChaineCalcul {
  const { lieu, materiel, catalogue, index, tPoseFileS, poids } = entree

  // T-0291 — les deux saisies bornées, recalculées à chaque rendu : ce sont les clés de tout
  // ce qui suit, et une clé mémoïsée sur elle-même n'en serait plus une.
  const lieuBorne = grandeursLieu(lieu)
  const materielBorne = grandeursMateriel(materiel)

  /**
   * §4.1 — le relief relevé à la main l'emporte sur toute hypothèse. Sans relevé, le masque
   * plat [HYP] reste le repli documenté de la matrice de dégradation §12.5 : aucune source de
   * relief n'est disponible hors réseau ni au premier démarrage.
   *
   * Une saisie hors domaine ne fait pas tomber la chaîne : elle est refusée à la saisie, dans
   * le panneau, et le masque garde son état précédent.
   */
  const masque: MasqueHorizon = useMemo(() => {
    try {
      return masqueDepuisPoints(lieu.pointsMasque)
    } catch {
      return masquePlat()
    }
  }, [lieu.pointsMasque])

  /**
   * T-0208 — les trois grandeurs du lieu, ramenées dans leur domaine avant d'entrer dans le
   * moindre moteur. C'est ici que se ferme l'écran noir : `astronomy-engine` lève une CHAÎNE
   * de caractères sur une latitude hors [−90, 90], que `refus()` ne reconnaissait pas et
   * relançait depuis un rendu.
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
   * T-0149, même raison que pour le ciel : un champ vidé le temps d'être retapé n'est pas un
   * lieu. Un site non chiffrable laisse la place au dernier qui l'était, et c'est ce site-là
   * que reçoivent la fenêtre utile, le plan de séance et la boucle du planétarium — aucun
   * `NaN` ne descend plus dans la chaîne.
   */
  const dernierSite = useRef<Site | null>(null)
  if (siteChiffrable(siteSaisi)) dernierSite.current = siteSaisi
  const site = dernierSite.current ?? siteSaisi

  const cielSaisi = useMemo(
    () => evalueCiel(site, lieuBorne),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [site, lieuBorne.bortleDeclare, lieuBorne.sqmMesure, lieuBorne.nuitIso],
  )

  /**
   * T-0149, suite — un champ du lieu vidé le temps d'en retaper la valeur refusait tout le
   * ciel, et la scène disparaissait le temps de la frappe. Le dernier ciel calculable tient
   * lieu de ciel affiché, et la cause du refus se lit à côté du champ qui l'a produite : un
   * planétarium qui clignote à chaque touche est illisible, et l'erreur reste dite.
   *
   * Tant qu'aucune saisie n'a abouti — profil relu hors domaine au premier rendu — il n'y a
   * rien à garder : le refus reste le seul état possible.
   */
  const dernierCiel = useRef<CielCalcule | null>(null)
  if (cielSaisi.ok) dernierCiel.current = cielSaisi
  const ciel = cielAffiche(cielSaisi, dernierCiel.current)
  // T-0208 — le bornage d'un champ se dit AU PIED DE CE CHAMP (`ChampDomaine`), pas ici :
  // cette ligne-ci ne porte que ce qu'aucun champ ne peut dire seul — une table de Bortle
  // sans repli, un fond de ciel indéterminable, un lieu incomplet.
  const cielRefus = cielSaisi.ok ? null : cielSaisi.erreur

  const calcul = useMemo(
    () => evalueMateriel(materiel, materielBorne),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      materiel.boitierId,
      materiel.boitier,
      materiel.capteurMode,
      // T-0270 — la projection de l'objectif entre dans le champ calculé : sans elle ici,
      // cocher « fisheye » ne changeait rien tant qu'un autre champ n'était pas touché.
      materiel.typeObjectif,
      materiel.suiviActif,
      materiel.qualiteMes,
      materiel.typeMonture,
      materielBorne.focaleMm,
      materielBorne.ouvertureN,
      materielBorne.isoSaisi,
    ],
  )

  const fenetreUtile = useMemo(
    () => (ciel.ok ? calculeFenetreUtile(site, ciel.nuit) : null),
    [ciel, site],
  )

  /** §3.5 — le cadre projeté sur la scène, tel que le matériel saisi le définit. */
  const profilsCadre = useMemo(
    () => profilsDeCadre(calcul, materiel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calcul, materiel.capteurMode, materiel.typeObjectif],
  )

  /**
   * §9.2 — profondeur atteinte par la pose unitaire. Assemblée ici parce que deux régions en
   * dépendent : le panneau du filé, qui la chiffre, et la scène, qui l'incruste dans le cadre.
   */
  const profondeurFile: EntreeProfondeur | null = useMemo(() => {
    if (!calcul.ok || !ciel.ok) return null
    return {
      tPoseS: tPoseFileS,
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
  }, [calcul, ciel, tPoseFileS])

  /**
   * Ce que la scène doit savoir du filé pour l'incruster dans le cadre.
   *
   * Mémoïsée, et pas assemblée dans le JSX : la passe de filé republie ses compteurs de rendu
   * dans le magasin de séance, ce qui rend l'application. Une identité neuve à chaque rendu
   * relancerait donc la passe, qui republierait, sans fin.
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
      echApx: calcul.optique.echApx.value,
      sbCiel: ciel.ciel.sbCiel.value,
      tMaxSuiviS: calcul.suivi.tMaxSuiviS.value,
    }
  }, [calcul, ciel, profondeurFile])

  /**
   * §8.3 — le ciel, le site et le matériel sous lesquels une cible est évaluée pour la nuit.
   *
   * Mémoïsé à part du plan parce que DEUX écrans s'en servent : le plan de séance et la liste
   * du catalogue (§6.4). Un second contexte assemblé ailleurs annoncerait tôt ou tard une
   * autre pose pour la même cible — le désaccord que T-0089 a corrigé une fois.
   */
  const contexteSession = useMemo<ContexteSession | null>(() => {
    if (!calcul.ok || !ciel.ok || fenetreUtile === null) return null
    return {
        site,
        nuit: ciel.nuit,
        fenetreUtile,
        masque,
        fovHDeg: calcul.optique.fovHDeg.value,
        echApx: calcul.optique.echApx.value,
        dMm: calcul.optique.dMm.value,
        capteurHMm: calcul.capteur.capteurHMm,
        pitchUm: calcul.capteur.pitchUm,
        ouvertureN: calcul.ouvertureN,
        zpSys: calcul.zeroSysteme.valeur,
        zpEstime: calcul.zeroSysteme.estime,
        readNoiseE: calcul.iso.readNoiseE,
        tailleRawMo: calcul.boitier.tailleRawMo,
        isoSession: calcul.iso.iso,
        sbCielNoir: ciel.ciel.sbCiel.value,
        mLimOeil: ciel.ciel.mLimOeil.value,
        tMaxS: calcul.suivi.tMaxSuiviS.value ?? calcul.poseNpf.value,
        // §5.2 — le verrou du domaine, pas seulement son plafond de pose : sans suivi, la NPF
        // seule laissait passer les cibles brillantes, chiffrées en milliers de poses de 2 s.
        domaineCpFerme: calcul.suivi.cause,
        snrCible: PRESET_SNR_PLAN,
        typeMonture: materiel.typeMonture,
        poids,
    }
  }, [calcul, ciel, masque, materiel.typeMonture, site, fenetreUtile, poids])

  /**
   * T-0291 — LA FRONTIÈRE DU CALCUL LOURD. Ce qui est en aval suit la frappe, il ne la porte
   * pas.
   *
   * Tout ce qui précède est chiffré en quelques millisecondes — le ciel du site, le profil
   * optique, le cadre. Tout ce qui suit balaie le catalogue entier : le plan de la nuit, les
   * notes de facilité, et les lectures que la liste en tire. Ensemble, une soixantaine de
   * millisecondes sans bridage, quatre fois plus sur la tablette que §11.2 vise — dans le
   * rendu de la touche, la saisie décrochait.
   *
   * `useDeferredValue` les déplace dans un rendu de moindre priorité : la touche est peinte
   * avec le contexte PRÉCÉDENT, puis React reprend avec le nouveau. Ce n'est pas un
   * amincissement du calcul — le plan reste le même plan — c'est un changement d'ordre.
   *
   * La contrepartie est un décalage visible, et elle est assumée à une condition : les régions
   * en retard le disent (`recalculEnCours`). Le contexte rendu à l'application est le DIFFÉRÉ,
   * jamais celui de la saisie en cours — deux régions qui liraient l'un et l'autre
   * s'afficheraient contradictoires le temps d'un rendu.
   */
  const contexteDiffere = useDeferredValue(contexteSession)
  const recalculEnCours = contexteDiffere !== contexteSession

  const plan = useMemo(() => {
    if (contexteDiffere === null || catalogue.length === 0) return null
    return planSession(contexteDiffere, catalogue)
  }, [contexteDiffere, catalogue])

  /**
   * §6.4 — même dépendances que le plan, et pour la même raison : un créneau est une propriété
   * de la NUIT, donc bouger le curseur de temps ne relance rien.
   */
  const etats = useMemo(
    () =>
      contexteDiffere === null
        ? new Map<string, EtatCible>()
        : etatsCibles(contexteDiffere, catalogue),
    [contexteDiffere, catalogue],
  )

  return {
    calcul,
    ciel,
    cielRefus,
    site,
    masque,
    fenetreUtile,
    index,
    profilsCadre,
    materielFile,
    contexteSession: contexteDiffere,
    recalculEnCours,
    plan,
    etatsCibles: etats,
    contexteFiche:
      calcul.ok && ciel.ok ? contexteFiche(calcul, ciel, materiel, lieu) : null,
    panneauFile:
      calcul.ok && profondeurFile !== null
        ? panneauFile(calcul, materiel, site, profondeurFile)
        : null,
  }
}

/**
 * Le ciel que la scène dessine : celui de la saisie quand elle aboutit, sinon le dernier
 * qui a abouti. Un refus ne remplace le ciel affiché que tant qu'aucun n'a jamais tenu.
 */
export function cielAffiche(saisi: CalculCiel, dernier: CielCalcule | null): CalculCiel {
  return saisi.ok ? saisi : (dernier ?? saisi)
}

/**
 * T-0208 — un lieu dont une grandeur n'est pas un nombre n'est pas un lieu : `new Observer`
 * laisse passer un `NaN` sans lever, et c'est toute la chaîne qui rend ensuite du `NaN`.
 */
export function siteChiffrable(site: Site): boolean {
  return (
    Number.isFinite(site.latitudeDeg) &&
    Number.isFinite(site.longitudeDeg) &&
    Number.isFinite(site.altitudeM)
  )
}

/**
 * §4.1 et §2.2 — ce que le lieu et la date donnent, ou la cause du refus.
 *
 * T-0291 — l'entrée est le lieu BORNÉ, jamais le texte saisi : ce moteur est le premier de la
 * chaîne lourde, et ce qui décide de le relancer doit être un nombre, pas une frappe.
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
 * §5.1, §5.2 et §9.1 — ce que le matériel déclaré produit, ou la cause du refus.
 *
 * T-0149 — le lieu n'entre plus ici. Une focale effacée le temps de la retaper refusait
 * jusqu'à la nuit et au fond de ciel, et la scène disparaissait avec eux.
 */
/**
 * T-0204 — le boîtier du calcul : la ligne de la base quand une est choisie, la saisie sinon.
 *
 * La base fait foi tant qu'un boîtier est choisi, plutôt qu'une copie figée dans le profil :
 * corriger une ligne de `boitiers.md` recalcule les plans au redémarrage, ce qu'exige §2.1.
 *
 * T-0205 — sauf le poids d'une image, qui vient de la saisie même sous un boîtier de la base :
 * ce n'est pas une grandeur du capteur mais du réglage RAW, et la ligne n'en donne qu'un départ.
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
      // §9.1 — la NPF reste affichée même avec suivi, à titre informatif. Déclinaison 0 :
      // c'est la zone la plus contraignante du ciel, la carte par cellule vient au lot 5.
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
 * Saisie refusée ou domaine dépassé : la cause est nommée, pas avalée.
 *
 * T-0208 — et plus jamais relancée. `astronomy-engine` lève des CHAÎNES de caractères, pas des
 * `Error` : les quatre `instanceof` étaient faux, la levée repartait depuis un `useMemo` de
 * rendu, et React démontait l'arbre entier — l'écran devenait noir sans rien dire. Une cause
 * qu'on ne sait pas nommer s'affiche telle quelle ; elle ne fait pas tomber l'application.
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
  return { ok: false, erreur: `Calcul impossible : ${String(erreur)}` }
}

export function profilsDeCadre(calcul: Calcul, materiel: SaisieMateriel): readonly ProfilCadre[] {
  if (!calcul.ok) return []
  const boitier = calcul.boitier
  const focaleMm = calcul.focaleMm
  const ouvertureN = calcul.ouvertureN
  // §3.5 — un seul profil, celui du matériel déclaré : la scène montre ce que CE matériel
  // capturerait. Le tableau reste un tableau (T-0234, Annexe C n° 24) — comparer deux optiques
  // suppose un stock de profils enregistrés, et rien ici n'empêche de l'allonger le jour venu.
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
      libelle: `${focaleMm} mm f/${ouvertureN} — ${mode === 'FULL_FRAME' ? 'plein format' : 'recadrage APS-C'}`,
      fovLDeg: optique.fovLDeg.value,
      fovHDeg: optique.fovHDeg.value,
      echApx: optique.echApx.value,
      capteurHMm: capteur.capteurHMm,
      modeObjectif: modeObjectif(materiel.typeObjectif),
      tPoseS: calcul.suivi.tMaxSuiviS.value ?? calcul.poseNpf.value,
    },
  ]
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
    // Sans suivi, c'est la NPF qui plafonne la pose (§9.1) — jamais rien.
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
  profondeur: EntreeProfondeur,
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
    echApx: calcul.optique.echApx.value,
    tailleRawMo: calcul.boitier.tailleRawMo,
    profondeur,
    tMaxSuiviS: calcul.suivi.tMaxSuiviS.value,
    zeroSysteme: calcul.zeroSysteme,
    modeObjectif: modeObjectif(materiel.typeObjectif),
  }
}
