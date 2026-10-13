/**
 * §5.1, T-0404, T-0406 — le parc d'objectifs : une ligne par objectif, qui se lit.
 *
 * La ligne dit l'objectif par sa notation de bague (« 18–55 mm f/3,5–5,6 ») et sa nature —
 * focale fixe ou zoom, fisheye — et ne se corrige plus en place : le crayon rouvre la modale
 * (`ModaleObjectif`) garnie de l'objectif, comme l'ajout l'ouvre vide.
 *
 * Chaque ligne est une carte : un clic monte l'objectif, la carte montée prend le filet du texte.
 * La corbeille ne se pose que s'il en reste un autre : un parc vide renverrait à une saisie sans
 * objectif, et c'est l'état que le parc remplace.
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
  // `null` fermée, `'ajout'` vide, ou l'objectif qu'on retouche.
  const [modale, setModale] = useState<'ajout' | Objectif | null>(null)
  const ouvreur = useRef<HTMLElement | null>(null)

  function ouvre(quoi: 'ajout' | Objectif) {
    ouvreur.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setModale(quoi)
  }

  // Le focus revient au bouton qui a ouvert la modale : sans lui, il retombait en haut de page.
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
      {/* Portée sous `body` : une carte qui transforme ou rogne son contenu enfermerait le voile. */}
      {modale !== null &&
        createPortal(
          <ModaleObjectif
            objectif={modale === 'ajout' ? undefined : modale}
            surFermeture={ferme}
            surValide={(o) => {
              surObjectifs(parcAvec(objectifs, o))
              // Celui qu'on vient d'ajouter est celui qu'on va monter ; une retouche ne change pas le montage.
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

  /** La carte se choisit d'un clic, sauf par la corbeille : retirer un objectif ne doit pas le monter au passage. */
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
      {/* T-0405 — le choix au clavier et au lecteur d'écran : la carte se choisit au clic,
          mais un groupe sans état ne dit pas lequel est monté. Le radio natif le dit, et ses
          flèches passent d'un objectif à l'autre. Le rond le montre ; le radio, invisible,
          couvre la zone pour en garder la cible de clic. */}
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
