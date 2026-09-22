/**
 * §3.3 — Indexation spatiale du catalogue.
 *
 * « Découpage HEALPix ou quadtree équatorial ; seules les cellules intersectant le champ
 * sont soumises au GPU. Coût de sélection indépendant du zoom. »
 *
 * Deux propriétés portent à elles seules le critère de §3.1 — « ajouter des étoiles ne
 * dégrade pas mesurablement la fréquence » :
 *
 *   1. les cellules hors du champ ne sont jamais parcourues ;
 *   2. à l'intérieur d'une cellule, les étoiles sont rangées par magnitude croissante et le
 *      parcours s'arrête à la première étoile plus faible que la limite du zoom. Un
 *      catalogue enrichi d'étoiles faibles s'insère APRÈS le point d'arrêt : le nombre
 *      d'étoiles examinées par image ne change pas.
 *
 * Les directions unitaires sont calculées une fois à la construction. Par image, il ne
 * reste qu'un produit matriciel par étoile retenue.
 */

import { K } from '../registry/constants.ts'
import type { Etoile } from '../data/catalog.ts'
import { DEG, versVecteur, type Vec3 } from './mat3.ts'
import { dUnBloc, pointDeCoupe, type Decoupable } from './tranches.ts'

export interface CelluleCiel {
  readonly centre: Vec3
  /** Rayon englobant exact de la cellule, en degrés. */
  readonly rayonDeg: number
  readonly x: Float32Array
  readonly y: Float32Array
  readonly z: Float32Array
  readonly mag: Float32Array
  readonly bv: Float32Array
  /** Indice de l'étoile dans le catalogue source, pour l'identification au clic. */
  readonly source: Int32Array
}

export interface IndexCiel {
  readonly cellules: readonly CelluleCiel[]
  readonly nombreEtoiles: number
  /** Magnitude la plus faible présente : c'est la profondeur réelle du paquet chargé. */
  readonly profondeurMag: number
  /**
   * Comptage cumulé par pas de magnitude : `cumulMag[i]` = nombre d'étoiles de l'index dont la
   * magnitude ne dépasse pas `magMin + i * PAS_COMPTAGE_CUMULE_MAG`.
   *
   * T-0119 — c'est ce qui permet de convertir un budget de traces en plafond de magnitude. La loi
   * de comptage du semis (§9.2, `SEMIS_ETOILES_TOTAL` à `SEMIS_MAG_MAX`) ne peut pas servir ici :
   * prolongée vers les étoiles brillantes elle donne quelques centaines d'étoiles au seuil
   * catalographié, là où le paquet réel en compte des dizaines de milliers. Elle décrit le semis,
   * pas le catalogue. Le comptage exact ne peut donc venir que du catalogue lui-même.
   */
  readonly cumulMag: Float32Array
  /** Magnitude la plus brillante présente : origine du comptage cumulé, lue dans les données. */
  readonly magMin: number
}

interface Accumulateur {
  readonly indices: number[]
}

function rayonEnglobant(centre: Vec3, adMinDeg: number, adMaxDeg: number, decMinDeg: number, decMaxDeg: number): number {
  const adMid = (adMinDeg + adMaxDeg) / 2
  const decMid = (decMinDeg + decMaxDeg) / 2
  const bords: Vec3[] = [
    versVecteur(adMinDeg, decMinDeg),
    versVecteur(adMinDeg, decMaxDeg),
    versVecteur(adMaxDeg, decMinDeg),
    versVecteur(adMaxDeg, decMaxDeg),
    versVecteur(adMid, decMinDeg),
    versVecteur(adMid, decMaxDeg),
    versVecteur(adMinDeg, decMid),
    versVecteur(adMaxDeg, decMid),
  ]
  let maxCos = 1
  for (const b of bords) {
    const cos = centre.x * b.x + centre.y * b.y + centre.z * b.z
    if (cos < maxCos) maxCos = cos
  }
  return Math.acos(Math.max(-1, Math.min(1, maxCos))) / DEG
}

/**
 * Construit l'index. Le découpage est un quadtree équatorial à un niveau : des bandes de
 * déclinaison de côté constant, chacune découpée en ascension droite pour que les cellules
 * gardent une largeur angulaire comparable jusqu'aux pôles.
 */
export function construitIndex(etoiles: readonly Etoile[]): IndexCiel {
  return dUnBloc(construitIndexPas(etoiles))
}

/**
 * L'index d'un ciel sans étoile : ce que la scène dessine tant que le catalogue n'est pas
 * décodé. `magnitudePourEffectif` y rend `+Infinity`, comme sur tout index dont l'effectif
 * demandé dépasse le contenu — il n'y a rien à plafonner.
 */
export const INDEX_VIDE: IndexCiel = Object.freeze(construitIndex([]))

/**
 * T-0296 — la même construction, ses points de coupe nommés. C'est l'étage le plus cher du
 * démarrage : quatre-vingt mille étoiles rangées, triées par cellule et projetées en
 * directions unitaires, soit cent cinquante millisecondes de fil principal sur une tablette.
 *
 * Les coupes sont aux trois balayages qui pèsent : le rangement en paniers, le remplissage
 * cellule par cellule — c'est lui qui porte les tris et la trigonométrie — et le comptage
 * cumulé. Voir `core/tranches.ts` pour qui décide d'en profiter.
 */
export function* construitIndexPas(etoiles: readonly Etoile[]): Decoupable<IndexCiel> {
  const taille = K('CELLULE_INDEX_DEG')
  const bandes = Math.max(1, Math.round(180 / taille))
  const hauteurBande = 180 / bandes

  // Découpage : pour chaque bande, le nombre de cellules en ascension droite.
  const colonnes: number[] = []
  for (let b = 0; b < bandes; b++) {
    const decMin = -90 + b * hauteurBande
    const decMax = decMin + hauteurBande
    const cosMax = Math.max(Math.cos(decMin * DEG), Math.cos(decMax * DEG))
    colonnes.push(Math.max(1, Math.round((360 * cosMax) / taille)))
  }

  const decalages: number[] = []
  let total = 0
  for (const n of colonnes) {
    decalages.push(total)
    total += n
  }

  const paniers: Accumulateur[] = Array.from({ length: total }, () => ({ indices: [] }))
  let profondeur = -Infinity

  for (let i = 0; i < etoiles.length; i++) {
    if (pointDeCoupe(i)) yield
    const e = etoiles[i]!
    if (e.magV > profondeur) profondeur = e.magV
    const b = Math.min(bandes - 1, Math.max(0, Math.floor((e.decDeg + 90) / hauteurBande)))
    const n = colonnes[b]!
    const ad = ((e.adDeg % 360) + 360) % 360
    const c = Math.min(n - 1, Math.floor((ad / 360) * n))
    paniers[decalages[b]! + c]!.indices.push(i)
  }

  const cellules: CelluleCiel[] = []
  for (let b = 0; b < bandes; b++) {
    const decMin = -90 + b * hauteurBande
    const decMax = decMin + hauteurBande
    const n = colonnes[b]!
    const largeur = 360 / n
    for (let c = 0; c < n; c++) {
      const panier = paniers[decalages[b]! + c]!
      if (panier.indices.length === 0) continue
      yield
      // Rangement par magnitude croissante : c'est lui qui rend le parcours interruptible.
      panier.indices.sort((a, z) => etoiles[a]!.magV - etoiles[z]!.magV)

      const adMin = c * largeur
      const adMax = adMin + largeur
      const centre = versVecteur((adMin + adMax) / 2, (decMin + decMax) / 2)
      const taillePanier = panier.indices.length
      const cellule: CelluleCiel = {
        centre,
        rayonDeg: rayonEnglobant(centre, adMin, adMax, decMin, decMax),
        x: new Float32Array(taillePanier),
        y: new Float32Array(taillePanier),
        z: new Float32Array(taillePanier),
        mag: new Float32Array(taillePanier),
        bv: new Float32Array(taillePanier),
        source: new Int32Array(taillePanier),
      }
      for (let j = 0; j < taillePanier; j++) {
        const indice = panier.indices[j]!
        const e = etoiles[indice]!
        const v = versVecteur(e.adDeg, e.decDeg)
        cellule.x[j] = v.x
        cellule.y[j] = v.y
        cellule.z[j] = v.z
        cellule.mag[j] = e.magV
        cellule.bv[j] = e.bv
        cellule.source[j] = indice
      }
      cellules.push(cellule)
    }
  }

  let magMin = Infinity
  for (let i = 0; i < etoiles.length; i++) {
    if (pointDeCoupe(i)) yield
    const magV = etoiles[i]!.magV
    if (magV < magMin) magMin = magV
  }

  return {
    cellules,
    nombreEtoiles: etoiles.length,
    profondeurMag: Number.isFinite(profondeur) ? profondeur : 0,
    cumulMag: yield* construitCumulMag(
      etoiles,
      magMin,
      Number.isFinite(profondeur) ? profondeur : 0,
    ),
    magMin: Number.isFinite(magMin) ? magMin : 0,
  }
}

/**
 * Comptage cumulé des magnitudes, construit une fois avec l'index : par image, l'inversion n'est
 * plus qu'une lecture. Quelques centaines d'octets pour un catalogue de dizaines de milliers
 * d'étoiles — le tableau est indexé par magnitude, pas par étoile.
 */
function* construitCumulMag(
  etoiles: readonly Etoile[],
  magMin: number,
  profondeurMag: number,
): Decoupable<Float32Array> {
  const pas = K('PAS_COMPTAGE_CUMULE_MAG')
  const cases = Math.max(1, Math.ceil((profondeurMag - magMin) / pas) + 1)
  const cumul = new Float32Array(cases)
  for (let j = 0; j < etoiles.length; j++) {
    if (pointDeCoupe(j)) yield
    const i = Math.ceil((etoiles[j]!.magV - magMin) / pas)
    cumul[Math.min(cases - 1, Math.max(0, i))]! += 1
  }
  for (let i = 1; i < cases; i++) cumul[i]! += cumul[i - 1]!
  return cumul
}

/**
 * T-0119 — magnitude la plus faible telle que l'index ne contienne pas plus de `effectif` étoiles
 * sur toute la sphère. `+Infinity` quand l'effectif demandé dépasse ce que l'index porte : il n'y
 * a alors rien à plafonner, et l'appelant ne doit pas confondre « tout le catalogue » avec « le
 * catalogue coupé à sa dernière magnitude ».
 *
 * Le seuil rendu est celui de la case atteinte, jamais interpolé au-delà : rendre une magnitude
 * plus profonde que la case laisserait passer plus d'étoiles que le budget.
 */
export function magnitudePourEffectif(index: IndexCiel, effectif: number): number {
  const cumul = index.cumulMag
  if (effectif >= index.nombreEtoiles) return Infinity
  if (effectif < 1) return -Infinity
  const pas = K('PAS_COMPTAGE_CUMULE_MAG')
  for (let i = 0; i < cumul.length; i++) {
    if (cumul[i]! > effectif) return index.magMin + (i - 1) * pas
  }
  return Infinity
}

export interface StatistiquesSelection {
  readonly cellulesRetenues: number
  /** Étoiles réellement lues. C'est ce compteur qui doit rester stable (§3.1). */
  readonly etoilesExaminees: number
}

export type VisiteEtoile = (
  x: number,
  y: number,
  z: number,
  magV: number,
  bv: number,
  source: number,
) => void

/**
 * Parcourt les étoiles du champ, de la plus brillante à la plus faible, et s'arrête dès que
 * la magnitude limite est franchie.
 */
export function selectionne(
  index: IndexCiel,
  centreJ2000: Vec3,
  rayonChampDeg: number,
  magLimite: number,
  visite: VisiteEtoile,
): StatistiquesSelection {
  let cellulesRetenues = 0
  let etoilesExaminees = 0

  for (const cellule of index.cellules) {
    const cos = Math.max(
      -1,
      Math.min(
        1,
        centreJ2000.x * cellule.centre.x +
          centreJ2000.y * cellule.centre.y +
          centreJ2000.z * cellule.centre.z,
      ),
    )
    const separation = Math.acos(cos) / DEG
    if (separation > rayonChampDeg + cellule.rayonDeg) continue

    cellulesRetenues++
    const mags = cellule.mag
    for (let j = 0; j < mags.length; j++) {
      if (mags[j]! > magLimite) break
      etoilesExaminees++
      visite(cellule.x[j]!, cellule.y[j]!, cellule.z[j]!, mags[j]!, cellule.bv[j]!, cellule.source[j]!)
    }
  }
  return { cellulesRetenues, etoilesExaminees }
}
