/**
 * §14 — vérification: socle state, user data, offline dégradation matrix, constants registry.
 * 4 screens checking the app rests on something sound; prepare no nuit. Closed tiroir openable
 * from top bar, not 3 full-height screens under planétarium.
 * T-0184 — no longer carries the tiroir: Vérification + Réglages answered the same gesture
 * ("what leaves the main path"), two adjacent tiroirs cluttered the bar. CONTENT only here;
 * envelope, keyboard opening, alert flag in `BarreHaut`.
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
import { OCTETS_PAR_MO } from '../data/persistence.ts'

/** T-0184 — what closed tiroir says of itself when this section alerts. */
export const ALERTE_VERIFICATION = 'Vérification : données non enregistrées'

export interface VerificationProps {
  readonly etat: EtatDemarrage | null
  /** T-0275 — typed, not `string`: makes its label compiler-verifiable. */
  readonly modeReseau: ModeReseau
  readonly messagePersistance: string | null
  /** §12.3 — a lost write must not stay hidden in a closed tiroir. */
  readonly echecPersistance: boolean
  readonly surExport: () => void
  readonly surImport: (fichier: File) => void
}

export function Verification(props: VerificationProps) {
  const { etat } = props

  return (
    <>
      <Accordeon titre="Vérification — état du socle" ouvert={props.echecPersistance}>
        {/* T-0187 — socle state + network mode announce only on change, via live region. They
            don't announce the persistence message: its own change must. */}
        <div aria-live="polite" aria-atomic="true">
          {etat === null && <p>Vérification en cours…</p>}
          {etat !== null && (
            <>
              <p className="etat">réseau : {LIBELLE_MODE_RESEAU[props.modeReseau]}</p>
              <p className="etat">
                stockage local :{' '}
                {etat.stockage.usageMo === null
                  ? 'usage inconnu'
                  : `${nombre(etat.stockage.usageMo, 1)} Mo utilisés`}
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
        {/* T-0187 — failure carries `role="alert"`, success announces politely: losing an export
            is error-class, a successful import interrupts nobody.

            Region ALWAYS mounted, empty when nothing to say. A live region inserted with its text
            isn't announced by most screen readers: they watch present regions, not appearances.
            Only detail deciding whether this ticket does anything. */}
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
        {/* T-0278 — audit surface: constants inventory names paquets the MVP doesn't ship (§12.2
            Gaia paquet), as it describes the REGISTRE + provenance, not what app offers. Class
            carries exemption from false-phrase blacklist, as `verbatim` carries T-0275's. */}
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
                {/* T-0275 — audit surfaces: these 2 columns ONLY quote PRD word for word, formulas
                    and constant names included. Exemption rides on them, not the row: a column
                    added tomorrow stays watched. */}
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
