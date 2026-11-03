/**
 * §2.2 — the site: where we are, under which sky.
 * T-0113 — fields moved out of the always-open right panel to the "Site" card on scène (no
 * `<section>`/`h2`: card has frame and name). Set once per outing, not per cible; what had to
 * stay was READING values without click (card's pastille carries it).
 * Date stays in the bar: dates the whole night, changes during planning, unlike coordinates.
 * T-0228 — Bortle table source + validity limit moved to "info" tiroir (static, not input-bound).
 * Manual horizon-mask survey removed: terrain relief is drawn on planétarium, read there.
 */

import type { MasqueHorizon } from '../core/site.ts'
import { libelleFlag } from '../registry/libelles.ts'
import { DOMAINES } from '../registry/domains.ts'
import { ChampDomaine } from './ChampDomaine.tsx'
import { Etiquette } from './Terme.tsx'
import { Mention } from './Mention.tsx'
import { ChoixLieu } from './ChoixLieu.tsx'

export interface ChampsSiteProps {
  readonly latitude: string
  readonly surLatitude: (v: string) => void
  readonly longitude: string
  readonly surLongitude: (v: string) => void
  /** Read-only: relief ground at entered lieu, written by the calcul chain. */
  readonly altitude: string
  readonly bortle: string
  readonly surBortle: (v: string) => void
  readonly sqm: string
  readonly surSqm: (v: string) => void
  /** §4.1 — mask in force: flat fallback [HYP] is stated under the card. */
  readonly masque: MasqueHorizon
  /**
   * Refusal cause of current input, `null` if lieu is calculable. Scène keeps showing last valid
   * sky; refusal said here, at foot of the fields that produced it.
   */
  readonly cielRefus: string | null
}

export function ChampsSite(props: ChampsSiteProps) {
  return (
    <>
      {/* T-0363 — map writes both following fields: they stay the truth. */}
      <ChoixLieu
        latitude={props.latitude}
        longitude={props.longitude}
        surLieu={(latitude, longitude) => {
          props.surLatitude(latitude)
          props.surLongitude(longitude)
        }}
      />
      {/* Relief is read on planétarium; its absence isn't visible there. While loading, mask has no
          note: nothing shown. */}
      {props.masque.estHypothese && props.masque.note !== undefined && (
        <Mention ton="cause">
          {props.masque.flags?.map((f) => `${libelleFlag(f)} `).join('')}
          {props.masque.note}
        </Mention>
      )}
      {/* Latitude and longitude read as one word (a lieu), set together: paired side by side, like
          focale and ouverture (T-0234). */}
      <div className="champs paire">
        <ChampDomaine
          domaine="latitude_deg"
          glisse
          cle="latitude"
          valeur={props.latitude}
          surValeur={props.surLatitude}
          requis
        />
        <ChampDomaine
          domaine="longitude_deg"
          glisse
          cle="longitude"
          valeur={props.longitude}
          surValeur={props.surLongitude}
          requis
        />
      </div>
      {/* Altitude no longer typed: it's relief ground at the set lieu. A reading, not a field:
          nothing invites a click. */}
      <p className="tracee tracee-vide">
        <span>
          <Etiquette cle="altitude_site" />
        </span>
        <span className="tracee-valeur">
          {props.altitude} {DOMAINES.altitude_m.unite}
        </span>
      </p>
      <div className="champs">
        {/* Bortle is an INTEGER index (1-9, DOMAINES.bortle_declare): numeric keypad without
            decimal separator avoids input no domain value would accept. */}
        <ChampDomaine
          domaine="bortle_declare"
          glisse
          cle="bortle"
          valeur={props.bortle}
          surValeur={props.surBortle}
          inputMode="numeric"
        />
        <ChampDomaine
          domaine="sqm_mesure"
          cle="sqm"
          valeur={props.sqm}
          surValeur={props.surSqm}
          placeholder="prioritaire si renseigné"
        />
      </div>

      {props.cielRefus !== null && (
        <Mention ton="erreur" role="status">
          {props.cielRefus} — le ciel garde la dernière valeur valide.
        </Mention>
      )}

    </>
  )
}
