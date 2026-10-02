/**
 * §6.3 — Détectabilité et quatre verdicts.
 *
 * La magnitude intégrée ment : c'est la brillance de surface qui décide. M57, cinq
 * magnitudes plus faible que M31, est dix-huit fois plus brillante par seconde d'arc au
 * carré qu'un ciel Bortle 4,5 ; M33, plus brillante que M57 en magnitude intégrée, est sept
 * fois plus faible que ce même fond de ciel.
 *
 * Et un instrument N'AUGMENTE JAMAIS la brillance de surface d'un objet étendu : il
 * augmente sa taille apparente. C'est par la taille, via la table de contraste, que le
 * grossissement joue — jamais par un gain de contraste qui n'existe pas.
 *
 * PHOTO_SEULE n'est pas un refus : c'est une durée. Le débutant qui lit « invisible »
 * abandonne, celui qui lit « une heure d'intégration » sort son intervallomètre.
 */

import { K } from '../registry/constants.ts'
import { degres, nombre } from '../registry/ecriture.ts'
import { seuilContraste } from '../registry/contrast.ts'
import type { FormulaId } from '../registry/formulas.ts'
import type { TypeObjet } from '../data/deepsky.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { rapportDeFlux } from './exposure.ts'
import { ARCSEC_PAR_ARCMIN } from './unites.ts'


export type VerdictDetectabilite = 'OEIL_NU' | 'JUMELLES' | 'TELESCOPE' | 'PHOTO_SEULE'
export type ToleranceLune = 'FORTE' | 'MOYENNE' | 'FAIBLE'

export interface ModulationType {
  readonly toleranceLune: ToleranceLune
  readonly conseil: string
}

/** §6.3 — modulation par type d'objet, conséquence directe du socle. */
const MODULATIONS: Readonly<Record<TypeObjet, ModulationType>> = Object.freeze({
  EMISSION: {
    toleranceLune: 'FORTE',
    conseil:
      'Nébuleuse en émission : avec un filtre bi-bande, la Lune et un ciel moyen passent. ' +
      'Sans filtre, déconseillée.',
  },
  RESTE_SUPERNOVA: {
    toleranceLune: 'FORTE',
    conseil:
      'Reste de supernova : avec un filtre bi-bande, la Lune passe.',
  },
  NEB_PLANETAIRE: {
    toleranceLune: 'FORTE',
    conseil: 'Nébuleuse planétaire : la Lune gêne peu, une longue focale aide.',
  },
  AMAS_OUVERT: {
    toleranceLune: 'MOYENNE',
    conseil: 'Amas : peu gêné par la pollution lumineuse.',
  },
  AMAS_GLOB: {
    toleranceLune: 'MOYENNE',
    conseil: 'Amas : peu gêné par la pollution lumineuse.',
  },
  GALAXIE: {
    toleranceLune: 'FAIBLE',
    conseil:
      'Galaxie : aucun filtre n’aide, il faut un ciel noir et la Lune couchée.',
  },
  REFLEXION: {
    toleranceLune: 'FAIBLE',
    conseil:
      'Nébuleuse par réflexion : aucun filtre n’aide, il faut un ciel très noir.',
  },
  NEB_OBSCURE: {
    toleranceLune: 'FAIBLE',
    conseil:
      'Nébuleuse obscure : aucun filtre n’aide, il faut le ciel le plus noir possible.',
  },
  INCONNU: {
    toleranceLune: 'MOYENNE',
    conseil: 'Type d’objet inconnu.',
  },
  AUTRE: {
    toleranceLune: 'MOYENNE',
    conseil: 'Type d’objet non pris en compte.',
  },
})

/** La modulation §6.3 d'un type : le plan en lit la tolérance, la fiche le conseil. */
export function modulationDuType(type: TypeObjet): ModulationType {
  return MODULATIONS[type]
}

export interface EtatLune {
  /** Hauteur de la Lune au moment évalué. Négative : elle n'entre pas dans le calcul. */
  readonly altitudeDeg: number
  readonly separationDeg?: number
}

export interface EntreeDetectabilite {
  /** `null` quand le catalogue ne donne pas la magnitude : aucun verdict n'est produit. */
  readonly mInt: number | null
  readonly aArcmin: number | null
  /** Absent : l'objet est supposé rond, `b = a`. */
  readonly bArcmin?: number | null
  readonly typeObjet: TypeObjet
  readonly sbCiel: number
  /** `null` hors du domaine de la table Bortle : les verdicts visuels ne sont pas évalués. */
  readonly mLimOeil: number | null
  /** Diamètre de l'instrument de l'utilisateur, mm. */
  readonly dMm: number
  readonly lune?: EtatLune
}

export interface Detectabilite {
  readonly sbObj: Traced<number | null>
  readonly deltaSb: Traced<number | null>
  /** `null` quand la donnée source manque : aucune estimation n'est produite. */
  readonly verdict: VerdictDetectabilite | null
  readonly toleranceLune: ToleranceLune
  readonly conseilType: string
  /** Une phrase : pourquoi cette magnitude n'implique pas cette visibilité. */
  readonly explication: string
  readonly noteLune?: string
  /** Magnitude limite atteinte par l'instrument de l'utilisateur. */
  readonly mLimInstr: Traced<number | null>
}

/**
 * T-0383 — un amas ouvert se voit par ses étoiles, une à une : étaler sa magnitude sur un
 * disque uniforme donnait aux Pléiades une brillance de surface sous le ciel, donc « en photo
 * seulement ». Un globulaire, lui, reste une tache non résolue à l'œil et aux jumelles : le
 * critère de contraste lui convient.
 */
const TYPES_RESOLUS: readonly TypeObjet[] = Object.freeze(['AMAS_OUVERT'])

/** Aire d'une ellipse donnée par ses deux axes, en secondes d'arc au carré. */
export function aireEllipseArcsec2(aArcmin: number, bArcmin: number): number {
  return (
    (Math.PI / K('AIRE_ELLIPSE_DIAMETRES')) *
    ARCSEC_PAR_ARCMIN *
    ARCSEC_PAR_ARCMIN *
    aArcmin *
    bArcmin
  )
}

/** Gain en magnitude limite apporté par un diamètre, contre l'œil adapté (C-11). */
export function gainInstrumental(dMm: number): number {
  return 2 * K('POGSON') * Math.log10(dMm / K('PUPILLE_OEIL_ADAPTE_MM'))
}

/** Grossissement à pupille de sortie pleine : le réglage qui favorise la détection. */
export function grossissement(dMm: number): number {
  return dMm / K('PUPILLE_OEIL_ADAPTE_MM')
}

/**
 * Détection visuelle d'un objet étendu : magnitude limite ET contraste suffisant à la
 * taille apparente. Un objet ponctuel échappe au second critère — il n'a pas de brillance
 * de surface exploitable.
 */
function detecteVisuellement(
  mInt: number,
  mLim: number,
  deltaSb: number,
  tailleApparenteArcmin: number,
  resolu: boolean,
): boolean {
  if (mInt > mLim) return false
  if (resolu) return true
  const seuil = seuilContraste(tailleApparenteArcmin)
  return seuil === null || deltaSb >= seuil
}

function manquant(champ: string, formula: FormulaId): Traced<number | null> {
  return trace({
    value: null,
    formula,
    flags: ['DONNEE_MANQUANTE'],
    note:
      `${champ} absente du catalogue : pas de calcul possible.`,
  })
}

export function detectabilite(entree: EntreeDetectabilite): Detectabilite {
  const { mInt, aArcmin, typeObjet, sbCiel, mLimOeil, dMm } = entree
  const bArcmin = entree.bArcmin ?? aArcmin
  const modulation = MODULATIONS[typeObjet]
  // T-0383 — le conseil du type parle souvent de pollution lumineuse : collé à la ligne Lune,
  // il contredisait la dégradation lunaire. La fiche l'affiche à part.
  const noteLune = messageLune(entree.lune)

  if (mInt === null || aArcmin === null || bArcmin === null) {
    const champ = mInt === null ? 'Magnitude intégrée' : 'Dimensions'
    return {
      sbObj: manquant(champ, 'BRILLANCE_SURFACE'),
      deltaSb: manquant(champ, 'CONTRASTE'),
      verdict: null,
      toleranceLune: modulation.toleranceLune,
      conseilType: modulation.conseil,
      explication:
        `${champ} absente du catalogue : pas de verdict pour cette cible.`,
      mLimInstr: manquant(champ, 'MAGNITUDE_LIMITE_INSTRUMENT'),
      ...(noteLune === undefined ? {} : { noteLune }),
    }
  }

  const aire = aireEllipseArcsec2(aArcmin, bArcmin)
  const sbObjValeur = mInt + K('POGSON') * Math.log10(aire)
  const deltaSbValeur = sbCiel - sbObjValeur
  const tailleReelleArcmin = Math.sqrt(aArcmin * bArcmin)
  const gain = gainInstrumental(dMm)

  const sbObj = trace({
    value: sbObjValeur,
    formula: 'BRILLANCE_SURFACE',
    inputs: { m_int: mInt, a_arcmin: aArcmin, b_arcmin: bArcmin, aire_arcsec2: aire },
    constants: ['POGSON', 'AIRE_ELLIPSE_DIAMETRES'],
  })
  const deltaSb = trace({
    value: deltaSbValeur,
    formula: 'CONTRASTE',
    inputs: { sb_ciel: sbCiel, sb_obj: sbObjValeur },
  })
  const mLimInstr = trace({
    value: mLimOeil === null ? null : mLimOeil + gain,
    formula: 'MAGNITUDE_LIMITE_INSTRUMENT',
    inputs: { m_lim_oeil: mLimOeil, gain_mag: gain, d_mm: dMm },
    constants: ['PUPILLE_OEIL_ADAPTE_MM', 'POGSON'],
    ...(mLimOeil === null
      ? {
          flags: ['DONNEE_MANQUANTE' as const],
          note:
            'Ciel hors de l’échelle de Bortle : observation à l’œil non évaluée.',
        }
      : {}),
  })

  const resolu = TYPES_RESOLUS.includes(typeObjet)
  const verdict = verdictVisuel({
    mInt,
    mLimOeil,
    deltaSb: deltaSbValeur,
    tailleReelleArcmin,
    dMm,
    resolu,
  })

  return {
    sbObj,
    deltaSb,
    verdict,
    toleranceLune: modulation.toleranceLune,
    conseilType: modulation.conseil,
    explication: explique(verdict, mInt, sbObjValeur, sbCiel, deltaSbValeur, mLimOeil, resolu),
    mLimInstr,
    ...(noteLune === undefined ? {} : { noteLune }),
  }
}

interface EntreeVerdict {
  readonly mInt: number
  readonly mLimOeil: number | null
  readonly deltaSb: number
  readonly tailleReelleArcmin: number
  readonly dMm: number
  readonly resolu: boolean
}

/** Les quatre verdicts, évalués dans l'ordre : le premier satisfait gagne. */
function verdictVisuel(e: EntreeVerdict): VerdictDetectabilite {
  if (e.mLimOeil === null) return 'PHOTO_SEULE'

  if (detecteVisuellement(e.mInt, e.mLimOeil, e.deltaSb, e.tailleReelleArcmin, e.resolu)) {
    return 'OEIL_NU'
  }

  const dJumelles = K('PUPILLE_JUMELLES_MM')
  const mLimJumelles = e.mLimOeil + gainInstrumental(dJumelles)
  if (
    detecteVisuellement(
      e.mInt,
      mLimJumelles,
      e.deltaSb,
      e.tailleReelleArcmin * grossissement(dJumelles),
      e.resolu,
    )
  ) {
    return 'JUMELLES'
  }

  const mLimInstr = e.mLimOeil + gainInstrumental(e.dMm)
  if (
    detecteVisuellement(
      e.mInt,
      mLimInstr,
      e.deltaSb,
      e.tailleReelleArcmin * grossissement(e.dMm),
      e.resolu,
    )
  ) {
    return 'TELESCOPE'
  }

  return 'PHOTO_SEULE'
}

/** Combien de fois le fond de ciel est plus brillant que l'objet, par arcsec². */
export function rapportAuFondDeCiel(deltaSb: number): number {
  return rapportDeFlux(deltaSb)
}

function explique(
  verdict: VerdictDetectabilite,
  mInt: number,
  sbObj: number,
  sbCiel: number,
  deltaSb: number,
  mLimOeil: number | null,
  resolu: boolean,
): string {
  if (resolu && verdict !== 'PHOTO_SEULE') {
    return (
      `Amas d’étoiles : ce sont ses étoiles qui se voient, et sa magnitude ` +
      `${nombre(mInt, 1)} le met à portée — sa brillance de surface ne compte pas.`
    )
  }
  if (verdict === 'PHOTO_SEULE' && deltaSb < 0 && !resolu) {
    return (
      `Objet ${nombre(rapportAuFondDeCiel(deltaSb), 0)} fois plus pâle que le ciel ` +
      `(${nombre(sbObj, 2)} contre ${nombre(sbCiel, 2)}) : invisible à l’œil, mais une ` +
      'longue pose le fera apparaître.'
    )
  }
  if (verdict === 'PHOTO_SEULE') {
    return (
      `Trop faible pour l’œil${mLimOeil === null ? '' : ' depuis ce site'} (magnitude ` +
      `${nombre(mInt, 1)}) : une longue pose le fera apparaître.`
    )
  }
  return (
    `Assez contrasté pour être vu à sa taille (écart ${nombre(deltaSb, 2)} mag/arcsec²).`
  )
}

function messageLune(lune: EtatLune | undefined): string | undefined {
  if (lune === undefined) return undefined
  if (lune.altitudeDeg <= 0) {
    return (
      'Lune couchée : aucune gêne.'
    )
  }
  return (
    `Lune levée à ${degres(lune.altitudeDeg, 0)} de hauteur` +
    `${lune.separationDeg === undefined ? '' : `, à ${degres(lune.separationDeg, 0)} de la cible`}` +
    '.'
  )
}
