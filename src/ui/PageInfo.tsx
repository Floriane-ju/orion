/**
 * §12.1, §12.3, T-0325 — "info" modal: base state, settings, data provenance.
 * Replaces the two top-bar drawers (T-0228 info, T-0184 réglages): long contents (dégradation
 * matrix, 5 sliders, sources) sat under a scrollbar. Near-full-width modal, no tab change:
 * weights set here are the displayed plan's — another tab has its own state.
 * No React state: page = `#info` anchor target, `:target` shows it. Browser back closes,
 * direct link opens, scène stays mounted below (nothing recomputed). Escape closes via the
 * single listener (`gere-echap.ts`).
 */

import { useEffect } from 'react'
import { nombre } from '../registry/ecriture.ts'
import { etatProfondeur } from '../core/projection.ts'
import type { EtatDemarrage } from '../data/bootstrap.ts'
import type { ModeReseau } from '../data/degradation.ts'
import type { Persistance } from './app-donnees.ts'
import type { SaisiePoids } from './app-saisie.ts'
import { GLOSSAIRE } from '../registry/glossaire.ts'
import { Bulle } from './Bulle.tsx'
import { CalculsAffiches } from './CalculsAffiches.tsx'
import { Icone } from './Icone.tsx'
import { LegendeCouleurs } from './LegendeCouleurs.tsx'
import { MenuReglages } from './MenuReglages.tsx'
import { Sources } from './Sources.tsx'
import { SeuilsDeclinaison } from './SeuilsDeclinaison.tsx'
import type { SeuilsSite } from '../core/site.ts'
import { ALERTE_VERIFICATION, Verification } from './Verification.tsx'
import {
  useTrancheScene,
  type EtatScene,
  vueRealisteScene,
} from './scene-etat.ts'

/** Page anchor: top-bar button leads in, Escape and "fermer" leave. */
const ANCRE_INFO = 'info'

/** T-0325 — info button's name, said by its bubble (button carries only its icon). */
const AIDE_INFO = 'Infos de l’app'

/**
 * T-0325 — button leading to the page. Bottom-left of scène under mode nuit: the two gestures
 * leaving the sky sit together. T-0041 — persistence alert shows in words, names its section
 * (red never alone, §11.1). At rest icon only (bubble names it); on alert text returns: says
 * the failure, becomes the link name.
 */
export function BoutonInfo({ persistance }: { readonly persistance: Persistance }) {
  return (
    <Bulle texte={AIDE_INFO} place="droite" nomme={!persistance.echec}>
      <a href={`#${ANCRE_INFO}`} className="bouton-info" data-alerte={persistance.echec}>
        <Icone nom="info" />
        {persistance.echec && ALERTE_VERIFICATION}
      </a>
    </Bulle>
  )
}

export interface PageInfoProps {
  readonly etat: EtatDemarrage | null
  readonly modeReseau: ModeReseau
  readonly persistance: Persistance
  readonly poids: SaisiePoids
  /** Faintest magnitude of the loaded pack: beyond it the champ looks poorer than it is. */
  readonly profondeurMag: number
  /** §2.2 — site fond de ciel: caps depth in vue réaliste. */
  readonly sbCiel: number | null
  /** Legend swatches use the current mode's tints. */
  readonly modeNuit: boolean
  /** §4.1 — site declination thresholds, absent if site input is refused. */
  readonly seuils?: SeuilsSite
}

/** Module-level selectors — `useTrancheScene` needs a stable identity. */
function fovScene(etat: EtatScene): number {
  return etat.vue.fovDeg
}
/**
 * T-0325 — displayed depth, moved down from the top bar. Outside sections, under the title:
 * a line no click may hide. Full glossary explanation (+ exhausted-catalogue cause if any)
 * holds the hover: gloss alone would not say why depth moves with zoom (§10.1).
 */
interface LectureProfondeurProps {
  readonly profondeurMag: number
  readonly sbCiel: number | null
}

function LectureProfondeur(props: LectureProfondeurProps) {
  const fovDeg = useTrancheScene(fovScene)
  const vueRealiste = useTrancheScene(vueRealisteScene)
  const profondeur = etatProfondeur(fovDeg, props.profondeurMag, props.sbCiel, vueRealiste)
  const entree = GLOSSAIRE.magnitude_limite_rendue
  const aide = (
    <>
      <span className="bulle-ligne">
        {profondeur.cause === undefined
          ? entree.explication
          : `${entree.explication} ${profondeur.cause}`}
      </span>
      {entree.consequence !== undefined && (
        <span className="bulle-ligne">{entree.consequence}</span>
      )}
    </>
  )

  return (
    <p className="etat page-info-profondeur">
      <span className="terme">
        <Bulle texte={aide} place="bas">
          <abbr>
            {entree.libelle} {nombre(profondeur.magLimite.value, 1)} mag
          </abbr>
        </Bulle>
      </span>
    </p>
  )
}

export function PageInfo(props: PageInfoProps) {
  // Direct link to `#info` resolves BEFORE React mounts the page: `:target` has nothing to hit.
  // Re-navigating to the same anchor once mounted fixes it.
  useEffect(() => {
    if (location.hash === `#${ANCRE_INFO}`) location.replace(`#${ANCRE_INFO}`)
  }, [])

  return (
    <div
      id={ANCRE_INFO}
      className="page-info"
      role="dialog"
      tabIndex={-1}
      aria-labelledby="page-info-titre"
    >
      <div className="page-info-corps">
        <header className="page-info-entete">
          <h2 id="page-info-titre">Informations et réglages</h2>
          <a href="#" className="page-info-fermer" aria-label="Fermer et revenir au ciel">
            <Icone nom="close" />
          </a>
        </header>
        <LectureProfondeur profondeurMag={props.profondeurMag} sbCiel={props.sbCiel} />
        {/* Legend first: what one comes for while looking at the sky. */}
        <LegendeCouleurs modeNuit={props.modeNuit} />
        {/* Then vérification: only one carrying an action to take (T-0184). */}
        <Verification
          etat={props.etat}
          modeReseau={props.modeReseau}
          messagePersistance={props.persistance.message}
          echecPersistance={props.persistance.echec}
          surExport={props.persistance.surExport}
          surImport={props.persistance.surImport}
        />
        {props.seuils !== undefined && <SeuilsDeclinaison seuils={props.seuils} />}
        <CalculsAffiches />
        <MenuReglages poids={props.poids} />
        <Sources />
      </div>
    </div>
  )
}
