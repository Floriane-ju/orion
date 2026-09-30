/**
 * T-0210 — §12.5 : le dernier repli de la matrice de dégradation, celui qui n'était pas là.
 *
 * L'application se montait nue (`main.tsx`), sans aucune frontière d'erreur : n'importe quelle
 * levée pendant un rendu démontait l'arbre React entier, et l'écran devenait noir SANS RIEN
 * DIRE. C'est ce qui a rendu une latitude de 456° catastrophique plutôt que gênante.
 *
 * T-0208 ferme ce chemin-là en bornant la saisie ; celui-ci ferme la classe. Une bibliothèque
 * qui lève, un moteur qui déborde, un champ ajouté demain sans borne : l'écran le dit et
 * la page tient.
 *
 * T-0279 — la cause ne s'affiche plus : c'est une phrase anglaise de bibliothèque (`astronomy-engine`
 * lève des CHAÎNES), illisible pour qui observe. Elle part à la console avec la pile du composant ;
 * l'écran dit ce qui reste vrai et ce qu'on peut faire.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Mention } from './Mention.tsx'

interface EtatGarde {
  readonly interrompu: boolean
}

export class GardeErreur extends Component<{ readonly children: ReactNode }, EtatGarde> {
  override state: EtatGarde = { interrompu: false }

  static getDerivedStateFromError(): EtatGarde {
    return { interrompu: true }
  }

  /**
   * La trace du composant fautif n'existe que dans `info` : sans elle, le message seul ne dit
   * pas OÙ chercher. Elle part à la console et pas à l'écran — c'est une donnée de débogage,
   * pas une phrase à lire (§12.4 : aucune télémétrie, rien n'est envoyé nulle part).
   */
  override componentDidCatch(erreur: unknown, info: ErrorInfo): void {
    console.error('Orion — rendu interrompu', erreur, info.componentStack)
  }

  override render(): ReactNode {
    return this.state.interrompu ? <EcranInterrompu /> : this.props.children
  }
}

/**
 * L'écran de repli, séparé de la garde qui le déclenche : une frontière d'erreur React ne
 * s'active pas au rendu serveur, et c'est le seul rendu dont ce projet dispose (`environment:
 * 'node'`). Séparé, il se vérifie ; fondu dans la classe, il ne serait jamais rendu par un test.
 */
export function EcranInterrompu() {
  return (
    <div className="garde-erreur" role="alert">
      <h1>Le calcul s’est interrompu</h1>
      <Mention ton="erreur">Une valeur saisie ou calculée sort de ce que l’application sait traiter.</Mention>
      <p className="etat">Vos données sont intactes. Rechargez la page.</p>
      <button type="button" onClick={() => window.location.reload()}>
        Recharger
      </button>
    </div>
  )
}
