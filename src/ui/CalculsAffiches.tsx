/**
 * §10.2 N3, T-0386 — "Calcul" section of info modal: full chain of each traced value displayed.
 * Label bulle keeps only the gloss; value, formula, inputs, constants, source read here, in mount
 * order. Closed fiche removes its values: section covers only what's on screen.
 */

import { GLOSSAIRE } from '../registry/glossaire.ts'
import { Accordeon } from './Accordeon.tsx'
import { Etiquette } from './Terme.tsx'
import { DetailTrace } from './TracedValue.tsx'
import { useTracesAffichees } from './traces-affichees.ts'

export function CalculsAffiches() {
  const traces = useTracesAffichees()
  return (
    <Accordeon titre="Calcul">
      {traces.size === 0 ? (
        <p className="etat">
          Aucune valeur calculée à l’écran : ouvrez la fiche d’une cible ou la carte du matériel.
        </p>
      ) : (
        [...traces].map(([id, { terme, suffixe, trace, valeur }]) => (
          <div key={id}>
            <h3>
              {/* Gloss alone: explanation and consequence follow in clear below. */}
              <Etiquette cle={terme} bulle={GLOSSAIRE[terme].glose} />
              {suffixe !== undefined && <> — {suffixe}</>}
            </h3>
            <p className="etat">
              <DetailTrace terme={terme} trace={trace} valeur={valeur} />
            </p>
          </div>
        ))
      )}
    </Accordeon>
  )
}
