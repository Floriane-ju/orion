/**
 * §3.7 — planétarium Voie lactée layer: galactic plane, brightness band, galactic centre repère.
 * T-0193 — split from `dessine-ciel.ts` unchanged. Self-contained: fixed J2000 geometry computed
 * once at load; only projection depends on instant. T-0106 will carve the Grande Faille here,
 * outside the star pass.
 * Band = polyline, NOT filled polygon: partly out of champ it breaks into segments, a broken
 * polygon closes anywhere; thick stroke paints only what remains.
 */

import { applique, DEG, versSpherique, type Vec3 } from '../core/mat3.ts'
import { degres } from '../registry/ecriture.ts'
import { depuisGalactique } from '../core/galactique.ts'
import { nanolamberts } from '../core/moon.ts'
import { brillanceVoieLacteeNl } from '../core/fond-ciel-rendu.ts'
import { pointEcran, type PointEcranMut, type Projecteur } from '../core/projection.ts'
import { bandeRealiste, fondRealiste } from './couleurs.ts'
import { champVisible, horsCanevas, horsDuChamp } from './champ-visible.ts'
import { peintLisse } from './lissage.ts'
import type { CandidatLabel } from '../core/labels.ts'
import { altitudeCulmination } from '../core/site.ts'
import { K } from '../registry/constants.ts'
import { HAUTEUR_LABEL_PX, LARGEUR_CARACTERE_PX, RAYON_CORPS_PX } from './libelles-cibles.ts'
import type { EntreeDessin } from './dessine-ciel.ts'
import { QUART_TOUR_DEG, TOUR_DEG, TOUR_RAD } from '../core/unites.ts'

/* Distinct opacity levels the canvas can compose (alpha layer = 1 byte). Two traces with
   opacities in the same level paint the same pixel → mergeable. Platform fact, not threshold. */
const NIVEAUX_ALPHA = 2 ** 8 - 1

export const NOM_VOIE_LACTEE = 'Voie lactée'

const PAS_LONGITUDE_GALACTIQUE_DEG = 3
/**
 * T-0103 — band slice step. At 2°, colour step between neighbour slices = 1/255 over the whole
 * Bortle table: BELOW screen quantization, invisible without blur. True at original exposure;
 * tripled (C-38) the step shows → band goes through `lissage.ts` smoothing (T-0352).
 */
const PAS_LATITUDE_BANDE_DEG = 2

/**
 * T-0033 — galactic plane `b = 0`, sampled in longitude as horizon in azimut. Fixed in J2000:
 * polyline computed once at load, never per frame; only projection depends on instant + zoom.
 */
export const PLAN_GALACTIQUE: readonly Vec3[] = Array.from(
  { length: TOUR_DEG / PAS_LONGITUDE_GALACTIQUE_DEG + 1 },
  (_, i) => depuisGalactique(i * PAS_LONGITUDE_GALACTIQUE_DEG, 0),
)

/**
 * T-0105 — brightness segment length, galactic longitude. Same criterion + measure as latitude
 * step: at 12°, colour step between neighbour segments ≤ 1/255 over Bortle table (below screen
 * quantization). At 18° = 2/255 since exposure tripled (C-38) → would show.
 * `tests/voie-lactee.test.ts` holds this figure.
 * Step = multiple of geometric sampling: segment stays a 4-chord polyline, not one chord.
 */
const PAS_LONGITUDE_BANDE_DEG = 12
const SEGMENTS_PAR_TRANCHE = TOUR_DEG / PAS_LONGITUDE_BANDE_DEG

/**
 * T-0091, T-0103, T-0105 — band as latitude slices, each cut into longitude segments.
 * Slice = constant-latitude band, stroked thick at slice width. Stroke, not filled polygon (see
 * header): paints only what remains → clean cut at champ edge.
 * T-0105 cuts slices in longitude since brightness isn't constant there: Sagittaire bulb is
 * half a magnitude above anticentre. Segment carries a colour as slice does.
 * Joins STAGGERED between slices. Neighbour segments touch end to end (`lineCap = 'butt'`): on
 * the convex side of a bend, the angle leaves a few-pixel notch at slice edge. Aligned across
 * slices = dark line across band; staggered = isolated accidents below eye threshold. Free:
 * baked into polylines at load.
 * Scale runs pole to pole: only geometric bound, replaces the cut latitude once chosen. Painted
 * = decided by segment brightness, evaluated per frame — no extent fixed here.
 * Fixed in J2000: polylines computed at module load.
 */
interface SegmentBande {
  /** Segment middle longitude: carries its brightness. */
  readonly lDeg: number
  readonly ligne: readonly Vec3[]
  /** Segment middle + radius of its containing cap: used to reject it. */
  readonly centre: Vec3
  readonly demiExtensionDeg: number
}

const TRANCHES_BANDE: readonly {
  readonly bDeg: number
  readonly segments: readonly SegmentBande[]
}[] = Array.from({ length: (2 * QUART_TOUR_DEG) / PAS_LATITUDE_BANDE_DEG }, (_, i) => {
  // Slice centre: carries its brightness, as `hauteurRepresentative` does for a halo palier.
  const bDeg = -QUART_TOUR_DEG + (i + 0.5) * PAS_LATITUDE_BANDE_DEG
  const decalageDeg = (i % 2) * (PAS_LONGITUDE_BANDE_DEG / 2)
  const pointsParSegment = PAS_LONGITUDE_BANDE_DEG / PAS_LONGITUDE_GALACTIQUE_DEG + 1
  return Object.freeze({
    bDeg,
    segments: Object.freeze(
      Array.from({ length: SEGMENTS_PAR_TRANCHE }, (_unused, k) => {
        const departDeg = decalageDeg + k * PAS_LONGITUDE_BANDE_DEG
        const lDeg = departDeg + PAS_LONGITUDE_BANDE_DEG / 2
        // Segment covers PAS_LONGITUDE of longitude (arc shrunk by cos(b), meridians closing
        // toward poles) and the slice's latitude thickness.
        const demiLongueurDeg = (PAS_LONGITUDE_BANDE_DEG / 2) * Math.cos(bDeg * DEG)
        return Object.freeze({
          lDeg,
          centre: depuisGalactique(lDeg, bDeg),
          demiExtensionDeg: Math.hypot(demiLongueurDeg, PAS_LATITUDE_BANDE_DEG / 2),
          // Last point of a segment = first of next: strokes meet at same vertex, no overlap —
          // translucent overlap composes twice → bright spot.
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

/** T-0091 — galactic centre: l = 0°, b = 0°, i.e. δ ≈ −29°. Computed, never copied. */
const CENTRE_GALACTIQUE: Vec3 = depuisGalactique(0, 0)
const NOM_CENTRE_GALACTIQUE = 'Centre galactique'

/**
 * T-0034 — label anchor: visible line point nearest canvas centre → name sits on band, not an
 * edge. `null` if line doesn't cross displayed champ: label absent, not displaced.
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
    if (horsCanevas(p, largeur, hauteur)) continue
    // T-0258 — anchor approaches visée centre: at canvas middle, label sits under séance panel,
    // unreadable where it names the band.
    const distance = Math.hypot(p.xPx - projecteur.centreXPx, p.yPx - projecteur.centreYPx)
    if (distance < meilleureDistance) {
      meilleureDistance = distance
      meilleurX = p.xPx
      meilleurY = p.yPx
    }
  }
  // Anchor survives the loop: only point of this pass that is copied.
  return meilleureDistance === Infinity ? null : { xPx: meilleurX, yPx: meilleurY }
}

/**
 * §3.7 — Voie lactée band as seen FROM THIS SITE (T-0103).
 * Band = BRIGHTNESS CONTRIBUTOR, not tinted layer. Each slice composes like T-0100 lunar halo:
 * its share of total brightness = opacity, colour of total = tint. Coupled → right render: where
 * band dominates, painted colour = model's exactly; where it fades, its share multiplies a
 * colour indistinguishable from background → unseen. Nothing thresholded. Band fades toward
 * galactic poles and vanishes at polluted sites because physics says so, not because an opacity
 * and cut latitude were chosen (those 2 constants gave hard-edged streaks).
 * Stroke width follows zoom: latitude slice spans same angle → more pixels when champ tighter.
 * Scale at champ centre; projection stretches toward edges, a reading repère doesn't suffer.
 * ponytail: painted gap computed against zénith background, added in `lighter` → encoded sRGB,
 * not linear light. On background raised by halos (Lune, horizon) band stands out a bit much,
 * never darker than background (the defect). Compose right per direction → paint a 2D field.
 */
interface TeinteBande {
  /** What band adds to background, painted at opacity `part`. */
  readonly couleur: string
  readonly part: number
  /** Same addition, pre-multiplied by `part`: painted opaque on the reduced canvas. */
  readonly premultipliee: string
  readonly segments: SegmentBande[]
}

/**
 * The 2 700 band segments, grouped by painted tint.
 * One `stroke()` per segment = 2 700 wide translucent strokes per frame; cost explodes zoomed
 * out, all in champ. Segment tint depends ONLY on galactic position + site fond de ciel: no move
 * with zoom/scroll. Grouping computed once per fond de ciel → one trace per distinct tint.
 * Opacity quantized to 1/255 (canvas composition precision): two segments grouped already paint
 * identically.
 */
function teintesBande(sbCiel: number, modeNuit: boolean): readonly TeinteBande[] {
  const brillanceCiel = nanolamberts(sbCiel)
  // Background colour alone: slice reproducing it adds nothing visible, to 1/255. Paint bound,
  // deduced, not tuned.
  const fondSeul = fondRealiste(sbCiel)
  const groupes = new Map<string, TeinteBande>()
  for (const tranche of TRANCHES_BANDE) {
    for (const segment of tranche.segments) {
      const rendu = bandeRealiste(
        brillanceCiel,
        brillanceVoieLacteeNl(segment.lDeg, tranche.bDeg) * K('GAIN_RENDU_VOIE_LACTEE'),
        modeNuit,
      )
      // Painted below half a byte level: slice covers background with its own colour. Two ways
      // to change nothing — colour = background's, or opacity under what the screen distinguishes.
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

/** Single entry: fond de ciel changes by hand, never frame to frame. */
let bandeMemo: { readonly cle: string; readonly teintes: readonly TeinteBande[] } | null = null

/**
 * Traces band tints on `cible`, screen coords. One loop over the 2 700 segments per frame.
 */
function traceTeintes(
  cible: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  projecteur: Projecteur,
  teintes: readonly TeinteBande[],
  lisse: boolean,
): void {
  // Same rejection as star cells (§3.3): one dot product per segment, not seven projections.
  // Zoomed out, half the segments are behind observer, rejected only after point-by-point
  // projection.
  const champ = champVisible(projecteur)
  const p = pointEcran()
  for (const teinte of teintes) {
    // T-0110 — path built BEFORE tint set: tint with no segment in champ must cost GPU nothing.
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
 * T-0352 — band painted as gradient: slices go through `peintLisse` reduced canvas, 1 px per
 * slice, enlarged smoothed. There each slice is OPAQUE, colour pre-multiplied by its part, 2×
 * its step thick. Thickness measured at screen centre, projection stretches sky toward edges:
 * at exact thickness, empty gaps opened between slices, smoothing averaged them with band →
 * intensity lost. Doubled, slices overlap instead of parting; opaque, they replace instead of
 * adding → overlap counts once. Copied in `lighter`, each pixel adds exactly `part × ajout`.
 * ponytail: 2× thickness covers stretch up to factor 2 (stéréographique at 90° from centre);
 * beyond, gaps return at champ edge.
 * Without `OffscreenCanvas`, slices paint directly in `lighter`, at their part.
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
  // Band ADDS to background: painted over, it would darken any sky lighter than zénith (halo
  // lunaire, halo d'horizon).
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineJoin = 'round'
  // Butt cap, not round: neighbour segments share a vertex, round cap overlaps them by half a
  // stroke → translucent overlap composes twice = bright bead at each join.
  ctx.lineCap = 'butt'
  ctx.lineWidth = tranchePx
  traceTeintes(ctx, projecteur, teintes, false)
  ctx.globalAlpha = opaciteInitiale
  ctx.globalCompositeOperation = compositionInitiale
  // Back to defaults: repères traced next share this context; thick round stroke left would
  // round frontières and horizon too.
  ctx.lineWidth = 1
  ctx.lineJoin = 'miter'
}

/**
 * §3.7 — galactic centre repère + its site-dependent verdict.
 * CURRENT hauteur = where to look now; CULMINATION hauteur = whether looking makes sense from
 * this site. Both needed: §8.2 already computed GC culminates 14.6° from reference site, a
 * figure in a table nobody opens. Under imaging threshold the repère carries the cause AND the
 * latitude that would make cible reachable.
 * ONE label: repère carries the consequence, arbitrated in §3.4 budget as one block, no
 * exemption.
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
  if (horsCanevas(p, largeur, hauteur)) return null

  ctx.strokeStyle = couleur
  ctx.beginPath()
  ctx.moveTo(p.xPx + RAYON_CORPS_PX, p.yPx)
  ctx.arc(p.xPx, p.yPx, RAYON_CORPS_PX, 0, TOUR_RAD)
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
      ? `${NOM_CENTRE_GALACTIQUE} ${degres(hauteurCouranteDeg, 0)} — trop bas pour la photo d’ici`
      : `${NOM_CENTRE_GALACTIQUE} ${degres(hauteurCouranteDeg, 0)}`
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
