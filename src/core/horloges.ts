/**
 * §3.1 — Pipeline temporel à deux horloges.
 *
 *   horloge_rendu       60 Hz, produit une image
 *   horloge_ephemerides 10 Hz, produit des positions
 *
 * Le découplage n'est pas une optimisation prématurée : sans lui, chaque image exigerait
 * une évaluation complète des séries planétaires, ce qui plafonne le rendu à quelques
 * images par seconde et rend l'animation saccadée — donc pire que le mode discret.
 *
 * Les étoiles ne sont JAMAIS interpolées : elles sont fixes dans le référentiel équatorial,
 * seule la matrice de rotation change. Les corps mobiles, eux, sont interpolés linéairement
 * entre deux échantillons.
 */

import { K } from '../registry/constants.ts'
import {
  CORPS_MOBILES,
  dansLeDomaineDesSeries,
  positionCorps,
  tempsSideralLocal,
  type PositionCorps,
  type Site,
} from './ephem.ts'
import { DEG, multiplie, rotationX, rotationZ, type Mat3, type Vec3 } from './mat3.ts'
import { trace, type Traced } from './traced.ts'
import { DEG_PAR_HEURE, ecartCourt, encadre, HEURES_PAR_TOUR, MS_PAR_MINUTE, MS_PAR_S, ramene, TOUR_DEG } from './unites.ts'


export const MS_PAR_JOUR = K('JOUR_SOLAIRE_S') * MS_PAR_S
/** J2000,0 tombe à midi, soit une demi-journée après le début du 1er janvier 2000. */
const EPOQUE_J2000_MS = Date.UTC(K('EPOQUE_J2000_ANNEE'), 0, 1) + MS_PAR_JOUR / 2

/** Époque d'affichage en année fractionnaire — c'est elle qui pilote la précession. */
export function epoqueAnnee(date: Date): number {
  return (
    K('EPOQUE_J2000_ANNEE') +
    (date.getTime() - EPOQUE_J2000_MS) / MS_PAR_JOUR / K('ANNEE_JULIENNE_J')
  )
}

/**
 * Précession générale de J2000 vers l'époque donnée, en rotation autour du pôle de
 * l'écliptique. Recalculée à chaque changement d'année entière, jamais à chaque image :
 * en un an, le décalage vaut 50,29", très en dessous du pixel.
 */
export function matricePrecession(anneeEpoque: number): Mat3 {
  const ARCSEC_PAR_DEGRE = 3600
  const psiDeg = (K('PRECESSION_ARCSEC_AN') * (anneeEpoque - K('EPOQUE_J2000_ANNEE'))) / ARCSEC_PAR_DEGRE
  const obliquite = K('OBLIQUITE_J2000_DEG')
  return multiplie(rotationX(-obliquite), multiplie(rotationZ(psiDeg), rotationX(obliquite)))
}

let precessionMemo: { annee: number; matrice: Mat3 } | null = null

/** Même matrice, mémoïsée sur l'année entière : le recalcul par image est inutile (§3.1). */
export function matricePrecessionAnnee(anneeEpoque: number): Mat3 {
  const annee = Math.round(anneeEpoque)
  if (precessionMemo === null || precessionMemo.annee !== annee) {
    precessionMemo = { annee, matrice: matricePrecession(annee) }
  }
  return precessionMemo.matrice
}

/**
 * Direction J2000 du pôle céleste NORD DE L'ÉPOQUE — l'axe autour duquel le ciel tourne
 * réellement, et donc le centre exact des arcs de filé (§9.3). La rotation terrestre s'applique
 * après la précession : l'axe est la troisième ligne de la matrice de précession.
 */
export function axePoleDeDate(anneeEpoque: number): Vec3 {
  const [, , , , , , x, y, z] = matricePrecessionAnnee(anneeEpoque)
  return { x, y, z }
}

/**
 * Du repère d'angle horaire au repère horizontal du site : x vers le nord, y vers l'est,
 * z au zénith. Le triède est gaucher, comme l'est la convention d'azimut comptée du nord
 * vers l'est ; la matrice reste orthogonale, donc son inverse reste sa transposée.
 */
export function matriceHorizon(latitudeDeg: number): Mat3 {
  const sin = Math.sin(latitudeDeg * DEG)
  const cos = Math.cos(latitudeDeg * DEG)
  return [-sin, 0, cos, 0, 1, 0, cos, 0, sin]
}

export interface CielInstantane {
  /** J2000 équatorial → repère horizontal du site (x nord, y est, z zénith). */
  readonly matrice: Mat3
  readonly tslH: Traced<number>
  /** Sortie de diagnostic §3.1, exprimée avec le taux A-ROT du PRD. */
  readonly angleRotationDeg: Traced<number>
  readonly epoqueAnnee: number
  readonly precessionDeg: Traced<number>
  /** Vrai quand la date sort du domaine des séries : les corps mobiles sont masqués. */
  readonly corpsMasques: boolean
  readonly cause?: string
}

/**
 * La matrice unique de l'image (§3.1). Elle compose, dans cet ordre d'application :
 * précession J2000 → époque, rotation terrestre par le temps sidéral local, basculement
 * à la latitude du site.
 */
export function cielInstantane(site: Site, date: Date): CielInstantane {
  const tslH = tempsSideralLocal(date, site.longitudeDeg)
  const annee = epoqueAnnee(date)
  const ARCSEC_PAR_DEGRE = 3600

  // 24 h sidérales font exactement un tour : un changement d'unité, distinct du taux A-ROT
  // (15,041 °/h de temps SOLAIRE) que §3.2 consomme pour la lisibilité.
  const rotationTerre = rotationZ(-tslH.value * DEG_PAR_HEURE)
  const matrice = multiplie(
    matriceHorizon(site.latitudeDeg),
    multiplie(rotationTerre, matricePrecessionAnnee(annee)),
  )

  const masques = !dansLeDomaineDesSeries(date)

  return {
    matrice,
    tslH,
    angleRotationDeg: trace({
      value: tslH.value * K('ROTATION_CIEL_DEG_H'),
      formula: 'ANGLE_ROTATION_CIEL',
      inputs: { tsl_h: tslH.value },
      constants: ['ROTATION_CIEL_DEG_H'],
    }),
    epoqueAnnee: annee,
    precessionDeg: trace({
      value: (K('PRECESSION_ARCSEC_AN') * (Math.round(annee) - K('EPOQUE_J2000_ANNEE'))) / ARCSEC_PAR_DEGRE,
      formula: 'PRECESSION',
      inputs: { n_annees: Math.round(annee) - K('EPOQUE_J2000_ANNEE') },
      constants: ['PRECESSION_ARCSEC_AN'],
      note: 'Positions des étoiles corrigées pour la date affichée.',
    }),
    corpsMasques: masques,
    ...(masques
      ? {
          cause:
            `Année hors de ${K('ANNEE_MIN_SERIES')}–${K('ANNEE_MAX_SERIES')} : Soleil, Lune ` +
            'et planètes masqués.',
        }
      : {}),
  }
}

/**
 * T-0336 — la matrice du ciel à une minute ENTIÈRE (minutes depuis l'époque Unix) : c'est la
 * granularité à laquelle les panneaux s'abonnent à l'horloge de la scène.
 */
export function matriceALaMinute(site: Site, minute: number): Mat3 {
  return cielInstantane(site, new Date(minute * MS_PAR_MINUTE)).matrice
}

/**
 * Avertissement de §3.4 : au-delà de l'horizon des mouvements propres, les figures restent
 * reliées aux mêmes étoiles, mais le dessin qu'elles formaient n'a plus de sens.
 */
export function avertissementEpoque(anneeEpoque: number): string | null {
  const ecart = Math.abs(anneeEpoque - K('EPOQUE_J2000_ANNEE'))
  const arrondi = Math.round(ecart)
  if (ecart <= K('HORIZON_MOUVEMENTS_PROPRES_AN')) return null
  return (
    `À ${arrondi} ans de l’an 2000, les étoiles ont bougé : les figures des constellations ` +
    'ne sont plus fidèles.'
  )
}

// ---------------------------------------------------------------------------
// Horloge d'éphémérides — corps mobiles
// ---------------------------------------------------------------------------

/** Deux échantillons encadrant l'instant affiché, à la fréquence de l'horloge lente. */
export interface EtatEphemerides {
  readonly pasMs: number
  readonly t0Ms: number
  readonly p0: readonly PositionCorps[]
  readonly t1Ms: number
  readonly p1: readonly PositionCorps[]
}

function echantillonne(site: Site, dateMs: number): readonly PositionCorps[] {
  const date = new Date(dateMs)
  if (!dansLeDomaineDesSeries(date)) return []
  return CORPS_MOBILES.map((corps) => positionCorps(corps, date, site))
}

/**
 * Pas de l'horloge d'éphémérides, exprimé en temps AFFICHÉ.
 *
 * La fréquence de 10 Hz est celle du temps réel : c'est là que se joue le budget de calcul.
 * En temps affiché, le pas s'étire donc du facteur de défilement. À ×3600, un dixième de
 * seconde réelle vaut six minutes de ciel, et la Lune — corps le plus rapide, ≈ 0,55 °/h —
 * y parcourt 0,055°, soit environ 1,8 px à 32 px/° : invisible.
 */
export function pasEphemeridesMs(
  facteurVitesse: number,
  freqHz: number = K('FREQ_EPHEMERIDES_HZ'),
): number {
  return (MS_PAR_S / freqHz) * Math.max(1, Math.abs(facteurVitesse))
}

/**
 * Avance l'horloge lente jusqu'à encadrer `dateMs`, en réutilisant l'échantillon déjà
 * calculé quand le pas suivant est celui déjà en main. C'est ce recyclage qui rend le
 * découplage utile : à 60 Hz d'affichage et 10 Hz d'éphémérides, cinq images sur six ne
 * déclenchent aucune évaluation de série.
 */
export function avanceEphemerides(
  precedent: EtatEphemerides | null,
  site: Site,
  dateMs: number,
  pasMs: number = pasEphemeridesMs(1),
): EtatEphemerides {
  const t0Ms = Math.floor(dateMs / pasMs) * pasMs
  const t1Ms = t0Ms + pasMs

  if (precedent !== null && precedent.pasMs === pasMs) {
    if (precedent.t0Ms === t0Ms) return precedent
    if (precedent.t1Ms === t0Ms) {
      return { pasMs, t0Ms, p0: precedent.p1, t1Ms, p1: echantillonne(site, t1Ms) }
    }
    if (precedent.t0Ms === t1Ms) {
      return { pasMs, t0Ms, p0: echantillonne(site, t0Ms), t1Ms, p1: precedent.p0 }
    }
  }
  return {
    pasMs,
    t0Ms,
    p0: echantillonne(site, t0Ms),
    t1Ms,
    p1: echantillonne(site, t1Ms),
  }
}

function interpoleAngle(a: number, b: number, f: number, tour: number): number {
  // L'ascension droite repasse par zéro : on interpole par le plus court chemin.
  return ramene(a + ecartCourt(a, b, tour) * f, tour)
}

/**
 * Positions des corps mobiles à l'instant affiché, interpolées entre les deux échantillons.
 * Retourne une liste vide quand la date sort du domaine des séries : les corps sont masqués,
 * la cause est portée par `cielInstantane`.
 */
export function positionsInterpolees(
  etat: EtatEphemerides,
  dateMs: number,
): readonly PositionCorps[] {
  if (etat.p0.length === 0 || etat.p1.length === 0) return []
  const f = encadre((dateMs - etat.t0Ms) / (etat.t1Ms - etat.t0Ms), 0, 1)
  return etat.p0.map((a, i) => {
    const b = etat.p1[i] ?? a
    return {
      corps: a.corps,
      adH: interpoleAngle(a.adH, b.adH, f, HEURES_PAR_TOUR),
      decDeg: a.decDeg + (b.decDeg - a.decDeg) * f,
      azimutDeg: interpoleAngle(a.azimutDeg, b.azimutDeg, f, TOUR_DEG),
      hauteurDeg: a.hauteurDeg + (b.hauteurDeg - a.hauteurDeg) * f,
    }
  })
}

// L'interpolation n'a pas de trace §10.2 : aucun écran n'affiche le facteur f, et une
// trace jamais dépliée ment sur ce qui est expliqué. La formule reste au formulaire de
// l'Annexe B sous `INTERPOLATION_CORPS` ; y brancher un `trace()` le jour où un écran
// la montre (T-0063).
