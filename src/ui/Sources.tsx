/**
 * §12.2, T-0228 — where displayed data comes from. Table, not sentence list: "where does that
 * one come from?" → data column beside upstream column. Same form as `Verification` constants
 * registry. Provenance strings live in `src/registry/sources.ts` (3 = what their table
 * publishes); component only renders.
 */

import { SOURCES } from '../registry/sources.ts'
import { Accordeon } from './Accordeon.tsx'

export function Sources() {
  return (
    <Accordeon titre="Sources des données">
      <p className="etat">
        Les catalogues sont embarqués : ils ne se mettent pas à jour tout seuls, et la version
        nommée ici est celle que l’application porte.
      </p>
      <table>
        <thead>
          <tr>
            <th>Donnée</th>
            <th>Provenance</th>
          </tr>
        </thead>
        <tbody>
          {SOURCES.map((s) => (
            <tr key={s.donnee}>
              <td>{s.donnee}</td>
              {/* T-0275 — audit surface: provenance cites file/version names
                  ("hygdata_v41.csv"). Translating makes it unverifiable. */}
              <td className="verbatim">
                {s.provenance}
                {s.lien !== undefined && (
                  <>
                    {' '}
                    <a href={s.lien} target="_blank" rel="noreferrer">
                      amont
                    </a>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Accordeon>
  )
}
