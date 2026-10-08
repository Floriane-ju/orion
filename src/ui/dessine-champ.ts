/**
 * §9.2 et §9.3 — passe de rendu de la prévisualisation de champ et du filé.
 *
 * DEUX COUCHES, un seul moteur de projection : celui de §3.3. La couche 1 vient du catalogue
 * réel, la couche 2 du semis génératif au-delà du seuil catalographié.
 *
 * Une seule primitive dessine les étoiles, ponctuelles ou filées : l'arc de §9.3, balayé
 * pendant la durée d'accumulation demandée. Une pose unitaire trop longue produit donc
 * naturellement une étoile ovalisée — c'est le même code que le filé de quatre heures, à la
 * durée près.
 *
 * T-0116 — la passe ne peint plus ni fond ni bande galactique, et ne se resserre plus sur le
 * cadre : elle se dessine À MÊME le canevas de la scène, sur toute sa surface, entre le sol et
 * les repères. Le planétarium a déjà peint le vrai fond de ciel du site (§3.7, halo d'horizon,
 * halo lunaire, crépuscule) et sa propre Voie lactée (§3.6) ; les repeindre ici les
 * effacerait, ou en superposerait une seconde version de teinte différente. Ce qui reste
 * propre à cette passe est donc uniquement ce que la pose ajoute : les traces. Le centre de
 * rotation n'est plus marqué d'une croix : les arcs le désignent d'eux-mêmes, et sa position
 * reste lisible dans le diagnostic du panneau.
 */

import { K } from '../registry/constants.ts'
import {
  arcEtoile,
  arcInvisible,
  arcsVisibles,
  effectifCielPourCouverture,
  longueurArcDeg,
} from '../core/file-etoiles.ts'
import {
  opaciteEtoile,
  profondeurPourZ,
  tableProfondeurParPixel,
  type EntreeProfondeur,
} from '../core/galactique.ts'
import type { IndexCiel } from '../core/index-ciel.ts'
import { fondLune, opaciteSousLuneXYZ, type FondLune, type LuneFile } from '../core/fond-lune-file.ts'
import { magnitudePourEffectif, selectionne } from '../core/index-ciel.ts'
import { rayonChampDeg, rayonEtoilePx, type Projecteur } from '../core/projection.ts'
import { angleDeSinDeg, DEG, separationDeg, type Vec3 } from '../core/mat3.ts'
import { TEINTES, couleurTeinteOpacite, teinte } from './couleurs.ts'
import { DEMI_TOUR_DEG, encadre, QUART_TOUR_DEG as DROIT, S_PAR_MIN, TOUR_RAD } from '../core/unites.ts'
import { RAYON_MIN_ETOILE_PX } from './apparence-objets.ts'

/**
 * Ce que la passe tient du matériel et des réglages de §9 — tout ce qui NE dépend PAS de
 * l'image en cours. C'est cette part que React calcule et publie ; la vue, le projecteur et
 * l'axe du pôle, eux, appartiennent à l'image que la boucle est en train de peindre (T-0116).
 */
export interface ParametresFile {
  /** Profondeur atteinte par la pose unitaire (§9.2) : borne de sélection du catalogue. */
  readonly magLimite: number
  /** Entrées de profondeur, réévaluées par étoile avec sa pose par pixel réelle (§9.3). */
  readonly profondeur: EntreeProfondeur
  /** Échantillonnage du capteur, en secondes d'arc par pixel : il fixe la pose par pixel. */
  readonly echApx: number
  /**
   * T-0400 — fond du ciel du site, en mag/arcsec² : celui dont `profondeur.eCielPxS` est tiré.
   * La gêne lunaire s'y rapporte — B_lune / B_site — pour éclaircir ce flux, direction par
   * direction.
   */
  readonly sbSiteMag: number
  /** Suivi actif (§5.2) : les étoiles restent ponctuelles et le pixel reçoit toute la pose. */
  readonly suiviActif: boolean
  /** Durée d'accumulation dessinée : pose unitaire en prévisualisation, durée totale en filé. */
  readonly dureeS: number
  /**
   * T-0119 — plafond de LISIBILITÉ : part du canevas que les traces peuvent peindre, ou `null`
   * quand il n'y a pas de trace dont la longueur se lise. L'aperçu de champ est dans ce cas — ses
   * étoiles sont des points, elles ne se recouvrent pas.
   *
   * Vient du registre en usage réel ; le banc l'ouvre en ligne de commande, parce que c'est la
   * mesure qui règle cette valeur, et parce qu'un `null` doit pouvoir reproduire l'image d'avant
   * le plafond — sans quoi « le plafond seul a changé » se raconte au lieu de se vérifier.
   */
  readonly couvertureMax: number | null
  /**
   * T-0119 — plafond de COÛT : étoiles du ciel entier au plus retenues, ou `null` pour ne rien
   * borner. Deux grandeurs distinctes, deux champs : la couverture borne ce que l'image montre,
   * l'effectif borne ce que la passe lit. L'aperçu de champ n'a que le second — c'est un écran de
   * PROFONDEUR, ses points ne se recouvrent pas, mais lire cent quatre-vingt mille étoiles par
   * image coûtait 160 ms.
   */
  readonly effectifMax: number | null
}

export interface EntreeDessinChamp extends ParametresFile {
  /** Catalogue réel : couche 1, positions exactes jusqu'au seuil catalographié. */
  readonly indexReel: IndexCiel
  /** Semis génératif : couche 2, au-delà du seuil. */
  readonly indexSemis: IndexCiel
  readonly ctx: CanvasRenderingContext2D
  readonly projecteur: Projecteur
  /** Direction J2000 du pôle céleste nord de l'époque : centre exact des arcs (§9.3). */
  readonly axePoleNord: Vec3
  readonly modeNuit: boolean
  /**
   * T-0400 — la Lune retenue pour la séance, en vue réaliste : elle éclaircit le fond de chaque
   * pixel selon sa séparation, et les traces faibles s'y perdent d'abord. Absente : le fond du
   * site seul, partout.
   */
  readonly lune?: LuneFile | null | undefined
}

export interface SortieDessinChamp {
  readonly etoilesReelles: number
  readonly etoilesGenerees: number
  /**
   * Étoiles lues par la sélection, tracées ou non. C'est ce compteur, et pas le nombre
   * d'étoiles dessinées, qui dit ce que la passe a coûté : sans lui, un gain de sélection se
   * raconte au lieu de se chiffrer (T-0021).
   */
  readonly etoilesVisitees: number
  /**
   * T-0119 — surface peinte par les traces, en part du canevas. C'est la grandeur que le plafond
   * borne : sans elle, le réglage de `COUVERTURE_TRACES_MAX` se raconte au lieu de se chiffrer.
   * Somme des longueurs VISIBLES — celles qui tombent hors du canevas ne coûtent rien et ne
   * cachent rien. Peut dépasser 1 : c'est justement ce qu'on veut voir.
   */
  readonly couverturePeinte: number
}

/**
 * Étoiles en attente de peinture, rangées par chemin partagé.
 *
 * T-0119 — l'aperçu de champ peignait seize mille étoiles en trente-six mille ordres de tracé,
 * chacun précédé d'écritures de `globalAlpha`, `fillStyle`, `strokeStyle` et `lineWidth`. Ce n'est
 * pas le calcul qui coûtait là, c'est le NOMBRE D'ORDRES. `dessineCiel` réglait déjà le même
 * problème pour sa couche d'étoiles ponctuelles, avec un `Path2D` par teinte ; il manquait ici les
 * deux axes que cette passe ajoute — l'opacité, et la largeur de trait.
 *
 * Deux familles, parce que le canevas a deux primitives. Un disque se remplit et porte son rayon
 * dans sa géométrie : sa clé est (teinte, opacité). Une trace se trace, et un chemin partagé ne
 * porte qu'une largeur : sa clé est (teinte, opacité, rayon). Les chemins s'allouent à la demande —
 * une scène qui n'emploie que trois teintes ne paie pas les autres.
 */
interface EnAttente {
  readonly disques: (Path2D | undefined)[]
  readonly traces: (Path2D | undefined)[]
  readonly niveauxOpacite: number
  readonly niveauxRayon: number
  /** Rayon de l'étoile la plus brillante du paquet : borne haute des paliers. */
  readonly rayonMaxPx: number
}

function enAttente(rayonMaxPx: number): EnAttente {
  const niveauxOpacite = K('NIVEAUX_OPACITE_ETOILE')
  const niveauxRayon = K('NIVEAUX_RAYON_ETOILE')
  return {
    disques: Array.from({ length: TEINTES * niveauxOpacite }, () => undefined),
    traces: Array.from({ length: TEINTES * niveauxOpacite * niveauxRayon }, () => undefined),
    niveauxOpacite,
    niveauxRayon,
    rayonMaxPx: Math.max(RAYON_MIN_ETOILE_PX * (1 + Number.EPSILON), rayonMaxPx),
  }
}

/** Opacité ramenée à son palier : c'est le palier qui décide du chemin, donc de l'ordre de tracé. */
function palierOpacite(opacite: number, niveaux: number, plancher: number): number {
  const relatif = (opacite - plancher) / (1 - plancher)
  return encadre(Math.round(relatif * (niveaux - 1)), 0, niveaux - 1)
}

function opaciteDuPalier(palier: number, niveaux: number, plancher: number): number {
  return plancher + ((1 - plancher) * palier) / (niveaux - 1)
}

/**
 * T-0402 — planchers des paliers de TRACE : le fil le plus fin descend sous le disque le plus
 * petit, et l'opacité d'une longue trace sous celle d'un disque. Les disques gardent les leurs.
 */
const DEMI_LARGEUR_MIN_PX = Math.min(RAYON_MIN_ETOILE_PX, K('LARGEUR_TRACE_MIN_PX') / 2)
const PLANCHER_OPACITE_DISQUE = K('OPACITE_TRACE_MIN')
const PLANCHER_OPACITE_TRACE = K('OPACITE_TRACE_MIN') * K('OPACITE_TRACE_MAX')

/**
 * T-0402 — avancée d'une trace de son disque vers son fil, de 0 à 1. Une trace à peine plus
 * longue que le rayon garde la largeur et l'éclat du disque ; le fil fin et atténué n'est atteint
 * qu'à `LONGUEUR_FONDU_TRACE_RAYONS` rayons. Sans ce fondu, une étoile brillante passait d'un
 * coup du disque plein au fil pâle, et semblait s'éteindre en se mettant à filer.
 */
export function avanceeVersFil(longueurPx: number, rayonPx: number): number {
  return encadre((longueurPx - rayonPx) / (rayonPx * K('LONGUEUR_FONDU_TRACE_RAYONS')), 0, 1)
}

/**
 * Paliers de rayon géométriques, et non linéaires : le rayon suit la magnitude en loi de
 * puissance, donc les étoiles s'entassent près du plancher. Un pas constant y gaspillerait tous
 * ses paliers sur les quelques étoiles brillantes.
 */
function palierRayon(rayon: number, en: EnAttente): number {
  const relatif =
    Math.log(rayon / DEMI_LARGEUR_MIN_PX) / Math.log(en.rayonMaxPx / DEMI_LARGEUR_MIN_PX)
  return encadre(Math.round(relatif * (en.niveauxRayon - 1)), 0, en.niveauxRayon - 1)
}

function rayonDuPalier(palier: number, en: EnAttente): number {
  return (
    DEMI_LARGEUR_MIN_PX *
    (en.rayonMaxPx / DEMI_LARGEUR_MIN_PX) ** (palier / (en.niveauxRayon - 1))
  )
}

/**
 * T-0402 — largeur d'une trace filée : celle de la tache stellaire, pas le diamètre du disque de
 * carte. Elle suit encore l'éclat — même loi en magnitude que le rayon — mais s'encadre entre le
 * fil d'un pixel et un plafond bas : sur une photo, c'est l'éclat qui distingue les traces, pas
 * leur épaisseur.
 */
export function largeurTracePx(rayonPx: number): number {
  return encadre(
    rayonPx * K('RAPPORT_LARGEUR_TRACE_RAYON'),
    K('LARGEUR_TRACE_MIN_PX'),
    K('LARGEUR_TRACE_MAX_PX'),
  )
}

function peintEnAttente(
  ctx: CanvasRenderingContext2D,
  en: EnAttente,
  modeNuit: boolean,
): void {
  for (let i = 0; i < en.disques.length; i++) {
    const chemin = en.disques[i]
    if (chemin === undefined) continue
    ctx.fillStyle = couleurTeinteOpacite(
      i % TEINTES,
      opaciteDuPalier(Math.floor(i / TEINTES), en.niveauxOpacite, PLANCHER_OPACITE_DISQUE),
      modeNuit,
    )
    ctx.fill(chemin)
  }
  ctx.lineCap = 'round'
  // T-0402 — la lumière s'ajoute sur le capteur : deux traces qui se croisent éclaircissent le
  // croisement, aucune ne masque l'autre, et le fond reste noir entre les fils.
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < en.traces.length; i++) {
    const chemin = en.traces[i]
    if (chemin === undefined) continue
    const teintePalette = i % TEINTES
    const reste = Math.floor(i / TEINTES)
    ctx.strokeStyle = couleurTeinteOpacite(
      teintePalette,
      opaciteDuPalier(reste % en.niveauxOpacite, en.niveauxOpacite, PLANCHER_OPACITE_TRACE),
      modeNuit,
    )
    ctx.lineWidth = 2 * rayonDuPalier(Math.floor(reste / en.niveauxOpacite), en)
    ctx.stroke(chemin)
  }
  // Rendus à leurs valeurs par défaut, comme la passe du ciel le fait de la bande : ce qui se
  // trace ensuite sur le même contexte ne doit pas hériter d'un bout de trait arrondi.
  ctx.lineWidth = 1
  ctx.lineCap = 'butt'
  ctx.globalCompositeOperation = 'source-over'
}

interface Compteur {
  dessinees: number
  /** Étoiles lues par `selectionne`, avant tout tri : le coût de la passe se lit ici. */
  visitees: number
  /** Surface peinte, en pixels carrés : longueur visible × largeur de trait. */
  surfacePx: number
}

/** Ce que les deux couches partagent de l'image en cours : calculé une fois, jamais deux. */
interface Scene {
  readonly centreJ2000: Vec3
  /**
   * Rayon de la sélection, en degrés — le champ ÉLARGI du balayage, pas le champ de la scène.
   *
   * T-0119 — une étoile hors du champ dont le cercle de déclinaison le traverse laisse une trace
   * dans l'image : sélectionner sur le seul champ de la scène l'oublie. À huit heures de filé,
   * c'est la moitié des traces qui manquait, et un panoramique les faisait apparaître d'un coup —
   * elles étaient là depuis le début. L'élargissement vaut le balayage complet, `ω·T`, qui borne
   * le déplacement d'une étoile sur la sphère pendant la séquence. `arcInvisible` écarte ensuite
   * celles qui ne touchent rien, sur une boîte englobante, avant tout ordre de tracé.
   */
  readonly rayonSelectionDeg: number
  /**
   * Distance angulaire du pôle au centre du champ, en degrés, et rayon du champ élargi de la
   * demi-largeur d'une trace.
   *
   * T-0119 — le tri qui rend la sélection élargie abordable. Une étoile file sur son cercle de
   * déclinaison : ce cercle touche le champ si, et seulement si, son rayon polaire s'écarte de
   * moins que le rayon du champ de celui du centre de visée. Le test est un écart absolu sur une
   * déclinaison déjà lue, et il passe AVANT l'arc — le calcul le plus cher de la passe, comme en
   * T-0022. Sans lui, un champ de 10° sur un filé de huit heures calculait quinze mille arcs pour
   * en peindre trois mille : la sélection doit couvrir tout le balayage, pas le payer.
   */
  /**
   * Bornes du test, en SINUS de déclinaison : la déclinaison est monotone en `z`, donc l'écart
   * absolu se compare aussi bien sur `z`, et sans arc sinus par étoile.
   */
  readonly zMin: number
  readonly zMax: number
  /** §9.3 — profondeur atteinte par pixel, tabulée par `z` : un poste de calcul par étoile en moins. */
  readonly profondeurParZ: Float64Array
  /** T-0400 — sous la Lune, profondeur et contraste dépendent aussi de la direction. */
  readonly fondLune: FondLune | null
  /** Avec suivi, l'étoile ne se déplace pas sur le capteur : ni trace, ni étalement du flux. */
  readonly dureeMin: number
}

function sceneCourante(entree: EntreeDessinChamp): Scene {
  const { projecteur } = entree
  const dureeMin = entree.suiviActif ? 0 : entree.dureeS / S_PAR_MIN
  const table = { profondeur: entree.profondeur, echApx: entree.echApx, suiviActif: entree.suiviActif }
  const centreJ2000 = projecteur.inverse(projecteur.centreXPx, projecteur.centreYPx)
  // T-0116 — la sélection couvre tout le champ de la scène : les traces s'y voient partout, le
  // cadre ne les borne plus, il dit seulement lesquelles le capteur enregistrerait. Le budget
  // d'étoiles du filé se convertit sur CE rayon : même champ, même image, même coût.
  const rayonChamp = rayonChampDeg(projecteur.vue)
  // Marge du test, en degrés : un cercle tangent au champ à moins d'une demi-largeur de trait y
  // peint encore. L'échelle du centre de visée est la plus grossière de la scène — en
  // stéréographique le facteur radial croît vers le bord — donc c'est elle qui rend la marge
  // conservatrice partout.
  const degParPx = separationDeg(
    centreJ2000,
    projecteur.inverse(projecteur.centreXPx + 1, projecteur.centreYPx),
  )
  // Demi-largeur du trait le plus large que la passe peut tracer : celui de l'étoile la plus
  // brillante du paquet chargé.
  const margePx = rayonEtoilePx(entree.indexReel.magMin) + K('MARGE_ANTIALIASING_PX')
  // Le cercle de déclinaison d'une étoile touche le champ si son rayon polaire s'écarte de moins
  // que le rayon du champ de celui du centre de visée. Traduit en déclinaison, cela borne un
  // intervalle — donc, la déclinaison étant monotone en `z`, un intervalle de `z`.
  const coDecCentreDeg =
    DROIT - angleDeSinDeg(centreJ2000.z)
  const rayonTestDeg = rayonChamp + margePx * degParPx
  const borne = (coDecDeg: number): number =>
    Math.sin(encadre(DROIT - coDecDeg, -DROIT, DROIT) * DEG)
  return {
    centreJ2000,
    rayonSelectionDeg: Math.min(DEMI_TOUR_DEG, rayonChamp + longueurArcDeg(dureeMin, 0).value),
    zMin: borne(coDecCentreDeg + rayonTestDeg),
    zMax: borne(coDecCentreDeg - rayonTestDeg),
    profondeurParZ: tableProfondeurParPixel(table),
    fondLune: entree.lune === null || entree.lune === undefined ? null : fondLune(entree.lune, table),
    dureeMin,
  }
}

/** Une étoile : un arc balayé pendant la durée d'accumulation, ponctuel quand elle est brève. */
function dessineCouche(
  entree: EntreeDessinChamp,
  scene: Scene,
  index: IndexCiel,
  magMin: number,
  magParZ: Float64Array,
  compteur: Compteur,
  attente: EnAttente,
): void {
  const { projecteur } = entree
  const { centreJ2000, dureeMin, rayonSelectionDeg } = scene
  // La sélection lit jusqu'à la limite la plus profonde des déclinaisons que le champ peut
  // recevoir ; chaque étoile se juge ensuite sur la limite de sa propre case.
  const magMax = maxSurZ(magParZ, scene.zMin, scene.zMax)
  if (magMax <= magMin) return

  const stats = selectionne(index, centreJ2000, rayonSelectionDeg, magMax, (x, y, z, magV, bv) => {
    if (magV < magMin) return
    // Le cercle de déclinaison de l'étoile touche-t-il le champ ? Deux comparaisons, avant tout le
    // reste, et sur la composante polaire brute : pas d'arc sinus par étoile.
    if (z < scene.zMin || z > scene.zMax) return
    if (magV > profondeurPourZ(magParZ, z)) return
    const rayon = Math.max(RAYON_MIN_ETOILE_PX, rayonEtoilePx(magV))
    // Marge du rejet et du découpage : la demi-largeur du trait, plus le débord
    // d'anticrénelage. Rejeter au ras du bord effacerait ce débord — un pixel de trace.
    const margeTrace = rayon + K('MARGE_ANTIALIASING_PX')

    // La brillance d'une trace se juge sur la pose vue PAR PIXEL, pas sur la durée totale :
    // c'est pour cela qu'un filé de deux heures ne montre que les étoiles brillantes, là où
    // la même durée en poses fixes empilées en montrerait des milliers.
    //
    // Ce tri passe AVANT l'arc (T-0022) : il ne dépend que de la déclinaison, lue dans `z`,
    // et l'arc est le calcul le plus cher de la passe. Une étoile écartée ici ne doit pas
    // l'avoir payé.
    const opacite =
      scene.fondLune === null
        ? opaciteEtoile(magV, profondeurPourZ(scene.profondeurParZ, z))
        : opaciteSousLuneXYZ(scene.fondLune, magV, x, y, z)
    if (opacite < K('OPACITE_TRACE_MIN')) return

    const arc = arcEtoile(projecteur, { x, y, z }, dureeMin, entree.axePoleNord)
    if (arc.segments.length === 0) return
    // T-0115 avait remplacé la polyligne — qui rompait son tracé au bord du canevas — par un
    // cercle exact, confié en UN ordre à `ctx.arc`, balayage entier. Le calcul y a gagné un
    // facteur quatre, le raster l'a reperdu : un cercle de dix-sept mille pixels de rayon dont
    // rien ne touche l'écran se peignait intégralement. Au cas usuel, 3 600 arcs sur 4 600
    // étaient dans ce cas — quatre cinquièmes de la longueur peinte, invisible par
    // construction. La boîte les rejette avant l'ordre de tracé.
    if (arcInvisible(arc, projecteur.vue, margeTrace)) return
    const cercle = arc.cercle
    const teintePalette = teinte(bv)


    if (arc.longueurPx <= rayon) {
      // Trace plus courte que l'étoile elle-même : elle reste un disque, et rejoint le chemin de
      // son couple (teinte, opacité) au lieu d'un ordre de tracé à elle. Les disques d'un même
      // chemin qui se recouvrent ne se cumulent plus — un remplissage par non-zéro les compte une
      // fois. C'est ce que fait la lumière : un pixel saturé ne sature pas deux fois.
      const point = arc.segments[0]![0]!
      const pOpacite = palierOpacite(opacite, attente.niveauxOpacite, PLANCHER_OPACITE_DISQUE)
      const indice = pOpacite * TEINTES + teintePalette
      const chemin = (attente.disques[indice] ??= new Path2D())
      chemin.moveTo(point.xPx + rayon, point.yPx)
      chemin.arc(point.xPx, point.yPx, rayon, 0, TOUR_RAD)
      compteur.surfacePx += Math.PI * rayon * rayon
    } else {
      // T-0402 — largeur et opacité glissent du disque vers le fil. L'atténuation des longues
      // traces tient à leur addition : à pleine opacité, le moindre croisement sature en blanc.
      const t = avanceeVersFil(arc.longueurPx, rayon)
      const demiTrace = rayon + (largeurTracePx(rayon) / 2 - rayon) * t
      const opaciteTrace = opacite * (1 + (K('OPACITE_TRACE_MAX') - 1) * t)
      const pOpacite = palierOpacite(opaciteTrace, attente.niveauxOpacite, PLANCHER_OPACITE_TRACE)
      const indice =
        (palierRayon(demiTrace, attente) * attente.niveauxOpacite + pOpacite) * TEINTES + teintePalette
      const chemin = (attente.traces[indice] ??= new Path2D())
      if (cercle !== null) {
        // T-0115 — en stéréographique l'arc EST un cercle : la primitive du canevas le trace
        // exactement, là où la polyligne l'approchait en centaines de cordes. Mais elle trace
        // TOUT ce qu'on lui donne : le balayage est donc découpé sur le bord du canevas, comme
        // la polyligne le faisait d'elle-même. Quatre cinquièmes de la longueur peinte au
        // plein ciel tombaient hors de l'écran.
        const c = cercle
        // Portions du balayage qui touchent le canevas. Le découpage se fait ICI, dans la
        // seule branche qui trace un long arc : le disque, lui, se juge sur la boîte, et une
        // trace sous-pixel qui effleure le bord ne doit pas disparaître sur un découpage.
        for (const portion of arcsVisibles(c, projecteur.vue, margeTrace)) {
          compteur.surfacePx += Math.abs(portion.balayageRad) * c.rayonPx * demiTrace * 2
          // `moveTo` sur le départ de la portion AVANT l'arc : sans lui, `arc` relie la fin de la
          // portion précédente au début de celle-ci par une corde, et deux traces séparées par un
          // passage hors écran se retrouveraient jointes par un trait droit.
          chemin.moveTo(
            c.xPx + c.rayonPx * Math.cos(portion.debutRad),
            c.yPx + c.rayonPx * Math.sin(portion.debutRad),
          )
          if (c.rayonPx <= K('RAYON_ARC_NATIF_MAX_PX')) {
            chemin.arc(
              c.xPx,
              c.yPx,
              c.rayonPx,
              portion.debutRad,
              portion.debutRad + portion.balayageRad,
              portion.balayageRad < 0,
            )
            continue
          }
          // Rayon démesuré — vue zoomée, centre du cercle à des centaines de milliers de pixels :
          // le raster du navigateur calcule l'arc en simple précision et, si loin du centre, perd
          // le sous-pixel. Un trait épais en sortait en goutte, en demi-disque ou en gélule selon
          // l'arrondi du moment. Les cordes se calculent ici, en double précision ; à ce rayon,
          // il en faut une poignée.
          const cordes = cordesPourArc(c.rayonPx, portion.balayageRad)
          for (let i = 1; i <= cordes; i++) {
            const angle = portion.debutRad + (portion.balayageRad * i) / cordes
            chemin.lineTo(c.xPx + c.rayonPx * Math.cos(angle), c.yPx + c.rayonPx * Math.sin(angle))
          }
        }
      } else {
        for (const segment of arc.segments) {
          segment.forEach((p, i) => {
            if (i === 0) chemin.moveTo(p.xPx, p.yPx)
            else {
              chemin.lineTo(p.xPx, p.yPx)
              const precedent = segment[i - 1]!
              compteur.surfacePx +=
                Math.hypot(p.xPx - precedent.xPx, p.yPx - precedent.yPx) * demiTrace * 2
            }
          })
        }
      }
    }
    compteur.dessinees++
  })
  compteur.visitees += stats.etoilesExaminees
}

/**
 * T-0402 — nombre de cordes qui tracent un arc de cercle à moins de `FLECHE_MAX_CORDE_PX` près.
 * Une corde c sur un rayon R s'écarte de l'arc de c²/8R : la corde admise vaut √(8R·f).
 */
export function cordesPourArc(rayonPx: number, balayageRad: number): number {
  const cordeMax = Math.sqrt(8 * rayonPx * K('FLECHE_MAX_CORDE_PX'))
  return Math.max(1, Math.ceil((rayonPx * Math.abs(balayageRad)) / cordeMax))
}

/** Les deux plafonds de T-0119, en effectif de ciel entier. */
export interface Budget {
  /** Plafond de lisibilité, valable là où une trace balaie un grand cercle. */
  readonly couverture: number
  /** Plafond de coût : il compte des étoiles lues, pas une surface, et ne se compense pas. */
  readonly max: number
}

/**
 * T-0401 — magnitude limite d'une couche, par case de `z`. Une trace balaie un arc en cos δ : près
 * du pôle elle peint peu, et une coupure unique, taillée pour l'équateur céleste, y vidait le
 * ciel. Le budget de couverture s'y divise par cos^α δ. `depense` : l'effectif déjà pris par la
 * couche précédente.
 */
export function tableMagParZ(
  index: IndexCiel,
  budget: Budget,
  depense: number,
  plafond: number,
): Float64Array {
  const cases = K('CASES_TABLE_PROFONDEUR_TRACE')
  const alpha = K('COMPENSATION_COUVERTURE_POLAIRE')
  const table = new Float64Array(cases)
  for (let i = 0; i < cases; i++) {
    const z = -1 + (2 * (i + 1 / 2)) / cases
    const cosDec = Math.sqrt(1 - z * z)
    const effectif = Math.min(budget.max, budget.couverture / cosDec ** alpha)
    table[i] = Math.min(plafond, magnitudePourEffectif(index, effectif - depense))
  }
  return table
}

/** La limite la plus profonde des cases que couvre l'intervalle `[zMin ; zMax]`. */
function maxSurZ(table: Float64Array, zMin: number, zMax: number): number {
  const caseDe = (z: number): number =>
    encadre((((z + 1) * table.length) / 2) | 0, 0, table.length - 1)
  let max = -Infinity
  for (let i = caseDe(zMin); i <= caseDe(zMax); i++) max = Math.max(max, table[i]!)
  return max
}

export function dessineChamp(entree: EntreeDessinChamp): SortieDessinChamp {
  const { ctx, projecteur } = entree

  const seuilReel = K('SEUIL_MAG_ETOILES_REELLES')
  const reelles: Compteur = { dessinees: 0, visitees: 0, surfacePx: 0 }
  const generees: Compteur = { dessinees: 0, visitees: 0, surfacePx: 0 }
  const vue = sceneCourante(entree)

  // T-0119 — le plafond porte sur la SURFACE peinte, et il porte sur les DEUX couches.
  //
  // T-0118 ne plafonnait que le semis, en bornant un nombre d'étoiles lues, sur la foi d'un
  // catalogue réel « d'environ 15 000 étoiles » qui n'aurait pas coûté. Le paquet en contient
  // 25 791 sous le seuil catalographié : c'est cette couche qui peint la nappe. Et un nombre
  // d'étoiles ne borne pas la lisibilité, puisque la surface peinte croît avec la durée du filé —
  // à huit heures, 1 500 traces couvrent cinq fois le canevas.
  //
  // Le budget est un effectif de CIEL, pas de champ : il compte les traversées du canevas, donc
  // les étoiles qui passeront dessus, où qu'elles soient au premier instant. Il se dépense
  // CATALOGUE RÉEL D'ABORD — c'est le ciel reconnaissable, ce sont les traces les plus
  // brillantes, et ce qu'on écarte en premier doit être ce qu'on verrait en dernier. Le semis ne
  // reçoit que ce qui reste, c'est-à-dire rien dès que le filé est long.
  //
  // Deux plafonds, deux grandeurs. La couverture borne ce que l'image MONTRE ; elle ne borne pas
  // ce que la passe LIT, parce qu'une trace courte — filé bref, ou champ étroit où l'arc traverse
  // le canevas en quelques dizaines de pixels — peint peu et en autorise donc des dizaines de
  // milliers. Un filé de cinq minutes en demandait 268 000, pour 98 ms. Le second plafond est
  // donc un plafond de coût, sur l'effectif lui-même.
  const budget: Budget = {
    max: entree.effectifMax ?? Infinity,
    couverture:
      entree.couvertureMax === null
        ? Infinity
        : effectifCielPourCouverture({
          projecteur,
          dureeMin: vue.dureeMin,
          couvertureMax: entree.couvertureMax,
          // Largeur de l'étoile la plus faible du catalogue : c'est un PLANCHER de largeur, donc
          // le budget est légèrement généreux. L'écart est absorbé par la cible de couverture, qui
          // se règle à la mesure — une largeur moyenne exacte demanderait de connaître le plafond
          // qu'on calcule.
          largeurTraceRefPx: largeurTracePx(Math.max(RAYON_MIN_ETOILE_PX, rayonEtoilePx(seuilReel))),
        }),
  }
  const magReelle = tableMagParZ(
    entree.indexReel,
    budget,
    0,
    Math.min(entree.magLimite, seuilReel),
  )
  const attente = enAttente(rayonEtoilePx(entree.indexReel.magMin))
  dessineCouche(entree, vue, entree.indexReel, -Infinity, magReelle, reelles, attente)

  // Ce que le catalogue réel n'a pas dépensé. Le comptage du semis vient de son propre tirage :
  // il est exact, là où une loi analytique ne redonnerait le tirage qu'à sa pente près. Là où le
  // plafond retombe sous le seuil catalographié, il ne reste rien à générer que le catalogue ne
  // montre déjà : `dessineCouche` s'arrête d'elle-même.
  const magSemis = tableMagParZ(
    entree.indexSemis,
    budget,
    entree.indexReel.nombreEtoiles,
    entree.magLimite,
  )
  dessineCouche(entree, vue, entree.indexSemis, seuilReel, magSemis, generees, attente)

  // Les deux couches se peignent ensemble : les chemins sont partagés, donc l'ordre entre
  // catalogue réel et semis ne se distingue plus. Aucune des deux ne passe devant l'autre — ce
  // sont les étoiles d'un même ciel, pas deux calques.
  peintEnAttente(ctx, attente, entree.modeNuit)


  return {
    etoilesReelles: reelles.dessinees,
    etoilesGenerees: generees.dessinees,
    etoilesVisitees: reelles.visitees + generees.visitees,
    couverturePeinte:
      (reelles.surfacePx + generees.surfacePx) /
      (projecteur.vue.largeurPx * projecteur.vue.hauteurPx),
  }
}
