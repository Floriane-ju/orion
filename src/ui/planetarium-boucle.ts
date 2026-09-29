/**
 * §3 — La boucle de rendu du ciel, en marge de React.
 *
 * Le rendu vit dans un `requestAnimationFrame` qui lit un état mutable ; React ne réagit
 * qu'aux commandes et à l'instant publié, jamais à l'image. Sans cette séparation, une
 * animation à 60 Hz déclencherait soixante rendus React par seconde.
 *
 * T-0248 — la boucle tourne en continu mais ne PEINT que ce qui a changé. Le ciel de
 * `MAINTENANT` dérive d'un pixel toutes les vingt-cinq secondes à 200° de champ : le repeindre
 * trente fois par seconde, c'était un cœur de processeur occupé à reproduire la même image.
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
import { projecteur } from '../core/projection.ts'
import type { Cadre, ProfilCadre } from '../core/cadre.ts'
import type { MasqueHorizon } from '../core/site.ts'
import { Body, type Site } from '../core/ephem.ts'
import {
  afficheInstant,
  vuePlanetarium,
  type ParcoursScene,
  type VueScene,
} from './scene-etat.ts'
import { poseRenduFile, publicateurRenduFile } from './seance-etat.ts'
import type { CouchesActives } from './dessine-ciel.ts'
import { dessineChamp, type ParametresFile, type SortieDessinChamp } from './dessine-champ.ts'
import { dessineCiel, type CibleEcran, type SurvolEcran } from './dessine-ciel.ts'
import type { OptiquePose } from './dessine-pose-cadre.ts'
import type { LuneEcran, SoleilEcran } from './dessine-fond-ciel.ts'
import { B } from '../registry/budgets.ts'
import { MS_PAR_S } from '../core/unites.ts'

/** Noms français des corps mobiles de §3.1. */
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
/** La plus petite dérive que l'écran sait montrer. Fait de plateforme, pas seuil de rendu. */
const DERIVE_VISIBLE_PX = 1

/** Tout ce que la boucle lit à chaque image, réécrit à chaque rendu React. */
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
  /** Vue réaliste, Soleil levé : seuls le Soleil et la Lune restent dessinés, sans ciel profond. */
  readonly jour: boolean
  /** §4.1 — relief du site : la couche Sol y prend la hauteur du sol, azimut par azimut. */
  readonly masque: MasqueHorizon
  readonly magLimite: number
  /** §3.7 — fond de ciel du site : il module le contraste de la bande de la Voie lactée. */
  readonly sbCiel: number
  /** §3.3 — vue réaliste : le fond du ciel prend la luminance du site (T-0097). */
  readonly vueRealiste: boolean
  /** T-0100 — la Lune de l'instant affiché. Absente : aucun halo lunaire n'est peint. */
  readonly lune: LuneEcran | null
  /** Le Soleil de l'instant affiché. `null` : aucun halo solaire n'est peint. */
  readonly soleil: SoleilEcran | null
  /** §9.1 / T-0142 — l'optique quand la carte de pose est demandée dans le cadre, `null` sinon. */
  readonly poseCadre: OptiquePose | null
  /** §6.4 — les cibles retenues par les filtres du catalogue, `null` si aucun n'est actif. */
  readonly enAvant: ReadonlySet<string> | null
  /** §8.4 / T-0324 — le trajet de pointage montré, `null` quand la scène est celle de tous les jours. */
  readonly parcours: ParcoursScene | null
  readonly vue: VueScene
  readonly modeTemps: string
  readonly facteur: number
  /** §3.2 — l'écart constant entre l'instant affiché et l'horloge système. */
  readonly decalageMs: number
  readonly anime: boolean
}

/** T-0248 — ce qu'une image a lu : de quoi dire si la suivante peindrait autre chose. */
export interface ImageLue {
  /** Son identité change à chaque rendu React de la scène : vue, couches, filé, mode nuit… */
  readonly etat: Pick<EtatBoucle, 'vue' | 'modeTemps' | 'anime'>
  /** L'astre survolé, pas l'entrée de `cibles` qui le porte : celle-ci est neuve à chaque image. */
  readonly survole: unknown
  /** Définition du canevas : la réécrire l'efface. */
  readonly largeurPx: number
  readonly hauteurPx: number
  readonly instantMs: number
}

/**
 * T-0248 — l'image courante diffère-t-elle de la dernière peinte ?
 *
 * En `MAINTENANT`, le ciel tourne sans qu'aucun état ne change : on repeint quand sa rotation
 * a déplacé l'écran d'un pixel, à la vitesse de §3.2 (`vitesseEcran`, facteur 1). En
 * défilement, chaque image est neuve. Temps figé, seul un changement d'état compte.
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
  if (courante.etat.modeTemps !== 'MAINTENANT') return false
  const { largeurPx, fovDeg } = courante.etat.vue
  const pxParS = vitesseEcran(1, pxParDegre(largeurPx, fovDeg)).value
  const deriveS = Math.abs(courante.instantMs - peinte.instantMs) / MS_PAR_S
  return deriveS * pxParS >= DERIVE_VISIBLE_PX
}

/** L'astre que le survol désigne, stable d'une image à l'autre ; `null` sans survol. */
function astreSurvole(survol: SurvolEcran | null): unknown {
  const cible = survol?.cible
  if (cible === undefined) return null
  // Un corps mobile est repositionné à chaque image : son nom est sa seule identité stable.
  return cible.objet ?? cible.etoileNommee ?? cible.etoile ?? cible.nom
}

/**
 * Démarre la boucle et rend la liste des cibles à l'écran, réécrite à chaque image peinte : c'est
 * elle que le clic interroge pour savoir ce qui se trouve sous le curseur.
 */
export function useBoucleRendu(entree: {
  readonly canevas: RefObject<HTMLCanvasElement | null>
  readonly etat: RefObject<EtatBoucle>
  readonly instant: { ms: number }
  /** §9.3 — les paramètres de la passe de filé, ou `null` quand elle est éteinte. */
  readonly parametresFile: RefObject<ParametresFile | null>
  /** T-0085 — l'élément désigné par le curseur, relu par image plutôt qu'à chaque rendu React. */
  readonly survol: RefObject<SurvolEcran | null>
}): RefObject<readonly CibleEcran[]> {
  const { canevas, etat, instant, parametresFile, survol } = entree
  const cibles = useRef<readonly CibleEcran[]>([])
  const ephemerides = useRef<EtatEphemerides | null>(null)

  useEffect(() => {
    // T-0248 — opaque : `passeFond` recouvre tout le canevas avant la moindre couche, et le
    // compositeur n'a plus à mélanger la scène avec ce qui se trouve derrière elle.
    const contexte = canevas.current?.getContext('2d', { alpha: false }) ?? null
    if (contexte === null) return

    let actif = true
    let dernierTs: number | null = null
    let dernierePublication = 0
    let peinte: ImageLue | null = null
    // T-0116 — les compteurs du filé se publient avec l'instant, jamais par image :
    // `poseRenduFile` passe par le magasin de séance, donc par un rendu React.
    const publieFile = publicateurRenduFile(poseRenduFile)
    // Boîte réécrite par image plutôt qu'une variable locale : la passe de filé écrit depuis
    // une fermeture, et le flux de contrôle ne la suit pas jusque-là.
    const derniereFile: { sortie: SortieDessinChamp | null } = { sortie: null }
    // T-0065 — une seule `Date`, réécrite par image. `cielInstantane` la lit sans la
    // garder : rien ne survit à l'appel, donc rien ne justifie d'en allouer une neuve.
    const instantDate = new Date(0)

    const image = (ts: number): void => {
      if (!actif) return
      requestAnimationFrame(image)
      // Plafond de cadence : on saute ce tick, la prochaine frame réévaluera.
      if (dernierTs !== null && ts - dernierTs < INTERVALLE_MIN_MS) return
      const courant = etat.current
      const dt = dernierTs === null ? 0 : ts - dernierTs
      dernierTs = ts

      if (courant.modeTemps === 'MAINTENANT') {
        // Resynchronisation continue : aucune dérive ne s'accumule sur plusieurs heures. Le
        // décalage rend la lecture reprenable là où on l'avait laissée — l'horloge système
        // donne la cadence, pas la destination (T-0137).
        instant.ms = Date.now() + courant.decalageMs
      } else if (courant.anime) {
        instant.ms += dt * courant.facteur
      }

      const courante: ImageLue = {
        etat: courant,
        survole: astreSurvole(survol.current),
        largeurPx: contexte.canvas.width,
        hauteurPx: contexte.canvas.height,
        instantMs: instant.ms,
      }
      if (doitDessiner(peinte, courante)) {
        dessine(courant)
        peinte = courante
      }

      // L'horloge d'affichage avance même quand rien ne se peint : la barre de temps compte
      // les secondes d'un ciel qui ne bouge pas d'un pixel.
      if (ts - dernierePublication >= PERIODE_PUBLICATION_MS) {
        afficheInstant(instant.ms)
        // `parametresFile` fait foi sur l'extinction : la boîte, elle, garde la dernière passe.
        const rendu = parametresFile.current === null ? null : derniereFile.sortie
        publieFile(rendu === null ? null : { reelles: rendu.etoilesReelles })
        dernierePublication = ts
      }
    }

    const dessine = (courant: EtatBoucle): void => {
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

      const vue = courant.vue
      // §3.5 — le boîtier tourne, la vue non : c'est ce qui rend le contour du cadre mobile
      // à l'écran au lieu de faire tourner tout le ciel derrière un cadre immobile (T-0084).
      const vueSansRoulis = vuePlanetarium(vue)
      const cadres = courant.couches.cadre
        ? courant.profils.map(
            (profil): Cadre => ({
              profil,
              azimutDeg: vue.azimutDeg,
              hauteurDeg: vue.hauteurDeg,
              rotationDeg: vue.rotationCadreDeg,
            }),
          )
        : []
      // §9.3 / T-0116 — le filé couvre tout le planétarium, pas le seul cadre : il se calcule
      // ici, avec la vue de CETTE image, et se peint sous les repères et les noms. Le contour
      // du cadre reste tracé par-dessus, en fin de passe : c'est lui, et lui seul, qui dit ce
      // que le capteur enregistrerait quand tout le ciel file.
      const params = parametresFile.current
      // Ce qui reste alloué par image — le projecteur et sa fermeture, le littéral d'entrée
      // de `dessineCiel`, la fermeture `passeFile`, les cadres — dépend de la vue de cette
      // image et ne se hisse donc pas. C'est une poignée d'objets, contre les milliers que
      // la boucle par étoile n'alloue plus (T-0065).
      const sortie = dessineCiel({
        ctx: contexte,
        projecteur: projecteur(vueSansRoulis, ciel.matrice),
        matriceCiel: ciel.matrice,
        index: courant.index,
        etoiles: courant.etoiles,
        // De jour, le ciel profond est noyé comme les étoiles : ni halo, ni marqueur.
        objets: courant.jour ? [] : courant.objets,
        figures: courant.figures,
        asterismes: courant.asterismes,
        frontieres: courant.frontieres,
        // De jour, les étoiles nommées ne sont ni peintes ni survolables.
        etoilesNommees: courant.jour ? [] : courant.constellations.etoilesNommees,
        corps,
        nomsCorps: NOMS_CORPS,
        cadres,
        ...(courant.poseCadre === null ? {} : { poseCadre: courant.poseCadre }),
        ...(courant.enAvant === null ? {} : { enAvant: courant.enAvant }),
        ...(courant.parcours === null ? {} : { parcours: courant.parcours }),
        couches: courant.couches,
        magLimite: courant.magLimite,
        sbCiel: courant.sbCiel,
        vueRealiste: courant.vueRealiste,
        // §3.1 — corps masqués : la Lune n'est ni dessinée ni comptée, donc pas de halo.
        ...(courant.lune === null || ciel.corpsMasques ? {} : { lune: courant.lune }),
        ...(courant.soleil === null || ciel.corpsMasques ? {} : { soleil: courant.soleil }),
        latitudeDeg: courant.site.latitudeDeg,
        masque: courant.masque,
        modeNuit: courant.modeNuit,
        survol: survol.current ?? undefined,
        passeFile:
          params === null
            ? undefined
            : (ctx, proj) => {
                derniereFile.sortie = dessineChamp({
                  ...params,
                  ctx,
                  // Le projecteur de la scène, filtré du sol : les arcs tombent sur les
                  // mêmes étoiles que le ciel qui les entoure, et rien ne se peint sous
                  // l'horizon (§4.1).
                  projecteur: proj,
                  axePoleNord: axePoleDeDate(ciel.epoqueAnnee),
                  latitudeDeg: courant.site.latitudeDeg,
                  sbCiel: courant.sbCiel,
                  vueRealiste: courant.vueRealiste,
                  modeNuit: courant.modeNuit,
                })
              },
      })
      cibles.current = sortie.cibles
    }

    const id = requestAnimationFrame(image)
    return () => {
      actif = false
      cancelAnimationFrame(id)
    }
  }, [canevas, etat, instant, parametresFile, survol])

  return cibles
}
