/**
 * §8.4 — star hopping (cheminement) + pointage map.
 * Link between "app recommends a target" and "target is in frame" for a motorized mount without
 * go-to.
 * Need depends on field. 120 mm full frame covers 17°: traditional cheminement (successive hops
 * in a narrow finder) overkill, frame always holds several bright stars. Below 8° needed again.
 * ORIENTATION IS AN OUTPUT: field rotates through night in observer frame; unoriented schema
 * unusable in the dark.
 * MISE EN STATION STAYS THE USER'S JOB: app helps find objects, claims neither to measure nor
 * correct setup.
 * T-0287 — SCHEMA RENDERED ZENITH-UP, NOT FRAME-UP (message announced a rotation nobody applied).
 * Eye orientation over boîtier: boîtier rotation on mount is undeclared → upright "frame"
 * rectangle = invented orientation, while "zenith is up" is true for anyone looking up. Frame
 * only CHOOSES anchors; not drawn.
 * Output positions = fraction of diameter of a disc whose radius = frame half-diagonal (corner
 * anchor lands exactly on edge). Component redoes no rotation/scaling: places percentages.
 */

import { K } from '../registry/constants.ts'
import { degres, nombre, nombreLibre } from '../registry/ecriture.ts'
import type { Etoile } from '../data/catalog.ts'
import { nomComplet, type EtoileNommee } from '../data/constellations.ts'
import type { Site } from './ephem.ts'
import { tempsSideralLocal } from './ephem.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import {
  DEG,
  separationDeg,
  separationEquatorialeDeg,
  versSpherique,
  versVecteur,
  type Vec3,
} from './mat3.ts'
import { DEG_PAR_HEURE } from './unites.ts'


export type ModePointage = 'CARTE_DIRECTE' | 'CHEMINEMENT'

export interface Ancrage {
  readonly adH: number
  readonly decDeg: number
  readonly magV: number
  /** Name/designation if §3.4 packet has one, else empty string. */
  readonly nom: string
  /** Position in frame, fraction of width and height, origin at center. */
  readonly xCadre: number
  readonly yCadre: number
  /** Zenith-up schema position, diameter fraction, origin center, x right, y up. Rendered as is. */
  readonly xDisque: number
  readonly yDisque: number
  /** Quantified offsets toward target, for setting circles or slow-motion cables (§8.4). */
  readonly deltaAdH: number
  readonly deltaDecDeg: number
  readonly separationDeg: number
  /** Main anchor: brightest, under reliable magnitude in degraded sky. */
  readonly principal: boolean
}

/**
 * §8.4 — one path point, in traversal order. Neither `Saut` nor `Ancrage`: common denominator
 * of both modes, all DRAWING needs.
 */
export interface EtapeParcours {
  readonly ordre: number
  readonly adH: number
  readonly decDeg: number
  readonly nom: string
}

export interface Saut {
  readonly ordre: number
  readonly adH: number
  readonly decDeg: number
  readonly magV: number
  /** Name/designation if §3.4 packet has one, else empty string. */
  readonly nom: string
  readonly distanceDeg: number
}

export interface CartePointage {
  readonly mode: ModePointage
  readonly ancrages: readonly Ancrage[]
  readonly sauts: readonly Saut[]
  /** Zenith position angle: real schema orientation at this instant. */
  readonly angleOrientationDeg: Traced<number>
  /**
   * Celestial north on zenith-up schema, at disc edge, same frame as `xDisque` / `yDisque`
   * (zenith up by construction).
   */
  readonly xNord: number
  readonly yNord: number
  readonly deltaAdH: number
  readonly deltaDecDeg: number
  readonly message: string
  /** Set when no anchor or route is proposable. */
  readonly cause?: string
  /** Constraints user may relax, instead of an invented route. */
  readonly contraintesARelacher?: readonly string[]
}

export interface EntreePointage {
  readonly site: Site
  readonly date: Date
  readonly adCibleH: number
  readonly decCibleDeg: number
  readonly fovHDeg: number
  readonly fovLDeg: number
  /** Site naked-eye limiting magnitude (§2.2): drives anchor choice. */
  readonly mLimOeil: number | null
  /** Finder field, when user declares one. */
  readonly fovChercheurDeg?: number
  readonly etoiles: readonly Etoile[]
  /** §3.4 named-stars packet: names the anchors and hops. */
  readonly nommees: readonly EtoileNommee[]
}

// Geometry


/** Zenith position angle (parallactic) at pointage instant: field's real up/down for the eye. */
export function angleOrientation(
  site: Site,
  date: Date,
  adH: number,
  decDeg: number,
): Traced<number> {
  const tsl = tempsSideralLocal(date, site.longitudeDeg)
  const angleHoraire = (tsl.value - adH) * DEG_PAR_HEURE * DEG
  const latitude = site.latitudeDeg * DEG
  const declinaison = decDeg * DEG
  const q =
    Math.atan2(
      Math.sin(angleHoraire),
      Math.tan(latitude) * Math.cos(declinaison) -
        Math.sin(declinaison) * Math.cos(angleHoraire),
    ) / DEG
  return trace({
    value: q,
    formula: 'ANGLE_ZENITH',
    inputs: {
      tsl_h: tsl.value,
      ad_h: adH,
      dec_deg: decDeg,
      latitude_deg: site.latitudeDeg,
    },
    note: 'Le ciel tourne : ce schéma vaut pour cette heure-là.',
  })
}

/**
 * T-0287 — name §3.4 packet gives this position, empty if none. Matched by position, not id:
 * §12.2 binary catalogue = 12 bytes/star, no name field. Both packets from same HYG row → gap is
 * float32 encoding.
 * Linear scan on purpose: 546 named stars vs few dozen anchors, an index costs more than it saves.
 */
function nomEtoile(
  nommees: readonly EtoileNommee[],
  adDeg: number,
  decDeg: number,
): string {
  const tolerance = K('TOLERANCE_APPARIEMENT_ETOILE_DEG')
  for (const nommee of nommees) {
    if (Math.abs(nommee.decDeg - decDeg) > tolerance) continue
    if (Math.abs(nommee.adDeg - adDeg) > tolerance) continue
    return nomComplet(nommee)
  }
  return ''
}

/** Position on zenith-up disc, fraction of diameter (§8.4, T-0287). */
interface SurDisque {
  readonly xDisque: number
  readonly yDisque: number
}

/**
 * Equatorial → observer frame.
 * Pre-rotation schema = every sky chart: north up, east LEFT (naked-eye view, not mirror). Point
 * of position angle `p` at `(−sin p, cos p)`, `y` up.
 * Parallactic angle `q` = zenith position angle. Rotating all by `q` clockwise brings zenith up,
 * north to `(sin q, cos q)`.
 */
function surDisque(estDeg: number, nordDeg: number, rayonDeg: number, qDeg: number): SurDisque {
  const q = qDeg * DEG
  const x = -estDeg
  const y = nordDeg
  return {
    xDisque: (x * Math.cos(q) + y * Math.sin(q)) / (2 * rayonDeg),
    yDisque: (-x * Math.sin(q) + y * Math.cos(q)) / (2 * rayonDeg),
  }
}

/** Schema radius: frame half-diagonal, so a corner anchor lands on edge. */
function rayonDisqueDeg(entree: EntreePointage): number {
  return Math.hypot(entree.fovLDeg, entree.fovHDeg) / 2
}

/** Celestial north at disc edge once zenith is up (T-0287). */
function directionNord(qDeg: number): { readonly xNord: number; readonly yNord: number } {
  const q = qDeg * DEG
  return { xNord: Math.sin(q) / 2, yNord: Math.cos(q) / 2 }
}

/** What schema shows, in words: sentence and drawing read the same angle, can't diverge. */
function phraseOrientation(qDeg: number): string {
  return (
    'Schéma orienté zénith en haut : le nord céleste, marqué dessus, fait ' +
    `${degres(Math.abs(qDeg), 0)} avec la verticale.`
  )
}

/** Star designated by name when catalogue gives one, else by magnitude. */
function designe(etoile: { readonly nom: string; readonly magV: number }): string {
  const magnitude = `magnitude ${nombre(etoile.magV, 1)}`
  return etoile.nom === '' ? `une étoile sans nom, ${magnitude}` : `${etoile.nom}, ${magnitude}`
}

// §8.4 — carte directe (direct map)

function ancrage(
  entree: EntreePointage,
  etoile: Etoile,
  principal: boolean,
  qDeg: number,
): Ancrage {
  const adH = etoile.adDeg / DEG_PAR_HEURE
  const dAd = adH - entree.adCibleH
  const dDec = etoile.decDeg - entree.decCibleDeg
  // Local projection: at frame scale, meridian convergence = cos(target declination).
  const dx = dAd * DEG_PAR_HEURE * Math.cos(entree.decCibleDeg * DEG)
  return {
    adH,
    decDeg: etoile.decDeg,
    magV: etoile.magV,
    nom: nomEtoile(entree.nommees, etoile.adDeg, etoile.decDeg),
    xCadre: dx / entree.fovLDeg,
    yCadre: dDec / entree.fovHDeg,
    ...surDisque(dx, dDec, rayonDisqueDeg(entree), qDeg),
    deltaAdH: entree.adCibleH - adH,
    deltaDecDeg: entree.decCibleDeg - etoile.decDeg,
    separationDeg: separationEquatorialeDeg(
      adH,
      etoile.decDeg,
      entree.adCibleH,
      entree.decCibleDeg,
    ),
    principal,
  }
}

function dansLeCadre(entree: EntreePointage, etoile: Etoile): boolean {
  const dAd = etoile.adDeg / DEG_PAR_HEURE - entree.adCibleH
  const dx = Math.abs(dAd * DEG_PAR_HEURE * Math.cos(entree.decCibleDeg * DEG))
  const dy = Math.abs(etoile.decDeg - entree.decCibleDeg)
  return dx <= entree.fovLDeg / 2 && dy <= entree.fovHDeg / 2
}

function carteDirecte(entree: EntreePointage): CartePointage {
  const orientation = angleOrientation(entree.site, entree.date, entree.adCibleH, entree.decCibleDeg)
  const magLimite = entree.mLimOeil
  const visibles = entree.etoiles
    .filter((e) => dansLeCadre(entree, e))
    .filter((e) => magLimite === null || e.magV <= magLimite)
    .slice()
    .sort((a, b) => a.magV - b.magV)

  const principale = visibles.find((e) => e.magV <= K('MAG_ANCRAGE_PRINCIPAL_MAX'))
  const ancrages = visibles.map((e) => ancrage(entree, e, e === principale, orientation.value))
  const commun = {
    mode: 'CARTE_DIRECTE' as const,
    sauts: [] as readonly Saut[],
    angleOrientationDeg: orientation,
    ...directionNord(orientation.value),
    deltaAdH: 0,
    deltaDecDeg: 0,
  }

  if (ancrages.length === 0) {
    return {
      ...commun,
      ancrages,
      message: 'Aucune étoile d’ancrage dans le cadre.',
      cause:
        magLimite === null
          ? 'Ciel hors de l’échelle de Bortle : aucune étoile repère proposée.'
          : `Aucune étoile visible à l’œil (magnitude ${nombre(magLimite, 2)}) dans le cadre.`,
      contraintesARelacher: [
        'Un site plus sombre montre plus d’étoiles repères.',
        'Un chercheur, même petit, montre bien plus d’étoiles.',
      ],
    }
  }

  const premier = ancrages[0]!
  return {
    ...commun,
    ancrages,
    deltaAdH: premier.deltaAdH,
    deltaDecDeg: premier.deltaDecDeg,
    message:
      `Pointage direct : ${ancrages.length} étoile${ancrages.length > 1 ? 's' : ''} repère` +
      `${ancrages.length > 1 ? 's' : ''} dans le cadre` +
      (principale === undefined
        ? ', toutes assez faibles : repérage délicat sous un ciel voilé.'
        : `, la plus brillante : ${designe(premier)}.`) +
      ` Écart : ${nombre(premier.deltaAdH, 3)} h en ascension droite, ` +
      `${degres(premier.deltaDecDeg, 2)} en déclinaison. ${phraseOrientation(orientation.value)}`,
  }
}

// §8.4 — cheminement (star hopping)

interface Noeud {
  readonly etoile: Etoile
  readonly precedent: Noeud | null
  readonly profondeur: number
  readonly distanceDeg: number
}

function cheminement(entree: EntreePointage): CartePointage {
  const orientation = angleOrientation(entree.site, entree.date, entree.adCibleH, entree.decCibleDeg)
  const chercheur = entree.fovChercheurDeg ?? entree.fovHDeg
  const sautMax = K('RECOUVREMENT_SAUT') * chercheur
  const sautsMax = K('SAUTS_MAX')
  const rayon = sautMax * (sautsMax + 1)

  const distanceCible = (e: Etoile): number =>
    separationEquatorialeDeg(
      e.adDeg / DEG_PAR_HEURE,
      e.decDeg,
      entree.adCibleH,
      entree.decCibleDeg,
    )

  const proches = entree.etoiles
    .filter((e) => e.magV <= K('MAG_SAUT_MAX'))
    .filter((e) => distanceCible(e) <= rayon)

  // BFS FROM the target: first vertex under start magnitude = shortest path = fewest chances to
  // get lost.
  const file: Noeud[] = proches
    .filter((e) => distanceCible(e) <= sautMax)
    .map((e) => ({ etoile: e, precedent: null, profondeur: 1, distanceDeg: distanceCible(e) }))
  const vus = new Set<Etoile>(file.map((n) => n.etoile))
  let arrivee: Noeud | null = null

  while (file.length > 0 && arrivee === null) {
    const noeud = file.shift()!
    if (noeud.etoile.magV <= K('MAG_DEPART_CHEMINEMENT_MAX')) {
      arrivee = noeud
      break
    }
    if (noeud.profondeur >= sautsMax) continue
    for (const voisin of proches) {
      if (vus.has(voisin)) continue
      const distance = separationEquatorialeDeg(
        noeud.etoile.adDeg / DEG_PAR_HEURE,
        noeud.etoile.decDeg,
        voisin.adDeg / DEG_PAR_HEURE,
        voisin.decDeg,
      )
      if (distance > sautMax) continue
      vus.add(voisin)
      file.push({
        etoile: voisin,
        precedent: noeud,
        profondeur: noeud.profondeur + 1,
        distanceDeg: distance,
      })
    }
  }

  const commun = {
    mode: 'CHEMINEMENT' as const,
    ancrages: [] as readonly Ancrage[],
    angleOrientationDeg: orientation,
    ...directionNord(orientation.value),
  }

  if (arrivee === null) {
    return {
      ...commun,
      sauts: [],
      deltaAdH: 0,
      deltaDecDeg: 0,
      message: 'Aucun chemin d’étoile en étoile trouvé.',
      cause:
        `Aucun chemin en ${sautsMax} sauts au plus, de ${degres(sautMax, 1)} maximum chacun, ` +
        `depuis une étoile de magnitude ${nombreLibre(K('MAG_DEPART_CHEMINEMENT_MAX'))}.`,
      contraintesARelacher: [
        `Partir d’une étoile plus faible que magnitude ${nombreLibre(K('MAG_DEPART_CHEMINEMENT_MAX'))}.`,
        `Autoriser plus de ${sautsMax} sauts.`,
        'Utiliser un chercheur au champ plus large.',
      ],
    }
  }

  // Path rebuilt from start star toward target.
  const chemin: Noeud[] = []
  for (let n: Noeud | null = arrivee; n !== null; n = n.precedent) chemin.push(n)
  const sauts: Saut[] = chemin.map((n, index) => ({
    ordre: index + 1,
    adH: n.etoile.adDeg / DEG_PAR_HEURE,
    decDeg: n.etoile.decDeg,
    magV: n.etoile.magV,
    nom: nomEtoile(entree.nommees, n.etoile.adDeg, n.etoile.decDeg),
    distanceDeg: n.distanceDeg,
  }))
  const depart = sauts[0]!

  return {
    ...commun,
    sauts,
    deltaAdH: entree.adCibleH - depart.adH,
    deltaDecDeg: entree.decCibleDeg - depart.decDeg,
    message:
      `${sauts.length} saut${sauts.length > 1 ? 's' : ''} d’étoile en étoile, depuis ` +
      `${designe(depart)}. Écart total : ` +
      `${nombre(entree.adCibleH - depart.adH, 3)} h en ascension droite, ` +
      `${degres(entree.decCibleDeg - depart.decDeg, 2)} en déclinaison. ` +
      phraseOrientation(orientation.value),
  }
}

/**
 * Pointage mode auto-chosen from field (§8.4). Beyond 8° frame always holds several bright stars:
 * one step suffices.
 */
export function cartePointage(entree: EntreePointage): CartePointage {
  return entree.fovHDeg > K('FOV_SEUIL_CARTE_DIRECTE_DEG')
    ? carteDirecte(entree)
    : cheminement(entree)
}

export const RAPPEL_MISE_EN_STATION =
  'La mise en station reste à faire vous-même : l’application aide seulement à trouver les objets.'

/**
 * §8.4, T-0324 — path to follow, whatever the map mode.
 * CHEMINEMENT: the sauts, naked-eye start → target. CARTE_DIRECTE: §8.4 foresees "a single
 * pointage step" = PRINCIPAL anchor only; other anchors confirm, aren't steps (linking them draws
 * a path nobody should follow).
 * No principal anchor → first anchor, as `carteDirecte` does for offsets: degraded sky may offer
 * no star under reliable magnitude; brightest available beats no path.
 */
export function etapesParcours(carte: CartePointage): readonly EtapeParcours[] {
  if (carte.sauts.length > 0) {
    return carte.sauts.map(({ ordre, adH, decDeg, nom }) => ({ ordre, adH, decDeg, nom }))
  }
  const principal = carte.ancrages.find((ancrage) => ancrage.principal) ?? carte.ancrages[0]
  if (principal === undefined) return []
  return [{ ordre: 1, adH: principal.adH, decDeg: principal.decDeg, nom: principal.nom }]
}

/**
 * §8.4, T-0324 — celestial cap containing a path: centre + radius.
 * Centre = barycentre of DIRECTIONS, not mean right ascension: angle mean breaks at 24 h → 0 h,
 * crossed by circumpolar cheminement.
 * A RADIUS, not a field: field depends on canvas shape, projection, aim offset (T-0258), unknown
 * here. `fovPourRayonDeg` (§3.3) knows them, `bornesZoom` knows the bounds: caller chains them.
 */
export function cadrageParcours(
  etapes: readonly EtapeParcours[],
  adCibleH: number,
  decCibleDeg: number,
): { readonly adDeg: number; readonly decDeg: number; readonly rayonDeg: number } {
  const points: Vec3[] = etapes.map((etape) =>
    versVecteur(etape.adH * DEG_PAR_HEURE, etape.decDeg),
  )
  points.push(versVecteur(adCibleH * DEG_PAR_HEURE, decCibleDeg))

  let x = 0
  let y = 0
  let z = 0
  for (const point of points) {
    x += point.x
    y += point.y
    z += point.z
  }
  const norme = Math.hypot(x, y, z)
  // Zero sum = diametrically opposed directions; a pointage path never spans a hemisphere.
  // Target = centre by default.
  const centre: Vec3 =
    norme === 0
      ? points[points.length - 1]!
      : { x: x / norme, y: y / norme, z: z / norme }

  let rayonDeg = 0
  for (const point of points) rayonDeg = Math.max(rayonDeg, separationDeg(centre, point))

  const { longitudeDeg, latitudeDeg } = versSpherique(centre)
  return { adDeg: longitudeDeg, decDeg: latitudeDeg, rayonDeg }
}
