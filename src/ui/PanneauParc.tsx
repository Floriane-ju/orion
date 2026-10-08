/**
 * §5.1, T-0404 — le parc d'objectifs : ce qu'on possède, saisi une fois.
 *
 * Il vit dans la carte Optique, sous le réglage du moment, et non dans une fenêtre à part :
 * on y vient pour ajouter l'objectif qu'on s'apprête à monter, et le sélecteur d'au-dessus
 * le propose aussitôt. Un seul objectif s'édite à la fois — le formulaire remplace la ligne
 * qu'il corrige, pour qu'on ne se demande jamais lequel on est en train de modifier.
 */

import { useState } from 'react'
import type { Objectif } from '../core/objectif.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { ChampDomaine } from './ChampDomaine.tsx'
import { Interrupteur } from './Interrupteur.tsx'
import { Mention } from './Mention.tsx'
import {
  caracteristiques,
  objectifDeSaisie,
  parcAvec,
  saisieDe,
  SAISIE_OBJECTIF_VIDE,
  type SaisieObjectif,
} from './parc-saisie.ts'

export interface PanneauParcProps {
  readonly objectifs: readonly Objectif[]
  readonly surObjectifs: (v: readonly Objectif[]) => void
}

/** L'objectif en cours d'édition : son identifiant (nouveau ou existant) et son texte. */
interface Edition {
  readonly id: string
  readonly saisie: SaisieObjectif
}

export function PanneauParc({ objectifs, surObjectifs }: PanneauParcProps) {
  const [edition, setEdition] = useState<Edition | null>(null)

  return (
    <>
      {objectifs.length > 0 && (
        <ul className="parc">
          {objectifs.map((o) =>
            edition?.id === o.id ? null : (
              <li key={o.id}>
                <span className="parc-nom">{o.nom}</span>
                <span className="parc-carac">{caracteristiques(o)}</span>
                <BoutonGlyphe icone="edit" aide={`Modifier ${o.nom}`} onClick={() => setEdition({ id: o.id, saisie: saisieDe(o) })} />
                <BoutonGlyphe
                  icone="delete"
                  aide={`Retirer ${o.nom} du parc`}
                  onClick={() => surObjectifs(objectifs.filter((x) => x.id !== o.id))}
                />
              </li>
            ),
          )}
        </ul>
      )}
      {edition === null ? (
        <button type="button" onClick={() => setEdition({ id: crypto.randomUUID(), saisie: SAISIE_OBJECTIF_VIDE })}>
          Ajouter un objectif
        </button>
      ) : (
        <EditeurObjectif
          key={edition.id}
          edition={edition}
          surSaisie={(saisie) => setEdition({ ...edition, saisie })}
          surEnregistre={(objectif) => {
            surObjectifs(parcAvec(objectifs, objectif))
            setEdition(null)
          }}
          surAnnule={() => setEdition(null)}
        />
      )}
    </>
  )
}

interface EditeurObjectifProps {
  readonly edition: Edition
  readonly surSaisie: (v: SaisieObjectif) => void
  readonly surEnregistre: (v: Objectif) => void
  readonly surAnnule: () => void
}

/** Le refus ne se dit qu'à l'enregistrement : à la frappe, un objectif est toujours incomplet. */
function EditeurObjectif({ edition, surSaisie, surEnregistre, surAnnule }: EditeurObjectifProps) {
  const [refus, setRefus] = useState<string | null>(null)
  const s = edition.saisie
  const champ = (cle: keyof Omit<SaisieObjectif, 'fisheye'>) => (v: string) => {
    setRefus(null)
    surSaisie({ ...s, [cle]: v })
  }

  function enregistre() {
    try {
      surEnregistre(objectifDeSaisie(s, edition.id))
    } catch (erreur) {
      setRefus(erreur instanceof Error ? erreur.message : 'Objectif incohérent.')
    }
  }

  return (
    <>
      <div className="champs">
        <label>
          <span className="libelle">Nom</span>
          {/* L'éditeur remplace le bouton qui l'a ouvert : le focus vient au premier champ. */}
          <input autoFocus value={s.nom} placeholder="18-55 du kit" onChange={(e) => champ('nom')(e.target.value)} />
        </label>
      </div>
      <div className="champs paire">
        <ChampDomaine domaine="focale_mm" libelle="Focale min" unite valeur={s.focaleMin} surValeur={champ('focaleMin')} requis />
        <ChampDomaine
          domaine="focale_mm"
          libelle="Focale max"
          unite
          valeur={s.focaleMax}
          surValeur={champ('focaleMax')}
          placeholder="fixe"
        />
        <ChampDomaine
          domaine="ouverture_N"
          libelle="Ouverture grand-angle"
          valeur={s.ouvertureGrandAngle}
          surValeur={champ('ouvertureGrandAngle')}
          requis
        />
        <ChampDomaine
          domaine="ouverture_N"
          libelle="Ouverture télé"
          valeur={s.ouvertureTele}
          surValeur={champ('ouvertureTele')}
          placeholder="constante"
        />
      </div>
      <Interrupteur
        actif={s.fisheye}
        surChangement={(fisheye) => {
          setRefus(null)
          surSaisie({ ...s, fisheye })
        }}
      >
        Objectif fisheye
      </Interrupteur>
      {refus !== null && (
        <Mention ton="erreur" role="alert">
          {refus}
        </Mention>
      )}
      <div className="actions">
        <button type="button" onClick={enregistre}>
          Enregistrer
        </button>
        <button type="button" onClick={surAnnule}>
          Annuler
        </button>
      </div>
    </>
  )
}
