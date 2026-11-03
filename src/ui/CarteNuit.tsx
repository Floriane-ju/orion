/**
 * §8.1 — the night at a glance, in top bar between clock and return-to-present.
 * "Plan de nuit" card gives it as table, collapsed on scène; here same night as a frise, where
 * cibles are chosen. No object data: the night, not the cible.
 * Frise has no legend/note: hover bulle says what a pattern or stroke means at pointed instant
 * (permanent text pushed the list down).
 * T-0390 — frise also commands time: click, press or arrow sets scène instant (§3.2). One line
 * stays permanently, day and night: time + phase of shown instant (§11.2: nothing critical
 * hover-only; touch has no hover).
 * Cursor stays centred, frise scrolls: 12 h before/after instant (`fenetreFrise`). Setting
 * date/time slides the sky under the cursor, not the cursor through a frozen night.
 * T-0394 — DA review §4.2 "La tombée de la nuit": click TRAVERSES time to aimed instant. Arrows
 * stay jumps (a 10 min step has nothing to show en route).
 * T-0411 — frise in top bar, tied to clock: one place sets time. What a gesture leaves to say
 * (jump, cause) falls UNDER the frise, over sky, not growing the bar.
 * T-0419 — frise also dragged: drag scrolls the instant under cursor, continuous, no trajectory
 * (gesture IS the trajectory). Under the tremor threshold a released press stays a click.
 * T-0420 — click ALWAYS traverses time, like the time panel: one aims an instant to watch it
 * come; a zoom-imposed jump stripped click of meaning.
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
  suiviScene,
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

/** Custom properties, never an inline colour: stylesheet keeps control. */
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
  // Frise follows the trajectory frame by frame; the rest, the published minute.
  const trajetMs = useInstantTrajet()
  const afficheMs = trajetMs ?? instantMs
  const frise = useFriseCiel(site, afficheMs)
  const suivi = useTrancheScene(suiviScene)
  // What the last gesture leaves to say: a jump legibility imposed. Next gesture clears it.
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
        {/* Say what the visée follows: sky sliding alone would pass for a bug. */}
        {suivi !== null && (
          <Mention ton="etat" role="status">
            Cadré : {suivi.designation} — la visée suit la rotation du ciel.
          </Mention>
        )}
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

/** Frise ephemerides recompute hourly, scrolling every frame. */
function useFriseCiel(site: Site, afficheMs: number): FriseNuit {
  const heureCalcul = Math.floor(afficheMs / MS_PAR_H)
  return useMemo(
    () => friseCiel(site, fenetreCalculFrise(heureCalcul * MS_PAR_H)),
    [site, heureCalcul],
  )
}

/**
 * T-0412 — Moon at shown instant, in its cell of time block, drawn at its phase and named below —
 * day and night: phase is prepared before night. Disc reads at a glance where "Lune décroissante
 * 10 %" needed reading; sky's phase is seen in the frise beside, and stays in the accessible name
 * (§11.2: nothing critical hover-only; screen reader has no disc).
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

/** A press on the frise: where it began, instant then, and whether it already dragged. */
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
  /** Traverses time to the aimed instant. */
  readonly va: (ms: number, force?: boolean) => void
  /** Clears what the previous gesture had to say. */
  readonly efface: () => void
}) {
  const [survol, setSurvol] = useState<Survol | null>(null)
  const appui = useRef<Appui | null>(null)
  // Click follows a drag's release: must not traverse to the instant under the finger.
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
  // Each body marked by a dot on its curve, at cursor instant.
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
    // Magnet reach = one spacing step (`--pas-2`), read from stylesheet not copied: half a gloved
    // target grabbed the pointer too far, bulle stuck on rise when reading neighbouring minutes.
    const portee =
      parseFloat(getComputedStyle(e.currentTarget).getPropertyValue('--pas-2')) *
      parseFloat(getComputedStyle(document.documentElement).fontSize) /
      cadre.width
    return aimante(encadre((e.clientX - cadre.left) / cadre.width, 0, 1), marques, portee)
  }

  // Magnet applies to click as to hover: a press near a Moon rise goes there.
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

  // T-0424 — horizontal scroll pulls the ribbon like a drag. Native listener: React's is passive,
  // can't hold the browser's back gesture. Start = `instant.ms`, current as of `vaA`: wheel pulls
  // faster than React renders, rounded displayed minute would lose small trackpad steps.
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
          {/* Dotted horizon with hours on it; Sun and Moon on one scale either side. */}
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
      {/* After the hours, to pass over them: on the horizon a label hid the Moon rising there. */}
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
 * Hover bulle: pointed instant, Moon, sky — and, magnet-snapped, Moon rise/set in accent. Mute for
 * synthèse (has the frise summary). Not `Bulle`: follows pointer, anchored to no element.
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
        {/* Sky first — time and what it's worth —, Moon next, under a rule. */}
        <span className="nuit-bulle-heure">{heure(lecture.instant)}</span>
        <span>{LIBELLE_PHASE_CIEL[lecture.phase]}</span>
        <span className="nuit-bulle-lune">
          <span className="nuit-bulle-disque">
            <DisqueLuneVue disque={disque} />
          </span>
          <span className="nuit-bulle-lune-lectures">
            {/* At a rise instant disc CENTRE altitude is still negative (rise = upper limb,
                refraction incl.). "Sous l'horizon" would contradict the accent line: event
                replaces it. */}
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

/** Disc lit per its phase; size comes from its container. */
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
