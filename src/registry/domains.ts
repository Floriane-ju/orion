/**
 * Domaines de saisie — colonne « plage valide » des tableaux Entrées / Sorties du PRD
 * (§4.1, §5.1, §5.2).
 *
 * Ils vivent à côté du registre §2.1 pour la même raison que lui : ce sont des valeurs
 * déclarées par le PRD, pas des résultats de formule. Les moteurs les citent au lieu de
 * réécrire des bornes en dur, et un refus de saisie nomme toujours le champ fautif.
 */

export interface DomaineSaisie {
  /** Libellé du champ tel qu'il apparaît à l'utilisateur, cité dans le message de refus. */
  readonly champ: string
  readonly min: number
  readonly max: number
  readonly unite: string
  readonly section: string
  /**
   * T-0335 — le cran d'un curseur qui parcourt ce domaine. Absent pour un champ qui ne se tape
   * qu'au clavier : un pas n'y aurait rien à régler.
   */
  readonly pas?: number
}

/** Générique pour que le type garde ce qui est déclaré : un domaine qui porte un `pas` le dit. */
function domaine<D extends DomaineSaisie>(d: D): Readonly<D> {
  return Object.freeze(d)
}

export const DOMAINES = Object.freeze({
  // §4.1 — profil Lieu
  latitude_deg: domaine({ champ: 'la latitude', min: -90, max: 90, unite: '°', section: '4.1' }),
  longitude_deg: domaine({ champ: 'la longitude', min: -180, max: 180, unite: '°', section: '4.1' }),
  altitude_m: domaine({ champ: 'l’altitude', min: -400, max: 6000, unite: 'm', section: '4.1' }),
  sqm_mesure: domaine({ champ: 'le SQM mesuré', min: 16, max: 22, unite: 'mag/as²', section: '4.1' }),
  bortle_declare: domaine({ champ: 'le Bortle déclaré', min: 1, max: 9, unite: '—', section: '4.1' }),
  masque_horizon_deg: domaine({
    champ: 'le masque d’horizon',
    min: 0,
    max: 90,
    unite: '°',
    section: '4.1',
  }),
  // L'azimut se referme sur lui-même : 360° est accepté et vaut 0°, pas une saisie fautive.
  azimut_masque_deg: domaine({
    champ: 'l’azimut du masque',
    min: 0,
    max: 360,
    unite: '°',
    section: '4.1',
  }),

  // §5.1 — profil optique et capteur
  focale_mm: domaine({ champ: 'la focale', min: 8, max: 4000, unite: 'mm', section: '5.1' }),
  ouverture_N: domaine({ champ: 'l’ouverture', min: 0.95, max: 32, unite: 'f/N', section: '5.1' }),
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
  // T-0202 — la borne haute était à 15 e⁻ et refusait des courbes réelles : un Canon EOS RP ou
  // 6D Mark II lit 36,5 e⁻ à ISO 100. Un capteur ISO-variant paie cher son gain de base, et la
  // pose optimale varie comme le carré de cette valeur : l'écarter serait la fausser d'un
  // facteur cinquante. Source : Photons to Photos.
  read_noise_e: domaine({ champ: 'le bruit de lecture', min: 0.5, max: 40, unite: 'e⁻', section: '5.1' }),
  seuil_double_gain_iso: domaine({
    champ: 'le seuil de double gain',
    min: 100,
    max: 6400,
    unite: 'ISO',
    section: '5.1',
  }),
  // T-0202 — 200 000 e⁻ excluait le Sony α7S III, mesuré à 227 834 e⁻ : de très gros
  // photosites saturent tard, c'est leur raison d'être. Source : Photons to Photos.
  full_well_e: domaine({
    champ: 'la capacité de saturation',
    min: 5000,
    max: 250000,
    unite: 'e⁻',
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

  // §7.2 — pose unitaire de l'aperçu. La borne haute est le plafond sans autoguidage (C-07) :
  // au-delà, aucune monture de ce produit ne tient la pose.
  t_pose_s: domaine({ champ: 'la pose unitaire', min: 1, max: 240, pas: 1, unite: 's', section: '7.2' }),

  // §9.1 — déclinaison de la zone visée
  dec_deg: domaine({ champ: 'la déclinaison', min: -90, max: 90, unite: '°', section: '9.1' }),

  // §9.3 — durée d'accumulation du filé. Le PRD ouvre la plage à 5 min : en deçà, la trace
  // ne se lit plus comme un arc. Le curseur descend pourtant à 0, qui n'est pas un filé
  // court mais l'autre aperçu — une pose unique (§9.2). C'est une valeur hors domaine par
  // construction, et c'est pourquoi elle vaut zéro et non la borne basse.
  duree_file_min: domaine({
    champ: 'la durée du filé',
    min: 5,
    max: 480,
    pas: 5,
    unite: 'min',
    section: '9.3',
  }),

  // §8.3 — poids de scoring C-15. Le domaine porte le poids BRUT, avant normalisation :
  // seule la somme des cinq vaut 1, aucun poids pris isolément n'est contraint au-delà.
  poids_scoring: domaine({ champ: 'un poids de scoring', min: 0, max: 1, unite: '—', section: '8.3' }),
})

export type DomaineId = keyof typeof DOMAINES

/** Saisie refusée : le champ fautif est nommé, jamais corrigé EN SILENCE (§5.1). */
export class SaisieRefuseeError extends Error {
  readonly champ: DomaineId

  constructor(champ: DomaineId, message: string) {
    super(message)
    this.name = 'SaisieRefuseeError'
    this.champ = champ
  }
}

/**
 * T-0274 — le TEXTE tapé devient le NOMBRE que le domaine confronte.
 *
 * La virgule est l'écriture décimale française, et la seule que propose le clavier numérique
 * d'une tablette réglée en français : la refuser bloquait la pose maximale et la liste des
 * cibles sur une saisie correcte. Le texte affiché n'est pas réécrit, seule la valeur lue.
 */
export function nombreDeTexte(texte: string): number {
  // Un champ vide n'est pas un zéro : `Number('')` vaut 0, et 0° est un lieu, pas un vide.
  const nettoye = texte.trim()
  return nettoye === '' ? Number.NaN : Number(nettoye.replaceAll(',', '.'))
}

/** Le format attendu est NOMMÉ : un refus muet laisse retaper la même chose (T-0274). */
function refusIllisible(d: DomaineSaisie): string {
  return `Saisie refusée : ${d.champ} doit être un nombre — chiffres, point ou virgule décimale.`
}

/** Retourne la valeur si elle est dans le domaine, lève en la nommant sinon. */
export function valide(champ: DomaineId, valeur: number): number {
  const d = DOMAINES[champ]
  if (!Number.isFinite(valeur)) {
    throw new SaisieRefuseeError(champ, refusIllisible(d))
  }
  if (valeur < d.min || valeur > d.max) {
    throw new SaisieRefuseeError(
      champ,
      `Saisie refusée : ${d.champ} vaut ${valeur} ${d.unite}, hors de la plage ${d.min} à ` +
        `${d.max} ${d.unite}.`,
    )
  }
  return valeur
}

/**
 * Ce que devient une saisie une fois confrontée à son domaine (T-0208).
 *
 * La frontière de SAISIE ne refuse pas comme la frontière de DONNÉES : un fichier importé
 * qu'on refuse peut être corrigé ailleurs, une valeur tapée à l'écran doit produire quelque
 * chose tout de suite. Elle est donc ramenée dans son domaine, et la correction est DITE —
 * c'est ce qui la distingue d'un silence.
 */
export interface Bornage {
  readonly valeur: number
  /** `null` quand la saisie était déjà dans le domaine. */
  readonly refus: string | null
}

/**
 * La valeur ramenée dans son domaine, et la cause quand elle a dû l'être (§4.1, §5.1).
 *
 * Une valeur non finie n'est PAS bornée : un champ vidé le temps d'être retapé n'est pas une
 * latitude de −90°, et l'inventer écrirait un lieu que personne n'a saisi. Le refus remonte,
 * et c'est au dernier calcul valable de tenir l'écran (T-0149).
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
        `Saisie hors plage : ${d.champ} vaut ${valeur} ${d.unite}, hors de la plage ` +
        `${d.min} à ${d.max} ${d.unite} — ${retenue} ${d.unite} retenu.`,
    }
  }
  return { valeur, refus: null }
}
