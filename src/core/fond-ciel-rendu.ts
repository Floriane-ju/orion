/**
 * §3.3 — fond de ciel brillance as painted (T-0096 to T-0100).
 *
 * §3.3 says only that fond de ciel "plafonne mag_limite en vue réaliste"; COLOUR unspecified.
 * This module = declared render extension (registry), not a PRD reading.
 *
 * ONE COMPOSITION RULE: brillances add in nanolamberts, never magnitudes. Same as ΔSB_lune
 * (§8.1); reused: `brillanceLuneNl` from `moon.ts`, `attenuationBrute` from `exposure.ts`.
 *
 *   B_total(direction) = (B_site + B_crepuscule(φ)) × facteurHaloHorizon(h) + B_lune(ρ, h_lune, α)
 *   Y_ecran            = K_exposition × B_total
 *
 * Exposure = model's ONLY free constant: luminance ratio between 2 fonds de ciel = ratio of
 * their brillances, not chosen.
 *
 * ponytail: no value traced here. Called per IMAGE (once for fond, once per halo step, once per
 * lunar gradient stop): a `Traced` per call would allocate/freeze dozens of objects at 30 fps
 * for a value nothing displays yet. Upgrade when scène unfolds its fond de ciel like
 * `magnitude_limite_rendue`: wrap with `trace()` here, no recompute.
 */

import { K } from '../registry/constants.ts'
import { SB_NUIT_SITE_REFERENCE_MAG, sbCrepusculeZenith } from '../registry/crepuscule.ts'
import { SB_PLAFOND_TABLE } from '../registry/bortle.ts'
import {
  brillanceLuneNl,
  diffusionKS,
  diffusionMieKS,
  diffusionRayleighKS,
  masseAirKS,
  nanolamberts,
  type GeometrieLune,
} from './moon.ts'
import { DEG } from './mat3.ts'
import { QUART_TOUR_DEG as ANGLE_DROIT_DEG } from './unites.ts'
import { attenuationBrute, rapportDeFlux } from './exposure.ts'

/**
 * van Rhijn (1921) — relative thickness of emissive layer seen at hauteur `h`, vs zenith.
 * Exactly 1 at zenith, grows to horizon.
 */
export function vanRhijn(hauteurDeg: number): number {
  const rapport = K('RAYON_TERRE_KM') / (K('RAYON_TERRE_KM') + K('HAUTEUR_COUCHE_EMISSIVE_KM'))
  const cos = Math.cos(hauteurDeg * DEG)
  return 1 / Math.sqrt(1 - rapport * rapport * cos * cos)
}

/**
 * Multiplicative factor of site brillance at hauteur `h`, zenith = 1. Longer path through the
 * emissive layer is itself more attenuated: van Rhijn alone gives ×6 at horizon, a value nobody
 * observes.
 *
 * ponytail: halo symmetric in azimut. A city's light dome is brighter on its side, but the atlas
 * giving it (VIIRS) needs network and §4.1 rules it out. Declared limit; upgrade only with an
 * offline atlas.
 */
export function facteurHaloHorizon(hauteurDeg: number): number {
  const masseAir = masseAirKS(hauteurDeg)
  return (
    (vanRhijn(hauteurDeg) * attenuationBrute(masseAir)) / attenuationBrute(masseAirKS(ANGLE_DROIT_DEG))
  )
}

/**
 * Upper bounds of halo steps, lowest to highest; last = zenith. "Hauteur below this bound"
 * regions nest: painted largest to smallest, each band keeps tint of the step closing it.
 */
export function bornesPaliersHalo(): readonly number[] {
  const paliers = K('PALIERS_HALO_HORIZON')
  const bornes: number[] = []
  for (let i = 1; i <= paliers; i++) bornes.push((ANGLE_DROIT_DEG * i) / paliers)
  return bornes
}

/** Representative hauteur of step `i`: middle of the band it closes. */
export function hauteurRepresentative(indexPalier: number): number {
  const paliers = K('PALIERS_HALO_HORIZON')
  return (ANGLE_DROIT_DEG * (2 * indexPalier + 1)) / (2 * paliers)
}

/**
 * T-0372 — screen luminance where eye starts adapting: the night's brightest zenith (Bortle 9).
 * Derived from table, not chosen: no night sky changes it.
 */
function genouAdaptation(): number {
  return K('K_EXPOSITION_FOND_CIEL') * nanolamberts(SB_PLAFOND_TABLE)
}

/**
 * Eye adaptation factor for this zenith: 1 at night, less once zenith exceeds `genouAdaptation`.
 * Multiplies exposure of the WHOLE scène → keeps brillance ratios: zenith stays blue, what is
 * brighter (Soleil and halo) whitens.
 *
 * T-0372 — adaptation only PARTIAL: above genou, screen luminance still grows as a power of
 * brillance, up to day ceiling. Complete, it froze zenith at the sunset ceiling down to 8,5°
 * dépression: end of civil twilight as bright as noon, then sudden drop.
 */
export function adaptationEcran(sbZenithMag: number): number {
  const y = K('K_EXPOSITION_FOND_CIEL') * nanolamberts(sbZenithMag)
  const genou = genouAdaptation()
  if (!(y > genou)) return 1
  const adaptee = Math.min(
    K('LUMINANCE_ECRAN_ZENITH_ADAPTE'),
    genou * (y / genou) ** K('EXPOSANT_ADAPTATION_ECRAN'),
  )
  return adaptee / y
}

/**
 * T-0372 — share of night→day path the adapted eye has travelled at this zenith: 0 below
 * `genouAdaptation`, 1 at day ceiling, linear in log screen luminance. Mixes tints, not the
 * adaptation factor: night chromaticity is brighter than day's at equal blue, and
 * `1 − adaptation` brought it back at once near genou, where luminance barely drops → pale veil
 * appeared then faded. Following log luminance: tint never changes faster than luminance drops.
 */
export function partJour(sbZenithMag: number): number {
  const genou = genouAdaptation()
  const y = K('K_EXPOSITION_FOND_CIEL') * nanolamberts(sbZenithMag)
  if (!(y > genou)) return 0
  const parcours = K('EXPOSANT_ADAPTATION_ECRAN') * Math.log(y / genou)
  return Math.min(1, parcours / Math.log(K('LUMINANCE_ECRAN_ZENITH_ADAPTE') / genou))
}

/**
 * Screen luminance, linear light, for this surface brillance, eye adapted to zenith
 * `sbZenithMag` (default: the brillance itself).
 */
export function luminanceEcran(sbMagArcsec2: number, sbZenithMag = sbMagArcsec2): number {
  return (
    adaptationEcran(sbZenithMag) * K('K_EXPOSITION_FOND_CIEL') * nanolamberts(sbMagArcsec2)
  )
}

/**
 * Linear components of the fond: chromaticity goes night blue-violet → day blue as eye adapts,
 * luminance scales it. At night adaptation = 1: chromaticity exactly C-39 to C-41.
 *
 * ponytail: mix follows the adaptation factor, not Soleil hauteur. It is 0,02 at 5° dépression:
 * civil twilight is already day-blue. A twilight-specific tint (orange on the Soleil side) needs
 * solar azimut; upgrade when it is in scope (out of T-0096).
 */
export function composantesFond(
  sbMagArcsec2: number,
  sbZenithMag = sbMagArcsec2,
): readonly [number, number, number] {
  const y = luminanceEcran(sbMagArcsec2, sbZenithMag)
  const jour = partJour(sbZenithMag)
  const melange = (nuit: number, diurne: number): number => y * (nuit + jour * (diurne - nuit))
  return [
    melange(K('CHROMA_FOND_CIEL_R'), K('CHROMA_CIEL_JOUR_R')),
    melange(K('CHROMA_FOND_CIEL_V'), K('CHROMA_CIEL_JOUR_V')),
    melange(K('CHROMA_FOND_CIEL_B'), K('CHROMA_CIEL_JOUR_B')),
  ]
}

/** Inverse of `nanolamberts`: nanolambert brillance → surface magnitude. */
export function sbDepuisNanolamberts(brillanceNl: number): number {
  return (
    (K('NANOLAMBERT_OFFSET') - Math.log(brillanceNl / K('NANOLAMBERT_ECHELLE'))) /
    K('NANOLAMBERT_PENTE')
  )
}

/**
 * §3.7 — Voie lactée surface brillance in this galactic direction, nanolamberts.
 *
 * Bande = light contributor like the lunar halo, not a layer: fades at a polluted site WITHOUT
 * threshold or conventional opacity. Its share of total brillance decides opacity, the sum's
 * colour decides tint — coupled, as in `dessineHaloLune` (T-0100).
 *
 * Latitude profile reuses star-density scale: integrated light and star counts fall from the
 * same plane; duplicating the scale = two versions to desync.
 *
 * LONGITUDE PROFILE (T-0105) = first Fourier mode, not a Sagittaire bump. Exponential disc seen
 * from inside: max integrated light toward centre, min toward anticentre, monotone between →
 * first harmonic `(1 + cos l) / 2`. Models the bulb WITHOUT a longitude width to choose (a
 * Gaussian needs an unsourced σ). Both bounds are observable brillances → contestable.
 *
 * NOT in `brillanceFondNl`: adding bande to fond de ciel would lower magnitude limite inside the
 * Voie lactée → FEWER stars shown where the sky shows most.
 *
 * ponytail: latitude scale independent of longitude, though bulb is thicker than disc. Fixing it
 * needs a second unsourced scale (single 20° scale already wide). Declared limit; upgrade if a
 * sourced bulb scale appears.
 */
export function brillanceVoieLacteeNl(
  longitudeGalactiqueDeg: number,
  latitudeGalactiqueDeg: number,
): number {
  const attenuationMag =
    K('POGSON') *
    Math.log10(Math.exp(Math.abs(latitudeGalactiqueDeg) / K('ECHELLE_LATITUDE_GALACTIQUE_DEG')))
  const partBulbe = (1 + Math.cos(longitudeGalactiqueDeg * DEG)) / 2
  const sbPlan =
    K('SB_VOIE_LACTEE_PLAN_MAG') +
    (K('SB_VOIE_LACTEE_BULBE_MAG') - K('SB_VOIE_LACTEE_PLAN_MAG')) * partBulbe
  return nanolamberts(sbPlan + attenuationMag)
}

/**
 * T-0099 — twilight contribution to sky brillance, nanolamberts.
 *
 * Biggest gap of the réaliste view: at Soleil −6° real sky is clearly blue with a handful of
 * stars, app rendered full-night fond. `registry/crepuscule.ts` table measures a TOTAL
 * (scattered twilight glow + Paranal night glow); twilight alone = difference, added to the site
 * in nanolamberts like other contributors (§8.1).
 *
 * Falls to zero by itself at 15,9° dépression, where the fit meets the site's own night fond: no
 * hand-placed join → no jump at nuit astronomique boundary (crossed 2° later, contribution
 * already null).
 *
 * ponytail: twilight glow inherits the site's horizon-halo factor (`brillanceFondNl`), but
 * twilight sky brightens toward horizon faster than van Rhijn says, mostly on the Soleil side.
 * True geometry needs solar azimut, out of T-0096 scope like a city's light dome. Direction
 * right, amplitude conservative. Declared limit; upgrade when solar azimut is in scope.
 */
export function brillanceCrepusculeNl(depressionSolaireDeg: number): number {
  // `null`: dépression past end of twilight, or NaN. Threshold lives in registry with the table
  // producing it, not retested here.
  const sb = sbCrepusculeZenith(depressionSolaireDeg)
  if (sb === null) return 0
  return Math.max(0, nanolamberts(sb.value) - nanolamberts(SB_NUIT_SITE_REFERENCE_MAG))
}

export interface EntreeFondRendu {
  /** Site fond de ciel at zenith, Lune excluded (§2.2). */
  readonly sbSiteMag: number
  /** Hauteur of the rendered direction: decides horizon halo. */
  readonly hauteurDeg: number
  /** Lunar geometry of this direction. Absent: Lune not in the computation. */
  readonly lune?: GeometrieLune | undefined
  /**
   * T-0099 — Soleil dépression below horizon, degrees (positive once set). Absent: twilight not
   * in the computation, as an out-of-domain instant doesn't switch off the scène (§12.5).
   */
  readonly depressionSolaireDeg?: number | undefined
}

/** Total sky brillance in this direction, nanolamberts. */
function brillanceFondNl(entree: EntreeFondRendu): number {
  const bCrepuscule =
    entree.depressionSolaireDeg === undefined
      ? 0
      : brillanceCrepusculeNl(entree.depressionSolaireDeg)
  const bCiel =
    (nanolamberts(entree.sbSiteMag) + bCrepuscule) * facteurHaloHorizon(entree.hauteurDeg)
  return bCiel + (entree.lune === undefined ? 0 : brillanceLuneNl(entree.lune))
}

/**
 * Effective fond de ciel in this direction, mag/arcsec². One engine, two screens (T-0089): plan
 * de séance adds the same brillances with the same functions → same fond de ciel at same minute.
 */
export function sbEffectifRendu(entree: EntreeFondRendu): number {
  return sbDepuisNanolamberts(brillanceFondNl(entree))
}

export interface GeometrieSoleil {
  readonly altitudeSoleilDeg: number
  readonly altitudeCibleDeg: number
  readonly separationDeg: number
}

/**
 * Kasten & Young (1989) — masse d'air down to horizon (≈ 38 at h = 0°). KS91 caps at 5 there:
 * right for Lune and cible above 15°, but left the setting Soleil all its brightness/whiteness.
 */
export function masseAirKastenYoung(hauteurDeg: number): number {
  const h = Math.max(0, hauteurDeg)
  return (
    1 /
    (Math.sin(h * DEG) +
      K('KASTEN_YOUNG_A') * (h + K('KASTEN_YOUNG_DECALAGE_DEG')) ** -K('KASTEN_YOUNG_EXPOSANT'))
  )
}

/**
 * Per-channel (R, V, B) transmission of an atmospheric path at this hauteur, relative to RED
 * (least extinct): reddening removes green and blue, never adds red — common extinction already
 * in `attenuationBrute`. ≈ (1, 1, 1) at zenith, orange at horizon — all of the sunset.
 */
export function rougissement(hauteurDeg: number): readonly [number, number, number] {
  const x = masseAirKastenYoung(hauteurDeg)
  const kR = K('EXTINCTION_R_MAG_PAR_MASSE_AIR')
  const relative = (k: number): number => rapportDeFlux((k - kR) * x)
  return [1, relative(K('EXTINCTION_V_MAG_PAR_MASSE_AIR')), relative(K('EXTINCTION_B_MAG_PAR_MASSE_AIR'))]
}

/** Soleil illuminance extinct by its masse d'air, without the horizon rule. */
function eclairementSoleil(altitudeSoleilDeg: number): number {
  return (
    rapportDeFlux(K('KS_MAGNITUDE_SOLEIL')) *
    attenuationBrute(masseAirKastenYoung(altitudeSoleilDeg))
  )
}

/**
 * Brillance added by the Soleil in this direction, nanolamberts: KS91's B_lune term
 * (`brillanceLuneNl`) with Soleil for Lune. Same scattering, same rule: a set Soleil lights
 * nothing — twilight comes from Patat 2006. Only solar path extinction changes masse d'air
 * (`masseAirKastenYoung`).
 *
 * ponytail: KS91 is calibrated on the Lune. On the Soleil it gives a day zenith of 4-5,5
 * mag/as², the measured order of magnitude, but multiple scattering (dominant in day sky) is
 * missing. Enough to paint the sky, not for a verdict; upgrade if a verdict needs day-sky
 * brightness.
 */
export function brillanceSoleilNl(entree: GeometrieSoleil): number {
  if (entree.altitudeSoleilDeg <= 0 || entree.altitudeCibleDeg <= 0) return 0
  return (
    diffusionKS(entree.separationDeg) *
    eclairementSoleil(entree.altitudeSoleilDeg) *
    (1 - attenuationBrute(masseAirKS(entree.altitudeCibleDeg)))
  )
}

/** Decomposed Soleil halo: Rayleigh (blue, wide) and Mie (neutral, tight), nanolamberts. */
export interface LueurSoleil {
  readonly rayleighNl: number
  readonly mieNl: number
}

/**
 * T-0356 — painted Soleil halo, 2 terms so each keeps its colour.
 *
 * - Rayleigh, wide: path extinction taken AT ZENITH, like the term `sbZenithAvecCrepuscule`
 *   counts — each direction's hauteur is applied by the horizon halo itself. Set, Soleil has
 *   none: that is Patat 2006 twilight.
 * - Mie, tight around Soleil: path taken at target's hauteur — default the Soleil's, the only
 *   one a radial gradient knows. Set, stays painted as at horizon and fades like Patat at
 *   zenith, faster: sunset glow pales to pink, then vanishes before night.
 *
 * ponytail: Soleil's (or zenith's) hauteur for a whole separation circle, since a radial gradient
 * can't do better (see `dessineHaloLune`). Render only; upgrade if a computed value needs it.
 */
export function lueurSoleil(
  altitudeSoleilDeg: number,
  separationDeg: number,
  hauteurCibleDeg = altitudeSoleilDeg,
): LueurSoleil {
  const altitude = Math.max(0, altitudeSoleilDeg)
  const eclairement = eclairementSoleil(altitude)
  const couche = altitudeSoleilDeg <= 0
  return {
    rayleighNl: couche
      ? 0
      : eclairement *
        diffusionRayleighKS(separationDeg) *
        (1 - attenuationBrute(masseAirKS(ANGLE_DROIT_DEG))),
    mieNl:
      eclairement *
      diffusionMieKS(separationDeg) *
      (1 - attenuationBrute(masseAirKS(Math.max(0, hauteurCibleDeg)))) *
      affaiblissementCrepuscule(-altitudeSoleilDeg),
  }
}

/**
 * 1 while Soleil is up; beyond, Patat twilight drop from horizon + glow's own fading
 * (`LUEUR_COUCHANT_MAG_PAR_DEG`).
 */
function affaiblissementCrepuscule(depressionSolaireDeg: number): number {
  if (depressionSolaireDeg <= 0) return 1
  const horizon = sbCrepusculeZenith(0)
  const ici = sbCrepusculeZenith(depressionSolaireDeg)
  if (horizon === null || ici === null) return 0
  const propre =
    rapportDeFlux(K('LUEUR_COUCHANT_MAG_PAR_DEG') * depressionSolaireDeg)
  return (propre * nanolamberts(ici.value)) / nanolamberts(horizon.value)
}

/**
 * T-0372 — share of twilight left in fond, in log: 1 until sunset, 0 when fond is back to the
 * site's (end of Patat table). Removing viewing reddening BRIGHTENS the fond (only removes green
 * and blue). Faded with the sunset glow it vanished during the first 5°, where fond held at
 * table edge doesn't drop → horizon paled mid civil twilight. Following log of fond brillance
 * itself fades slower than sky darkens, null the instant Soleil grid hands over to the steps.
 *
 * ponytail: monotonic while viewing reddening keeps > ¼ of luminance (h ≳ 3°); lower, ground
 * covers the sky. Upgrade only if sky below 3° is ever painted.
 */
function extinctionRougissementFond(depressionSolaireDeg: number, bFondNl: number): number {
  const bSite = bFondNl - brillanceCrepusculeNl(depressionSolaireDeg)
  const couchant = Math.log1p(brillanceCrepusculeNl(0) / bSite)
  if (!(bSite > 0) || !(couchant > 0)) return 0
  return Math.min(1, Math.log(bFondNl / bSite) / couchant)
}

/**
 * Depends only on Soleil and fond, not direction: once per frame, shared by all grid directions.
 */
export interface EclairageSoleil {
  readonly altitudeSoleilDeg: number
  /** Site fond at zenith WITHOUT the solar term, nanolamberts. */
  readonly bFondNl: number
  /** Full zenith, Soleil included: sets eye adaptation. */
  readonly sbZenith: number
  /** Reddening of solar light on its own path. */
  readonly soleil: readonly [number, number, number]
  /** Viewing-reddening exponent applied to Rayleigh, 0 high Soleil, 1 grazing Soleil. */
  readonly poidsVue: number
  /** Same for site fond and twilight, extinguished as zenith darkens. */
  readonly poidsFond: number
  /** Factor applied to Mie glow so its peak stays on screen. */
  readonly exposition: number
}

/**
 * T-0356 — sky lighting by this Soleil.
 *
 * - `poidsVue`: low sky lit by already-reddened light reads reddened — the yellow under a
 *   sunset's blue. High Soleil: multiple scattering (absent from model) keeps horizon white →
 *   weight follows Soleil's own reddening, raised to `EXPOSANT_POIDS_COUCHANT` to fade fast as it
 *   rises.
 * - `exposition`: like an eye or boîtier, exposes on the glow. Luminance at
 *   `SEPARATION_REFERENCE_LUEUR_DEG` from Soleil is brought to `LUEUR_CIBLE_EXPOSITION`; without
 *   it Mie exceeds fond by 2 orders of magnitude and all saturates white.
 */
export function eclairageSoleil(
  altitudeSoleilDeg: number,
  bFondNl: number,
  sbZenith: number,
): EclairageSoleil {
  const soleil = rougissement(altitudeSoleilDeg)
  const poidsVue = (1 - soleil[2]) ** K('EXPOSANT_POIDS_COUCHANT')
  const reference = lueurSoleil(
    altitudeSoleilDeg,
    K('SEPARATION_REFERENCE_LUEUR_DEG'),
    Math.max(0, altitudeSoleilDeg),
  )
  const yReference = luminanceEcran(sbDepuisNanolamberts(reference.mieNl), sbZenith)
  return {
    altitudeSoleilDeg,
    bFondNl,
    sbZenith,
    soleil,
    poidsVue,
    poidsFond: poidsVue * extinctionRougissementFond(-altitudeSoleilDeg, bFondNl),
    exposition: yReference > 0 ? Math.min(1, K('LUEUR_CIBLE_EXPOSITION') / yReference) : 1,
  }
}

/**
 * T-0356 — sky colour in a direction (h, ρ), ready to encode (channels in [0, 1]).
 * Fond and Rayleigh, lifted by horizon halo (`facteurHaloHorizon`) and reddened by viewing path
 * per weight, keep the sky tint: constant-hue compression. Mie glow, reddened TWICE (Soleil path
 * to the scattering, then scattering path to the eye), adds on and saturates per channel. The
 * 2nd path depends only on aimed hauteur: it stages the sunset in bands — orange at horizon,
 * yellow, cream, sky blue.
 */
export function composantesCielSoleil(
  e: EclairageSoleil,
  hauteurDeg: number,
  separationDeg: number,
): readonly [number, number, number] {
  const hauteur = Math.max(0, hauteurDeg)
  const lueur = lueurSoleil(e.altitudeSoleilDeg, separationDeg, hauteur)
  const halo = facteurHaloHorizon(hauteur)
  const fond = composantesFond(sbDepuisNanolamberts(e.bFondNl * halo), e.sbZenith)
  const rayleigh = composantesFond(sbDepuisNanolamberts(lueur.rayleighNl * halo), e.sbZenith)
  const trajet = rougissement(hauteur)
  const base = compresseTeinte([
    fond[0] * trajet[0] ** e.poidsFond + rayleigh[0] * trajet[0] ** e.poidsVue,
    fond[1] * trajet[1] ** e.poidsFond + rayleigh[1] * trajet[1] ** e.poidsVue,
    fond[2] * trajet[2] ** e.poidsFond + rayleigh[2] * trajet[2] ** e.poidsVue,
  ])
  const mie = e.exposition * luminanceEcran(sbDepuisNanolamberts(lueur.mieNl), e.sbZenith)
  return compresseHautesLumieres([
    base[0] + mie * e.soleil[0] * trajet[0],
    base[1] + mie * e.soleil[1] * trajet[1],
    base[2] + mie * e.soleil[2] * trajet[2],
  ])
}

/**
 * Soft constant-hue compression: brightest channel goes through `compresseCanal`, other two
 * follow at same ratio. For fond, whose tint is the sky itself: horizon 3× brighter than zenith
 * stays pale blue, doesn't whiten.
 */
export function compresseTeinte(
  c: readonly [number, number, number],
): readonly [number, number, number] {
  const max = Math.max(c[0], c[1], c[2])
  if (!(max > K('GENOU_HAUTES_LUMIERES'))) return c
  const echelle = compresseCanal(max) / max
  return [c[0] * echelle, c[1] * echelle, c[2] * echelle]
}

/**
 * Soft highlight compression per channel: below `GENOU_HAUTES_LUMIERES` passes as-is, above
 * tends to 1 (continuous slope at genou). Like overexposed film: a sunset's red hits the
 * ceiling first, green joins — orange → yellow → white nearing Soleil, never hard clipping.
 */
export function compresseHautesLumieres(
  c: readonly [number, number, number],
): readonly [number, number, number] {
  return [compresseCanal(c[0]), compresseCanal(c[1]), compresseCanal(c[2])]
}

function compresseCanal(lineaire: number): number {
  const genou = K('GENOU_HAUTES_LUMIERES')
  if (lineaire <= genou) return lineaire
  const reste = 1 - genou
  return genou + reste * (1 - Math.exp(-(lineaire - genou) / reste))
}

/** Soleil brillance at zenith, nanolamberts, for this solar dépression. */
export function brillanceSoleilZenithNl(depressionSolaireDeg: number): number {
  return brillanceSoleilNl({
    altitudeSoleilDeg: -depressionSolaireDeg,
    altitudeCibleDeg: ANGLE_DROIT_DEG,
    separationDeg: ANGLE_DROIT_DEG + depressionSolaireDeg,
  })
}

/**
 * T-0099 — site fond de ciel AT ZENITH, twilight and Soleil included: what the scène needs, as
 * its layers (fond tint, halo steps, bande contrast, eye adaptation) all start from zenith and
 * apply horizon halo themselves. Solar halo painted on top removes this term before adding
 * (`dessineHaloSoleil`), like the lunar halo, which this zenith excludes.
 */
export function sbZenithAvecCrepuscule(sbSiteMag: number, depressionSolaireDeg: number): number {
  const bCiel = nanolamberts(
    sbEffectifRendu({ sbSiteMag, hauteurDeg: ANGLE_DROIT_DEG, depressionSolaireDeg }),
  )
  return sbDepuisNanolamberts(bCiel + brillanceSoleilZenithNl(depressionSolaireDeg))
}
