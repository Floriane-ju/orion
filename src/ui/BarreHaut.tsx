/**
 * La barre haute : la marque, la visée, et les commandes.
 *
 * T-0113 — elle ne porte plus de réglage. Le mode nuit et le bouton info sont descendus en
 * bas à gauche de la scène, sous le rail de la vue (`BoutonModeNuit`, `BoutonInfo`) : la barre
 * ne garde que la marque et la visée.
 *
 * T-0153 — le tiroir des lectures est démonté. Il portait une phrase utile et quatre lectures
 * d'atelier ; la phrase est descendue au centre de la barre basse, où elle se lit sans un clic,
 * et la mention « az · h · champ » qui la répétait ici part avec elle.
 *
 * T-0180 — les trois boutons de panneau sont partis avec le tiroir qu'ils ouvraient : le mode
 * décide seul de ce que le panneau porte. Ne reste qu'une bascule à deux positions.
 *
 * T-0246 — cette bascule est descendue sur le panneau latéral, dont elle forme les onglets :
 * elle décide de ce qu'il porte, et c'est là qu'on la cherche.
 *
 * T-0184 — Vérification et Réglages ne font plus qu'un tiroir. Ils répondaient au même geste,
 * « ce qui sort du chemin principal », et l'enveloppe est donc unique : deux sections dedans,
 * la vérification d'abord parce qu'elle seule porte une conduite à tenir. L'alerte de
 * persistance remonte sur le tiroir fermé et NOMME sa section — une information qui n'existe
 * que pour qui pense à ouvrir un menu n'existe pas (§11.3).
 *
 * T-0228 — un tiroir « info » s'intercale avant celui des outils. Il ramasse la provenance des
 * données, qui était semée au contact des valeurs qu'elle couvre : elle ne change jamais d'une
 * cible à l'autre et n'arbitre rien, mais elle se relisait à chaque fiche ouverte. Avant les
 * réglages et non après — on ouvre un tiroir de réglages pour AGIR, celui-ci pour lire, et le
 * geste qui agit garde le bord droit que T-0184 lui a donné.
 *
 * T-0325 — les tiroirs « info » et « réglages » deviennent une page à part (`PageInfo`),
 * ouverte par un seul bouton « info », dernier de la barre. Leurs contenus se lisent en
 * longueur ; une fenêtre de tiroir les tenait sous un ascenseur.
 *
 * T-0325 — la légende des couleurs aussi : elle devient le premier accordéon de la modale.
 *
 * T-0325 — la profondeur affichée a quitté la barre pour la modale info, sous son titre :
 * elle se lit pour comprendre le champ, pas pour agir, et la barre ne garde que la visée et
 * les commandes.
 *
 * La barre basse est démontée : la phrase de visée était montée ici ; le lieu, lui, est
 * devenu la carte « Site » posée sur la scène.
 *
 * T-0411 — la barre porte le TEMPS : l'horloge, la frise de la nuit et le retour au présent,
 * en une rangée. La visée lui laisse la place et descend en bas à gauche de la scène, où se
 * posait la frise.
 */

import type { ReactNode } from 'react'

export interface BarreHautProps {
  /** T-0411 — l'horloge et la frise liées (`PanneauTemps`). */
  readonly temps: ReactNode
}

export function BarreHaut(props: BarreHautProps) {
  return (
    <>
      <h1>Orion</h1>
      {props.temps}
    </>
  )
}
