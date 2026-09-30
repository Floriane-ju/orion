/**
 * §6.1 — focale idéale d'une cible écartée, et §6.2 — verdict de cadrage par cible.
 *
 * Deux règles de produit portées ici plutôt que rappelées ailleurs :
 *
 *   1. une cible écartée l'est toujours AVEC SA CAUSE et avec la focale qui la rendrait
 *      cadrable — un refus muet n'apprend rien ;
 *   2. aucune compensation par recadrage logiciel n'est jamais proposée. Recadrer ne crée
 *      pas de pixels : un objet de 44 px de diamètre reste un objet de 44 px.
 */

import { K } from '../registry/constants.ts'
import { nombre } from '../registry/ecriture.ts'
import {
  RAPPORT_AXES_ORIENTATION,
  TABLE_CADRAGE,
  type VerdictCadrage,
} from '../registry/verdicts.ts'
import type { Traced } from './traced.ts'
import { trace } from './traced.ts'
import { DEG } from './mat3.ts'
import { ARCMIN_PAR_DEG, ARCSEC_PAR_ARCMIN, POURCENT } from './unites.ts'


export type { VerdictCadrage }

/**
 * Jamais proposé, et énoncé une seule fois : c'est la phrase qui remplace le réflexe
 * « je recadrerai au traitement ».
 */
export const REFUS_RECADRAGE_LOGICIEL =
  'Recadrer ensuite n’ajoute pas de détail : seule une focale plus longue aide.'

/**
 * Focale qui cadrerait proprement une cible donnée. La valeur vise le milieu de la fenêtre
 * C-05 ; la plage couvre la fenêtre entière, du tiers à la moitié du champ.
 */
export function focaleIdeale(tailleObjetDeg: number, capteurHMm: number): Traced<number> {
  const focalePour = (remplissage: number): number => {
    const fovDeg = tailleObjetDeg / remplissage
    return capteurHMm / (2 * Math.tan((fovDeg / 2) * DEG))
  }
  return trace({
    value: focalePour(K('REMPLISSAGE_CADRE_CIBLE')),
    formula: 'FOCALE_IDEALE',
    inputs: { taille_objet_deg: tailleObjetDeg, capteur_h_mm: capteurHMm },
    constants: ['REMPLISSAGE_CADRE_CIBLE', 'REMPLISSAGE_CADRE_MIN', 'REMPLISSAGE_CADRE_MAX'],
    range: [focalePour(K('REMPLISSAGE_CADRE_MIN')), focalePour(K('REMPLISSAGE_CADRE_MAX'))],
    note: REFUS_RECADRAGE_LOGICIEL,
  })
}

// ---------------------------------------------------------------------------
// §6.2 — verdict de cadrage par cible
// ---------------------------------------------------------------------------

export interface EntreeCadrage {
  readonly fovHDeg: number
  readonly echApx: number
  readonly capteurHMm: number
  readonly tailleMajArcmin: number
  readonly tailleMinArcmin?: number | null
  /** Angle de position du grand axe. Souvent absent du catalogue. */
  readonly posAngDeg?: number | null
  /**
   * §3.5 — champ de la grande dimension du capteur. Fourni avec `angleGrandAxeDeg`, il
   * oriente le remplissage : sans lui, la petite dimension reste seule à décider.
   */
  readonly fovLDeg?: number
  /**
   * Angle du grand axe de la cible dans les axes du capteur, roulis du boîtier compris.
   * `null` quand le catalogue ne permet pas de le calculer.
   */
  readonly angleGrandAxeDeg?: number | null
}

/**
 * §6.2 avec l'orientation du boîtier de §3.5 : la fraction du cadre réellement occupée est
 * celle de la BOÎTE ENGLOBANTE de la cible dans les axes du capteur.
 *
 * La corde du rectangle le long du grand axe donnerait, à 45°, plus de marge qu'un grand axe
 * aligné sur la grande dimension du capteur — physiquement faux, et sans marge pour la
 * rotation de champ ni les gradients de bord. La boîte englobante, elle, se réduit exactement
 * à « grand axe contre petite dimension » quand φ = 90° : c'est la forme sur laquelle la table
 * de §6.2 est calibrée, et tourner le boîtier de 90° change donc le verdict sans le décaler.
 *
 * Sans orientation exploitable, on retombe sur la petite dimension seule : c'est le cas
 * conservateur, et il ne prétend pas connaître un angle que le catalogue ne donne pas.
 */
function remplissageCadre(entree: EntreeCadrage): Traced<number> {
  const majDeg = entree.tailleMajArcmin / ARCMIN_PAR_DEG
  const phi = entree.angleGrandAxeDeg
  if (entree.fovLDeg === undefined || phi === null || phi === undefined) {
    return trace({
      value: majDeg / entree.fovHDeg,
      formula: 'REMPLISSAGE',
      inputs: { taille_objet_deg: majDeg, fov_h_deg: entree.fovHDeg },
    })
  }
  // Faute de petit axe au catalogue, la cible est tenue pour ronde — même hypothèse que
  // `orientation()`, qui ne suggère alors aucun angle.
  const minDeg =
    (entree.tailleMinArcmin === null || entree.tailleMinArcmin === undefined
      ? entree.tailleMajArcmin
      : entree.tailleMinArcmin) / ARCMIN_PAR_DEG
  // Boîte englobante d'une ELLIPSE, pas d'un rectangle : la cible est déjà modélisée en
  // ellipse par §6.3 (AIRE_ELLIPSE). La forme rectangulaire ferait grandir une cible ronde
  // d'un facteur √2 à 45°, ce qui est faux — un disque n'a pas d'orientation.
  const cos2 = Math.cos(phi * DEG) ** 2
  const sin2 = Math.sin(phi * DEG) ** 2
  const u = Math.sqrt(majDeg ** 2 * cos2 + minDeg ** 2 * sin2)
  const v = Math.sqrt(majDeg ** 2 * sin2 + minDeg ** 2 * cos2)
  return trace({
    value: Math.max(u / entree.fovLDeg, v / entree.fovHDeg),
    formula: 'REMPLISSAGE_ORIENTE',
    inputs: {
      maj_deg: majDeg,
      min_deg: minDeg,
      phi_deg: phi,
      fov_l_deg: entree.fovLDeg,
      fov_h_deg: entree.fovHDeg,
    },
  })
}

export interface FicheCadrage {
  readonly remplissage: Traced<number>
  readonly verdict: VerdictCadrage
  /** Faux dès que le verdict « faisable » doit être refusé, cause à l'appui. */
  readonly faisable: boolean
  readonly message: string
  readonly diamPx: Traced<number>
  /** Renseigné en mosaïque : le nombre de tuiles est aussi le facteur sur le temps total. */
  readonly nTuiles?: Traced<number>
  /** `null` quand le catalogue ne donne pas l'angle de position. */
  readonly angleBoitierDeg: number | null
  readonly noteOrientation: string
  /** Cause du refus, quand il y en a un : elle nomme toujours ce qui bloque. */
  readonly cause?: string
  /** Focale qui rendrait la cible cadrable, quand elle ne l'est pas. */
  readonly focaleIdealeMm?: Traced<number>
}

function orientation(
  tailleMajArcmin: number,
  tailleMinArcmin: number | null | undefined,
  posAngDeg: number | null | undefined,
): { readonly angleBoitierDeg: number | null; readonly noteOrientation: string } {
  const rapport =
    tailleMinArcmin === null || tailleMinArcmin === undefined || tailleMinArcmin === 0
      ? 1
      : tailleMajArcmin / tailleMinArcmin

  if (rapport <= RAPPORT_AXES_ORIENTATION) {
    return {
      angleBoitierDeg: null,
      noteOrientation:
        'Cible presque ronde : l’orientation du boîtier ne change rien.',
    }
  }
  if (posAngDeg === null || posAngDeg === undefined) {
    return {
      angleBoitierDeg: null,
      noteOrientation:
        'Cible allongée, orientation inconnue : pas d’angle conseillé.',
    }
  }
  return {
    angleBoitierDeg: posAngDeg,
    noteOrientation:
      `Cible allongée : tournez le boîtier à ${nombre(posAngDeg, 0)}° pour l’aligner sur la ` +
      'longueur du capteur.',
  }
}

/**
 * Taux de remplissage, orientation, mosaïque et « trop petit » pour une cible donnée.
 *
 * Le diamètre en pixels tranche indépendamment du remplissage : une cible peut occuper une
 * fraction acceptable du champ et rester un amas de pixels sans détail exploitable.
 */
export function ficheCadrage(entree: EntreeCadrage): FicheCadrage {
  const { echApx, capteurHMm, tailleMajArcmin } = entree
  const tailleObjetDeg = tailleMajArcmin / ARCMIN_PAR_DEG
  const remplissageTrace = remplissageCadre(entree)
  const remplissage = remplissageTrace.value
  const ligne = TABLE_CADRAGE.find((l) => remplissage >= l.remplissageMin) ?? TABLE_CADRAGE[TABLE_CADRAGE.length - 1]!
  const diamPx = (tailleMajArcmin * ARCSEC_PAR_ARCMIN) / echApx
  const tropPetitEnPixels = diamPx < K('DIAMETRE_PIXELS_MIN')
  const faisable = ligne.faisable && !tropPetitEnPixels

  const causes: string[] = []
  if (!ligne.faisable) {
    causes.push(
      `${ligne.message} Elle occupe ${nombre(remplissage * POURCENT, 2)} % du cadre.`,
    )
  }
  if (tropPetitEnPixels) {
    causes.push(
      `Seulement ${nombre(diamPx, 0)} px de large : aucun détail visible sous ` +
        `${K('DIAMETRE_PIXELS_MIN')} px.`,
    )
  }
  if (causes.length > 0) causes.push(REFUS_RECADRAGE_LOGICIEL)

  const nTuilesValeur =
    remplissage > 1
      ? Math.ceil(remplissage * (1 + K('RECOUVREMENT_MOSAIQUE'))) ** 2
      : null

  return {
    remplissage: remplissageTrace,
    verdict: ligne.verdict,
    faisable,
    message: ligne.message,
    diamPx: trace({
      value: diamPx,
      formula: 'DIAMETRE_PIXELS',
      inputs: { taille_objet_arcsec: tailleMajArcmin * ARCSEC_PAR_ARCMIN, ech_apx: echApx },
      constants: ['DIAMETRE_PIXELS_MIN'],
    }),
    ...(nTuilesValeur === null
      ? {}
      : {
          nTuiles: trace({
            value: nTuilesValeur,
            formula: 'NOMBRE_TUILES',
            inputs: { taille_objet_deg: tailleObjetDeg, fov_h_deg: entree.fovHDeg },
            constants: ['RECOUVREMENT_MOSAIQUE'],
            note:
              `${nTuilesValeur} fois plus de temps qu’une seule photo.`,
          }),
        }),
    ...orientation(tailleMajArcmin, entree.tailleMinArcmin, entree.posAngDeg),
    ...(faisable ? {} : { cause: causes.join(' ') }),
    ...(faisable ? {} : { focaleIdealeMm: focaleIdeale(tailleObjetDeg, capteurHMm) }),
  }
}
