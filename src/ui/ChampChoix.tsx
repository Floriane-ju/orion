/**
 * T-0215 — un champ à choix fermé : son libellé vient du glossaire, ses options du site
 * d'appel.
 *
 * Ce que le composant factorise n'est pas le balisage — trois lignes — mais le CAST. Chaque
 * site écrivait `e.target.value as CapteurMode` : une assertion non vérifiée, répétée cinq
 * fois, dans un dépôt qui compile en `strict`. Une assertion écrite une fois est une
 * assertion qu'on peut relire ; cinq sont cinq endroits où le type et les `<option>` peuvent
 * diverger en silence.
 *
 * LES OPTIONS RESTENT EN `children`, et ne passent pas par une prop `options`. Deux des
 * sites groupent leurs choix en `<optgroup>` : une prop en tableau plat les aurait laissés
 * dehors, et une prop capable de les décrire aurait fait un second schéma de données pour
 * remplacer du balisage qui se lit déjà. Le site d'appel garde ses `<option>`.
 *
 * UN CHAMP DU PRODUIT NE PASSE PAS PAR ICI, délibérément : le choix de RSB de `Verdicts`
 * porte une valeur NUMÉRIQUE, là où un `<select>` ne rend que des chaînes — sa conversion est
 * sa particularité, pas un défaut à rattraper. Il reste écrit en clair, et l'inventaire le dit.
 * (Le filtre « Type » de `PanneauCibles` n'est plus un `<select>` : c'est un choix multiple.)
 */

import type { ReactNode } from 'react'
import type { TermeGlossaire } from '../registry/glossaire.ts'
import { Etiquette } from './Terme.tsx'

export interface ChampChoixProps<T extends string> {
  /** Le terme du glossaire qui nomme le champ — jamais une chaîne écrite à la main. */
  readonly cle: TermeGlossaire
  /** Précision calculée au contact, ajoutée à la bulle du terme. */
  readonly precision?: string | undefined
  readonly valeur: T
  readonly surChangement: (valeur: T) => void
  /** Les `<option>` et `<optgroup>`, écrits au site d'appel. */
  readonly children: ReactNode
}

export function ChampChoix<T extends string>({
  cle,
  precision,
  valeur,
  surChangement,
  children,
}: ChampChoixProps<T>) {
  return (
    <label>
      <span className="libelle">
        <Etiquette cle={cle} precision={precision} />
      </span>
      <select value={valeur} onChange={(e) => surChangement(e.target.value as T)}>
        {children}
      </select>
    </label>
  )
}
