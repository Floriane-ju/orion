/**
 * §11.2 — la coque : la scène occupe tout, le reste se pose dessus.
 *
 * T-0113 remplace les trois colonnes du lot 6. Les colonnes tenaient la promesse « la scène
 * au centre » mais lui laissaient la moitié de l'écran : sur une fenêtre de 1440 px, deux
 * panneaux de 20 et 24 rem prenaient 700 px, et un cadre de 0,8° se jugeait dans ce qui
 * restait. La scène prend maintenant toute la surface, et ce qui la commande vient dessus :
 *
 *   - la barre HAUTE nomme l'application, dit où pointe la vue et ouvre les panneaux — la
 *     barre basse, démontée, lui a laissé la légende et la phrase de visée ;
 *   - la carte SITE se pose en haut à gauche, à droite du rail : le lieu, résumé replié ;
 *   - le RAIL borde la scène à gauche et porte les bascules de la vue (T-0213) ;
 *   - les cartes du MATÉRIEL, Boîtier et Optique, se posent en haut à droite (T-0245) : c'est la
 *     saisie qu'on relit le plus, dépliée au démarrage, mais repliable quand elle est réglée ;
 *   - les CARTES portent le plan de nuit, repliable ;
 *   - la COLONNE DE DROITE porte le panneau du temps (T-0314) puis le panneau de séance : la
 *     date et l'heure coiffent ce qui se lit en longueur — le catalogue, le filé.
 *
 * La coque ne connaît aucun contenu : elle reçoit six régions et les place. C'est ce qui
 * permet de remplir, vider et redécouper les panneaux sans toucher à la mise en page.
 *
 * Le temps et le panneau de séance partagent UN conteneur plutôt que deux ancrages absolus :
 * c'est lui qui tient la largeur — les deux la partagent exactement, et le panneau du temps ne
 * se redimensionne jamais sous la main — et c'est le panneau de séance qui prend la hauteur
 * restante, quelle que soit celle du temps.
 *
 * L'ordre du DOM est l'ordre de tabulation : barre haute, scène, matériel, cartes, temps,
 * panneau, barre basse. Il suit la lecture, pas la position à l'écran — un panneau ouvert au
 * clavier depuis la barre haute est le nœud suivant, pas le dernier de la page.
 *
 * Sous le repli, tout redevient un flux vertical : les cartes se dépilent sous la scène et le
 * panneau derrière elles. Aucune media query en JavaScript — la feuille de style suffit,
 * puisque la position est la seule chose qui change.
 */

import { useEffect, type ReactNode } from 'react'

import { ancreTiroirs } from './tiroir-ancrage.ts'

export interface CoqueProps {
  /** Barre haute : identité, visée, bascules de panneau. */
  readonly topbar: ReactNode
  /** La scène. Elle occupe toute la coque, les autres régions se posent dessus. */
  readonly scene: ReactNode
  /** Le panneau du temps : la date, l'heure et le transport, en tête de la colonne de droite. */
  readonly temps: ReactNode
  /** Les cartes du matériel, posées sur la scène contre la colonne de droite. */
  readonly materiel: ReactNode
  /** Ce qui se pose sur la scène : le rail de la vue, puis la carte du plan de nuit. */
  readonly cartes: ReactNode
  /** Panneau de séance, sous le temps dans la même colonne. */
  readonly lateral: ReactNode
}

export function Coque(props: CoqueProps) {
  // T-0121 — les fenêtres de tiroir s'ouvrent sous leur bouton et se recalent sur l'écran.
  // C'est de la mise en page, donc de la coque ; l'écoute est unique et couvre la barre.
  useEffect(ancreTiroirs, [])

  return (
    <div className="coque">
      <header className="coque-topbar">{props.topbar}</header>
      <main className="coque-scene">{props.scene}</main>
      {props.materiel}
      <div className="coque-cartes">{props.cartes}</div>
      <div className="coque-droite">
        {props.temps}
        {props.lateral}
      </div>
    </div>
  )
}
