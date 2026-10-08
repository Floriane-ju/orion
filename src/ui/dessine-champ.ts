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
 * propre à cette passe est donc uniquement ce que la pose ajoute : les traces, et le centre
 * de rotation qu'elles décrivent.
 */

import { K } from '../registry/constants.ts'
import {
  arcEtoile,
  arcInvisible,
  arcsVisibles,
  effectifCielPourCouverture,
  longueurArcDeg,
  positionPole,
  type PositionPole,
} from '../core/file-etoiles.ts'
import {
  opaciteEtoile,
  profondeurPourZ,
  tableProfondeurParPixel,
  type EntreeProfondeur,
} from '../core/galactique.ts'
import type { IndexCiel } from '../core/index-ciel.ts'
import { magnitudePourEffectif, selectionne } from '../core/index-ciel.ts'
import { rayonChampDeg, rayonEtoilePx, type Projecteur } from '../core/projection.ts'
import { angleDeSinDeg, DEG, separationDeg, type Vec3 } from '../core/mat3.ts'
import { TEINTES, couleurTeinteOpacite, paletteScene, teinte } from './couleurs.ts'
import { DEMI_TOUR_DEG, encadre, QUART_TOUR_DEG as DROIT, S_PAR_MIN, TOUR_RAD } from '../core/unites.ts'
import { RAYON_MIN_ETOILE_PX } from './apparence-objets.ts'

const MARQUEUR_POLE_PX = 14

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
  readonly latitudeDeg: number
  /**
   * Fond de ciel de la scène. Il ne sert plus qu'à la palette du marqueur de pôle : le fond
   * lui-même appartient au planétarium depuis T-0116.
   */
  readonly sbCiel: number
  readonly vueRealiste: boolean
  readonly modeNuit: boolean
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
  readonly pole: PositionPole
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
function palierOpacite(opacite: number, niveaux: number): number {
  const plancher = K('OPACITE_TRACE_MIN')
  const relatif = (opacite - plancher) / (1 - plancher)
  return encadre(Math.round(relatif * (niveaux - 1)), 0, niveaux - 1)
}

function opaciteDuPalier(palier: number, niveaux: number): number {
  const plancher = K('OPACITE_TRACE_MIN')
  return plancher + ((1 - plancher) * palier) / (niveaux - 1)
}

/**
 * Paliers de rayon géométriques, et non linéaires : le rayon suit la magnitude en loi de
 * puissance, donc les étoiles s'entassent près du plancher. Un pas constant y gaspillerait tous
 * ses paliers sur les quelques étoiles brillantes.
 */
function palierRayon(rayon: number, en: EnAttente): number {
  const relatif =
    Math.log(rayon / RAYON_MIN_ETOILE_PX) / Math.log(en.rayonMaxPx / RAYON_MIN_ETOILE_PX)
  return encadre(Math.round(relatif * (en.niveauxRayon - 1)), 0, en.niveauxRayon - 1)
}

function rayonDuPalier(palier: number, en: EnAttente): number {
  return (
    RAYON_MIN_ETOILE_PX *
    (en.rayonMaxPx / RAYON_MIN_ETOILE_PX) ** (palier / (en.niveauxRayon - 1))
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
      opaciteDuPalier(Math.floor(i / TEINTES), en.niveauxOpacite),
      modeNuit,
    )
    ctx.fill(chemin)
  }
  ctx.lineCap = 'round'
  for (let i = 0; i < en.traces.length; i++) {
    const chemin = en.traces[i]
    if (chemin === undefined) continue
    const teintePalette = i % TEINTES
    const reste = Math.floor(i / TEINTES)
    ctx.strokeStyle = couleurTeinteOpacite(
      teintePalette,
      opaciteDuPalier(reste % en.niveauxOpacite, en.niveauxOpacite),
      modeNuit,
    )
    ctx.lineWidth = 2 * rayonDuPalier(Math.floor(reste / en.niveauxOpacite), en)
    ctx.stroke(chemin)
  }
  // Rendus à leurs valeurs par défaut, comme la passe du ciel le fait de la bande : le marqueur
  // du pôle est tracé après, et un bout de trait laissé arrondi lui arrondissait les branches.
  ctx.lineWidth = 1
  ctx.lineCap = 'butt'
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
  /** Avec suivi, l'étoile ne se déplace pas sur le capteur : ni trace, ni étalement du flux. */
  readonly dureeMin: number
}

function sceneCourante(entree: EntreeDessinChamp): Scene {
  const { projecteur } = entree
  const dureeMin = entree.suiviActif ? 0 : entree.dureeS / S_PAR_MIN
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
    profondeurParZ: tableProfondeurParPixel({
      profondeur: entree.profondeur,
      dureeS: entree.dureeS,
      echApx: entree.echApx,
      suiviActif: entree.suiviActif,
    }),
    dureeMin,
  }
}

/** Une étoile : un arc balayé pendant la durée d'accumulation, ponctuel quand elle est brève. */
function dessineCouche(
  entree: EntreeDessinChamp,
  scene: Scene,
  index: IndexCiel,
  magMin: number,
  magMax: number,
  compteur: Compteur,
  attente: EnAttente,
): void {
  const { projecteur } = entree
  const { centreJ2000, dureeMin, rayonSelectionDeg } = scene

  const stats = selectionne(index, centreJ2000, rayonSelectionDeg, magMax, (x, y, z, magV, bv) => {
    if (magV < magMin) return
    // Le cercle de déclinaison de l'étoile touche-t-il le champ ? Deux comparaisons, avant tout le
    // reste, et sur la composante polaire brute : pas d'arc sinus par étoile.
    if (z < scene.zMin || z > scene.zMax) return
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
    const opacite = opaciteEtoile(magV, profondeurPourZ(scene.profondeurParZ, z))
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

    const pOpacite = palierOpacite(opacite, attente.niveauxOpacite)

    if (arc.longueurPx <= rayon) {
      // Trace plus courte que l'étoile elle-même : elle reste un disque, et rejoint le chemin de
      // son couple (teinte, opacité) au lieu d'un ordre de tracé à elle. Les disques d'un même
      // chemin qui se recouvrent ne se cumulent plus — un remplissage par non-zéro les compte une
      // fois. C'est ce que fait la lumière : un pixel saturé ne sature pas deux fois.
      const point = arc.segments[0]![0]!
      const indice = pOpacite * TEINTES + teintePalette
      const chemin = (attente.disques[indice] ??= new Path2D())
      chemin.moveTo(point.xPx + rayon, point.yPx)
      chemin.arc(point.xPx, point.yPx, rayon, 0, TOUR_RAD)
      compteur.surfacePx += Math.PI * rayon * rayon
    } else {
      const indice =
        (palierRayon(rayon, attente) * attente.niveauxOpacite + pOpacite) * TEINTES + teintePalette
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
          compteur.surfacePx += Math.abs(portion.balayageRad) * c.rayonPx * rayon * 2
          // `moveTo` sur le départ de la portion AVANT l'arc : sans lui, `arc` relie la fin de la
          // portion précédente au début de celle-ci par une corde, et deux traces séparées par un
          // passage hors écran se retrouveraient jointes par un trait droit.
          chemin.moveTo(
            c.xPx + c.rayonPx * Math.cos(portion.debutRad),
            c.yPx + c.rayonPx * Math.sin(portion.debutRad),
          )
          chemin.arc(
            c.xPx,
            c.yPx,
            c.rayonPx,
            portion.debutRad,
            portion.debutRad + portion.balayageRad,
            portion.balayageRad < 0,
          )
        }
      } else {
        for (const segment of arc.segments) {
          segment.forEach((p, i) => {
            if (i === 0) chemin.moveTo(p.xPx, p.yPx)
            else {
              chemin.lineTo(p.xPx, p.yPx)
              const precedent = segment[i - 1]!
              compteur.surfacePx +=
                Math.hypot(p.xPx - precedent.xPx, p.yPx - precedent.yPx) * rayon * 2
            }
          })
        }
      }
    }
    compteur.dessinees++
  })
  compteur.visitees += stats.etoilesExaminees
}

export function dessineChamp(entree: EntreeDessinChamp): SortieDessinChamp {
  const { ctx, projecteur } = entree
  const teintes = paletteScene(entree.modeNuit, entree.vueRealiste, entree.sbCiel)

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
  const effectifCiel = Math.min(
    entree.effectifMax ?? Infinity,
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
          largeurTraceRefPx: 2 * Math.max(RAYON_MIN_ETOILE_PX, rayonEtoilePx(seuilReel)),
        }),
  )
  const magReelle = Math.min(
    entree.magLimite,
    seuilReel,
    magnitudePourEffectif(entree.indexReel, effectifCiel),
  )
  const attente = enAttente(rayonEtoilePx(entree.indexReel.magMin))
  dessineCouche(entree, vue, entree.indexReel, -Infinity, magReelle, reelles, attente)

  // Ce que le catalogue réel n'a pas dépensé. Le comptage du semis vient de son propre tirage :
  // il est exact, là où une loi analytique ne redonnerait le tirage qu'à sa pente près.
  const magSemis = Math.min(
    entree.magLimite,
    magnitudePourEffectif(entree.indexSemis, effectifCiel - entree.indexReel.nombreEtoiles),
  )
  // La couche est coupée quand le plafond retombe sous le seuil catalographié : il ne reste
  // alors rien à générer que le catalogue ne montre déjà.
  if (magSemis > seuilReel) {
    dessineCouche(entree, vue, entree.indexSemis, seuilReel, magSemis, generees, attente)
  }

  // Les deux couches se peignent ensemble : les chemins sont partagés, donc l'ordre entre
  // catalogue réel et semis ne se distingue plus. Aucune des deux ne passe devant l'autre — ce
  // sont les étoiles d'un même ciel, pas deux calques.
  peintEnAttente(ctx, attente, entree.modeNuit)

  // Centre de rotation : marqué s'il tombe dans le champ, jamais ramené dedans s'il n'y est pas.
  const pole = positionPole(projecteur, entree.latitudeDeg, entree.axePoleNord)
  if (pole.dansCadre && pole.xPx !== null && pole.yPx !== null) {
    ctx.strokeStyle = teintes.cadre
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pole.xPx - MARQUEUR_POLE_PX, pole.yPx)
    ctx.lineTo(pole.xPx + MARQUEUR_POLE_PX, pole.yPx)
    ctx.moveTo(pole.xPx, pole.yPx - MARQUEUR_POLE_PX)
    ctx.lineTo(pole.xPx, pole.yPx + MARQUEUR_POLE_PX)
    ctx.stroke()
  }

  return {
    etoilesReelles: reelles.dessinees,
    etoilesGenerees: generees.dessinees,
    etoilesVisitees: reelles.visitees + generees.visitees,
    couverturePeinte:
      (reelles.surfacePx + generees.surfacePx) /
      (projecteur.vue.largeurPx * projecteur.vue.hauteurPx),
    pole,
  }
}
