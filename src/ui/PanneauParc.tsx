/**
 * §5.1, T-0404, T-0406 — objectif parc: one readable row per objectif.
 * Row = ring notation ("18–55 mm f/3,5–5,6") + nature (fixed focale, zoom, fisheye); no longer
 * edited in place: pencil reopens the modal (`ModaleObjectif`) filled, as add opens it empty.
 * Each row is a card: click mounts the objectif, mounted card takes the text rule.
 * Trash only when another remains: empty parc would send back to input with no objectif —
 * the state the parc replaces.
 */

import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Objectif } from '../core/objectif.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { ModaleObjectif } from './ModaleObjectif.tsx'
import { parcAvec } from './parc-saisie.ts'

export interface PanneauParcProps {
  readonly objectifs: readonly Objectif[]
  readonly surObjectifs: (v: readonly Objectif[]) => void
  readonly objectifId: string
  readonly surObjectifId: (v: string) => void
}

export function PanneauParc({ objectifs, surObjectifs, objectifId, surObjectifId }: PanneauParcProps) {
  const groupe = useId()
  // `null` closed, `'ajout'` empty, or the objectif being edited.
  const [modale, setModale] = useState<'ajout' | Objectif | null>(null)
  const ouvreur = useRef<HTMLElement | null>(null)

  function ouvre(quoi: 'ajout' | Objectif) {
    ouvreur.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setModale(quoi)
  }

  // Focus returns to the opening button, else it fell to page top.
  function ferme() {
    setModale(null)
    ouvreur.current?.focus()
  }

  return (
    <>
      <div className="parc">
        {objectifs.map((o) => (
          <LigneObjectif
            key={o.id}
            objectif={o}
            monte={o.id === objectifId}
            groupe={groupe}
            retirable={objectifs.length > 1}
            surMonte={() => surObjectifId(o.id)}
            surModifie={() => ouvre(o)}
            surRetire={() => surObjectifs(objectifs.filter((x) => x.id !== o.id))}
          />
        ))}
      </div>
      <button type="button" onClick={() => ouvre('ajout')}>
        Ajouter un objectif
      </button>
      {/* Portalled under `body`: a card that transforms or clips would trap the veil. */}
      {modale !== null &&
        createPortal(
          <ModaleObjectif
            objectif={modale === 'ajout' ? undefined : modale}
            surFermeture={ferme}
            surValide={(o) => {
              surObjectifs(parcAvec(objectifs, o))
              // Just-added one gets mounted; an edit does not change the mount.
              if (modale === 'ajout') surObjectifId(o.id)
              ferme()
            }}
          />,
          document.body,
        )}
    </>
  )
}

interface LigneObjectifProps {
  readonly objectif: Objectif
  readonly monte: boolean
  readonly groupe: string
  readonly retirable: boolean
  readonly surMonte: () => void
  readonly surModifie: () => void
  readonly surRetire: () => void
}

function LigneObjectif(props: LigneObjectifProps) {
  const { nom } = props.objectif
  const { focaleMinMm, focaleMaxMm, typeObjectif } = props.objectif
  const nature = [focaleMinMm === focaleMaxMm ? 'Focale fixe' : 'Zoom', ...(typeObjectif === 'FISHEYE' ? ['fisheye'] : [])].join(' · ')

  /** Card chosen by click, except via trash: removing an objectif must not mount it. */
  const choisit = (cible: EventTarget) => {
    if (!(cible instanceof Element && cible.closest('button') !== null)) props.surMonte()
  }

  return (
    <div
      className="parc-objectif"
      role="group"
      aria-label={`${nom}${props.monte ? ', objectif utilisé' : ''}`}
      data-monte={props.monte}
      onClick={(e) => choisit(e.target)}
    >
      {/* T-0405 — keyboard / screen-reader choice: card chosen by click, but a stateless group
          does not say which is mounted. Native radio does, arrows move between objectifs. Dot
          shows it; invisible radio covers the area to keep the click target. */}
      <span className="parc-choix">
        <input
          type="radio"
          name={props.groupe}
          checked={props.monte}
          aria-label={`Utiliser ${nom}`}
          onChange={props.surMonte}
        />
      </span>
      <span className="parc-nom">
        <span className="parc-notation">{nom}</span>
        <span className="libelle">{nature}</span>
      </span>
      <BoutonGlyphe icone="edit" aide={`Modifier ${nom}`} variante="nu" onClick={props.surModifie} />
      {props.retirable ? (
        <BoutonGlyphe icone="delete" aide={`Retirer ${nom} du parc`} variante="nu" onClick={props.surRetire} />
      ) : (
        <span />
      )}
    </div>
  )
}
