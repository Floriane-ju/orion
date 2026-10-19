/**
 * §8.1 — la nuit d'un coup d'œil, dans la barre haute entre l'horloge et le retour au présent.
 *
 * Avant de choisir une cible, on veut savoir quand il fera noir et ce que fera la Lune. La
 * carte « Plan de nuit » le dit en tableau, repliée sur la scène ; ici la même nuit se lit
 * en une frise, là où l'on choisit. Aucune donnée d'objet : c'est la nuit, pas la cible.
 *
 * La frise ne porte ni légende ni note : ce qu'un motif ou un trait signifie, la bulle de
 * survol le dit à l'instant pointé. Tout texte posé à demeure repoussait la liste d'autant.
 *
 * T-0390 — la frise commande aussi le temps : un clic, un appui ou une flèche y règle
 * l'instant de la scène (§3.2). Une seule ligne reste à demeure, de jour comme de nuit,
 * l'heure et la phase de l'instant affiché : §11.2 ne laisse rien de critique au seul survol, et un écran tactile
 * n'en a pas.
 *
 * Le curseur reste au centre, la frise défile : elle montre douze heures avant et après
 * l'instant (`fenetreFrise`). Régler la date ou l'heure fait glisser le ciel sous le curseur,
 * plutôt que de promener le curseur dans une nuit figée qui en sortait.
 *
 * T-0394 — revue DA §4.2, « La tombée de la nuit ». Un clic sur la frise TRAVERSE le temps
 * jusqu'à l'instant visé. Les flèches restent des sauts : un pas de dix minutes n'a rien à
 * montrer en chemin.
 *
 * T-0411 — la frise monte dans la barre haute, liée à l'horloge : un seul endroit règle le
 * temps. Ce qu'un geste laisse à dire (saut, cause) tombe SOUS la
 * frise, par-dessus le ciel, plutôt que de faire grandir la barre.
 *
 * T-0419 — la frise se tire aussi : un glisser fait défiler l'instant sous le curseur, en
 * continu et sans trajet — le geste EST le trajet. En deçà du seuil d'un tremblement, l'appui
 * relâché reste un clic.
 *
 * T-0420 — un clic sur la frise traverse TOUJOURS le temps, comme le panneau de temps : on
 * vise un instant pour le voir venir, et un saut imposé par le zoom ôtait au clic son sens.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { C } from '../registry/lieu-carte.ts'
import {
  fenetreCalculFrise,
  fenetreFrise,
  friseCiel,
  lectureFrise,
  phaseFrise,
  type FriseNuit,
  type LectureFrise,
  type PhaseCiel,
} from '../core/frise-nuit.ts'
import type { FenetreNocturne } from '../core/nuit.ts'
import type { Site } from '../core/ephem.ts'
import { encadre, MS_PAR_H, MS_PAR_MINUTE, POURCENT } from '../core/unites.ts'
import { Mention } from './Mention.tsx'
import { heure } from './horaire.ts'
import {
  instant,
  minuteAffichee,
  useTrancheScene,
  vaA,
} from './scene-etat.ts'
import { traverse, useInstantTrajet } from './trajet-scene.ts'
import {
  aimante,
  bandesPhases,
  curseurInstant,
  disqueLune,
  type DisqueLune,
  instantClavier,
  instantFraction,
  glisseMolette,
  hauteurSurCourbe,
  instantGlisse,
  LIBELLE_PHASE_CIEL,
  libelleLuneInstant,
  libellePhaseLune,
  type MarqueLune,
  marquesLune,
  ordonneeFrise,
  pointsCourbe,
  pourcentCss,
  reperesHeures,
  resumeLuneFrise,
  tiretsHorizon,
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
  const minute = useTrancheScene(minuteAffichee)
  const instantMs = minute * MS_PAR_MINUTE
  // La frise suit le trajet image par image ; le reste, la minute publiée.
  const trajetMs = useInstantTrajet()
  const afficheMs = trajetMs ?? instantMs
  const frise = useFriseCiel(site, afficheMs)
  // Ce que le dernier geste laisse à dire : un saut que la lisibilité a imposé. Le geste
  // suivant l'efface.
  const [saute, setSaute] = useState(false)

  const va = (ms: number, force = false): void => {
    const plan = traverse(ms, undefined, { force })
    setSaute(plan.saut && plan.raison === 'ILLISIBLE')
  }
  const efface = (): void => setSaute(false)

  return (
    <section className="panneau-nuit" role="region" aria-label="La nuit">
      <Frise frise={frise} site={site} instantMs={afficheMs} va={va} efface={efface} />
      <div className="nuit-messages">
        {nuit.cause !== undefined && <Mention ton="cause">{nuit.cause}</Mention>}
        {saute && (
          <Mention ton="etat" role="status">
            Saut direct : à ce zoom, le trajet défilerait trop vite pour se lire.
          </Mention>
        )}
      </div>
    </section>
  )
}

/** Les éphémérides de la frise se recalculent à l'heure, le défilement à chaque image. */
function useFriseCiel(site: Site, afficheMs: number): FriseNuit {
  const heureCalcul = Math.floor(afficheMs / MS_PAR_H)
  return useMemo(
    () => friseCiel(site, fenetreCalculFrise(heureCalcul * MS_PAR_H)),
    [site, heureCalcul],
  )
}

/**
 * T-0412 — la Lune de l'instant affiché, dans sa case du bloc du temps, dessinée à sa phase et
 * nommée dessous — de jour comme de nuit : sa phase se prépare avant la nuit. Le disque se lit d'un coup d'œil
 * là où « Lune décroissante 10 % » demandait une lecture ; la phase du ciel, elle, se voit dans
 * la frise juste à côté, et reste dite dans le nom accessible (§11.2 : rien de critique au seul
 * survol, et un lecteur d'écran n'a pas le disque).
 */
export function LectureNuit({ site }: { readonly site: Site }) {
  const minute = useTrancheScene(minuteAffichee)
  const trajetMs = useInstantTrajet()
  const afficheMs = trajetMs ?? minute * MS_PAR_MINUTE
  const frise = useFriseCiel(site, afficheMs)
  const lecture = lectureFrise(site, frise, new Date(afficheMs))
  const lune = libellePhaseLune(lecture.luneCroissante, lecture.illuminationLune)
  const ciel = LIBELLE_PHASE_CIEL[lecture.phase]
  const disque = disqueLune(
    { illumination: lecture.illuminationLune, croissante: lecture.luneCroissante },
    site.latitudeDeg,
  )
  return (
    <p className="nuit-lecture" role="img" aria-label={`${ciel} · Lune ${lune.toLowerCase()}`}>
      <span className="nuit-lecture-disque">
        <DisqueLuneVue disque={disque} />
      </span>
      <span className="nuit-lecture-phase" aria-hidden="true">
        {lune}
      </span>
    </p>
  )
}

/** Un appui sur la frise : où il a commencé, l'instant d'alors, et s'il a déjà glissé. */
interface Appui {
  readonly x: number
  readonly ms: number
  readonly largeur: number
  glisse: boolean
}

interface Survol {
  readonly fraction: number
  readonly marque: MarqueLune | null
}

function Frise({
  frise,
  site,
  instantMs,
  va,
  efface,
}: {
  readonly frise: FriseNuit
  readonly site: Site
  readonly instantMs: number
  /** Traverse le temps jusqu'à l'instant visé. */
  readonly va: (ms: number, force?: boolean) => void
  /** Retire ce que le geste précédent avait à dire. */
  readonly efface: () => void
}) {
  const [survol, setSurvol] = useState<Survol | null>(null)
  const appui = useRef<Appui | null>(null)
  // Le clic suit le relâché d'un glisser : il ne doit pas traverser vers l'instant sous le doigt.
  const vientDeGlisser = useRef(false)
  const ciel = useRef<HTMLDivElement>(null)
  const vue = fenetreFrise(instantMs)
  const phases = bandesPhases(frise, vue)
  const marques = marquesLune(frise, vue)
  const courbes = [
    { astre: 'soleil', points: pointsCourbe(frise.soleil, vue) },
    { astre: 'lune', points: pointsCourbe(frise.lune.hauteurs, vue) },
  ] as const
  const lecture =
    survol === null ? null : lectureFrise(site, frise, new Date(instantFraction(vue, survol.fraction)))
  const curseur = curseurInstant(vue, new Date(instantMs))
  const tirets = tiretsHorizon(vue)
  // Chaque astre marqué d'un point sur sa courbe, à l'instant du curseur.
  const astres = [
    { astre: 'soleil', hauteurDeg: hauteurSurCourbe(frise.soleil, new Date(instantMs)) },
    { astre: 'lune', hauteurDeg: hauteurSurCourbe(frise.lune.hauteurs, new Date(instantMs)) },
  ] as const
  const debut = vue.debut.getTime()
  const fin = vue.fin.getTime()
  const phaseAffichee = phaseFrise(site, frise, new Date(instantMs))
  const lectureAffichee = `${heure(new Date(instantMs))} · ${LIBELLE_PHASE_CIEL[phaseAffichee]}`

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
  const surClic = (e: MouseEvent<HTMLDivElement>) => {
    if (vientDeGlisser.current) return void (vientDeGlisser.current = false)
    va(instantFraction(vue, pointe(e).fraction), true)
  }

  const surAppui = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    vientDeGlisser.current = false
    const largeur = e.currentTarget.getBoundingClientRect().width
    appui.current = { x: e.clientX, ms: instantMs, largeur, glisse: false }
  }

  const surMouvement = (e: PointerEvent<HTMLDivElement>) => {
    const a = appui.current
    const dx = a === null ? 0 : e.clientX - a.x
    if (a === null || (!a.glisse && Math.abs(dx) < C('SEUIL_GLISSER_PX'))) {
      setSurvol(pointe(e))
      return
    }
    if (!a.glisse) efface()
    a.glisse = true
    setSurvol(null)
    vaA(instantGlisse(vue, a.ms, dx / a.largeur))
  }

  const surRelache = () => {
    vientDeGlisser.current = appui.current?.glisse ?? false
    appui.current = null
  }

  const surTouche = (e: KeyboardEvent<HTMLDivElement>) => {
    const cible = instantClavier(vue, instantMs, e.key)
    if (cible === null) return
    e.preventDefault()
    efface()
    vaA(cible)
  }

  // T-0424 — le défilement horizontal tire le ruban comme un glisser. Écouteur natif : celui de
  // React est passif, il ne peut pas retenir le geste de retour arrière du navigateur. Le départ
  // est `instant.ms`, à jour dès `vaA` : la molette tire plus vite que React ne rend, et la
  // minute affichée arrondie perdrait les petits pas du trackpad.
  useEffect(() => {
    const el = ciel.current
    if (el === null) return
    const surMolette = (e: WheelEvent) => {
      const ligne = parseFloat(getComputedStyle(document.documentElement).fontSize)
      const dx = glisseMolette(e, el.getBoundingClientRect().width, ligne)
      if (dx === null) return
      e.preventDefault()
      efface()
      setSurvol(null)
      vaA(instantGlisse(fenetreFrise(instant.ms), instant.ms, dx))
    }
    el.addEventListener('wheel', surMolette, { passive: false })
    return () => el.removeEventListener('wheel', surMolette)
  }, [efface])

  const resume =
    `De ${heure(vue.debut)} à ${heure(vue.fin)} : ` +
    phases.map((b) => LIBELLE_PHASE_CIEL[b.phase].toLowerCase()).join(', ') +
    `. ${resumeLuneFrise(frise.lune, vue)}`

  return (
    <div className="nuit-frise">
      <div className="nuit-frise-zone">
        <div
          ref={ciel}
          className="nuit-frise-ciel"
          role="slider"
          tabIndex={0}
          aria-label={resume}
          aria-valuemin={debut}
          aria-valuemax={fin}
          aria-valuenow={instantMs}
          aria-valuetext={lectureAffichee}
          onPointerDown={surAppui}
          onPointerMove={surMouvement}
          onPointerUp={surRelache}
          onPointerCancel={surRelache}
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
          {/* L'horizon en pointillé, les heures posées dessus ; le Soleil et la Lune sur une
              même échelle de part et d'autre. */}
          <span
            className="nuit-horizon"
            style={proprietes({
              '--heure': String(tirets.heure),
              '--premiere': String(tirets.premiere),
            })}
          />
          <svg
            className="nuit-courbes"
            viewBox={`0 0 ${POURCENT} ${POURCENT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {courbes.map((c) => (
              <polyline
                key={c.astre}
                className={`nuit-courbe-trait nuit-courbe-${c.astre}`}
                points={c.points}
              />
            ))}
          </svg>
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
        {reperesHeures(vue, frise).map((r) => (
          <span
            key={r.cle}
            className={['nuit-repere', r.majeur && 'majeur', r.jour && 'jour']
              .filter(Boolean)
              .join(' ')}
            style={proprietes({ '--debut': r.position })}
          >
            {r.majeur ? <span className="nuit-repere-texte">{r.texte}</span> : null}
          </span>
        ))}
      </div>
      {/* Après les heures, pour passer dessus : posée sur l'horizon, une étiquette cachait la
          Lune qui s'y levait. */}
      {curseur !== null && (
        <span className="nuit-astres" aria-hidden="true">
          {astres.map(
            (a) =>
              a.hauteurDeg !== null && (
                <span
                  key={a.astre}
                  className={`nuit-astre nuit-astre-${a.astre}`}
                  style={proprietes({ '--debut': curseur, '--haut': ordonneeFrise(a.hauteurDeg) })}
                />
              ),
          )}
        </span>
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
