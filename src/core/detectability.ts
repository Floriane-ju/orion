/**
 * §6.3 — détectabilité and four verdicts.
 *
 * Integrated magnitude lies: brillance de surface decides. M57, 5 mag fainter than M31, is 18×
 * brighter per arcsec² than a Bortle 4,5 sky; M33, brighter than M57 in integrated magnitude, is
 * 7× fainter than that background.
 * An instrument NEVER raises an extended object's brillance de surface, only apparent size:
 * magnification acts through size via the contraste table, never a nonexistent contrast gain.
 *
 * PHOTO_SEULE isn't a refusal, it's a duration: "invisible" → beginner gives up; "an hour of
 * integration" → gets the intervalometer.
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

/** §6.3 — modulation per object type, direct consequence of the foundation. */
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

/** §6.3 modulation of a type: plan reads its tolerance, fiche its advice. */
export function modulationDuType(type: TypeObjet): ModulationType {
  return MODULATIONS[type]
}

export interface EtatLune {
  /** Lune hauteur at evaluated moment. Negative: not in the computation. */
  readonly altitudeDeg: number
  readonly separationDeg?: number
}

export interface EntreeDetectabilite {
  /** `null` when catalogue gives no magnitude: no verdict produced. */
  readonly mInt: number | null
  readonly aArcmin: number | null
  /** Absent: object assumed round, `b = a`. */
  readonly bArcmin?: number | null
  readonly typeObjet: TypeObjet
  readonly sbCiel: number
  /** `null` outside the Bortle table domain: visual verdicts not evaluated. */
  readonly mLimOeil: number | null
  /** User's instrument diameter, mm. */
  readonly dMm: number
  readonly lune?: EtatLune
}

export interface Detectabilite {
  readonly sbObj: Traced<number | null>
  readonly deltaSb: Traced<number | null>
  /** `null` when source data missing: no estimate produced. */
  readonly verdict: VerdictDetectabilite | null
  readonly toleranceLune: ToleranceLune
  readonly conseilType: string
  /** One sentence: why this magnitude doesn't imply this visibility. */
  readonly explication: string
  readonly noteLune?: string
  /** Magnitude limite reached by the user's instrument. */
  readonly mLimInstr: Traced<number | null>
}

/**
 * T-0383 — amas ouvert is seen by its stars one by one: spreading its magnitude on a uniform
 * disc gave the Pléiades brillance de surface below sky → "photo only". Globulaire stays an
 * unresolved blob by eye/binoculars: contrast criterion fits.
 */
const TYPES_RESOLUS: readonly TypeObjet[] = Object.freeze(['AMAS_OUVERT'])

/** Ellipse area from its two axes, arcsec². */
export function aireEllipseArcsec2(aArcmin: number, bArcmin: number): number {
  return (
    (Math.PI / K('AIRE_ELLIPSE_DIAMETRES')) *
    ARCSEC_PAR_ARCMIN *
    ARCSEC_PAR_ARCMIN *
    aArcmin *
    bArcmin
  )
}

/** Magnitude limite gain brought by a diameter, vs adapted eye (C-11). */
export function gainInstrumental(dMm: number): number {
  return 2 * K('POGSON') * Math.log10(dMm / K('PUPILLE_OEIL_ADAPTE_MM'))
}

/** Magnification at full exit pupil: the setting favouring detection. */
export function grossissement(dMm: number): number {
  return dMm / K('PUPILLE_OEIL_ADAPTE_MM')
}

/**
 * Visual detection of an extended object: magnitude limite AND sufficient contrast at apparent
 * size. Point object escapes the 2nd criterion (no usable brillance de surface).
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
  // T-0383 — type advice often talks of light pollution: beside the Lune line it contradicted
  // the lunar degradation. Fiche shows it apart.
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

/** The four verdicts, evaluated in order: first satisfied wins. */
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

/** How many times the sky background is brighter than the object, per arcsec². */
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
