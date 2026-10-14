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
 * jusqu'à l'instant visé, et « Aller à la nuit » fait le même trajet jusqu'au début de la nuit
 * de référence — astronomique, ou nautique quand la nuit noire manque (§8.1). Les flèches
 * restent des sauts : un pas de dix minutes n'a rien à montrer en chemin. Arrivé en nuit
 * noire, le mode nuit est PROPOSÉ, jamais imposé : T-0140 a retiré l'activation automatique.
 *
 * T-0411 — la frise monte dans la barre haute, liée à l'horloge : un seul endroit règle le
 * temps. Ce qu'un geste laisse à dire (saut, proposition du mode nuit, cause) tombe SOUS la
 * frise, par-dessus le ciel, plutôt que de faire grandir la barre.
 *
 * « Aller à la nuit » est l'appel d'entrée, au milieu du ciel : il s'adresse à qui arrive de
 * jour. Ouvert la nuit, il n'a rien à proposer. Dès que le temps bouge sans lui, ou que la
 * visée bouge, l'utilisateur a trouvé ses gestes par lui-même, et l'appel se retire pour la
 * session.
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
  minuteAffichee,
  tempsScene,
  type TempsScene,
  useTrancheScene,
  vaA,
  vueScene,
  type VueScene,
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
  LIBELLE_PHASE_CIEL,
  libelleLuneInstant,
  libellePhaseLune,
  type MarqueLune,
  marquesLune,
  pointsCourbe,
  pourcentCss,
  reperesHeures,
  resumeLuneFrise,
} from './carte-nuit-calcul.ts'

export interface CarteNuitProps {
  readonly site: Site
  readonly nuit: FenetreNocturne
  /** T-0394 — l'état du mode nuit, pour ne proposer que ce qui n'est pas déjà fait. */
  readonly modeNuitActif: boolean
  readonly activeModeNuit: () => void
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

export function CarteNuit({ site, nuit, modeNuitActif, activeModeNuit }: CarteNuitProps) {
  const minute = useTrancheScene(minuteAffichee)
  const instantMs = minute * MS_PAR_MINUTE
  // La frise suit le trajet image par image ; le reste, la minute publiée.
  const trajetMs = useInstantTrajet()
  const afficheMs = trajetMs ?? instantMs
  const frise = useFriseCiel(site, afficheMs)
  // Ce que le dernier geste laisse à dire : un saut que la lisibilité a imposé, et la
  // proposition du mode nuit à l'arrivée. Le geste suivant efface les deux.
  const [saute, setSaute] = useState(false)
  const [propose, setPropose] = useState(false)

  const va = (ms: number): void => {
    setPropose(false)
    const plan = traverse(ms, () => setPropose(true))
    setSaute(plan.saut && plan.raison === 'ILLISIBLE')
  }
  const efface = (): void => {
    setSaute(false)
    setPropose(false)
  }

  const debutNuit = nuit.debutReference
  const phase = phaseFrise(site, frise, new Date(instantMs))
  const appelRetire = useAppelRetire(minute, phase !== 'JOUR')
  const appel = !appelRetire && debutNuit !== null && instantMs < debutNuit.getTime()
  const proposeNuit = propose && !modeNuitActif && phase === 'NUIT_NOIRE'

  return (
    <>
      <section className="panneau-nuit" role="region" aria-label="La nuit">
        <Frise frise={frise} site={site} instantMs={afficheMs} va={va} efface={efface} />
        <div className="nuit-messages">
          {nuit.cause !== undefined && <Mention ton="cause">{nuit.cause}</Mention>}
          {saute && (
            <Mention ton="etat" role="status">
              Saut direct : à ce zoom, le trajet défilerait trop vite pour se lire.
            </Mention>
          )}
          {proposeNuit && (
            <div className="nuit-gestes">
              <p className="nuit-proposition" role="status">
                Nuit noire.
              </p>
              <button type="button" onClick={activeModeNuit}>
                Passer en mode nuit
              </button>
              <button type="button" onClick={() => setPropose(false)}>
                Plus tard
              </button>
            </div>
          )}
        </div>
      </section>
      {appel && (
        <div className="nuit-appel">
          <button type="button" onClick={() => va(debutNuit.getTime())}>
            Aller à la nuit
          </button>
        </div>
      )}
    </>
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
 * T-0412 — la phase du ciel et la Lune de l'instant affiché, sous l'horloge et non plus sous la
 * frise : elles qualifient l'instant que l'horloge règle, et la frise prend toute la hauteur de
 * la barre. §11.2 ne laisse rien de critique au seul survol : la ligne reste à demeure. L'heure
 * n'y est plus — elle se lit juste au-dessus.
 */
export function LectureNuit({ site }: { readonly site: Site }) {
  const minute = useTrancheScene(minuteAffichee)
  const trajetMs = useInstantTrajet()
  const afficheMs = trajetMs ?? minute * MS_PAR_MINUTE
  const frise = useFriseCiel(site, afficheMs)
  const lecture = lectureFrise(site, frise, new Date(afficheMs))
  const lune = libellePhaseLune(lecture.luneCroissante, lecture.illuminationLune).toLowerCase()
  return (
    <p className="nuit-lecture">
      <span>{LIBELLE_PHASE_CIEL[lecture.phase]}</span>
      <span>Lune {lune}</span>
    </p>
  )
}

/** Ce que l'appel compare à son ouverture : le temps, la minute affichée, la visée. */
export interface ReperesAppel {
  readonly temps: TempsScene
  readonly minute: number
  readonly vue: Pick<VueScene, 'azimutDeg' | 'hauteurDeg' | 'fovDeg'>
}

/**
 * L'utilisateur a-t-il bougé le temps ou la visée depuis `depart` ?
 *
 * Le temps : un changement de mode, de vitesse ou de décalage — le magasin ne rend une tranche
 * neuve que si elle change ; temps figé, une minute réécrite aussi (compteur, frise, trajet).
 * En lecture ou en défilement la minute avance seule, elle ne compte pas.
 *
 * La visée : azimut, hauteur, champ — glisser, zoomer, cadrer. Pas la définition ni le
 * décalage de centre : ils se mesurent sur la boîte après le montage, sans geste.
 */
export function appelABouge(depart: ReperesAppel, courant: ReperesAppel): boolean {
  const { temps, minute, vue } = courant
  return (
    temps !== depart.temps ||
    (temps.modeTemps === 'FIGE' && minute !== depart.minute) ||
    vue.azimutDeg !== depart.vue.azimutDeg ||
    vue.hauteurDeg !== depart.vue.hauteurDeg ||
    vue.fovDeg !== depart.vue.fovDeg
  )
}

/**
 * Vrai, et pour la session, quand l'appel n'a plus lieu d'être : il faisait déjà nuit à
 * l'ouverture, ou l'utilisateur a bougé le temps ou la visée depuis.
 */
function useAppelRetire(minute: number, nuitAuDepart: boolean): boolean {
  const temps = useTrancheScene(tempsScene)
  const vue = useTrancheScene(vueScene)
  const depart = useRef<ReperesAppel>({ temps, minute, vue })
  const [retire, setRetire] = useState(nuitAuDepart)
  useEffect(() => {
    if (!retire && appelABouge(depart.current, { temps, minute, vue })) setRetire(true)
  }, [temps, minute, vue, retire])
  return retire
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
  readonly va: (ms: number) => void
  /** Retire ce que le geste précédent avait à dire. */
  readonly efface: () => void
}) {
  const [survol, setSurvol] = useState<Survol | null>(null)
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
  const surClic = (e: MouseEvent<HTMLDivElement>) => va(instantFraction(vue, pointe(e).fraction))

  const surTouche = (e: KeyboardEvent<HTMLDivElement>) => {
    const cible = instantClavier(vue, instantMs, e.key)
    if (cible === null) return
    e.preventDefault()
    efface()
    vaA(cible)
  }

  const resume =
    `De ${heure(vue.debut)} à ${heure(vue.fin)} : ` +
    phases.map((b) => LIBELLE_PHASE_CIEL[b.phase].toLowerCase()).join(', ') +
    `. ${resumeLuneFrise(frise.lune, vue)}`

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
          aria-valuenow={instantMs}
          aria-valuetext={lectureAffichee}
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
          {/* Le Soleil et la Lune sur une même échelle, l'horizon au milieu. */}
          <svg
            className="nuit-courbes"
            viewBox={`0 0 ${POURCENT} ${POURCENT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line className="nuit-horizon" x1={0} y1={POURCENT / 2} x2={POURCENT} y2={POURCENT / 2} />
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
