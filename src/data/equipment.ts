/**
 * §2.3 — Equipment base: system zero point + sensor quantities.
 * `ZP_sys` = sky brightness giving 1 e⁻/s/px for a 1 µm pixel at f/1. Derived offline from
 * bandpass photometric zero point, sensor QE, optical transmission, gain e⁻/ADU (manufacturer QE
 * curves, Photons to Photos gain measurements).
 * NO calibration function, no screen inviting one: pose optimum is flat, ×2 error = 2–5 SNR
 * points, absorbed by displayed useful range (`PLAGE_UTILE_POSE` in `exposure.ts`, shown on fiche
 * cible). SNR loss shown nowhere; formula stays in Annexe B form `PERTE_SNR` (T-0063).
 * Lot 0 = schema + fallback value; filling the base = Lot 1.
 */

import { K, ref, type ConstantRef } from '../registry/constants.ts'
import { nombre, nombreLibre } from '../registry/ecriture.ts'
import { nombreDeTexte, valide, type DomaineId } from '../registry/domains.ts'
import { ligneFormatCapteur, pitchDepuisFormat, type FormatCapteur } from '../registry/capteur-formats.ts'
import { LIBELLE_ZP_SOURCE } from '../registry/libelles.ts'

/**
 * Optional fields = those PRD marks `[À VÉRIFIER]` in Annexe A. Left absent, not filled with a
 * plausible value: engines must handle absence, not consume an invention.
 */
export interface Boitier {
  readonly id: string
  readonly libelle: string
  readonly capteurLMm: number
  readonly capteurHMm: number
  readonly pitchUm: number
  /** APS-C crop dimensions. Pitch unchanged (§5.1). */
  readonly recadrageApsc: ModeRecadrage
  /** Read noise per ISO. Key = ISO. */
  readonly readNoiseE: Readonly<Record<number, number>>
  /** Absent → no tier justifies chosen ISO: input sets it (§7.2). */
  readonly seuilDoubleGainIso?: number
  /** Absent → generic zero point C-14, shown [ESTIMÉ] (§2.3). */
  readonly zpSys?: number
  readonly tailleRawMo: number
  readonly source: string
}

/** APS-C crop dimensions. Pitch unchanged (§5.1). */
export interface ModeRecadrage {
  readonly capteurLMm: number
  readonly capteurHMm: number
}

export type CapteurMode = 'FULL_FRAME' | 'APSC_CROP'

export interface CapteurEffectif {
  readonly capteurLMm: number
  readonly capteurHMm: number
  readonly pitchUm: number
  /** Set on APS-C switch: §5.1 anti-confusion message. */
  readonly noteRecadrage?: string
}

/**
 * Dimensions for the optics engine in a crop mode.
 * CROP MAGNIFIES NOTHING: changes `capteur_L_mm`/`capteur_H_mm` (field) only. Pitch unchanged →
 * sampling, NPF, pose max unchanged. Beginners think APS-C adds reach.
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

/** §7.1 — `zp_source`, shown wherever a pose is. */
export type ZpSource = 'BASE_MATERIEL' | 'GENERIQUE'

export interface PointZeroSysteme {
  readonly valeur: number
  readonly source: ZpSource
  readonly estime: boolean
  readonly constante: ConstantRef | null
  readonly note?: string
}

/**
 * System zero point of a body. No known `zp_sys` → generic C-14, [ESTIMÉ]; useful pose range
 * absorbs the uncertainty.
 * Normal case even for a base body: `ZP sys` column of `boitiers.md` empty for all rows (value
 * published nowhere). Note says sensitivity is unknown, not the body.
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
  /** `null` = base lacks curve: engine falls back. */
  readonly readNoiseE: number | null
  /** ISO justified by dual-gain threshold, if known. */
  readonly isoRecommandeParSeuil: number | null
  /** True when displayed ISO ≠ dual-gain recommendation. */
  readonly choisiParUtilisateur: boolean
  readonly message: string
}

/**
 * §7.2 — ISO choice by dual conversion gain.
 * Amplification-switch sensors: read noise drops sharply past an ISO threshold. t_opt ∝ RN²:
 * halving RN quarters optimal pose. Past threshold noise stops dropping but saturation capacity
 * falls proportionally — bright stars burn for nothing.
 * ISO stays editable: threshold justifies a recommendation, imposes nothing. ISO outside body's
 * curve invents no read noise: `readNoiseE` null, pose engine falls back, shown [ESTIMÉ] (§5.1).
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
 * Annexe A reference body: plein format 35,9 × 23,9 mm, 7008 × 4672 px.
 * Read noise + system zero point are `[À VÉRIFIER]` in PRD: only sourced working value carried.
 * Not selectable in UI (§5.1 offers sensor type + resolution, never a body); stays Annexe A
 * working data for engines and tests citing it.
 */
export const BOITIER_REFERENCE: Boitier = Object.freeze({
  id: 'reference-plein-format-33mp',
  libelle: 'Plein format 33 Mpx (référence Annexe A)',
  capteurLMm: 35.9,
  capteurHMm: 23.9,
  // 35,9 mm / 7008 px = 5,12 µm.
  pitchUm: 5.12,
  recadrageApsc: Object.freeze({ capteurLMm: 23.5, capteurHMm: 15.6 }),
  // Annexe A working value, beyond dual-gain threshold.
  readNoiseE: Object.freeze({ 640: 1.5 }),
  seuilDoubleGainIso: 640,
  tailleRawMo: 33,
  source: 'PRD Annexe A — valeurs de travail ; courbes complètes [À VÉRIFIER] Photons to Photos',
})

/**
 * §5.1 — hand-entered body as typed: strings, empty ones meaningful (empty = unknown, not zero).
 * Dimensions and pitch are never typed: `formatCapteur` fixes the first two (sourced table),
 * `resolutionMpx` gives the third by computation. Beginners read sensor type + resolution on a
 * product sheet, never a pitch in µm.
 */
export interface SaisieBoitier {
  readonly formatCapteur: FormatCapteur
  readonly resolutionMpx: string
  readonly readNoiseE: string
  readonly seuilDoubleGainIso: string
  readonly zpSys: string
  readonly tailleRawMo: string
}

/**
 * T-0199 — §5.1: per empty field, quantified consequence of its absence.
 * Indexed by input field, derived from RAW INPUT not resolved body: when input is refused
 * (resolution cleared while retyping), knowing what's missing matters most and no body exists.
 * Empty quantity is never an error; text says what registry substitutes, not what to fix.
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
          `Vide : ${nombreLibre(K('ZP_SYS_GENERIQUE'))} mag par défaut, ` +
          `source ${LIBELLE_ZP_SOURCE.GENERIQUE} [ESTIMÉ].`,
      }
    : {}),
  ...(vide(saisie.tailleRawMo)
    ? {
        tailleRawMo:
          `Vide : ${K('TAILLE_RAW_MO_GENERIQUE')} Mo par défaut [ESTIMÉ].`,
      }
    : {}),
  })
}

/** Empty = unknown; filled = validated by registry domain, refusal names field. */
function champ(texte: string, domaine: DomaineId): number | null {
  if (texte.trim() === '') return null
  return valide(domaine, nombreDeTexte(texte))
}

/** Quantity without which nothing computes: refusal names the field (§5.1). */
function champRequis(texte: string, domaine: DomaineId): number {
  return valide(domaine, nombreDeTexte(texte))
}

/**
 * T-0203 — body source when not input: a `boitiers.md` row. Brings identity and, what input
 * cannot express, the full read-noise curve (1 point per ISO instead of 1).
 */
export interface OrigineBoitier {
  readonly id: string
  readonly libelle: string
  readonly source: string
  readonly readNoiseE: Readonly<Record<number, number>>
}

/**
 * §5.1 — body as described by input, or as given by base.
 * Sensor format + resolution required: without them no field nor sampling, and an invented value
 * would silently give a wrong cadrage. Derived pitch validated against `pitch_um` domain, so
 * physically inconsistent format/resolution always refused, naming pitch. Advanced quantities
 * tolerate absence: registry fallback, shown, output [ESTIMÉ] not posing as measurement.
 * A base row takes this exact path, no exemption; `origine` replaces only what input cannot say:
 * model identity + full read-noise curve.
 */
export function resoutBoitier(saisie: SaisieBoitier, origine?: OrigineBoitier): Boitier {
  const format = ligneFormatCapteur(saisie.formatCapteur)
  const resolutionMpx = champRequis(saisie.resolutionMpx, 'resolution_mpx')
  const capteurLMm = format.capteurLMm
  const capteurHMm = format.capteurHMm
  const pitchUm = valide('pitch_um', pitchDepuisFormat(format, resolutionMpx))
  const readNoiseE = champ(saisie.readNoiseE, 'read_noise_e')
  const seuilDoubleGainIso = champ(saisie.seuilDoubleGainIso, 'seuil_double_gain_iso')
  const zpSys = champ(saisie.zpSys, 'zp_sys')
  const tailleRawMo = champ(saisie.tailleRawMo, 'taille_raw_mo')

  return Object.freeze({
    id: origine?.id ?? 'saisi',
    libelle:
      origine?.libelle ??
      `Boîtier saisi — ${format.libelle}, ${nombreLibre(resolutionMpx)} Mpx, pitch ${nombre(pitchUm, 2)} µm`,
    capteurLMm,
    capteurHMm,
    pitchUm,
    // Crop stays a body mode: changes dimensions, never pitch.
    recadrageApsc: Object.freeze(recadrageApsc(capteurLMm, capteurHMm)),
    // No base curve: entered read noise holds at its ISO only (one point), not extended to
    // ISOs it doesn't describe.
    readNoiseE:
      origine?.readNoiseE ??
      Object.freeze(
        readNoiseE === null || seuilDoubleGainIso === null
          ? {}
          : { [seuilDoubleGainIso]: readNoiseE },
      ),
    ...(seuilDoubleGainIso === null ? {} : { seuilDoubleGainIso }),
    ...(zpSys === null ? {} : { zpSys }),
    tailleRawMo: tailleRawMo ?? K('TAILLE_RAW_MO_GENERIQUE'),
    source: origine?.source ?? 'saisie utilisateur — mode custom',
  })
}

/**
 * §5.1 — crop of an entered body: reference APS-C sensor, never larger than declared sensor.
 * Pitch unchanged: the point of the mode.
 */
function recadrageApsc(capteurLMm: number, capteurHMm: number): ModeRecadrage {
  return {
    capteurLMm: Math.min(capteurLMm, BOITIER_REFERENCE.recadrageApsc.capteurLMm),
    capteurHMm: Math.min(capteurHMm, BOITIER_REFERENCE.recadrageApsc.capteurHMm),
  }
}

/**
 * §7.1 — `zp_source` shown wherever a pose is: PRD requires its VALUE, not field name (T-0275:
 * « source : base matériel » instead of « zp_source BASE_MATERIEL »).
 */
export function libelleZpSource(zeroSysteme: PointZeroSysteme): string {
  return (
    `point zéro système ${nombreLibre(zeroSysteme.valeur)} mag · source : ` +
    LIBELLE_ZP_SOURCE[zeroSysteme.source] +
    (zeroSysteme.estime ? ' [ESTIMÉ]' : '')
  )
}
