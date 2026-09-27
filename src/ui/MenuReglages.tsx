/**
 * T-0047 — les réglages qui ne décrivent pas une séance.
 *
 * T-0184 — ce composant ne porte plus son tiroir : Vérification et Réglages répondaient au
 * même geste, et deux tiroirs voisins pour un seul geste encombraient la barre. Ne reste ici
 * qu'un CONTENU, monté dans le tiroir fusionné de `BarreHaut`.
 *
 * T-0128 — la recherche du catalogue a quitté ce tiroir pour l'onglet « Toutes les cibles »,
 * où elle rejoint les filtres et les lectures qui rendent un résultat exploitable. Chercher
 * un objet pour n'en voir que le nom n'avait de sens que tant qu'il n'existait pas d'écran
 * pour le montrer.
 *
 * Ne restent ici que les poids de scoring de §8.3 : le seul réglage qui ne décrit pas une
 * séance. Le niveau d'explication a disparu — la glose sort au survol pour tout le monde.
 */

import { normalisePoids } from '../core/session.ts'
import { DOMAINES } from '../registry/domains.ts'
import { CRITERES_SCORING, type CritereScoring, type SaisiePoids } from './app-saisie.ts'
import { Curseur } from './Curseur.tsx'
import { Accordeon } from './Accordeon.tsx'

const POURCENT = 100

/** Le curseur découpe le domaine du registre en centièmes : pas de borne réécrite ici. */
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
 * §8.3 et §2.4 — les cinq poids C-15 se règlent ici, et nulle part ailleurs.
 *
 * Cinq curseurs indépendants, la somme normalisée à 1 par le moteur : redistribuer les quatre
 * autres à chaque geste ferait bouger des valeurs que personne n'a touchées, et le résultat
 * dépendrait de l'ordre des gestes. Le pourcentage affiché est le poids effectif, celui que
 * le plan utilise vraiment.
 */
function ReglagePoids(props: SaisiePoids) {
  const effectifs = normalisePoids(props.poids)

  return (
    // T-0325 — plus de légende ni de cadre : l'accordéon nomme déjà le groupe, et une carte
    // dans la rubrique était la seule de la modale. Le `fieldset` reste pour le regroupement.
    <fieldset className="poids-scoring" aria-label="Score de cible">
      <p className="etat">Départage deux cibles qui se disputent le même moment de la nuit.</p>
      {CRITERES_SCORING.map((critere) => (
        <label key={critere}>
          <span className="libelle">
            {LIBELLE_CRITERE[critere]}
            <span className="poids-effectif">
              {' '}
              {(effectifs[critere] * POURCENT).toFixed(0)} %
            </span>
          </span>
          <Curseur
            libelle={LIBELLE_CRITERE[critere]}
            valeur={props.poids[critere]}
            min={DOMAINE_POIDS.min}
            max={DOMAINE_POIDS.max}
            pas={PAS_CURSEUR}
            texte={`${(effectifs[critere] * POURCENT).toFixed(0)} %`}
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
