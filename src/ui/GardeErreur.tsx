/**
 * T-0210 — §12.5: last fallback of the dégradation matrix, the one missing.
 * App mounted bare (`main.tsx`), no error boundary: any render throw unmounted whole React tree,
 * screen black SAYING NOTHING (made a 456° latitude catastrophic, not annoying). T-0208 closes
 * that path by bounding input; this closes the class: throwing library, overflowing engine,
 * tomorrow's unbounded field → screen says so, page holds.
 * T-0279 — cause no longer displayed: English library sentence (`astronomy-engine` throws
 * STRINGS), unreadable to observers. To console with component stack; screen says what remains
 * true and what can be done.
 * T-0310 — one boundary per coque region (`region`): a throw in a panel no longer unmounts the
 * scène and the saisie that still worked. The root one stays, for what lives outside the coque.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Mention } from './Mention.tsx'

interface EtatGarde {
  readonly interrompu: boolean
}

interface GardeErreurProps {
  readonly children: ReactNode
  /** Region named in the fallback, with a determiner (« le ciel »); absent = whole app. */
  readonly region?: string
}

export class GardeErreur extends Component<GardeErreurProps, EtatGarde> {
  override state: EtatGarde = { interrompu: false }

  static getDerivedStateFromError(): EtatGarde {
    return { interrompu: true }
  }

  /**
   * Faulty component trace exists only in `info`: message alone doesn't say WHERE to look. To
   * console not screen — debug data, not a sentence to read (§12.4: no telemetry, nothing sent).
   */
  override componentDidCatch(erreur: unknown, info: ErrorInfo): void {
    console.error('Orion — rendu interrompu', this.props.region ?? '', erreur, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.interrompu) return this.props.children
    const { region } = this.props
    return region === undefined ? (
      <EcranInterrompu />
    ) : (
      // Remount = the retry: the scène restarts its loop, a panel recomputes.
      <RegionInterrompue region={region} reprend={() => this.setState({ interrompu: false })} />
    )
  }
}

/** T-0310 — fallback in place of ONE region: names it, says the rest holds, offers a way out. */
export function RegionInterrompue(props: { readonly region: string; readonly reprend: () => void }) {
  const { region } = props
  const titre = `${region.charAt(0).toUpperCase()}${region.slice(1)}`
  return (
    <div className="garde-region" role="alert">
      <Mention ton="erreur">
        {`${titre} ne s’affiche plus : une valeur sort de ce que l’application sait traiter.`}
      </Mention>
      <p className="etat">
        Le reste de l’application fonctionne. Réessayez ; si l’arrêt revient, rechargez la page.
      </p>
      <button type="button" onClick={props.reprend}>
        Réessayer
      </button>
    </div>
  )
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
