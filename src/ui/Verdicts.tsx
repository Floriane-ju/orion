/**
 * Ce que la chaîne de calcul répond : §10.2, l'explication dépliable.
 *
 * T-0385 — les régions « Pose » et « Combien de photos » (§7) sont dans la carte
 * « Photographie » (`FichePhotographie.tsx`).
 *
 * T-0384 — la région « Détectabilité » (§6.3) est partie : créneau, culmination et
 * dégradation lunaire sont dans les cartes de tête, et brillance de surface, contraste et
 * magnitude limite ne décidaient rien de la prise de vue.
 *
 * T-0381 — la région « Cadrage de la cible » (§6.2) est partie : la carte « Photographie »
 * de la fiche en résume la taille dans le cadre et l'inclinaison.
 *
 * Aucune de ces régions ne calcule quoi que ce soit : elles lisent le `Resultat` produit par
 * `fiche-cible-calcul.ts`, et chaque nombre reste dépliable jusqu'à sa formule.
 *
 * T-0228 — les deux renvois d'amont que ces régions portaient — seuils de contraste, familles
 * de filtres — sont dans le tiroir « info ». Ils ne bougeaient pas d'une cible à l'autre et
 * n'arbitraient rien, là où tout le reste de la fiche répond à la cible du moment. La source
 * d'une CONSTANTE reste au contact, dépliée sous sa valeur : c'est §10.2, pas une bibliographie.
 */

import { nombre } from '../registry/ecriture.ts'
import { Interrupteur } from './Interrupteur.tsx'
import { Etiquette } from './Terme.tsx'
import type { Conseils, Resultat } from './fiche-cible-calcul.ts'
import { Mention } from './Mention.tsx'
import { libelleEntree } from '../registry/libelles.ts'

export interface VerdictsProps {
  readonly r: Resultat
  readonly conseils: Conseils | null
  readonly filtreDualBand: boolean
  readonly surFiltre: (valeur: boolean) => void
  readonly explicationDepliee: boolean
  readonly surDeplie: (valeur: boolean) => void
}

export function Verdicts(props: VerdictsProps) {
  const { r } = props
  return (
    <>
      <PourquoiCeVerdict
        r={r}
        conseils={props.conseils}
        filtreDualBand={props.filtreDualBand}
        surFiltre={props.surFiltre}
        explicationDepliee={props.explicationDepliee}
        surDeplie={props.surDeplie}
      />
    </>
  )
}

/** §10.2 — le facteur dominant, les leviers, puis §7.5 et §10.3 s'ils se déclenchent. */
function PourquoiCeVerdict({
  r,
  conseils,
  filtreDualBand,
  surFiltre,
  explicationDepliee,
  surDeplie,
}: {
  readonly r: Resultat
  readonly conseils: Conseils | null
  readonly filtreDualBand: boolean
  readonly surFiltre: (valeur: boolean) => void
  readonly explicationDepliee: boolean
  readonly surDeplie: (valeur: boolean) => void
}) {
  const explique = r.explique
  if (explique === null) return null
  return (
    <section>
      <h2>Pourquoi ce verdict</h2>
      <p className="etat">{explique.n1}</p>
      <Interrupteur actif={filtreDualBand} surChangement={surFiltre}>
        Je possède un filtre bi-bande Hα / OIII
      </Interrupteur>
      <details
        className="tracee"
        open={explicationDepliee}
        onToggle={(e) => surDeplie((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <span>
            <Etiquette cle="facteur_dominant" />
          </span>
          <span className="tracee-valeur">
            {explique.facteurs.map(libelleEntree).join(' et ')}
          </span>
        </summary>
        <div className="tracee-detail">
          <p>{explique.n2}</p>
          {/* T-0275 — le nombre seul ne dit rien : une sensibilité est |∂ln(sortie)/∂ln(entrée)|,
              une pente sans dimension. On ne peut pas la lire comme « doubler cette valeur
              double le temps » — sur une magnitude, doubler n'a aucun sens, et la valeur
              absolue a déjà perdu le signe. Ce qu'elle dit vraiment, et tout ce qu'elle dit,
              c'est QUI décide. La phrase l'énonce une fois, au-dessus de la liste. */}
          <p className="etat">Plus le nombre est grand, plus cette grandeur décide du résultat.</p>
          <dl className="tracee-entrees">
            {Object.entries(explique.sensibilites).map(([nom, valeur]) => (
              <div key={nom}>
                <dt>{libelleEntree(nom)}</dt>
                <dd>{nombre(valeur, 2)}</dd>
              </div>
            ))}
          </dl>
          <ul className="tracee-constantes">
            {explique.leviers.map((l) => (
              <li key={l.code}>
                <strong>{l.libelle}</strong> — gain {l.gain}, coût {l.cout}
              </li>
            ))}
          </ul>

          {conseils !== null && <ConseilsEtRecommandations conseils={conseils} />}
          <ChaineDeCalcul etapes={explique.n3} />
        </div>
      </details>
    </section>
  )
}

/** §7.5 puis §10.3 — le conseil filtre vient APRÈS les leviers gratuits, jamais avant. */
function ConseilsEtRecommandations({ conseils }: { readonly conseils: Conseils }) {
  return (
    <>
      <Mention ton={conseils.filtre.declenche ? 'cause' : 'etat'}>{conseils.filtre.message}</Mention>
      {/* §10.3 — recommandation d'équipement : catégorie et gain chiffré, rien d'autre. */}
      <p className="etat">{conseils.recommandations.message}</p>
      {conseils.recommandations.recommandations.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Sans</th>
              <th>Avec</th>
              <th>Rapport</th>
            </tr>
          </thead>
          <tbody>
            {conseils.recommandations.recommandations.map((reco) => (
              <tr key={reco.categorie}>
                <td>{reco.libelle}</td>
                <td>{reco.sans}</td>
                <td>{reco.avec}</td>
                <td>× {nombre(reco.rapport, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

/** §10.2 niveau 3 — chaque étape avec sa formule, sa section et ses constantes sources. */
function ChaineDeCalcul({
  etapes,
}: {
  readonly etapes: NonNullable<Resultat['explique']>['n3']
}) {
  return (
    <details className="tracee">
      <summary>
        <span>Chaîne de calcul complète</span>
      </summary>
      <div className="tracee-detail">
        {etapes.map((etape) => (
          <p key={etape.libelle} className="tracee-formule">
            <strong>{etape.libelle}</strong> = {etape.valeur === null || etape.valeur === undefined ? '—' : nombre(etape.valeur, 3)} {etape.unite}
            <br />
            <code>{etape.expression}</code>
            {etape.constantes.length > 0 && (
              <span className="tracee-source">
                <br />
                constantes : {etape.constantes.map((c) => `${c.ref} = ${c.valeur}`).join(', ')}
              </span>
            )}
          </p>
        ))}
      </div>
    </details>
  )
}
