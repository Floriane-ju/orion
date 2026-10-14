/**
 * §3.2 / T-0411 — la date, l'heure et la frise de la nuit ne font qu'un réglage, dans la barre
 * haute.
 *
 * T-0314 tenait l'instant dans un panneau en tête de la colonne de droite, et la frise en bas à
 * gauche : deux endroits pour régler la même chose, qui ne se lisaient pas comme liés. Ils
 * forment maintenant une rangée — l'horloge, la frise dont le curseur EST cet instant, le retour
 * au présent. Tirer un compteur fait défiler la frise ; cliquer la frise change l'horloge.
 *
 * Le transport est retiré (lecture, pause, quatre chevrons) : choix produit. Le temps se règle
 * en tirant les compteurs, sur la frise, ou en revenant au présent — qui rend aussi l'écoulement
 * réel. Le défilement accéléré n'a plus de commande.
 *
 * T-0412 — la rangée devient un bloc posé sur le ciel, au centre du haut de l'écran : l'horloge
 * et sa lecture (phase, Lune), la frise sur toute la hauteur, le retour au présent en carré.
 *
 * Aucun `useScene()` ici. Le magasin publie l'instant rendu deux fois par seconde ; s'y
 * abonner en entier ferait rendre la barre au même rythme (T-0056). Seuls les deux morceaux
 * d'horloge s'abonnent à la SECONDE — pas aux millisecondes qu'ils affichent.
 */

import { useRef, type ReactNode } from 'react'
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
import { etatScene, majTemps, secondeAffichee, useTrancheScene, vaA } from './scene-etat.ts'
import { DOMAINES } from '../registry/domains.ts'
import { destinationTrajet, traverse } from './trajet-scene.ts'

export interface PanneauTempsProps {
  /**
   * La nuit sur laquelle porte le plan suit l'instant choisi : une seule date à l'écran.
   * T-0267 — celle du SOIR de la nuit, pas le jour civil : reculer l'horloge à 00:30 reste
   * dans la nuit qu'on observe au lieu d'annoncer la suivante.
   */
  readonly surNuitIso: (v: string) => void
  /** La frise de la nuit, entre l'horloge et le retour au présent ; absente sans ciel. */
  readonly frise?: ReactNode
  /** T-0412 — la phase et la Lune de l'instant, sous l'heure ; absente sans ciel. */
  readonly lecture?: ReactNode
}

export function PanneauTemps(props: PanneauTempsProps) {
  return (
    <section className="panneau-temps" role="region" aria-label="Temps de la scène">
      <div className="panneau-temps-date">
        {/* T-0416 — la date et l'heure sur une ligne : le bloc perd une rangée, la frise s'affine. */}
        <div className="panneau-temps-instant">
          <Jour surNuitIso={props.surNuitIso} />
          <Heure surNuitIso={props.surNuitIso} />
        </div>
        {props.lecture}
      </div>
      {props.frise}
      <BoutonMaintenant surNuitIso={props.surNuitIso} />
    </section>
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
 * la frise et le retour au présent n’ont rien à redessiner à chaque battement (T-0056).
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
