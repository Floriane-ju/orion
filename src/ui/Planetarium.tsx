/**
 * §3 — La scène : pipeline à deux horloges, moteur unifié, trois couches de tracés,
 * superposition du cadre matériel et aperçu du filé de §9 peint dans ce cadre.
 *
 * Ce n'est pas une vue décorative : c'est le point d'entrée vers les moteurs. Un clic sur un
 * objet du ciel profond ouvre l'onglet Cible garni (§6.2 / §6.3 / §7), et le cadre superposé
 * montre ce que le matériel déclaré capturerait vraiment — arcs compris.
 *
 * Depuis le lot 6, la scène ne porte plus ses réglages : ils sont dans le panneau droit, à
 * hauteur d'œil de l'image qu'ils modifient. Depuis T-0038 elle ne porte plus non plus ses
 * lectures ; depuis T-0153 il n'en reste qu'une, la phrase qui date l'image, au centre de la
 * barre basse. Ce composant publie dans le magasin de scène ce qu'il est seul à savoir —
 * l'objet cliqué, l'attente d'une passe de filé.
 *
 * Ne reste ici que le canevas et l'assemblage : la boucle de rendu est dans
 * `planetarium-boucle.ts`, l'aperçu du filé dans `planetarium-panorama.ts`, les
 * gestes dans `planetarium-gestes.ts`.
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
 * T-0068 — la description associée au canevas. Un identifiant plutôt qu'un `aria-label` long :
 * le nom dit CE QUE C'EST, la description dit CE QU'ON Y VOIT EN CE MOMENT.
 */
const ID_DESCRIPTION = 'planetarium-description'
export type { MaterielFile } from './planetarium-materiel.ts'

import { poseCadreAffichee, type MaterielFile } from './planetarium-materiel.ts'

export interface PlanetariumProps {
  readonly site: Site
  /** §4.1 — relief relevé du site : c'est lui que la couche Sol masque, pas un horizon plat. */
  readonly masque: MasqueHorizon
  /** T-0369 — le relief du lieu saisi se charge : la couche Sol s'aplatit en l'attendant. */
  readonly horizonEnAttente: boolean
  readonly etoiles: readonly Etoile[]
  /** Index de sélection du catalogue, construit une fois par l'application. */
  readonly index: IndexCiel
  readonly objets: readonly ObjetCielProfond[]
  /**
   * §6.4 — les désignations que les filtres du panneau des cibles retiennent. Les autres
   * marqueurs s'estompent. `null` : aucun filtre actif, la scène est entière.
   */
  readonly enAvant: ReadonlySet<string> | null
  readonly constellations: PaquetConstellations
  /** Profils de cadre à superposer (§3.5). Vide : l'app demande le profil, sans en inventer. */
  readonly profils: readonly ProfilCadre[]
  readonly gaiaCharge: boolean
  /**
   * §3.7 — fond de ciel du site (§2.2). C'est lui qui décide du contraste de la bande de la
   * Voie lactée : la scène montre le ciel de CE site, pas une carte de référence idéale.
   */
  readonly sbCiel: number
  /** §11.1 — aucune animation non sollicitée en mode nuit. */
  readonly modeNuit: boolean
  /** Absent : la scène ne peut pas incruster le filé, faute de matériel chiffrable. */
  readonly file?: MaterielFile
  readonly surSelectionObjet: (objet: ObjetCielProfond) => void
}

/**
 * T-0040 — la définition de rendu suit la boîte, sinon l'image s'y loge en laissant des
 * bandes. C'est la taille CSS qui est observée, jamais les attributs du canevas : les
 * réécrire ne change pas la boîte, donc l'observation ne se rappelle pas elle-même.
 *
 * T-0258 — la même mesure donne le centre de visée. Les deux vont ensemble : le décalage
 * s'exprime en pixels de rendu, donc dans la définition que cette passe vient de calculer.
 */
function useResolutionSuitLaBoite(canevas: React.RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const cible = canevas.current
    if (cible === null || typeof ResizeObserver === 'undefined') return
    const bordures = [...document.querySelectorAll(BORDURES_SCENE.join(', '))]
    const mesure = (): void => {
      // `getBoundingClientRect` et non le `contentRect` de l'entrée : le décalage compare des
      // boîtes entre elles, il lui faut le même repère pour les trois.
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
    // Les bordures sont observées aussi : sous le repli elles quittent le flanc de la scène,
    // et c'est leur taille qui change alors, pas celle du canevas.
    for (const bordure of bordures) observateur.observe(bordure)
    return () => {
      observateur.disconnect()
    }
  }, [canevas])
}

export function Planetarium(props: PlanetariumProps) {
  const canevas = useRef<HTMLCanvasElement>(null)
  // T-0085 — le survol vit hors de React : il change à chaque mouvement de souris, et la
  // boucle est seule à le lire. Le passer par l'état rendrait la scène soixante fois par
  // seconde pour un label transitoire.
  const survol = useRef<SurvolEcran | null>(null)

  // Pointage, temps et couches sont ceux de la scène, réglés depuis le panneau droit.
  // T-0248 — par tranches, et l'instant à la minute : la boucle publie deux fois par seconde,
  // et chaque rendu de ce composant repeint le canevas. La Lune et le crépuscule ne bougent
  // pas d'un pixel en une minute ; le ciel, lui, tourne dans la boucle à l'instant exact.
  const pointage = useTrancheScene(vueScene)
  const temps = useTrancheScene(tempsScene)
  const rendu = useTrancheScene(renduScene)
  const minute = useTrancheScene(minuteAffichee)
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
  // T-0100 — la Lune de l'instant affiché : le halo est centré sur ELLE, donc sur le même
  // état que le corps dessiné. §12.5 — un instant hors du domaine des séries n'éteint pas la
  // scène : la Lune sort du calcul, le reste continue.
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
   * T-0099 — dépression du Soleil sous l'horizon à l'instant affiché, en degrés. C'est elle,
   * et non l'heure légale, qui décide de la clarté du fond : le curseur de temps traverse le
   * crépuscule à chaque séance.
   *
   * La hauteur est celle corrigée de la réfraction, comme partout ailleurs dans l'app. La
   * table de Patat 2006 est ajustée sur une dépression géométrique, mais elle commence à 5°
   * sous l'horizon — là où la réfraction ne corrige plus rien.
   *
   * §12.5 — un instant hors du domaine des séries n'éteint pas la scène : le crépuscule sort
   * du calcul, le reste continue. Même règle que la Lune juste au-dessus.
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
  // De jour, vue réaliste, aucune étoile : le ciel bleu les efface toutes. La table Bortle,
  // bornée à son bord clair, en laisserait passer jusqu'à la magnitude 4.
  const jour = rendu.vueRealiste && soleil !== null && soleil.altitudeDeg > 0
  // De jour, les repères du ciel nocturne n'ont plus rien à relier : ils se retirent avec
  // les étoiles. Le réglage des couches, lui, n'est pas touché et revient à la nuit.
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
   * T-0098, T-0100 — le fond de ciel EFFECTIF dans la direction visée : celui du site, majoré
   * du halo d'horizon et de la Lune. C'est lui qui plafonne la magnitude limite en vue
   * réaliste, sans quoi une pleine Lune montrerait autant d'étoiles qu'une nuit noire.
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
   * T-0099 — fond de ciel du site au zénith, crépuscule compris. La scène en part pour TOUTES
   * ses couches : teinte du fond, paliers de halo, contraste de la bande. Vue réaliste
   * décochée, c'est le fond du site nu — la scène est alors celle d'avant T-0097, au pixel près.
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
  // T-0116 — le filé se peint dans la boucle, sur toute la scène : ce hook ne fournit plus que
  // ce qu'il tient du matériel et du panneau. La vue, le fond et le pôle viennent de l'image.
  const parametresFile = useParametresFile({
    etoiles: props.etoiles,
    mode,
    seance,
    materiel: props.file,
  })

  useResolutionSuitLaBoite(canevas)

  // État mutable lu par la boucle de rendu, réécrit à chaque rendu React.
  const etatBoucle = useRef<EtatBoucle>(null!)
  etatBoucle.current = {
    site: props.site,
    masque: props.masque,
    horizonEnAttente: props.horizonEnAttente,
    etoiles: props.etoiles,
    objets: props.objets,
    constellations: props.constellations,
    profils: props.profils,
    modeNuit: props.modeNuit,
    index: props.index,
    figures,
    asterismes,
    frontieres,
    couches: couchesScene,
    jour,
    poseCadre: poseCadreAffichee(mode, file.poseDansCadre, props.file),
    enAvant: props.enAvant,
    parcours: rendu.parcours,
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
    // T-0137 — le mode nuit ne change que les couleurs : il ne coupe pas le défilement, qui
    // se règle sous le ciel comme en préparation. T-0072 : `prefers-reduced-motion` n'ajoute
    // rien ici non plus — le défilement n'est jamais l'état de départ (§3.2, `MAINTENANT`),
    // il ne peut donc pas s'imposer, et le couper d'office retirerait un mode demandé.
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
  // T-0069 — WCAG 2.1.1 : les mêmes gestes, au clavier, dans les mêmes bornes.
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
        /* T-0068 / T-0069 — `application` et non `img` : la scène se pilote au clavier, et
           une technologie d'assistance doit lui laisser passer les flèches plutôt que de les
           garder pour son propre parcours. Sans rôle, un canevas n'est qu'une boîte de pixels
           qui n'existe pas pour elle. */
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
      {/* T-0068 — ce que la vue montre en ce moment, dans les mots exacts de la lecture
          affichée à la barre basse : `ligneVisee` est la seule à composer la phrase.
          Hors flux visuel — la colonne centrale ne réserve aucune hauteur sous le canevas
          (T-0040) — mais présente dans l'arbre d'accessibilité. */}
      <DescriptionScene site={props.site} />
    </section>
  )
}

/**
 * T-0248 — la description suit l'instant exact, comme la phrase de la barre basse dont elle
 * emprunte les mots. Composant à part : ses rendus deux fois par seconde ne touchent ni le
 * planétarium ni son état de boucle, donc ne repeignent pas le canevas.
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
