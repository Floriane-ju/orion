/**
 * §3 — sky render loop, beside React.
 * Render lives in a `requestAnimationFrame` reading mutable state; React reacts only to
 * commands and the published instant, never the frame (else 60 renders/s).
 * T-0248 — loop runs continuously but PAINTS only what changed. `MAINTENANT` sky drifts 1 px
 * per 25 s at 200° champ: repainting 30×/s = a CPU core reproducing the same image.
 */

import { useEffect, useRef, type RefObject } from 'react'
import { pxParDegre, vitesseEcran } from '../core/curseur-temps.ts'
import type { Etoile } from '../data/catalog.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { PaquetConstellations } from '../data/constellations.ts'
import type { CoucheFrontieres, CoucheTraces } from '../core/constellations.ts'
import type { IndexCiel } from '../core/index-ciel.ts'
import {
  avanceEphemerides,
  axePoleDeDate,
  cielInstantane,
  pasEphemeridesMs,
  positionsInterpolees,
  type EtatEphemerides,
} from '../core/horloges.ts'
import { projecteur, type Vue } from '../core/projection.ts'
import { separationDeg, versVecteur, type Mat3 } from '../core/mat3.ts'
import { coordonneesHorizon } from '../core/cibles-liste.ts'
import type { Cadre, ProfilCadre } from '../core/cadre.ts'
import type { MasqueHorizon } from '../core/site.ts'
import { Body, type Site } from '../core/ephem.ts'
import {
  afficheInstant,
  borneInstant,
  etatScene,
  recaleSuivi,
  type ParcoursScene,
  vuePlanetarium,
  type VueScene,
} from './scene-etat.ts'
import { poseRenduFile, publicateurRenduFile } from './seance-etat.ts'
import { enTrajet } from './trajet-scene.ts'
import type { CouchesActives } from './dessine-ciel.ts'
import { dessineChamp, type ParametresFile, type SortieDessinChamp } from './dessine-champ.ts'
import { clientFile, creePortFile, type ClientFile } from './file-hors-fil.ts'
import { etoilesReelles, indexFile } from './file-index.ts'
import { dessineCiel, type CibleEcran, type SurvolEcran } from './dessine-ciel.ts'
import type { OptiquePose } from './dessine-pose-cadre.ts'
import { viseeVersVue } from './scene-lecture.ts'
import type { LuneEcran, SoleilEcran } from './dessine-fond-ciel.ts'
import { B } from '../registry/budgets.ts'
import { MS_PAR_S } from '../core/unites.ts'
import { cacheTrajetLune, instantsTrajetLune, trajetLune } from '../core/trajet-lune.ts'
import { luneFile, type LuneFile } from '../core/fond-lune-file.ts'
import { R } from '../registry/relief.ts'
import { HORIZON_PLAT, horizonA, versHorizon, type TransitionHorizon } from './horizon-transition.ts'

/** French names of §3.1 moving bodies. */
const NOMS_CORPS: Readonly<Record<string, string>> = Object.freeze({
  Sun: 'Soleil',
  Moon: 'Lune',
  Mercury: 'Mercure',
  Venus: 'Vénus',
  Mars: 'Mars',
  Jupiter: 'Jupiter',
  Saturn: 'Saturne',
  Uranus: 'Uranus',
})

const PERIODE_PUBLICATION_MS = B('PUBLICATION_MS')
const INTERVALLE_MIN_MS = MS_PAR_S / B('IMAGES_PAR_S_MAX')
/** Smallest drift the screen can show. Platform fact, not a render threshold. */
const DERIVE_VISIBLE_PX = 1

/** T-0395 — a relief in transition has no courbes: arrival ones wait until it settles. */
const COURBES_VIDES = new Float32Array(0)

/**
 * Tracked target aim at frame instant; `null` = no suivi.
 * Paint with it, not React vue (always 1 render behind: sky at current instant under an older
 * aim advanced 1 px then returned → suivi jitter). Store re-synced only at 1 px drift, else
 * React wakes every frame for unchanged readings.
 */
function suitCible(site: Site, date: Date): { azimutDeg: number; hauteurDeg: number } | null {
  const { suivi, vue } = etatScene()
  if (suivi === null) return null
  const visee = coordonneesHorizon(suivi, cielInstantane(site, date).matrice)
  const ecartDeg = separationDeg(
    versVecteur(visee.azimutDeg, visee.hauteurDeg),
    versVecteur(vue.azimutDeg, vue.hauteurDeg),
  )
  if (ecartDeg * pxParDegre(vue.largeurPx, vue.fovDeg) >= DERIVE_VISIBLE_PX) {
    recaleSuivi(visee.azimutDeg, visee.hauteurDeg)
  }
  return visee
}

/** Everything the loop reads per frame, rewritten each React render. */
export interface EtatBoucle {
  readonly site: Site
  readonly etoiles: readonly Etoile[]
  readonly objets: readonly ObjetCielProfond[]
  readonly constellations: PaquetConstellations
  readonly profils: readonly ProfilCadre[]
  readonly modeNuit: boolean
  readonly index: IndexCiel
  readonly figures: readonly CoucheTraces[]
  readonly asterismes: readonly CoucheTraces[]
  readonly frontieres: CoucheFrontieres
  readonly couches: CouchesActives
  /** Vue réaliste, Soleil levé: only Sun and Moon drawn, no ciel profond. */
  readonly jour: boolean
  /** §4.1 — site relief: Sol layer takes ground height, azimuth by azimuth. */
  readonly masque: MasqueHorizon
  /** T-0369 — entered lieu's relief loading: Sol layer flattens meanwhile. */
  readonly horizonEnAttente: boolean
  readonly magLimite: number
  /** T-0357 — visible share of stars and night marks: 0 by day, 1 at night. */
  readonly apparition: number
  /** §3.7 — site fond de ciel: modulates Voie lactée contrast. */
  readonly sbCiel: number
  /** §3.3 — vue réaliste: sky background takes the site's luminance (T-0097). */
  readonly vueRealiste: boolean
  /** T-0100 — Moon at displayed instant. Absent = no lunar halo. */
  readonly lune: LuneEcran | null
  /** Sun at displayed instant. `null` = no solar halo. */
  readonly soleil: SoleilEcran | null
  /** §9.1 / T-0142 — optics when the pose map is requested in the cadre, else `null`. */
  readonly poseCadre: OptiquePose | null
  /** §6.4 — targets retained by catalogue filters; `null` if none active. */
  readonly enAvant: ReadonlySet<string> | null
  /** §8.4 / T-0324 — pointage path shown; `null` = everyday scène. */
  readonly parcours: ParcoursScene | null
  /** §6.4 / T-0283 — open fiche's target, or the plan's on "Mon plan". */
  readonly ciblesOuvertes: readonly ObjetCielProfond[]
  /** Under a zoom, the cadre the open or hovered target would get; else `null`. */
  readonly cadreCible: { readonly objet: ObjetCielProfond; readonly profil: ProfilCadre } | null
  readonly vue: VueScene
  readonly modeTemps: string
  readonly facteur: number
  /** §3.2 — constant gap between displayed instant and system clock. */
  readonly decalageMs: number
  readonly anime: boolean
}

/**
 * Next frame's instant. `MAINTENANT`: continuous resync, no drift over hours; offset makes the
 * reading resumable where left — system clock gives cadence, not destination (T-0137).
 * T-0360: transport stops at displayed-year bounds, does not cross them.
 */
export function instantSuivant(
  courant: Pick<EtatBoucle, 'modeTemps' | 'facteur' | 'decalageMs' | 'anime'>,
  ms: number,
  dtMs: number,
  maintenantMs: number,
): number {
  if (courant.modeTemps === 'MAINTENANT') return borneInstant(maintenantMs + courant.decalageMs)
  return courant.anime ? borneInstant(ms + dtMs * courant.facteur) : ms
}

/** T-0248 — what a frame read: to tell whether the next would paint anything else. */
export interface ImageLue {
  /** Identity changes at each React render of the scène: vue, couches, filé, mode nuit… */
  readonly etat: Pick<EtatBoucle, 'vue' | 'modeTemps' | 'anime'>
  /** Hovered body, not the `cibles` entry carrying it (new each frame). */
  readonly survole: unknown
  /** Canvas definition: rewriting it clears it. */
  readonly largeurPx: number
  readonly hauteurPx: number
  readonly instantMs: number
}

/**
 * T-0248 — does the current frame differ from the last painted?
 * `MAINTENANT`: sky turns with no state change → repaint when rotation moved the screen 1 px,
 * at §3.2 speed (`vitesseEcran`, factor 1). Scrolling: each frame new. Frozen time: only a
 * state change counts.
 */
export function doitDessiner(peinte: ImageLue | null, courante: ImageLue): boolean {
  if (peinte === null) return true
  if (
    courante.etat !== peinte.etat ||
    courante.survole !== peinte.survole ||
    courante.largeurPx !== peinte.largeurPx ||
    courante.hauteurPx !== peinte.hauteurPx
  ) {
    return true
  }
  if (courante.etat.anime) return true
  // T-0394 — frozen time, instant moves only under a gesture: a trajet writes it each frame;
  // published minute changes too slowly to repaint its two ends.
  if (courante.etat.modeTemps !== 'MAINTENANT') return courante.instantMs !== peinte.instantMs
  const { largeurPx, fovDeg } = courante.etat.vue
  const pxParS = vitesseEcran(1, pxParDegre(largeurPx, fovDeg)).value
  const deriveS = Math.abs(courante.instantMs - peinte.instantMs) / MS_PAR_S
  return deriveS * pxParS >= DERIVE_VISIBLE_PX
}

/** Body the hover designates, stable across frames; `null` without hover. */
function astreSurvole(survol: SurvolEcran | null): unknown {
  const cible = survol?.cible
  if (cible === undefined) return null
  // Moving body repositioned each frame: its name is its only stable identity.
  return cible.objet ?? cible.etoileNommee ?? cible.etoile ?? cible.nom
}

/**
 * Starts the loop; returns the on-screen target list, rewritten each painted frame: what the
 * click queries for what is under the cursor.
 */
export function useBoucleRendu(entree: {
  readonly canevas: RefObject<HTMLCanvasElement | null>
  readonly etat: RefObject<EtatBoucle>
  readonly instant: { ms: number }
  /** §9.3 — filé pass params; `null` = off. */
  readonly parametresFile: RefObject<ParametresFile | null>
  /** T-0085 — element under the cursor, re-read per frame, not per React render. */
  readonly survol: RefObject<SurvolEcran | null>
}): RefObject<readonly CibleEcran[]> {
  const { canevas, etat, instant, parametresFile, survol } = entree
  const cibles = useRef<readonly CibleEcran[]>([])
  const ephemerides = useRef<EtatEphemerides | null>(null)

  useEffect(() => {
    // T-0248 — opaque: `passeFond` covers the whole canvas before any layer, compositor need
    // not blend with what is behind.
    const contexte = canevas.current?.getContext('2d', { alpha: false }) ?? null
    if (contexte === null) return

    let actif = true
    let dernierTs: number | null = null
    let dernierePublication = 0
    let peinte: ImageLue | null = null
    // T-0116 — filé counters publish with the instant, never per frame: `poseRenduFile` goes
    // through the séance store → a React render.
    const publieFile = publicateurRenduFile(poseRenduFile)
    // Box rewritten per frame, not a local: filé pass writes from a closure, control flow does
    // not follow it there.
    const derniereFile: { sortie: SortieDessinChamp | null } = { sortie: null }
    // T-0065 — single `Date`, rewritten per frame. `cielInstantane` reads without keeping:
    // nothing survives the call, no new allocation justified.
    const instantDate = new Date(0)
    // T-0369 — Sol layer glides between reliefs; without requested motion it jumps.
    const dureeHorizonMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : R('DUREE_TRANSITION_RELIEF_MS')
    let transitionHorizon: TransitionHorizon | null = null
    // T-0398 — filé pass painted in a worker when the platform allows.
    const port = creePortFile()
    const horsFil: ClientFile | null = port === null ? null : clientFile(port)
    let versionPeinte = 0
    let catalogueEnvoye: readonly Etoile[] | null = null
    /** What decides a filé frame: unchanged → no request goes out. */
    let derniereDemande: readonly unknown[] = []
    // T-0399 — Moon positions already computed: a pan recomputes none.
    const cacheLune = cacheTrajetLune()

    const image = (ts: number): void => {
      if (!actif) return
      requestAnimationFrame(image)
      // Rate cap: skip this tick, next frame re-evaluates.
      if (dernierTs !== null && ts - dernierTs < INTERVALLE_MIN_MS) return
      const courant = etat.current
      const dt = dernierTs === null ? 0 : ts - dernierTs
      dernierTs = ts

      instant.ms = instantSuivant(courant, instant.ms, dt, Date.now())
      instantDate.setTime(instant.ms)
      const visee = suitCible(courant.site, instantDate)

      const courante: ImageLue = {
        etat: courant,
        survole: astreSurvole(survol.current),
        largeurPx: contexte.canvas.width,
        hauteurPx: contexte.canvas.height,
        instantMs: instant.ms,
      }
      const cibleHorizon = courant.horizonEnAttente ? HORIZON_PLAT : courant.masque.altitudesDeg
      transitionHorizon = versHorizon(transitionHorizon, cibleHorizon, ts, dureeHorizonMs)
      const horizon = horizonA(transitionHorizon, ts, dureeHorizonMs)
      const enTransition = horizon !== transitionHorizon.cible
      // T-0398 — filé frame received from the worker is set without awaiting another change.
      const recue = horsFil !== null && horsFil.version() !== versionPeinte
      if (enTransition || recue || doitDessiner(peinte, courante)) {
        if (horsFil !== null) versionPeinte = horsFil.version()
        dessine(courant, horizon, visee)
        // During transition no frame is final: the next also paints, including the one setting
        // the target.
        peinte = enTransition ? null : courante
      }

      // Display clock advances even when nothing paints: time bar counts seconds of a sky not
      // moving a pixel.
      // T-0394 — except during a trajet: it publishes its own arrival, a mid-way publication
      // would wake the target list mid-motion.
      if (!enTrajet() && ts - dernierePublication >= PERIODE_PUBLICATION_MS) {
        afficheInstant(instant.ms)
        // `parametresFile` is authoritative on shutdown: the box keeps the last pass.
        const rendu = parametresFile.current === null ? null : derniereFile.sortie
        publieFile(rendu === null ? null : { reelles: rendu.etoilesReelles })
        dernierePublication = ts
      }
    }

    /**
     * T-0398 — asks the worker for this view's filé frame. Sol filter redone on the other side:
     * only relief goes, not its courbes (used only to paint the sol).
     */
    const demandeFile = (
      courant: EtatBoucle,
      params: ParametresFile,
      vue: Vue,
      ciel: { readonly matrice: Mat3; readonly epoqueAnnee: number },
      masque: MasqueHorizon,
      horizon: readonly number[],
      // Derived from `courant`, `params` and the instant, already in the key: not entered in it.
      lune: LuneFile | null,
    ): void => {
      if (horsFil === null) return
      const cle = [courant, params, horizon, instant.ms, vue.largeurPx, vue.hauteurPx]
      if (cle.length === derniereDemande.length && cle.every((v, i) => v === derniereDemande[i])) {
        return
      }
      derniereDemande = cle
      if (courant.etoiles !== catalogueEnvoye) {
        horsFil.catalogue(etoilesReelles(courant.etoiles))
        catalogueEnvoye = courant.etoiles
      }
      horsFil.demande({
        vue,
        matriceCiel: ciel.matrice,
        masque: courant.couches.sol
          ? { altitudesDeg: masque.altitudesDeg, estHypothese: masque.estHypothese }
          : null,
        parametres: params,
        axePoleNord: axePoleDeDate(ciel.epoqueAnnee),
        modeNuit: courant.modeNuit,
        lune,
      })
    }

    const dessine = (
      courant: EtatBoucle,
      horizon: readonly number[],
      visee: { readonly azimutDeg: number; readonly hauteurDeg: number } | null,
    ): void => {
      instantDate.setTime(instant.ms)
      const ciel = cielInstantane(courant.site, instantDate)
      ephemerides.current = avanceEphemerides(
        ephemerides.current,
        courant.site,
        instant.ms,
        pasEphemeridesMs(courant.anime ? courant.facteur : 1),
      )
      const corps = ciel.corpsMasques
        ? []
        : positionsInterpolees(ephemerides.current, instant.ms).filter(
            (c) => !courant.jour || c.corps === Body.Sun || c.corps === Body.Moon,
          )

      const vue = visee === null ? courant.vue : { ...courant.vue, ...visee }
      // §3.5 — the boîtier rotates, the view does not: cadre outline moves on screen instead of
      // rotating the whole sky behind a still cadre (T-0084).
      const vueCourante = vuePlanetarium(vue)
      const params = parametresFile.current
      // T-0398 — filé from the worker: whole scène paints with the received frame's vue (sol,
      // cadre, traces one piece under the gesture). Frame of another definition (canvas
      // resized) is void; by day the pass requests nothing → current vue resumes, else scène
      // would freeze.
      const horsFilActif =
        params !== null && courant.apparition > 0 && horsFil !== null && !horsFil.enPanne()
      const derniere = horsFilActif ? horsFil.derniere() : null
      const recue =
        derniere !== null &&
        derniere.vue.largeurPx === vueCourante.largeurPx &&
        derniere.vue.hauteurPx === vueCourante.hauteurPx
          ? derniere
          : null
      const vueSansRoulis = recue === null ? vueCourante : recue.vue
      const cadres = courant.couches.cadre
        ? courant.profils.map(
            (profil): Cadre => ({
              profil,
              azimutDeg: vueSansRoulis.azimutDeg,
              hauteurDeg: vueSansRoulis.hauteurDeg,
              rotationDeg: vue.rotationCadreDeg,
            }),
          )
        : []
      // Centred on the target, not the aim: shows what it would fill, wherever one points.
      const cible = courant.couches.cadre ? courant.cadreCible : null
      const cadreCible: Cadre | undefined =
        cible === null
          ? undefined
          : {
              profil: cible.profil,
              ...viseeVersVue(cible.objet.adDeg, cible.objet.decDeg, ciel.matrice),
              rotationDeg: vue.rotationCadreDeg,
            }
      // §9.3 / T-0116 — filé covers the whole planetarium, not only the cadre: computed here
      // with THIS frame's vue, painted under marks and names. Cadre outline stays on top, end of
      // pass: it alone says what the sensor would record while the whole sky streaks.
      // T-0396 — by day the filé pass is not computed: its counters do not survive.
      if (courant.apparition === 0) derniereFile.sortie = null
      // Still allocated per frame (projector + closure, `dessineCiel` input literal, `passeFile`
      // closure, cadres): depends on this frame's vue, cannot be hoisted. A handful of objects
      // vs the thousands the per-star loop no longer allocates (T-0065).
      const masque =
        horizon === courant.masque.altitudesDeg
          ? courant.masque
          : {
              ...courant.masque,
              altitudesDeg: horizon,
              courbesDeg: COURBES_VIDES,
              silhouettesDeg: COURBES_VIDES,
              // A thin empty crest hands back to the transition's interpolated horizon.
              creteDeg: COURBES_VIDES,
            }
      // T-0399 — Panorama: Moon streaks across the whole shot, like the stars.
      const dureeMs = params === null ? 0 : params.dureeS * MS_PAR_S
      const trajet =
        params === null || ciel.corpsMasques
          ? null
          : trajetLune(courant.site, instant.ms, dureeMs, cacheLune)
      // T-0400 — vue réaliste: also veils the filé: session background = that of its highest
      // moment, weighs more the closer a trace passes to it.
      const luneSeance =
        trajet === null || params === null || !courant.vueRealiste || courant.lune === null
          ? null
          : luneFile(
              courant.site,
              instantsTrajetLune(instant.ms, dureeMs),
              trajet,
              courant.lune.anglePhaseDeg,
              params.sbSiteMag,
            )
      const sortie = dessineCiel({
        ctx: contexte,
        projecteur: projecteur(vueSansRoulis, ciel.matrice),
        matriceCiel: ciel.matrice,
        index: courant.index,
        etoiles: courant.etoiles,
        // By day ciel profond is drowned like the stars: no halo, no marker.
        objets: courant.jour ? [] : courant.objets,
        figures: courant.figures,
        asterismes: courant.asterismes,
        frontieres: courant.frontieres,
        // By day named stars neither painted nor hoverable.
        etoilesNommees: courant.jour ? [] : courant.constellations.etoilesNommees,
        corps,
        nomsCorps: NOMS_CORPS,
        cadres,
        cadreCible,
        ...(courant.poseCadre === null ? {} : { poseCadre: courant.poseCadre }),
        ...(courant.enAvant === null ? {} : { enAvant: courant.enAvant }),
        ...(courant.parcours === null ? {} : { parcours: courant.parcours }),
        ciblesOuvertes: courant.ciblesOuvertes,
        couches: courant.couches,
        magLimite: courant.magLimite,
        apparition: courant.apparition,
        sbCiel: courant.sbCiel,
        vueRealiste: courant.vueRealiste,
        ...(trajet === null ? {} : { trajetLune: trajet }),
        // §3.1 — bodies masked: Moon neither drawn nor counted, so no halo.
        ...(courant.lune === null || ciel.corpsMasques ? {} : { lune: courant.lune }),
        ...(courant.soleil === null || ciel.corpsMasques ? {} : { soleil: courant.soleil }),
        latitudeDeg: courant.site.latitudeDeg,
        masque,
        modeNuit: courant.modeNuit,
        survol: survol.current ?? undefined,
        // T-0427 — readability cap exists only under a filé (`useParametresFile`).
        etoilesFilent: params !== null && params.couvertureMax !== null,
        passeFile:
          params === null
            ? undefined
            : (ctx, proj) => {
                if (horsFilActif) {
                  demandeFile(courant, params, vueCourante, ciel, masque, horizon, luneSeance)
                  if (recue !== null) {
                    ctx.drawImage(recue.bitmap, 0, 0)
                    derniereFile.sortie = recue.sortie
                  }
                } else {
                  derniereFile.sortie = dessineChamp({
                    ...params,
                    ...indexFile(courant.etoiles),
                    ctx,
                    // Scène projector, sol-filtered: arcs land on the same stars as the sky around
                    // them, nothing paints under the horizon (§4.1).
                    projecteur: proj,
                    axePoleNord: axePoleDeDate(ciel.epoqueAnnee),
                    modeNuit: courant.modeNuit,
                    lune: luneSeance,
                  })
                }
              },
      })
      cibles.current = sortie.cibles
    }

    const id = requestAnimationFrame(image)
    return () => {
      actif = false
      cancelAnimationFrame(id)
      horsFil?.ferme()
    }
  }, [canevas, etat, instant, parametresFile, survol])

  return cibles
}
