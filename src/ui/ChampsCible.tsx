/**
 * La carte magnitude et dimensions de la fiche : ce qu'on vise, et d'où viennent ses valeurs.
 *
 * T-0381 — sans titre : comme le résumé qui la précède, elle ne range rien, elle décrit.
 *
 * T-0156 — la cible ne se saisit plus. Elle venait du catalogue OU de la main, et le second
 * régime coûtait plus qu'il ne rendait : une magnitude retouchée produit un verdict dont
 * personne ne sait plus d'où il vient, et une cible sans coordonnées ne chiffre ni la Lune,
 * ni l'extinction, ni son image. Le catalogue embarqué compte plus de 13 000 objets et la
 * recherche porte sur son étendue entière : l'objet qui en manque est un cas théorique.
 *
 * Les valeurs sont donc des lectures, empruntant la ligne des grandeurs non tracées
 * (§6.4) : elles viennent d'OpenNGC, pas d'une formule, et rien ne s'y déplie. T-0158 —
 * les trois dimensions apparentes se rangent ensemble, sans sous-titre.
 *
 * T-0228 — la région ne dit plus d'où viennent ces valeurs. La provenance est la même à
 * chaque cible et n'arbitre rien ; elle se lit dans le tiroir « info » de la barre haute.
 *
 * T-0233 — le sous-titre « Dimensions » disparaît (redondant avec les libellés), et
 * « Grand axe » / « Petit axe » deviennent « Dimension grand axe » / « Dimension petit
 * axe » pour rester lisibles sans lui.
 *
 * T-0381 — la désignation et le type passent dans le résumé en tête de fiche : les redire ici
 * faisait lire deux fois les deux premières lignes.
 */

import type { ReactNode } from 'react'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { nombre } from '../registry/ecriture.ts'
import { Etiquette } from './Terme.tsx'
import { MENTION_DONNEE_MANQUANTE } from '../registry/libelles.ts'

/** §6.3 — ce que le catalogue ne porte pas se nomme, et aucune saisie n'y changera rien. */
export const MANQUANTE = MENTION_DONNEE_MANQUANTE

export interface ChampsCibleProps {
  readonly objet: ObjetCielProfond
}

export function Lecture({
  libelle,
  valeur,
}: {
  /** Un texte, ou une `Etiquette` quand le libellé porte sa bulle de glossaire. */
  readonly libelle: ReactNode
  readonly valeur: string
}) {
  return (
    <p className="tracee tracee-vide">
      <span>{libelle}</span>
      <span className="tracee-valeur">{valeur}</span>
    </p>
  )
}

/**
 * T-0381 — les dimensions que le catalogue porte réellement, résumées : grand axe × petit
 * axe sur une ligne, comme on les lit partout ailleurs. Une absente ne produit rien. L'angle
 * de position ne s'affiche plus : l'« Inclinaison objet » de la carte photo le porte déjà.
 */
function lignesDimensions(objet: ObjetCielProfond) {
  const axes = [objet.majAxArcmin, objet.minAxArcmin]
    .filter((axe) => axe !== null)
    .map((axe) => `${nombre(axe, 1)}’`)
  return axes.length === 0 ? [] : [{ libelle: 'Dimensions', valeur: axes.join(' × ') }]
}

/**
 * Les dimensions apparentes du catalogue. Une valeur absente ne s'affiche pas : OpenNGC en
 * manque souvent, et des lignes de « donnée manquante » occupent la place de trois lectures
 * sans rien en dire. Le vide complet, lui, se nomme une fois.
 */
function Dimensions({ objet }: ChampsCibleProps) {
  const lignes = lignesDimensions(objet)

  return (
    <>
      {lignes.length === 0 ? (
        <p className="etat">{MANQUANTE}</p>
      ) : (
        lignes.map((ligne) => (
          <Lecture key={ligne.libelle} libelle={ligne.libelle} valeur={ligne.valeur} />
        ))
      )}
    </>
  )
}

export function ChampsCible({ objet }: ChampsCibleProps) {
  return (
    <section>
      <p className="tracee tracee-vide">
        <span>
          <Etiquette cle="magnitude_integree" />
        </span>
        <span className="tracee-valeur">
          {objet.vMag === null ? MANQUANTE : objet.vMag}
        </span>
      </p>
      {/* T-0228 — plus de renvoi à OpenNGC sous les dimensions. Il ne changeait pas d'une
          cible à l'autre, ne décidait rien, et se relisait à chaque fiche ouverte : il est
          dans le tiroir « info », avec les autres provenances. */}
      <Dimensions objet={objet} />
    </section>
  )
}
