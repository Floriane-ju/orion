/**
 * §11.1 — Mode nuit, et §11.2 — ergonomie de consultation nocturne.
 *
 * Les bâtonnets rétiniens assurent la vision nocturne ; leur sensibilité s'effondre au-delà
 * de 640 nm. Une lumière rouge profond est donc vue par les cônes sans les blanchir.
 * L'adaptation à l'obscurité demande 20 à 30 minutes et se détruit en QUELQUES SECONDES
 * de lumière blanche : le mode est global et sans exception, pas un thème sombre.
 *
 * L'extinction est faite par la palette, pas par un filtre de teinte : la feuille de style
 * bascule des variables dont les canaux vert et bleu sont strictement nuls. Un filtre posé
 * sur une interface claire laisserait la luminance globale trop élevée.
 *
 * T-0140 — le tiroir ne porte plus que ce qui se décide : une bascule et une luminance. Le
 * pourquoi du rouge ne s'arbitre pas, il reste ici. Le type de dalle ne changeait aucun
 * calcul — faire saisir une donnée pour n'obtenir qu'une phrase, c'est afficher la phrase.
 * L'auto-activation au crépuscule décidait à la place de l'observateur, écran basculé au
 * rouge pendant la préparation du matériel : la bascule est un geste, pas une corvée.
 */

import { useEffect } from 'react'
import { K } from '../registry/constants.ts'
import { Bulle } from './Bulle.tsx'
import { Curseur } from './Curseur.tsx'
import { Icone } from './Icone.tsx'
import { Interrupteur } from './Interrupteur.tsx'
import { Tiroir } from './Tiroir.tsx'
import { Etiquette } from './Terme.tsx'

export interface EtatModeNuit {
  readonly actif: boolean
  readonly luminance: number
}

const CLE_STOCKAGE = 'orion.mode-nuit'
/** Clé portée avant que le produit s'appelle Orion : relue une dernière fois, jamais réécrite. */
const CLE_STOCKAGE_ANCIENNE = 'astrofort.mode-nuit'
const LUMINANCE_NOMINALE = 1
const POURCENT = 100

export const ETAT_INITIAL: EtatModeNuit = Object.freeze({
  actif: false,
  luminance: LUMINANCE_NOMINALE,
})

/**
 * Le mode reste actif au redémarrage et entre les vues (§11.1).
 *
 * Le stockage local est hors du périmètre de confiance : une clé retouchée, ou écrite par
 * une version antérieure, ne doit pas se propager dans l'état. Chaque champ de forme
 * inattendue retombe sur `ETAT_INITIAL`, les champs intrus sont ignorés — dont `typeDalle`
 * et `autoActivation`, écrits par les versions d'avant T-0140.
 */
export function litEtatPersiste(): EtatModeNuit {
  if (typeof localStorage === 'undefined') return ETAT_INITIAL
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE) ?? localStorage.getItem(CLE_STOCKAGE_ANCIENNE)
    if (brut === null) return ETAT_INITIAL
    const lu: unknown = JSON.parse(brut)
    if (typeof lu !== 'object' || lu === null) return ETAT_INITIAL
    const champs = lu as Record<string, unknown>
    const plancher = K('LUMINANCE_PLANCHER_MODE_NUIT')
    return {
      actif: typeof champs.actif === 'boolean' ? champs.actif : ETAT_INITIAL.actif,
      luminance:
        typeof champs.luminance === 'number' &&
        champs.luminance >= plancher &&
        champs.luminance <= LUMINANCE_NOMINALE
          ? champs.luminance
          : ETAT_INITIAL.luminance,
    }
  } catch {
    return ETAT_INITIAL
  }
}

export function ecritEtatPersiste(etat: EtatModeNuit): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(etat))
  } catch {
    // Stockage refusé : le mode reste utilisable, il ne survit simplement pas au rechargement.
  }
}

/**
 * Applique la palette au document. La transition est portée par la feuille de style : le
 * basculement est progressif, jamais un flash.
 */
export function appliqueModeNuit(etat: EtatModeNuit): void {
  if (typeof document === 'undefined') return
  const racine = document.documentElement
  racine.dataset.modeNuit = String(etat.actif)
  racine.style.setProperty('--luminance-nuit', String(etat.luminance))
}

export interface ModeNuitProps {
  readonly etat: EtatModeNuit
  readonly surChangement: (etat: EtatModeNuit) => void
}

export function ModeNuit({ etat, surChangement }: ModeNuitProps) {
  useEffect(() => {
    appliqueModeNuit(etat)
    ecritEtatPersiste(etat)
  }, [etat])

  const plancher = K('LUMINANCE_PLANCHER_MODE_NUIT')

  return (
    <section>
      <h2>Mode nuit</h2>
      <Interrupteur
        actif={etat.actif}
        surChangement={(actif) => surChangement({ ...etat, actif })}
      >
        Activer le mode nuit
      </Interrupteur>
      <label>
        <span className="libelle">
          <Etiquette cle="luminance_mode_nuit" />
        </span>
        <Curseur
          libelle="Luminance du mode nuit"
          valeur={etat.luminance}
          min={plancher}
          max={LUMINANCE_NOMINALE}
          pas={plancher}
          texte={`${(etat.luminance * POURCENT).toFixed(0)} %`}
          sur={(luminance) => surChangement({ ...etat, luminance })}
        />
        <span className="etat">{(etat.luminance * POURCENT).toFixed(0)} %</span>
      </label>
      <p className="etat">Sur un écran LCD, un peu de lumière passe toujours.</p>
    </section>
  )
}

/**
 * §11.1 — le mode nuit est un geste de terrain : il se pose en bas à gauche de la scène, sous le
 * rail de la vue, et prend l'allure de ses bascules — une icône seule, que la bulle nomme. Au
 * clic il ouvre le même tiroir qu'avant, vers le haut : la bascule et la luminance se règlent
 * sans quitter le ciel des yeux.
 *
 * La bulle DÉCRIT : le nom accessible est porté par l'icône du résumé, seul contenu du
 * `<summary>`.
 */
export function BoutonModeNuit({ etat, surChangement }: ModeNuitProps) {
  return (
    <Bulle texte="Mode nuit" place="droite">
      <Tiroir
        modificateur="nuit"
        actif={etat.actif}
        resume={<Icone nom={etat.actif ? 'dark_mode' : 'light_mode'} libelle="Mode nuit" />}
      >
        <ModeNuit etat={etat} surChangement={surChangement} />
      </Tiroir>
    </Bulle>
  )
}
