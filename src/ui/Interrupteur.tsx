/**
 * T-0215 — une case à cocher et la phrase qui dit ce qu'elle fait.
 *
 * Le motif était écrit sept fois à l'identique, dans cinq fichiers : `<label className=
 * "interrupteur">`, un `<input type="checkbox">`, un libellé. Sept écritures du même
 * contrôle, donc sept occasions de diverger — c'est le raisonnement de T-0209 pour
 * `ChampDomaine`, appliqué au seul autre contrôle que l'application répète.
 *
 * Le libellé est un `ReactNode` et non une chaîne : deux des sept sites y posent une
 * `<Etiquette>` du glossaire suivie d'une phrase, et forcer la chaîne les aurait laissés
 * dehors — un composant qu'un cas sur trois ne peut pas employer ne factorise rien.
 *
 * La forme vit dans `.interrupteur` (`styles.css`), l'unique endroit à toucher pour les faire
 * toutes changer. Une seule variante, `switch` (T-0406) : un réglage qui change la forme de ce
 * qui suit — zoom ou focale fixe — se lit en bascule plutôt qu'en case. Elle s'annonce
 * `role="switch"` : « activé », pas « coché ».
 */

import type { ReactNode } from 'react'

export interface InterrupteurProps {
  readonly actif: boolean
  readonly surChangement: (actif: boolean) => void
  /** La glose qu'une `<Bulle>` greffe en l'enveloppant : elle DÉCRIT la case, elle ne la
      nomme pas — le libellé s'en charge. Portée par l'`<input>` et non par le `<label>` :
      c'est la case qui est annoncée, la description doit venir avec elle. */
  readonly 'aria-describedby'?: string | undefined
  /** Une bascule plutôt qu'une case ; la case par défaut. */
  readonly switch?: boolean
  /** La phrase qui dit ce que l'interrupteur fait, pas le nom d'un champ. */
  readonly children: ReactNode
}

export function Interrupteur({
  actif,
  surChangement,
  'aria-describedby': decritPar,
  switch: bascule = false,
  children,
}: InterrupteurProps) {
  return (
    <label className="interrupteur">
      <input
        type="checkbox"
        {...(bascule ? { role: 'switch', className: 'bascule' } : {})}
        checked={actif}
        aria-describedby={decritPar}
        onChange={(e) => surChangement(e.target.checked)}
      />
      {children}
    </label>
  )
}
