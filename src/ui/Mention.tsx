/**
 * T-0215 — la phrase qui commente une valeur : un état, une cause, une erreur.
 *
 * §11.1 — LE ROUGE NE PORTE JAMAIS SEUL. Une cause et une erreur se distinguent aussi par
 * leur forme : le cadre, la barre latérale épaisse, et un SIGNE en tête. Ce signe était
 * « ⚠ » posé en `content` par la feuille de style, donc rendu dans la police de TEXTE et
 * échappant à `.icone` — une seconde façon d'afficher une icône dans un projet qui n'en
 * autorise qu'une, et un second endroit à toucher le jour où l'épaisseur des glyphes change.
 * Il passe désormais par `Icone`, comme tout le reste.
 *
 * POURQUOI UNE PROP `ton` ET NON UN COMPOSANT PAR CLASSE. Treize des quarante-six sites
 * basculent à l'exécution entre l'alerte et l'état simple — `plan.budget.tient ? 'etat' :
 * 'cause'`. Un composant qui ne rendrait que l'alerte obligerait chacun d'eux à écrire deux
 * fois son contenu de part et d'autre d'un ternaire. La distinction entre les quatre tons
 * survit dans l'API et dans le DOM : ce sont bien quatre classes, pas une avec des variantes.
 *
 * Le glyphe reste `aria-hidden` — c'est le défaut d'`Icone`. Il double une couleur, et une
 * couleur n'est pas annoncée : le texte de la phrase porte déjà tout le sens.
 */

import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Icone } from './Icone.tsx'

/**
 * Les classes que ces phrases portent dans la feuille. T-0374 — `conseil` : un geste à faire
 * avant de partir, encadré comme une alerte mais en gris, avec le signe « info ». Ce n'est pas
 * une faute de l'utilisateur, et le rouge le lui aurait reproché.
 */
export type TonMention = 'etat' | 'cause' | 'erreur' | 'conseil' | 'tracee-source'

/** Les deux tons qui alertent, et qui prennent donc le signe de §11.1. */
const ALERTENT: readonly TonMention[] = ['cause', 'erreur']

/**
 * Le reste des attributs passe tel quel — `role`, `id`, `aria-live`, `aria-atomic`. Un
 * passe-plat plutôt que quatre props nommées : le composant décide de la CLASSE et du SIGNE,
 * pas du contrat d'accessibilité, qui appartient à la phrase et varie d'un site à l'autre.
 * `className` en est exclu : c'est ce que `ton` détermine, et deux sources le feraient diverger.
 */
export type MentionProps = Omit<ComponentPropsWithoutRef<'p'>, 'className'> & {
  readonly ton: TonMention
  readonly children: ReactNode
}

export function Mention({ ton, children, ...reste }: MentionProps) {
  return (
    <p className={ton} {...reste}>
      {ALERTENT.includes(ton) && <Icone nom="warning" classe="mention-signe" />}
      {ton === 'conseil' && <Icone nom="info" classe="mention-signe" />}
      {children}
    </p>
  )
}
