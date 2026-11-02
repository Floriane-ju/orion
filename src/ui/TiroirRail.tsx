/**
 * §11.3 — le lieu et le matériel, en menus du rail : un glyphe qui ouvre sa fenêtre à droite.
 *
 * T-0437 — c'étaient des cartes posées sur le ciel, avec un état de repli tenu et enregistré.
 * Le lieu et le matériel se règlent une fois par séance : un menu suffit, et il se comporte
 * comme celui des calques — un geste dehors ou Échap le referme (`gere-echap.ts`), ouvrir l'un
 * ferme l'autre, et rien ne reste ouvert au rechargement.
 *
 * Le résumé (coordonnées, boîtier, « 24 mm f/2.8 ») passe dans la bulle : le réglage se relit
 * sans ouvrir le menu.
 */

import type { ReactNode } from 'react'
import { Bulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'
import { Tiroir } from './Tiroir.tsx'

/** Les menus de réglage du rail. La clé nomme leur classe `tiroir-<cle>`. */
export type CleReglage = 'site' | 'boitier' | 'optique'

export interface TiroirRailProps {
  readonly cle: CleReglage
  readonly titre: string
  /** Ligature Material Symbols du bouton — voir `Icone`. */
  readonly icone: string
  readonly resume?: string
  readonly children: ReactNode
}

export function TiroirRail(props: TiroirRailProps) {
  const aide = props.resume === undefined ? props.titre : `${props.titre} — ${props.resume}`
  return (
    <Bulle texte={aide} place="droite">
      <Tiroir modificateur={props.cle} resume={<Icone nom={props.icone} libelle={props.titre} />}>
        <h2 className="tiroir-rail-titre">{props.titre}</h2>
        {props.children}
      </Tiroir>
    </Bulle>
  )
}

/**
 * Ouvre un menu depuis un geste qui lui est EXTÉRIEUR, et porte le focus sur son premier
 * champ, celui que le geste invite à régler. Le focus entre dans le menu : l'écoute du geste
 * dehors ne le referme donc pas.
 */
export function ouvreReglage(cle: CleReglage): void {
  const tiroir = document.querySelector<HTMLDetailsElement>(`details.tiroir-${cle}`)
  if (tiroir === null) return
  tiroir.open = true
  tiroir.querySelector<HTMLElement>('.tiroir-contenu select, .tiroir-contenu input')?.focus()
}
