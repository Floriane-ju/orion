/**
 * §10.1 — Glossaire contextuel, rendu au contact du terme.
 *
 * L'interface ne rend jamais un libellé littéral : elle rend une clé du glossaire. C'est ce
 * qui tient la règle « aucun terme affiché ne peut être absent du glossaire » — un libellé
 * sans entrée ne compile pas, et le compilateur nomme la clé manquante.
 *
 * Une seule surface d'explication : tout sort au survol. T-0386 — la bulle d'un terme porte
 * tout ce que son entrée écrit : glose, explication, conséquence. Celle d'une valeur tracée
 * est composée par `TracedValue`, qui la passe entière (`bulle`).
 */

import type { ReactNode } from 'react'
import { Bulle } from './Bulle.tsx'
import type { TermeGlossaire } from '../registry/glossaire.ts'
import { GLOSSAIRE } from '../registry/glossaire.ts'

interface EtiquetteProps {
  readonly cle: TermeGlossaire
  /**
   * Précision calculée au contact, ajoutée sous l'entrée du glossaire — ex. l'ISO retenu et
   * sa justification. T-0386 : elle ne remplace plus la glose, qui disparaissait avec elle.
   */
  readonly precision?: ReactNode
  /** Contenu complet de la bulle, qui remplace glose, explication et conséquence. */
  readonly bulle?: ReactNode
}

/** Une lettre grecque est un symbole : δ en capitale, Δ, désigne un écart (T-0276). */
const SYMBOLE_GREC = /([α-ωµ]+)/u

/** Le libellé, ses symboles soustraits aux capitales du micro-libellé. */
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

/** Libellé d'un terme, glose au survol — le pointillé sous le mot annonce qu'il y a une aide. */
export function Etiquette({ cle, precision, bulle }: EtiquetteProps) {
  const entree = GLOSSAIRE[cle]
  // Une précision fournie passe outre `sansBulle` : sans bulle, elle serait perdue.
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
