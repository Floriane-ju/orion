/**
 * §6.4, §8.3 — la carte d'une cible écartée : pourquoi, et le levier qui la ferait revenir.
 *
 * T-0379 — un refus de cadrage se dit en FOCALE, pas en minutes d'arc : « votre cadre
 * convient de 19’ à 95’ » est juste, mais c'est la focale qu'on change.
 * T-0380 — une cible hors saison se dit hors saison, et offre la nuit où elle revient.
 *
 * Aucun calcul ici : la focale et la saison viennent de `cible-ecartee.ts`, qui inverse les
 * règles du moteur qui écarte. Le prochain créneau ne se cherche qu'au CLIC — une quinzaine de
 * nuits d'éphémérides par carte, multipliées par deux cents cartes, gèleraient la liste.
 */

import { useState } from 'react'
import type { EtatCible } from '../core/cibles-liste.ts'
import {
  exclusionCreneau,
  focaleRequise,
  prochainCreneau,
  type ExclusionCreneau,
  type FocaleRequise,
} from '../core/cible-ecartee.ts'
import type { CauseEcart } from '../core/session.ts'
import type { ContexteSession } from '../core/session.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { nombre } from '../registry/ecriture.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { vaA } from './scene-etat.ts'
import { cadreScene } from './BoutonCadrer.tsx'
import type { ProfilCadre } from '../core/cadre.ts'
import { coordonneesHorizon } from '../core/cibles-liste.ts'
import { matriceALaMinute } from '../core/horloges.ts'
import { MS_PAR_MINUTE } from '../core/unites.ts'

export const HORS_SAISON = 'Invisible aujourd’hui'
/**
 * Trop basse ou jamais levée : pour qui regarde la carte, c'est la même réponse — ce site ne la
 * montre pas assez haut, et ni la focale ni la date n'y changent rien. La hauteur exacte reste
 * sur la fiche.
 */
export const NON_PHOTOGRAPHIABLE_ICI = 'Non photographiable d’ici'
export const AUCUN_CRENEAU = 'Aucun créneau de nuit dans l’année qui vient'

/** Arrondi du côté qui tient la promesse : « au moins » vers le haut, « au plus » vers le bas. */
export function phraseFocale(f: FocaleRequise): string {
  switch (f.sens) {
    case 'AU_MOINS':
      return `Focale min ${nombre(Math.ceil(f.focaleMm), 0)} mm`
    case 'AU_PLUS':
      return `Focale max ${nombre(Math.floor(f.focaleMm), 0)} mm`
    case 'MOSAIQUE':
      return 'Mosaïque requise'
    case 'TROP_PETITE':
      return 'Trop petite pour ce capteur'
  }
}

/** Les codes dont le créneau peut cacher une seconde cause : ce sont ceux où il n'a pas tranché. */
const CRENEAU_A_TESTER: ReadonlySet<CauseEcart | null> = new Set(['CADRAGE', 'HAUTEUR', 'RELIEF', 'FENETRE'])

/**
 * Les phrases de la carte, TOUTES les causes et pas seulement la première : la taille, puis le
 * créneau — dans l'ordre où on agit, le matériel puis la date. Une cause sans levier chiffré
 * garde la phrase du moteur.
 *
 * Suivi et donnée manquante ferment tout le reste : ils ne se combinent pas, leur phrase suffit.
 */
export function causesCarte(
  contexte: ContexteSession,
  objet: ObjetCielProfond,
  etat: EtatCible,
): { readonly phrases: readonly string[]; readonly horsSaison: boolean } {
  if (!CRENEAU_A_TESTER.has(etat.code)) {
    return { phrases: etat.cause === null ? [] : [etat.cause], horsSaison: false }
  }
  const focale = focaleRequise(contexte, objet)
  const creneau = exclusionCreneau(contexte, objet)
  const horsSaison = creneau?.cause === 'HORS_FENETRE'
  const phrases = [
    focale !== null ? phraseFocale(focale) : null,
    creneau === null ? null : phraseCreneau(creneau),
  ].filter((p): p is string => p !== null)
  // Ni la taille ni le créneau n'expliquent l'écart (un verdict de cadrage autre que la taille,
  // un créneau trop court) : la phrase du moteur, seule à le savoir.
  return {
    phrases:
      phrases.length > 0 || etat.cause === null
        ? phrases
        : [etat.code === 'HAUTEUR' ? NON_PHOTOGRAPHIABLE_ICI : etat.cause],
    horsSaison,
  }
}

function phraseCreneau({ cause, message }: ExclusionCreneau): string {
  if (cause === 'HORS_FENETRE') return HORS_SAISON
  if (cause === 'HAUTEUR' || cause === 'JAMAIS_LEVE') return NON_PHOTOGRAPHIABLE_ICI
  return message
}

/** Les phrases viennent de `causesCarte`, calculées une fois par la carte qui décide aussi du pied. */
export function CibleImpossible({ phrases }: { readonly phrases: readonly string[] }) {
  return (
    <span className="cible-impossible">
      <span className="cible-impossible-titre">Photographie impossible</span>
      {phrases.map((p) => (
        <span key={p} className="cible-cause">
          {p}
        </span>
      ))}
    </span>
  )
}

/**
 * Hors du bouton de fiche, comme « Cadrer » : un `<button>` ne s'imbrique pas. C'est pourquoi
 * la phrase « hors saison » quitte le corps de la carte pour le pied : elle s'y pose sur la
 * même ligne que le bouton qui la lève. Glyphe seul, la bulle nomme le geste. Sans créneau
 * dans l'année, le bouton le DIT et s'éteint — un clic qui ne fait rien serait un mensonge.
 */
export interface BoutonProchainCreneauProps {
  readonly objet: ObjetCielProfond
  readonly contexte: ContexteSession
  /** Pour cadrer la cible à l'arrivée, comme le fait « Cadrer ». */
  readonly profil: ProfilCadre | undefined
  readonly gaiaCharge: boolean
}

export function BoutonProchainCreneau({
  objet,
  contexte,
  profil,
  gaiaCharge,
}: BoutonProchainCreneauProps) {
  const [introuvable, setIntrouvable] = useState(false)
  return (
    <BoutonGlyphe
      icone="fast_forward"
      aide={introuvable ? AUCUN_CRENEAU : 'Prochain créneau'}
      place="gauche"
      eteinte={introuvable}
      onClick={() => {
        if (introuvable) return
        const instant = prochainCreneau(contexte, objet)
        if (instant === null) {
          setIntrouvable(true)
          return
        }
        vaA(instant.getTime())
        // La direction À CET INSTANT-LÀ, pas à l'instant quitté : la cible y est au plus haut.
        const matrice = matriceALaMinute(contexte.site, Math.floor(instant.getTime() / MS_PAR_MINUTE))
        const { azimutDeg, hauteurDeg } = coordonneesHorizon(objet, matrice)
        cadreScene(azimutDeg, hauteurDeg, profil, gaiaCharge)
      }}
    />
  )
}
