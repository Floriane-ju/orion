/**
 * §3.3 — brillance du fond de ciel telle qu'elle se peint (T-0096 à T-0100).
 *
 * §3.3 ne dit du fond de ciel qu'une chose : il « plafonne mag_limite en vue réaliste ». La
 * COULEUR du fond n'y est pas spécifiée. Ce module est donc une extension de rendu assumée,
 * déclarée comme telle au registre — pas une lecture du PRD.
 *
 * UNE SEULE RÈGLE DE COMPOSITION : les brillances s'additionnent en nanolamberts, jamais en
 * magnitudes. C'est déjà celle de ΔSB_lune (§8.1), et le module la réemploie au lieu de la
 * réécrire : `brillanceLuneNl` vient de `moon.ts`, `attenuationBrute` d'`exposure.ts`.
 *
 *   B_total(direction) = (B_site + B_crepuscule(φ)) × facteurHaloHorizon(h) + B_lune(ρ, h_lune, α)
 *   Y_ecran            = K_exposition × B_total
 *
 * L'exposition est la SEULE constante libre du modèle : le rapport de luminance entre deux
 * fonds de ciel est celui de leurs brillances, il n'est pas choisi.
 *
 * ponytail: aucune valeur tracée ici. Ces fonctions sont appelées par IMAGE — une fois pour le
 * fond, une par palier de halo, une par cran du dégradé lunaire. Un `Traced` par appel
 * allouerait et gèlerait des dizaines d'objets à 30 im/s pour une valeur que rien n'affiche
 * encore. Le jour où la scène déplie son fond de ciel comme elle déplie
 * `magnitude_limite_rendue`, c'est un enrobage `trace()` à poser ici, pas un calcul à refaire.
 */

import { K } from '../registry/constants.ts'
import { SB_NUIT_SITE_REFERENCE_MAG, sbCrepusculeZenith } from '../registry/crepuscule.ts'
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
 * van Rhijn (1921) — épaisseur relative de la couche émissive vue à la hauteur `h`, rapportée
 * au zénith. Vaut exactement 1 au zénith et croît jusqu'à l'horizon.
 */
export function vanRhijn(hauteurDeg: number): number {
  const rapport = K('RAYON_TERRE_KM') / (K('RAYON_TERRE_KM') + K('HAUTEUR_COUCHE_EMISSIVE_KM'))
  const cos = Math.cos(hauteurDeg * DEG)
  return 1 / Math.sqrt(1 - rapport * rapport * cos * cos)
}

/**
 * Facteur multiplicatif de la brillance du site à la hauteur `h`, zénith = 1.
 *
 * Le trajet plus long à travers la couche émissive est lui-même plus atténué : sans le terme
 * d'extinction, van Rhijn seul donnerait ×6 à l'horizon, valeur que personne n'observe.
 *
 * ponytail: le halo reste symétrique en azimut. Le dôme lumineux d'une ville est plus clair de
 * son côté, mais l'atlas qui le donnerait (VIIRS) exige le réseau et §4.1 l'écarte. Limite
 * déclarée, pas oubliée.
 */
export function facteurHaloHorizon(hauteurDeg: number): number {
  const masseAir = masseAirKS(hauteurDeg)
  return (
    (vanRhijn(hauteurDeg) * attenuationBrute(masseAir)) / attenuationBrute(masseAirKS(ANGLE_DROIT_DEG))
  )
}

/**
 * Bornes hautes des paliers du halo, du plus bas au plus haut ; la dernière est le zénith.
 *
 * Les régions « hauteur inférieure à cette borne » s'emboîtent : peintes de la plus grande à
 * la plus petite, chaque bande garde la teinte du palier qui la referme.
 */
export function bornesPaliersHalo(): readonly number[] {
  const paliers = K('PALIERS_HALO_HORIZON')
  const bornes: number[] = []
  for (let i = 1; i <= paliers; i++) bornes.push((ANGLE_DROIT_DEG * i) / paliers)
  return bornes
}

/** Hauteur représentative du palier d'index `i` : le milieu de la bande qu'il referme. */
export function hauteurRepresentative(indexPalier: number): number {
  const paliers = K('PALIERS_HALO_HORIZON')
  return (ANGLE_DROIT_DEG * (2 * indexPalier + 1)) / (2 * paliers)
}

/**
 * Facteur d'adaptation de l'œil à ce zénith : 1 la nuit, moins dès que le zénith dépasserait
 * `LUMINANCE_ECRAN_ZENITH_ADAPTE`. Il multiplie l'exposition de TOUTE la scène, donc garde les
 * rapports de brillance : le zénith reste bleu, ce qui est plus clair que lui — le Soleil et
 * son halo — blanchit.
 */
export function adaptationEcran(sbZenithMag: number): number {
  const y = K('K_EXPOSITION_FOND_CIEL') * nanolamberts(sbZenithMag)
  return Math.min(1, K('LUMINANCE_ECRAN_ZENITH_ADAPTE') / y)
}

/**
 * Luminance d'écran, en lumière linéaire, correspondant à cette brillance de surface, l'œil
 * adapté au zénith `sbZenithMag` — par défaut la brillance elle-même.
 */
export function luminanceEcran(sbMagArcsec2: number, sbZenithMag = sbMagArcsec2): number {
  return (
    adaptationEcran(sbZenithMag) * K('K_EXPOSITION_FOND_CIEL') * nanolamberts(sbMagArcsec2)
  )
}

/**
 * Composantes linéaires du fond : la chromaticité passe du bleu-violet de la nuit au bleu du
 * jour à mesure que l'œil s'adapte, et la luminance l'échelonne. La nuit, l'adaptation vaut 1 :
 * la chromaticité reste exactement celle de C-39 à C-41.
 *
 * ponytail: le mélange suit le facteur d'adaptation, pas la hauteur du Soleil. Il vaut 0,02 à
 * 5° de dépression : le crépuscule civil est déjà bleu de jour. Une teinte propre au
 * crépuscule (orangé côté Soleil) demanderait l'azimut solaire, hors périmètre de T-0096.
 */
export function composantesFond(
  sbMagArcsec2: number,
  sbZenithMag = sbMagArcsec2,
): readonly [number, number, number] {
  const y = luminanceEcran(sbMagArcsec2, sbZenithMag)
  const jour = 1 - adaptationEcran(sbZenithMag)
  const melange = (nuit: number, diurne: number): number => y * (nuit + jour * (diurne - nuit))
  return [
    melange(K('CHROMA_FOND_CIEL_R'), K('CHROMA_CIEL_JOUR_R')),
    melange(K('CHROMA_FOND_CIEL_V'), K('CHROMA_CIEL_JOUR_V')),
    melange(K('CHROMA_FOND_CIEL_B'), K('CHROMA_CIEL_JOUR_B')),
  ]
}

/** Inverse de `nanolamberts` : d'une brillance en nanolamberts vers sa magnitude surfacique. */
export function sbDepuisNanolamberts(brillanceNl: number): number {
  return (
    (K('NANOLAMBERT_OFFSET') - Math.log(brillanceNl / K('NANOLAMBERT_ECHELLE'))) /
    K('NANOLAMBERT_PENTE')
  )
}

/**
 * §3.7 — brillance de surface de la Voie lactée dans cette direction galactique, en nanolamberts.
 *
 * La bande est un contributeur de lumière comme le halo lunaire, pas un calque : c'est ce qui
 * lui permet de s'effacer quand le site est pollué SANS seuil ni opacité de convention. Sa part
 * dans la brillance totale décide de son opacité, et la couleur de la somme décide de sa teinte
 * — les deux couplés, comme dans `dessineHaloLune` (T-0100).
 *
 * Le profil en latitude réemploie l'échelle de la densité stellaire : la lumière intégrée et le
 * comptage d'étoiles décroissent du même plan, et dupliquer l'échelle en donnerait deux versions
 * à désaccorder.
 *
 * LE PROFIL EN LONGITUDE (T-0105) est le premier mode de Fourier, et pas une bosse posée sur le
 * Sagittaire. Un disque exponentiel regardé de l'intérieur donne une lumière intégrée maximale
 * vers le centre, minimale vers l'anticentre, et monotone entre les deux : sa première harmonique
 * est `(1 + cos l) / 2`. C'est ce qui permet de modéliser le bulbe SANS largeur en longitude à
 * choisir — une gaussienne aurait demandé un σ que rien ne source. Les deux bornes, elles, sont
 * des brillances observables, donc discutables sur pièce.
 *
 * Elle n'entre PAS dans `brillanceFondNl` : verser la bande au fond de ciel ferait baisser la
 * magnitude limite à l'intérieur de la Voie lactée, donc afficher MOINS d'étoiles là où le ciel
 * en montre le plus.
 *
 * ponytail: l'échelle de latitude ne dépend pas de la longitude, alors que le bulbe est plus
 * épais que le disque. La corriger demanderait une seconde échelle sans source ; l'échelle
 * unique de 20° est déjà large. Limite déclarée, pas oubliée.
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
 * T-0099 — contribution du crépuscule à la brillance du ciel, en nanolamberts.
 *
 * C'est le plus gros écart de la vue réaliste : à Soleil −6° le vrai ciel est bleu franc et ne
 * montre qu'une poignée d'étoiles, là où l'app rendait le fond de la pleine nuit. La table de
 * `registry/crepuscule.ts` mesure un TOTAL — lueur crépusculaire diffusée plus lueur nocturne
 * de Paranal ; le crépuscule seul est la différence, et elle s'ajoute au site en nanolamberts
 * comme les autres contributeurs (§8.1).
 *
 * Elle tombe à zéro d'elle-même à 15,9° de dépression, où l'ajustement rejoint le fond
 * nocturne de son propre site : aucun raccord n'est posé à la main, donc aucun saut à la
 * frontière de la nuit astronomique — qui est franchie 2° plus tard, contribution déjà nulle.
 *
 * ponytail: la lueur crépusculaire hérite du facteur de halo d'horizon du site (voir
 * `brillanceFondNl`), alors que le ciel du crépuscule s'éclaircit vers l'horizon plus vite que
 * van Rhijn ne le dit, et surtout plus vite du côté du Soleil. La vraie géométrie dépend de
 * l'azimut solaire, que T-0096 met hors périmètre au même titre que le dôme lumineux d'une
 * ville. Le sens est bon, l'amplitude est prudente : limite déclarée, pas oubliée.
 */
export function brillanceCrepusculeNl(depressionSolaireDeg: number): number {
  // `null` : la dépression a dépassé la fin du crépuscule, ou n'est pas un nombre. Le seuil
  // vit au registre avec la table qui le produit, il n'est pas retesté ici.
  const sb = sbCrepusculeZenith(depressionSolaireDeg)
  if (sb === null) return 0
  return Math.max(0, nanolamberts(sb.value) - nanolamberts(SB_NUIT_SITE_REFERENCE_MAG))
}

export interface EntreeFondRendu {
  /** Fond de ciel du site au zénith, Lune exclue (§2.2). */
  readonly sbSiteMag: number
  /** Hauteur de la direction rendue : elle décide du halo d'horizon. */
  readonly hauteurDeg: number
  /** Géométrie lunaire de cette direction. Absente : la Lune n'entre pas dans le calcul. */
  readonly lune?: GeometrieLune | undefined
  /**
   * T-0099 — dépression du Soleil sous l'horizon, en degrés (positive une fois couché).
   * Absente : le crépuscule n'entre pas dans le calcul, comme un instant hors du domaine des
   * séries n'éteint pas la scène (§12.5).
   */
  readonly depressionSolaireDeg?: number | undefined
}

/** Brillance totale du ciel dans cette direction, en nanolamberts. */
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
 * Fond de ciel effectif dans cette direction, en mag/arcsec².
 *
 * Un seul moteur, deux écrans (T-0089) : le plan de séance additionne les mêmes brillances
 * avec les mêmes fonctions, donc annonce le même fond de ciel à la même minute.
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
 * Kasten & Young (1989) — masse d'air jusqu'à l'horizon (≈ 38 à h = 0°). Celle de KS91 y
 * plafonne à 5 : juste pour la Lune et une cible au-dessus de 15°, elle laissait au Soleil
 * couchant tout son éclat et toute sa blancheur.
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
 * Transmission par canal (R, V, B) d'un trajet atmosphérique à cette hauteur, rapportée au
 * ROUGE, le canal le moins éteint : le rougissement retire du vert et du bleu, il n'ajoute
 * jamais de rouge — l'extinction commune, elle, est déjà dans `attenuationBrute`. Vaut ≈ (1, 1, 1)
 * au zénith, vire à l'orangé au ras de l'horizon — c'est tout le couchant.
 */
export function rougissement(hauteurDeg: number): readonly [number, number, number] {
  const x = masseAirKastenYoung(hauteurDeg)
  const kR = K('EXTINCTION_R_MAG_PAR_MASSE_AIR')
  const relative = (k: number): number => rapportDeFlux((k - kR) * x)
  return [1, relative(K('EXTINCTION_V_MAG_PAR_MASSE_AIR')), relative(K('EXTINCTION_B_MAG_PAR_MASSE_AIR'))]
}

/** Éclairement du Soleil éteint par sa masse d'air, sans la règle de l'horizon. */
function eclairementSoleil(altitudeSoleilDeg: number): number {
  return (
    rapportDeFlux(K('KS_MAGNITUDE_SOLEIL')) *
    attenuationBrute(masseAirKastenYoung(altitudeSoleilDeg))
  )
}

/**
 * Brillance ajoutée par le Soleil dans cette direction, en nanolamberts : le terme B_lune de
 * KS91 (`brillanceLuneNl`), la Lune remplacée par le Soleil. Même diffusion, même règle : un
 * Soleil couché n'éclaire rien — le crépuscule, lui, vient de Patat 2006. Seule l'extinction
 * du trajet solaire change de masse d'air (`masseAirKastenYoung`).
 *
 * ponytail: KS91 est calibré sur la Lune. Appliqué au Soleil, il donne un zénith de jour de
 * 4 à 5,5 mag/as², l'ordre de grandeur mesuré ; mais la diffusion multiple, qui domine le ciel
 * de jour, n'y est pas. Assez pour peindre le ciel, pas pour un verdict.
 */
export function brillanceSoleilNl(entree: GeometrieSoleil): number {
  if (entree.altitudeSoleilDeg <= 0 || entree.altitudeCibleDeg <= 0) return 0
  return (
    diffusionKS(entree.separationDeg) *
    eclairementSoleil(entree.altitudeSoleilDeg) *
    (1 - attenuationBrute(masseAirKS(entree.altitudeCibleDeg)))
  )
}

/** Halo du Soleil décomposé : Rayleigh (bleu, large) et Mie (neutre, serré), en nanolamberts. */
export interface LueurSoleil {
  readonly rayleighNl: number
  readonly mieNl: number
}

/**
 * T-0356 — le halo peint du Soleil, en deux termes pour que chacun garde sa couleur.
 *
 * - Rayleigh, large : son extinction de trajet se prend AU ZÉNITH, comme le terme que
 *   `sbZenithAvecCrepuscule` compte déjà — la hauteur de chaque direction, le halo d'horizon
 *   l'applique lui-même. Couché, le Soleil n'en a plus : c'est le crépuscule de Patat 2006.
 * - Mie, serré autour du Soleil : son trajet se prend à la hauteur de la cible — par défaut
 *   celle du Soleil, la seule que connaisse un dégradé radial. Couché, il reste peint comme au ras de l'horizon et s'éteint comme Patat au
 *   zénith, en plus vite : la lueur du couchant pâlit en rose, puis disparaît avant la nuit.
 *
 * ponytail: la hauteur « du Soleil » ou « du zénith » pour tout un cercle de séparation, parce
 * qu'un dégradé radial ne sait pas faire mieux (voir `dessineHaloLune`). Rendu seul.
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
 * 1 tant que le Soleil est levé ; au-delà, la chute du crépuscule de Patat depuis l'horizon,
 * plus l'affaiblissement propre de la lueur (`LUEUR_COUCHANT_MAG_PAR_DEG`).
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
 * Ce qui ne dépend que du Soleil et du fond, pas de la direction : calculé une fois par image,
 * partagé par toutes les directions de la grille.
 */
export interface EclairageSoleil {
  readonly altitudeSoleilDeg: number
  /** Fond du site au zénith, SANS le terme solaire, en nanolamberts. */
  readonly bFondNl: number
  /** Zénith complet, Soleil compris : c'est lui qui règle l'adaptation de l'œil. */
  readonly sbZenith: number
  /** Rougissement de la lumière solaire sur son propre trajet. */
  readonly soleil: readonly [number, number, number]
  /** Exposant du rougissement de visée appliqué au Rayleigh, 0 Soleil haut, 1 Soleil rasant. */
  readonly poidsVue: number
  /** Le même pour le fond du site et le crépuscule, éteint avec la lueur. */
  readonly poidsFond: number
  /** Facteur appliqué à la lueur de Mie pour que son pic reste dans l'écran. */
  readonly exposition: number
}

/**
 * T-0356 — l'éclairage du ciel par ce Soleil.
 *
 * - `poidsVue` : un ciel bas éclairé par une lumière déjà rougie se lit rougi — c'est le
 *   jaune sous le bleu d'un couchant. Soleil haut, la diffusion multiple, absente du modèle,
 *   garde l'horizon blanc : le poids suit donc le rougissement du Soleil lui-même, élevé à
 *   `EXPOSANT_POIDS_COUCHANT` pour s'effacer vite quand il monte.
 * - `exposition` : comme un œil ou un boîtier, on expose sur la lueur. Sa luminance à
 *   `SEPARATION_REFERENCE_LUEUR_DEG` du Soleil est ramenée à `LUEUR_CIBLE_EXPOSITION` : sans
 *   cela, le Mie dépasse le fond de deux ordres de grandeur et tout sature au blanc.
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
    poidsFond: poidsVue * affaiblissementCrepuscule(-altitudeSoleilDeg),
    exposition: yReference > 0 ? Math.min(1, K('LUEUR_CIBLE_EXPOSITION') / yReference) : 1,
  }
}

/**
 * T-0356 — couleur du ciel dans une direction (h, ρ), prête à encoder (canaux dans [0, 1]).
 *
 * Le fond et le Rayleigh, relevés par le halo d'horizon (`facteurHaloHorizon`) et rougis par
 * le trajet de visée selon leur poids, gardent la teinte du ciel : compression à teinte
 * constante. La lueur de Mie, rougie DEUX fois — par le trajet du Soleil jusqu'à la diffusion,
 * puis par celui de la diffusion jusqu'à l'œil —, s'y ajoute et sature canal par canal. Ce
 * second trajet ne dépend que de la hauteur visée : c'est lui qui étage le couchant en bandes,
 * orangé au ras de l'horizon, jaune, crème, puis le bleu du ciel.
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
 * Compression douce à teinte constante : le canal le plus vif passe par `compresseCanal`, les
 * deux autres suivent dans le même rapport. Pour le fond, dont la teinte est le ciel lui-même :
 * un horizon trois fois plus clair que le zénith reste bleu pâle, il ne blanchit pas.
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
 * Compression douce des hautes lumières, canal par canal : sous `GENOU_HAUTES_LUMIERES` un
 * canal passe tel quel, au-dessus il tend vers 1 (pente continue au genou). Comme un film
 * surexposé, le rouge d'un couchant arrive le premier au plafond, le vert le rejoint : l'orangé
 * passe au jaune puis au blanc en approchant du Soleil, sans jamais s'écrêter net.
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

/** Brillance du Soleil au zénith, en nanolamberts, pour cette dépression solaire. */
export function brillanceSoleilZenithNl(depressionSolaireDeg: number): number {
  return brillanceSoleilNl({
    altitudeSoleilDeg: -depressionSolaireDeg,
    altitudeCibleDeg: ANGLE_DROIT_DEG,
    separationDeg: ANGLE_DROIT_DEG + depressionSolaireDeg,
  })
}

/**
 * T-0099 — fond de ciel du site AU ZÉNITH, crépuscule et Soleil compris : c'est la valeur dont
 * la scène a besoin, parce que ses couches — teinte du fond, paliers de halo, contraste de la
 * bande, adaptation de l'œil — partent toutes du zénith et appliquent le halo d'horizon
 * elles-mêmes. Le halo solaire, lui, se peint par-dessus et retire ce terme avant de
 * s'ajouter (`dessineHaloSoleil`), comme le halo lunaire, que ce zénith n'inclut pas.
 */
export function sbZenithAvecCrepuscule(sbSiteMag: number, depressionSolaireDeg: number): number {
  const bCiel = nanolamberts(
    sbEffectifRendu({ sbSiteMag, hauteurDeg: ANGLE_DROIT_DEG, depressionSolaireDeg }),
  )
  return sbDepuisNanolamberts(bCiel + brillanceSoleilZenithNl(depressionSolaireDeg))
}
