/**
 * La barre haute : la marque, la profondeur affichée, et les tiroirs.
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
 * La profondeur affichée rejoint ici les autres lectures d'atelier : elle se lisait dans la
 * carte Vue, qu'il fallait déplier pour la voir. Le survol suffit à la comprendre (glossaire),
 * donc pas de `<details>` ici — la carte Vue reste repliable sans rien lui retirer.
 *
 * La barre basse est démontée : la légende des couleurs et la phrase de visée montent ici,
 * entre la marque et la profondeur. La phrase prend la place que les commandes laissent et
 * se rogne la première ; le lieu, lui, est devenu la carte « Site » posée sur la scène.
 */

import type { EtatDemarrage } from '../data/bootstrap.ts'
import type { Site } from '../core/ephem.ts'
import { etatProfondeur } from '../core/projection.ts'
import { GLOSSAIRE } from '../registry/glossaire.ts'
import { Bulle } from './Bulle.tsx'
import { LegendeCouleurs } from './LegendeCouleurs.tsx'
import { Visee } from './Visee.tsx'
import { MenuReglages } from './MenuReglages.tsx'
import type { SaisiePoids } from './app-saisie.ts'
import { ALERTE_VERIFICATION, Verification } from './Verification.tsx'
import { ModeNuit, type EtatModeNuit } from './ModeNuit.tsx'
import { Icone } from './Icone.tsx'
import { Sources } from './Sources.tsx'
import { Tiroir } from './Tiroir.tsx'
import type { Persistance } from './app-donnees.ts'
import { useTrancheScene, type EtatScene } from './scene-etat.ts'
import type { ModeReseau } from '../data/degradation.ts'

export interface BarreHautProps {
  readonly modeNuit: EtatModeNuit
  readonly surModeNuit: (etat: EtatModeNuit) => void
  readonly etat: EtatDemarrage | null
  readonly modeReseau: ModeReseau
  readonly persistance: Persistance
  /** §8.3 — les poids de scoring, réglés depuis le tiroir des réglages. */
  readonly poids: SaisiePoids
  /** Magnitude la plus faible du paquet chargé : au-delà, le champ paraît plus pauvre qu'il n'est. */
  readonly profondeurMag: number
  /** §2.2 — fond de ciel du site : c'est lui qui plafonne la profondeur en vue réaliste. */
  readonly sbCiel: number | null
  /** §3.3 — le site oriente le ciel : sans lui, la visée n'a pas de coordonnées J2000. */
  readonly site: Site
  /** §3.3 — le paquet Gaia décide jusqu'où le champ peut se refermer sans vider le ciel. */
  readonly gaiaCharge: boolean
}

/** Sélecteurs définis au niveau du module — `useTrancheScene` exige une identité stable. */
function fovScene(etat: EtatScene): number {
  return etat.vue.fovDeg
}
function vueRealisteScene(etat: EtatScene): boolean {
  return etat.rendu.vueRealiste
}

export function BarreHaut(props: BarreHautProps) {
  const fovDeg = useTrancheScene(fovScene)
  const vueRealiste = useTrancheScene(vueRealisteScene)
  const profondeur = etatProfondeur(fovDeg, props.profondeurMag, props.sbCiel, vueRealiste)
  const entreeProfondeur = GLOSSAIRE.magnitude_limite_rendue
  // Plus de `<details>` : la glose seule ne dirait pas pourquoi la profondeur bouge avec le
  // zoom, ni ce qui la plafonne en vue réaliste — l'explication complète du glossaire, jointe
  // à la cause d'un catalogue épuisé quand elle existe, tient donc seule le survol (§10.1).
  const aideProfondeur =
    profondeur.cause === undefined
      ? entreeProfondeur.explication
      : `${entreeProfondeur.explication} ${profondeur.cause}`

  return (
    <>
      <h1>Orion</h1>
      {/* La légende dit ce que les couleurs des marqueurs signifient : une convention de
          lecture, pas une commande de vue — elle voisine la marque, loin des bascules. */}
      <LegendeCouleurs modeNuit={props.modeNuit.actif} />
      <Visee site={props.site} gaiaCharge={props.gaiaCharge} />
      {/* T-0145 / T-0153 — seule lecture de la barre : c'est elle qui cale le bloc de
          commandes à droite, et la bande se soude à partir d'elle. */}
      <p className="etat barrehaut-lectures-fin">
        {/* T-0238 — l'objectif et le recadrage ne s'y lisent plus : les cartes Boîtier et
            Optique les portent, repliées comprises, et la barre les répétait. */}
        <span className="terme">
          <Bulle texte={aideProfondeur} place="bas">
            <abbr>
              {entreeProfondeur.libelle} {profondeur.magLimite.value.toFixed(1)} mag
            </abbr>
          </Bulle>
        </span>
      </p>

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

      {/* T-0228 — la provenance des données, ramassée en un endroit. Elle était semée au
          contact des valeurs qu'elle couvre, où elle se relisait à chaque cible sans jamais
          servir une décision. Avant les réglages, pas après : on ouvre un tiroir de réglages
          pour AGIR, celui-ci pour lire — et le geste qui agit reste le plus à droite, là où
          T-0184 l'a mis. */}
      <Tiroir
        modificateur="info"
        resume={
          <>
            <Icone nom="info" />
            info
          </>
        }
      >
        <Sources />
      </Tiroir>

      {/* T-0047 / T-0184 — ce qui sort du chemin principal : dernier élément de la barre,
          donc le plus à droite. */}
      <Tiroir
        modificateur="outils"
        alerte={props.persistance.echec}
        /* T-0041 — le libellé porte l'alerte en mots, et dit de quelle section elle vient :
           le rouge ne l'annonce jamais seul (§11.1). */
        resume={
          <>
            <Icone nom="settings" />
            {props.persistance.echec ? ALERTE_VERIFICATION : 'réglages'}
          </>
        }
      >
        <Verification
          etat={props.etat}
          modeReseau={props.modeReseau}
          messagePersistance={props.persistance.message}
          echecPersistance={props.persistance.echec}
          surExport={props.persistance.surExport}
          surImport={props.persistance.surImport}
        />
        <MenuReglages poids={props.poids} />
      </Tiroir>
    </>
  )
}
