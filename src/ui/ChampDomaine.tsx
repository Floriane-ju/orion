/**
 * §5.1 et §10.1 — un champ numérique : sa borne vient du registre, jamais du composant, et
 * laisser un champ facultatif vide n'est pas une erreur — c'est déclarer la grandeur inconnue.
 *
 * T-0209 — il était local à `PanneauBoitier` sous le nom `ChampCapteur`, et les autres écrans
 * posaient des `<input>` nus. Trois écritures du même champ, donc trois occasions d'oublier
 * quelque chose : c'est ainsi qu'aucun champ de l'application ne portait `aria-invalid`, et
 * que T-0192 a dû ajouter un test pour rattraper les `inputMode` manquants.
 *
 * T-0208 — le champ dit LUI-MÊME quand sa valeur a été ramenée dans le domaine. La cause se
 * lit au pied du champ qui l'a produite, pas en bas du panneau : c'est le seul endroit où
 * elle désigne sans ambiguïté la valeur à corriger.
 */

import { useId } from 'react'
import { nombreLibre } from '../registry/ecriture.ts'
import { DOMAINES, type DomaineId } from '../registry/domains.ts'
import type { TermeGlossaire } from '../registry/glossaire.ts'
import { nombreSaisi } from './saisie-bornee.ts'
import { Bulle } from './Bulle.tsx'
import { Etiquette } from './Terme.tsx'
import { Icone } from './Icone.tsx'
import { Mention } from './Mention.tsx'

/**
 * T-0199 — le signe qui dit qu'une grandeur manque, posé au bout du libellé du champ qu'elle
 * concerne. §11.1 : le rouge ne porte jamais seul, la forme du glyphe le double.
 *
 * `nomme` plutôt que `describedby` : le glyphe n'a pas d'autre nom que la note. Il est
 * atteignable au clavier — la bulle s'ouvre sur `:focus-visible`, et une note qui ne sort
 * qu'au survol n'existe pas pour qui n'a pas de souris.
 */
export function AlerteChamp({ note }: { readonly note: string }) {
  return (
    <Bulle texte={note} place="bas" nomme>
      <span className="alerte-champ" role="img" tabIndex={0}>
        <Icone nom="warning" />
      </span>
    </Bulle>
  )
}

export interface ChampDomaineProps {
  readonly domaine: DomaineId
  /** §10.1 — le libellé est une clé du glossaire quand le terme y figure. */
  readonly cle?: TermeGlossaire
  /** Le libellé en clair, pour un champ qui n'a pas d'entrée au glossaire. */
  readonly libelle?: string
  /** Glose de remplacement pour `cle`, calculée au contact plutôt que générique. */
  readonly glose?: string | undefined
  readonly valeur: string
  readonly surValeur: (v: string) => void
  /** Sans lui, la sortie n'existe pas : le placeholder annonce alors la plage attendue. */
  readonly requis?: boolean
  /** T-0199 — ce que le registre met à la place, quand la grandeur reste vide. */
  readonly note?: string | undefined
  /** L'unité du domaine, suffixée au libellé. Inutile là où le libellé la porte déjà. */
  readonly unite?: boolean
  readonly placeholder?: string
  /** Un indice ENTIER n'ouvre pas le clavier à séparateur décimal (T-0192). */
  readonly inputMode?: 'decimal' | 'numeric'
}

export function ChampDomaine(props: ChampDomaineProps) {
  const d = DOMAINES[props.domaine]
  const idRefus = useId()
  // Un champ vide n'est pas une valeur fautive : c'est un état transitoire de frappe (T-0149),
  // et la conséquence de son absence est déjà dite par `note` ou par le panneau.
  const refus = props.valeur.trim() === '' ? null : nombreSaisi(props.domaine, props.valeur).refus
  const placeholder = props.placeholder ?? (props.requis === true ? `${nombreLibre(d.min)} à ${nombreLibre(d.max)}` : 'inconnu')

  return (
    <label>
      <span className="libelle champ-titre">
        <span>
          {props.cle === undefined ? (
            props.libelle
          ) : (
            <Etiquette cle={props.cle} glose={props.glose} />
          )}
          {props.unite === true && <span className="casse-exacte"> ({d.unite})</span>}
        </span>
        {props.note !== undefined && <AlerteChamp note={props.note} />}
      </span>
      <input
        value={props.valeur}
        inputMode={props.inputMode ?? 'decimal'}
        placeholder={placeholder}
        {...(refus === null ? {} : { 'aria-invalid': true, 'aria-errormessage': idRefus })}
        onChange={(e) => props.surValeur(e.target.value)}
      />
      {refus !== null && (
        <Mention ton="erreur" id={idRefus} role="status">
          {refus}
        </Mention>
      )}
    </label>
  )
}
