/**
 * Planétarium render pass — §3.1, §3.3, §3.4, §3.5.
 * One frame = one matrix, one index walk, one draw. Cost follows RETAINED star count, never stored:
 * off-field cells unvisited, cell walk stops at zoom limiting magnitude.
 * Stars grouped by teinte: `fillStyle` change costs more than a disc; 8 changes/frame beat 10000.
 */

import { K } from '../registry/constants.ts'
import { champVisible, horsCanevas } from './champ-visible.ts'
import { traceHorizon, traceLignes, traceSegments } from './traces-ciel.ts'
import {
  ancreVoieLactee,
  NOM_VOIE_LACTEE,
  PLAN_GALACTIQUE,
  repereCentreGalactique,
  traceBandeVoieLactee,
} from './voie-lactee.ts'
import type { Etoile } from '../data/catalog.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { EtoileNommee } from '../data/constellations.ts'
import type { CoucheFrontieres, CoucheTraces, EtoileTrace } from '../core/constellations.ts'
import { etoilesDesTraces } from '../core/constellations.ts'
import type { IndexCiel, StatistiquesSelection } from '../core/index-ciel.ts'
import { selectionne } from '../core/index-ciel.ts'
import {
  composeLabels,
  etoileLabellisable,
  labelSurvol,
  type BoiteLabel,
  type CandidatLabel,
} from '../core/labels.ts'
import { applique, transpose, versVecteur, type Mat3 } from '../core/mat3.ts'
import {
  pointEcran,
  type PointEcranMut,
  type Projecteur,
} from '../core/projection.ts'
import type { Cadre } from '../core/cadre.ts'
import type { PositionCorps } from '../core/ephem.ts'
import { Body } from 'astronomy-engine'
import type { MasqueHorizon } from '../core/site.ts'
import { projecteurSansSol } from '../core/sol.ts'
import { dessineSol } from './dessine-sol.ts'
import {
  boiteLabel,
  HAUTEUR_LABEL_PX,
  LARGEUR_CARACTERE_PX,
  libelleCible,
  MARQUEUR_OBJET_PX,
  POLICE_LABEL,
  RAYON_CORPS_PX,
  titreCible,
} from './libelles-cibles.ts'
import {
  avecOpacite,
  couleurTeinte,
  paletteScene,
  teinte,
  TEINTES,
  type PaletteCiel,
} from './couleurs.ts'
import { dessineCielSoleil } from './dessine-ciel-soleil.ts'
import {
  dessineHaloHorizon,
  dessineHaloLune,
  dessineHaloSoleil,
  type LuneEcran,
  type SoleilEcran,
} from './dessine-fond-ciel.ts'
import { angleLimbeEclaireRad, dessineLune, dessineTrajetLune, rayonLunePx } from './dessine-lune.ts'
import type { OptiquePose } from './dessine-pose-cadre.ts'
import {
  dessineCarteDansCadre,
  dessineContourCadre,
  type EntreeCadre,
} from './dessine-cadre.ts'
import {
  OPACITE_ETOILE_PARCOURS,
  OPACITE_OBJET_ESTOMPE,
  rayonEtoileCielPx,
  teintesObjets,
} from './apparence-objets.ts'
import { dessineParcours } from './dessine-parcours.ts'
import { dessineRepereCible } from './dessine-repere-cible.ts'
import type { ParcoursScene } from './scene-etat.ts'
import { geometrieMarqueur, peintCroix, peintEllipse } from './marqueur-objet.ts'
import { TOUR_RAD } from '../core/unites.ts'

export interface CouchesActives {
  readonly figures: boolean
  readonly frontieres: boolean
  readonly asterismes: boolean
  readonly cadre: boolean
  readonly horizon: boolean
  readonly voieLactee: boolean
  /** §4.1 — site sol masks what's below: nothing drawn nor clickable there. */
  readonly sol: boolean
}

export type TypeCible = 'ETOILE' | 'OBJET' | 'CORPS'

/** Drawn element, kept for mouse pointing. */
export interface CibleEcran {
  readonly type: TypeCible
  readonly xPx: number
  readonly yPx: number
  readonly nom: string
  readonly objet?: ObjetCielProfond
  readonly etoile?: Etoile
  readonly etoileNommee?: EtoileNommee
  readonly corps?: PositionCorps
  /**
   * T-0144 — painted marker footprint, px from centre. Label avoids landing IN the object; click
   * reaches its edge.
   */
  readonly rayonPx?: number
}

/**
 * T-0085, T-0109 — element under cursor, nothing else. Caller stores what `cibleSousLeCurseur`
 * returned; scène resolves text and place at paint, with same functions as retained labels.
 * Caller-composed text = second vocabulary (T-0109 removed it).
 */
export interface SurvolEcran {
  readonly cible: CibleEcran
}

export interface EntreeDessin {
  readonly ctx: CanvasRenderingContext2D
  readonly projecteur: Projecteur
  /** J2000 → site horizontal frame: for elements defined in that frame. */
  readonly matriceCiel: Mat3
  readonly index: IndexCiel
  readonly etoiles: readonly Etoile[]
  readonly objets: readonly ObjetCielProfond[]
  readonly figures: readonly CoucheTraces[]
  readonly asterismes: readonly CoucheTraces[]
  readonly frontieres: CoucheFrontieres
  readonly etoilesNommees: readonly EtoileNommee[]
  readonly corps: readonly PositionCorps[]
  readonly nomsCorps: Readonly<Record<string, string>>
  readonly cadres: readonly Cadre[]
  readonly cadreCible?: Cadre | undefined
  readonly couches: CouchesActives
  readonly magLimite: number
  /**
   * T-0357 — visible share of stars and night repères (`apparitionReperes`): fade back in after
   * sunset. Lune, planets exempt. Absent: 1.
   */
  readonly apparition?: number | undefined
  /** §3.7 — site fond de ciel: modulates band contrast. Scène shows what USER sees, not ideal. */
  readonly sbCiel: number
  /** §3.7 — site latitude: decides if galactic centre is reachable from here. */
  readonly latitudeDeg: number
  /** §4.1 — site relief: gives `sol` layer its height, per azimut. */
  readonly masque: MasqueHorizon
  /**
   * §3.3 — vue réaliste: fond takes site fond de ciel luminance, horizon and Lune halos add,
   * repères compensate lost contrast. Unchecked: pre-T-0097 scène, pixel-exact.
   */
  readonly vueRealiste: boolean
  /** T-0100 — Lune as scène draws it. Absent: enters no calc (masked §3.1, or vue réaliste off). */
  readonly lune?: LuneEcran | undefined
  /** Sun at displayed instant. Absent: no solar halo painted. */
  readonly soleil?: SoleilEcran | undefined
  readonly modeNuit: boolean
  /**
   * §9.3 / T-0116 — filé pass, between sol and repères, scène FILTERED PROJECTEUR: traces fall on
   * same stars as surrounding sky, nothing paints under relief (§4.1). Presence REPLACES
   * point-star layer (trace topped by sharp dot exists on no pose); also empties `cibles` (T-0316):
   * nothing painted under preview → nothing designated (star off its projected pixel; object/corps
   * markers absent).
   */
  readonly passeFile?:
    | ((ctx: CanvasRenderingContext2D, projecteur: Projecteur) => void)
    | undefined
  /**
   * T-0427 — preview is a filé: shooting time exceeds pose max for point stars. Sky rotates during
   * shot; trace frozen at displayed instant matches nothing.
   */
  readonly etoilesFilent?: boolean | undefined
  /**
   * T-0399 — Lune at shooting instants, displayed instant → filé end. Read under preview only:
   * pose with cut monture stretches disc into trace.
   */
  readonly trajetLune?: readonly PositionCorps[] | undefined
  /**
   * §9.1 / T-0142 — optique the pose card needs. Present: matériel cadre masked and filled with
   * §9.1 grid, last, over all it covers.
   */
  readonly poseCadre?: OptiquePose | undefined
  /** §3.4 / T-0085 — absent: nothing hovered, scène reveals no name. */
  readonly survol?: SurvolEcran | undefined
  /**
   * §6.4 — désignations kept by catalogue filters (`cibles-en-avant.ts`). Other markers paint
   * dimmed, name included: scène answers list's question. Absent (no filter): full opacity.
   */
  readonly enAvant?: ReadonlySet<string> | undefined
  /**
   * §8.4 / T-0324 — pointage path. Present: replaces whole scène; like §9.5 preview switches off
   * all that COMMENTS sky, plus what frames it (sol, horizon, pose grid): none helps star to star.
   * Survive: matériel cadre (only distance scale), very dim fond stars, the path.
   */
  readonly parcours?: ParcoursScene | undefined
  /**
   * §6.4 / T-0283 — cible whose fiche is open, or plan cibles on « Mon plan »: reticled and named
   * at any field.
   */
  readonly ciblesOuvertes?: readonly ObjetCielProfond[] | undefined
}

export interface SortieDessin {
  readonly stats: StatistiquesSelection
  readonly etoilesDessinees: number
  readonly cibles: readonly CibleEcran[]
  readonly labels: readonly CandidatLabel[]
  /** T-0085 — transient hover label, outside §3.4 budget. */
  readonly revele: BoiteLabel | null
  /** T-0283 — repères of cibles opened on screen; empty without cible or off-screen. */
  readonly reperes: readonly BoiteLabel[]
}

/* T-0109 — label layout in `libelles-cibles.ts` (sizes declared there), imported for labels
   without cible (constellations, astérismes, Voie lactée). */
export const RAYON_CLIC_PX = 10
/* T-0107 — whole-pixel key pas. Any realistic canvas width is far below → `y * PAS + x` injective,
   incl. neighbourhood at x = −1. */
const PAS_CLE_PIXEL = 65536



/**
 * T-0107 — does a pixel in immediate neighbourhood already carry a named star? 3×3 not single
 * pixel: both passes project the same star from two packets of different precision; roundings can
 * fall either side of a pixel boundary.
 */
function pixelDejaNomme(pixels: ReadonlySet<number>, xPx: number, yPx: number): boolean {
  const x = Math.round(xPx)
  const y = Math.round(yPx)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (pixels.has((y + dy) * PAS_CLE_PIXEL + (x + dx))) return true
    }
  }
  return false
}


/**
 * What all passes of a frame share.
 * `entree` = sol-FILTERED projecteur; `brut` ignores sol, still needed for what paints below
 * horizon (matériel cadre, horizon, band). Both arrays = frame accumulators: a pass deposits what
 * it painted, `dessineCiel` derives labels and clickable cibles from them.
 */
interface Passe {
  readonly entree: EntreeDessin
  readonly brut: Projecteur
  readonly couches: CouchesActives
  readonly teintes: PaletteCiel
  /** T-0171 — false when full-sky preview stands for shot: repères fade. */
  readonly peintReperes: boolean
  /** T-0324 — true when scène shows only a pointage parcours (§8.4). */
  readonly modeParcours: boolean
  /**
   * T-0324 — fond star opacity. 0 under §9.5 preview (sharp dot at trace end exists on no pose);
   * attenuated under parcours (fond says where we look, isn't subject); full elsewhere.
   */
  readonly opaciteEtoiles: number
  readonly fondPeint: boolean
  /** T-0357 — night repère opacity: figures, markers, names other than corps. */
  readonly apparition: number
  readonly largeur: number
  readonly hauteur: number
  /** Single work point for whole frame: no pass allocates per element (T-0065). */
  readonly p: PointEcranMut
  readonly cibles: CibleEcran[]
  readonly candidats: CandidatLabel[]
}


/** §3.7, §4.1 — fond, halos, band, sol: all painted under the rest. */
function passeFond(passe: Passe): void {
  const { entree, brut, couches, teintes, fondPeint, largeur, hauteur } = passe
  const { ctx, projecteur } = passe.entree

  ctx.fillStyle = teintes.fond
  ctx.fillRect(0, 0, largeur, hauteur)
  // T-0098, T-0100 — the two fond-brightening layers go BEFORE band, sol, repères: fond over
  // repérage masks orientation aids (§3.7); relief must cover halo when aim is low (T-0094).
  if (fondPeint) {
    dessineHaloHorizon(ctx, brut, entree.matriceCiel, entree.sbCiel)
    if (
      entree.soleil !== undefined &&
      !dessineCielSoleil(ctx, brut, entree.matriceCiel, entree.sbCiel, entree.soleil)
    ) {
      dessineHaloSoleil(ctx, brut, entree.sbCiel, entree.soleil)
    }
    if (entree.lune !== undefined) dessineHaloLune(ctx, brut, entree.sbCiel, entree.lune)
  }
  // §3.7 — band belongs to fond: under §9.5 preview as under repères; painted later it'd wash the
  // preview it covers. RAW projecteur then covered by sol: filtered, a 5° wide stroke would stop
  // one azimut step early, leaving a notch above horizon.
  if (couches.voieLactee) traceBandeVoieLactee({ ...entree, projecteur: brut })
  // §4.1 — sol, painted over fond and band, under everything else.
  if (couches.sol) {
    // T-0409 — sol follows scène Sun, as the interface follows its own.
    const soleilLeve = entree.soleil !== undefined && entree.soleil.altitudeDeg > 0
    dessineSol(ctx, brut, entree.matriceCiel, entree.masque, {
      sol: soleilLeve ? teintes.solJour : teintes.sol,
      courbes: teintes.courbes,
      bords: teintes.horizon,
    })
  }
  // §9.5 — filé pass AFTER sol, sol-ignoring projecteur: sol stays over fond, no trace computed
  // under horizon (§4.1).
  // T-0396 — filé is stars: same twilight fade; by day, nothing shows → not computed. Pass carries
  // opacity in its colours, never writes `globalAlpha`.
  if (passe.apparition > 0) {
    ctx.globalAlpha = passe.apparition
    entree.passeFile?.(ctx, projecteur)
    ctx.globalAlpha = 1
  }
}

/** §3.3, T-0110, T-0173 — drawn repères: constellations, horizon, galactic plane. */
function passeTraces(passe: Passe): CandidatLabel | null {
  const { entree, brut, couches, teintes } = passe
  const { ctx, projecteur } = passe.entree
  ctx.font = POLICE_LABEL
  ctx.textBaseline = 'middle'

  // T-0110 — field on RAW projecteur: view property, not sol filtering. Resulting cap encloses
  // what filtered projecteur shows.
  const champScene = champVisible(brut)
  ctx.globalAlpha = passe.apparition
  if (couches.frontieres) {
    ctx.strokeStyle = teintes.frontieres
    ctx.lineWidth = 1
    traceLignes(ctx, projecteur, entree.frontieres.polylignes, champScene)
  }
  if (couches.figures) {
    ctx.strokeStyle = teintes.figures
    ctx.lineWidth = 1
    traceSegments(ctx, projecteur, entree.figures, champScene)
  }
  if (couches.asterismes) {
    // Distinct from IAU figures by thickness (same grey), not dashes: dash pattern renders solid
    // on a segment shorter than its period, and an astérisme mixes long branches and short-segment
    // chains → same layer would look drawn two ways.
    ctx.strokeStyle = teintes.asterismes
    ctx.lineWidth = 2
    traceSegments(ctx, projecteur, entree.asterismes, champScene)
    ctx.lineWidth = 1
  }
  // Horizon frames the view, day and night: no fade.
  ctx.globalAlpha = 1
  if (couches.horizon) traceHorizon(entree, teintes.horizon, brut)
  // T-0173 — galactic plane TRAIT survives preview: on a shot where Voie lactée shows, only line
  // saying where it runs. Frames like horizon. Band, centre repère, names annotate: stay off.
  // T-0324 — off under parcours too: what frames a SHOT doesn't help star to star; parcours scène
  // keeps only matériel cadre.
  // T-0427 — off under filé too: band rotated with sky during shot.
  if (entree.couches.voieLactee && !passe.modeParcours && entree.etoilesFilent !== true) {
    ctx.strokeStyle = teintes.voieLactee
    ctx.lineWidth = 1
    ctx.globalAlpha = passe.apparition
    traceLignes(ctx, projecteur, [PLAN_GALACTIQUE])
    ctx.globalAlpha = 1
  }
  if (!couches.voieLactee) return null
  return repereCentreGalactique(entree, teintes.voieLactee, pointEcran())
}

/**
 * Vertex↔catalogue pairing, once per layer+index: layers built at packet load, not reallocated
 * (same key as `calottesDe`).
 */
const etoilesTracesMemo = new WeakMap<object, { index: IndexCiel; etoiles: readonly EtoileTrace[] }>()

function etoilesTraces(couches: readonly CoucheTraces[], index: IndexCiel): readonly EtoileTrace[] {
  const connu = etoilesTracesMemo.get(couches)
  if (connu !== undefined && connu.index === index) return connu.etoiles
  const etoiles = etoilesDesTraces(couches, index)
  etoilesTracesMemo.set(couches, { index, etoiles })
  return etoiles
}

/** §3.3 — packet stars grouped by teinte: 8 draws, not 16000. */
function passeEtoiles(passe: Passe): { stats: StatistiquesSelection; etoilesDessinees: number } {
  const { entree, opaciteEtoiles, largeur, hauteur, p, cibles } = passe
  const { ctx, projecteur, index } = passe.entree
  // --- Étoiles ---
  // Field radius: canvas diagonal as degrees at centre.
  const { centre: centreJ2000, rayonDeg: rayonChampDeg } = champVisible(projecteur)
  // One `Path2D` per teinte, reallocated per frame: API has no clear, reused path would accumulate
  // previous frames' discs. Platform constraint — 8 objects/frame vs one per star avoided below.
  const chemins = Array.from({ length: TEINTES }, () => new Path2D())
  let etoilesDessinees = 0

  const stats = selectionne(
    index,
    centreJ2000,
    rayonChampDeg,
    entree.magLimite,
    (x, y, z, magV, bv, source) => {
      if (!projecteur.projetteEn(x, y, z, p)) return
      if (horsCanevas(p, largeur, hauteur)) return
      if (opaciteEtoiles > 0) {
        const rayon = rayonEtoileCielPx(magV)
        const chemin = chemins[teinte(bv)]!
        chemin.moveTo(p.xPx + rayon, p.yPx)
        chemin.arc(p.xPx, p.yPx, rayon, 0, TOUR_RAD)
      }
      etoilesDessinees++
      const etoile = entree.etoiles[source]
      if (etoile !== undefined && magV <= K('MAG_LABEL_BAYER_MAX')) {
        cibles.push({ type: 'ETOILE', xPx: p.xPx, yPx: p.yPx, nom: '', etoile })
      }
    },
  )
  // A figure stroke ending in the void reads as error: stars of displayed traces bypass zoom limit
  // (those within it already painted). Limit −∞ (day) leaves none: no star to join.
  if (opaciteEtoiles > 0 && entree.magLimite > Number.NEGATIVE_INFINITY) {
    const tracees = [
      ...(passe.couches.figures ? etoilesTraces(entree.figures, index) : []),
      ...(passe.couches.asterismes ? etoilesTraces(entree.asterismes, index) : []),
    ]
    for (const { v, magV, bv } of tracees) {
      if (magV <= entree.magLimite) continue
      if (!projecteur.projetteEn(v.x, v.y, v.z, p)) continue
      if (horsCanevas(p, largeur, hauteur)) continue
      const rayon = rayonEtoileCielPx(magV)
      const chemin = chemins[teinte(bv)]!
      chemin.moveTo(p.xPx + rayon, p.yPx)
      chemin.arc(p.xPx, p.yPx, rayon, 0, TOUR_RAD)
    }
  }
  if (opaciteEtoiles > 0) {
    ctx.globalAlpha = opaciteEtoiles
    for (let t = 0; t < TEINTES; t++) {
      ctx.fillStyle = couleurTeinte(t, entree.modeNuit)
      ctx.fill(chemins[t]!)
    }
    ctx.globalAlpha = 1
  }

  return { stats, etoilesDessinees }
}

/** §3.4 — named stars: their labels, and pixels they already occupy (T-0107). */
function passeEtoilesNommees(passe: Passe): ReadonlySet<number> {
  const { entree, peintReperes, largeur, hauteur, p, cibles, candidats } = passe
  const { projecteur } = passe.entree
  // --- Named stars: labels, click identification ---
  const pixelsNommes = new Set<number>()
  for (const nommee of entree.etoilesNommees) {
    if (!etoileLabellisable(nommee.magV)) continue
    const v = versVecteur(nommee.adDeg, nommee.decDeg)
    if (!projecteur.projetteEn(v.x, v.y, v.z, p)) continue
    if (horsCanevas(p, largeur, hauteur)) continue
    pixelsNommes.add(Math.round(p.yPx) * PAS_CLE_PIXEL + Math.round(p.xPx))
    // T-0109 — `nom` no longer carries label: star name asked of `libelleCible`, sole scène
    // vocabulary source.
    const cible: CibleEcran = {
      type: 'ETOILE',
      xPx: p.xPx,
      yPx: p.yPx,
      nom: '',
      etoileNommee: nommee,
    }
    cibles.push(cible)
    const texte = peintReperes ? libelleCible(cible) : null
    if (texte !== null) {
      candidats.push({ ...boiteLabel(cible, texte), categorie: 'ETOILE', priorite: nommee.magV })
    }
  }

  return pixelsNommes
}

/** §3.4 — deep sky: one path per object, each with its type's teinte. */
function passeObjets(passe: Passe): void {
  const { entree, teintes, peintReperes, largeur, hauteur, p, cibles, candidats } = passe
  const { ctx, projecteur } = passe.entree
  // --- Objets du ciel profond ---
  // One path per object (stars group into 8): each carries type teinte and gradient
  // (`apparence-objets.ts`). A few hundred orders, not the 16000 star grouping avoids.
  const teintesParType = teintesObjets(entree.modeNuit, entree.vueRealiste, entree.sbCiel)
  // T-0195 — deep-sky cap FIXED, not `entree.magLimite` (zoom-driven, §3.3: 83479 stars close
  // canvas at 180°). Object marker isn't a flux, it designates a place; driven, it vanished on
  // zoom-out — the gesture used to find where cible sits. Same reason as marker teinte in vue
  // réaliste (`apparence-objets.ts`): repère goes out neither with fond de ciel nor field.
  const magObjets = K('MAG_LIMITE_OBJETS')
  for (const objet of entree.objets) {
    if (objet.vMag === null || objet.vMag > magObjets) continue
    const v = versVecteur(objet.adDeg, objet.decDeg)
    if (!projecteur.projetteEn(v.x, v.y, v.z, p)) continue
    if (horsCanevas(p, largeur, hauteur)) continue
    // Geometry AFTER the three rejections: its two auxiliary projections paid only for what shows.
    const teintesObjet = teintesParType[objet.type]
    const geo = geometrieMarqueur(projecteur, objet, p.xPx, p.yPx)
    // Filter removes nothing, only dims: click, hover, fiche keep working on a dimmed marker.
    const estompe = entree.enAvant !== undefined && !entree.enAvant.has(objet.designation)
    // Geometry computed even unpainted: it gives click its radius.
    if (peintReperes) {
      ctx.globalAlpha = (estompe ? OPACITE_OBJET_ESTOMPE : 1) * passe.apparition
      if (geo === null) peintCroix(ctx, p.xPx, p.yPx, teintesObjet.bord)
      else peintEllipse(ctx, p.xPx, p.yPx, geo, teintesObjet)
      ctx.globalAlpha = 1
    }
    const cible: CibleEcran = {
      type: 'OBJET',
      xPx: p.xPx,
      yPx: p.yPx,
      nom: objet.designation,
      objet,
      // T-0144 — name and click follow painted marker, no longer a 4 px square.
      rayonPx: geo === null ? MARQUEUR_OBJET_PX : geo.demiGrandPx,
    }
    cibles.push(cible)
    // T-0283 — opened cible carries its name at repère: naming it here would write it twice.
    const ouverte = entree.ciblesOuvertes?.some((c) => c.designation === objet.designation) ?? false
    const texte = peintReperes && !ouverte ? libelleCible(cible) : null
    if (texte !== null) {
      candidats.push({
        ...boiteLabel(cible, texte),
        categorie: 'OBJET',
        priorite: objet.vMag,
        // Name follows marker: full-light label over dimmed disc would bring forward what filter
        // dropped.
        ...(estompe ? { couleur: avecOpacite(teintes.texte, OPACITE_OBJET_ESTOMPE) } : {}),
      })
    }
  }
  // Next passes stroke thin: outline thickness isn't theirs.
  ctx.lineWidth = 1
}

/**
 * T-0399 — under filé preview Lune stays painted: its trace ruins the pose. Judged on WHOLE path,
 * not instant's Lune: one below horizon/off-field may rise/enter before filé end. Without
 * duration, trace reduces to phase disc.
 */
function passeTrajetLune(passe: Passe): void {
  const { entree, teintes, peintReperes, p } = passe
  const { ctx, projecteur } = entree
  if (peintReperes || entree.trajetLune === undefined) return
  const versJ2000 = transpose(entree.matriceCiel)
  const versCiel = (c: PositionCorps) => applique(versJ2000, versVecteur(c.azimutDeg, c.hauteurDeg))
  const points = entree.trajetLune.map(versCiel)
  // Radius at first visible point: apparent diameter changes unreadably over a filé.
  const premier = points.find((v) => projecteur.projetteEn(v.x, v.y, v.z, p))
  if (premier === undefined) return
  const r = rayonLunePx(projecteur, premier, p, entree.lune?.demiDiametreDeg ?? null)
  const soleil = entree.corps.find((c) => c.corps === Body.Sun)
  dessineTrajetLune(
    ctx,
    projecteur,
    points,
    r,
    soleil === undefined ? null : versCiel(soleil),
    entree.lune?.anglePhaseDeg ?? null,
    teintes.lune,
  )
}

/** §3.4 — moving corps, names before all others. */
function passeCorps(passe: Passe): void {
  const { entree, teintes, peintReperes, largeur, hauteur, p, cibles, candidats } = passe
  const { ctx, projecteur } = passe.entree
  // --- Corps mobiles ---
  const versJ2000 = transpose(entree.matriceCiel)
  const versCiel = (c: PositionCorps) => applique(versJ2000, versVecteur(c.azimutDeg, c.hauteurDeg))
  const soleil = entree.corps.find((c) => c.corps === Body.Sun)
  for (const corps of entree.corps) {
    const v = versCiel(corps)
    if (!projecteur.projetteEn(v.x, v.y, v.z, p)) continue
    // Off-canvas as elsewhere: corps behind observer still projectable, its label gets scène's top
    // priority. Without this test an unseen planet took a seen name's place (§3.4).
    if (horsCanevas(p, largeur, hauteur)) continue
    const rayonLune =
      corps.corps === Body.Moon
        ? rayonLunePx(projecteur, v, p, entree.lune?.demiDiametreDeg ?? null)
        : undefined
    if (peintReperes && rayonLune !== undefined) {
      const angle = soleil === undefined ? null : angleLimbeEclaireRad(projecteur, v, versCiel(soleil), p)
      dessineLune(ctx, p, rayonLune, angle, entree.lune?.anglePhaseDeg ?? null, teintes)
    } else if (peintReperes) {
      // T-0324 — teinte set at paint, not before loop: colour left by a pass painting nothing
      // announces an absent layer.
      ctx.fillStyle = teintes.corps
      ctx.beginPath()
      ctx.arc(p.xPx, p.yPx, RAYON_CORPS_PX, 0, TOUR_RAD)
      ctx.fill()
    }
    const nom = entree.nomsCorps[corps.corps] ?? String(corps.corps)
    // Name and click follow painted disc, as for an object (T-0144).
    const cible: CibleEcran = {
      type: 'CORPS',
      xPx: p.xPx,
      yPx: p.yPx,
      nom,
      corps,
      ...(rayonLune === undefined ? {} : { rayonPx: rayonLune }),
    }
    cibles.push(cible)
    const texte = peintReperes ? libelleCible(cible) : null
    if (texte !== null) {
      candidats.push({
        ...boiteLabel(cible, texte),
        categorie: 'CORPS',
        priorite: -Infinity,
      })
    }
  }
}

/** T-0034, T-0091 — Voie lactée layer names: band, then galactic centre. */
function passeNomsVoieLactee(passe: Passe, labelCentreGalactique: CandidatLabel | null): void {
  const { couches, teintes, largeur, hauteur, candidats } = passe
  const { projecteur } = passe.entree
  // --- Voie lactée layer names ---
  // Before constellation names: at equal priority `composeLabels` stable sort lets them through in
  // front. Galactic-centre repère before band name, same reason: both anchor at same spot aiming at
  // centre, repère carries the site-dependent consequence.
  if (couches.voieLactee) {
    if (labelCentreGalactique !== null) candidats.push(labelCentreGalactique)
    const ancre = ancreVoieLactee(projecteur, largeur, hauteur)
    if (ancre !== null) {
      candidats.push({
        texte: NOM_VOIE_LACTEE,
        categorie: 'CONSTELLATION',
        xPx: ancre.xPx,
        yPx: ancre.yPx,
        priorite: 0,
        largeurPx: NOM_VOIE_LACTEE.length * LARGEUR_CARACTERE_PX,
        hauteurPx: HAUTEUR_LABEL_PX,
        couleur: teintes.voieLactee,
      })
    }
  }
}

/** §3.3 — constellation and astérisme names, candidates like the others. */
function passeNomsConstellations(passe: Passe): void {
  const { entree, couches, peintReperes, largeur, hauteur, p, candidats } = passe
  const { projecteur } = passe.entree
  // --- Noms de constellations ---
  for (const figure of peintReperes ? entree.figures : []) {
    if (figure.centre === null) continue
    if (!projecteur.projetteEn(figure.centre.x, figure.centre.y, figure.centre.z, p)) continue
    if (horsCanevas(p, largeur, hauteur)) continue
    candidats.push({
      texte: figure.nom,
      categorie: 'CONSTELLATION',
      xPx: p.xPx,
      yPx: p.yPx,
      priorite: 0,
      largeurPx: figure.nom.length * LARGEUR_CARACTERE_PX,
      hauteurPx: HAUTEUR_LABEL_PX,
    })
  }
  if (couches.asterismes) {
    for (const asterisme of entree.asterismes) {
      if (asterisme.centre === null) continue
      const c = asterisme.centre
      if (!projecteur.projetteEn(c.x, c.y, c.z, p)) continue
      if (horsCanevas(p, largeur, hauteur)) continue
      candidats.push({
        texte: asterisme.nom,
        categorie: 'CONSTELLATION',
        xPx: p.xPx,
        yPx: p.yPx,
        priorite: 1,
        largeurPx: asterisme.nom.length * LARGEUR_CARACTERE_PX,
        hauteurPx: HAUTEUR_LABEL_PX,
      })
    }
  }
}

/** §3.4, T-0085 — retained labels, then name revealed by hover. */
function passeLabels(passe: Passe): {
  labels: readonly CandidatLabel[]
  revele: BoiteLabel | null
} {
  const { entree, teintes, candidats, peintReperes } = passe
  const { ctx, projecteur } = passe.entree
  // --- Labels ---
  const labels = composeLabels(candidats, projecteur.vue.fovDeg)
  for (const label of labels) {
    ctx.globalAlpha = label.categorie === 'CORPS' ? 1 : passe.apparition
    ctx.fillStyle = label.couleur ?? teintes.texte
    ctx.fillText(label.texte, label.xPx, label.yPx)
  }
  ctx.globalAlpha = 1

  // T-0085 — name masked by zoom threshold, revealed on hover. After retained labels, outside
  // their budget: `labelSurvol` fits it between them or gives up, erases none.
  //
  // T-0109 — same functions as labels pass → same text at same pixel: hover reveals exactly what
  // element would have carried. No label (bright star absent from named packet): falls back to
  // fiche title, the only name that body has.
  //
  // T-0316 — except under preview, where scène names nothing: hover designated what no layer
  // painted. Guard HERE AND in cibles: `survol` survives mode switch (cleared at next mouse move).
  const revele =
    entree.survol === undefined || !peintReperes
      ? null
      : labelSurvol(
          labels,
          boiteLabel(
            entree.survol.cible,
            libelleCible(entree.survol.cible) ?? titreCible(entree.survol.cible),
          ),
        )
  if (revele !== null) {
    ctx.fillStyle = teintes.texte
    ctx.fillText(revele.texte, revele.xPx, revele.yPx)
  }

  return { labels, revele }
}

/**
 * Planétarium frame: one pass per layer, in overlap order.
 * T-0193 — exceeds 50 lines, must stay so: holds the ORDER of passes, and order is the contract:
 * each layer paints on what previous deposited. Splitting would hide the only thing this body
 * says. Passes themselves stay under 50 lines.
 */
export function dessineCiel(entreeBrute: EntreeDessin): SortieDessin {
  const brut = entreeBrute.projecteur
  // §4.1 — sol layer holds by two complementary gestures. Sol PAINTED, opaque, over what was
  // drawn before: nothing else masks a thick stroke's width. What is drawn AFTER gets sol-blind
  // projecteur — else stars repaint over fresh sol and stay clickable.
  // T-0324 — under parcours sol isn't painted so filters nothing: path and its stars show below
  // horizon, and §9.1 pose grid leaves cadre — it'd fill the only scale repère scène keeps with
  // information saying nothing about the path.
  // PREVIEW WINS. Plan card and rail stay mounted whatever the tab: opening a deep-sky parcours
  // then switching to panorama put both modes on one image — filé preview with cadre forced
  // visible, sol forced invisible, dashed path on top. Preview stands for a shot (§9.5); a path
  // over it would annotate a photo, which it isn't. Parcours stays in memory, returns on leaving
  // preview.
  const modeParcours = entreeBrute.parcours !== undefined && entreeBrute.passeFile === undefined
  const entree: EntreeDessin = modeParcours
    ? { ...entreeBrute, poseCadre: undefined }
    : entreeBrute.couches.sol
      ? {
          ...entreeBrute,
          projecteur: projecteurSansSol(brut, entreeBrute.masque, entreeBrute.matriceCiel),
        }
      : entreeBrute
  const { projecteur } = entree
  // T-0171 — preview on whole scène stands for a shot: what comments it fades. Remain: sol,
  // horizon, matériel cadre — what FRAMES the field. T-0316 — selection stops with painting: under
  // preview neither hover nor click designate anything (see output below).
  const peintReperes = entree.passeFile === undefined && !modeParcours
  const couches: CouchesActives = peintReperes
    ? entree.couches
    : {
        ...entree.couches,
        figures: false,
        frontieres: false,
        asterismes: false,
        voieLactee: false,
        // T-0324 — parcours goes further than preview: also off what FRAMES the field. Matériel
        // cadre forced on whatever the rail — only source of remaining distance to cover.
        ...(modeParcours ? { sol: false, horizon: false, cadre: true } : {}),
      }
  const teintes = paletteScene(entree.modeNuit, entree.vueRealiste, entree.sbCiel)
  // §11.1 — mode nuit protects dark adaptation: brightening whole canvas defeats it. Vue réaliste
  // there changes only limiting magnitude.
  const fondPeint = entree.vueRealiste && !entree.modeNuit
  const apparition = entree.apparition ?? 1
  const largeur = projecteur.vue.largeurPx
  const hauteur = projecteur.vue.hauteurPx

  const passe: Passe = {
    entree,
    brut,
    couches,
    teintes,
    peintReperes,
    modeParcours,
    opaciteEtoiles: (modeParcours ? OPACITE_ETOILE_PARCOURS : peintReperes ? 1 : 0) * apparition,
    fondPeint,
    apparition,
    largeur,
    hauteur,
    p: pointEcran(),
    cibles: [],
    candidats: [],
  }

  // ORDER IS THE CONTRACT. Each pass paints on what previous deposited: sol covers band, repères
  // cover sol, labels cover repères, pose card covers all in cadre. Reorder = change image.
  passeFond(passe)
  const labelCentreGalactique = passeTraces(passe)
  const { stats, etoilesDessinees } = passeEtoiles(passe)
  const pixelsNommes = passeEtoilesNommees(passe)
  passeObjets(passe)
  passeCorps(passe)
  passeTrajetLune(passe)
  passeNomsVoieLactee(passe, labelCentreGalactique)
  passeNomsConstellations(passe)
  // §3.5, §9.1 — matériel cadre frames all the rest: outline with repères, pose card LAST (masks
  // what it covers).
  const cadreMateriel: EntreeCadre = {
    ctx: entree.ctx,
    brut,
    matriceCiel: entree.matriceCiel,
    cadres: entree.cadres,
    cadreCible: entree.cadreCible,
    teintes,
    actif: couches.cadre,
    poseCadre: entree.poseCadre,
  }
  dessineContourCadre(cadreMateriel)
  const { labels, revele } = passeLabels(passe)
  // T-0283 — above labels: opened cible name yields to no other.
  const reperes = peintReperes
    ? (entree.ciblesOuvertes ?? []).flatMap((objet) => {
        const boite = dessineRepereCible({
          ctx: entree.ctx,
          projecteur,
          objet,
          teinte: teintes.cadre,
          largeur,
          hauteur,
        })
        return boite === null ? [] : [boite]
      })
    : []
  dessineCarteDansCadre(cadreMateriel)
  // T-0324 — LAST: path goes over outline of the cadre it crosses. Painted before, the only
  // repère left to it would cut it.
  if (modeParcours && entree.parcours !== undefined) {
    dessineParcours(entree.ctx, projecteur, entree.parcours, teintes)
  }

  // T-0107 — named star must not ALSO be an anonymous cible. Same star read twice: `hyg-1.bin`
  // (Float32 position) vs `constellations-1.bin` (double). 0.04″ gap made anonymous entry win
  // nearest-hit half the time → hover said "no designation" under painted name. Same pixel:
  // identified one answers. Fallback branch still serves bright stars absent from named packet.
  const ciblesUniques = passe.cibles.filter(
    (c: CibleEcran) =>
      c.type !== 'ETOILE' ||
      c.etoileNommee !== undefined ||
      !pixelDejaNomme(pixelsNommes, c.xPx, c.yPx),
  )

  // T-0316 — under preview NOTHING is designatable, nothing painted. Star there = arc tens of px
  // long: its projected point carries nothing, hovering named void. Object marker/corps isn't
  // painted at all — hovering named a repère image doesn't show. Same rule for all three: what
  // preview didn't paint, cursor doesn't find.
  if (!peintReperes) return { stats, etoilesDessinees, cibles: [], labels, revele, reperes }

  return { stats, etoilesDessinees, cibles: ciblesUniques, labels, revele, reperes }
}

/**
 * Cible nearest to clicked point, within a few px.
 * T-0144 — marker larger than this radius is eligible over its whole extent (100 px ellipse isn't
 * designated by aiming its centre). DESIGNATION rule unchanged: among eligible cibles, nearest to
 * aimed point wins, even when a small one overlaps a large one.
 */
export function cibleSousLeCurseur(
  cibles: readonly CibleEcran[],
  xPx: number,
  yPx: number,
  /**
   * T-0069 — designation tolerance. Pointer aims at pixel, touch doesn't: keyboard driving passes
   * a wider radius, same rule (nearest cible to aimed point wins).
   */
  rayonPx: number = RAYON_CLIC_PX,
): CibleEcran | null {
  let meilleure: CibleEcran | null = null
  let meilleureDistance = Number.POSITIVE_INFINITY
  for (const cible of cibles) {
    const distance = Math.hypot(cible.xPx - xPx, cible.yPx - yPx)
    if (distance > Math.max(rayonPx, cible.rayonPx ?? 0)) continue
    if (distance <= meilleureDistance) {
      meilleureDistance = distance
      meilleure = cible
    }
  }
  return meilleure
}
