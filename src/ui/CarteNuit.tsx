/**
 * §8.1 — la nuit d'un coup d'œil, en bas à gauche de la scène.
 *
 * Avant de choisir une cible, on veut savoir quand il fera noir et ce que fera la Lune. La
 * carte « Plan de nuit » le dit en tableau, repliée sur la scène ; ici la même nuit se lit
 * en une frise, là où l'on choisit. Aucune donnée d'objet : c'est la nuit, pas la cible.
 *
 * La frise ne porte ni légende ni note : ce qu'un motif ou un trait signifie, la bulle de
 * survol le dit à l'instant pointé. Tout texte posé à demeure repoussait la liste d'autant.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import {
  friseNuit,
  lectureFrise,
  type FriseNuit,
  type LectureFrise,
  type PhaseCiel,
} from '../core/frise-nuit.ts'
import type { FenetreNocturne } from '../core/nuit.ts'
import type { Site } from '../core/ephem.ts'
import { MS_PAR_MINUTE, POURCENT } from '../core/unites.ts'
import { Mention } from './Mention.tsx'
import { heure } from './horaire.ts'
import { minuteAffichee, useTrancheScene } from './scene-etat.ts'
import {
  aimante,
  bandesPhases,
  curseurInstant,
  disqueLune,
  incrustationsLune,
  libelleLuneInstant,
  libellePhaseLune,
  LIBELLE_PHASE_CIEL,
  marquesLune,
  reperesHeures,
  resumeLuneFrise,
  type DisqueLune,
  type MarqueLune,
} from './carte-nuit-calcul.ts'

export interface CarteNuitProps {
  readonly site: Site
  readonly nuit: FenetreNocturne
}

/** Des propriétés personnalisées, jamais une couleur en ligne : la feuille garde la main. */
function proprietes(valeurs: Readonly<Record<string, string>>): CSSProperties {
  return valeurs as CSSProperties
}

function classePhase(phase: PhaseCiel): string {
  return `phase-${phase.toLowerCase().replace('_', '-')}`
}

function borne(fraction: number): number {
  return Math.min(1, Math.max(0, fraction))
}

function enPourcent(fraction: number): string {
  return `${(borne(fraction) * POURCENT).toFixed(2)}%`
}

export function CarteNuit({ site, nuit }: CarteNuitProps) {
  const frise = useMemo(() => friseNuit(site, nuit), [site, nuit])
  const minute = useTrancheScene(minuteAffichee)
  const cadre = useHauteurPubliee()

  return (
    <section ref={cadre} className="panneau-nuit" role="region" aria-label="La nuit">
      {nuit.cause !== undefined && <Mention ton="cause">{nuit.cause}</Mention>}
      {frise !== null && (
        <Frise
          frise={frise}
          site={site}
          curseur={curseurInstant(frise, new Date(minute * MS_PAR_MINUTE))}
        />
      )}
    </section>
  )
}

/**
 * La carte Site s'arrête au-dessus de la frise : les deux partagent le flanc gauche, et la
 * frise a une hauteur que la feuille ne connaît pas — une cause de nuit polaire s'y ajoute.
 * Elle la publie donc sur la racine, où la carte la lit ; démontée, elle ne réserve plus rien.
 */
function useHauteurPubliee() {
  const cadre = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const element = cadre.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const racine = document.documentElement
    const observateur = new ResizeObserver(() => {
      racine.style.setProperty('--nuit-haut', `${element.offsetHeight}px`)
    })
    observateur.observe(element)
    return () => {
      observateur.disconnect()
      racine.style.removeProperty('--nuit-haut')
    }
  }, [])
  return cadre
}

interface Survol {
  readonly fraction: number
  readonly marque: MarqueLune | null
}

function Frise({
  frise,
  site,
  curseur,
}: {
  readonly frise: FriseNuit
  readonly site: Site
  readonly curseur: string | null
}) {
  const [survol, setSurvol] = useState<Survol | null>(null)
  const phases = bandesPhases(frise)
  const marques = marquesLune(frise)
  const lecture = survol === null ? null : lectureFrise(site, frise, survol.fraction)

  const surPointeur = (e: PointerEvent<HTMLDivElement>) => {
    const cadre = e.currentTarget.getBoundingClientRect()
    // La portée de l'aimant est un pas d'espacement (`--pas-2`), lu dans la feuille plutôt que
    // recopié : la moitié d'une cible gantée happait le pointeur de trop loin, et la bulle
    // restait collée au lever quand on voulait lire les minutes voisines.
    const portee =
      parseFloat(getComputedStyle(e.currentTarget).getPropertyValue('--pas-2')) *
      parseFloat(getComputedStyle(document.documentElement).fontSize) /
      cadre.width
    setSurvol(aimante(borne((e.clientX - cadre.left) / cadre.width), marques, portee))
  }

  const resume =
    `Du coucher du Soleil à ${heure(frise.coucherSoleil)} à son lever à ${heure(frise.leverSoleil)} : ` +
    phases.map((b) => LIBELLE_PHASE_CIEL[b.phase].toLowerCase()).join(', ') +
    `. ${resumeLuneFrise(frise.lune)}`

  return (
    <div className="nuit-frise">
      <div className="nuit-frise-zone">
        <div
          className="nuit-frise-ciel"
          role="img"
          aria-label={resume}
          onPointerMove={surPointeur}
          onPointerLeave={() => setSurvol(null)}
        >
          {phases.map((b) => (
            <span
              key={b.cle}
              className={`nuit-bande ${classePhase(b.phase)}`}
              style={proprietes({ '--debut': b.debut, '--largeur': b.largeur })}
            />
          ))}
          {marques.map((m) => (
            <span key={m.cle} className="nuit-marque-lune" style={proprietes({ '--debut': m.position })} />
          ))}
          {incrustationsLune(frise, site.latitudeDeg).map((l) => (
            <span
              key={l.cle}
              className="nuit-lune-incrustee"
              style={proprietes({ '--debut': l.position, '--hauteur': l.hauteur, '--eclat': l.eclat })}
            >
              <DisqueLuneVue disque={l.disque} />
            </span>
          ))}
          {curseur !== null && (
            <span className="nuit-curseur" style={proprietes({ '--debut': curseur })} />
          )}
          {survol !== null && (
            <span
              className={survol.marque === null ? 'nuit-survol-trait' : 'nuit-survol-trait aimante'}
              style={proprietes({ '--debut': enPourcent(survol.fraction) })}
            />
          )}
        </div>
        {survol !== null && lecture !== null && (
          <BulleFrise
            fraction={survol.fraction}
            lecture={lecture}
            marque={survol.marque}
            latitudeDeg={site.latitudeDeg}
          />
        )}
      </div>
      <div className="nuit-heures" aria-hidden="true">
        {reperesHeures(frise).map((r) => (
          <span
            key={r.cle}
            className={r.majeur ? 'nuit-repere majeur' : 'nuit-repere'}
            style={proprietes({ '--debut': r.position })}
          >
            {r.majeur ? r.texte : null}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * La bulle de survol : l'instant pointé, la Lune, le ciel — et, accrochée par l'aimant, le
 * lever ou le coucher de Lune en accent. Muette pour la synthèse, qui a le résumé de la
 * frise. Pas de `Bulle` : elle suit le pointeur, elle n'est ancrée à aucun élément.
 */
function BulleFrise({
  fraction,
  lecture,
  marque,
  latitudeDeg,
}: {
  readonly fraction: number
  readonly lecture: LectureFrise
  readonly marque: MarqueLune | null
  readonly latitudeDeg: number
}) {
  const disque = disqueLune(
    { illumination: lecture.illuminationLune, croissante: lecture.luneCroissante },
    latitudeDeg,
  )
  const position = enPourcent(fraction)
  return (
    <div className="nuit-bulle" aria-hidden="true">
      <span className="nuit-bulle-trait" style={proprietes({ '--debut': position })} />
      <span
        className="nuit-bulle-corps"
        style={proprietes({ '--debut': position, '--fraction': borne(fraction).toFixed(4) })}
      >
        {/* Le ciel d'abord — l'heure et ce qu'il vaut —, la Lune ensuite, sous un filet. */}
        <span className="nuit-bulle-heure">{heure(lecture.instant)}</span>
        <span>{LIBELLE_PHASE_CIEL[lecture.phase]}</span>
        <span className="nuit-bulle-lune">
          <span className="nuit-bulle-disque">
            <DisqueLuneVue disque={disque} />
          </span>
          <span className="nuit-bulle-lune-lectures">
            {/* À l'instant d'un lever, la hauteur du CENTRE du disque est encore négative :
                le lever se compte au bord supérieur, réfraction comprise. « Sous l'horizon »
                y contredirait la ligne d'accent — l'évènement la remplace. */}
            {marque !== null ? (
              <span className="nuit-bulle-evenement">{marque.texte}</span>
            ) : (
              <span>{libelleLuneInstant(lecture.hauteurLuneDeg)}</span>
            )}
            <span>{libellePhaseLune(lecture.luneCroissante, lecture.illuminationLune)}</span>
          </span>
        </span>
      </span>
    </div>
  )
}

/** Le disque éclairé selon sa phase ; sa taille vient de son conteneur. */
function DisqueLuneVue({ disque }: { readonly disque: DisqueLune }) {
  return (
    <span
      className={[
        'lune-disque',
        disque.eclaireADroite ? 'lune-droite' : 'lune-gauche',
        disque.gibbeuse ? 'lune-gibbeuse' : '',
      ].join(' ')}
      style={proprietes({ '--terminateur': disque.terminateur })}
    >
      <span className="lune-moitie" />
      <span className="lune-terminateur" />
    </span>
  )
}
