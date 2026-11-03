/**
 * §3.2 — time cursor and speed cap.
 *
 * Cap derives from LISIBILITÉ, not machine power. Fixed speed = smooth in wide view, unreadable
 * in tight view (classic planétarium error) → speed cursor coupled to zoom.
 * Real time condemned as ANIMATION: at 32 px/°, ×1 = 0,13 px/s. Hence 2 named speeds — ×150,
 * ×1500 — not a continuous cursor; real time stays the playback mode, never a scroll.
 */

import { K } from '../registry/constants.ts'
import { nombre } from '../registry/ecriture.ts'
import { trace, type Traced } from './traced.ts'
import { S_PAR_H } from './unites.ts'

export type ModeTemps = 'MAINTENANT' | 'FIGE' | 'DEFILEMENT'

export type EtatLisibilite = 'IMPERCEPTIBLE' | 'LISIBLE' | 'RAPIDE' | 'REPLIEMENT'

export function pxParDegre(largeurPx: number, fovDeg: number): number {
  return largeurPx / fovDeg
}

/** v_ecran = 15,041 × facteur × px_par_degre / 3600. */
export function vitesseEcran(facteurVitesse: number, pxParDeg: number): Traced<number> {
  return trace({
    value: (K('ROTATION_CIEL_DEG_H') * facteurVitesse * pxParDeg) / S_PAR_H,
    formula: 'VITESSE_ECRAN',
    inputs: { facteur: facteurVitesse, px_par_degre: pxParDeg },
    constants: ['ROTATION_CIEL_DEG_H'],
  })
}

/** facteur_max = 600 × 3600 / (15,041 × px_par_degre) — recomputed at each zoom. */
export function facteurMax(pxParDeg: number): Traced<number> {
  return trace({
    value: (K('V_ECRAN_REPLIEMENT_PX_S') * S_PAR_H) / (K('ROTATION_CIEL_DEG_H') * pxParDeg),
    formula: 'FACTEUR_VITESSE_MAX',
    inputs: { px_par_degre: pxParDeg },
    constants: ['V_ECRAN_REPLIEMENT_PX_S', 'ROTATION_CIEL_DEG_H'],
    note: 'Plus on zoome, plus la vitesse maximale baisse.',
  })
}

export function etatLisibilite(vEcranPxS: number): EtatLisibilite {
  const v = Math.abs(vEcranPxS)
  if (v < K('V_ECRAN_MIN_PERCEPTIBLE_PX_S')) return 'IMPERCEPTIBLE'
  if (v <= K('V_ECRAN_LISIBLE_MAX_PX_S')) return 'LISIBLE'
  if (v <= K('V_ECRAN_REPLIEMENT_PX_S')) return 'RAPIDE'
  return 'REPLIEMENT'
}

export interface ReglageVitesse {
  /** Retained factor, bounded by `facteurMax`. */
  readonly facteur: number
  readonly facteurMax: Traced<number>
  readonly vEcran: Traced<number>
  readonly etat: EtatLisibilite
  readonly pxParDegre: number
  /** True when the requested factor was brought under the cap. */
  readonly ajuste: boolean
  readonly message?: string
}

/** Applies lisibilité cap to requested factor. Adjustment is SIGNALLED: never corrects silently. */
export function reglageVitesse(
  facteurDemande: number,
  largeurPx: number,
  fovDeg: number,
): ReglageVitesse {
  const pxDeg = pxParDegre(largeurPx, fovDeg)
  const plafond = facteurMax(pxDeg)
  const borne = Math.min(Math.abs(facteurDemande), plafond.value)
  const facteur = Math.sign(facteurDemande) * borne
  const ajuste = Math.abs(facteurDemande) > plafond.value
  const vEcran = vitesseEcran(facteur, pxDeg)
  const etat = etatLisibilite(vEcran.value)

  const base = {
    facteur,
    facteurMax: plafond,
    vEcran,
    etat,
    pxParDegre: pxDeg,
    ajuste,
  }

  if (ajuste) {
    return {
      ...base,
      message:
        `Vitesse ramenée de ×${nombre(Math.abs(facteurDemande), 0)} à ` +
        `×${nombre(borne, 0)} : plus vite, le ciel deviendrait illisible à ce zoom.`,
    }
  }

  // Stays reachable in very wide view: cap high but px/° so low even the fast speed shows
  // nothing.
  if (etat === 'IMPERCEPTIBLE' && facteur !== 0) {
    return {
      ...base,
      message:
        `À ×${nombre(Math.abs(facteur), 0)}, le mouvement est invisible. Zoomez pour le voir.`,
    }
  }

  if (etat === 'RAPIDE') {
    return {
      ...base,
      message:
        'Défilement rapide : encore lisible, mais peu confortable.',
    }
  }

  return base
}
