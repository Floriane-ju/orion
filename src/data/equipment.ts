/**
 * §2.3 — Base matériel : point zéro système et grandeurs capteur.
 *
 * `ZP_sys` est la brillance de ciel produisant 1 e⁻/s/px pour un pixel de 1 µm à f/1. Il se
 * déduit hors application du point zéro photométrique de la bande passante, de l'efficacité
 * quantique du capteur, de la transmission optique et du gain en e⁻/ADU — courbes QE
 * constructeur et mesures de gain de Photons to Photos.
 *
 * Il n'existe AUCUNE fonction de calibration, et aucun écran n'invite à en effectuer une :
 * l'optimum de pose est plat, une erreur d'un facteur 2 coûte 2 à 5 points de SNR, que la
 * plage utile affichée absorbe.
 * Cette plage se calcule dans `exposure.ts` (`PLAGE_UTILE_POSE`) et s'affiche sur la fiche
 * cible ; la perte de SNR, elle, ne s'affiche nulle part — sa formule reste au formulaire de
 * l'Annexe B sous `PERTE_SNR` (T-0063).
 *
 * Le Lot 0 pose le schéma et la valeur de repli. Le remplissage de la base relève du Lot 1.
 */

import { K, ref, type ConstantRef } from '../registry/constants.ts'
import { nombreDeTexte, valide, type DomaineId } from '../registry/domains.ts'
import { ligneFormatCapteur, pitchDepuisFormat, type FormatCapteur } from '../registry/capteur-formats.ts'
import { LIBELLE_ZP_SOURCE } from '../registry/libelles.ts'

/**
 * Les champs optionnels sont ceux que le PRD marque `[À VÉRIFIER]` en Annexe A. Ils restent
 * absents plutôt que remplis d'une valeur plausible : un moteur qui en a besoin doit
 * traiter l'absence, pas consommer une invention.
 */
export interface Boitier {
  readonly id: string
  readonly libelle: string
  readonly capteurLMm: number
  readonly capteurHMm: number
  readonly pitchUm: number
  /** Dimensions du recadrage APS-C. Le pitch, lui, ne change pas (§5.1). */
  readonly recadrageApsc: ModeRecadrage
  /** Bruit de lecture, par ISO. Clé = ISO. */
  readonly readNoiseE: Readonly<Record<number, number>>
  /** Absent → aucun palier ne justifie l'ISO retenu : c'est la saisie qui le fixe (§7.2). */
  readonly seuilDoubleGainIso?: number
  readonly fullWellE?: number
  /** Absent → point zéro générique C-14, affiché [ESTIMÉ] (§2.3). */
  readonly zpSys?: number
  readonly tailleRawMo: number
  readonly source: string
}

/** Dimensions du recadrage APS-C. Le pitch, lui, ne change pas (§5.1). */
export interface ModeRecadrage {
  readonly capteurLMm: number
  readonly capteurHMm: number
}

export type CapteurMode = 'FULL_FRAME' | 'APSC_CROP'

export interface CapteurEffectif {
  readonly capteurLMm: number
  readonly capteurHMm: number
  readonly pitchUm: number
  /** Renseigné au basculement en APS-C : le message anti-confusion de §5.1. */
  readonly noteRecadrage?: string
}

/**
 * Dimensions à donner au moteur optique pour un mode de recadrage donné.
 *
 * LE RECADRAGE NE GROSSIT RIEN : il change `capteur_L_mm` et `capteur_H_mm`, donc le champ,
 * et rien d'autre. Le pitch est inchangé, donc l'échantillonnage, la NPF et la pose max le
 * sont aussi. Un débutant croit très souvent gagner de la portée en passant en APS-C.
 */
export function capteurEffectif(boitier: Boitier, mode: CapteurMode): CapteurEffectif {
  if (mode === 'FULL_FRAME') {
    return {
      capteurLMm: boitier.capteurLMm,
      capteurHMm: boitier.capteurHMm,
      pitchUm: boitier.pitchUm,
    }
  }
  return {
    capteurLMm: boitier.recadrageApsc.capteurLMm,
    capteurHMm: boitier.recadrageApsc.capteurHMm,
    pitchUm: boitier.pitchUm,
    noteRecadrage:
      'Recadrage, pas grossissement : moins de champ, mêmes détails.',
  }
}

/** §7.1 — `zp_source`, à afficher partout où une pose l'est. */
export type ZpSource = 'BASE_MATERIEL' | 'GENERIQUE'

export interface PointZeroSysteme {
  readonly valeur: number
  readonly source: ZpSource
  readonly estime: boolean
  readonly constante: ConstantRef | null
  readonly note?: string
}

/**
 * Point zéro système d'un boîtier. Aucun `zp_sys` connu → générique C-14, affiché [ESTIMÉ], la
 * plage utile de pose absorbant l'incertitude.
 *
 * Le cas normal, y compris pour un boîtier choisi dans la base : la colonne `ZP sys` de
 * `boitiers.md` est vide pour toutes les lignes, cette grandeur n'étant publiée nulle part.
 * La note ne dit donc pas que le boîtier est inconnu — il ne l'est pas — mais que c'est sa
 * sensibilité qui l'est.
 */
export function pointZeroSysteme(boitier: Boitier | null): PointZeroSysteme {
  if (boitier?.zpSys !== undefined) {
    return { valeur: boitier.zpSys, source: 'BASE_MATERIEL', estime: false, constante: null }
  }
  return {
    valeur: K('ZP_SYS_GENERIQUE'),
    source: 'GENERIQUE',
    estime: true,
    constante: ref('ZP_SYS_GENERIQUE'),
    note:
      'Sensibilité type : le point zéro système n’est publié par aucun constructeur. ' +
      'La pose conseillée reste fiable.',
  }
}

export interface IsoRetenu {
  readonly iso: number
  /** `null` quand la base ne donne pas la courbe : le moteur applique alors son repli. */
  readonly readNoiseE: number | null
  /** ISO que le seuil de double gain justifie, quand ce seuil est connu. */
  readonly isoRecommandeParSeuil: number | null
  /** Vrai quand l'ISO affiché n'est pas celui que le double gain recommande. */
  readonly choisiParUtilisateur: boolean
  readonly message: string
}

/**
 * §7.2 — choix de l'ISO par le double gain de conversion.
 *
 * Les capteurs à bascule d'amplification voient leur bruit de lecture chuter brutalement
 * au-delà d'un seuil d'ISO. Or t_opt ∝ RN² : diviser le bruit de lecture par deux divise la
 * pose optimale par quatre. Au-delà du seuil, le bruit ne baisse plus mais la capacité de
 * saturation chute proportionnellement — les étoiles brillantes crament pour rien.
 *
 * L'ISO reste modifiable : le seuil justifie une recommandation, il n'impose pas un réglage.
 * Un ISO hors de la courbe du boîtier ne fait pas inventer un bruit de lecture — il rend
 * `readNoiseE` nul, et le moteur de pose applique son repli en l'affichant [ESTIMÉ] (§5.1).
 */
export function isoRecommande(boitier: Boitier | null, isoChoisi: number | null = null): IsoRetenu {
  if (boitier === null) {
    return {
      iso: isoChoisi ?? 0,
      readNoiseE: null,
      isoRecommandeParSeuil: null,
      choisiParUtilisateur: isoChoisi !== null,
      message:
        'Boîtier inconnu : pas d’ISO conseillé, bruit de lecture estimé [ESTIMÉ].',
    }
  }
  const isos = Object.keys(boitier.readNoiseE)
    .map(Number)
    .sort((a, b) => a - b)
  const seuil = boitier.seuilDoubleGainIso
  const recommande =
    seuil === undefined
      ? (isos[isos.length - 1] ?? null)
      : (isos.find((iso) => iso >= seuil) ?? isos[isos.length - 1] ?? seuil)
  const retenu = isoChoisi ?? recommande ?? 0
  const readNoiseE = boitier.readNoiseE[retenu] ?? null
  return {
    iso: retenu,
    readNoiseE,
    isoRecommandeParSeuil: seuil === undefined ? null : recommande,
    choisiParUtilisateur: isoChoisi !== null && isoChoisi !== recommande,
    message: messageIso(retenu, seuil, recommande, readNoiseE),
  }
}

function messageIso(
  retenu: number,
  seuil: number | undefined,
  recommande: number | null,
  readNoiseE: number | null,
): string {
  const justification =
    seuil === undefined
      ? `ISO ${retenu} : seuil de double gain pas renseigné, pas de meilleur réglage connu.`
      : retenu === recommande
        ? `ISO ${retenu} : le bruit ne baisse plus au-delà (seuil de double gain ${seuil}).`
        : `ISO ${retenu}, choisi à la main : ISO ${String(recommande)} conseillé pour ce ` +
          'boîtier.'
  return readNoiseE === null
    ? `${justification} Bruit de lecture inconnu à cet ISO [ESTIMÉ].`
    : justification
}

/**
 * Boîtier de référence de l'Annexe A : plein format 35,9 × 23,9 mm, 7008 × 4672 px.
 * Bruit de lecture, capacité de saturation et point zéro système sont marqués `[À VÉRIFIER]`
 * par le PRD — seule la valeur de travail sourcée est portée ici.
 *
 * Ne se choisit plus dans une interface : §5.1 ne propose qu'un type de capteur et une
 * résolution, jamais un boîtier. Cette constante reste la donnée de travail de l'Annexe A pour
 * les moteurs et les tests qui la citent.
 */
export const BOITIER_REFERENCE: Boitier = Object.freeze({
  id: 'reference-plein-format-33mp',
  libelle: 'Plein format 33 Mpx (référence Annexe A)',
  capteurLMm: 35.9,
  capteurHMm: 23.9,
  // 35,9 mm / 7008 px = 5,12 µm.
  pitchUm: 5.12,
  recadrageApsc: Object.freeze({ capteurLMm: 23.5, capteurHMm: 15.6 }),
  // Valeur de travail de l'Annexe A, au-delà du seuil de double gain.
  readNoiseE: Object.freeze({ 640: 1.5 }),
  seuilDoubleGainIso: 640,
  tailleRawMo: 33,
  source: 'PRD Annexe A — valeurs de travail ; courbes complètes [À VÉRIFIER] Photons to Photos',
})

/**
 * §5.1 — le boîtier saisi à la main, tel que l'utilisateur le tape : des chaînes, dont les
 * vides sont significatifs. Un champ laissé vide n'est pas zéro, c'est une valeur inconnue.
 *
 * Aucun boîtier ne se choisit dans une liste : les dimensions du capteur et le pitch ne sont
 * jamais tapés non plus. `formatCapteur` fixe les deux premières (table sourcée), et
 * `resolutionMpx` donne le troisième par le calcul. Un débutant lit un type de capteur et une
 * résolution sur une fiche produit, jamais un pitch en micromètres.
 */
export interface SaisieBoitier {
  readonly formatCapteur: FormatCapteur
  readonly resolutionMpx: string
  readonly readNoiseE: string
  readonly seuilDoubleGainIso: string
  readonly fullWellE: string
  readonly zpSys: string
  readonly tailleRawMo: string
}

/**
 * T-0199 — §5.1 : pour chaque grandeur laissée vide, la conséquence chiffrée de son absence.
 *
 * Indexée par champ de saisie, et dérivée de la SAISIE BRUTE, pas du boîtier résolu : c'est
 * quand la saisie est refusée — résolution effacée le temps de la retaper — qu'on a le plus
 * besoin de savoir ce qui manque, et le boîtier n'existe alors pas. Une grandeur vide n'est
 * jamais une erreur ; le texte dit ce que le registre met à sa place, pas ce qu'il faudrait
 * corriger.
 */
export function notesEstimation(
  saisie: SaisieBoitier,
): Readonly<Partial<Record<keyof SaisieBoitier, string>>> {
  const vide = (texte: string): boolean => texte.trim() === ''
  return Object.freeze({
  ...(vide(saisie.readNoiseE)
    ? {
        readNoiseE:
          `Vide : ${K('READ_NOISE_DEFAUT_E')} e⁻ par défaut [ESTIMÉ].`,
      }
    : {}),
  ...(vide(saisie.seuilDoubleGainIso)
    ? {
        seuilDoubleGainIso: vide(saisie.readNoiseE)
          ? 'Vide : pas d’ISO conseillé.'
          : 'Vide : le bruit de lecture saisi ne peut pas servir [ESTIMÉ].',
      }
    : {}),
  ...(vide(saisie.zpSys)
    ? {
        zpSys:
          `Vide : ${K('ZP_SYS_GENERIQUE')} mag par défaut, ` +
          `source ${LIBELLE_ZP_SOURCE.GENERIQUE} [ESTIMÉ].`,
      }
    : {}),
  ...(vide(saisie.tailleRawMo)
    ? {
        tailleRawMo:
          `Vide : ${K('TAILLE_RAW_MO_GENERIQUE')} Mo par défaut [ESTIMÉ].`,
      }
    : {}),
  ...(vide(saisie.fullWellE)
    ? {
        fullWellE:
          'Vide : aucun calcul ne l’utilise pour l’instant.',
      }
    : {}),
  })
}

/** Vide = inconnu ; renseigné = validé par le domaine du registre, refus nommant le champ. */
function champ(texte: string, domaine: DomaineId): number | null {
  if (texte.trim() === '') return null
  return valide(domaine, nombreDeTexte(texte))
}

/** Une grandeur sans laquelle rien ne se calcule : le refus nomme le champ (§5.1). */
function champRequis(texte: string, domaine: DomaineId): number {
  return valide(domaine, nombreDeTexte(texte))
}

/**
 * T-0203 — d'où vient le boîtier, quand il ne vient pas de la saisie : une ligne de la base
 * `boitiers.md`. Elle apporte son identité et, seule chose que la saisie ne sait pas exprimer,
 * la courbe complète du bruit de lecture — un point par ISO au lieu d'un seul.
 */
export interface OrigineBoitier {
  readonly id: string
  readonly libelle: string
  readonly source: string
  readonly readNoiseE: Readonly<Record<number, number>>
}

/**
 * §5.1 — le boîtier tel que la saisie le décrit, ou tel que la base le donne.
 *
 * Le format de capteur et la résolution sont exigés : sans eux, ni champ ni échantillonnage
 * n'existent, et une valeur inventée produirait un cadrage faux sans le dire. Le pitch qui en
 * est dérivé reste validé contre le domaine `pitch_um` — un format et une résolution physique-
 * ment incohérents entre eux sont donc toujours refusés, en nommant le pitch. Les grandeurs du
 * mode avancé, elles, tolèrent l'absence — le registre fournit son repli, l'application
 * l'affiche, et la sortie porte [ESTIMÉ] plutôt que de passer pour une mesure.
 *
 * Une ligne de la base emprunte exactement ce chemin : elle est validée comme une saisie, et
 * n'obtient aucune dispense. `origine` ne remplace que ce que la saisie ne sait pas dire —
 * l'identité du modèle et sa courbe de bruit de lecture complète.
 */
export function resoutBoitier(saisie: SaisieBoitier, origine?: OrigineBoitier): Boitier {
  const format = ligneFormatCapteur(saisie.formatCapteur)
  const resolutionMpx = champRequis(saisie.resolutionMpx, 'resolution_mpx')
  const capteurLMm = format.capteurLMm
  const capteurHMm = format.capteurHMm
  const pitchUm = valide('pitch_um', pitchDepuisFormat(format, resolutionMpx))
  const readNoiseE = champ(saisie.readNoiseE, 'read_noise_e')
  const seuilDoubleGainIso = champ(saisie.seuilDoubleGainIso, 'seuil_double_gain_iso')
  const fullWellE = champ(saisie.fullWellE, 'full_well_e')
  const zpSys = champ(saisie.zpSys, 'zp_sys')
  const tailleRawMo = champ(saisie.tailleRawMo, 'taille_raw_mo')

  return Object.freeze({
    id: origine?.id ?? 'saisi',
    libelle:
      origine?.libelle ??
      `Boîtier saisi — ${format.libelle}, ${resolutionMpx} Mpx, pitch ${pitchUm.toFixed(2)} µm`,
    capteurLMm,
    capteurHMm,
    pitchUm,
    // Le recadrage reste un mode du boîtier : il change les dimensions, jamais le pitch.
    recadrageApsc: Object.freeze(recadrageApsc(capteurLMm, capteurHMm)),
    // Sans courbe de base, le bruit de lecture saisi ne vaut qu'à l'ISO auquel il se rattache :
    // un seul point, et rien ailleurs, plutôt qu'une valeur étendue à des ISO qu'elle ne décrit pas.
    readNoiseE:
      origine?.readNoiseE ??
      Object.freeze(
        readNoiseE === null || seuilDoubleGainIso === null
          ? {}
          : { [seuilDoubleGainIso]: readNoiseE },
      ),
    ...(seuilDoubleGainIso === null ? {} : { seuilDoubleGainIso }),
    ...(fullWellE === null ? {} : { fullWellE }),
    ...(zpSys === null ? {} : { zpSys }),
    tailleRawMo: tailleRawMo ?? K('TAILLE_RAW_MO_GENERIQUE'),
    source: origine?.source ?? 'saisie utilisateur — mode custom',
  })
}

/**
 * §5.1 — le recadrage d'un boîtier saisi : le capteur APS-C de référence, jamais plus grand
 * que le capteur déclaré. Le pitch, lui, ne change pas — c'est tout l'objet du mode.
 */
function recadrageApsc(capteurLMm: number, capteurHMm: number): ModeRecadrage {
  return {
    capteurLMm: Math.min(capteurLMm, BOITIER_REFERENCE.recadrageApsc.capteurLMm),
    capteurHMm: Math.min(capteurHMm, BOITIER_REFERENCE.recadrageApsc.capteurHMm),
  }
}

/**
 * §7.1 — `zp_source` doit être affiché partout où une pose l'est. C'est sa VALEUR que le PRD
 * exige à l'écran, pas le nom du champ : T-0275 rend « source : base matériel » là où la
 * phrase portait « zp_source BASE_MATERIEL ».
 */
export function libelleZpSource(zeroSysteme: PointZeroSysteme): string {
  return (
    `point zéro système ${zeroSysteme.valeur} mag · source : ` +
    LIBELLE_ZP_SOURCE[zeroSysteme.source] +
    (zeroSysteme.estime ? ' [ESTIMÉ]' : '')
  )
}
