/**
 * §11.3 — lieu + matériel as rail menus: glyph opening its window rightward.
 * T-0437 — were cards over the sky with held, saved fold state. Set once per séance → menu
 * suffices, behaves like calques': outside gesture or Échap closes (`gere-echap.ts`), opening
 * one closes the other, nothing open on reload.
 * Summary (coordinates, boîtier, "24 mm f/2.8") goes in bulle: setting reread without opening.
 */

import type { ReactNode } from 'react'
import { Bulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'
import { Tiroir } from './Tiroir.tsx'

/** Rail setting menus. Key names their class `tiroir-<cle>`. */
export type CleReglage = 'site' | 'boitier' | 'optique'

export interface TiroirRailProps {
  readonly cle: CleReglage
  readonly titre: string
  /** Button's Material Symbols ligature — see `Icone`. */
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
 * Opens a menu from an EXTERNAL gesture, focuses its first field (the one the gesture invites
 * to set). Focus enters the menu → outside-gesture listener doesn't close it.
 */
export function ouvreReglage(cle: CleReglage): void {
  const tiroir = document.querySelector<HTMLDetailsElement>(`details.tiroir-${cle}`)
  if (tiroir === null) return
  tiroir.open = true
  tiroir.querySelector<HTMLElement>('.tiroir-contenu select, .tiroir-contenu input')?.focus()
}
