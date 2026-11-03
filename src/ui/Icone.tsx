/**
 * T-0122 — one Material Symbols Sharp glyph, named by ligature.
 * Icon style (stroke, size, family) changes in one place: `.icone` (`styles.css`); a11y here.
 * `aria-hidden` by default: ligature = text, a reader would say "close" in a French label.
 * Meaning = carrying control's `aria-label`. Icon alone + meaningful: `libelle` → named image.
 */

interface IconeProps {
  /** Material Symbols ligature name, English (font identifier). */
  readonly nom: string
  /** Only if the icon alone carries the info; omit with a control `aria-label` (read twice). */
  readonly libelle?: string | undefined
  readonly classe?: string | undefined
}

export function Icone({ nom, libelle, classe }: IconeProps) {
  const classes = classe === undefined ? 'icone' : `icone ${classe}`
  return libelle === undefined ? (
    <span className={classes} aria-hidden="true">
      {nom}
    </span>
  ) : (
    <span className={classes} role="img" aria-label={libelle}>
      {nom}
    </span>
  )
}

/** `document` slice needed: font loader, root class. */
interface DocumentPolices {
  readonly documentElement: { readonly classList: { add(classe: string): unknown } }
  readonly fonts: { load(police: string): Promise<unknown> }
}

/**
 * T-0300 — `.icone` hidden (`styles.css`) until root has `icones-pretes`.
 * `font-display: block` hides text only ~3 s; slow first launch showed the raw ligature.
 * Load failure keeps glyphs hidden: controls keep `aria-label`, blank beats an English name.
 */
export async function attendsPoliceIcones(doc: DocumentPolices, famille: string): Promise<void> {
  await doc.fonts.load(`1em ${famille}`)
  doc.documentElement.classList.add('icones-pretes')
}
