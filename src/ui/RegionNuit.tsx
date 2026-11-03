/**
 * "Nuit" tab: when night starts, its fond de ciel value, why the plan may be absent.
 * Each number unfolds to its formula (§1.5.2, §10.1), each technical term carries its definition.
 */

import type { FenetreNocturne } from '../core/nuit.ts'
import { dureeMinLisible } from '../registry/ecriture.ts'
import { MIN_PAR_H } from '../core/unites.ts'
import { nomDeLaNuit } from '../core/nuit-datee.ts'
import type { FondDeCiel } from '../core/fond-ciel.ts'
import type { Traced } from '../core/traced.ts'
import { TracedValue } from './TracedValue.tsx'
import { Mention } from './Mention.tsx'
import { LIBELLE_ETAT_NUIT, LIBELLE_SOURCE_SB } from '../registry/libelles.ts'
import { dateHeure } from './horaire.ts'

function instant(date: Date | null): string {
  return date === null ? '—' : dateHeure(date)
}

export interface RegionNuitProps {
  readonly nuit: FenetreNocturne
  readonly ciel: FondDeCiel
  readonly offsetMidi: Traced<number>
  /** T-0267 — EVENING of the planned night (sunset date). */
  readonly nuitIso: string
  /** True while no verified catalogue feeds the plan: region says so in clear. */
  readonly planIndisponible: boolean
}

export function RegionNuit(props: RegionNuitProps) {
  return (
    <>
      <FenetreNocturneVue
        nuit={props.nuit}
        offsetMidi={props.offsetMidi}
        nuitIso={props.nuitIso}
      />
      <FondDeCielVue ciel={props.ciel} />
      {props.planIndisponible && (
        <section>
          <h2>Plan de session</h2>
          <Mention ton="cause">
            Catalogues en cours de vérification : pas encore de plan.
          </Mention>
        </section>
      )}
    </>
  )
}

/** §2.3 — night bounds, Sun set to Sun rise. */
function FenetreNocturneVue({
  nuit,
  offsetMidi,
  nuitIso,
}: {
  readonly nuit: FenetreNocturne
  readonly offsetMidi: Traced<number>
  readonly nuitIso: string
}) {
  return (
    <section>
      <h2>Fenêtre nocturne</h2>
      {/* T-0267 — night named by both dates: past midnight "17/09" alone leaves the evening
          ambiguous, exactly when the card is read. */}
      <p className="etat">{nomDeLaNuit(nuitIso)}</p>
      <p className="etat">état : {LIBELLE_ETAT_NUIT[nuit.etat]}</p>
      {nuit.cause !== undefined && <Mention ton="cause">{nuit.cause}</Mention>}
      {/* T-0264 — `instants`: each value = date AND time, one line. Heading folds when the card
          narrows. */}
      <table className="instants">
        <tbody>
          <tr>
            <th>Coucher du Soleil</th>
            <td>{instant(nuit.coucherSoleil)}</td>
          </tr>
          <tr>
            <th>Début de nuit astronomique (−18°)</th>
            <td>{instant(nuit.debutNuitAstronomique)}</td>
          </tr>
          <tr>
            <th>Milieu de nuit vrai</th>
            <td>{instant(nuit.milieuNuitVrai)}</td>
          </tr>
          <tr>
            <th>Fin de nuit astronomique</th>
            <td>{instant(nuit.finNuitAstronomique)}</td>
          </tr>
          <tr>
            <th>Lever du Soleil</th>
            <td>{instant(nuit.leverSoleil)}</td>
          </tr>
          <tr>
            <th>Durée de nuit astronomique</th>
            <td>{dureeMinLisible(nuit.dureeNuitH * MIN_PAR_H)}</td>
          </tr>
        </tbody>
      </table>
      <TracedValue terme="midi_solaire_vrai" trace={offsetMidi} decimales={1} unite="min" />
    </section>
  )
}

/** §2.2 — where the retained fond de ciel comes from, and what it shows to the naked eye. */
function FondDeCielVue({ ciel }: { readonly ciel: FondDeCiel }) {
  return (
    <section>
      <h2>Fond de ciel</h2>
      <p className="etat">source : {LIBELLE_SOURCE_SB[ciel.sourceSb]}</p>
      {ciel.confirmationRequise !== undefined && (
        <Mention ton="cause">{ciel.confirmationRequise}</Mention>
      )}
      <TracedValue terme="fond_de_ciel" trace={ciel.sbCiel} unite="mag/arcsec²" />
      <TracedValue terme="magnitude_limite_oeil" trace={ciel.mLimOeil} unite="mag" />
    </section>
  )
}
