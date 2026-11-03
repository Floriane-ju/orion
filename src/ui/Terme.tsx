/**
 * §10.1 — Glossaire contextuel, rendered on contact with the term. UI never renders a literal
 * label, only a glossaire key: holds "no displayed term absent from glossaire" — label without
 * entry doesn't compile, compiler names the key.
 * One explanation surface: all on hover. T-0386 — bulle carries all its entry writes (glose,
 * explication, conséquence). Tracée value's bulle composed by `TracedValue`, passed whole.
 */

import type { ReactNode } from 'react'
import { Bulle } from './Bulle.tsx'
import type { TermeGlossaire } from '../registry/glossaire.ts'
import { GLOSSAIRE } from '../registry/glossaire.ts'

interface EtiquetteProps {
  readonly cle: TermeGlossaire
  /**
   * Precision computed on contact, added under glossaire entry (e.g. retained ISO + why).
   * T-0386: no longer replaces glose (it vanished with it).
   */
  readonly precision?: ReactNode
  /** Full bulle content; replaces glose, explication, conséquence. */
  readonly bulle?: ReactNode
}

/** Greek letter = symbol: capital δ, Δ = écart (T-0276). */
const SYMBOLE_GREC = /([α-ωµ]+)/u

/** Label with symbols removed from micro-label capitals. */
function libelleProtege(libelle: string) {
  return libelle
    .split(SYMBOLE_GREC)
    .map((morceau, rang) =>
      rang % 2 === 1 ? (
        <span key={rang} className="casse-exacte">
          {morceau}
        </span>
      ) : (
        morceau
      ),
    )
}

/** Term label, glose on hover — dotted underline signals help exists. */
export function Etiquette({ cle, precision, bulle }: EtiquetteProps) {
  const entree = GLOSSAIRE[cle]
  // A given précision overrides `sansBulle`: without bulle it would be lost.
  const lignes = [
    ...(entree.sansBulle === true ? [] : [entree.glose, entree.explication, entree.consequence]),
    precision,
  ].filter((ligne) => ligne !== undefined && ligne !== null && ligne !== '')
  const texte =
    bulle ??
    (lignes.length === 0 ? undefined : (
      <>
        {lignes.map((ligne, rang) => (
          <span key={rang} className="bulle-ligne">
            {ligne}
          </span>
        ))}
      </>
    ))
  if (texte === undefined) {
    return <span className="terme">{libelleProtege(entree.libelle)}</span>
  }
  return (
    <span className="terme">
      <Bulle texte={texte} place="bas">
        <abbr>{libelleProtege(entree.libelle)}</abbr>
      </Bulle>
    </span>
  )
}
