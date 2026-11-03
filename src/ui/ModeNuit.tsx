/**
 * §11.1 — Mode nuit, §11.2 — night-consultation ergonomics.
 * Rods give night vision; sensitivity collapses past 640 nm → deep red seen by cones without
 * bleaching. Dark adaptation 20-30 min, destroyed in SECONDS of white light: mode is global,
 * no exception, not a dark theme.
 * Palette draws, mask extinguishes: sheet switches variables to red-on-black, full-screen mask
 * multiplies each pixel by (255·L, 0, 0) — green/blue zero, luminance set, canvas and photos
 * included. Mask alone on a light UI leaves flats too bright.
 * T-0140 — drawer keeps only luminance (red's rationale not arbitrated): panel-type setting
 * changed no calc. Dusk auto-activation decided for the observer (screen red during gear
 * prep): toggle = gesture, not a chore.
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

/** Applies palette to document. Transition in the stylesheet: progressive, never a flash. */
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
 * T-0375 — toggle is ONE gesture (under the sky, gloved or dazzled, opening a drawer is one
 * too many). Icon and name say what the click PRODUCES, not current state: a self-renaming
 * button carries no `aria-pressed` and no "pressed" flat to light at night.
 */
export function libelleBascule(actif: boolean): { readonly icone: string; readonly nom: string } {
  return actif
    ? { icone: 'light_mode', nom: 'Désactiver le mode nuit' }
    : { icone: 'dark_mode', nom: 'Activer le mode nuit' }
}

/** Key toggling mode nuit, except while typing — listed in keyboard help. */
export const TOUCHE_MODE_NUIT = 'n'

/**
 * Key rule, no DOM: bare letter, no modifier (Ctrl+N opens a window), never while writing
 * (an "n" in a place name must not blank the screen).
 */
export function toucheBasculeModeNuit(
  touche: string,
  avecModificateur: boolean,
  enSaisie: boolean,
): boolean {
  return !avecModificateur && !enSaisie && touche.toLowerCase() === TOUCHE_MODE_NUIT
}

/** Focus is where a letter is typed. */
export function cibleDeSaisie(cible: EventTarget | null): boolean {
  if (!(cible instanceof HTMLElement)) return false
  return cible.isContentEditable || cible.closest('input, textarea, select') !== null
}

/**
 * §11.1 — mode nuit is a field gesture: bottom-left of the scène, under the view rail, styled
 * like its toggles — icon alone, named by the bubble.
 * T-0375 — luminance stays in the adjacent drawer, opening upward: two gestures with mode
 * active, sky always in view. Offered with mode off too, to set before going out.
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
