/**
 * §10.1 — Glossaire contextuel, rendu au contact du terme.
 *
 * L'interface ne rend jamais un libellé littéral : elle rend une clé du glossaire. C'est ce
 * qui tient la règle « aucun terme affiché ne peut être absent du glossaire » — un libellé
 * sans entrée ne compile pas, et le compilateur nomme la clé manquante.
 *
 * Une seule densité d'explication : la glose sort au survol, l'explication complète au clic.
 * Un réglage de verbosité faisait choisir à l'utilisateur ce que le survol donne déjà.
 */

import { Bulle } from './Bulle.tsx'
import type { TermeGlossaire } from '../registry/glossaire.ts'
import { GLOSSAIRE } from '../registry/glossaire.ts'

interface EtiquetteProps {
  readonly cle: TermeGlossaire
  /**
   * Glose de remplacement, calculée au contact plutôt que générique — ex. l'ISO retenu et sa
   * justification. Absente, la glose du glossaire fait foi.
   */
  readonly glose?: string | undefined
}

/** Libellé d'un terme, glose au survol — le pointillé sous le mot annonce qu'il y a une aide. */
export function Etiquette({ cle, glose }: EtiquetteProps) {
  const entree = GLOSSAIRE[cle]
  if (entree.sansBulle === true) {
    return <span className="terme">{entree.libelle}</span>
  }
  return (
    <span className="terme">
      <Bulle texte={glose ?? entree.glose} place="bas">
        <abbr>{entree.libelle}</abbr>
      </Bulle>
    </span>
  )
}

interface GloseProps {
  readonly cle: TermeGlossaire
  /**
   * Valeur courante de l'utilisateur pour ce terme. Absente, le champ dit ce qu'il faut
   * renseigner pour l'obtenir — jamais un exemple abstrait, jamais une valeur inventée.
   */
  readonly contexte?: string | undefined
}

/** Explication, valeur en contexte et conséquence : les trois champs de §10.1 après la glose. */
export function Glose({ cle, contexte }: GloseProps) {
  const entree = GLOSSAIRE[cle]
  return (
    <div className="glossaire">
      <p>{entree.explication}</p>
      <p className="glossaire-contexte">
        {contexte === undefined
          ? 'Pas encore calculée : complétez le lieu ou le matériel.'
          : `Votre valeur : ${contexte}`}
      </p>
      <p className="glossaire-consequence">{entree.consequence}</p>
    </div>
  )
}

/** Terme affiché seul, hors valeur tracée : la définition complète s'ouvre au clic. */
export function Terme({ cle, contexte }: GloseProps) {
  return (
    <details className="terme-detail">
      <summary>
        <Etiquette cle={cle} />
      </summary>
      <Glose cle={cle} contexte={contexte} />
    </details>
  )
}
