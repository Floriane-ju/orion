/**
 * Passe de rendu du planétarium — §3.1, §3.3, §3.4, §3.5.
 *
 * Une image = une matrice, un parcours d'index, un tracé. Le coût suit le nombre d'étoiles
 * RETENUES, jamais le nombre d'étoiles stockées : les cellules hors champ ne sont pas
 * visitées, et le parcours d'une cellule s'arrête à la magnitude limite du zoom.
 *
 * Les étoiles sont regroupées par teinte avant d'être tracées : changer `fillStyle` coûte
 * plus cher que tracer un disque, et huit changements par image valent mieux que dix mille.
 */

import { K } from '../registry/constants.ts'
import { champVisible } from './champ-visible.ts'
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
import type { CoucheFrontieres, CoucheTraces } from '../core/constellations.ts'
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
  rayonEtoilePx,
  type PointEcranMut,
  type Projecteur,
} from '../core/projection.ts'
import type { Cadre } from '../core/cadre.ts'
import type { PositionCorps } from '../core/ephem.ts'
import type { MasqueHorizon } from '../core/site.ts'
import { projecteurSansSol } from '../core/sol.ts'
import { dessineSol } from './dessine-sol.ts'
import {
  boiteLabel,
  libelleCible,
  titreCible,
  HAUTEUR_LABEL_PX,
  LARGEUR_CARACTERE_PX,
  MARQUEUR_OBJET_PX,
  RAYON_CORPS_PX,
} from './libelles-cibles.ts'
import {
  avecOpacite,
  couleurTeinte,
  paletteScene,
  teinte,
  TEINTES,
  type PaletteCiel,
} from './couleurs.ts'
import { dessineHaloHorizon, dessineHaloLune, type LuneEcran } from './dessine-fond-ciel.ts'
import type { OptiquePose } from './dessine-pose-cadre.ts'
import {
  dessineCarteDansCadre,
  dessineContourCadre,
  type EntreeCadre,
} from './dessine-cadre.ts'
import {
  OPACITE_ETOILE_PARCOURS,
  OPACITE_OBJET_ESTOMPE,
  teintesObjets,
} from './apparence-objets.ts'
import { dessineParcours } from './dessine-parcours.ts'
import type { ParcoursScene } from './scene-etat.ts'
import { geometrieMarqueur, peintCroix, peintEllipse } from './marqueur-objet.ts'

export interface CouchesActives {
  readonly figures: boolean
  readonly frontieres: boolean
  readonly asterismes: boolean
  readonly cadre: boolean
  readonly horizon: boolean
  readonly voieLactee: boolean
  /** §4.1 — le sol du site masque ce qui est dessous : rien n'y est tracé ni cliquable. */
  readonly sol: boolean
}

export type TypeCible = 'ETOILE' | 'OBJET' | 'CORPS'

/** Élément dessiné, conservé pour le pointage à la souris. */
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
   * T-0144 — encombrement du marqueur peint, en pixels depuis son centre. Le label s'y appuie
   * pour ne pas tomber DANS l'objet, et le clic pour porter jusqu'à son bord.
   */
  readonly rayonPx?: number
}

/**
 * T-0085, T-0109 — l'élément sous le curseur, et rien d'autre.
 *
 * L'appelant range ce que `cibleSousLeCurseur` lui a rendu ; la scène résout le texte et sa
 * place au moment où elle peint, avec les mêmes fonctions que les labels retenus. Un texte
 * déjà composé par l'appelant serait un second vocabulaire — c'est exactement ce que T-0109
 * a supprimé.
 */
export interface SurvolEcran {
  readonly cible: CibleEcran
}

export interface EntreeDessin {
  readonly ctx: CanvasRenderingContext2D
  readonly projecteur: Projecteur
  /** J2000 → repère horizontal du site : elle sert aux éléments définis dans ce repère. */
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
  readonly couches: CouchesActives
  readonly magLimite: number
  /**
   * §3.7 — fond de ciel du site : c'est lui qui module le contraste de la bande. La scène
   * montre ce que L'UTILISATEUR verra, pas une carte de référence idéale.
   */
  readonly sbCiel: number
  /** §3.7 — latitude du site : elle décide si le centre galactique est atteignable d'ici. */
  readonly latitudeDeg: number
  /** §4.1 — relief du site : il donne sa hauteur au sol de la couche `sol`, azimut par azimut. */
  readonly masque: MasqueHorizon
  /**
   * §3.3 — vue réaliste : le fond prend la luminance du fond de ciel du site, le halo
   * d'horizon et le halo lunaire s'y ajoutent, et les repères compensent le contraste perdu.
   * Décochée, la scène est celle d'avant T-0097, au pixel près.
   */
  readonly vueRealiste: boolean
  /**
   * T-0100 — la Lune telle que la scène la dessine. Absente : elle n'entre dans aucun calcul,
   * ce qui est le cas dès qu'elle est masquée (§3.1) ou que la vue réaliste est décochée.
   */
  readonly lune?: LuneEcran | undefined
  readonly modeNuit: boolean
  /**
   * §9.3 / T-0116 — la passe de filé, peinte entre le sol et les repères, avec le PROJECTEUR
   * FILTRÉ de la scène : les traces tombent donc sur les mêmes étoiles que le ciel qui les
   * entoure, et rien ne se peint sous le relief (§4.1).
   *
   * Sa présence REMPLACE la couche d'étoiles ponctuelles : une trace surmontée d'un point net
   * à une extrémité n'existe sur aucune pose. Elle vide aussi `cibles` (T-0316) : sous
   * l'aperçu, rien n'est peint, donc rien ne se désigne — une étoile n'est plus au pixel où
   * elle se projette, et les marqueurs d'objets et de corps ne sont plus là du tout.
   */
  readonly passeFile?:
    | ((ctx: CanvasRenderingContext2D, projecteur: Projecteur) => void)
    | undefined
  /**
   * §9.1 / T-0142 — l'optique dont la carte de pose a besoin. Présente : le cadre matériel est
   * masqué et garni de la grille de §9.1, en dernier, par-dessus tout ce qu'il recouvre.
   */
  readonly poseCadre?: OptiquePose | undefined
  /** §3.4 / T-0085 — absent : rien n'est survolé, la scène ne révèle aucun nom. */
  readonly survol?: SurvolEcran | undefined
  /**
   * §6.4 — les désignations que les filtres du catalogue retiennent (`cibles-en-avant.ts`).
   * Les autres marqueurs se peignent estompés, nom compris : la scène répond alors à la même
   * question que la liste. Absent — aucun filtre actif — tout garde sa pleine opacité.
   */
  readonly enAvant?: ReadonlySet<string> | undefined
  /**
   * §8.4 / T-0324 — le trajet de pointage. Présent, il tient lieu de scène entière : comme
   * l'aperçu de §9.5, il éteint tout ce qui COMMENTE le ciel, et il éteint en plus ce qui le
   * cadre — sol, horizon, grille de pose — parce qu'aucun de ces repères n'aide à aller d'une
   * étoile à la suivante. Ne survivent que le cadre matériel, seule échelle de distance, les
   * étoiles de fond très atténuées, et le trajet lui-même.
   */
  readonly parcours?: ParcoursScene | undefined
}

export interface SortieDessin {
  readonly stats: StatistiquesSelection
  readonly etoilesDessinees: number
  readonly cibles: readonly CibleEcran[]
  readonly labels: readonly CandidatLabel[]
  /** T-0085 — le label transitoire du survol, hors budget de §3.4. */
  readonly revele: BoiteLabel | null
}

/* T-0109 — la mise en page des labels appartient à `libelles-cibles.ts` : les tailles y sont
   déclarées, et importées ici pour les labels qui n'ont pas de cible (constellations,
   astérismes, Voie lactée). */
export const RAYON_CLIC_PX = 10
/* T-0107 — pas de la clé de pixel entier. Toute largeur de canevas réaliste lui est très
   inférieure, ce qui rend `y * PAS + x` injectif, y compris pour le voisinage à x = −1. */
const PAS_CLE_PIXEL = 65536
/** Sous ce rayon, l'antialiasing efface le disque : la plus faible étoile reste un point. */
const RAYON_MIN_ETOILE_PX = 0.7



/**
 * T-0107 — un pixel du voisinage immédiat porte-t-il déjà une étoile nommée ?
 *
 * Le voisinage 3×3 et non le seul pixel : les deux passes projettent la même étoile depuis
 * deux paquets qui n'ont pas la même précision, et leurs arrondis peuvent tomber de part et
 * d'autre d'une frontière de pixel.
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
 * Ce que toutes les passes d'une image partagent.
 *
 * `entree` porte le projecteur FILTRÉ par le sol ; `brut` est celui qui ignore le sol, et il
 * reste nécessaire à ce qui doit se peindre sous l'horizon — le cadre du matériel, l'horizon
 * lui-même, la bande. Les deux tableaux sont les accumulateurs de l'image : une passe y dépose
 * ce qu'elle a peint, `dessineCiel` en tire les labels et les cibles cliquables.
 */
interface Passe {
  readonly entree: EntreeDessin
  readonly brut: Projecteur
  readonly couches: CouchesActives
  readonly teintes: PaletteCiel
  /** T-0171 — faux quand l'aperçu plein ciel tient lieu de prise de vue : les repères s'effacent. */
  readonly peintReperes: boolean
  /** T-0324 — vrai quand la scène ne montre qu'un parcours de pointage (§8.4). */
  readonly modeParcours: boolean
  /**
   * T-0324 — opacité des étoiles de fond. Nulle sous l'aperçu de §9.5, où un point net à
   * l'extrémité d'une trace n'existe sur aucune pose ; atténuée sous un parcours, où le fond
   * n'est plus le sujet mais reste ce qui dit où l'on regarde ; pleine partout ailleurs.
   */
  readonly opaciteEtoiles: number
  readonly fondPeint: boolean
  readonly largeur: number
  readonly hauteur: number
  /** Point de travail unique pour toute l'image : aucune passe n'alloue par élément (T-0065). */
  readonly p: PointEcranMut
  readonly cibles: CibleEcran[]
  readonly candidats: CandidatLabel[]
}

const TOUR_RAD = 2 * Math.PI

/** §3.7, §4.1 — le fond, les halos, la bande et le sol : ce qui se peint sous tout le reste. */
function passeFond(passe: Passe): void {
  const { entree, brut, couches, teintes, fondPeint, largeur, hauteur } = passe
  const { ctx, projecteur } = passe.entree

  ctx.fillStyle = teintes.fond
  ctx.fillRect(0, 0, largeur, hauteur)
  // T-0098, T-0100 — les deux couches qui éclaircissent le fond passent AVANT la bande, le
  // sol et les repères : un fond peint par-dessus le repérage masque ce qui sert à s'orienter
  // (§3.7), et le relief doit recouvrir le halo quand la visée est basse (T-0094).
  if (fondPeint) {
    dessineHaloHorizon(ctx, brut, entree.matriceCiel, entree.sbCiel)
    if (entree.lune !== undefined) dessineHaloLune(ctx, brut, entree.sbCiel, entree.lune)
  }
  // §3.7 — la bande appartient au fond : elle passe sous l'aperçu de §9.5 comme
  // sous les repères. Peinte plus tard, elle laverait la prévisualisation qu'elle recouvre.
  // Elle est tracée au projecteur BRUT, puis recouverte par le sol : filtrée, un trait de
  // cinq degrés de large s'interromprait un pas d'azimut trop tôt et laisserait une encoche
  // au-dessus de l'horizon.
  if (couches.voieLactee) traceBandeVoieLactee({ ...entree, projecteur: brut })
  // §4.1 — le sol, peint sur le fond et sur la bande, sous tout le reste.
  if (couches.sol) {
    dessineSol(ctx, brut, entree.matriceCiel, entree.masque, teintes.sol, teintes.horizon)
  }
  // §9.5 — la passe de filé passe APRÈS le sol, mais avec le projecteur qui l'ignore : le sol
  // reste peint par-dessus le fond, et aucune trace ne se calcule sous l'horizon (§4.1).
  entree.passeFile?.(ctx, projecteur)
}

/** §3.3, T-0110, T-0173 — les repères tracés : constellations, horizon, plan galactique. */
function passeTraces(passe: Passe): CandidatLabel | null {
  const { entree, brut, couches, teintes } = passe
  const { ctx, projecteur } = passe.entree
  ctx.font = `${HAUTEUR_LABEL_PX}px system-ui, sans-serif`
  ctx.textBaseline = 'middle'

  // T-0110 — le champ se prend sur le projecteur BRUT : c'est une propriété de la vue, pas du
  // filtrage par le sol. La calotte obtenue englobe donc ce que le projecteur filtré montrera.
  const champScene = champVisible(brut)
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
    // Couche distincte des figures IAU par la teinte et l'épaisseur, pas par des tirets :
    // le motif de tirets se rend plein sur un segment plus court que sa période, et un
    // astérisme mélange des branches longues et des chaînes de segments courts. La même
    // couche paraîtrait alors tracée de deux façons.
    ctx.strokeStyle = teintes.asterismes
    ctx.lineWidth = 2
    traceSegments(ctx, projecteur, entree.asterismes, champScene)
    ctx.lineWidth = 1
  }
  if (couches.horizon) traceHorizon(entree, teintes.horizon, brut)
  // T-0173 — le TRAIT du plan galactique survit à l'aperçu : sur une prise de vue où la Voie
  // lactée se voit, c'est la seule ligne qui dise où elle passe. Il cadre comme l'horizon
  // cadre. La bande, le repère du centre et les noms, eux, l'annotent : ils restent éteints.
  // T-0324 — sous un parcours il s'éteint quand même : ce qui cadre une PRISE DE VUE n'aide pas
  // à aller d'une étoile à la suivante, et la scène du parcours ne garde que le cadre matériel.
  if (entree.couches.voieLactee && !passe.modeParcours) {
    ctx.strokeStyle = teintes.voieLactee
    ctx.lineWidth = 1
    traceLignes(ctx, projecteur, [PLAN_GALACTIQUE])
  }
  if (!couches.voieLactee) return null
  return repereCentreGalactique(entree, teintes.voieLactee, pointEcran())
}

/** §3.3 — les étoiles du paquet, regroupées par teinte : huit tracés, pas seize mille. */
function passeEtoiles(passe: Passe): { stats: StatistiquesSelection; etoilesDessinees: number } {
  const { entree, opaciteEtoiles, largeur, hauteur, p, cibles } = passe
  const { ctx, projecteur, index } = passe.entree
  // --- Étoiles ------------------------------------------------------------
  // Rayon du champ : la diagonale du canevas, exprimée en degrés au centre.
  const { centre: centreJ2000, rayonDeg: rayonChampDeg } = champVisible(projecteur)
  // Un `Path2D` par teinte, réalloué à chaque image : l'API n'offre aucun effacement, et
  // un chemin réutilisé accumulerait les disques des images précédentes. Contrainte de la
  // plateforme, pas négligence — huit objets par image, contre un par étoile évité plus bas.
  const chemins = Array.from({ length: TEINTES }, () => new Path2D())
  let etoilesDessinees = 0

  const stats = selectionne(
    index,
    centreJ2000,
    rayonChampDeg,
    entree.magLimite,
    (x, y, z, magV, bv, source) => {
      if (!projecteur.projetteEn(x, y, z, p)) return
      if (p.xPx < 0 || p.yPx < 0 || p.xPx > largeur || p.yPx > hauteur) return
      if (opaciteEtoiles > 0) {
        const rayon = Math.max(RAYON_MIN_ETOILE_PX, rayonEtoilePx(magV))
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

/** §3.4 — les étoiles nommées : leurs labels, et les pixels qu'elles occupent déjà (T-0107). */
function passeEtoilesNommees(passe: Passe): ReadonlySet<number> {
  const { entree, peintReperes, largeur, hauteur, p, cibles, candidats } = passe
  const { projecteur } = passe.entree
  // --- Étoiles nommées : labels et identification au clic -----------------
  const pixelsNommes = new Set<number>()
  for (const nommee of entree.etoilesNommees) {
    if (!etoileLabellisable(nommee.magV)) continue
    const v = versVecteur(nommee.adDeg, nommee.decDeg)
    if (!projecteur.projetteEn(v.x, v.y, v.z, p)) continue
    if (p.xPx < 0 || p.yPx < 0 || p.xPx > largeur || p.yPx > hauteur) continue
    pixelsNommes.add(Math.round(p.yPx) * PAS_CLE_PIXEL + Math.round(p.xPx))
    // T-0109 — `nom` ne porte plus le libellé : le nom d'une étoile se demande à
    // `libelleCible`, seule source du vocabulaire de la scène.
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

/** §3.4 — le ciel profond : un tracé par objet, chacun avec la teinte de son type. */
function passeObjets(passe: Passe): void {
  const { entree, teintes, peintReperes, largeur, hauteur, p, cibles, candidats } = passe
  const { ctx, projecteur } = passe.entree
  // --- Objets du ciel profond ---------------------------------------------
  // Un tracé par objet, là où les étoiles se regroupent en huit chemins : chacun porte la teinte
  // de son type et son dégradé (`apparence-objets.ts`). Ce sont quelques centaines d'ordres, pas
  // les seize mille que le regroupement des étoiles évite.
  const teintesParType = teintesObjets(entree.modeNuit, entree.vueRealiste, entree.sbCiel)
  // T-0195 — le plafond du ciel profond est FIXE, il n'est pas `entree.magLimite`. Celle-ci
  // est asservie au zoom (§3.3) parce que 83 479 étoiles referment le canevas à 180° ; un
  // marqueur d'objet ne représente pas un flux, il désigne un endroit. Asservi, il s'effaçait
  // au dézoom — le geste même par lequel on cherche où la cible tombe dans le ciel. Même
  // raison que la teinte des marqueurs en vue réaliste (`apparence-objets.ts`) : un repère ne
  // s'éteint ni avec le fond de ciel, ni avec le champ.
  const magObjets = K('MAG_LIMITE_OBJETS')
  for (const objet of entree.objets) {
    if (objet.vMag === null || objet.vMag > magObjets) continue
    const v = versVecteur(objet.adDeg, objet.decDeg)
    if (!projecteur.projetteEn(v.x, v.y, v.z, p)) continue
    if (p.xPx < 0 || p.yPx < 0 || p.xPx > largeur || p.yPx > hauteur) continue
    // La géométrie vient APRÈS les trois rejets : ses deux projections auxiliaires ne se paient
    // que pour ce qui se voit.
    const teintesObjet = teintesParType[objet.type]
    const geo = geometrieMarqueur(projecteur, objet, p.xPx, p.yPx)
    // Le filtre ne retire rien de la scène : il ne fait qu'éteindre ce qu'il ne retient pas.
    // Le clic, le survol et la fiche continuent donc de fonctionner sur un marqueur estompé.
    const estompe = entree.enAvant !== undefined && !entree.enAvant.has(objet.designation)
    // La géométrie se calcule même sans peinture : c'est elle qui donne au clic son rayon.
    if (peintReperes) {
      ctx.globalAlpha = estompe ? OPACITE_OBJET_ESTOMPE : 1
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
      // T-0144 — le nom et le clic suivent le marqueur peint, plus un carré de quatre pixels.
      rayonPx: geo === null ? MARQUEUR_OBJET_PX : geo.demiGrandPx,
    }
    cibles.push(cible)
    const texte = peintReperes ? libelleCible(cible) : null
    if (texte !== null) {
      candidats.push({
        ...boiteLabel(cible, texte),
        categorie: 'OBJET',
        priorite: objet.vMag,
        // Le nom suit son marqueur : un libellé à pleine lumière au-dessus d'un disque éteint
        // ramènerait au premier plan ce que le filtre vient d'écarter.
        ...(estompe ? { couleur: avecOpacite(teintes.texte, OPACITE_OBJET_ESTOMPE) } : {}),
      })
    }
  }
  // Les passes suivantes tracent au trait fin : l'épaisseur des contours ne leur appartient pas.
  ctx.lineWidth = 1
}

/** §3.4 — les corps mobiles, dont les noms passent avant tous les autres. */
function passeCorps(passe: Passe): void {
  const { entree, teintes, peintReperes, largeur, hauteur, p, cibles, candidats } = passe
  const { ctx, projecteur } = passe.entree
  // --- Corps mobiles -------------------------------------------------------
  const versJ2000 = transpose(entree.matriceCiel)
  for (const corps of entree.corps) {
    const v = applique(versJ2000, versVecteur(corps.azimutDeg, corps.hauteurDeg))
    if (!projecteur.projetteEn(v.x, v.y, v.z, p)) continue
    // Hors canevas comme partout ailleurs : un corps derrière l'observateur reste projetable,
    // et son label part avec la priorité la plus haute de la scène. Sans ce test, une planète
    // qu'on ne voit pas prenait la place d'un nom qu'on voit (§3.4).
    if (p.xPx < 0 || p.yPx < 0 || p.xPx > largeur || p.yPx > hauteur) continue
    if (peintReperes) {
      // T-0324 — la teinte se pose au moment de peindre, pas avant la boucle : une couleur
      // déposée sur le contexte par une passe qui ne peint rien annonce une couche absente.
      ctx.fillStyle = teintes.corps
      ctx.beginPath()
      ctx.arc(p.xPx, p.yPx, RAYON_CORPS_PX, 0, TOUR_RAD)
      ctx.fill()
    }
    const nom = entree.nomsCorps[corps.corps] ?? String(corps.corps)
    const cible: CibleEcran = { type: 'CORPS', xPx: p.xPx, yPx: p.yPx, nom, corps }
    cibles.push(cible)
    const texte = peintReperes ? libelleCible(cible) : null
    if (texte !== null) {
      candidats.push({
        ...boiteLabel(cible, texte),
        categorie: 'CONSTELLATION',
        priorite: -Infinity,
      })
    }
  }
}

/** T-0034, T-0091 — les noms de la couche Voie lactée : la bande, puis le centre galactique. */
function passeNomsVoieLactee(passe: Passe, labelCentreGalactique: CandidatLabel | null): void {
  const { couches, teintes, largeur, hauteur, candidats } = passe
  const { projecteur } = passe.entree
  // --- Noms de la couche Voie lactée --------------------------------------
  // Posés avant les noms de constellations : à priorité égale, le tri stable de
  // `composeLabels` les laisse passer devant eux plutôt que derrière. Et le repère du
  // centre galactique passe devant le nom de la bande, pour la même raison : les deux
  // s'ancrent au même endroit quand la visée est sur le centre, et c'est le repère qui
  // porte la conséquence site-dépendante.
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

/** §3.3 — les noms de constellations et d'astérismes, candidats comme les autres. */
function passeNomsConstellations(passe: Passe): void {
  const { entree, couches, peintReperes, largeur, hauteur, p, candidats } = passe
  const { projecteur } = passe.entree
  // --- Noms de constellations ---------------------------------------------
  for (const figure of peintReperes ? entree.figures : []) {
    if (figure.centre === null) continue
    if (!projecteur.projetteEn(figure.centre.x, figure.centre.y, figure.centre.z, p)) continue
    if (p.xPx < 0 || p.yPx < 0 || p.xPx > largeur || p.yPx > hauteur) continue
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
      if (p.xPx < 0 || p.yPx < 0 || p.xPx > largeur || p.yPx > hauteur) continue
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

/** §3.4, T-0085 — les labels retenus, puis le nom que le survol révèle. */
function passeLabels(passe: Passe): {
  labels: readonly CandidatLabel[]
  revele: BoiteLabel | null
} {
  const { entree, teintes, candidats, peintReperes } = passe
  const { ctx, projecteur } = passe.entree
  // --- Labels --------------------------------------------------------------
  const labels = composeLabels(candidats, projecteur.vue.fovDeg)
  for (const label of labels) {
    ctx.fillStyle = label.couleur ?? teintes.texte
    ctx.fillText(label.texte, label.xPx, label.yPx)
  }

  // T-0085 — le nom masqué par le seuil de zoom, révélé le temps du survol. Il est peint
  // après les labels retenus et n'entre pas dans leur budget : `labelSurvol` le loge entre
  // eux ou y renonce, il n'en efface aucun.
  //
  // T-0109 — mêmes fonctions que la passe des labels, donc même texte au même pixel : ce que
  // le survol révèle est exactement ce que l'élément aurait porté peint. Faute de libellé —
  // une étoile brillante que le paquet nommé ne porte pas — il retombe sur le titre de fiche,
  // seul nom que cet astre possède.
  //
  // T-0316 — sauf sous l'aperçu, où la scène ne nomme plus rien : le survol y désignait ce
  // qu'aucune couche n'a peint. La garde est ici ET dans les cibles, parce que `survol` survit
  // au basculement de mode — il ne s'efface qu'au mouvement de souris suivant.
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
 * L'image du planétarium : une passe par couche, dans l'ordre où elles se recouvrent.
 *
 * T-0193 — cette fonction dépasse cinquante lignes et doit le rester. Ce qu'elle contient est
 * l'ORDRE des passes, et l'ordre est le contrat : chaque couche peint sur ce que la précédente
 * a déposé. Le découper en deux moitiés ne raccourcirait pas la liste, il la couperait en deux
 * endroits où il faut aller la lire — c'est-à-dire qu'il cacherait la seule chose que ce corps
 * a à dire. Les passes, elles, tiennent chacune sous cinquante lignes.
 */
export function dessineCiel(entreeBrute: EntreeDessin): SortieDessin {
  const brut = entreeBrute.projecteur
  // §4.1 — la couche Sol tient par deux gestes complémentaires. Le sol est PEINT, opaque, sur
  // ce qui a été tracé avant lui : rien d'autre ne masque la largeur d'un trait épais. Et ce
  // qui est tracé APRÈS lui hérite d'un projecteur aveugle au sol — sans quoi les étoiles se
  // reposeraient par-dessus le sol qu'on vient de peindre, et resteraient cliquables.
  // T-0324 — sous un parcours le sol n'est pas peint, donc il ne filtre rien : le trajet et ses
  // étoiles se voient jusque sous l'horizon, et la grille de pose de §9.1 quitte le cadre —
  // elle y garnirait le seul repère d'échelle que la scène garde d'une information qui ne dit
  // rien du chemin à suivre.
  // L'APERÇU L'EMPORTE. La carte du plan et le rail restent montés quel que soit l'onglet :
  // ouvrir un parcours en ciel profond puis basculer en panorama amenait les deux modes sur la
  // même image — un aperçu de filé au cadre forcé visible, au sol forcé invisible, avec un
  // trajet en tirets par-dessus. Aucun des deux ne prévoit cela. L'aperçu tient lieu de prise
  // de vue (§9.5) ; un trajet peint dessus annoterait une photo, ce qu'elle n'est pas. Le
  // parcours reste en mémoire et revient dès qu'on quitte l'aperçu.
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
  // T-0171 — l'aperçu peint sur toute la scène tient lieu de prise de vue : ce qui la
  // commente s'efface. Ne restent que le sol, l'horizon et le cadre matériel — ce qui CADRE le
  // champ, pas ce qui l'annote. T-0316 — la sélection s'arrête avec la peinture : sous
  // l'aperçu, ni survol ni clic ne désignent quoi que ce soit (voir la sortie, plus bas).
  const peintReperes = entree.passeFile === undefined && !modeParcours
  const couches: CouchesActives = peintReperes
    ? entree.couches
    : {
        ...entree.couches,
        figures: false,
        frontieres: false,
        asterismes: false,
        voieLactee: false,
        // T-0324 — le parcours va plus loin que l'aperçu : il éteint aussi ce qui CADRE le
        // champ. Le cadre matériel, lui, est forcé allumé quel que soit le rail — c'est de lui
        // seul qu'on tire la distance qui reste à parcourir.
        ...(modeParcours ? { sol: false, horizon: false, cadre: true } : {}),
      }
  const teintes = paletteScene(entree.modeNuit, entree.vueRealiste, entree.sbCiel)
  // §11.1 — le mode nuit protège l'adaptation à l'obscurité : éclaircir tout le canevas le
  // rendrait inutile. La vue réaliste n'y change donc que la magnitude limite.
  const fondPeint = entree.vueRealiste && !entree.modeNuit
  const largeur = projecteur.vue.largeurPx
  const hauteur = projecteur.vue.hauteurPx

  const passe: Passe = {
    entree,
    brut,
    couches,
    teintes,
    peintReperes,
    modeParcours,
    opaciteEtoiles: modeParcours ? OPACITE_ETOILE_PARCOURS : peintReperes ? 1 : 0,
    fondPeint,
    largeur,
    hauteur,
    p: pointEcran(),
    cibles: [],
    candidats: [],
  }

  // L'ORDRE EST LE CONTRAT. Chaque passe peint sur ce que la précédente a déposé : le sol
  // recouvre la bande, les repères recouvrent le sol, les labels recouvrent les repères, et la
  // carte de pose recouvre tout ce qui tombe dans le cadre. Réordonner, c'est changer l'image.
  passeFond(passe)
  const labelCentreGalactique = passeTraces(passe)
  const { stats, etoilesDessinees } = passeEtoiles(passe)
  const pixelsNommes = passeEtoilesNommees(passe)
  passeObjets(passe)
  passeCorps(passe)
  passeNomsVoieLactee(passe, labelCentreGalactique)
  passeNomsConstellations(passe)
  // §3.5, §9.1 — le cadre matériel encadre tout le reste : son contour avec les repères, sa
  // carte de pose tout en dernier, parce qu'elle masque ce qu'elle recouvre.
  const cadreMateriel: EntreeCadre = {
    ctx: entree.ctx,
    brut,
    matriceCiel: entree.matriceCiel,
    cadres: entree.cadres,
    teintes,
    actif: couches.cadre,
    poseCadre: entree.poseCadre,
  }
  dessineContourCadre(cadreMateriel)
  const { labels, revele } = passeLabels(passe)
  dessineCarteDansCadre(cadreMateriel)
  // T-0324 — EN DERNIER : le trajet passe au-dessus du contour du cadre qu'il traverse. Peint
  // avant, il se ferait couper par le seul repère qu'on lui a laissé.
  if (modeParcours && entree.parcours !== undefined) {
    dessineParcours(entree.ctx, projecteur, entree.parcours, teintes)
  }

  // encore les étoiles brillantes que le paquet nommé ne porte pas.
  const ciblesUniques = passe.cibles.filter(
    (c: CibleEcran) =>
      c.type !== 'ETOILE' ||
      c.etoileNommee !== undefined ||
      !pixelDejaNomme(pixelsNommes, c.xPx, c.yPx),
  )

  // T-0316 — sous l'aperçu, RIEN n'est désignable, parce que rien n'est peint. Une étoile y
  // est un arc long de dizaines de pixels : le point où elle se projette ne porte plus rien, et
  // l'y survoler nommait du vide. Un marqueur d'objet ou un corps n'y est pas peint du tout —
  // le survoler nommait un repère que l'image ne montre pas. La règle est la même pour les
  // trois : ce que l'aperçu n'a pas peint, le curseur ne le trouve pas.
  if (!peintReperes) return { stats, etoilesDessinees, cibles: [], labels, revele }

  return { stats, etoilesDessinees, cibles: ciblesUniques, labels, revele }
}

/**
 * Cible la plus proche du point cliqué, dans un rayon de quelques pixels.
 *
 * T-0144 — un marqueur plus grand que ce rayon est éligible sur toute son étendue : une ellipse
 * de cent pixels ne se désigne pas en visant son centre. La règle de DÉSIGNATION ne change pas
 * pour autant — parmi les cibles éligibles, c'est toujours la plus proche du point visé qui
 * gagne, y compris quand une petite se superpose à une grande.
 */
export function cibleSousLeCurseur(
  cibles: readonly CibleEcran[],
  xPx: number,
  yPx: number,
  /**
   * T-0069 — tolérance de désignation. Le pointeur vise au pixel, une touche non : le
   * pilotage au clavier passe donc un rayon plus large, sans changer la règle — c'est
   * toujours la cible la plus proche du point visé qui est retenue.
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
