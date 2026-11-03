/**
 * Input domains — « plage valide » column of PRD Entrées / Sorties tables (§4.1, §5.1, §5.2).
 * Beside §2.1 registry for same reason: PRD-declared values, not formula results. Engines cite
 * them instead of hardcoding bounds; a refusal always names the faulty field.
 */

import { nombreLibre } from './ecriture.ts'

export interface DomaineSaisie {
  /** Field label as user sees it, cited in refusals. */
  readonly champ: string
  readonly min: number
  readonly max: number
  readonly unite: string
  readonly section: string
  /** T-0335 — slider step for this domain; absent for keyboard-only field (nothing to tune). */
  readonly pas?: number
}

/** Generic so the type keeps what is declared: a domain with `pas` says so. */
function domaine<D extends DomaineSaisie>(d: D): Readonly<D> {
  return Object.freeze(d)
}

export const DOMAINES = Object.freeze({
  // §3.2 — time slider. T-0360: over these 2 centuries neither proper motions (§3.4) nor
  // ephemeris series (§3.1) are in question; app shows nothing beyond.
  annee_affichee: domaine({ champ: 'l’année affichée', min: 1900, max: 2100, unite: 'an', section: '3.2' }),

  // §4.1 — profil Lieu
  // Lieu steps = « Site » map drag: 0.01° (~1 km) per coordinate, 10 m altitude (what a hand
  // survey distinguishes).
  latitude_deg: domaine({ champ: 'la latitude', min: -90, max: 90, pas: 0.01, unite: '°', section: '4.1' }),
  longitude_deg: domaine({ champ: 'la longitude', min: -180, max: 180, pas: 0.01, unite: '°', section: '4.1' }),
  altitude_m: domaine({ champ: 'l’altitude', min: -400, max: 6000, pas: 10, unite: 'm', section: '4.1' }),
  sqm_mesure: domaine({ champ: 'le SQM mesuré', min: 16, max: 22, unite: 'mag/as²', section: '4.1' }),
  bortle_declare: domaine({ champ: 'le Bortle déclaré', min: 1, max: 9, pas: 1, unite: '—', section: '4.1' }),
  masque_horizon_deg: domaine({
    champ: 'le masque d’horizon',
    min: 0,
    max: 90,
    unite: '°',
    section: '4.1',
  }),
  // Azimuth wraps: 360° accepted = 0°, not a faulty input.
  azimut_masque_deg: domaine({
    champ: 'l’azimut du masque',
    min: 0,
    max: 360,
    unite: '°',
    section: '4.1',
  }),

  // §5.1 — profil optique et capteur
  focale_mm: domaine({ champ: 'la focale', min: 8, max: 4000, unite: 'mm', section: '5.1' }),
  // T-0404 — tenth: engraved-aperture step (f/4,5, f/5,6, f/6,3), where a zoom's floor rounds
  // toward the more closed.
  ouverture_N: domaine({ champ: 'l’ouverture', min: 0.95, max: 32, pas: 0.1, unite: 'f/N', section: '5.1' }),
  capteur_mm: domaine({
    champ: 'la dimension de capteur',
    min: 3,
    max: 60,
    unite: 'mm',
    section: '5.1',
  }),
  pitch_um: domaine({ champ: 'le pitch', min: 0.8, max: 24, unite: 'µm', section: '5.1' }),
  resolution_mpx: domaine({
    champ: 'la résolution',
    min: 1,
    max: 200,
    unite: 'Mpx',
    section: '5.1',
  }),
  // T-0202 — upper bound was 15 e⁻, refused real curves: Canon EOS RP / 6D Mark II reads 36,5 e⁻
  // at ISO 100. ISO-variant sensor pays dearly for base gain; optimal pose ∝ square: dropping it
  // would skew pose ×50. Source: Photons to Photos.
  read_noise_e: domaine({ champ: 'le bruit de lecture', min: 0.5, max: 40, unite: 'e⁻', section: '5.1' }),
  seuil_double_gain_iso: domaine({
    champ: 'le seuil de double gain',
    min: 100,
    max: 6400,
    unite: 'ISO',
    section: '5.1',
  }),
  zp_sys: domaine({ champ: 'le point zéro système', min: 18, max: 22, unite: 'mag', section: '5.1' }),
  taille_raw_mo: domaine({
    champ: 'le poids d’une image',
    min: 5,
    max: 120,
    unite: 'Mo',
    section: '5.1',
  }),

  iso_capture: domaine({ champ: 'l’ISO de capture', min: 100, max: 6400, unite: 'ISO', section: '7.2' }),

  // §6.3, §7.1 — détectabilité et flux
  m_int: domaine({ champ: 'la magnitude intégrée', min: -2, max: 20, pas: 0.5, unite: 'mag', section: '6.3' }),
  sb_ciel: domaine({
    champ: 'la brillance du fond de ciel',
    min: 16,
    max: 22,
    unite: 'mag/as²',
    section: '7.1',
  }),
  sb_obj: domaine({
    champ: 'la brillance de surface de l’objet',
    min: 16,
    max: 26,
    unite: 'mag/as²',
    section: '7.1',
  }),

  // §7.3 — objectif de qualité
  snr_cible: domaine({ champ: 'le rapport signal sur bruit visé', min: 5, max: 50, unite: '—', section: '7.3' }),

  // §5.2 — profil Suivi
  t_max_suivi_s: domaine({ champ: 'la pose maximale de suivi', min: 1, max: 240, unite: 's', section: '5.2' }),

  // §7.2 — preview pose unitaire. Upper bound = no-autoguiding cap (C-07): no mount of this
  // product holds the pose beyond.
  t_pose_s: domaine({ champ: 'la pose unitaire', min: 1, max: 240, pas: 1, unite: 's', section: '7.2' }),

  // §9.1 — déclinaison de la zone visée
  dec_deg: domaine({ champ: 'la déclinaison', min: -90, max: 90, unite: '°', section: '9.1' }),

  // §9.3 — T-0374: total shooting time, Panorama's only input. Starts at 1 s like pose unitaire:
  // below cadre's pose max it IS a single photo's pose. Upper bound = §9.3 filé's, 8 h.
  duree_prise_vue_s: domaine({
    champ: 'le temps de prise de vue',
    min: 1,
    max: 28800,
    pas: 1,
    unite: 's',
    section: '9.3',
  }),

  // §8.3 — C-15 scoring weights. Domain = RAW weight, pre-normalisation: only the sum of the
  // five equals 1, no weight alone is constrained further.
  poids_scoring: domaine({ champ: 'un poids de scoring', min: 0, max: 1, unite: '—', section: '8.3' }),
})

export type DomaineId = keyof typeof DOMAINES

/** Refused input: faulty field named, never corrected SILENTLY (§5.1). */
export class SaisieRefuseeError extends Error {
  readonly champ: DomaineId

  constructor(champ: DomaineId, message: string) {
    super(message)
    this.name = 'SaisieRefuseeError'
    this.champ = champ
  }
}

/**
 * T-0274 — typed TEXT becomes the NUMBER the domain checks.
 * Comma = French decimal notation, the only one a French-locale tablet numeric keypad offers:
 * refusing it blocked pose maximale and target list on a correct input. Displayed text not
 * rewritten, only the value read.
 */
export function nombreDeTexte(texte: string): number {
  // Empty field ≠ zero: `Number('')` is 0, and 0° is a place, not a blank.
  const nettoye = texte.trim()
  return nettoye === '' ? Number.NaN : Number(nettoye.replaceAll(',', '.'))
}

/** Expected format NAMED: a mute refusal lets user retype the same thing (T-0274). */
function refusIllisible(d: DomaineSaisie): string {
  return `Saisie refusée : ${d.champ} doit être un nombre — chiffres, point ou virgule décimale.`
}

/** Returns value if in domain, else throws naming it. */
export function valide(champ: DomaineId, valeur: number): number {
  const d = DOMAINES[champ]
  if (!Number.isFinite(valeur)) {
    throw new SaisieRefuseeError(champ, refusIllisible(d))
  }
  if (valeur < d.min || valeur > d.max) {
    throw new SaisieRefuseeError(
      champ,
      `Saisie refusée : ${d.champ} vaut ${nombreLibre(valeur)} ${d.unite}, hors de la plage ` +
        `${nombreLibre(d.min)} à ${nombreLibre(d.max)} ${d.unite}.`,
    )
  }
  return valeur
}

/**
 * What an input becomes once checked against its domain (T-0208).
 * INPUT boundary ≠ DATA boundary: a refused imported file can be fixed elsewhere, a typed value
 * must produce something now. So it is clamped and the correction is SAID (≠ silence).
 */
export interface Bornage {
  readonly valeur: number
  /** `null` if input was already in domain. */
  readonly refus: string | null
}

/**
 * Value clamped into its domain, plus the cause if it had to be (§4.1, §5.1).
 * Non-finite NOT clamped: a field cleared while retyping isn't a −90° latitude, clamping would
 * write a place nobody entered. Refusal propagates; last valid computation holds the screen
 * (T-0149).
 */
export function borne(champ: DomaineId, valeur: number): Bornage {
  const d = DOMAINES[champ]
  if (!Number.isFinite(valeur)) {
    return { valeur, refus: refusIllisible(d) }
  }
  if (valeur < d.min || valeur > d.max) {
    const retenue = valeur < d.min ? d.min : d.max
    return {
      valeur: retenue,
      refus:
        `Saisie hors plage : ${d.champ} vaut ${nombreLibre(valeur)} ${d.unite}, hors de la ` +
        `plage ${nombreLibre(d.min)} à ${nombreLibre(d.max)} ${d.unite} — ` +
        `${nombreLibre(retenue)} ${d.unite} retenu.`,
    }
  }
  return { valeur, refus: null }
}
