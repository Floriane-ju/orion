/**
 * §3.7 — la couche Voie lactée du planétarium : le plan galactique, la bande de brillance et
 * le repère du centre galactique.
 *
 * T-0193 — sortie de `dessine-ciel.ts` sans une ligne de changement. Le sujet se tient tout
 * seul : une géométrie J2000 fixe, calculée une fois au chargement, dont seule la projection
 * dépend de l'instant. C'est ici que T-0106 viendra creuser la Grande Faille, et il n'aura pas
 * à traverser la passe des étoiles pour le faire.
 *
 * Ce que la bande n'est PAS : un polygone rempli. Une polyligne dont une partie sort du champ
 * se rompt en segments, et un polygone rompu se referme n'importe où — le trait épais, lui, ne
 * peint que ce qui reste.
 */

import { applique, DEG, versSpherique, type Vec3 } from '../core/mat3.ts'
import { depuisGalactique } from '../core/galactique.ts'
import { nanolamberts } from '../core/moon.ts'
import { brillanceVoieLacteeNl } from '../core/fond-ciel-rendu.ts'
import { pointEcran, type PointEcranMut, type Projecteur } from '../core/projection.ts'
import { bandeRealiste, fondRealiste } from './couleurs.ts'
import { champVisible, horsDuChamp } from './champ-visible.ts'
import { peintLisse } from './lissage.ts'
import type { CandidatLabel } from '../core/labels.ts'
import { altitudeCulmination } from '../core/site.ts'
import { K } from '../registry/constants.ts'
import { HAUTEUR_LABEL_PX, LARGEUR_CARACTERE_PX, RAYON_CORPS_PX } from './libelles-cibles.ts'
import type { EntreeDessin } from './dessine-ciel.ts'

/* Niveaux d'opacité distincts que le canevas sait composer : sa couche alpha tient sur un
   octet. Deux tracés dont les opacités tombent dans le même niveau peignent le même pixel —
   c'est ce qui autorise à les réunir. Fait de plateforme, pas seuil de rendu. */
const NIVEAUX_ALPHA = 2 ** 8 - 1

export const NOM_VOIE_LACTEE = 'Voie lactée'

const PAS_LONGITUDE_GALACTIQUE_DEG = 3
/** Du plan galactique au pôle : seule borne de l'échantillonnage en latitude. */
const QUART_TOUR_DEG = 90
/**
 * T-0103 — pas des tranches de la bande. À 2°, la marche de couleur entre deux tranches
 * voisines vaut 1/255 sur toute la table Bortle : elle est SOUS la quantification de l'écran,
 * donc invisible sans le moindre flou. C'était vrai à l'exposition d'origine ; triplée (C-38),
 * la marche se voit, et la bande passe par le lissage de `lissage.ts` (T-0352).
 */
const PAS_LATITUDE_BANDE_DEG = 2

/**
 * T-0033 — le plan galactique `b = 0`, échantillonné en longitude comme l'horizon l'est en
 * azimut. Il est fixe en J2000 : la polyligne se calcule une fois au chargement du module,
 * jamais par image. Seule sa projection dépend de l'instant et du zoom.
 */
export const PLAN_GALACTIQUE: readonly Vec3[] = Array.from(
  { length: 360 / PAS_LONGITUDE_GALACTIQUE_DEG + 1 },
  (_, i) => depuisGalactique(i * PAS_LONGITUDE_GALACTIQUE_DEG, 0),
)

/**
 * T-0105 — longueur d'un segment de brillance, en longitude galactique.
 *
 * Même critère que le pas en latitude, et la même mesure : à 12°, la marche de couleur entre
 * deux segments voisins vaut au plus 1/255 sur toute la table Bortle — sous la quantification
 * de l'écran, donc invisible sans flou. À 18° elle passe à 2/255 depuis que l'exposition a
 * triplé (C-38) et se verrait. C'est `tests/voie-lactee.test.ts` qui tient ce chiffre.
 *
 * Le pas est un multiple de l'échantillonnage géométrique : un segment reste une polyligne de
 * quatre cordes, pas une corde unique.
 */
const PAS_LONGITUDE_BANDE_DEG = 12
const SEGMENTS_PAR_TRANCHE = 360 / PAS_LONGITUDE_BANDE_DEG

/**
 * T-0091, T-0103, T-0105 — la bande, en tranches de latitude, chacune coupée en segments de
 * longitude.
 *
 * Une tranche = une bande à latitude constante, tracée au trait épais de la largeur de la
 * tranche. Le trait, et pas le polygone rempli : une polyligne dont une partie sort du champ se
 * rompt en segments, et un polygone rompu se referme n'importe où. Le trait, lui, ne peint que
 * ce qui reste — la bande se coupe proprement au bord du champ.
 *
 * T-0105 découpe chaque tranche en longitude, parce que la brillance n'y est plus constante :
 * le bulbe du Sagittaire est une demi-magnitude au-dessus de l'anticentre. Un segment porte une
 * couleur, comme une tranche porte la sienne.
 *
 * Les raccords entre segments sont DÉCALÉS d'une tranche à l'autre. Deux segments voisins se
 * touchent bout à bout (`lineCap = 'butt'`) : sur le côté convexe du virage, l'angle entre les
 * deux bouts laisse une encoche de quelques pixels au bord de la tranche. Alignées d'une tranche
 * sur l'autre, ces encoches se liraient comme un trait sombre en travers de la bande ; décalées,
 * ce sont des accidents isolés sous le seuil de l'œil. Le décalage ne coûte rien : il est cuit
 * dans les polylignes au chargement.
 *
 * L'échelle va d'un pôle galactique à l'autre : c'est la seule borne géométrique, et elle
 * remplace la latitude de coupure qu'il fallait auparavant choisir. Ce qui décide de ce qui
 * est peint est la brillance du segment, évaluée par image — pas une étendue figée ici.
 *
 * Fixe en J2000 : les polylignes se calculent au chargement du module.
 */
interface SegmentBande {
  /** Longitude du milieu du segment : c'est elle qui porte sa brillance. */
  readonly lDeg: number
  readonly ligne: readonly Vec3[]
  /** Milieu du segment, et rayon de la calotte qui le contient : ils servent à l'écarter. */
  readonly centre: Vec3
  readonly demiExtensionDeg: number
}

const TRANCHES_BANDE: readonly {
  readonly bDeg: number
  readonly segments: readonly SegmentBande[]
}[] = Array.from({ length: (2 * QUART_TOUR_DEG) / PAS_LATITUDE_BANDE_DEG }, (_, i) => {
  // Centre de la tranche : c'est lui qui porte sa brillance, comme `hauteurRepresentative`
  // le fait pour un palier de halo.
  const bDeg = -QUART_TOUR_DEG + (i + 0.5) * PAS_LATITUDE_BANDE_DEG
  const decalageDeg = (i % 2) * (PAS_LONGITUDE_BANDE_DEG / 2)
  const pointsParSegment = PAS_LONGITUDE_BANDE_DEG / PAS_LONGITUDE_GALACTIQUE_DEG + 1
  return Object.freeze({
    bDeg,
    segments: Object.freeze(
      Array.from({ length: SEGMENTS_PAR_TRANCHE }, (_unused, k) => {
        const departDeg = decalageDeg + k * PAS_LONGITUDE_BANDE_DEG
        const lDeg = departDeg + PAS_LONGITUDE_BANDE_DEG / 2
        // Un segment couvre PAS_LONGITUDE de longitude — soit un arc rétréci par cos(b), les
        // méridiens se resserrant vers les pôles — et l'épaisseur d'une tranche en latitude.
        const demiLongueurDeg = (PAS_LONGITUDE_BANDE_DEG / 2) * Math.cos(bDeg * DEG)
        return Object.freeze({
          lDeg,
          centre: depuisGalactique(lDeg, bDeg),
          demiExtensionDeg: Math.hypot(demiLongueurDeg, PAS_LATITUDE_BANDE_DEG / 2),
          // Le dernier point d'un segment est le premier du suivant : les deux traits se
          // rejoignent sur le même sommet, sans recouvrement — un recouvrement se composerait
          // deux fois et laisserait une tache claire.
          ligne: Object.freeze(
            Array.from({ length: pointsParSegment }, (_p, j) =>
              depuisGalactique(departDeg + j * PAS_LONGITUDE_GALACTIQUE_DEG, bDeg),
            ),
          ),
        })
      }),
    ),
  })
})

/** T-0091 — le centre galactique : l = 0°, b = 0°, soit δ ≈ −29°. Calculé, jamais recopié. */
const CENTRE_GALACTIQUE: Vec3 = depuisGalactique(0, 0)
const NOM_CENTRE_GALACTIQUE = 'Centre galactique'

/**
 * T-0034 — ancre du label : le point de la ligne visible le plus proche du centre du canevas,
 * pour que le nom se pose sur la bande et non collé à un bord. `null` si la ligne ne traverse
 * pas le champ affiché — le label est alors absent, pas déporté.
 */
export function ancreVoieLactee(
  projecteur: Projecteur,
  largeur: number,
  hauteur: number,
): { xPx: number; yPx: number } | null {
  const p = pointEcran()
  let meilleurX = 0
  let meilleurY = 0
  let meilleureDistance = Infinity
  for (const point of PLAN_GALACTIQUE) {
    if (!projecteur.projetteEn(point.x, point.y, point.z, p)) continue
    if (p.xPx < 0 || p.yPx < 0 || p.xPx > largeur || p.yPx > hauteur) continue
    // T-0258 — l'ancre se rapproche du centre de VISÉE : posée au milieu du canevas, l'étiquette
    // se serait rangée sous le panneau de séance, illisible là où elle nomme la bande.
    const distance = Math.hypot(p.xPx - projecteur.centreXPx, p.yPx - projecteur.centreYPx)
    if (distance < meilleureDistance) {
      meilleureDistance = distance
      meilleurX = p.xPx
      meilleurY = p.yPx
    }
  }
  // L'ancre survit à la boucle : c'est le seul point de cette passe qui se copie.
  return meilleureDistance === Infinity ? null : { xPx: meilleurX, yPx: meilleurY }
}

/**
 * §3.7 — la bande de la Voie lactée, telle qu'elle se verra DEPUIS CE SITE (T-0103).
 *
 * La bande est un CONTRIBUTEUR DE BRILLANCE, pas un calque teinté. Chaque tranche se compose
 * comme le halo lunaire de T-0100 : sa part de la brillance totale sert d'opacité, et la
 * couleur de cette totale sert de teinte. Les deux sont couplées, et c'est ce couplage qui
 * fait le rendu juste — là où la bande domine, la couleur peinte est exactement celle du
 * modèle ; là où elle s'efface, sa part multiplie une couleur devenue indiscernable du fond,
 * donc ne se voit pas.
 *
 * Rien n'est seuillé. La bande s'atténue vers les pôles galactiques et disparaît quand le site
 * est pollué parce que la physique le dit, pas parce qu'une opacité de convention et une
 * latitude de coupure ont été choisies — c'étaient les deux constantes qui donnaient à cette
 * couche ses stries à bord franc en travers du ciel.
 *
 * L'épaisseur du trait suit le zoom : une tranche de latitude couvre le même angle, donc
 * d'autant plus de pixels que le champ est serré. L'échelle est prise au centre du champ —
 * la projection l'étire vers les bords, et un repère de lecture n'en souffre pas.
 *
 * ponytail: l'écart peint est calculé contre le fond du zénith et ajouté en `lighter`, donc
 * en sRGB encodé et pas en lumière linéaire. Sur un fond relevé par les halos (Lune, horizon),
 * la bande ressort un peu trop — jamais plus sombre que le fond, ce qui était le défaut. Le
 * jour où il faudra la composer juste par direction, c'est un champ 2D à peindre.
 */
interface TeinteBande {
  /** Ce que la bande ajoute au fond, peint à l'opacité `part`. */
  readonly couleur: string
  readonly part: number
  /** Le même ajout, déjà multiplié par `part` : peint opaque sur le canevas réduit. */
  readonly premultipliee: string
  readonly segments: SegmentBande[]
}

/**
 * Les 2 700 segments de la bande, regroupés par teinte peinte.
 *
 * Un `stroke()` par segment, c'était 2 700 traits larges et translucides étalés sur le canevas
 * à chaque image — le coût explose au dézoom, où tous tombent dans le champ. La teinte d'un
 * segment ne dépend QUE de sa position galactique et du fond de ciel du site : elle ne bouge
 * ni au zoom, ni au défilement. Le regroupement se calcule donc une fois par fond de ciel,
 * et l'image n'a plus qu'un tracé par teinte distincte.
 *
 * L'opacité est quantifiée au 255e, précision de la composition du canevas : deux segments
 * rangés ensemble s'y peignaient déjà à l'identique.
 */
function teintesBande(sbCiel: number, modeNuit: boolean): readonly TeinteBande[] {
  const brillanceCiel = nanolamberts(sbCiel)
  // Couleur du fond seul : la tranche qui la reproduit n'ajoute rien de visible, à un
  // 255e près. C'est la borne de peinture, et elle se déduit — elle ne se règle pas.
  const fondSeul = fondRealiste(sbCiel)
  const groupes = new Map<string, TeinteBande>()
  for (const tranche of TRANCHES_BANDE) {
    for (const segment of tranche.segments) {
      const rendu = bandeRealiste(
        brillanceCiel,
        brillanceVoieLacteeNl(segment.lDeg, tranche.bDeg) * K('GAIN_RENDU_VOIE_LACTEE'),
        modeNuit,
      )
      // Peint sous le demi-niveau d'octet : la tranche recouvre le fond par sa propre
      // couleur. Deux façons de ne rien changer — une couleur égale à celle du fond, ou une
      // opacité qui ramène l'écart sous ce que l'écran sait distinguer.
      if (rendu.couleur === fondSeul || Math.round(rendu.deltaPeintOctets) === 0) continue
      const part = Math.round(rendu.part * NIVEAUX_ALPHA) / NIVEAUX_ALPHA
      const [r, v, b] = rendu.ajoutOctets
      const couleur = `rgb(${r} ${v} ${b})`
      const cle = `${couleur}|${part}`
      const groupe = groupes.get(cle) ?? {
        couleur,
        part,
        premultipliee: `rgb(${Math.round(r * part)} ${Math.round(v * part)} ${Math.round(b * part)})`,
        segments: [],
      }
      groupe.segments.push(segment)
      groupes.set(cle, groupe)
    }
  }
  return [...groupes.values()]
}

/** Une seule entrée : le fond de ciel change à la main, jamais d'une image à l'autre. */
let bandeMemo: { readonly cle: string; readonly teintes: readonly TeinteBande[] } | null = null

/**
 * Trace les teintes de la bande sur `cible`, en coordonnées écran. Une seule boucle sur les
 * 2 700 segments, exécutée à chaque image.
 */
function traceTeintes(
  cible: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  projecteur: Projecteur,
  teintes: readonly TeinteBande[],
  lisse: boolean,
): void {
  // Même écart que pour les cellules d'étoiles (§3.3) : un produit scalaire par segment plutôt
  // que sept projections. Au dézoom, la moitié des segments est derrière l'observateur et ne
  // se rejetait qu'après avoir été projetée point par point.
  const champ = champVisible(projecteur)
  const p = pointEcran()
  for (const teinte of teintes) {
    // T-0110 — le chemin se construit AVANT que la teinte ne soit posée : une teinte dont
    // aucun segment n'atteint le champ ne doit rien coûter au pilote graphique.
    let tracé = false
    for (const segment of teinte.segments) {
      if (horsDuChamp(champ, segment.centre, segment.demiExtensionDeg)) continue
      let enchaine = false
      for (const point of segment.ligne) {
        if (!projecteur.projetteEn(point.x, point.y, point.z, p)) {
          enchaine = false
          continue
        }
        if (!tracé) {
          cible.beginPath()
          tracé = true
        }
        if (enchaine) cible.lineTo(p.xPx, p.yPx)
        else cible.moveTo(p.xPx, p.yPx)
        enchaine = true
      }
    }
    if (!tracé) continue
    cible.globalAlpha = lisse ? 1 : teinte.part
    cible.strokeStyle = lisse ? teinte.premultipliee : teinte.couleur
    cible.stroke()
  }
}

/**
 * T-0352 — la bande se peint en dégradé : ses tranches passent par le canevas réduit de
 * `peintLisse`, à un pixel par tranche, et s'agrandissent lissées.
 *
 * Sur ce canevas, chaque tranche est OPAQUE, dans sa couleur déjà multipliée par sa part, et
 * deux fois plus épaisse que son pas. L'épaisseur est mesurée au centre de l'écran, et la
 * projection étire le ciel vers les bords : à l'épaisseur exacte, des interstices vides
 * s'ouvraient entre tranches, et le lissage les moyennait avec la bande — elle perdait de son
 * intensité. Doublées, les tranches se recouvrent au lieu de s'écarter, et, opaques, elles se
 * remplacent au lieu de s'additionner : le recouvrement ne compte qu'une fois. Recopiée en
 * `lighter`, chaque pixel ajoute au fond exactement `part × ajout`.
 *
 * ponytail: le double de l'épaisseur couvre l'étirement jusqu'à un facteur 2, celui de la
 * stéréographique à 90° du centre ; au-delà, des interstices reviendraient au bord du champ.
 *
 * Sans `OffscreenCanvas`, les tranches se peignent directement en `lighter`, à leur part.
 */
export function traceBandeVoieLactee(entree: EntreeDessin): void {
  const { ctx, projecteur } = entree
  const cle = `${entree.sbCiel}|${entree.modeNuit}`
  if (bandeMemo === null || bandeMemo.cle !== cle) {
    bandeMemo = { cle, teintes: teintesBande(entree.sbCiel, entree.modeNuit) }
  }
  const { teintes } = bandeMemo
  const { largeurPx, hauteurPx, fovDeg } = projecteur.vue
  const tranchePx = (PAS_LATITUDE_BANDE_DEG * largeurPx) / fovDeg
  const lissee = peintLisse(ctx, largeurPx, hauteurPx, tranchePx, 'lighter', (reduite) => {
    reduite.lineJoin = 'round'
    reduite.lineCap = 'butt'
    reduite.lineWidth = 2 * tranchePx
    traceTeintes(reduite, projecteur, teintes, true)
  })
  if (lissee) return

  const opaciteInitiale = ctx.globalAlpha
  const compositionInitiale = ctx.globalCompositeOperation
  // La bande s'AJOUTE au fond : peinte par-dessus, elle assombrirait tout ciel plus clair que
  // le zénith — halo lunaire, halo d'horizon.
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineJoin = 'round'
  // Bout franc, et pas arrondi : deux segments de longitude voisins partagent leur sommet, et
  // un bout arrondi les ferait se recouvrir d'un demi-trait — un recouvrement translucide se
  // compose deux fois, donc se voit comme une perle claire à chaque raccord.
  ctx.lineCap = 'butt'
  ctx.lineWidth = tranchePx
  traceTeintes(ctx, projecteur, teintes, false)
  ctx.globalAlpha = opaciteInitiale
  ctx.globalCompositeOperation = compositionInitiale
  // Rendus à leurs valeurs par défaut : les repères tracés ensuite partagent ce contexte,
  // et un trait épais laissé arrondi arrondirait aussi les frontières et l'horizon.
  ctx.lineWidth = 1
  ctx.lineJoin = 'miter'
}

/**
 * §3.7 — le repère du centre galactique et son verdict site-dépendant.
 *
 * La hauteur COURANTE dit où le chercher maintenant ; la hauteur de CULMINATION dit si le
 * chercher a un sens depuis ce site. Les deux sont nécessaires : §8.2 a déjà calculé que le
 * centre galactique culmine à 14,6° depuis le site de référence, et ce chiffre vit dans un
 * tableau que personne n'ouvre. Sous le seuil d'imagerie, le repère porte donc la cause ET
 * la latitude qui rendrait la cible atteignable.
 *
 * Le tout dans UN label : c'est le repère qui porte la conséquence, et il s'arbitre au
 * budget de §3.4 d'un seul bloc, sans passe-droit.
 */
export function repereCentreGalactique(
  entree: EntreeDessin,
  couleur: string,
  p: PointEcranMut,
): CandidatLabel | null {
  const { ctx, projecteur } = entree
  if (!projecteur.projetteEn(CENTRE_GALACTIQUE.x, CENTRE_GALACTIQUE.y, CENTRE_GALACTIQUE.z, p)) {
    return null
  }
  const largeur = projecteur.vue.largeurPx
  const hauteur = projecteur.vue.hauteurPx
  if (p.xPx < 0 || p.yPx < 0 || p.xPx > largeur || p.yPx > hauteur) return null

  ctx.strokeStyle = couleur
  ctx.beginPath()
  ctx.moveTo(p.xPx + RAYON_CORPS_PX, p.yPx)
  ctx.arc(p.xPx, p.yPx, RAYON_CORPS_PX, 0, 2 * Math.PI)
  ctx.moveTo(p.xPx - RAYON_CORPS_PX * 2, p.yPx)
  ctx.lineTo(p.xPx + RAYON_CORPS_PX * 2, p.yPx)
  ctx.moveTo(p.xPx, p.yPx - RAYON_CORPS_PX * 2)
  ctx.lineTo(p.xPx, p.yPx + RAYON_CORPS_PX * 2)
  ctx.stroke()

  const hauteurCouranteDeg = versSpherique(applique(entree.matriceCiel, CENTRE_GALACTIQUE))
    .latitudeDeg
  const decDeg = versSpherique(CENTRE_GALACTIQUE).latitudeDeg
  const culmination = altitudeCulmination(entree.latitudeDeg, decDeg).value
  const seuil = K('SEUIL_HAUTEUR_IMAGERIE_DEG')
  const texte =
    culmination <= seuil
      ? `${NOM_CENTRE_GALACTIQUE} ${hauteurCouranteDeg.toFixed(0)}° — trop bas pour la photo d’ici`
      : `${NOM_CENTRE_GALACTIQUE} ${hauteurCouranteDeg.toFixed(0)}°`
  return {
    texte,
    categorie: 'CONSTELLATION',
    xPx: p.xPx + RAYON_CORPS_PX * 2 + HAUTEUR_LABEL_PX / 2,
    yPx: p.yPx,
    priorite: 0,
    largeurPx: texte.length * LARGEUR_CARACTERE_PX,
    hauteurPx: HAUTEUR_LABEL_PX,
    couleur,
  }
}
