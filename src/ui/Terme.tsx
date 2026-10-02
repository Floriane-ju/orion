/**
 * §10.1 — Glossaire contextuel, rendu au contact du terme.
 *
 * L'interface ne rend jamais un libellé littéral : elle rend une clé du glossaire. C'est ce
 * qui tient la règle « aucun terme affiché ne peut être absent du glossaire » — un libellé
 * sans entrée ne compile pas, et le compilateur nomme la clé manquante.
 *
 * Une seule surface d'explication : tout sort au survol. Le repli « en savoir plus » au clic
 * a été retiré, son contenu versé dans la bulle en attendant d'être trié.
 */

import type { ReactNode } from 'react'
import { Bulle } from './Bulle.tsx'
import type { TermeGlossaire } from '../registry/glossaire.ts'
import { GLOSSAIRE } from '../registry/glossaire.ts'

interface EtiquetteProps {
  readonly cle: TermeGlossaire
  /**
   * Glose de remplacement, calculée au contact plutôt que générique — ex. l'ISO retenu et sa
   * justification. Absente, la glose du glossaire fait foi.
   */
  readonly glose?: ReactNode
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
export function Etiquette({ cle, glose }: EtiquetteProps) {
  const entree = GLOSSAIRE[cle]
  // Une glose fournie (le détail d'une valeur tracée) l'emporte : sans bulle, elle serait perdue.
  if (entree.sansBulle === true && glose === undefined) {
    return <span className="terme">{libelleProtege(entree.libelle)}</span>
  }
  return (
    <span className="terme">
      <Bulle texte={glose ?? entree.glose} place="bas">
        <abbr>{libelleProtege(entree.libelle)}</abbr>
      </Bulle>
    </span>
  )
}
