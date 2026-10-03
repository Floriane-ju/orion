/**
 * §3.2 / T-0314 — la date et l'heure tiennent un panneau, en tête de la colonne de droite.
 *
 * T-0137 avait fait du temps un transport plutôt qu'un formulaire : un chevron porte à la fois
 * le sens, la vitesse et l'ordre de partir. Il fermait la barre basse, sur une ligne de la même
 * taille que la phrase de visée qui le précédait — l'une des deux entrées qui datent toute la
 * nuit se lisait comme une lecture de plus. Il devient un objet posé sur le ciel, avec le cadre
 * d'instrument du panneau de séance qu'il coiffe : la date et l'heure sur la première rangée —
 * l'instant se lit d'une traite —, le transport sur la seconde, fermé par le retour au présent.
 *
 * Les quatre chevrons encadrent désormais le bouton de LECTURE et non le cadran : c'est lui qui
 * tient le milieu du transport, et l'ordre continue de dire dans quel sens chacun emmène le ciel.
 *
 * LES CINQ COMMANDES FORMENT UN GROUPE EXCLUSIF — voir `transportActif`. La lecture ne vaut que
 * le temps réel ; elle s'éteint dès qu'une vitesse prend la main, au lieu de rester allumée à
 * côté du chevron qui la contredit.
 *
 * LE FACTEUR APPLIQUÉ N'EST PLUS AFFICHÉ, ni l'écrêtage qui le produit. Le plafond de lisibilité
 * de §3.2 continue de s'appliquer — il vit dans `Planetarium`, qui dessine —, mais sa lecture
 * demandait au panneau une largeur variable : « ×1500 » puis rien, une phrase de trois lignes
 * puis rien. Un panneau qui change de taille sous la main coûte plus que le chiffre ne rapporte,
 * et le ciel qui ralentit se voit à l'écran.
 *
 * Aucun `useScene()` ici. Le magasin publie l'instant rendu deux fois par seconde ; s'y
 * abonner en entier ferait rendre le panneau au même rythme (T-0056). Le panneau s'abonne à une
 * tranche d'identité stable, et seuls les deux morceaux d'horloge s'abonnent à la SECONDE —
 * pas aux millisecondes qu'ils affichent.
 */

import { useRef, type ReactNode } from 'react'
import { facteurDefilement } from '../core/curseur-temps.ts'
import { nuitDeLInstant } from '../core/nuit-datee.ts'
import {
  dateAvec,
  LARGEURS_INSTANT,
  partiesHeure,
  partiesJour,
  type ChampInstant,
} from './horaire.ts'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { Compteur } from './Compteur.tsx'
import {
  etatScene,
  type EtatScene,
  majTemps,
  reprend,
  secondeAffichee,
  type TempsScene,
  useTrancheScene,
  vaA,
} from './scene-etat.ts'
import { DOMAINES } from '../registry/domains.ts'
import { destinationTrajet, traverse } from './trajet-scene.ts'

/** Sélecteur défini au niveau du module — `useTrancheScene` exige une identité stable. */
function tempsScene(etat: EtatScene): EtatScene['temps'] {
  return etat.temps
}

/**
 * §3.2 / T-0314 — les cinq commandes du transport sont UN groupe exclusif : le temps réel, et
 * les quatre vitesses de défilement. Une seule s'allume à la fois.
 *
 * Le défaut que ça corrige : la lecture s'allumait dès que le temps s'écoulait, défilement
 * compris. Un ×1500 en cours montrait donc deux commandes enfoncées — la lecture ET son chevron
 * — sans que rien ne dise laquelle commandait la vitesse. La lecture ne vaut plus que `MAINTENANT`,
 * le seul régime où le ciel avance à la vitesse du ciel.
 *
 * `facteur` vaut `null` pour la lecture : le temps réel n'est pas une vitesse de défilement,
 * c'est l'absence de facteur.
 */
export function transportActif(temps: TempsScene, facteur: number | null): boolean {
  if (facteur === null) return temps.modeTemps === 'MAINTENANT'
  return temps.modeTemps === 'DEFILEMENT' && temps.facteur === facteur
}

/**
 * Ce que la commande annonce, selon d'où l'on part. Elle fait trois choses différentes et ne
 * peut pas s'appeler pareil dans les trois cas : relâcher la lecture met en PAUSE, la reprendre
 * depuis une pause REND le temps à son écoulement, et l'atteindre depuis un défilement RAMÈNE au
 * temps réel — ce dernier n'est ni une reprise ni une pause.
 */
function libelleLecture(temps: TempsScene): string {
  if (transportActif(temps, null)) return 'Mettre le temps en pause'
  if (temps.modeTemps === 'DEFILEMENT') return 'Revenir au temps réel'
  return 'Reprendre l’écoulement du temps'
}

interface Cran {
  readonly sens: -1 | 1
  readonly rapide: boolean
  readonly icone: string
  readonly libelle: string
}

/** Les quatre chevrons, dans l'ordre où ils se lisent : les reculs à gauche de la lecture. */
const CRANS: readonly Cran[] = Object.freeze([
  { sens: -1, rapide: true, icone: 'keyboard_double_arrow_left', libelle: 'Reculer vite' },
  { sens: -1, rapide: false, icone: 'chevron_left', libelle: 'Reculer' },
  { sens: 1, rapide: false, icone: 'chevron_right', libelle: 'Avancer' },
  { sens: 1, rapide: true, icone: 'keyboard_double_arrow_right', libelle: 'Avancer vite' },
] as const)

export interface PanneauTempsProps {
  /**
   * La nuit sur laquelle porte le plan suit l'instant choisi : une seule date à l'écran.
   * T-0267 — celle du SOIR de la nuit, pas le jour civil : reculer l'horloge à 00:30 reste
   * dans la nuit qu'on observe au lieu d'annoncer la suivante.
   */
  readonly surNuitIso: (v: string) => void
}

export function PanneauTemps(props: PanneauTempsProps) {
  const temps = useTrancheScene(tempsScene)
  const enLecture = transportActif(temps, null)
  // La saisie exacte remplace la rangée de date : l'état vit ici, les deux morceaux d'horloge
  // l'ouvrent chacun de leur côté sans se connaître.

  /**
   * Le geste commun aux cinq commandes : relâcher celle qui est allumée fige le temps, en
   * choisir une autre l'allume. Sans le premier cas, arrêter un défilement demandait de viser
   * une SECONDE commande — la pause — alors que le doigt est déjà sur celle qui l'a lancé.
   */
  function commande(facteur: number | null): void {
    if (transportActif(temps, facteur)) return majTemps({ modeTemps: 'FIGE' })
    if (facteur === null) return reprend()
    majTemps({ modeTemps: 'DEFILEMENT', facteur })
  }

  const chevron = (cran: Cran) => {
    const facteur = cran.sens * facteurDefilement(cran.rapide)
    return (
      <BoutonGlyphe
        key={cran.libelle}
        icone={cran.icone}
        aide={cran.libelle}
        variante="nu"
        presse={transportActif(temps, facteur)}
        onClick={() => commande(facteur)}
      />
    )
  }

  return (
    <div className="panneau-temps">
      <div className="panneau-temps-date">
        <Jour surNuitIso={props.surNuitIso} />
        <Heure surNuitIso={props.surNuitIso} />
      </div>

      <div className="panneau-temps-transport">
        {CRANS.filter((c) => c.sens < 0).map(chevron)}
        {/* Le glyphe dit ce que le clic FERA, pas où l'on est : sous un défilement, la
            lecture n'est pas en cours, et c'est donc une flèche qu'elle montre. */}
        <BoutonGlyphe
          icone={enLecture ? 'pause' : 'play_arrow'}
          aide={libelleLecture(temps)}
          variante="nu"
          presse={enLecture}
          onClick={() => commande(null)}
        />
        {CRANS.filter((c) => c.sens > 0).map(chevron)}
        <BoutonMaintenant surNuitIso={props.surNuitIso} />
      </div>
    </div>
  )
}

/** Un cran de glisser vaut une unité du champ : un jour, un mois, une seconde. */
const PAS_INSTANT = 1

/** T-0162 — les morceaux de l'instant que le glisser règle, et le nom qu'ils annoncent. */
const CHAMPS_INSTANT: Partial<
  Record<Intl.DateTimeFormatPartTypes, { readonly champ: ChampInstant; readonly libelle: string }>
> = {
  day: { champ: 'jour', libelle: 'Jour' },
  month: { champ: 'mois', libelle: 'Mois' },
  year: { champ: 'annee', libelle: 'Année' },
  hour: { champ: 'heure', libelle: 'Heure' },
  minute: { champ: 'minute', libelle: 'Minute' },
  second: { champ: 'seconde', libelle: 'Seconde' },
}

/** Le mois est rendu humain — 1 à 12 — parce que c'est ce que le compteur annonce. */
function valeurChamp(date: Date, champ: ChampInstant): number {
  if (champ === 'annee') return date.getFullYear()
  if (champ === 'mois') return date.getMonth() + 1
  if (champ === 'jour') return date.getDate()
  if (champ === 'heure') return date.getHours()
  if (champ === 'minute') return date.getMinutes()
  return date.getSeconds()
}

/**
 * Les compteurs d'un morceau d'instant — le même geste pour la date et pour l'heure.
 *
 * T-0162 — chaque morceau se tire à l'horizontale (§11.2) : avancer d'un jour ne demande plus
 * d'ouvrir un champ, de viser son sous-champ et de le refermer.
 *
 * `depart` gèle l'instant AU DÉBUT du geste. Sans lui, tirer les mois depuis un 31 relirait à
 * chaque mouvement une date déjà déplacée, et le jour dériverait avec elle.
 *
 * L'abonnement à la seconde vit ici, dans le morceau qui l'affiche, et non dans le panneau :
 * les cinq boutons du transport n'ont rien à redessiner à chaque battement (T-0056).
 */
function useCompteurs(props: PanneauTempsProps): {
  readonly date: Date
  readonly compteurs: (parties: readonly Intl.DateTimeFormatPart[]) => readonly ReactNode[]
} {
  const seconde = useTrancheScene(secondeAffichee)
  const depart = useRef<Date | null>(null)
  // T-0394 — pendant un trajet, l'instant demandé, pas celui que le ciel traverse.
  const date = new Date(destinationTrajet() ?? seconde * 1000)

  /**
   * T-0292 — la nuit suit l'instant, mais pas à chaque cran d'un glisser : changer de nuit
   * recalcule le ciel de la séance, et tirer les jours en enchaînait un par cran. Le ciel et
   * l'horloge suivent le geste ; la nuit se règle au relâchement (`soldeNuit`).
   *
   * T-0394 — une saisie ou une flèche TRAVERSE le temps jusqu'à l'instant demandé, en trajet
   * FORCÉ, plafond de §3.2 ignoré : changer de jour doit se voir (choix produit). La nuit se
   * règle sur la DESTINATION, pas sur l'instant que le trajet traverse.
   *
   * Le glisser, lui, saute : le ciel suit le doigt, instantanément. Un trajet relancé à chaque
   * cran repeignait et recalculait la scène sans fin, et le geste ramait.
   */
  function va(champ: ChampInstant, valeur: number, enGlisse = false): void {
    const cible = dateAvec(depart.current ?? date, champ, valeur).getTime()
    if (enGlisse) return vaA(cible)
    traverse(cible, undefined, { force: true })
    soldeNuit()
  }

  function soldeNuit(): void {
    const ms = destinationTrajet() ?? etatScene().msAffiche
    props.surNuitIso(nuitDeLInstant(new Date(ms)))
  }

  /** Les littéraux de la locale restent du texte : seuls les nombres deviennent des compteurs. */
  function compteurs(parties: readonly Intl.DateTimeFormatPart[]): readonly ReactNode[] {
    return parties.map((partie, place) => {
      const reglage = CHAMPS_INSTANT[partie.type]
      if (reglage === undefined) return partie.value
      const champ = reglage.champ
      return (
        <Compteur
          key={place}
          libelle={reglage.libelle}
          valeur={valeurChamp(date, champ)}
          texte={partie.value}
          {...(LARGEURS_INSTANT[partie.type] === undefined
            ? {}
            : { largeur: LARGEURS_INSTANT[partie.type] })}
          pas={PAS_INSTANT}
          {...(champ === 'annee'
            ? { min: DOMAINES.annee_affichee.min, max: DOMAINES.annee_affichee.max }
            : {})}
          sur={(valeur, enGlisse) => va(champ, valeur, enGlisse)}
          surFin={soldeNuit}
          surDebut={() => {
            depart.current = date
          }}
        />
      )
    })
  }

  return { date, compteurs }
}

/**
 * T-0314 — le mois abrégé, là où T-0164 avait mis des chiffres. Le jour de la semaine n'y est
 * plus (T-0327) : voir `partiesJour`.
 */
function Jour(props: PanneauTempsProps) {
  const { date, compteurs } = useCompteurs(props)
  return <span className="panneau-temps-jour">{compteurs(partiesJour(date))}</span>
}

/** L'heure à la seconde, en champs du même corps que ceux de la date (T-0327). */
function Heure(props: PanneauTempsProps) {
  const { date, compteurs } = useCompteurs(props)
  return <span className="panneau-temps-heure">{compteurs(partiesHeure(date))}</span>
}

/**
 * §3.2 — revenir à l'instant présent, et rendre le temps à son écoulement, en un geste.
 *
 * Sans lui, retrouver ce soir depuis une date choisie demandait de tirer six compteurs jusqu'à
 * l'heure qu'il est — un réglage à viser là où il n'y a qu'une destination.
 */
function BoutonMaintenant(props: PanneauTempsProps) {
  function maintenant(): void {
    const present = new Date()
    // T-0394 — le retour se traverse, puis le temps repart sur l'horloge système, décalage nul :
    // le trajet a pris une seconde ou deux, la lecture reprend à l'instant présent, pas à
    // celui du clic.
    traverse(present.getTime(), () => majTemps({ modeTemps: 'MAINTENANT', decalageMs: 0 }), {
      force: true,
    })
    props.surNuitIso(nuitDeLInstant(present))
  }

  return (
    <BoutonGlyphe
      icone="update"
      aide="Revenir à maintenant"
      variante="nu"
      classe="panneau-temps-maintenant"
      onClick={maintenant}
    />
  )
}
