/**
 * §5.1, T-0404 — le parc d'objectifs : une ligne par objectif, focale et ouverture.
 *
 * La ligne EST l'objectif : on la corrige en place, sans formulaire à ouvrir ni nom à donner —
 * la notation de bague (« 18–55 mm f/3,5–5,6 ») suffit à le désigner. Le bout max laissé vide
 * fait une focale fixe ou une ouverture constante.
 *
 * Chaque ligne est une carte : y entrer monte l'objectif, la carte montée est cernée. La case
 * dit s'il est fisheye, ce qui choisit la projection. La corbeille ne se pose que s'il en reste un autre : un
 * parc vide renverrait à une saisie sans objectif, et c'est l'état que le parc remplace.
 */

import { useState } from 'react'
import type { Objectif } from '../core/objectif.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { Mention } from './Mention.tsx'
import { objectifDeSaisie, parcAvec, saisieDe, type SaisieObjectif } from './parc-saisie.ts'

export interface PanneauParcProps {
  readonly objectifs: readonly Objectif[]
  readonly surObjectifs: (v: readonly Objectif[]) => void
  readonly objectifId: string
  readonly surObjectifId: (v: string) => void
}

export function PanneauParc({ objectifs, surObjectifs, objectifId, surObjectifId }: PanneauParcProps) {
  const dernier = objectifs.at(-1)
  return (
    <>
      <div className="parc">
        <div className="parc-entete" aria-hidden="true">
          <span className="libelle">Focale (mm)</span>
          <span className="libelle">Ouverture (f/)</span>
          <span className="libelle">Fisheye</span>
          <span />
        </div>
        {objectifs.map((o) => (
          <LigneObjectif
            key={o.id}
            objectif={o}
            monte={o.id === objectifId}
            retirable={objectifs.length > 1}
            surMonte={() => surObjectifId(o.id)}
            surObjectif={(modifie) => surObjectifs(parcAvec(objectifs, modifie))}
            surRetire={() => surObjectifs(objectifs.filter((x) => x.id !== o.id))}
          />
        ))}
      </div>
      {/* Le nouvel objectif part du dernier : une ligne valide d'emblée, qu'on corrige. */}
      {dernier !== undefined && (
        <button
          type="button"
          onClick={() => surObjectifs([...objectifs, { ...dernier, id: crypto.randomUUID() }])}
        >
          Ajouter un objectif
        </button>
      )}
    </>
  )
}

interface LigneObjectifProps {
  readonly objectif: Objectif
  readonly monte: boolean
  readonly retirable: boolean
  readonly surMonte: () => void
  readonly surObjectif: (v: Objectif) => void
  readonly surRetire: () => void
}

/**
 * Le texte de la ligne vit ici : « 1 » en route vers « 18 » n'est pas un objectif, et le parc
 * ne reçoit que des objectifs valides. Le refus se dit sous la ligne tant qu'il dure.
 */
function LigneObjectif(props: LigneObjectifProps) {
  const { objectif } = props
  const [saisie, setSaisie] = useState<SaisieObjectif>(() => saisieDe(objectif))
  const [refus, setRefus] = useState<string | null>(null)
  // Le refus attend qu'on quitte la ligne : « 1 » en route vers « 18 » n'est pas une faute.
  const [enFrappe, setEnFrappe] = useState(false)
  const refusAffiche = enFrappe ? null : refus
  const nom = objectif.nom

  function change(cle: keyof SaisieObjectif, v: string) {
    const suivante = { ...saisie, [cle]: v }
    setSaisie(suivante)
    try {
      props.surObjectif(objectifDeSaisie(suivante, objectif.id, objectif.typeObjectif))
      setRefus(null)
    } catch (erreur) {
      setRefus(erreur instanceof Error ? erreur.message : 'Objectif incohérent.')
    }
  }

  const champ = (cle: keyof SaisieObjectif, aide: string, placeholder?: string) => (
    <input
      value={saisie[cle]}
      inputMode="decimal"
      aria-label={`${aide} — ${nom}`}
      {...(placeholder === undefined ? {} : { placeholder })}
      {...(refusAffiche === null ? {} : { 'aria-invalid': true })}
      onChange={(e) => change(cle, e.target.value)}
    />
  )

  /**
   * La carte se choisit en y entrant — clic ou focus dans un de ses champs —, sauf par la
   * corbeille : retirer un objectif ne doit pas le monter au passage.
   */
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
      onFocus={(e) => {
        setEnFrappe(true)
        choisit(e.target)
      }}
      onBlur={(e) => {
        // Passer d'un champ de la ligne à l'autre n'est pas en sortir.
        if (!e.currentTarget.contains(e.relatedTarget)) setEnFrappe(false)
      }}
    >
        <span className="parc-paire">
          {champ('focaleMin', 'Focale min')}
          {champ('focaleMax', 'Focale max', 'max')}
        </span>
        <span className="parc-paire">
          {champ('ouvertureGrandAngle', 'Ouverture grand-angle')}
          {champ('ouvertureTele', 'Ouverture télé', 'télé')}
        </span>
        <input
          type="checkbox"
          checked={objectif.typeObjectif === 'FISHEYE'}
          aria-label={`Fisheye — ${nom}`}
          onChange={(e) => props.surObjectif({ ...objectif, typeObjectif: e.target.checked ? 'FISHEYE' : 'RECTILINEAIRE' })}
        />
        {props.retirable ? (
          <BoutonGlyphe icone="delete" aide={`Retirer ${nom} du parc`} onClick={props.surRetire} />
        ) : (
          <span />
        )}
      {refusAffiche !== null && (
        <Mention ton="erreur" role="alert">
          {refusAffiche}
        </Mention>
      )}
    </div>
  )
}
