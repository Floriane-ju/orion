/**
 * §11.1 — Mode nuit, et §11.2 — ergonomie de consultation nocturne.
 *
 * Les bâtonnets rétiniens assurent la vision nocturne ; leur sensibilité s'effondre au-delà
 * de 640 nm. Une lumière rouge profond est donc vue par les cônes sans les blanchir.
 * L'adaptation à l'obscurité demande 20 à 30 minutes et se détruit en QUELQUES SECONDES
 * de lumière blanche : le mode est global et sans exception, pas un thème sombre.
 *
 * La palette dessine, le masque éteint : la feuille bascule des variables rouge sur noir,
 * et un masque plein écran multiplie chaque pixel par (255·L, 0, 0) — vert et bleu à zéro,
 * luminance réglée, canevas et photos compris. Le masque seul sur une interface claire
 * laisserait ses aplats trop lumineux.
 *
 * T-0140 — le tiroir ne porte plus que ce qui se décide : la luminance. Le
 * pourquoi du rouge ne s'arbitre pas, il reste ici. Le type de dalle ne changeait aucun
 * calcul — faire saisir une donnée pour n'obtenir qu'une phrase, c'est afficher la phrase.
 * L'auto-activation au crépuscule décidait à la place de l'observateur, écran basculé au
 * rouge pendant la préparation du matériel : la bascule est un geste, pas une corvée.
 */

import { useEffect } from 'react'
import { pourcentage } from '../registry/ecriture.ts'
import { K } from '../registry/constants.ts'
import { Bulle } from './Bulle.tsx'
import { Curseur } from './Curseur.tsx'
import { Icone } from './Icone.tsx'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { Tiroir } from './Tiroir.tsx'
import { Etiquette } from './Terme.tsx'
import { LUMINANCE_NOMINALE, ecritEtatPersiste, type EtatModeNuit } from '../data/mode-nuit.ts'

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
          texte={pourcentage(etat.luminance)}
          sur={(luminance) => surChangement({ ...etat, luminance })}
        />
        <span className="etat">{pourcentage(etat.luminance)}</span>
      </label>
      <p className="etat">Sur un écran LCD, un peu de lumière passe toujours.</p>
    </section>
  )
}

/**
 * T-0375 — la bascule est UN geste. Sous le ciel, en gants ou ébloui, ouvrir un tiroir pour
 * atteindre un interrupteur est un geste de trop. L'icône et le nom disent ce que le clic
 * PRODUIT, pas l'état courant : un bouton qui change de nom selon l'état ne porte donc pas
 * `aria-pressed`, et n'a pas d'aplat « enfoncé » à allumer la nuit.
 */
export function libelleBascule(actif: boolean): { readonly icone: string; readonly nom: string } {
  return actif
    ? { icone: 'light_mode', nom: 'Désactiver le mode nuit' }
    : { icone: 'dark_mode', nom: 'Activer le mode nuit' }
}

/** La touche qui bascule le mode nuit, partout sauf en saisie — listée dans l'aide clavier. */
export const TOUCHE_MODE_NUIT = 'n'

/**
 * La règle de la touche, sans DOM : une lettre seule, sans modificateur (Ctrl+N ouvre une
 * fenêtre), et jamais quand on écrit — un « n » tapé dans un nom de lieu n'éteint pas l'écran.
 */
export function toucheBasculeModeNuit(
  touche: string,
  avecModificateur: boolean,
  enSaisie: boolean,
): boolean {
  return !avecModificateur && !enSaisie && touche.toLowerCase() === TOUCHE_MODE_NUIT
}

/** Le focus est dans un endroit où une lettre s'écrit. */
export function cibleDeSaisie(cible: EventTarget | null): boolean {
  if (!(cible instanceof HTMLElement)) return false
  return cible.isContentEditable || cible.closest('input, textarea, select') !== null
}

/**
 * §11.1 — le mode nuit est un geste de terrain : il se pose en bas à gauche de la scène, sous le
 * rail de la vue, et prend l'allure de ses bascules — une icône seule, que la bulle nomme.
 *
 * T-0375 — la luminance reste dans le tiroir voisin, qui s'ouvre vers le haut : deux gestes du
 * mode actif, le ciel toujours sous les yeux. Il reste offert mode éteint, pour régler avant
 * de sortir.
 */
export function BoutonModeNuit({ etat, surChangement }: ModeNuitProps) {
  const { icone, nom } = libelleBascule(etat.actif)
  return (
    <div className="mode-nuit-commandes">
      <BoutonGlyphe
        icone={icone}
        aide={nom}
        place="droite"
        variante="flottant"
        classe="bouton-mode-nuit"
        onClick={() => surChangement({ ...etat, actif: !etat.actif })}
      />
      <Bulle texte="Luminance du mode nuit" place="droite">
        <Tiroir
          modificateur="nuit"
          resume={<Icone nom="brightness_medium" libelle="Réglages du mode nuit" />}
        >
          <ModeNuit etat={etat} surChangement={surChangement} />
        </Tiroir>
      </Bulle>
    </div>
  )
}
