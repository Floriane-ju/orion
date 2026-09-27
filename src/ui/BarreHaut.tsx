/**
 * La barre haute : la marque, la visée, et les commandes.
 *
 * T-0113 — elle ne porte plus de réglage, seulement des bascules. L'ordre est un contrat : le
 * mode nuit d'abord parce qu'il se cherche dans le noir, puis la vérification et les réglages
 * en dernier (§11.3, T-0047).
 *
 * T-0153 — le tiroir des lectures est démonté. Il portait une phrase utile et quatre lectures
 * d'atelier ; la phrase est descendue au centre de la barre basse, où elle se lit sans un clic,
 * et la mention « az · h · champ » qui la répétait ici part avec elle.
 *
 * T-0180 — les trois boutons de panneau sont partis avec le tiroir qu'ils ouvraient : le mode
 * décide seul de ce que le panneau porte. Ne reste qu'une bascule à deux positions.
 *
 * T-0246 — cette bascule est descendue sur le panneau latéral, dont elle forme les onglets :
 * elle décide de ce qu'il porte, et c'est là qu'on la cherche.
 *
 * T-0184 — Vérification et Réglages ne font plus qu'un tiroir. Ils répondaient au même geste,
 * « ce qui sort du chemin principal », et l'enveloppe est donc unique : deux sections dedans,
 * la vérification d'abord parce qu'elle seule porte une conduite à tenir. L'alerte de
 * persistance remonte sur le tiroir fermé et NOMME sa section — une information qui n'existe
 * que pour qui pense à ouvrir un menu n'existe pas (§11.3).
 *
 * T-0228 — un tiroir « info » s'intercale avant celui des outils. Il ramasse la provenance des
 * données, qui était semée au contact des valeurs qu'elle couvre : elle ne change jamais d'une
 * cible à l'autre et n'arbitre rien, mais elle se relisait à chaque fiche ouverte. Avant les
 * réglages et non après — on ouvre un tiroir de réglages pour AGIR, celui-ci pour lire, et le
 * geste qui agit garde le bord droit que T-0184 lui a donné.
 *
 * T-0325 — les tiroirs « info » et « réglages » deviennent une page à part (`PageInfo`),
 * ouverte par un seul bouton « info », dernier de la barre. Leurs contenus se lisent en
 * longueur ; une fenêtre de tiroir les tenait sous un ascenseur.
 *
 * T-0325 — la légende des couleurs aussi : elle devient le premier accordéon de la modale.
 *
 * T-0325 — la profondeur affichée a quitté la barre pour la modale info, sous son titre :
 * elle se lit pour comprendre le champ, pas pour agir, et la barre ne garde que la visée et
 * les commandes.
 *
 * La barre basse est démontée : la légende des couleurs et la phrase de visée montent ici,
 * entre la marque et les commandes. La phrase prend la place que les commandes laissent et
 * se rogne la première ; le lieu, lui, est devenu la carte « Site » posée sur la scène.
 */

import type { Site } from '../core/ephem.ts'
import { Visee } from './Visee.tsx'
import { ALERTE_VERIFICATION } from './Verification.tsx'
import { ModeNuit, type EtatModeNuit } from './ModeNuit.tsx'
import { Bulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'
import { ANCRE_INFO } from './PageInfo.tsx'
import { Tiroir } from './Tiroir.tsx'
import type { Persistance } from './app-donnees.ts'

/** T-0325 — le nom du bouton info, dit par sa bulle : le mot « info » a quitté la barre. */
const AIDE_INFO = 'Infos de l’app'

export interface BarreHautProps {
  readonly modeNuit: EtatModeNuit
  readonly surModeNuit: (etat: EtatModeNuit) => void
  /** T-0041 — seul l'échec de persistance remonte ici : il se signale sur le bouton fermé. */
  readonly persistance: Persistance
  /** §3.3 — le site oriente le ciel : sans lui, la visée n'a pas de coordonnées J2000. */
  readonly site: Site
  /** §3.3 — le paquet Gaia décide jusqu'où le champ peut se refermer sans vider le ciel. */
  readonly gaiaCharge: boolean
}

export function BarreHaut(props: BarreHautProps) {
  return (
    <>
      <h1>Orion</h1>
      <Visee site={props.site} gaiaCharge={props.gaiaCharge} />
      {/* §11.1 — le mode nuit est un geste de terrain : il reste à portée, dans la barre. */}
      <Tiroir
        modificateur="nuit"
        resume={
          <>
            <Icone
              nom={props.modeNuit.actif ? 'dark_mode' : 'light_mode'}
              libelle={props.modeNuit.actif ? 'actif' : 'inactif'}
            />
            mode nuit
          </>
        }
      >
        <ModeNuit etat={props.modeNuit} surChangement={props.surModeNuit} />
      </Tiroir>

      {/* T-0325 — les deux tiroirs « info » et « réglages » sont devenus une page : ce
          bouton y mène, et reste le dernier de la barre, le plus à droite, là où T-0184 avait
          mis le geste qui sort du chemin principal. T-0041 — l'alerte de persistance s'y
          signale en mots et nomme sa section : le rouge ne l'annonce jamais seul (§11.1). */}
      {/* Au repos, l'icône seule : la bulle la nomme. En alerte, le texte revient — c'est lui
          qui dit l'échec, et il porte alors le nom du lien. */}
      <Bulle texte={AIDE_INFO} place="bas" nomme={!props.persistance.echec}>
        <a
          href={`#${ANCRE_INFO}`}
          className="bouton-info"
          data-alerte={props.persistance.echec}
        >
          <Icone nom="info" />
          {props.persistance.echec && ALERTE_VERIFICATION}
        </a>
      </Bulle>
    </>
  )
}
