/**
 * §6.4 — facilité note at a glance: as many pastilles as the scale holds.
 * Glyph via `Icone` + Material Symbols, never "●": decorative Unicode ignores the common icon
 * style (`.icone` sets thickness/size app-wide).
 * Accessible name on the WRAPPER, glyphs `aria-hidden` (Icone default); naming each would say
 * "circle" five times in English mid French sentence.
 * One ligature for both states, one font axis tells them apart: `FILL`, full vs ringed. Two
 * ligatures changed GEOMETRY too, and at this size both circles read alike — the very defect
 * this component avoids (counted at a glance).
 */

import { K } from '../registry/constants.ts'
import { Icone } from './Icone.tsx'

export interface PastillesProps {
  readonly note: number
  /** Scale label: in the accessible name, never in a glyph. */
  readonly libelle: string
  /**
   * §8.3 — gap cause, note 0 only. A mute zero is worst of both: refusal seen without knowing
   * which lever to pull.
   */
  readonly cause?: string | null
}

export function Pastilles({ note, libelle, cause = null }: PastillesProps) {
  const max = K('FACILITE_NOTE_MAX')
  const rangs = Array.from({ length: max }, (_, i) => i)
  return (
    <span
      className="facilite"
      role="img"
      aria-label={
        cause === null
          ? `facilité ${note} sur ${max}, ${libelle}`
          : `facilité ${note} sur ${max}, ${libelle} — ${cause}`
      }
      {...(cause === null ? {} : { title: cause })}
    >
      {rangs.map((rang) => (
        <Icone key={rang} nom="circle" classe={rang < note ? 'facilite-pleine' : 'facilite-vide'} />
      ))}
    </span>
  )
}
