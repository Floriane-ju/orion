/**
 * §5.1, T-0404 — le parc d'objectifs : une ligne par objectif, focale et ouverture.
 *
 * La ligne EST l'objectif : on la corrige en place, sans formulaire à ouvrir ni nom à donner —
 * la notation de bague (« 18–55 mm f/3,5–5,6 ») suffit à le désigner. Le bout max laissé vide
 * fait une focale fixe ou une ouverture constante.
 *
 * Le bouton radio monte l'objectif. La corbeille ne se pose que s'il en reste un autre : un
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
      <div className="parc" role="list">
        <div className="parc-ligne parc-entete" aria-hidden="true">
          <span />
          <span className="libelle">Focale (mm)</span>
          <span className="libelle">Ouverture (f/)</span>
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

  return (
    <div
      className="parc-objectif"
      role="listitem"
      onFocus={() => setEnFrappe(true)}
      onBlur={(e) => {
        // Passer d'un champ de la ligne à l'autre n'est pas en sortir.
        if (!e.currentTarget.contains(e.relatedTarget)) setEnFrappe(false)
      }}
    >
      <div className="parc-ligne">
        <input
          type="radio"
          name="objectif-monte"
          checked={props.monte}
          aria-label={`Utiliser ${nom}`}
          onChange={props.surMonte}
        />
        <span className="parc-paire">
          {champ('focaleMin', 'Focale min')}
          {champ('focaleMax', 'Focale max', 'max')}
        </span>
        <span className="parc-paire">
          {champ('ouvertureGrandAngle', 'Ouverture grand-angle')}
          {champ('ouvertureTele', 'Ouverture télé', 'télé')}
        </span>
        {props.retirable ? (
          <BoutonGlyphe icone="delete" aide={`Retirer ${nom} du parc`} onClick={props.surRetire} />
        ) : (
          <span />
        )}
      </div>
      {refusAffiche !== null && (
        <Mention ton="erreur" role="alert">
          {refusAffiche}
        </Mention>
      )}
    </div>
  )
}
