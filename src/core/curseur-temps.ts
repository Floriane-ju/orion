/**
 * §3.2 — Curseur temporel et plafond de vitesse.
 *
 * Le plafond de défilement est dérivé de la LISIBILITÉ, pas de la puissance machine. Un
 * réglage de vitesse fixe produit une animation fluide en vue large et illisible en vue
 * serrée : c'est l'erreur classique des planétariums grand public. Ici, le curseur de
 * vitesse est couplé au zoom.
 *
 * Le chiffre qui condamne le temps réel comme ANIMATION : à 32 px/°, ×1 donne 0,13 px/s.
 * D'où deux vitesses nommées — ×150 et ×1500 — plutôt qu'un curseur continu à régler ; le
 * temps réel reste le mode de lecture, il n'est simplement jamais un défilement.
 */

import { K } from '../registry/constants.ts'
import { nombre } from '../registry/ecriture.ts'
import { trace, type Traced } from './traced.ts'

export type ModeTemps = 'MAINTENANT' | 'FIGE' | 'DEFILEMENT'

/**
 * Les deux vitesses du transport, au signe près. Le curseur continu de §3.2 était un réglage
 * à trouver ; deux crans nommés sont une commande. Le plafond, lui, ne bouge pas : ces
 * facteurs s'y écrêtent comme n'importe quel autre.
 */
export function facteurDefilement(rapide: boolean): number {
  return rapide ? K('FACTEUR_DEFILEMENT_RAPIDE') : K('FACTEUR_DEFILEMENT_NORMAL')
}

export type EtatLisibilite = 'IMPERCEPTIBLE' | 'LISIBLE' | 'RAPIDE' | 'REPLIEMENT'

export function pxParDegre(largeurPx: number, fovDeg: number): number {
  return largeurPx / fovDeg
}

/** v_ecran = 15,041 × facteur × px_par_degre / 3600. */
export function vitesseEcran(facteurVitesse: number, pxParDeg: number): Traced<number> {
  const S_PAR_H = 3600
  return trace({
    value: (K('ROTATION_CIEL_DEG_H') * facteurVitesse * pxParDeg) / S_PAR_H,
    formula: 'VITESSE_ECRAN',
    inputs: { facteur: facteurVitesse, px_par_degre: pxParDeg },
    constants: ['ROTATION_CIEL_DEG_H'],
  })
}

/** facteur_max = 600 × 3600 / (15,041 × px_par_degre) — recalculé à chaque zoom. */
export function facteurMax(pxParDeg: number): Traced<number> {
  const S_PAR_H = 3600
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
  /** Facteur retenu, borné par `facteurMax`. */
  readonly facteur: number
  readonly facteurMax: Traced<number>
  readonly vEcran: Traced<number>
  readonly etat: EtatLisibilite
  readonly pxParDegre: number
  /** Vrai quand le facteur demandé a été ramené sous le plafond. */
  readonly ajuste: boolean
  readonly message?: string
}

/**
 * Applique le plafond de lisibilité au facteur demandé. L'ajustement est SIGNALÉ : l'app
 * ne laisse jamais l'image se replier en silence, et elle ne corrige jamais sans le dire.
 */
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

  // Reste atteignable en vue très large, où le plafond est haut mais la densité de pixels
  // par degré si faible que même la vitesse rapide ne montre rien.
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
