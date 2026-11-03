/**
 * §3 — the scène: two-clock pipeline, unified engine, three tracé layers, matériel cadre
 * overlay and §9 filé preview painted in that cadre.
 * Not decorative: entry point to the engines. Click on a ciel profond object opens the filled
 * Cible tab (§6.2 / §6.3 / §7); the overlaid cadre shows what the declared matériel would
 * really capture — arcs included.
 * Since lot 6 settings are in the right panel, eye-level with the image they change. Since
 * T-0038 no readings; since T-0153 one remains: the sentence dating the image, bottom-bar
 * centre. Publishes to the scène store what it alone knows: clicked object, pending filé pass.
 * Only canvas + assembly remain: render loop `planetarium-boucle.ts`, filé preview
 * `planetarium-panorama.ts`, gestures `planetarium-gestes.ts`.
 */

import { useEffect, useMemo, useRef } from 'react'
import { Body } from 'astronomy-engine'
import type { Etoile } from '../data/catalog.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { PaquetConstellations } from '../data/constellations.ts'
import { coucheAsterismes, coucheFigures, coucheFrontieres } from '../core/constellations.ts'
import { reglageVitesse } from '../core/curseur-temps.ts'
import type { IndexCiel } from '../core/index-ciel.ts'
import { cielInstantane } from '../core/horloges.ts'
import { etatLune } from '../core/moon.ts'
import { sbEffectifRendu, sbZenithAvecCrepuscule } from '../core/fond-ciel-rendu.ts'
import { separationDeg, versVecteur } from '../core/mat3.ts'
import type { LuneEcran, SoleilEcran } from './dessine-fond-ciel.ts'
import { apparitionReperes } from './apparence-objets.ts'
import { useInstantTrajet } from './trajet-scene.ts'
import { etatProfondeur } from '../core/projection.ts'
import {
  ACTIONS_SCENE,
  BORDURES_SCENE,
  decalageCentreScene,
  instant,
  majVue,
  minuteAffichee,
  renduScene,
  resolutionRendu,
  tempsScene,
  useScene,
  useTrancheScene,
  vueScene,
} from './scene-etat.ts'
import { MS_PAR_MINUTE } from '../core/unites.ts'
import { useSeance } from './seance-etat.ts'
import type { ProfilCadre } from '../core/cadre.ts'
import { positionCorps, type Site } from '../core/ephem.ts'
import type { MasqueHorizon } from '../core/site.ts'
import type { SurvolEcran } from './dessine-ciel.ts'
import { useBoucleRendu, type EtatBoucle } from './planetarium-boucle.ts'
import { profilCible, profilsScene, type Zoom } from './zoom-calcul.ts'
import { useParametresFile } from './planetarium-panorama.ts'
import {
  RACCOURCIS_CLAVIER,
  useGestesZoom,
  usePilotageClavier,
  usePointageSouris,
} from './planetarium-gestes.ts'
import { ligneVisee } from './scene-lecture.ts'

export {
  facteurZoom,
  roulisApresGlisser,
  signaturePave,
  sourceMolette,
  type SourceGeste,
} from './planetarium-gestes.ts'

/**
 * T-0068 — description tied to the canvas. An id, not a long `aria-label`: name says WHAT IT
 * IS, description says WHAT IS SEEN NOW.
 */
const ID_DESCRIPTION = 'planetarium-description'
export type { MaterielFile } from './planetarium-materiel.ts'

import {
  ciblesMarquees,
  enAvantScene,
  poseCadreAffichee,
  type MaterielFile,
} from './planetarium-materiel.ts'

/** T-0297 — what the scène says while the star catalogue loads. */
export const ETOILES_EN_CHARGE = 'Chargement des étoiles…'

export interface PlanetariumProps {
  readonly site: Site
  /** §4.1 — surveyed site relief: what the Sol layer masks, not a flat horizon. */
  readonly masque: MasqueHorizon
  /** T-0369 — entered lieu's relief loading: Sol layer flattens meanwhile. */
  readonly horizonEnAttente: boolean
  /** T-0297 — star catalogue not decoded yet: scène says so. */
  readonly etoilesEnCharge?: boolean
  readonly etoiles: readonly Etoile[]
  /** Catalogue selection index, built once by the app. */
  readonly index: IndexCiel
  readonly objets: readonly ObjetCielProfond[]
  /** §6.4 — designations kept by targets-panel filters; other markers dim. `null` = no filter. */
  readonly enAvant: ReadonlySet<string> | null
  /** Targets the night plan photographs, `null` until computed. "Mon plan": only they stay lit. */
  readonly ciblesPlan: readonly ObjetCielProfond[] | null
  readonly constellations: PaquetConstellations
  /** Cadre profiles to overlay (§3.5). Empty: app asks for the profile, invents none. */
  readonly profils: readonly ProfilCadre[]
  /**
   * Under a zoom, scène paints the cadres of both ring ends + the one the open or hovered
   * target would get. `null` outside zoom: the setting's cadre suffices.
   */
  readonly zoom: Zoom | null
  readonly gaiaCharge: boolean
  /**
   * §3.7 — site fond de ciel (§2.2). Sets Voie lactée band contrast: scène shows THIS site's
   * sky, not an ideal reference map.
   */
  readonly sbCiel: number
  /** §11.1 — no unrequested animation in mode nuit. */
  readonly modeNuit: boolean
  /** Absent: scène cannot inlay the filé, no quantifiable matériel. */
  readonly file?: MaterielFile
  readonly surSelectionObjet: (objet: ObjetCielProfond) => void
}

/**
 * T-0040 — render definition follows the box, else bands around the image. CSS size observed,
 * never canvas attributes: rewriting them does not change the box → no self re-trigger.
 * T-0258 — same measure gives the aim centre, together: offset is in render pixels, hence in
 * the definition just computed.
 */
function useResolutionSuitLaBoite(canevas: React.RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const cible = canevas.current
    if (cible === null || typeof ResizeObserver === 'undefined') return
    const bordures = [...document.querySelectorAll(BORDURES_SCENE.join(', '))]
    const mesure = (): void => {
      // `getBoundingClientRect`, not the entry's `contentRect`: offset compares boxes, needs one
      // reference frame for all three.
      const boite = cible.getBoundingClientRect()
      if (boite.width === 0 || boite.height === 0) return
      const resolution = resolutionRendu(boite.width, boite.height, window.devicePixelRatio || 1)
      majVue({
        ...resolution,
        decalageCentreXPx: decalageCentreScene(
          boite,
          bordures.map((bordure) => bordure.getBoundingClientRect()),
          resolution.largeurPx,
        ),
      })
    }
    const observateur = new ResizeObserver(mesure)
    observateur.observe(cible)
    // Borders observed too: under fold they leave the scène flank and their size changes, not
    // the canvas's.
    for (const bordure of bordures) observateur.observe(bordure)
    return () => {
      observateur.disconnect()
    }
  }, [canevas])
}

export function Planetarium(props: PlanetariumProps) {
  const canevas = useRef<HTMLCanvasElement>(null)
  // T-0085 — hover lives outside React: changes per mouse move, only the loop reads it. Via
  // state: scène rendered 60×/s for a transient label.
  const survol = useRef<SurvolEcran | null>(null)

  // Pointage, time, layers are the scène's, set from the right panel.
  // T-0248 — by slices, instant at the minute: loop publishes 2×/s, each render of this
  // component repaints the canvas. Moon and twilight move no pixel in a minute; sky rotates in
  // the loop at the exact instant.
  const pointage = useTrancheScene(vueScene)
  const temps = useTrancheScene(tempsScene)
  const rendu = useTrancheScene(renduScene)
  const minuteScene = useTrancheScene(minuteAffichee)
  // T-0394 — during a trajet, the minute the trajet crosses, per frame: store publishes only
  // at its ordinary cadence.
  const trajetMs = useInstantTrajet()
  const minute = trajetMs === null ? minuteScene : Math.floor(trajetMs / MS_PAR_MINUTE)
  const actions = ACTIONS_SCENE
  const { fovDeg, largeurPx, hauteurPx } = pointage
  const seance = useSeance()
  const { file, mode } = seance

  const figures = useMemo(
    () => coucheFigures(props.constellations.figures, props.constellations.etoilesNommees),
    [props.constellations],
  )
  const asterismes = useMemo(
    () => coucheAsterismes(props.constellations.asterismes, props.constellations.etoilesNommees),
    [props.constellations],
  )
  const frontieres = useMemo(() => coucheFrontieres(props.constellations), [props.constellations])

  const dateAffichee = useMemo(() => new Date(minute * MS_PAR_MINUTE), [minute])
  // T-0100 — Moon of the displayed instant: halo centred on IT, same state as the drawn body.
  // §12.5 — instant outside the series domain does not blank the scène: Moon drops out of the
  // calc, rest continues.
  const lune = useMemo((): LuneEcran | null => {
    try {
      const etat = etatLune(props.site, dateAffichee)
      return {
        adH: etat.adH,
        decDeg: etat.decDeg,
        altitudeDeg: etat.altitudeDeg,
        anglePhaseDeg: etat.anglePhaseDeg,
        azimutDeg: etat.azimutDeg,
        demiDiametreDeg: etat.demiDiametreDeg,
      }
    } catch {
      return null
    }
  }, [props.site, dateAffichee])

  /**
   * T-0099 — Sun depression below horizon at displayed instant, degrees. It, not legal time,
   * decides background clarity: the time cursor crosses twilight in every séance.
   * Height refraction-corrected, as everywhere. Patat 2006 table is fitted on geometric
   * depression but starts at 5° below the horizon, where refraction corrects nothing.
   * §12.5 — instant outside the series domain: twilight drops out of the calc, rest continues
   * (same rule as the Moon above).
   */
  const soleil = useMemo((): SoleilEcran | null => {
    try {
      const position = positionCorps(Body.Sun, dateAffichee, props.site)
      return { adH: position.adH, decDeg: position.decDeg, altitudeDeg: position.hauteurDeg }
    } catch {
      return null
    }
  }, [props.site, dateAffichee])
  const depressionSolaireDeg = soleil === null ? null : -soleil.altitudeDeg
  // By day, vue réaliste, no star: blue sky erases all. Bortle table, bounded at its bright
  // edge, would let through up to magnitude 4.
  const jour = rendu.vueRealiste && soleil !== null && soleil.altitudeDeg > 0
  // By day, night-sky reference marks have nothing to link: withdrawn with the stars. Layer
  // setting untouched, returns at night.
  const couchesScene = useMemo(
    () =>
      jour
        ? {
            ...rendu.couches,
            figures: false,
            frontieres: false,
            asterismes: false,
            voieLactee: false,
          }
        : rendu.couches,
    [jour, rendu.couches],
  )

  /**
   * T-0098, T-0100 — EFFECTIVE fond de ciel in the aimed direction: site's + horizon halo +
   * Moon. Caps limiting magnitude in vue réaliste; else a full Moon would show as many stars
   * as a dark night.
   */
  const sbEffectif = useMemo(
    () =>
      sbEffectifRendu({
        sbSiteMag: props.sbCiel,
        hauteurDeg: pointage.hauteurDeg,
        ...(depressionSolaireDeg === null ? {} : { depressionSolaireDeg }),
        ...(lune === null || lune.altitudeDeg <= 0
          ? {}
          : {
              lune: {
                altitudeLuneDeg: lune.altitudeDeg,
                altitudeCibleDeg: pointage.hauteurDeg,
                separationDeg: separationDeg(
                  versVecteur(pointage.azimutDeg, pointage.hauteurDeg),
                  versVecteur(lune.azimutDeg, lune.altitudeDeg),
                ),
                anglePhaseDeg: lune.anglePhaseDeg,
              },
            }),
      }),
    [props.sbCiel, pointage.azimutDeg, pointage.hauteurDeg, lune, depressionSolaireDeg],
  )

  /**
   * T-0099 — site fond de ciel at zenith, twilight included. Scène starts from it for ALL
   * layers: background tint, halo steps, band contrast. Vue réaliste unticked = bare site fond,
   * scène pixel-identical to pre-T-0097.
   */
  const sbCielScene = useMemo(
    () =>
      rendu.vueRealiste && depressionSolaireDeg !== null
        ? sbZenithAvecCrepuscule(props.sbCiel, depressionSolaireDeg)
        : props.sbCiel,
    [props.sbCiel, rendu.vueRealiste, depressionSolaireDeg],
  )

  const profondeur = useMemo(
    () => etatProfondeur(fovDeg, props.index.profondeurMag, sbEffectif, rendu.vueRealiste),
    [fovDeg, props.index.profondeurMag, sbEffectif, rendu.vueRealiste],
  )
  const reglage = useMemo(
    () => reglageVitesse(temps.facteur, largeurPx, fovDeg),
    [temps.facteur, largeurPx, fovDeg],
  )
  // T-0116 — filé painted in the loop, across the scène: hook supplies only what it holds from
  // matériel and panel. View, background, pole come from the frame.
  const parametresFile = useParametresFile({
    mode,
    seance,
    materiel: props.file,
  })

  useResolutionSuitLaBoite(canevas)

  // Panorama: filé and its pose map are quantified at the ring setting: its cadre alone.
  const profilsAffiches = useMemo(
    () => (mode === 'PANORAMA' ? props.profils : profilsScene(props.zoom, props.profils)),
    [mode, props.zoom, props.profils],
  )
  const cadreCible = useMemo(() => {
    if (mode === 'PANORAMA') return null
    const fiche = mode === 'CIEL_PROFOND' && seance.vueCibles === 'FICHE' ? seance.cible : null
    const objet = seance.survolee ?? fiche
    const profil = objet === null ? null : profilCible(props.zoom, objet, seance.essaiZoom, props.profils)
    return objet === null || profil === null ? null : { objet, profil }
  }, [mode, seance.vueCibles, seance.cible, seance.survolee, seance.essaiZoom, props.zoom, props.profils])

  // Mutable state read by the render loop, rewritten each React render.
  const etatBoucle = useRef<EtatBoucle>(null!)
  etatBoucle.current = {
    site: props.site,
    masque: props.masque,
    horizonEnAttente: props.horizonEnAttente,
    etoiles: props.etoiles,
    objets: props.objets,
    constellations: props.constellations,
    profils: profilsAffiches,
    modeNuit: props.modeNuit,
    index: props.index,
    figures,
    asterismes,
    frontieres,
    couches: couchesScene,
    jour,
    poseCadre: poseCadreAffichee(mode, file.poseDansCadre, props.file),
    enAvant: enAvantScene(mode, props.enAvant, props.ciblesPlan),
    parcours: rendu.parcours,
    ciblesOuvertes: ciblesMarquees(mode, seance.vueCibles, seance.cible, props.ciblesPlan),
    cadreCible,
    magLimite: jour ? Number.NEGATIVE_INFINITY : profondeur.magLimite.value,
    apparition:
      rendu.vueRealiste && soleil !== null ? apparitionReperes(soleil.altitudeDeg) : 1,
    sbCiel: sbCielScene,
    vueRealiste: rendu.vueRealiste,
    lune,
    soleil: rendu.vueRealiste ? soleil : null,
    vue: pointage,
    modeTemps: temps.modeTemps,
    facteur: reglage.facteur,
    decalageMs: temps.decalageMs,
    // T-0137 — mode nuit changes only colours: does not cut scrolling, set under the sky as in
    // prep. T-0072: `prefers-reduced-motion` adds nothing either — scrolling is never the start
    // state (§3.2, `MAINTENANT`), cannot impose itself; cutting it by default would remove a
    // requested mode.
    anime: temps.modeTemps === 'DEFILEMENT',
  }

  const cibles = useBoucleRendu({ canevas, etat: etatBoucle, instant, parametresFile, survol })
  const souris = usePointageSouris({
    largeurPx,
    fovDeg,
    actions,
    cibles,
    survol,
    surSelectionObjet: props.surSelectionObjet,
  })
  useGestesZoom(canevas, props.gaiaCharge)
  // T-0069 — WCAG 2.1.1: same gestures by keyboard, same bounds.
  const clavier = usePilotageClavier({
    largeurPx,
    hauteurPx,
    decalageCentreXPx: pointage.decalageCentreXPx,
    gaiaCharge: props.gaiaCharge,
    cibles,
    surSelectionObjet: props.surSelectionObjet,
  })

  return (
    <section className="scene">
      <canvas
        ref={canevas}
        className="planetarium"
        width={largeurPx}
        height={hauteurPx}
        /* T-0068 / T-0069 — `application`, not `img`: scène driven by keyboard, assistive tech
           must let arrows through instead of keeping them for its own traversal. Without a
           role a canvas is a pixel box that does not exist for it. */
        role="application"
        tabIndex={0}
        aria-label="Planétarium — le ciel du site à l’instant affiché"
        aria-describedby={ID_DESCRIPTION}
        onKeyDown={clavier.onKeyDown}
        onPointerDown={souris.onPointerDown}
        onPointerMove={souris.onPointerMove}
        onPointerUp={souris.onPointerUp}
        onPointerLeave={souris.onPointerLeave}
      />
      {/* T-0068 — what the view shows now, in the exact words of the bottom-bar reading
          (`ligneVisee` alone composes the sentence). Out of visual flow — central column
          reserves no height under the canvas (T-0040) — but in the accessibility tree. */}
      <DescriptionScene site={props.site} />
      {/* T-0297 — a starless sky looks overcast: must say they are coming. */}
      {props.etoilesEnCharge === true && (
        <p className="etat scene-attente" role="status">
          {ETOILES_EN_CHARGE}
        </p>
      )}
    </section>
  )
}

/**
 * T-0248 — description follows the exact instant, like the bottom-bar sentence whose words it
 * borrows. Separate component: its 2×/s renders touch neither the planetarium nor its loop
 * state, so do not repaint the canvas.
 */
function DescriptionScene({ site }: { readonly site: Site }) {
  const { vue, msAffiche } = useScene()
  const date = useMemo(() => new Date(msAffiche), [msAffiche])
  const ciel = useMemo(() => cielInstantane(site, date), [site, date])
  return (
    <p className="scene-description" id={ID_DESCRIPTION}>
      {ligneVisee(vue, ciel.matrice, date)}. {RACCOURCIS_CLAVIER}
    </p>
  )
}
