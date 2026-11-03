/**
 * T-0210 — §12.5: last fallback of the dégradation matrix, the one missing.
 * App mounted bare (`main.tsx`), no error boundary: any render throw unmounted whole React tree,
 * screen black SAYING NOTHING (made a 456° latitude catastrophic, not annoying). T-0208 closes
 * that path by bounding input; this closes the class: throwing library, overflowing engine,
 * tomorrow's unbounded field → screen says so, page holds.
 * T-0279 — cause no longer displayed: English library sentence (`astronomy-engine` throws
 * STRINGS), unreadable to observers. To console with component stack; screen says what remains
 * true and what can be done.
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
   * Faulty component trace exists only in `info`: message alone doesn't say WHERE to look. To
   * console not screen — debug data, not a sentence to read (§12.4: no telemetry, nothing sent).
   */
  override componentDidCatch(erreur: unknown, info: ErrorInfo): void {
    console.error('Orion — rendu interrompu', erreur, info.componentStack)
  }

  override render(): ReactNode {
    return this.state.interrompu ? <EcranInterrompu /> : this.props.children
  }
}

/**
 * Fallback screen, separate from the guard: React error boundary doesn't activate in server
 * render, the only render this project has (`environment: 'node'`). Separate, it can be verified;
 * fused in the class, a test would never render it.
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
