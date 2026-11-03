/**
 * T-0047 — settings that do not describe a séance.
 * T-0184 — no own drawer (Vérification and Réglages answered the same gesture): CONTENT only,
 * mounted in `BarreHaut`'s merged drawer.
 * T-0128 — catalogue search moved to the "Toutes les cibles" tab. Only §8.3 scoring weights
 * remain. Explanation level removed: gloss shows on hover for all.
 */

import { normalisePoids } from '../core/session.ts'
import { nombre } from '../registry/ecriture.ts'
import { DOMAINES } from '../registry/domains.ts'
import { CRITERES_SCORING, type CritereScoring, type SaisiePoids } from './app-saisie.ts'
import { Curseur } from './Curseur.tsx'
import { Accordeon } from './Accordeon.tsx'
import { POURCENT } from '../core/unites.ts'


/** Slider splits the registry domain in hundredths: no bound rewritten here. */
const DOMAINE_POIDS = DOMAINES.poids_scoring
const PAS_CURSEUR = (DOMAINE_POIDS.max - DOMAINE_POIDS.min) / POURCENT

const LIBELLE_CRITERE: Readonly<Record<CritereScoring, string>> = Object.freeze({
  cadrage: 'Cadrage',
  hauteur: 'Hauteur de culmination',
  signal: 'Signal accumulable',
  fenetre: 'Fenêtre d’observation',
  lune: 'Gêne lunaire',
})

/**
 * §8.3, §2.4 — the five C-15 weights are set here only.
 * Five independent sliders, sum normalised to 1 by the engine: redistributing the other four
 * per gesture would move untouched values, result order-dependent. Displayed % = effective
 * weight used by the plan.
 */
function ReglagePoids(props: SaisiePoids) {
  const effectifs = normalisePoids(props.poids)

  return (
    // T-0325 — no legend or frame: accordion already names the group, a card in the section
    // was the modal's only one. `fieldset` kept for grouping.
    <fieldset className="poids-scoring" aria-label="Score de cible">
      <p className="etat">Départage deux cibles qui se disputent le même moment de la nuit.</p>
      {CRITERES_SCORING.map((critere) => (
        <label key={critere}>
          <span className="libelle">
            {LIBELLE_CRITERE[critere]}
            <span className="poids-effectif">
              {' '}
              {nombre(effectifs[critere] * POURCENT, 0)} %
            </span>
          </span>
          <Curseur
            libelle={LIBELLE_CRITERE[critere]}
            valeur={props.poids[critere]}
            min={DOMAINE_POIDS.min}
            max={DOMAINE_POIDS.max}
            pas={PAS_CURSEUR}
            texte={`${nombre(effectifs[critere] * POURCENT, 0)} %`}
            sur={(valeur) => props.surPoids(critere, valeur)}
          />
        </label>
      ))}
      <button type="button" onClick={props.surDefaut}>
        Revenir aux poids par défaut
      </button>
    </fieldset>
  )
}

export interface MenuReglagesProps {
  readonly poids: SaisiePoids
}

export function MenuReglages(props: MenuReglagesProps) {
  return (
    <Accordeon titre="Réglages — score de cible">
      <ReglagePoids {...props.poids} />
    </Accordeon>
  )
}
