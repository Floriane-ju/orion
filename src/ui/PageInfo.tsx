/**
 * §12.1, §12.3, T-0325 — la modale « info » : l'état du socle, les réglages et la provenance
 * des données.
 *
 * Elle remplace les deux tiroirs de la barre haute (T-0228 « info », T-0184 « réglages »).
 * Leurs contenus se lisent en longueur — matrice de dégradation, cinq curseurs, sources — et
 * une fenêtre de tiroir les tenait sous un ascenseur. Une modale presque pleine largeur leur
 * donne la place, sans quitter l'onglet : les poids réglés ici sont ceux du plan affiché
 * dessous — un autre onglet aurait son propre état, et ses réglages n'y agiraient pas.
 *
 * Aucun état React : la page est la cible de l'ancre `#info`, et `:target` l'affiche. Le
 * retour du navigateur la referme, un lien direct l'ouvre, et la scène reste montée dessous —
 * la quitter ne recalcule rien. Échap la ferme depuis l'écoute unique (`gere-echap.ts`).
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

/** L'ancre de la page : le bouton de la barre y mène, Échap et « fermer » en repartent. */
const ANCRE_INFO = 'info'

/** T-0325 — le nom du bouton info, dit par sa bulle : le bouton ne porte que son icône. */
const AIDE_INFO = 'Infos de l’app'

/**
 * T-0325 — le bouton qui mène à la page. Il se pose en bas à gauche de la scène, sous le mode
 * nuit : les deux gestes qui sortent du ciel se trouvent au même endroit. T-0041 — l'alerte de
 * persistance s'y signale en mots et nomme sa section : le rouge ne l'annonce jamais seul
 * (§11.1). Au repos, l'icône seule : la bulle la nomme. En alerte, le texte revient — c'est lui
 * qui dit l'échec, et il porte alors le nom du lien.
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
  /** Magnitude la plus faible du paquet chargé : au-delà, le champ paraît plus pauvre qu'il n'est. */
  readonly profondeurMag: number
  /** §2.2 — fond de ciel du site : c'est lui qui plafonne la profondeur en vue réaliste. */
  readonly sbCiel: number | null
  /** Les témoins de la légende se peignent aux teintes du mode courant. */
  readonly modeNuit: boolean
  /** §4.1 — seuils de déclinaison du site, absents si la saisie du lieu est refusée. */
  readonly seuils?: SeuilsSite
}

/** Sélecteurs définis au niveau du module — `useTrancheScene` exige une identité stable. */
function fovScene(etat: EtatScene): number {
  return etat.vue.fovDeg
}
/**
 * T-0325 — la profondeur affichée, descendue de la barre haute. Elle se lit hors des
 * rubriques, sous le titre : une ligne qu'aucun clic ne doit cacher. L'explication complète
 * du glossaire, jointe à la cause d'un catalogue épuisé quand elle existe, tient le survol :
 * la glose seule ne dirait pas pourquoi la profondeur bouge avec le zoom (§10.1).
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
  // Un lien direct vers `#info` se résout AVANT que React ait monté la page : `:target` n'a
  // alors rien à viser. Renaviguer vers la même ancre une fois montée la lui rend.
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
        {/* La légende en tête : c'est elle qu'on vient chercher en regardant le ciel. */}
        <LegendeCouleurs modeNuit={props.modeNuit} />
        {/* Puis la vérification : elle seule porte une conduite à tenir (T-0184). */}
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
