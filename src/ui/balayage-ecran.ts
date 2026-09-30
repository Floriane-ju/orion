/**
 * Frontière d'une région du ciel, cherchée EN ESPACE ÉCRAN — géométrie commune au sol (§4.1)
 * et au halo d'horizon (T-0098).
 *
 * Mailler la demi-sphère concernée paraît plus naturel, et c'est un piège : l'antipode de la
 * visée est dans le maillage dès qu'on regarde au-dessus de la frontière, et la projection l'y
 * envoie à l'infini. Deux sommets voisins tombent alors de part et d'autre du canevas, et la
 * corde qui les relie balaie l'image. Aucun plafond de distance ne clôt ce cas : il suffit que
 * l'antipode tombe entre deux mailles pour que le défaut réapparaisse, à certaines hauteurs de
 * visée seulement.
 *
 * Ici, la scène est balayée en colonnes verticales de quelques pixels. Sur chaque colonne, chaque
 * changement de côté est repéré par échantillonnage puis affiné par dichotomie sur
 * `Projecteur.inverse` et un prédicat de direction : la question posée est « ce pixel est-il
 * dedans ? », qui n'a ni singularité ni approximation. Une colonne peut traverser la frontière
 * plusieurs fois — sous un champ de 300°, le sol revient au bord de l'image derrière
 * l'observateur — et chaque intervalle dedans se peint.
 *
 * T-0359 — pourquoi des colonnes et non des rayons partant du centre. Un rayon qui longe une
 * crête dentelée la traverse un nombre de fois qui change d'un rayon au suivant, et relier
 * leurs traversées dessinait des bandes de ciel en travers du relief. Une crête est à peu près
 * horizontale à l'écran : une colonne la coupe franchement, et deux colonnes voisines ne sont
 * qu'à quelques pixels l'une de l'autre, là où deux rayons s'écartaient d'un degré — vingt
 * pixels au bord du canevas.
 */

import type { Projecteur } from '../core/projection.ts'
import type { TestSol } from '../core/sol.ts'

export interface FinesseBalayage {
  /** Écart entre deux colonnes, en pixels : c'est la corde du bord sur une pente. */
  readonly pasColonnePx: number
  /**
   * Pas d'échantillonnage le long d'une colonne, en pixels. Deux traversées plus proches se
   * confondent : c'est une pointe de relief plus fine que ce pas, perdue sans dommage.
   */
  readonly pasEchantillonPx: number
  /** Dichotomies par traversée : de quoi placer la frontière sous le demi-pixel. */
  readonly dichotomies: number
}

/** Finesse du bord du sol : c'est une crête soulignée d'un trait, elle se voit au pixel près. */
export const BALAYAGE_FIN: FinesseBalayage = Object.freeze({
  pasColonnePx: 4,
  pasEchantillonPx: 16,
  dichotomies: 5,
})

export interface FrontiereEcran {
  readonly largeur: number
  readonly hauteur: number
  /** Abscisse de chaque colonne ; la dernière touche le bord droit. */
  readonly colonnes: Float64Array
  /** Ordonnées des traversées de chaque colonne, croissantes. */
  readonly traversees: readonly Float64Array[]
  /** Le haut de chaque colonne est-il dans la région ? Il décide du côté du premier intervalle. */
  readonly hautDedans: Uint8Array
}

type Point = readonly [number, number]

/** Cherche les traversées de la région définie par `dedans`, colonne par colonne. */
export function frontiereEcran(
  projecteur: Projecteur,
  dedans: TestSol,
  finesse: FinesseBalayage = BALAYAGE_FIN,
): FrontiereEcran {
  const largeur = projecteur.vue.largeurPx
  const hauteur = projecteur.vue.hauteurPx
  const { pasColonnePx, pasEchantillonPx, dichotomies } = finesse
  const nbColonnes = Math.ceil(largeur / pasColonnePx) + 1
  const nbEchantillons = Math.max(1, Math.ceil(hauteur / pasEchantillonPx))

  const colonnes = new Float64Array(nbColonnes)
  const hautDedans = new Uint8Array(nbColonnes)
  const traversees: Float64Array[] = []
  for (let c = 0; c < nbColonnes; c++) {
    const x = Math.min(c * pasColonnePx, largeur)
    colonnes[c] = x
    const estDedans = (y: number): boolean => {
      const v = projecteur.inverse(x, y)
      return dedans(v.x, v.y, v.z)
    }
    const trouvees: number[] = []
    let avant = 0
    let coteAvant = estDedans(0)
    hautDedans[c] = coteAvant ? 1 : 0
    for (let pas = 1; pas <= nbEchantillons; pas++) {
      const apres = (hauteur * pas) / nbEchantillons
      const coteApres = estDedans(apres)
      if (coteApres !== coteAvant) {
        let bas = avant
        let haut = apres
        for (let d = 0; d < dichotomies; d++) {
          const milieu = (bas + haut) / 2
          if (estDedans(milieu) === coteAvant) bas = milieu
          else haut = milieu
        }
        trouvees.push((bas + haut) / 2)
      }
      avant = apres
      coteAvant = coteApres
    }
    traversees.push(Float64Array.from(trouvees))
  }

  return { largeur, hauteur, colonnes, traversees, hautDedans }
}

/** Les intervalles de la colonne `c` qui sont dans la région, de haut en bas. */
function intervalles(f: FrontiereEcran, c: number): readonly (readonly [number, number])[] {
  const resultat: [number, number][] = []
  let dedans = f.hautDedans[c] === 1
  let debut = 0
  for (const y of f.traversees[c] ?? []) {
    if (dedans) resultat.push([debut, y])
    else debut = y
    dedans = !dedans
  }
  if (dedans) resultat.push([debut, f.hauteur])
  return resultat
}

/**
 * La région en polygones, bande par bande entre deux colonnes voisines. Aux mêmes nombres
 * d'intervalles, elles se relient intervalle par intervalle — le bord suit la pente ; sinon
 * chacune peint sa moitié de bande à ses propres ordonnées — la frontière y change de
 * topologie, sur un pas de colonne.
 *
 * Les bandes ne se recouvrent pas, elles se touchent par leurs bords : peintes d'un seul
 * `fill`, elles ne laissent aucune couture.
 */
export function polygonesRegion(f: FrontiereEcran): Point[][] {
  const polygones: Point[][] = []
  for (let c = 0; c + 1 < f.colonnes.length; c++) {
    const xa = f.colonnes[c]!
    const xb = f.colonnes[c + 1]!
    const a = intervalles(f, c)
    const b = intervalles(f, c + 1)
    if (a.length === b.length) {
      a.forEach(([hautA, basA], k) => {
        const [hautB, basB] = b[k]!
        polygones.push([[xa, hautA], [xb, hautB], [xb, basB], [xa, basA]])
      })
      continue
    }
    const xm = (xa + xb) / 2
    for (const [haut, bas] of a) polygones.push([[xa, haut], [xm, haut], [xm, bas], [xa, bas]])
    for (const [haut, bas] of b) polygones.push([[xm, haut], [xb, haut], [xb, bas], [xm, bas]])
  }
  return polygones
}

/** Peint la région, opaque. */
export function remplitRegion(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  f: FrontiereEcran,
  couleur: string,
): void {
  ctx.fillStyle = couleur
  ctx.beginPath()
  for (const polygone of polygonesRegion(f)) {
    const [premier, ...suite] = polygone
    if (premier === undefined) continue
    ctx.moveTo(premier[0], premier[1])
    for (const [x, y] of suite) ctx.lineTo(x, y)
    ctx.closePath()
  }
  ctx.fill('evenodd')
}

/**
 * Souligne la frontière du remplissage. Le trait relie les traversées de même rang de deux
 * colonnes voisines : il ne peut pas se décoller de ce qu'il souligne. Là où le nombre de
 * traversées change, il s'interrompt sur un pas de colonne plutôt que de relier deux bords
 * étrangers.
 */
export function traceFrontiere(
  ctx: CanvasRenderingContext2D,
  f: FrontiereEcran,
  couleur: string,
): void {
  ctx.strokeStyle = couleur
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let c = 0; c + 1 < f.colonnes.length; c++) {
    const a = f.traversees[c]!
    const b = f.traversees[c + 1]!
    if (a.length !== b.length) continue
    a.forEach((y, k) => {
      ctx.moveTo(f.colonnes[c]!, y)
      ctx.lineTo(f.colonnes[c + 1]!, b[k]!)
    })
  }
  ctx.stroke()
}
