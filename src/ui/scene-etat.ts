/**
 * §3 + §9 — le pointage et le temps de la scène, tenus une seule fois.
 *
 * Le planétarium (§3) et le grand champ (§9) décrivent la même photographie : un azimut, une
 * hauteur, une rotation de boîtier. Tant que chaque vue tenait son propre `useState`, cadrer
 * dans l'une ne cadrait pas dans l'autre — l'utilisateur cadrait deux fois la même image.
 *
 * L'état vit dans le module, pas dans un contexte React : les deux vues sont montées côte à
 * côte sans ancêtre commun autre que l'application, et un magasin externe se lit aussi bien
 * en rendu serveur (`renderToStaticMarkup`) que dans le navigateur.
 * ponytail: un seul magasin pour tout le document — il n'y a qu'une scène ; si un jour deux
 * scènes doivent coexister, ce module devient un contexte.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { K } from '../registry/constants.ts'
import { fovMaxSelonMode, type ModeProjection, type Vue } from '../core/projection.ts'
import type { ModeTemps } from '../core/curseur-temps.ts'
import type { EtapeParcours } from '../core/pointage.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { CouchesActives } from './dessine-ciel.ts'
import { encadre, MS_PAR_MINUTE } from '../core/unites.ts'
import {
  gardeSceneAuDepart,
  litScenePersistee,
  type ScenePersistee,
} from '../data/scene-persistee.ts'
import { creeAbonnes } from './abonnes.ts'
import { DOMAINES } from '../registry/domains.ts'

/**
 * Résolution de rendu de référence, celle du viewport de §3.2. Ce n'est plus qu'un point de
 * départ : la scène rend désormais à la taille de sa boîte (voir `resolutionRendu`). Elle
 * reste le budget de pixels que ce rendu ne dépasse pas, et la définition servie au premier
 * rendu, avant que la boîte ait été mesurée.
 */
export const LARGEUR_SCENE_PX = 1920
export const HAUTEUR_SCENE_PX = 1080

/**
 * La définition à donner au canevas pour une boîte de `largeurCss × hauteurCss`.
 *
 * Rendre à une définition fixe obligeait à loger un 16/9 dans une boîte qui ne l'est pas :
 * `object-fit: contain` laissait alors des bandes noires en haut et en bas. En suivant la
 * boîte, l'image la remplit sans être ni étirée ni rognée.
 *
 * Le facteur d'échelle est plafonné par le budget de pixels de référence, pas seulement par
 * la densité de l'écran : sur une dalle Retina, suivre `devicePixelRatio` doublerait le
 * nombre de pixels à peindre à chaque image, et le compteur d'images du ciel avec.
 * ponytail: budget constant plutôt qu'adaptatif ; si des machines rapides méritent mieux,
 * c'est le compteur d'images qui doit le décider, pas une constante.
 */
export function resolutionRendu(
  largeurCss: number,
  hauteurCss: number,
  densite: number,
): { readonly largeurPx: number; readonly hauteurPx: number } {
  const surface = Math.max(1, largeurCss * hauteurCss)
  const echelle = Math.min(densite, Math.sqrt((LARGEUR_SCENE_PX * HAUTEUR_SCENE_PX) / surface))
  return {
    largeurPx: Math.max(1, Math.round(largeurCss * echelle)),
    hauteurPx: Math.max(1, Math.round(hauteurCss * echelle)),
  }
}

/**
 * Le pointage : ce que la scène regarde, comment elle le projette, et sur combien de pixels.
 * Un `Vue` de §3.2 à un champ près — le roulis, qui appartient au boîtier et non à la vue.
 *
 * T-0084 — la rotation porte un nom distinct de `Vue.rotationDeg` EXPRÈS. Tant que les deux
 * s'appelaient pareil, le magasin se passait tel quel à `projecteur()` : la vue du planétarium
 * roulait du même angle que le cadre, et le cadre ne pouvait donc jamais paraître tourné à
 * l'écran — seul le ciel tournait derrière lui. §3.3 ne fait dépendre du mode que la fonction
 * radiale R(θ) : le planétarium garde le zénith en haut, et c'est le boîtier qui tourne.
 */
export interface VueScene {
  readonly azimutDeg: number
  readonly hauteurDeg: number
  /** §3.5 `angle_rotation_cadre` — orientation du boîtier, jamais le roulis de la vue. */
  readonly rotationCadreDeg: number
  readonly fovDeg: number
  readonly mode: ModeProjection
  /** Définition de rendu, mesurée sur la boîte du canevas. */
  readonly largeurPx: number
  readonly hauteurPx: number
  /** T-0258 — écart entre la visée et le milieu du canevas, en pixels de rendu. */
  readonly decalageCentreXPx: number
}

/**
 * T-0258 — les surfaces qui bordent le ciel EN PERMANENCE : le rail de la vue à gauche, le
 * panneau de séance à droite. Ce sont elles, et elles seules, qui déplacent le centre de visée.
 *
 * Les cartes du matériel et le plan de nuit n'y sont pas : elles se replient, et une visée qui
 * se déplace au repli d'une carte se juge plus mal qu'une visée décalée une fois pour toutes —
 * le cadre sauterait à l'instant même où l'on ouvre la carte pour saisir la focale.
 */
export const BORDURES_SCENE = Object.freeze(['.coque-rail', '.coque-lateral'] as const)

/** Une boîte mesurée à l'écran, en pixels CSS. Un `DOMRect` en est une. */
export interface BoiteEcran {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

/**
 * T-0258 — l'écart, en pixels de rendu, entre le milieu du canevas et le milieu du ciel resté
 * libre.
 *
 * Le canevas couvre toute la coque, et deux surfaces TOUJOURS ouvertes se posent dessus : le
 * rail de la vue à gauche, le panneau de séance à droite. Viser au milieu du canevas plaçait
 * la visée sous le panneau, là où l'on ne peut ni juger un cadre ni lire une cible.
 *
 * Seules les surfaces permanentes comptent. Une carte qu'on replie — Boîtier, Optique, Plan de
 * nuit — déplacerait la visée à chaque geste : un cadre qui saute au moment où l'on ouvre la
 * carte où l'on saisit la focale se juge plus mal qu'un cadre décalé une fois pour toutes.
 *
 * Les boîtes sont MESURÉES, jamais déduites des largeurs de la feuille de style : sous le repli
 * les mêmes surfaces passent dans le flux, au-dessus et au-dessous de la scène, ne recouvrent
 * plus rien, et l'écart retombe à zéro sans qu'aucune media query ait à être redite ici.
 */
export function decalageCentreScene(
  scene: BoiteEcran,
  obstacles: readonly BoiteEcran[],
  largeurPx: number,
): number {
  const largeurCss = scene.right - scene.left
  if (largeurCss <= 0) return 0
  let gauche = 0
  let droite = 0
  for (const obstacle of obstacles) {
    if (obstacle.bottom <= scene.top || obstacle.top >= scene.bottom) continue
    // De quel bord la surface mord : son milieu tranche. Le rail et le panneau sont décollés
    // du bord d'un jour de carte, aucun ne l'atteint — un test d'affleurement les manquerait.
    if (obstacle.left + obstacle.right < scene.left + scene.right)
      gauche = Math.max(gauche, obstacle.right - scene.left)
    else droite = Math.max(droite, scene.right - obstacle.left)
  }
  gauche = encadre(gauche, 0, largeurCss)
  droite = encadre(droite, 0, largeurCss)
  // Deux surfaces qui se rejoignent ne laissent pas de ciel : le milieu du canevas vaut mieux
  // qu'un centre posé au hasard de leur recouvrement.
  if (gauche + droite >= largeurCss) return 0
  return (((gauche - droite) / 2) * largeurPx) / largeurCss
}

/**
 * La `Vue` de §3.3 pour la scène : sans roulis. Le cadre matériel tourne comme objet de la
 * scène (§3.5) ; la vue, elle, garde le zénith en haut, sans quoi tourner le boîtier ferait
 * tourner tout le ciel et le contour du cadre resterait immobile à l'écran.
 */
export function vuePlanetarium(vue: VueScene): Vue {
  return {
    mode: vue.mode,
    fovDeg: vue.fovDeg,
    largeurPx: vue.largeurPx,
    hauteurPx: vue.hauteurPx,
    azimutDeg: vue.azimutDeg,
    hauteurDeg: vue.hauteurDeg,
    rotationDeg: 0,
    decalageCentreXPx: vue.decalageCentreXPx,
  }
}

/** Le temps : le mode du curseur temporel de §3.2, sa vitesse et son ancrage. */
export interface TempsScene {
  readonly modeTemps: ModeTemps
  /** Facteur de défilement demandé, avant plafonnement par la lisibilité. */
  readonly facteur: number
  /**
   * Écart CONSTANT entre l'instant affiché et l'horloge système, en millisecondes.
   *
   * `MAINTENANT` ne veut pas dire « aujourd'hui » mais « le temps s'écoule » : reprendre la
   * lecture après avoir choisi le 21 août doit repartir du 21 août, pas sauter à ce soir.
   * Nul au démarrage — l'app ouvre sur l'instant présent —, il est recalculé à chaque reprise
   * et la resynchronisation par image continue d'interdire toute dérive.
   */
  readonly decalageMs: number
}

/**
 * Ce que la scène dessine. Les interrupteurs vivent ici et non dans le planétarium : depuis
 * le lot 6 ils sont actionnés depuis l'onglet Explorer, à l'autre bout de l'écran.
 */
export interface RenduScene {
  readonly couches: CouchesActives
  /** §3.3 — profondeur plafonnée par le fond de ciel plutôt que par le zoom. */
  readonly vueRealiste: boolean
  /**
   * §8.4 / T-0324 — le trajet de pointage que la scène montre, `null` en temps normal.
   *
   * Il n'est pas une couche : une couche est un booléen que le rail commande, celui-ci porte
   * des données qu'un seul panneau produit. Sa présence dépouille la scène de tout ce qui ne
   * sert pas à suivre le trajet — c'est `dessineCiel` qui applique la règle, pas ce magasin.
   */
  readonly parcours: ParcoursScene | null
}

/** §8.4 — le trajet à parcourir pour amener une cible dans le cadre, tel que la scène le peint. */
export interface ParcoursScene {
  /** La cible du trajet : elle nomme le parcours dans l'interface. */
  readonly designation: string
  /** Du départ visible à l'œil nu vers la cible ; un seul point en mode CARTE_DIRECTE. */
  readonly etapes: readonly EtapeParcours[]
  readonly adCibleH: number
  readonly decCibleDeg: number
}

/** §3.4 — l'objet cliqué dans la scène, décrit en clair. */
export interface SelectionScene {
  readonly titre: string
  readonly lignes: readonly string[]
  /** Renseigné pour un objet du ciel profond seulement : lui seul ouvre une fiche. */
  readonly objet: ObjetCielProfond | null
}

/**
 * T-0038 — ce que la scène a à dire sur ce qu'elle vient de rendre.
 *
 * Ces lectures étaient l'état local du planétarium tant qu'elles s'affichaient sous lui.
 * Depuis qu'elles sont posées dans le menu d'information de la barre haute — à l'autre bout
 * de l'arbre — elles suivent le même chemin que le pointage : le magasin de module, lisible
 * en rendu serveur comme dans le navigateur.
 *
 * T-0248 — le diagnostic de rendu (images par seconde, étoiles examinées) n'y est plus. Personne
 * ne le lisait depuis T-0153, et sa publication neuve toutes les 500 ms réveillait tous les
 * abonnés du magasin, temps figé compris.
 */
export interface LecturesScene {
  readonly selection: SelectionScene | null
}

export interface EtatScene {
  readonly vue: VueScene
  readonly temps: TempsScene
  readonly rendu: RenduScene
  readonly lectures: LecturesScene
  /**
   * Horloge d'affichage, en millisecondes : l'instant que la boucle a effectivement rendu.
   * Elle est publiée deux fois par seconde, pas à chaque image — les panneaux datent leurs
   * lectures sans être redessinés soixante fois par seconde.
   */
  readonly msAffiche: number
}

/**
 * T-0360 — un instant ramené dans `DOMAINES.annee_affichee`, bornes incluses. Toute écriture de
 * l'instant affiché y passe : le compteur d'année, le transport et la scène relue. Le temps
 * universel fait foi, sans quoi la borne bougerait avec le fuseau du poste.
 */
export function borneInstant(ms: number): number {
  const { min, max } = DOMAINES.annee_affichee
  return encadre(ms, Date.UTC(min, 0, 1), Date.UTC(max + 1, 0, 1) - 1)
}

/**
 * L'instant affiché, en millisecondes. Réécrit à chaque image par la boucle de rendu : le
 * garder hors de l'état réactif est ce qui évite soixante rendus React par seconde (§3).
 */
export const instant = { ms: Date.now() }

const ETAT_INITIAL: EtatScene = {
  vue: {
    azimutDeg: 180,
    hauteurDeg: K('SEUIL_HAUTEUR_IMAGERIE_DEG'),
    rotationCadreDeg: 0,
    fovDeg: K('FOV_INITIAL_DEG'),
    mode: 'MODE_PLANETARIUM',
    largeurPx: LARGEUR_SCENE_PX,
    hauteurPx: HAUTEUR_SCENE_PX,
    // Rien n'est encore mesuré : la visée part du milieu et s'y tient tant que rien ne la
    // recouvre — c'est aussi ce que rend un rendu serveur, qui n'a pas de boîtes à mesurer.
    decalageCentreXPx: 0,
  },
  temps: { modeTemps: 'MAINTENANT', facteur: K('FACTEUR_DEFILEMENT_NORMAL'), decalageMs: 0 },
  rendu: {
    couches: {
      figures: true,
      frontieres: false,
      asterismes: false,
      cadre: true,
      horizon: true,
      voieLactee: true,
      // §4.1 — la scène montre d'abord le ciel observable : le sol masque ce qui est dessous.
      sol: true,
    },
    // T-0355 — la scène s'ouvre sur le ciel tel qu'on le voit depuis le site.
    vueRealiste: true,
    parcours: null,
  },
  lectures: { selection: null },
  msAffiche: instant.ms,
}

/**
 * T-0355 — l'état de départ, retouché par ce que le stockage a gardé du dernier passage.
 *
 * L'instant se rend selon le mode : figé ou en défilement, on repart de l'instant quitté ;
 * en `MAINTENANT`, on repart de l'horloge avec le même décalage, sans quoi un rechargement
 * rejouerait les minutes écoulées depuis. La vue repasse par `majVue` à la première écriture,
 * qui rebornera un champ hors plafond ; il est borné ici aussi, pour le premier rendu.
 */
function restaure(depart: EtatScene, lu: ScenePersistee): EtatScene {
  const temps = { ...depart.temps, ...lu.temps }
  const vue = { ...depart.vue, ...lu.vue }
  const ms = borneInstant(
    temps.modeTemps === 'MAINTENANT' ? Date.now() + temps.decalageMs : (lu.ms ?? Date.now()),
  )
  instant.ms = ms
  // Couche par couche plutôt qu'un `fromEntries` retypé : une couche ajoutée à `CouchesActives`
  // ne compile pas tant qu'elle ne se relit pas ici.
  const lue = (c: keyof CouchesActives): boolean => lu.rendu?.couches?.[c] ?? depart.rendu.couches[c]
  const couches: CouchesActives = {
    figures: lue('figures'),
    frontieres: lue('frontieres'),
    asterismes: lue('asterismes'),
    cadre: lue('cadre'),
    horizon: lue('horizon'),
    voieLactee: lue('voieLactee'),
    sol: lue('sol'),
  }
  return {
    ...depart,
    vue: { ...vue, fovDeg: Math.min(vue.fovDeg, fovMaxSelonMode(vue.mode)) },
    temps,
    rendu: {
      ...depart.rendu,
      couches,
      vueRealiste: lu.rendu?.vueRealiste ?? depart.rendu.vueRealiste,
    },
    msAffiche: ms,
  }
}

let etat: EtatScene = restaure(ETAT_INITIAL, litScenePersistee())
const { abonne, notifie } = creeAbonnes()

/** Instantané courant. Son identité ne change qu'à une écriture : `useSyncExternalStore` s'y fie. */
export function etatScene(): EtatScene {
  return etat
}

type Retouche<T> = Partial<T> | ((precedent: T) => Partial<T>)

function applique<T extends object>(precedent: T, retouche: Retouche<T>): T {
  return {
    ...precedent,
    ...(typeof retouche === 'function' ? retouche(precedent) : retouche),
  }
}

function pose(suivant: EtatScene): void {
  etat = suivant
  notifie()
}

/**
 * T-0095 — le champ est ramené sous le plafond de sa projection à l'écriture, pas au rendu.
 *
 * C'est le seul passage obligé : la molette, le pincement, les touches, le curseur du panneau
 * et le changement de projection écrivent tous ici. Poser la borne ailleurs laisserait le cas
 * qui l'a motivée — on regarde 180° en stéréographique, on bascule en gnomonique — sortir par
 * un chemin qui ne borne que le champ, jamais le mode.
 */
export function majVue(retouche: Retouche<VueScene>): void {
  const vue = applique(etat.vue, retouche)
  const fovMaxDeg = fovMaxSelonMode(vue.mode)
  pose({
    ...etat,
    vue: vue.fovDeg <= fovMaxDeg ? vue : { ...vue, fovDeg: fovMaxDeg },
  })
}

export function majTemps(retouche: Retouche<TempsScene>): void {
  pose({ ...etat, temps: applique(etat.temps, retouche) })
}

export function majRendu(retouche: Retouche<RenduScene>): void {
  pose({ ...etat, rendu: applique(etat.rendu, retouche) })
}

export function majLectures(retouche: Retouche<LecturesScene>): void {
  pose({ ...etat, lectures: applique(etat.lectures, retouche) })
}

/**
 * Publie l'instant rendu. L'égalité est testée avant de notifier : en temps figé, la boucle
 * republie le même instant deux fois par seconde et rien ne doit se redessiner pour autant.
 */
export function afficheInstant(ms: number): void {
  if (ms === etat.msAffiche) return
  pose({ ...etat, msAffiche: ms })
}

/**
 * §3.2 — aller à un instant : l'horloge d'affichage saute, et le temps se met en pause.
 *
 * Sans la pause, `MAINTENANT` resynchroniserait sur l'horloge système à l'image suivante et
 * l'instant choisi n'aurait vécu que 40 ms.
 */
export function vaA(ms: number): void {
  // T-0210 — le compteur d'année de la barre de temps n'a pas de borne haute, et une date
  // hors des instants représentables fait lever `astronomy-engine` depuis la boucle de rendu.
  // Une destination inatteignable n'est pas un voyage : on reste où l'on est.
  if (!Number.isFinite(ms)) return
  const borne = borneInstant(ms)
  instant.ms = borne
  majTemps({ modeTemps: 'FIGE' })
  // L'horloge d'affichage saute avec l'instant, sans attendre l'image suivante : seule la
  // boucle du canevas republiait `msAffiche`, si bien qu'un écran rendu sans boucle — rendu
  // serveur, test — datait ses lectures de l'instant de démarrage plutôt que de la destination.
  afficheInstant(borne)
}

/**
 * §8.4 / T-0324 — montrer un parcours de pointage, et aller à l'heure où on le suivra.
 *
 * Les deux gestes tiennent ensemble parce que le second est la condition du premier : le
 * trajet est un jeu d'étoiles fixes, mais le ciel tourne, et une visée calculée pour 22 h 47
 * rate le trajet d'autant que l'horloge de la scène en est loin. L'heure du pointage est aussi
 * celle de toute l'aide au pointage — table, schéma, angle parallactique de §8.4 : les laisser
 * diverger montrerait le ciel d'un autre moment sous des chiffres qui n'en parlent pas.
 *
 * L'état de temps d'avant est retenu ici, et `masqueParcours` le rend. `vaA` FIGE le temps —
 * c'est ce qu'on veut le temps de lire le trajet — mais une horloge arrêtée sans qu'on sache
 * quand ni pourquoi est un bug, pas un mode.
 */
let avantParcours: { readonly temps: TempsScene; readonly ms: number } | null = null

export function montreParcours(parcours: ParcoursScene, ms: number): void {
  if (etat.rendu.parcours === null) avantParcours = { temps: etat.temps, ms: instant.ms }
  majRendu({ parcours })
  vaA(ms)
}

/**
 * Ferme le parcours et rend à l'horloge l'instant ET le mode qu'elle avait avant.
 *
 * `reprend` ne conviendrait pas : il repart de l'instant AFFICHÉ, qui est encore celui du
 * pointage, et il ne connaît que `MAINTENANT` — un défilement en cours ne se retrouverait pas.
 * Le décalage est reposé tel quel : c'est l'écart constant à l'horloge système, et le rendre
 * intact est ce qui fait reprendre la lecture là où elle serait arrivée.
 */
export function masqueParcours(): void {
  if (etat.rendu.parcours === null) return
  const avant = avantParcours
  avantParcours = null
  majRendu({ parcours: null })
  if (avant === null) return
  vaA(avant.ms)
  majTemps(avant.temps)
}

/**
 * §3.2 — rendre le temps à son écoulement, DEPUIS l'instant affiché.
 *
 * Le décalage est figé ici plutôt que lu par image : c'est ce qui fait de la reprise un
 * geste, et de l'horloge système une cadence plutôt qu'une destination.
 */
export function reprend(): void {
  majTemps({ modeTemps: 'MAINTENANT', decalageMs: instant.ms - Date.now() })
}

/**
 * T-0355 — ce qui se garde d'un passage à l'autre. Un parcours ouvert n'en est pas : c'est
 * l'instant et le mode d'AVANT lui qui se gardent, ceux que `masqueParcours` aurait rendus.
 */
export function scenePersistee(courant: EtatScene, ms: number): ScenePersistee {
  const { azimutDeg, hauteurDeg, rotationCadreDeg, fovDeg, mode } = courant.vue
  const avant = courant.rendu.parcours === null ? null : avantParcours
  return {
    vue: { azimutDeg, hauteurDeg, rotationCadreDeg, fovDeg, mode },
    temps: avant?.temps ?? courant.temps,
    ms: avant?.ms ?? ms,
    rendu: {
      couches: { ...courant.rendu.couches } as Readonly<Record<string, boolean>>,
      vueRealiste: courant.rendu.vueRealiste },
  }
}

gardeSceneAuDepart(() => scenePersistee(etat, instant.ms))

/** Remet la scène dans son état de départ. Réservé aux tests : l'application n'en a pas besoin. */
export function reinitialiseScene(): void {
  instant.ms = Date.now()
  pose({ ...ETAT_INITIAL, msAffiche: instant.ms })
}

/**
 * T-0056 — s'abonner à une tranche du magasin plutôt qu'à sa totalité.
 *
 * `useScene` réveille son composant à chaque écriture, donc deux fois par seconde : c'est la
 * cadence à laquelle la boucle republie l'instant affiché et le diagnostic. Un composant qui
 * ne lit qu'une valeur dérivée — l'époque à l'année, la minute affichée — n'a rien à
 * redessiner entre deux publications identiques.
 *
 * Le sélecteur doit être défini au niveau du module (identité stable) et rendre une valeur
 * comparable par `Object.is` : c'est cette comparaison que `useSyncExternalStore` applique
 * pour décider de rendre ou non.
 */

/**
 * La minute affichée par la scène. Les panneaux qui datent une lecture s'abonnent à elle
 * plutôt qu'à l'instant : entre deux publications de la même minute, ni la liste des
 * visibles ni la position de la Lune ne changent de façon lisible.
 *
 * Défini au niveau du module — donc d'identité stable — parce que c'est ce que
 * `useTrancheScene` exige de son sélecteur.
 */
export function minuteAffichee(etat: EtatScene): number {
  return Math.floor(etat.msAffiche / MS_PAR_MINUTE)
}

/**
 * La seconde affichée. La barre basse date l'instant à la seconde ; s'abonner à `msAffiche`
 * ferait rendre l'horloge à chaque publication de la boucle, pour la même seconde.
 */
export function secondeAffichee(etat: EtatScene): number {
  return Math.floor(etat.msAffiche / 1000)
}

export function useTrancheScene<T>(selecteur: (etat: EtatScene) => T): T {
  const lit = useCallback(() => selecteur(etatScene()), [selecteur])
  return useSyncExternalStore(abonne, lit, lit)
}

/** Tranches du pointage, du temps et du rendu : leur identité ne change qu'à leur écriture. */
export function vueRealisteScene(etat: EtatScene): boolean {
  return etat.rendu.vueRealiste
}

export function vueScene(etat: EtatScene): VueScene {
  return etat.vue
}

export function tempsScene(etat: EtatScene): TempsScene {
  return etat.temps
}

export function renduScene(etat: EtatScene): RenduScene {
  return etat.rendu
}

/**
 * T-0324 — le seul trajet montré. Tranche à part : l'aide au pointage recalcule un cheminement
 * complet à chaque rendu, s'abonner au rendu entier la ferait repartir à chaque interrupteur du
 * rail.
 */
export function parcoursScene(etat: EtatScene): ParcoursScene | null {
  return etat.rendu.parcours
}

/** Les commandes du magasin, telles que la scène et ses gestes les reçoivent. */
export interface ActionsScene {
  readonly majVue: typeof majVue
  readonly majTemps: typeof majTemps
  readonly majRendu: typeof majRendu
  readonly majLectures: typeof majLectures
  readonly vaA: typeof vaA
  readonly reprend: typeof reprend
}

/** Des fonctions de module : un seul objet suffit, et son identité ne relance aucun effet. */
export const ACTIONS_SCENE: ActionsScene = Object.freeze({
  majVue,
  majTemps,
  majRendu,
  majLectures,
  vaA,
  reprend,
})

export function useScene(): {
  readonly vue: VueScene
  readonly temps: TempsScene
  readonly rendu: RenduScene
  readonly lectures: LecturesScene
  readonly msAffiche: number
  readonly instant: { ms: number }
  readonly actions: ActionsScene
} {
  const courant = useSyncExternalStore(abonne, etatScene, etatScene)
  return {
    vue: courant.vue,
    temps: courant.temps,
    rendu: courant.rendu,
    lectures: courant.lectures,
    msAffiche: courant.msAffiche,
    instant,
    actions: ACTIONS_SCENE,
  }
}
