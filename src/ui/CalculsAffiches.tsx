/**
 * §10.2 N3, T-0386 — la rubrique « Calcul » de la modale info : la chaîne complète de chaque
 * valeur tracée affichée sous la modale.
 *
 * La bulle du libellé ne garde que la glose ; ce qui en est sorti — valeur, formule, entrées,
 * constantes et leur source — se lit ici, dans l'ordre où les valeurs se sont montées. Une
 * fiche fermée retire ses valeurs : la rubrique ne parle que de ce qu'on a sous les yeux.
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
              {/* La glose seule : explication et conséquence suivent en clair dessous. */}
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
