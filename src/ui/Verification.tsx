/**
 * §14 — la vérification : état du socle, données utilisateur, matrice de dégradation
 * hors-ligne, registre de constantes.
 *
 * Ces quatre écrans vérifient que l'application repose sur quelque chose de sain ; ils ne
 * préparent aucune nuit. Leur place est un tiroir fermé, ouvrable depuis la barre du haut,
 * pas trois pleines hauteurs d'écran sous le planétarium.
 *
 * T-0184 — ce n'est plus ce composant qui porte le tiroir. Vérification et Réglages
 * répondaient au même geste — « ce qui sort du chemin principal » — et deux tiroirs voisins
 * pour un seul geste encombraient la barre. Ne reste ici qu'un CONTENU ; l'enveloppe, son
 * ouverture au clavier et le signalement d'alerte sont dans `BarreHaut`.
 */

import { MATRICE_DEGRADATION } from '../data/degradation.ts'
import { nombre } from '../registry/ecriture.ts'
import type { EtatDemarrage } from '../data/bootstrap.ts'
import { REGISTRE } from '../registry/constants.ts'
import { Mention } from './Mention.tsx'
import type { ModeReseau } from '../data/degradation.ts'
import { Accordeon } from './Accordeon.tsx'
import { LIBELLE_EXPORT } from './app-donnees.ts'
import {
  LIBELLE_DISPONIBILITE_HORS_LIGNE,
  LIBELLE_INTEGRITE_PAQUET,
  LIBELLE_MODE_RESEAU,
} from '../registry/libelles.ts'

const OCTETS_PAR_MO = 1024 * 1024

/** T-0184 — ce que le tiroir fermé dit de lui-même quand cette section s'alerte. */
export const ALERTE_VERIFICATION = 'Vérification : données non enregistrées'

export interface VerificationProps {
  readonly etat: EtatDemarrage | null
  /** T-0275 — typé, pas `string` : c'est ce qui rend son libellé vérifiable par le compilateur. */
  readonly modeReseau: ModeReseau
  readonly messagePersistance: string | null
  /** §12.3 — une écriture perdue ne doit pas rester cachée dans un tiroir fermé. */
  readonly echecPersistance: boolean
  readonly surExport: () => void
  readonly surImport: (fichier: File) => void
}

export function Verification(props: VerificationProps) {
  const { etat } = props

  return (
    <>
      <Accordeon titre="Vérification — état du socle" ouvert={props.echecPersistance}>
        {/* T-0187 — l'état du socle et le mode réseau s'annoncent à leur changement seulement,
            via une région vive. Ils n'annoncent pas le message de persistance : c'est son
            propre changement qui doit l'annoncer. */}
        <div aria-live="polite" aria-atomic="true">
          {etat === null && <p>Vérification en cours…</p>}
          {etat !== null && (
            <>
              <p className="etat">réseau : {LIBELLE_MODE_RESEAU[props.modeReseau]}</p>
              <p className="etat">
                stockage persistant : {etat.stockage.persistant ? 'accordé' : 'non accordé'}
                {etat.stockage.usageMo !== null &&
                  ` · ${nombre(etat.stockage.usageMo, 1)} Mo utilisés`}
              </p>
              {etat.stockage.avertissement !== undefined && (
                <Mention ton="cause">{etat.stockage.avertissement}</Mention>
              )}
              {etat.catalogues.cause !== undefined && (
                <Mention ton="cause">{etat.catalogues.cause}</Mention>
              )}
              <ul>
                {etat.catalogues.paquets.map((p) => (
                  <li key={p.manifeste.nom}>
                    {p.manifeste.nom} v{p.manifeste.version} — {LIBELLE_INTEGRITE_PAQUET[p.integrite]} (
                    {nombre(p.manifeste.octets / OCTETS_PAR_MO, 2)} Mo)
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="actions">
          <button type="button" onClick={props.surExport}>
            {LIBELLE_EXPORT}
          </button>
          <label className="bouton-fichier">
            Réimporter
            <input
              type="file"
              accept="application/json"
              onChange={(e) => {
                const fichier = e.target.files?.[0]
                if (fichier !== undefined) props.surImport(fichier)
              }}
            />
          </label>
        </div>
        {/* T-0187 — un échec porte `role="alert"`, un succès s'annonce poliment : perdre un
            export est de l'ordre de l'erreur, réussir un import n'interrompt personne.

            La région est TOUJOURS montée, vide quand il n'y a rien à dire. Une région vive
            insérée en même temps que son texte n'est pas annoncée par la plupart des lecteurs
            d'écran : ils observent les régions présentes, ils n'observent pas leur apparition.
            C'est le seul détail qui décide si ce ticket sert à quelque chose. */}
        <Mention
          ton={props.echecPersistance ? 'cause' : 'etat'}
          role={props.echecPersistance ? 'alert' : 'status'}
          aria-live={props.echecPersistance ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          {props.messagePersistance}
        </Mention>
      </Accordeon>

      <Accordeon titre="Matrice de dégradation hors-ligne">
        <table>
          <thead>
            <tr>
              <th>Fonction</th>
              <th>Hors réseau</th>
              <th>Dégradation</th>
            </tr>
          </thead>
          <tbody>
            {MATRICE_DEGRADATION.map((ligne) => (
              <tr key={ligne.fonction}>
                <td>{ligne.fonction}</td>
                <td>{LIBELLE_DISPONIBILITE_HORS_LIGNE[ligne.horsReseau]}</td>
                <td>{ligne.degradation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Accordeon>

      <Accordeon titre="Registre de constantes">
        {/* T-0278 — surface d'audit : l'inventaire des constantes nomme des paquets que le MVP
            ne livre pas (le paquet Gaia de §12.2), parce qu'il décrit le REGISTRE et sa
            provenance, pas ce que l'application propose de faire. La classe porte l'exemption
            de la liste noire des phrases fausses, comme `verbatim` porte celle de T-0275. */}
        <table className="registre">
          <thead>
            <tr>
              <th>Réf</th>
              <th>Libellé</th>
              <th>Valeur</th>
              <th>Source</th>
              <th>Tolérance</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(REGISTRE).map(([id, c]) => (
              <tr key={id} className={c.deprecie !== undefined ? 'depreciee' : undefined}>
                <td>{c.ref}</td>
                <td>{c.libelle}</td>
                <td>
                  {c.valeur} {c.unite}
                </td>
                {/* T-0275 — surfaces d'audit : ces deux colonnes SEULES citent le PRD mot pour
                    mot, formules et noms de constantes compris. L'exemption tient sur elles,
                    pas sur la ligne : une colonne ajoutée demain resterait surveillée. */}
                <td className="verbatim">{c.source}</td>
                <td className="verbatim">{c.deprecie ?? c.tolerance ?? 'valeur exacte'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Accordeon>
    </>
  )
}
