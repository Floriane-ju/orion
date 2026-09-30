/**
 * §6.4, §6.2 — l'image d'une cible : une découpe du relevé, son attribution, et le cadre du
 * capteur posé dessus.
 *
 * Une seule source, et c'est ce qui rend le cadre possible. Une image d'encyclopédie est
 * cadrée par son auteur : son champ angulaire n'est écrit nulle part, donc aucun rectangle ne
 * peut y être juste. La découpe, elle, est demandée à un champ choisi — et c'est ce champ qui
 * donne l'échelle. §6.4 décrit encore deux sources dans l'ordre inverse : l'écart est assumé,
 * son arbitrage ne se fait pas ici.
 *
 * Un refus subsiste, celui du plafond de poids : §12.3 passe avant une vignette.
 *
 * Un échec ne lève jamais. Une cible sans image reste une cible complète : c'est la
 * formulation de §12.5, et un message d'erreur ferait passer un agrément visuel manquant
 * pour une panne.
 */

import type { ObjetCielProfond } from './deepsky.ts'
import { ecritImage, litImage, type ImageStockee } from './db.ts'
import { modeReseauCourant } from './degradation.ts'
import {
  CHEMIN_DECOUPE,
  CREDIT_RELEVE,
  HOTE_DECOUPE,
  I,
  RELEVE_DECOUPE,
} from '../registry/imagerie.ts'
import { ARCMIN_PAR_DEG, POURCENT, QUART_TOUR_DEG as ANGLE_DROIT_DEG } from '../core/unites.ts'

const OCTETS_PAR_KO = 1024

/**
 * §6.4 — le champ de la découpe : la taille de l'objet, élargie par la marge du registre.
 *
 * Un objet de 71' et un objet de 2' ne se regardent pas au même champ. Une taille absente du
 * catalogue prend la valeur de repli nommée par le registre — et c'est aussi pourquoi aucun
 * cadre ne se dessine sur une cible sans dimensions : le champ serait une convention, pas une
 * mesure, et le rectangle mentirait.
 */
export function champDecoupeDeg(objet: ObjetCielProfond): number {
  const taille = objet.majAxArcmin
  if (taille === null || !(taille > 0)) return I('CHAMP_DECOUPE_DEFAUT_DEG')
  const brut = (taille / ARCMIN_PAR_DEG) * I('MARGE_CADRAGE_DECOUPE')
  return Math.min(Math.max(brut, I('CHAMP_DECOUPE_MIN_DEG')), I('CHAMP_DECOUPE_MAX_DEG'))
}

/** L'adresse de la découpe de relevé aux coordonnées de l'objet, au champ demandé. */
function urlDecoupeAuChamp(objet: ObjetCielProfond, champDeg: number): string {
  const cote = I('LARGEUR_VIGNETTE_PX')
  const parametres = new URLSearchParams({
    hips: RELEVE_DECOUPE,
    width: String(cote),
    height: String(cote),
    fov: String(champDeg),
    projection: 'TAN',
    coordsys: 'icrs',
    ra: String(objet.adDeg),
    dec: String(objet.decDeg),
    format: 'jpg',
  })
  return `${HOTE_DECOUPE}${CHEMIN_DECOUPE}?${parametres.toString()}`
}

/** La découpe qui illustre l'objet : cadrée sur sa taille (§6.4). */
export function urlDecoupe(objet: ObjetCielProfond): string {
  return urlDecoupeAuChamp(objet, champDecoupeDeg(objet))
}

/**
 * §13.1 — aucune requête ne dit d'où elle vient. Sans cela, le navigateur joint l'origine de
 * l'application à chaque appel : ce n'est ni un profil, ni un site, ni un plan, mais c'est une
 * information que rien n'oblige à transmettre, et la liste des origines énumère ce qui sort.
 */
const SANS_REFERENT: RequestInit = { referrerPolicy: 'no-referrer' }

async function octets(adresse: string): Promise<Blob | null> {
  const reponse = await fetch(adresse, SANS_REFERENT)
  if (!reponse.ok) return null
  const corps = await reponse.blob()
  if (!corps.type.startsWith('image/')) return null
  if (corps.size > I('POIDS_VIGNETTE_MAX_KO') * OCTETS_PAR_KO) return null
  return corps
}

/** Une découpe de relevé, rangée sous la désignation de l'objet. */
async function decoupe(designation: string, adresse: string): Promise<ImageStockee | null> {
  const corps = await octets(adresse)
  if (corps === null) return null
  return {
    designation,
    origine: 'RELEVE',
    octets: corps,
    credit: CREDIT_RELEVE,
    source: adresse,
    obtenueIso: new Date().toISOString(),
  }
}

/**
 * Les résolutions en vol, par désignation. Sans elles, la fiche et la vignette de liste
 * demandent deux fois la même image au même instant — et le service répond 429.
 */
const enVol = new Map<string, Promise<ImageStockee | null>>()

/**
 * L'image d'une cible : le cache d'abord, le réseau ensuite, jamais l'inverse.
 *
 * Hors réseau, l'absence de cache n'est pas une erreur : c'est la ligne §12.5 de cette
 * fonction, dont la dégradation nommée est le cadre schématique de §9.2, déjà rendu sur la
 * scène. En ligne, un échec de bout en bout rend `null` sans lever.
 */
export async function resoudImage(objet: ObjetCielProfond): Promise<ImageStockee | null> {
  const enCache = await litImage(objet.designation)
  // Une visite antérieure a pu ranger une image d'encyclopédie sous cette désignation. Son
  // champ n'est écrit nulle part : la resservir ferait poser le cadre à une échelle inventée.
  if (enCache !== null && enCache.origine === 'RELEVE') return enCache
  if (modeReseauCourant() === 'HORS_LIGNE') return null

  const dejaEnVol = enVol.get(objet.designation)
  if (dejaEnVol !== undefined) return dejaEnVol

  const resolution = (async () => {
    try {
      const image = await decoupe(objet.designation, urlDecoupe(objet))
      if (image !== null) await ecritImage(image)
      return image
    } catch {
      return null
    }
  })().finally(() => enVol.delete(objet.designation))

  enVol.set(objet.designation, resolution)
  return resolution
}

/** L'image d'une cible si elle est déjà rangée, sans jamais toucher au réseau (§6.4). */
export function imageEnCache(designation: string): Promise<ImageStockee | null> {
  return litImage(designation)
}

/**
 * §6.2 — le cadre du capteur, lu sur la découpe de l'objet.
 *
 * UNE SEULE FAÇON DE LE LIRE, QUEL QUE SOIT LE REMPLISSAGE
 *   Le cadre vit dans un encart, jamais en surimpression sur la grande image. Un rectangle
 *   posé sur la vue changeait de nature selon la cible — tantôt un cadre DANS l'image, tantôt
 *   une image DANS le cadre — et demandait un geste différent pour la même question. L'encart
 *   répond toujours à la même : voilà le cadre, voilà ce que la cible y occupe.
 *
 *   La formule s'en accommode sans cas particulier. `partObjetPct` passe au-dessus de cent
 *   quand la cible est plus grande que le cadre : la découpe déborde alors de l'encart et s'y
 *   fait couper, ce qui EST l'image d'une mosaïque — le cadre plein, l'objet qui sort.
 *
 * LE CADRE NE TOURNE PAS, L'IMAGE S'INCLINE
 *   Un cadre penché ne montre pas ce qu'un capteur donnera. La relation est la même dans
 *   l'autre sens et se lit mieux — c'est aussi ce qui est physiquement juste : quand on tourne
 *   le boîtier, c'est le ciel qui bascule dans le cadre.
 *
 *   Le signe vient de la projection. Une découpe en TAN a le Nord en haut et l'Est à gauche ;
 *   l'angle de position se compte du Nord vers l'Est, donc dans le sens trigonométrique à
 *   l'écran, quand `rotate()` en CSS tourne dans l'horaire. Un rectangle non tourné a son grand
 *   côté horizontal, ce qui correspond à un angle de position d'un quart de tour : le cadre se
 *   dessinerait à `90 − angle`, et le redresser incline l'image de `angle − 90`. Sur un capteur
 *   en portrait, le grand côté est déjà vertical et le quart de tour tombe.
 */
export interface CadreSurImage {
  /**
   * Part de la largeur de l'encart qu'occupe la découpe, en pourcent. Au-delà de cent, la
   * cible déborde du cadre : c'est le cas mosaïque, et l'encart le coupe.
   */
  readonly partObjetPct: number
  readonly rotationDeg: number
}

export function cadreSurImage(
  objet: ObjetCielProfond,
  fovLDeg: number,
  fovHDeg: number,
  angleBoitierDeg: number | null,
): CadreSurImage {
  return {
    partObjetPct: (champDecoupeDeg(objet) / fovLDeg) * POURCENT,
    rotationDeg:
      angleBoitierDeg === null
        ? 0
        : fovLDeg >= fovHDeg
          ? angleBoitierDeg - ANGLE_DROIT_DEG
          : angleBoitierDeg,
  }
}
