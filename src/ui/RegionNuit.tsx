/**
 * L'onglet « Nuit » : quand la nuit commence, ce qu'elle vaut en fond de ciel, et pourquoi
 * le plan de session peut être absent.
 *
 * Chaque nombre reste dépliable jusqu'à sa formule (§1.5.2, §10.1), et chaque terme technique
 * porte sa définition au contact.
 */

import type { FenetreNocturne } from '../core/night.ts'
import { nomDeLaNuit } from '../core/nuit-datee.ts'
import type { FondDeCiel } from '../core/sky-background.ts'
import type { Traced } from '../core/traced.ts'
import { TracedValue } from './TracedValue.tsx'
import { Mention } from './Mention.tsx'
import { LIBELLE_ETAT_NUIT, LIBELLE_SOURCE_SB } from '../registry/libelles.ts'

function heure(date: Date | null): string {
  return date === null ? '—' : date.toLocaleString('fr-FR')
}

export interface RegionNuitProps {
  readonly nuit: FenetreNocturne
  readonly ciel: FondDeCiel
  readonly offsetMidi: Traced<number>
  /** T-0267 — le SOIR de la nuit planifiée, celui du coucher du Soleil. */
  readonly nuitIso: string
  /** Vrai tant qu'aucun catalogue vérifié n'alimente le plan : la région le dit en clair. */
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

/** §2.3 — les bornes de la nuit, du coucher du Soleil à son lever. */
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
      {/* T-0267 — la nuit se nomme par ses deux dates : passé minuit, « 17/09 » seul laisse
          le doute sur le soir désigné, et c'est à ce moment-là qu'on lit la carte. */}
      <p className="etat">{nomDeLaNuit(nuitIso)}</p>
      <p className="etat">état : {LIBELLE_ETAT_NUIT[nuit.etat]}</p>
      {nuit.cause !== undefined && <Mention ton="cause">{nuit.cause}</Mention>}
      {/* T-0264 — `instants` : chaque valeur est une date ET une heure, et elle tient sur une
          ligne. C'est l'intitulé qui se replie quand la carte se resserre. */}
      <table className="instants">
        <tbody>
          <tr>
            <th>Coucher du Soleil</th>
            <td>{heure(nuit.coucherSoleil)}</td>
          </tr>
          <tr>
            <th>Début de nuit astronomique (−18°)</th>
            <td>{heure(nuit.debutNuitAstronomique)}</td>
          </tr>
          <tr>
            <th>Milieu de nuit vrai</th>
            <td>{heure(nuit.milieuNuitVrai)}</td>
          </tr>
          <tr>
            <th>Fin de nuit astronomique</th>
            <td>{heure(nuit.finNuitAstronomique)}</td>
          </tr>
          <tr>
            <th>Lever du Soleil</th>
            <td>{heure(nuit.leverSoleil)}</td>
          </tr>
          <tr>
            <th>Durée de nuit astronomique</th>
            <td>{nuit.dureeNuitH.toFixed(2)} h</td>
          </tr>
        </tbody>
      </table>
      <TracedValue terme="midi_solaire_vrai" trace={offsetMidi} decimales={1} unite="min" />
    </section>
  )
}

/** §2.2 — d'où vient le fond de ciel retenu, et ce qu'il laisse voir à l'œil nu. */
function FondDeCielVue({ ciel }: { readonly ciel: FondDeCiel }) {
  return (
    <section>
      <h2>Fond de ciel</h2>
      <p className="etat">source : {LIBELLE_SOURCE_SB[ciel.sourceSb]}</p>
      {ciel.confirmationRequise !== undefined && (
        <Mention ton="cause">{ciel.confirmationRequise}</Mention>
      )}
      <TracedValue terme="fond_de_ciel" trace={ciel.sbCiel} unite="mag/as²" />
      <TracedValue terme="magnitude_limite_oeil" trace={ciel.mLimOeil} unite="mag" />
    </section>
  )
}
