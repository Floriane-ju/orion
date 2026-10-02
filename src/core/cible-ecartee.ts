/**
 * §6.4, §8.3 — ce qu'une cible écartée demande pour ne plus l'être : le levier, pas le constat.
 *
 * Le moteur écarte une cible en nommant UNE cause, la première rencontrée — c'est son contrat,
 * et le plan n'en veut pas davantage. La carte de liste, elle, répond à « que faudrait-il
 * changer ? », et deux leviers s'y chiffrent : la focale (T-0379) et la date (T-0380). Ni l'un
 * ni l'autre ne réécrit la règle qui écarte : ils l'inversent, avec les mêmes bornes et le même
 * moteur de créneau, sans quoi la focale annoncée ou la nuit proposée pourraient être refusées
 * à leur tour.
 */

import { K } from '../registry/constants.ts'
import { DOMAINES } from '../registry/domains.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { creneauCible, type CauseExclusion } from './creneaux.ts'
import { fenetreNocturne } from './nuit.ts'
import { fenetreUtile } from './moon.ts'
import { prepareEvaluation } from './cibles-liste.ts'
import { bornesTailleCadre, creneauSousLaLune, entreeCreneau } from './session-candidates.ts'
import type { ContexteSession } from './session-types.ts'
import { MS_PAR_JOUR } from './horloges.ts'
import { DEG } from './mat3.ts'
import { ARCMIN_PAR_DEG, DEMI_TOUR_DEG } from './unites.ts'

/**
 * T-0379 — la focale qui remet le grand axe dans les bornes de `bornesTailleCadre`.
 *
 * Rectilinéaire toujours, même si l'objectif déclaré est un fisheye : une cible de ciel profond
 * trop petite pour un fisheye ne se rattrape pas en fisheye plus long, elle demande un autre
 * objectif — et c'est la focale de celui-là qu'on doit pouvoir lire.
 */
export type FocaleRequise =
  | { readonly sens: 'AU_MOINS' | 'AU_PLUS'; readonly focaleMm: number }
  /** Plus grand que le champ de la plus courte focale du domaine : mosaïque. */
  | { readonly sens: 'MOSAIQUE' }
  /** Plus petit que ce que la plus longue focale du domaine cadre sur ce capteur. */
  | { readonly sens: 'TROP_PETITE' }

/** Focale d'un champ rectilinéaire sur une dimension de capteur : l'inverse de `fovDeg`. */
function focalePourChamp(dimensionMm: number, champDeg: number): number {
  return dimensionMm / (2 * Math.tan((champDeg * DEG) / 2))
}

/** `null` quand la taille est dans les bornes, ou inconnue : la focale n'est pas le levier. */
export function focaleRequise(
  contexte: Pick<ContexteSession, 'fovHDeg' | 'capteurHMm'>,
  objet: ObjetCielProfond,
): FocaleRequise | null {
  const taille = objet.majAxArcmin
  if (taille === null) return null
  const { minArcmin, maxArcmin } = bornesTailleCadre(contexte.fovHDeg)
  const { min, max } = DOMAINES.focale_mm
  // Le champ voulu, déduit des bornes courantes par proportion : `minArcmin` est une part
  // fixe du champ, donc le champ qui place `taille` sur cette borne est champ × taille / min.
  if (taille < minArcmin) {
    const focaleMm = focalePourChamp(contexte.capteurHMm, (contexte.fovHDeg * taille) / minArcmin)
    return focaleMm > max ? { sens: 'TROP_PETITE' } : { sens: 'AU_MOINS', focaleMm }
  }
  if (taille > maxArcmin) {
    const champDeg = taille / ARCMIN_PAR_DEG
    // Un champ d'un demi-tour ou plus n'a pas de focale rectilinéaire.
    if (champDeg >= DEMI_TOUR_DEG) return { sens: 'MOSAIQUE' }
    const focaleMm = focalePourChamp(contexte.capteurHMm, champDeg)
    return focaleMm < min ? { sens: 'MOSAIQUE' } : { sens: 'AU_PLUS', focaleMm }
  }
  return null
}

/**
 * Ce qui refuse le créneau de cette nuit, indépendamment de la taille. Le moteur s'arrête à la
 * première cause — une cible trop petite n'atteint jamais le calcul de créneau —, la carte
 * veut les deux : changer de focale ne sert à rien si la cible est aussi de jour.
 *
 * `HORS_FENETRE` est la seule cause que la DATE lève ; relief et hauteur ne changent pas avec
 * la saison. `null` quand la nuit a un créneau, ou qu'il n'y a pas de nuit à tester.
 */
export interface ExclusionCreneau {
  readonly cause: CauseExclusion
  readonly message: string
}

export function exclusionCreneau(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
): ExclusionCreneau | null {
  const { debutReference: debut, finReference: fin } = contexte.nuit
  if (debut === null || fin === null) return null
  const creneau = creneauCible(entreeCreneau(contexte, objet, { debut, fin }))
  return creneau.causeExclusion === undefined
    ? null
    : { cause: creneau.causeExclusion, message: creneau.message }
}

/** L'instant le plus haut du créneau de la nuit qui suit `depart`, ou `null` s'il n'y en a pas. */
function creneauDeLaNuit(contexte: ContexteSession, objet: ObjetCielProfond, depart: Date): Date | null {
  const nuit = fenetreNocturne(contexte.site, depart)
  const { debutReference: debut, finReference: fin } = nuit
  if (debut === null || fin === null) return null
  const creneau = creneauCible(entreeCreneau(contexte, objet, { debut, fin }))
  if (creneau.causeExclusion !== undefined || creneau.dureeTotaleMin.value <= 0) return null
  return creneau.plusHaut.instant ?? debut
}

/**
 * T-0380 — la première nuit, après celle du contexte, où le moteur de créneau trouve un
 * créneau. Par pas de `PROCHAIN_CRENEAU_PAS_J` jours, puis affinée au jour dans le dernier
 * pas : une saison de visibilité dure des mois, un pas d'une semaine ne l'enjambe pas, et la
 * recherche coûte une quinzaine de nuits au lieu de trois cent soixante-cinq.
 *
 * Même moteur, mêmes critères que l'écart de créneau — la Lune n'y entre pas : une cible
 * écartée pour la Lune a sa propre recherche, `prochaineNuitSansLune`. `null` au-delà de `PROCHAIN_CRENEAU_HORIZON_J` (nuit polaire, cible
 * que la latitude ne montre que de jour).
 */
export function prochainCreneau(contexte: ContexteSession, objet: ObjetCielProfond): Date | null {
  const origine = contexte.nuit.leverSoleil ?? contexte.nuit.finReference
  if (origine === null) return null
  const pas = K('PROCHAIN_CRENEAU_PAS_J')
  const horizon = K('PROCHAIN_CRENEAU_HORIZON_J')
  const departJour = (j: number) => new Date(origine.getTime() + j * MS_PAR_JOUR)

  for (let j = pas; j <= horizon + pas; j += pas) {
    const jour = Math.min(j, horizon)
    if (creneauDeLaNuit(contexte, objet, departJour(jour)) === null) continue
    // La première nuit ouverte est dans le pas qui vient de s'ouvrir : on la cherche au jour.
    for (let k = Math.max(jour - pas + 1, 1); k <= jour; k++) {
      const instant = creneauDeLaNuit(contexte, objet, departJour(k))
      if (instant !== null) return instant
    }
  }
  return null
}

/**
 * T-0382 — la première nuit, après celle du contexte, où une cible écartée pour la Lune ne
 * l'est plus. Même porte que l'écart (`creneauSousLaLune`, fenêtre utile de CETTE nuit) : la
 * nuit proposée ne peut pas être refusée à son tour pour la Lune.
 *
 * Au jour près, sans pas plus large : la Lune avance de douze degrés par nuit, une semaine
 * enjamberait toute la fenêtre noire. `null` au-delà d'un cycle lunaire.
 */
export function prochaineNuitSansLune(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
): Date | null {
  const origine = contexte.nuit.leverSoleil ?? contexte.nuit.finReference
  if (origine === null) return null
  for (let j = 1; j <= K('PROCHAINE_NUIT_SANS_LUNE_HORIZON_J'); j++) {
    const nuit = fenetreNocturne(contexte.site, new Date(origine.getTime() + j * MS_PAR_JOUR))
    const ceSoir: ContexteSession = {
      ...contexte,
      nuit,
      fenetreUtile: fenetreUtile(contexte.site, nuit),
    }
    const entree = prepareEvaluation(ceSoir)
    if (entree === null) continue
    const { creneau, exclusionLune } = creneauSousLaLune(
      ceSoir,
      objet,
      entree.fenetre,
      entree.sbCielBase,
    )
    if (exclusionLune !== null) continue
    if (creneau.causeExclusion !== undefined || creneau.dureeTotaleMin.value <= 0) continue
    return creneau.plusHaut.instant ?? entree.fenetre.debut
  }
  return null
}
