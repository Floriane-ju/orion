/**
 * §8.1 — la nuit d'un coup d'œil, en bas à gauche de la scène.
 *
 * Avant de choisir une cible, on veut savoir quand il fera noir et ce que fera la Lune. La
 * carte « Plan de nuit » le dit en tableau, repliée sur la scène ; ici la même nuit se lit
 * en une frise, là où l'on choisit. Aucune donnée d'objet : c'est la nuit, pas la cible.
 *
 * La frise ne porte ni légende ni note : ce qu'un motif ou un trait signifie, la bulle de
 * survol le dit à l'instant pointé. Tout texte posé à demeure repoussait la liste d'autant.
 *
 * T-0390 — la frise commande aussi le temps : un clic, un appui ou une flèche y règle
 * l'instant de la scène (§3.2). Une seule ligne reste à demeure, l'heure et la phase de
 * l'instant affiché : §11.2 ne laisse rien de critique au seul survol, et un écran tactile
 * n'en a pas.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
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
import { encadre, MS_PAR_MINUTE } from '../core/unites.ts'
import { Mention } from './Mention.tsx'
import { heure } from './horaire.ts'
import { minuteAffichee, useTrancheScene, vaA } from './scene-etat.ts'
import {
  aimante,
  bandesPhases,
  curseurInstant,
  disqueLune,
  type DisqueLune,
  incrustationsLune,
  instantClavier,
  instantFraction,
  LIBELLE_PHASE_CIEL,
  libelleLuneInstant,
  libellePhaseLune,
  type MarqueLune,
  marquesLune,
  pourcentCss,
  reperesHeures,
  resumeLuneFrise,
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

function enPourcent(fraction: number): string {
  return pourcentCss(encadre(fraction, 0, 1))
}

export function CarteNuit({ site, nuit }: CarteNuitProps) {
  const frise = useMemo(() => friseNuit(site, nuit), [site, nuit])
  const minute = useTrancheScene(minuteAffichee)
  const cadre = useHauteurPubliee()

  return (
    <section ref={cadre} className="panneau-nuit" role="region" aria-label="La nuit">
      {nuit.cause !== undefined && <Mention ton="cause">{nuit.cause}</Mention>}
      {frise !== null && (
        <Frise frise={frise} site={site} instantMs={minute * MS_PAR_MINUTE} />
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
  instantMs,
}: {
  readonly frise: FriseNuit
  readonly site: Site
  readonly instantMs: number
}) {
  const [survol, setSurvol] = useState<Survol | null>(null)
  const phases = bandesPhases(frise)
  const marques = marquesLune(frise)
  const lecture = survol === null ? null : lectureFrise(site, frise, survol.fraction)
  const curseur = curseurInstant(frise, new Date(instantMs))
  const debut = frise.debut.getTime()
  const fin = frise.fin.getTime()
  const phaseAffichee = useMemo(
    () =>
      instantMs < debut || instantMs > fin
        ? null
        : lectureFrise(site, frise, (instantMs - debut) / (fin - debut)).phase,
    [site, frise, instantMs, debut, fin],
  )

  const pointe = (e: MouseEvent<HTMLDivElement>): Survol => {
    const cadre = e.currentTarget.getBoundingClientRect()
    // La portée de l'aimant est un pas d'espacement (`--pas-2`), lu dans la feuille plutôt que
    // recopié : la moitié d'une cible gantée happait le pointeur de trop loin, et la bulle
    // restait collée au lever quand on voulait lire les minutes voisines.
    const portee =
      parseFloat(getComputedStyle(e.currentTarget).getPropertyValue('--pas-2')) *
      parseFloat(getComputedStyle(document.documentElement).fontSize) /
      cadre.width
    return aimante(encadre((e.clientX - cadre.left) / cadre.width, 0, 1), marques, portee)
  }

  // L'aimant vaut pour le clic comme pour le survol : un appui près d'un lever de Lune y va.
  const surClic = (e: MouseEvent<HTMLDivElement>) => vaA(instantFraction(frise, pointe(e).fraction))

  const surTouche = (e: KeyboardEvent<HTMLDivElement>) => {
    const cible = instantClavier(frise, instantMs, e.key)
    if (cible === null) return
    e.preventDefault()
    vaA(cible)
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
          role="slider"
          tabIndex={0}
          aria-label={resume}
          aria-valuemin={debut}
          aria-valuemax={fin}
          aria-valuenow={encadre(instantMs, debut, fin)}
          aria-valuetext={
            phaseAffichee === null
              ? `${heure(new Date(instantMs))}, hors de la nuit`
              : `${heure(new Date(instantMs))}, ${LIBELLE_PHASE_CIEL[phaseAffichee].toLowerCase()}`
          }
          onPointerMove={(e) => setSurvol(pointe(e))}
          onPointerLeave={() => setSurvol(null)}
          onClick={surClic}
          onKeyDown={surTouche}
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
      {phaseAffichee !== null && (
        <p className="nuit-lecture" aria-hidden="true">
          {heure(new Date(instantMs))} · {LIBELLE_PHASE_CIEL[phaseAffichee]}
        </p>
      )}
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
        style={proprietes({ '--debut': position, '--fraction': encadre(fraction, 0, 1).toFixed(4) })}
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
