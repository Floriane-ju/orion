/**
 * §3.3, §3.4, §3.5 — La passe de rendu elle-même.
 *
 * Le canevas est remplacé par un contexte qui enregistre les appels. Ce n'est pas un test
 * d'apparence : c'est la vérification que la passe produit bien ce qu'elle annonce — des
 * disques d'étoiles regroupés par teinte, les trois couches de tracés, le contour du cadre,
 * des labels plafonnés, et une liste de cibles cliquables cohérente avec ce qui est dessiné.
 *
 * Il couvre aussi la règle de §11.1 sur le canevas, que la feuille de style n'atteint pas :
 * en mode nuit, AUCUNE couleur peinte ne doit porter de composante verte ou bleue.
 */

import { readFileSync } from 'node:fs'
import { nombre } from '../src/registry/ecriture.ts'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeEtoiles, encodeEtoiles, type Etoile } from '../src/data/catalog.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { decodeConstellations } from '../src/data/constellations.ts'
import {
  coucheAsterismes,
  coucheFigures,
  coucheFrontieres,
} from '../src/core/constellations.ts'
import { construitIndex } from '../src/core/index-ciel.ts'
import { cielInstantane } from '../src/core/horloges.ts'
import {
  magnitudeLimite,
  magnitudeRendue,
  projecteur,
  rayonEtoilePx,
  type Projecteur,
  type Vue,
} from '../src/core/projection.ts'
import type { PositionCorps } from '../src/core/ephem.ts'
import { applique, transpose, versSpherique, versVecteur } from '../src/core/mat3.ts'
import { depuisGalactique } from '../src/core/galactique.ts'
import {
  altitudeCulmination,
  masqueDepuisPoints,
  masquePlat,
  obstructionDeg,
  type MasqueHorizon,
} from '../src/core/site.ts'
import {
  cibleSousLeCurseur,
  dessineCiel,
  RAYON_CLIC_PX,
  type CibleEcran,
  type CouchesActives,
  type EntreeDessin,
  type SurvolEcran,
} from '../src/ui/dessine-ciel.ts'
import type { OptiquePose } from '../src/ui/dessine-pose-cadre.ts'
import { decritCible } from '../src/ui/planetarium-selection.ts'
import { ancreLabel, libelleCible, titreCible } from '../src/ui/libelles-cibles.ts'
import { etoileLabellisable } from '../src/core/labels.ts'
import { palette, paletteRealiste } from '../src/ui/couleurs.ts'
import { OPACITE_OBJET_ESTOMPE, teintesObjets } from '../src/ui/apparence-objets.ts'
import type { LuneEcran } from '../src/ui/dessine-fond-ciel.ts'
import {
  OPACITE_ETOILE_PARCOURS,
  RAYON_MAX_ETOILE_PX,
  rayonEtoileCielPx,
} from '../src/ui/apparence-objets.ts'
import { RAYON_CORPS_PX } from '../src/ui/libelles-cibles.ts'
import type { ParcoursScene } from '../src/ui/scene-etat.ts'
import { sousLeSol } from '../src/core/sol.ts'
import { K } from '../src/registry/constants.ts'
import { SB_PLAFOND_TABLE, SB_PLANCHER_NATUREL } from '../src/registry/bortle.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const DATE = new Date('2026-08-15T22:00:00Z')
const LARGEUR = 960
const HAUTEUR = 540

const PAQUET = decodeConstellations(
  readFileSync(
    join(import.meta.dirname, '..', 'public', 'data', 'constellations-1.bin'),
  ).buffer as ArrayBuffer,
)

interface Appel {
  readonly nom: string
  readonly args: readonly unknown[]
}

/** Contexte 2D instrumenté : il enregistre, il ne peint pas. */
function contexteEspion() {
  const appels: Appel[] = []
  const enregistre =
    (nom: string) =>
    (...args: unknown[]) => {
      appels.push({ nom, args })
    }
  const couleurs: string[] = []
  /** Opacités effectivement utilisées pour un tracé : la bande de §3.7 s'y lit. */
  const opacites: number[] = []
  /** T-0324 — celles des REMPLISSAGES : les étoiles sont des disques pleins, pas des traits. */
  const opacitesRemplies: number[] = []
  /** Chaque trait peint, sous la forme `teinte@épaisseur` : deux couches s'y distinguent. */
  const traits: string[] = []
  let opacite = 1
  const espion = {
    appels,
    couleurs,
    traits,
    opacites,
    opacitesRemplies,
    font: '',
    textBaseline: '',
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
    set globalAlpha(v: number) {
      opacite = v
    },
    get globalAlpha() {
      return opacite
    },
    // Un dégradé n'est pas une couleur : ses arrêts sont déjà enregistrés un par un par
    // `addColorStop`, et le pousser ici ferait entrer un objet dans la liste des teintes.
    set fillStyle(v: unknown) {
      if (typeof v === 'string') couleurs.push(v)
    },
    get fillStyle() {
      return couleurs[couleurs.length - 1] ?? ''
    },
    set strokeStyle(v: string) {
      couleurs.push(v)
    },
    get strokeStyle() {
      return couleurs[couleurs.length - 1] ?? ''
    },
    fillRect: enregistre('fillRect'),
    beginPath: enregistre('beginPath'),
    closePath: enregistre('closePath'),
    moveTo: enregistre('moveTo'),
    lineTo: enregistre('lineTo'),
    arc: enregistre('arc'),
    // T-0143 — le marqueur d'objet peint son dégradé dans un contexte transformé, et son
    // contour hors transformation.
    ellipse: enregistre('ellipse'),
    save: enregistre('save'),
    restore: enregistre('restore'),
    translate: enregistre('translate'),
    rotate: enregistre('rotate'),
    scale: enregistre('scale'),
    stroke: (...args: unknown[]) => {
      opacites.push(opacite)
      traits.push(`${espion.strokeStyle}@${espion.lineWidth}`)
      appels.push({ nom: 'stroke', args })
    },
    fill: (...args: unknown[]) => {
      opacitesRemplies.push(opacite)
      appels.push({ nom: 'fill', args })
    },
    createRadialGradient: (..._args: number[]) => ({
      addColorStop(_o: number, c: string) {
        couleurs.push(c)
      },
    }),
    fillText: enregistre('fillText'),
    setLineDash: enregistre('setLineDash'),
  }
  return espion
}

/** Path2D n'existe pas hors navigateur : la passe n'en attend que moveTo et arc. */
class Path2DEspion {
  readonly arcs: number[] = []
  moveTo(): void {}
  arc(_x: number, _y: number, rayon: number): void {
    this.arcs.push(rayon)
  }
}
;(globalThis as unknown as { Path2D: unknown }).Path2D = Path2DEspion

const COUCHES: CouchesActives = {
  figures: true,
  frontieres: true,
  asterismes: true,
  cadre: true,
  horizon: true,
  voieLactee: true,
  sol: false,
}

/** Quelques étoiles brillantes bien réparties, pour ne pas dépendre du paquet HYG. */
function etoilesDeTest(): Etoile[] {
  const etoiles: Etoile[] = []
  for (let ad = 0; ad < 360; ad += 3) {
    for (let dec = -80; dec <= 80; dec += 10) {
      etoiles.push({ adDeg: ad, decDeg: dec, magV: ((ad + dec) % 7) - 1, bv: ((ad % 20) / 10) - 0.4 })
    }
  }
  return etoiles
}

function rend(
  options: {
    modeNuit?: boolean
    couches?: CouchesActives
    etoiles?: readonly Etoile[]
    objets?: readonly ObjetCielProfond[]
    passeFile?: (ctx: CanvasRenderingContext2D, projecteur: Projecteur) => void
    sbCiel?: number
    latitudeDeg?: number
    vise?: { azimutDeg: number; hauteurDeg: number }
    survol?: SurvolEcran
    masque?: MasqueHorizon
    fovDeg?: number
    magLimite?: number
    corps?: readonly PositionCorps[]
    vueRealiste?: boolean
    lune?: LuneEcran
    poseCadre?: OptiquePose
    enAvant?: ReadonlySet<string>
    parcours?: ParcoursScene
    cibleOuverte?: ObjetCielProfond
    apparition?: number
  } = {},
) {
  const ctx = contexteEspion()
  const etoiles = options.etoiles ?? etoilesDeTest()
  const ciel = cielInstantane(SITE, DATE)
  const vue: Vue = {
    mode: 'MODE_PLANETARIUM',
    fovDeg: options.fovDeg ?? 60,
    largeurPx: LARGEUR,
    hauteurPx: HAUTEUR,
    azimutDeg: options.vise?.azimutDeg ?? 180,
    hauteurDeg: options.vise?.hauteurDeg ?? 45,
    rotationDeg: 0,
  }
  const entree: EntreeDessin = {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    projecteur: projecteur(vue, ciel.matrice),
    matriceCiel: ciel.matrice,
    masque: options.masque ?? masquePlat(),
    vueRealiste: options.vueRealiste ?? false,
    ...(options.lune === undefined ? {} : { lune: options.lune }),
    index: construitIndex(etoiles),
    etoiles,
    objets: options.objets ?? [],
    figures: coucheFigures(PAQUET.figures),
    asterismes: coucheAsterismes(PAQUET.asterismes),
    frontieres: coucheFrontieres(PAQUET),
    etoilesNommees: PAQUET.etoilesNommees,
    corps: options.corps ?? [],
    nomsCorps: { Moon: 'Lune' },
    cadres: [
      {
        profil: {
          libelle: '120 mm',
          fovLDeg: 17.0,
          fovHDeg: 11.4,
          echApx: 8.8,
          capteurHMm: 24,
          modeObjectif: 'MODE_CADRE',
          tPoseS: 120,
        },
        azimutDeg: 180,
        hauteurDeg: 45,
        rotationDeg: 0,
      },
    ],
    couches: options.couches ?? COUCHES,
    magLimite: options.magLimite ?? magnitudeLimite(vue.fovDeg).value,
    sbCiel: options.sbCiel ?? SB_PLANCHER_NATUREL,
    latitudeDeg: options.latitudeDeg ?? SITE.latitudeDeg,
    modeNuit: options.modeNuit ?? false,
    survol: options.survol,
    passeFile: options.passeFile,
    poseCadre: options.poseCadre,
    enAvant: options.enAvant,
    parcours: options.parcours,
    cibleOuverte: options.cibleOuverte,
    apparition: options.apparition,
  }
  return { ctx, sortie: dessineCiel(entree), entree }
}

/** La direction visée au centre du canevas : elle ne dépend pas du champ, seulement du cap. */
const CENTRE_VUE = versSpherique(
  projecteur(
    {
      mode: 'MODE_PLANETARIUM',
      fovDeg: K('FOV_REFERENCE_RENDU_DEG'),
      largeurPx: LARGEUR,
      hauteurPx: HAUTEUR,
      azimutDeg: 180,
      hauteurDeg: 45,
      rotationDeg: 0,
    },
    cielInstantane(SITE, DATE).matrice,
  ).inverse(LARGEUR / 2, HAUTEUR / 2),
)

/** Un objet posé pile au centre du champ par défaut : le curseur l'y trouve sans chercher. */
const OBJET_AU_CENTRE: ObjetCielProfond = {
  designation: 'M31',
  nomsCommuns: 'Galaxie d’Andromède|Grande Nébuleuse d’Andromède',
  adDeg: CENTRE_VUE.longitudeDeg,
  decDeg: CENTRE_VUE.latitudeDeg,
  type: 'GALAXIE',
  majAxArcmin: 190,
  minAxArcmin: 60,
  posAngDeg: 35,
  vMag: 3.4,
  bMag: null,
  surfBr: null,
}

describe('rayon d’étoile au planétarium §3.3', () => {
  it('plafonne les plus brillantes sous la taille d’une planète', () => {
    expect(rayonEtoileCielPx(Number.NEGATIVE_INFINITY)).toBe(RAYON_MAX_ETOILE_PX)
    expect(RAYON_MAX_ETOILE_PX).toBeLessThan(RAYON_CORPS_PX)
  })

  it('suit la pente de la loi §3.3 entre plancher et plafond', () => {
    const m = K('MAG_REFERENCE_RAYON') + 3
    expect(rayonEtoileCielPx(m) / rayonEtoileCielPx(m + 1)).toBeCloseTo(
      rayonEtoilePx(m) / rayonEtoilePx(m + 1),
      9,
    )
  })

  it('T-0376 — écarte magnitudes 0 et 4 au moins deux fois plus qu’avec l’ancien r0 plafonné', () => {
    const m0 = K('MAG_REFERENCE_RAYON')
    const m4 = m0 + 4
    // L'ancien rendu : la loi §9.2 bornée à [0,7 ; 3] px.
    const ancien = (m: number) => Math.min(3, Math.max(0.7, rayonEtoilePx(m)))
    const ecartAncien = ancien(m0) - ancien(m4)
    expect(rayonEtoileCielPx(m0) - rayonEtoileCielPx(m4)).toBeGreaterThanOrEqual(2 * ecartAncien)
  })
})

describe('passe de rendu §3.3', () => {
  it('peint le fond, les étoiles par teinte et les tracés', () => {
    const { ctx, sortie } = rend()
    expect(ctx.appels.filter((a) => a.nom === 'fillRect')).toHaveLength(1)
    expect(sortie.etoilesDessinees).toBeGreaterThan(0)
    expect(sortie.stats.etoilesExaminees).toBeGreaterThanOrEqual(sortie.etoilesDessinees)
    // Un remplissage par teinte, pas un par étoile : c'est ce qui tient la fréquence.
    const remplissages = ctx.appels.filter((a) => a.nom === 'fill').length
    expect(remplissages).toBeLessThan(20)
    expect(ctx.appels.some((a) => a.nom === 'stroke')).toBe(true)
  })

  /**
   * T-0042 — l'aperçu incrusté se dépose par ce crochet. S'il partait après la passe, il
   * recouvrirait les repères ; s'il partait avant le fond, le fond l'effacerait.
   */
  it('appelle la passe de filé après le fond et avant le premier tracé', () => {
    let rang = -1
    const { ctx } = rend({
      // Couche Voie lactée éteinte : sa bande fait partie du fond (§3.7) et s'intercale
      // légitimement entre le remplissage et l'aperçu. Le voisinage exact se lit sans elle.
      couches: { ...COUCHES, voieLactee: false },
      passeFile: (c) => {
        rang = (c as unknown as ReturnType<typeof contexteEspion>).appels.length
      },
    })
    const fonds = ctx.appels.filter((a) => a.nom === 'fillRect')
    expect(fonds).toHaveLength(1)
    expect(rang).toBe(ctx.appels.indexOf(fonds[0]!) + 1)
    const premierTrace = ctx.appels.findIndex(
      (a) => a.nom === 'stroke' || a.nom === 'fill' || a.nom === 'fillText',
    )
    expect(premierTrace).toBeGreaterThan(-1)
    expect(rang).toBeLessThanOrEqual(premierTrace)
  })

  /**
   * T-0396 — le filé du Panorama, ce sont des étoiles : de jour, elles s'éteignent avec celles
   * du planétarium, et reviennent au même fondu au crépuscule.
   */
  it('peint la passe de filé sous le fondu des étoiles', () => {
    let opaciteVue = -1
    const passeFile = (c: CanvasRenderingContext2D) => {
      opaciteVue = c.globalAlpha
    }
    const { ctx } = rend({ passeFile, apparition: 0.5 })
    expect(opaciteVue).toBe(0.5)
    expect(ctx.globalAlpha).toBe(1)
  })

  /** T-0396 — de jour, rien ne se verrait : le filé ne se calcule pas du tout. */
  it('ne calcule pas la passe de filé de jour', () => {
    let appelee = false
    rend({ passeFile: () => (appelee = true), apparition: 0 })
    expect(appelee).toBe(false)
  })

  /** T-0396 — une limite à −∞ (le jour) ne retient aucune étoile : l'index n'est pas parcouru. */
  it('ne parcourt pas l’index des étoiles de jour', () => {
    const { sortie } = rend({ magLimite: Number.NEGATIVE_INFINITY })
    expect(sortie.stats.cellulesRetenues).toBe(0)
    expect(sortie.etoilesDessinees).toBe(0)
  })

  it('ne trace une couche que si elle est active', () => {
    const sans = rend({
      couches: {
        figures: false,
        frontieres: false,
        asterismes: false,
        cadre: false,
        horizon: false,
        voieLactee: false,
        sol: false,
      },
    })
    const avec = rend()
    const lignes = (r: ReturnType<typeof rend>) =>
      r.ctx.appels.filter((a) => a.nom === 'lineTo').length
    expect(lignes(sans)).toBeLessThan(lignes(avec))
  })

  it('trace les astérismes d’un trait distinct des figures IAU', () => {
    // Même gris que les figures : c'est l'épaisseur qui les sépare, et le trait la porte.
    const sansAsterismes = rend({ couches: { ...COUCHES, asterismes: false } })
    const avec = rend()
    const nouvelles = avec.ctx.traits.filter((t) => !sansAsterismes.ctx.traits.includes(t))
    expect(nouvelles.length).toBeGreaterThan(0)
    // Une couche, un tracé : pas de motif dépendant de la longueur du segment, qui
    // rendrait plein un segment court et pointillé un segment long.
    expect(avec.ctx.appels.some((a) => a.nom === 'setLineDash')).toBe(false)
  })

  it('trace le plan galactique et le nomme, seulement quand la couche est active', () => {
    const avec = rend()
    const sans = rend({ couches: { ...COUCHES, voieLactee: false } })
    const nomme = (r: ReturnType<typeof rend>) =>
      r.sortie.labels.some((l) => l.texte === 'Voie lactée')
    expect(nomme(avec)).toBe(true)
    expect(nomme(sans)).toBe(false)
    // La ligne elle-même : la couche décochée retire des segments, elle n'en ajoute pas.
    const lignes = (r: ReturnType<typeof rend>) =>
      r.ctx.appels.filter((a) => a.nom === 'lineTo').length
    expect(lignes(sans)).toBeLessThan(lignes(avec))
  })

  it('pose le label de la Voie lactée sur la ligne, dans sa teinte', () => {
    const { sortie } = rend()
    const label = sortie.labels.find((l) => l.texte === 'Voie lactée')!
    expect(label.couleur).toBe(palette(false).voieLactee)
    // Sur la ligne veut dire : à un point du plan galactique effectivement projeté, donc
    // jamais figé dans un coin du canevas.
    expect(label.xPx).toBeGreaterThan(0)
    expect(label.xPx).toBeLessThan(LARGEUR)
    expect(label.yPx).toBeGreaterThan(0)
    expect(label.yPx).toBeLessThan(HAUTEUR)
  })

  /**
   * §3.7 — la bande dit ce que l'utilisateur verra depuis SON ciel. Le discriminant n'est pas
   * le nombre de traits mais leur opacité : la bande est la seule chose peinte en translucide,
   * et son opacité EST sa part de la brillance totale (T-0103).
   */
  const opacitesDeBande = (r: ReturnType<typeof rend>) =>
    r.ctx.opacites.filter((o) => o > 0 && o < 1)

  it('module la bande par le fond de ciel : franche sur un ciel noir, effacée en ville', () => {
    const bonCiel = rend({ sbCiel: SB_PLANCHER_NATUREL })
    const cielMoyen = rend({ sbCiel: (SB_PLANCHER_NATUREL + SB_PLAFOND_TABLE) / 2 })
    const cielPerdu = rend({ sbCiel: SB_PLAFOND_TABLE })

    // La part de la bande dans la brillance totale décroît quand le ciel s'éclaircit : c'est
    // la physique du modèle, pas une rampe calée sur deux seuils.
    const part = (r: ReturnType<typeof rend>) => Math.max(...opacitesDeBande(r))
    expect(part(bonCiel)).toBeGreaterThan(part(cielMoyen))
    expect(part(cielMoyen)).toBeGreaterThan(part(cielPerdu))
    // Effacée ne veut pas dire non peinte : en ville la bande est encore composée, mais sa
    // part est si faible qu'elle ne déplace plus le fond. C'est ce que l'œil constate.
    // 0,25 et non 0,1 : la part peinte porte le gain d'affichage C-50 (T-0352). L'effacement
    // PHYSIQUE, sur la brillance brute, est tenu par `voie-lactee.test.ts`.
    expect(part(cielPerdu)).toBeLessThan(0.25)
    expect(part(bonCiel)).toBeGreaterThan(0.5)
    // La ligne du plan, elle, est tracée dans tous les cas.
    expect(cielPerdu.sortie.labels.some((l) => l.texte === 'Voie lactée')).toBe(true)
  })

  it('jamais opaque : les repères restent lisibles au travers de la bande', () => {
    const { ctx } = rend({ sbCiel: SB_PLANCHER_NATUREL })
    // Aucune tranche n'est peinte en opaque, même sur le ciel le plus noir de la table.
    expect(Math.max(...opacitesDeBande({ ctx } as ReturnType<typeof rend>))).toBeLessThan(1)
    // Et les repères, eux, restent peints à pleine opacité par-dessus.
    expect(ctx.opacites.some((o) => o === 1)).toBe(true)
  })

  it('ne se peint plus sous l’aperçu incrusté de §9.5', () => {
    let rang = -1
    const { ctx } = rend({
      passeFile: (c) => {
        rang = (c as unknown as ReturnType<typeof contexteEspion>).appels.length
      },
    })
    const fond = ctx.appels.findIndex((a) => a.nom === 'fillRect')
    // T-0171 — l'aperçu se dépose toujours après le fond, mais la bande ne le précède plus :
    // la couche Voie lactée s'éteint avec les autres repères le temps qu'il soit peint.
    expect(rang).toBeGreaterThan(fond)
    expect(opacitesDeBande({ ctx } as ReturnType<typeof rend>)).toHaveLength(0)
  })

  /** Repère du centre galactique : la vue est amenée dessus pour qu'il soit dans le champ. */
  function viseCentreGalactique() {
    const ciel = cielInstantane(SITE, DATE)
    const horizontal = versSpherique(applique(ciel.matrice, depuisGalactique(0, 0)))
    return {
      vise: { azimutDeg: horizontal.longitudeDeg, hauteurDeg: horizontal.latitudeDeg },
      hauteurDeg: horizontal.latitudeDeg,
    }
  }

  it('repère et nomme le centre galactique, avec sa hauteur courante', () => {
    const { vise, hauteurDeg } = viseCentreGalactique()
    const { sortie } = rend({ vise })
    const label = sortie.labels.find((l) => l.texte.startsWith('Centre galactique'))
    expect(label, JSON.stringify(sortie.labels.map((l) => l.texte))).toBeDefined()
    expect(label!.texte).toContain(`${hauteurDeg.toFixed(0)}°`)
    expect(label!.couleur).toBe(palette(false).voieLactee)
  })

  it('dit que le centre galactique reste trop bas quand il est hors d’atteinte', () => {
    const { vise } = viseCentreGalactique()
    const decDeg = versSpherique(depuisGalactique(0, 0)).latitudeDeg
    const culmination = altitudeCulmination(SITE.latitudeDeg, decDeg).value
    expect(culmination).toBeLessThan(K('SEUIL_HAUTEUR_IMAGERIE_DEG'))

    const { sortie } = rend({ vise })
    const texte = sortie.labels.find((l) => l.texte.startsWith('Centre galactique'))!.texte
    expect(texte).toContain('trop bas')
  })

  it('n’annonce aucune cause depuis une latitude où le centre galactique passe haut', () => {
    const { vise } = viseCentreGalactique()
    const decDeg = versSpherique(depuisGalactique(0, 0)).latitudeDeg
    const { sortie } = rend({ vise, latitudeDeg: decDeg })
    const texte = sortie.labels.find((l) => l.texte.startsWith('Centre galactique'))!.texte
    expect(texte).not.toContain('trop bas')
  })

  it('soumet le repère du centre galactique au budget de labels, sans passe-droit', () => {
    const { vise } = viseCentreGalactique()
    const { sortie } = rend({ vise })
    expect(sortie.labels.length).toBeLessThanOrEqual(K('LABELS_MAX'))
  })

  it('éteint bande et repère avec la seule bascule de la couche Voie lactée', () => {
    const { vise } = viseCentreGalactique()
    const sans = rend({ vise, couches: { ...COUCHES, voieLactee: false } })
    expect(opacitesDeBande(sans)).toHaveLength(0)
    expect(sans.sortie.labels.some((l) => l.texte.startsWith('Centre galactique'))).toBe(false)
    expect(sans.sortie.labels.some((l) => l.texte === 'Voie lactée')).toBe(false)
  })

  it('plafonne les labels et les empêche de se chevaucher', () => {
    const { sortie } = rend()
    expect(sortie.labels.length).toBeLessThanOrEqual(K('LABELS_MAX'))
    for (let i = 0; i < sortie.labels.length; i++) {
      for (let j = i + 1; j < sortie.labels.length; j++) {
        const a = sortie.labels[i]!
        const b = sortie.labels[j]!
        const chevauche =
          Math.abs(a.xPx - b.xPx) * 2 < a.largeurPx + b.largeurPx &&
          Math.abs(a.yPx - b.yPx) * 2 < a.hauteurPx + b.hauteurPx
        expect(chevauche, `${a.texte} / ${b.texte}`).toBe(false)
      }
    }
  })

  it('n’écrit aucune composante verte ou bleue en mode nuit', () => {
    // Objet dimensionné compris : les arrêts de son dégradé portent leur opacité DANS la
    // couleur (T-0119), et c'est une couleur peinte comme une autre.
    const { ctx } = rend({ modeNuit: true, objets: [OBJET_AU_CENTRE] })
    expect(ctx.couleurs.length).toBeGreaterThan(0)
    for (const couleur of ctx.couleurs) {
      const rgb = couleur.match(/rgb\((\d+) (\d+) (\d+)(?: \/ [\d.]+)?\)/)
      if (rgb !== null) {
        expect(Number(rgb[2]), couleur).toBe(0)
        expect(Number(rgb[3]), couleur).toBe(0)
        continue
      }
      // Seule couleur hexadécimale admise : le noir du fond.
      expect(couleur, couleur).toBe('#000000')
    }
  })
})

/**
 * T-0097, T-0098, T-0100 — la vue réaliste dans la passe de rendu.
 *
 * Le modèle lui-même est vérifié dans `fond-ciel-rendu.test.ts` ; ce qui se joue ici est l'ORDRE
 * des couches et le fait que le mode nuit ne peint rien de tout cela.
 */
/**
 * T-0143 — le marqueur d'un objet du ciel profond. La géométrie se vérifie dans
 * `marqueur-objet.test.ts` ; ce qui se joue ici est ce que la PASSE peint, et avec quelle teinte.
 */
describe('marqueur d’objet §3.3', () => {
  const SANS_DIMENSIONS: ObjetCielProfond = {
    ...OBJET_AU_CENTRE,
    designation: 'NGC 0000',
    type: 'INCONNU',
    majAxArcmin: null,
    minAxArcmin: null,
    posAngDeg: null,
  }

  it('peint une ellipse et son dégradé pour un objet dimensionné', () => {
    const { ctx } = rend({ objets: [OBJET_AU_CENTRE] })
    expect(ctx.appels.filter((a) => a.nom === 'ellipse')).toHaveLength(1)
    // Le dégradé est elliptique par la transformation du contexte : `createRadialGradient` ne
    // sait faire que des cercles.
    expect(ctx.appels.filter((a) => a.nom === 'scale')).toHaveLength(1)
    expect(ctx.appels.filter((a) => a.nom === 'save')).toHaveLength(1)
    expect(ctx.appels.filter((a) => a.nom === 'restore')).toHaveLength(1)
  })

  it('reprend la croix quand le catalogue n’a pas de dimensions', () => {
    const { ctx } = rend({ objets: [SANS_DIMENSIONS] })
    expect(ctx.appels.filter((a) => a.nom === 'ellipse')).toHaveLength(0)
    // Les deux branches de la croix, et rien de transformé.
    expect(ctx.appels.filter((a) => a.nom === 'scale')).toHaveLength(0)
  })

  it('prend la teinte du type de l’objet, pas une teinte commune', () => {
    const teintes = teintesObjets(false, false, 21)
    const galaxie = rend({ objets: [OBJET_AU_CENTRE] })
    expect(galaxie.ctx.couleurs).toContain(teintes.GALAXIE.bord)
    const nebuleuse = rend({
      objets: [{ ...OBJET_AU_CENTRE, type: 'EMISSION' }],
    })
    expect(nebuleuse.ctx.couleurs).toContain(teintes.EMISSION.bord)
    expect(nebuleuse.ctx.couleurs).not.toContain(teintes.GALAXIE.bord)
  })

  it('donne à la croix la couleur de bord de son type', () => {
    const teintes = teintesObjets(false, false, 21)
    const { ctx } = rend({ objets: [SANS_DIMENSIONS] })
    expect(ctx.couleurs).toContain(teintes.INCONNU.bord)
  })

  it('rend cliquable toute l’étendue d’une grande ellipse (T-0144)', () => {
    const { sortie } = rend({ objets: [OBJET_AU_CENTRE] })
    const cible = sortie.cibles.find((c) => c.objet?.designation === OBJET_AU_CENTRE.designation)
    expect(cible?.rayonPx).toBeGreaterThan(RAYON_CLIC_PX)
    // Un clic au bord du marqueur, bien au-delà du rayon de désignation par défaut.
    const auBord = cibleSousLeCurseur(
      sortie.cibles,
      LARGEUR / 2 + cible!.rayonPx! - 1,
      HAUTEUR / 2,
    )
    expect(auBord?.objet?.designation).toBe(OBJET_AU_CENTRE.designation)
  })

  it('pose le nom au bord du marqueur, jamais dedans (T-0144)', () => {
    const { sortie } = rend({ objets: [OBJET_AU_CENTRE] })
    const cible = sortie.cibles.find((c) => c.objet?.designation === OBJET_AU_CENTRE.designation)!
    expect(ancreLabel(cible).xPx).toBeGreaterThan(cible.xPx + cible.rayonPx!)
  })

  /**
   * T-0195 — le plafond du ciel profond ne suit pas le zoom. La magnitude d'essai se prend
   * ENTRE la profondeur du champ le plus large et le plafond fixe : c'est exactement la bande
   * d'objets que le dézoom effaçait, et elle se dérive des deux règles, elle ne se recopie pas.
   */
  const FOV_LARGE = K('FOV_MAX_STEREOGRAPHIQUE_DEG')
  const FOV_SERRE = K('FOV_MIN_SANS_GAIA_DEG')
  const FAIBLE: ObjetCielProfond = {
    ...OBJET_AU_CENTRE,
    vMag: (magnitudeLimite(FOV_LARGE).value + K('MAG_LIMITE_OBJETS')) / 2,
  }

  it('peint au dézoom un objet que la profondeur du champ écarterait', () => {
    expect(FAIBLE.vMag!).toBeGreaterThan(magnitudeLimite(FOV_LARGE).value)
    const large = rend({ objets: [FAIBLE], fovDeg: FOV_LARGE })
    expect(large.sortie.cibles.filter((c) => c.type === 'OBJET')).toHaveLength(1)
    const serre = rend({ objets: [FAIBLE], fovDeg: FOV_SERRE })
    expect(serre.sortie.cibles.filter((c) => c.type === 'OBJET')).toHaveLength(1)
  })

  /**
   * §6.4 — filtrer le catalogue filtre la scène. L'écarté s'ESTOMPE et reste cliquable : le
   * retirer ferait perdre l'endroit où la sélection tombe dans le ciel, qui est la seule
   * chose que le report du filtre sur la scène apporte.
   */
  describe('report des filtres du catalogue', () => {
    const AUTRE: ObjetCielProfond = { ...OBJET_AU_CENTRE, designation: 'M32' }
    // Aucune couche : les seuls tracés de la scène sont alors ceux des deux marqueurs.
    const NUES: CouchesActives = {
      figures: false,
      frontieres: false,
      asterismes: false,
      cadre: false,
      horizon: false,
      voieLactee: false,
      sol: false,
    }

    it('peint tout à pleine opacité tant qu’aucun filtre n’est actif', () => {
      const { ctx } = rend({ objets: [OBJET_AU_CENTRE, AUTRE], couches: NUES })
      expect(ctx.opacites).toEqual([1, 1])
    })

    it('estompe le marqueur que les filtres ne retiennent pas', () => {
      const { ctx, sortie } = rend({
        objets: [OBJET_AU_CENTRE, AUTRE],
        couches: NUES,
        enAvant: new Set([OBJET_AU_CENTRE.designation]),
      })
      expect([...ctx.opacites].sort()).toEqual([OPACITE_OBJET_ESTOMPE, 1])
      // L'écarté n'est pas retiré de la scène : il reste désignable au clic.
      expect(sortie.cibles.filter((c) => c.type === 'OBJET')).toHaveLength(2)
    })
  })

  it('écarte à tout champ l’objet plus faible que le plafond du ciel profond', () => {
    const horsPlafond = { ...OBJET_AU_CENTRE, vMag: K('MAG_LIMITE_OBJETS') + 1 }
    for (const fovDeg of [FOV_SERRE, FOV_LARGE]) {
      const { sortie } = rend({ objets: [horsPlafond], fovDeg })
      expect(sortie.cibles.filter((c) => c.type === 'OBJET')).toHaveLength(0)
    }
  })

  it('garde le marqueur sous un ciel de Bortle 9 en vue réaliste', () => {
    // La profondeur que la scène reçoit alors est celle de l'ŒIL sous ce fond de ciel : c'est
    // elle qui plafonne les étoiles, et c'est elle que le ciel profond ne suit plus.
    const magLimite = magnitudeRendue(FOV_SERRE, SB_PLAFOND_TABLE, true).value
    expect(FAIBLE.vMag!).toBeGreaterThan(magLimite)
    const { sortie } = rend({
      objets: [FAIBLE],
      fovDeg: FOV_SERRE,
      magLimite,
      vueRealiste: true,
      sbCiel: SB_PLAFOND_TABLE,
    })
    expect(sortie.cibles.filter((c) => c.type === 'OBJET')).toHaveLength(1)
  })
})

describe('fond de ciel réaliste §3.3', () => {
  const SB = 19.9

  it('laisse le fond inchangé au pixel près quand la case est décochée', () => {
    const { ctx } = rend({ sbCiel: SB })
    expect(ctx.couleurs[0]).toBe(palette(false).fond)
    // Un seul `fillRect` pour le fond : ce n'est pas un dégradé de canevas.
    expect(ctx.appels.filter((a) => a.nom === 'fillRect').length).toBe(1)
  })

  it('prend la luminance du site quand la case est cochée', () => {
    const { ctx } = rend({ sbCiel: SB, vueRealiste: true })
    expect(ctx.couleurs[0]).toBe(paletteRealiste(SB).fond)
    expect(ctx.appels.filter((a) => a.nom === 'fillRect').length).toBe(1)
  })

  it('peint le halo d’horizon SOUS le sol : le relief le recouvre', () => {
    const vise = { azimutDeg: 180, hauteurDeg: 10 }
    const avecSol: CouchesActives = { ...COUCHES, sol: true }
    const { ctx } = rend({ sbCiel: SB, vueRealiste: true, couches: avecSol, vise })
    const teintes = paletteRealiste(SB)
    const dernierHalo = ctx.couleurs.reduce(
      (vu, couleur, i) => (couleur !== teintes.fond && couleur.startsWith('rgb(') && i < ctx.couleurs.indexOf(teintes.sol) ? i : vu),
      -1,
    )
    const indexSol = ctx.couleurs.indexOf(teintes.sol)
    expect(indexSol).toBeGreaterThan(0)
    expect(dernierHalo).toBeLessThan(indexSol)
    // Un remplissage par palier, plus celui du sol.
    expect(ctx.appels.filter((a) => a.nom === 'fill' && a.args[0] === 'evenodd').length).toBe(
      K('PALIERS_HALO_HORIZON'),
    )
  })

  it('ne peint aucun halo en mode nuit : la vue réaliste n’y change que la magnitude', () => {
    const clair = rend({ sbCiel: SB, vueRealiste: true })
    const nuit = rend({ sbCiel: SB, vueRealiste: true, modeNuit: true })
    expect(nuit.ctx.couleurs[0]).toBe('#000000')
    expect(nuit.ctx.appels.filter((a) => a.nom === 'fill' && a.args[0] === 'evenodd').length).toBe(0)
    expect(clair.ctx.appels.filter((a) => a.nom === 'fill' && a.args[0] === 'evenodd').length,
    ).toBeGreaterThan(0)
  })
})

describe('pointage à la souris §3.4', () => {
  it('rend un objet du ciel profond cliquable vers les moteurs du Lot 2', () => {
    const ciel = cielInstantane(SITE, DATE)
    const vue: Vue = {
      mode: 'MODE_PLANETARIUM',
      fovDeg: 60,
      largeurPx: LARGEUR,
      hauteurPx: HAUTEUR,
      azimutDeg: 180,
      hauteurDeg: 45,
      rotationDeg: 0,
    }
    const centre = versSpherique(projecteur(vue, ciel.matrice).inverse(LARGEUR / 2, HAUTEUR / 2))
    const m33: ObjetCielProfond = {
      designation: 'M33',
      nomsCommuns: 'Triangulum Galaxy',
      adDeg: centre.longitudeDeg,
      decDeg: centre.latitudeDeg,
      type: 'GALAXIE',
      majAxArcmin: 71,
      minAxArcmin: 42,
      posAngDeg: 23,
      vMag: 5.7,
      bMag: null,
      surfBr: null,
    }

    const { sortie } = rend({ objets: [m33] })
    const cible = cibleSousLeCurseur(sortie.cibles, LARGEUR / 2, HAUTEUR / 2)
    expect(cible).not.toBeNull()
    expect(cible!.type).toBe('OBJET')
    expect(cible!.objet?.designation).toBe('M33')
  })

  it('ne retient rien loin de tout élément dessiné', () => {
    const { sortie } = rend()
    expect(cibleSousLeCurseur(sortie.cibles, -500, -500)).toBeNull()
  })
})

/**
 * T-0085 — le nom que le seuil de zoom a masqué, révélé le temps du survol.
 *
 * T-0109 — le survol ne transporte plus qu'une cible : la passe la nomme et la place avec les
 * fonctions des labels peints, jamais avec un second vocabulaire.
 */
describe('label du survol T-0085', () => {
  /** Le champ par défaut du harnais est bien au-dessus du seuil des objets : M31 n'a pas de
   *  label peint, et c'est exactement l'élément que le survol vient nommer. */
  const LARGE = K('FOV_REFERENCE_RENDU_DEG')
  /** Sous le seuil de §3.4, le même objet porte son label : il n'a plus rien à révéler. */
  const SERRE = K('FOV_MIN_AVEC_GAIA_DEG')

  const cibleObjet = (fovDeg: number): CibleEcran =>
    rend({ objets: [OBJET_AU_CENTRE], fovDeg }).sortie.cibles.find((c) => c.type === 'OBJET')!

  it('révèle le nom survolé sans entrer dans le budget de §3.4', () => {
    const sans = rend({ objets: [OBJET_AU_CENTRE], fovDeg: LARGE })
    const avec = rend({
      objets: [OBJET_AU_CENTRE],
      fovDeg: LARGE,
      survol: { cible: cibleObjet(LARGE) },
    })
    expect(sans.sortie.revele).toBeNull()
    expect(avec.sortie.revele).not.toBeNull()
    // Hors budget : le nom révélé ne chasse aucun label retenu et n'en ajoute aucun.
    expect(avec.sortie.labels.map((l) => l.texte)).toEqual(sans.sortie.labels.map((l) => l.texte))
    const attendu = libelleCible(cibleObjet(LARGE))
    expect(avec.sortie.revele!.texte).toBe(attendu)
    expect(avec.ctx.appels.some((a) => a.nom === 'fillText' && a.args[0] === attendu)).toBe(true)
  })

  it('ne recouvre aucun label retenu', () => {
    const { sortie } = rend({
      objets: [OBJET_AU_CENTRE],
      fovDeg: LARGE,
      survol: { cible: cibleObjet(LARGE) },
    })
    const revele = sortie.revele!
    for (const label of sortie.labels) {
      const chevauche =
        Math.abs(label.xPx - revele.xPx) * 2 < label.largeurPx + revele.largeurPx &&
        Math.abs(label.yPx - revele.yPx) * 2 < label.hauteurPx + revele.hauteurPx
      expect(chevauche, `${label.texte} recouvert par ${revele.texte}`).toBe(false)
    }
  })

  it('ne double pas un nom que la scène affiche déjà', () => {
    const cible = cibleObjet(SERRE)
    const { sortie } = rend({ objets: [OBJET_AU_CENTRE], fovDeg: SERRE, survol: { cible } })
    // Le label est peint à ce champ : c'est la condition du test, pas un effet de bord.
    expect(sortie.labels.some((l) => l.texte === libelleCible(cible))).toBe(true)
    expect(sortie.revele).toBeNull()
  })
})

/**
 * T-0107 / T-0108 — une étoile nommée n'est pas AUSSI une cible anonyme, et le survol ne
 * révèle qu'un nom masqué.
 *
 * Les deux passes de la scène décrivent le même astre depuis deux paquets qui n'ont pas la
 * même précision : `constellations-1.bin` garde la position en double précision, `hyg-1.bin`
 * l'arrondit en Float32. Le harnais reproduit l'écart tel quel — les positions des étoiles
 * nommées traversent l'encodage réel du paquet des étoiles — plutôt que de le simuler par un
 * décalage recopié.
 */
describe('cibles dédoublonnées T-0107', () => {
  /** Les étoiles nommées du paquet, vues par le paquet des étoiles : donc arrondies. */
  const ETOILES_ARRONDIES: readonly Etoile[] = decodeEtoiles(
    encodeEtoiles(
      PAQUET.etoilesNommees
        .filter((e) => etoileLabellisable(e.magV))
        .map((e) => ({
          adDeg: e.adDeg,
          decDeg: e.decDeg,
          magV: e.magV,
          // L'indice de couleur ne joue aucun rôle ici : seule la position est en cause.
          bv: 0,
        })),
    ),
  )

  // Le champ vient du registre : sous ce seuil, §3.4 admet les labels d'étoiles, et c'est là
  // que l'invariant « déjà nommée à l'écran ⇒ le survol ne peint rien » a un sens.
  const FOV = K('FOV_LABELS_CONSTELLATIONS_DEG')
  const rendNommees = (survol?: SurvolEcran) =>
    rend(
      survol === undefined
        ? { etoiles: ETOILES_ARRONDIES, fovDeg: FOV }
        : { etoiles: ETOILES_ARRONDIES, fovDeg: FOV, survol },
    )

  it('ne garde qu’une cible par étoile nommée', () => {
    const { sortie } = rendNommees()
    const nommees = sortie.cibles.filter((c) => c.etoileNommee !== undefined)
    expect(nommees.length).toBeGreaterThan(0)
    for (const anonyme of sortie.cibles.filter(
      (c) => c.type === 'ETOILE' && c.etoileNommee === undefined,
    )) {
      const jumelle = nommees.find(
        (n) => Math.abs(n.xPx - anonyme.xPx) < 1 && Math.abs(n.yPx - anonyme.yPx) < 1,
      )
      expect(jumelle?.nom, 'doublon anonyme sur une étoile nommée').toBeUndefined()
    }
  })

  it('résout toujours l’étoile nommée, quel que soit le côté d’approche', () => {
    const { sortie } = rendNommees()
    const nommees = sortie.cibles.filter((c) => c.etoileNommee !== undefined)
    // Le pointeur vise au pixel : l'approche se fait par le centre et les quatre côtés.
    const ECARTS = [0, -0.5, 0.5]
    for (const attendue of nommees) {
      for (const dx of ECARTS) {
        for (const dy of ECARTS) {
          const cible = cibleSousLeCurseur(sortie.cibles, attendue.xPx + dx, attendue.yPx + dy)
          expect(cible, `rien sous ${attendue.nom}`).not.toBeNull()
          // C'est bien une étoile identifiée qui répond — un voisin nommé fait l'affaire,
          // l'entrée anonyme non.
          const titre = decritCible(cible!).titre
          expect(cible!.etoileNommee, `rien d’identifié en ${attendue.xPx}, ${attendue.yPx} → « ${titre} »`).toBeDefined()
          // Et elle porte un nom à ce champ : c'est l'égalité exacte entre ce libellé et le
          // label peint que `labelSurvol` exploite pour ne pas nommer deux fois le même astre.
          expect(libelleCible(cible!), titre).not.toBeNull()
        }
      }
    }
  })

  it('ne peint rien au survol d’une étoile dont le label est déjà retenu', () => {
    const { sortie } = rendNommees()
    const labellisees = sortie.labels.filter((l) => l.categorie === 'ETOILE')
    expect(labellisees.length).toBeGreaterThan(0)
    for (const label of labellisees) {
      const etoile = sortie.cibles.find(
        (c) => c.etoileNommee !== undefined && libelleCible(c) === label.texte,
      )!
      // Le curseur ne tombe jamais au centre exact de l'astre : viser les quatre coins du
      // pixel, sans quoi la cible nommée gagne par une distance nulle et le cas ne prouve
      // rien. Le survol se compose ensuite comme dans `planetarium-gestes.ts` — la cible
      // vient du curseur, pas de la liste : c'est la chaîne complète qui est vérifiée.
      for (const dx of [-0.5, 0.5]) {
        for (const dy of [-0.5, 0.5]) {
          const cible = cibleSousLeCurseur(sortie.cibles, etoile.xPx + dx, etoile.yPx + dy)!
          const survol: SurvolEcran = { cible }
          expect(
            rendNommees(survol).sortie.revele,
            `${label.texte} → ${libelleCible(cible)}`,
          ).toBeNull()
        }
      }
    }
  })

  it('révèle encore le repli d’une étoile brillante sans désignation', () => {
    // Le champ synthétique du harnais n'a aucune contrepartie dans le paquet nommé : ses
    // étoiles brillantes sont celles que la branche de repli existe pour servir. Sans ce cas,
    // T-0107 se « corrigerait » en supprimant la branche, et cinq étoiles du ciel réel
    // deviendraient injoignables.
    const { sortie } = rend()
    const anonymes = sortie.cibles.filter(
      (c) => c.type === 'ETOILE' && c.etoileNommee === undefined,
    )
    expect(anonymes.length).toBeGreaterThan(0)
    const premiere = anonymes[0]!
    const decrite = decritCible(premiere)
    // Aucun nom à porter, et une fiche qui dit ce que le paquet contient — rien de plus.
    expect(premiere.nom).toBe('')
    expect(decrite.lignes.join(' ')).toContain(nombre(premiere.etoile!.magV, 2))
    // Aucun libellé peint : le survol retombe sur le titre de la fiche, seul nom qu'elle ait.
    expect(libelleCible(premiere)).toBeNull()
    const reveles = anonymes.slice(0, 5).filter((c) => {
      const sortieSurvol = rend({ survol: { cible: c } }).sortie
      return sortieSurvol.revele?.texte === titreCible(c)
    })
    expect(reveles.length).toBeGreaterThan(0)
  })
})

/**
 * T-0109 — un élément porte le même libellé, au même endroit, qu'il soit peint ou révélé.
 *
 * La scène composait le texte des labels, le survol empruntait celui de la fiche : deux
 * vocabulaires, deux ancres, et un nom qui changeait de forme ET de place au premier cran de
 * zoom. `libelles-cibles.ts` est désormais la seule source des deux.
 */
describe('libellés d’un même astre T-0109', () => {
  /** Entre les deux seuils de §3.4 : les étoiles sont nommées, les objets non. */
  const LARGE = K('FOV_LABELS_CONSTELLATIONS_DEG')
  /** Sous le seuil des objets : tout est nommé, et les étoiles au complet. */
  const SERRE = K('FOV_MIN_AVEC_GAIA_DEG')
  /** Un degré au-dessus de la visée : dans le champ aux deux zooms, sans disputer sa place
   *  au label de l'objet posé pile au centre. */
  const LUNE: PositionCorps = {
    corps: 'Moon' as PositionCorps['corps'],
    adH: 0,
    decDeg: 0,
    azimutDeg: 180,
    hauteurDeg: 46,
  }

  const scene = (fovDeg: number) =>
    rend({ fovDeg, objets: [OBJET_AU_CENTRE], corps: [LUNE] }).sortie

  it('n’a qu’une source de texte et qu’une source d’ancre pour tout label de cible', () => {
    const vus = new Set<string>()
    for (const fovDeg of [LARGE, SERRE]) {
      const sortie = scene(fovDeg)
      for (const label of sortie.labels) {
        const cible = sortie.cibles.find((c) => libelleCible(c) === label.texte)
        if (cible === undefined) continue // nom de constellation, d'astérisme ou de la bande
        const ancre = ancreLabel(cible)
        expect(label.xPx, `${label.texte} à ${fovDeg}°`).toBe(ancre.xPx)
        expect(label.yPx, `${label.texte} à ${fovDeg}°`).toBe(ancre.yPx)
        vus.add(cible.type)
      }
    }
    // Les trois familles de cibles ont été confrontées, pas seulement la plus dense — les
    // étoiles au grand champ, l'objet au petit, le corps aux deux.
    expect([...vus].sort()).toEqual(['CORPS', 'ETOILE', 'OBJET'])
  })

  it('révèle un label écarté au texte et au pixel près de ce qu’il aurait été peint', () => {
    // L'objet est au centre du champ, hors du seuil de §3.4 : son label est écarté, et rien
    // ne se dispute sa place. Le survol doit donc le poser exactement où il serait allé.
    const sortie = rend({ fovDeg: LARGE, objets: [OBJET_AU_CENTRE] }).sortie
    const cible = sortie.cibles.find((c) => c.type === 'OBJET')!
    expect(sortie.labels.some((l) => l.texte === libelleCible(cible))).toBe(false)
    const revele = rend({
      fovDeg: LARGE,
      objets: [OBJET_AU_CENTRE],
      survol: { cible },
    }).sortie.revele!
    expect(revele).not.toBeNull()
    expect(revele.texte).toBe(libelleCible(cible))
    expect(revele.xPx).toBe(ancreLabel(cible).xPx)
    expect(revele.yPx).toBe(ancreLabel(cible).yPx)
  })

  it('nomme une étoile par son nom propre, à tout champ — la désignation reste à la fiche', () => {
    const complete = PAQUET.etoilesNommees.find(
      (e) => e.nomPropre !== '' && e.designation !== '' && etoileLabellisable(e.magV),
    )!
    const cible: CibleEcran = {
      type: 'ETOILE',
      xPx: 0,
      yPx: 0,
      nom: '',
      etoileNommee: complete,
    }
    // Un astre porte UN nom sur la scène : « Dabih », jamais « β Cap » ni « Dabih — β Cap ».
    expect(libelleCible(cible)).toBe(complete.nomPropre)
    // La désignation vit dans la fiche, qui reste la forme longue.
    expect(titreCible(cible)).toBe(`${complete.nomPropre} — ${complete.designation}`)
    // Et la scène peint bien ce que le module annonce, aux deux champs : tout label d'étoile
    // est le nom propre d'une étoile du paquet, à défaut sa désignation.
    const nomsPeignables = new Set(
      PAQUET.etoilesNommees.map((e) => (e.nomPropre === '' ? e.designation : e.nomPropre)),
    )
    for (const fovDeg of [LARGE, SERRE]) {
      const peints = rend({ fovDeg }).sortie.labels.filter((l) => l.categorie === 'ETOILE')
      if (fovDeg === LARGE) expect(peints.length).toBeGreaterThan(0)
      for (const label of peints) expect(nomsPeignables.has(label.texte), label.texte).toBe(true)
    }
  })

  it('ne laisse aucun tiret orphelin quand une des deux formes manque', () => {
    const cibleDe = (nomPropre: string, designation: string): CibleEcran => ({
      type: 'ETOILE',
      xPx: 0,
      yPx: 0,
      nom: '',
      etoileNommee: { ...PAQUET.etoilesNommees[0]!, nomPropre, designation },
    })
    // Sans nom propre, la désignation fait le label — le seul cas où elle est peinte.
    expect(libelleCible(cibleDe('', 'β Cap'))).toBe('β Cap')
    expect(libelleCible(cibleDe('Dabih', ''))).toBe('Dabih')
    expect(titreCible(cibleDe('', 'β Cap'))).toBe('β Cap')
    expect(titreCible(cibleDe('Dabih', ''))).toBe('Dabih')
  })
})

/**
 * T-0116 — le filé couvre tout le planétarium, et il REMPLACE la couche d'étoiles ponctuelles.
 * Sinon chaque trace porterait un point net à une extrémité, ce qu'aucune pose ne produit.
 *
 * T-0316 — elles sortent aussi des CIBLES : une étoile qui file n'est plus au pixel où elle se
 * projette, et l'y survoler nommait un endroit vide. Sous l'aperçu, rien n'est désignable.
 */
describe('T-0116 — la passe de filé remplace les étoiles ponctuelles', () => {
  /** Les disques d'étoiles sont les seuls remplissages qui portent un `Path2D`. */
  const disques = (ctx: ReturnType<typeof contexteEspion>): readonly Appel[] =>
    ctx.appels.filter((a) => a.nom === 'fill' && a.args[0] instanceof Path2DEspion)

  it('ne peint plus aucun disque d’étoile', () => {
    const sans = rend()
    const avec = rend({ passeFile: () => undefined })
    // Sans filé, les disques sont bien là — le critère ne se vérifie pas sur une scène vide.
    expect(disques(sans.ctx).length).toBeGreaterThan(0)
    expect(
      disques(sans.ctx).flatMap((a) => (a.args[0] as Path2DEspion).arcs).length,
    ).toBeGreaterThan(0)
    expect(disques(avec.ctx)).toHaveLength(0)
  })

  it('retire les étoiles des cibles, sans plus peindre de nom', () => {
    const sans = rend()
    const avec = rend({ passeFile: () => undefined })
    expect(sans.sortie.cibles.filter((c) => c.type === 'ETOILE').length).toBeGreaterThan(0)
    expect(avec.sortie.cibles).toHaveLength(0)
    // Le comptage, lui, ne change pas : ce sont les mêmes étoiles qui alimentent le filé.
    expect(avec.sortie.etoilesDessinees).toBe(sans.sortie.etoilesDessinees)
    // T-0171 — la scène ne porte plus aucun nom : le survol reste la seule façon d'en lire un.
    expect(sans.sortie.labels.length).toBeGreaterThan(0)
    expect(avec.sortie.labels).toHaveLength(0)
  })
})

/**
 * T-0171 — l'aperçu peint sur toute la scène tient lieu de prise de vue.
 *
 * Ce qui CADRE la vue reste — le sol, l'horizon, le contour du cadre matériel. Ce qui la
 * COMMENTE s'efface : figures et frontières IAU, astérismes, Voie lactée, marqueurs d'objets,
 * corps mobiles, et tous les noms. Rien de tout cela ne se trouve sur une photographie, et
 * c'est ce que l'aperçu montre.
 *
 * T-0316 — la sélection s'arrête avec la peinture. Ce que l'aperçu n'a pas peint, le curseur ne
 * le trouve pas : plus aucune cible, et le survol ne révèle plus de nom.
 */
describe('T-0171 — l’aperçu efface les repères, garde ce qui cadre', () => {
  const CORPS: PositionCorps = {
    corps: 'Moon' as PositionCorps['corps'],
    adH: 0,
    decDeg: 0,
    azimutDeg: 180,
    hauteurDeg: 45,
  }
  const scene = (options: Parameters<typeof rend>[0] = {}) =>
    rend({ objets: [OBJET_AU_CENTRE], corps: [CORPS], masque: masquePlat(), ...options })

  const sans = () => scene()
  const avec = () => scene({ passeFile: () => undefined })

  it('n’emploie plus aucune teinte de repérage', () => {
    const teintes = palette(false)
    const effacees = [
      teintes.figures,
      teintes.frontieres,
      teintes.asterismes,
      teintesObjets(false, false, SB_PLANCHER_NATUREL).GALAXIE.bord,
    ]
    // Sans l'aperçu, la scène les emploie toutes : le critère ne se vérifie pas sur du vide.
    for (const teinte of effacees) expect(sans().ctx.couleurs).toContain(teinte)
    for (const teinte of effacees) expect(avec().ctx.couleurs).not.toContain(teinte)
  })

  it('garde le sol, l’horizon, le contour du cadre et le trait du plan galactique', () => {
    const teintes = palette(false)
    const ctx = scene({ passeFile: () => undefined, couches: { ...COUCHES, sol: true } }).ctx
    expect(ctx.couleurs).toContain(teintes.cadre)
    expect(ctx.couleurs).toContain(teintes.horizon)
    expect(ctx.couleurs).toContain(teintes.sol)
    // T-0173 — le trait du plan, oui ; la bande et le repère du centre, non. Ce sont deux
    // usages de la même teinte, que seule l'opacité partielle de la bande distingue.
    expect(ctx.couleurs).toContain(teintes.voieLactee)
    expect(ctx.opacites.filter((o) => o > 0 && o < 1)).toHaveLength(0)
  })

  it('éteint le trait du plan avec sa couche, comme hors aperçu', () => {
    const couches: CouchesActives = { ...COUCHES, voieLactee: false }
    const ctx = scene({ passeFile: () => undefined, couches }).ctx
    expect(ctx.couleurs).not.toContain(palette(false).voieLactee)
  })

  it('ne peint ni marqueur d’objet ni corps mobile', () => {
    expect(sans().ctx.appels.filter((a) => a.nom === 'ellipse').length).toBeGreaterThan(0)
    expect(avec().ctx.appels.filter((a) => a.nom === 'ellipse')).toHaveLength(0)
    // Le disque d'un corps est le seul `arc` hors des `Path2D` d'étoiles, eux-mêmes éteints.
    expect(sans().ctx.appels.filter((a) => a.nom === 'arc').length).toBeGreaterThan(0)
    expect(avec().ctx.appels.filter((a) => a.nom === 'arc')).toHaveLength(0)
  })

  it('n’écrit aucun nom hors les points cardinaux, survol compris', () => {
    const nu = avec()
    // Les quatre cardinaux appartiennent à l'horizon, la seule couche de repérage qui reste :
    // ce sont eux, et rien d'autre, qui survivent à l'aperçu.
    const ecrits = (r: ReturnType<typeof rend>) =>
      r.ctx.appels.filter((a) => a.nom === 'fillText').map((a) => a.args[0])
    expect(ecrits(sans()).length).toBeGreaterThan(4)
    expect(ecrits(nu).sort()).toEqual(['E', 'N', 'O', 'S'])
    expect(nu.sortie.labels).toHaveLength(0)
    // T-0316 — plus rien à désigner : ni étoile, ni marqueur d'objet, ni corps mobile.
    expect(sans().sortie.cibles.length).toBeGreaterThan(0)
    expect(nu.sortie.cibles).toHaveLength(0)

    // Un survol hérité du mode précédent ne peint rien non plus : `survol` survit au
    // basculement, et seul le mouvement de souris suivant l'efface.
    const cible = sans().sortie.cibles.find((c) => c.type === 'OBJET')
    expect(cible).toBeDefined()
    const survole = scene({ passeFile: () => undefined, survol: { cible: cible! } })
    expect(survole.sortie.revele).toBeNull()
    expect(ecrits(survole).sort()).toEqual(['E', 'N', 'O', 'S'])
  })
})

describe('couche Sol — §4.1', () => {
  const SOL: CouchesActives = { ...COUCHES, sol: true }
  /** Une crête relevée à l'est, l'horizon dégagé au nord. */
  const RELIEF = masqueDepuisPoints([
    { azimutDeg: 0, altitudeDeg: 0 },
    { azimutDeg: 90, altitudeDeg: 20 },
  ])

  it('ne trace rien sous l’horizon quand la visée plonge', () => {
    const vise = { azimutDeg: 180, hauteurDeg: -60 }
    const masque = rend({ couches: SOL, vise })
    const sans = rend({ couches: COUCHES, vise })
    expect(sans.sortie.etoilesDessinees).toBeGreaterThan(0)
    expect(masque.sortie.etoilesDessinees).toBe(0)
    // Rien de dessiné, rien de cliquable : les cibles naissent après la projection.
    expect(masque.sortie.cibles).toHaveLength(0)
    expect(sans.sortie.cibles.length).toBeGreaterThan(0)
  })

  it('ne remet à la passe de filé qu’un projecteur aveugle au sol (T-0116)', () => {
    // Visée plongeante : tout ce que le canevas montre est sous le sol. Aucune direction ne
    // doit se projeter, donc aucune trace ne peut y être peinte — le relief la masque avant
    // même qu'elle soit calculée.
    const refus = (couches: CouchesActives): { testes: number; refuses: number } => {
      let testes = 0
      let refuses = 0
      rend({
        couches,
        vise: { azimutDeg: 180, hauteurDeg: -60 },
        passeFile: (_ctx, proj) => {
          for (let xPx = 0; xPx <= LARGEUR; xPx += LARGEUR / 8) {
            for (let yPx = 0; yPx <= HAUTEUR; yPx += HAUTEUR / 8) {
              testes++
              if (proj.projette(proj.inverse(xPx, yPx)) === null) refuses++
            }
          }
        },
      })
      return { testes, refuses }
    }
    const avecSol = refus(SOL)
    expect(avecSol.testes).toBeGreaterThan(0)
    expect(avecSol.refuses).toBe(avecSol.testes)
    // Couche Sol éteinte, les mêmes directions se projettent : le test n'est pas vide.
    expect(refus(COUCHES).refuses).toBe(0)
  })

  it('coupe le ciel à l’horizon quand la visée le longe', () => {
    const vise = { azimutDeg: 180, hauteurDeg: 0 }
    const masque = rend({ couches: SOL, vise })
    const sans = rend({ couches: COUCHES, vise })
    expect(masque.sortie.etoilesDessinees).toBeGreaterThan(0)
    expect(masque.sortie.etoilesDessinees).toBeLessThan(sans.sortie.etoilesDessinees)
  })

  it('garde le cercle d’horizon et ses points cardinaux, eux ne se masquent pas', () => {
    const { ctx } = rend({ couches: SOL, vise: { azimutDeg: 180, hauteurDeg: 0 } })
    expect(ctx.appels.some((a) => a.nom === 'fillText' && a.args[0] === 'S')).toBe(true)
  })

  it('peint le sol plutôt que de compter sur le fond, et souligne sa crête', () => {
    const vise = { azimutDeg: 180, hauteurDeg: 0 }
    const { ctx } = rend({ couches: SOL, vise })
    // Un remplissage du chemin courant : les étoiles, elles, remplissent un `Path2D`. C'est
    // celui-là qui recouvre la largeur du trait de la bande de §3.7.
    expect(ctx.appels.some((a) => a.nom === 'fill' && a.args[0] === 'evenodd')).toBe(true)
    expect(ctx.couleurs).toContain(palette(false).sol)
    expect(ctx.appels.some((a) => a.nom === 'closePath')).toBe(true)
    // La crête est tracée après le remplissage, de la teinte de l'horizon.
    expect(ctx.couleurs).toContain(palette(false).horizon)
  })

  /**
   * Le sol tel que le canevas le REMPLIRAIT.
   *
   * Reconstruire les polygones ne suffit pas : `fill` applique sa règle à TOUS les sous-chemins
   * d'un même appel. Le test rejoue donc la règle annoncée — `evenodd` compte la parité des
   * traversées, `nonzero` la somme des enroulements, où deux orientations contraires
   * s'annulent. Sans cela, il déclarerait couvert un sol que l'écran montre troué.
   */
  interface Remplissage {
    readonly sousChemins: number[][]
    readonly parite: boolean
  }

  function remplissagesDuSol(ctx: ReturnType<typeof contexteEspion>): Remplissage[] {
    const groupes: Remplissage[] = []
    let sousChemins: number[][] = []
    let courant: number[] | null = null
    for (const appel of ctx.appels) {
      if (appel.nom === 'beginPath') {
        sousChemins = []
        courant = null
      } else if (appel.nom === 'moveTo') {
        courant = [appel.args[0] as number, appel.args[1] as number]
      } else if (appel.nom === 'lineTo' && courant !== null) {
        courant.push(appel.args[0] as number, appel.args[1] as number)
      } else if (appel.nom === 'closePath' && courant !== null) {
        sousChemins.push(courant)
        courant = null
      } else if (appel.nom === 'fill' && sousChemins.length > 0) {
        groupes.push({ sousChemins, parite: appel.args[0] === 'evenodd' })
      }
    }
    return groupes
  }

  /** Le point est-il peint par ce remplissage, selon la règle qu'il a annoncée ? */
  function couvertPar(remplissage: Remplissage, x: number, y: number): boolean {
    let enroulement = 0
    let traversees = 0
    for (const polygone of remplissage.sousChemins) {
      const n = polygone.length / 2
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygone[i * 2]!
        const yi = polygone[i * 2 + 1]!
        const xj = polygone[j * 2]!
        const yj = polygone[j * 2 + 1]!
        const cote = (xj - xi) * (y - yi) - (x - xi) * (yj - yi)
        if (yi <= y && yj > y && cote > 0) {
          enroulement++
          traversees++
        } else if (yj <= y && yi > y && cote < 0) {
          enroulement--
          traversees++
        }
      }
    }
    return remplissage.parite ? traversees % 2 === 1 : enroulement !== 0
  }

  /**
   * Les deux moitiés du contrat d'un masque, sur une grille de pixels : rien de découvert sous
   * le sol, rien de recouvert dans le ciel. La seconde est la plus facile à perdre — un sol qui
   * déborde efface la bande de §3.7, peinte avant lui, sans toucher aux étoiles peintes après :
   * le ciel devient noir sans que rien ne manque d'évident.
   *
   * Marge de deux degrés de part et d'autre de la crête : le polygone est inscrit sur la courbe,
   * et le comparer au grand cercle exact au pixel près n'aurait pas de sens.
   */
  function verifieCouverture(
    r: ReturnType<typeof rend>,
    contexte: string,
    pasPx: number,
  ): { sous: number; ciel: number } {
    const remplissages = remplissagesDuSol(r.ctx)
    const enterre = sousLeSol(r.entree.masque, r.entree.matriceCiel)
    const marge = 2
    let sous = 0
    let ciel = 0
    for (let x = 8; x < LARGEUR; x += pasPx) {
      for (let y = 8; y < HAUTEUR; y += pasPx) {
        const v = r.entree.projecteur.inverse(x, y)
        const hauteurDeg = versSpherique(applique(r.entree.matriceCiel, v)).latitudeDeg
        const couvert = remplissages.some((groupe) => couvertPar(groupe, x, y))
        if (enterre(v.x, v.y, v.z) && hauteurDeg < -marge) {
          sous++
          expect(couvert, `${contexte} : pixel ${x},${y} à découvert sous le sol`).toBe(true)
        } else if (!enterre(v.x, v.y, v.z) && hauteurDeg > marge) {
          ciel++
          expect(couvert, `${contexte} : pixel ${x},${y} recouvert dans le ciel`).toBe(false)
        }
      }
    }
    return { sous, ciel }
  }

  for (const cas of [
    { azimutDeg: 180, hauteurDeg: 0, fovDeg: 60, avecCiel: true },
    // Visée plongeante : plus un pixel de ciel à l'écran, il n'y a rien à ne pas recouvrir.
    { azimutDeg: 180, hauteurDeg: -30, fovDeg: 60, avecCiel: false },
    { azimutDeg: 180, hauteurDeg: 20, fovDeg: 120, avecCiel: true },
    { azimutDeg: 180, hauteurDeg: 30, fovDeg: 140, avecCiel: true },
    { azimutDeg: 180, hauteurDeg: 45, fovDeg: 160, avecCiel: true },
  ]) {
    const { fovDeg, avecCiel, ...vise } = cas
    it(`couvre le sol sans mordre le ciel, visée à ${vise.hauteurDeg}° sur ${fovDeg}°`, () => {
      const compte = verifieCouverture(
        rend({ couches: SOL, vise, fovDeg }),
        `visée ${vise.hauteurDeg}°`,
        40,
      )
      expect(compte.sous).toBeGreaterThan(0)
      if (avecCiel) expect(compte.ciel).toBeGreaterThan(0)
    })
  }

  it('ne troue ni ne déborde à aucune hauteur de visée', () => {
    // Le défaut rapporté ne se voyait qu'à CERTAINES hauteurs : l'antipode de la visée tombait
    // au milieu d'une maille, le sol débordait sur le ciel et la bande de §3.7 disparaissait.
    // La fenêtre fautive faisait deux ou trois degrés de large — un cas isolé la manque, et un
    // balayage grossier aussi. D'où le pas fin — et la scène réduite au seul sol : `dessineSol`
    // ne lit aucune autre couche, et peindre 141 fois étoiles et tracés dépassait le délai de
    // la CI sans rien vérifier de plus.
    const solSeul: CouchesActives = {
      figures: false,
      frontieres: false,
      asterismes: false,
      cadre: false,
      horizon: false,
      voieLactee: false,
      sol: true,
    }
    let sous = 0
    let ciel = 0
    for (let hauteurDeg = -88; hauteurDeg <= 88; hauteurDeg += 1.25) {
      const compte = verifieCouverture(
        rend({ couches: solSeul, etoiles: [], vise: { azimutDeg: 180, hauteurDeg }, fovDeg: 120 }),
        `visée ${hauteurDeg}°`,
        60,
      )
      sous += compte.sous
      ciel += compte.ciel
    }
    expect(sous).toBeGreaterThan(0)
    expect(ciel).toBeGreaterThan(0)
  })

  it('tient la visée au zénith, où le nadir n’est plus projetable', () => {
    // Cas dégénéré de la projection stéréographique : la visée au zénith envoie le nadir à
    // l'infini. Le balayage en espace écran n'en sait rien — c'est tout l'intérêt.
    const { sortie } = rend({ couches: SOL, vise: { azimutDeg: 180, hauteurDeg: 90 } })
    expect(sortie.etoilesDessinees).toBeGreaterThan(0)
  })

  it('épouse le relief relevé plutôt que l’horizon plat', () => {
    // Un point au-dessus de l'horizon plat mais SOUS la crête relevée : masqué par le relief,
    // découvert sans lui. Comparer des comptes d'appels ne dirait rien — c'est la position de
    // la frontière qui doit suivre le relief.
    const vise = { azimutDeg: 90, hauteurDeg: 20 }
    const hauteurCible = obstructionDeg(RELIEF, vise.azimutDeg) / 2
    const plat = rend({ couches: SOL, vise })
    const relief = rend({ couches: SOL, vise, masque: RELIEF })
    const cible = applique(
      transpose(relief.entree.matriceCiel),
      versVecteur(vise.azimutDeg, hauteurCible),
    )
    const p = relief.entree.projecteur.projette(cible)
    expect(p).not.toBeNull()
    const couvert = (r: ReturnType<typeof rend>): boolean =>
      remplissagesDuSol(r.ctx).some((groupe) => couvertPar(groupe, p!.xPx, p!.yPx))
    expect(couvert(relief)).toBe(true)
    expect(couvert(plat)).toBe(false)
  })

  it('laisse le cadrage visible par-dessus le sol', () => {
    // Cadre pointé sous l'horizon : filtré comme les étoiles, son contour disparaîtrait — et
    // la scène ne dirait plus où le matériel pointe (§3.5).
    const vise = { azimutDeg: 180, hauteurDeg: -60 }
    const apresLeSol = (r: ReturnType<typeof rend>) => {
      const sol = r.ctx.appels.findIndex((a) => a.nom === 'fill' && a.args[0] === 'evenodd')
      expect(sol).toBeGreaterThan(-1)
      return r.ctx.appels.slice(sol).filter((a) => a.nom === 'lineTo').length
    }
    const avec = apresLeSol(rend({ couches: { ...SOL, cadre: true }, vise }))
    const sans = apresLeSol(rend({ couches: { ...SOL, cadre: false }, vise }))
    expect(avec).toBeGreaterThan(sans)
  })
})

describe('corps mobiles — §3.1', () => {
  /** La Lune, posée à une hauteur et un azimut donnés. Le reste de la position ne sert pas ici. */
  function lune(azimutDeg: number, hauteurDeg: number): PositionCorps {
    return { corps: 'Moon' as PositionCorps['corps'], adH: 0, decDeg: 0, azimutDeg, hauteurDeg }
  }

  it('ignore un corps hors du canevas plutôt que de lui donner un label', () => {
    // Un corps derrière l'observateur reste projetable — et son label part avec la priorité la
    // plus haute de la scène. Sans test de canevas, il chassait un nom visible du budget §3.4.
    const vise = { azimutDeg: 180, hauteurDeg: 45 }
    const devant = rend({ vise, corps: [lune(vise.azimutDeg, vise.hauteurDeg)] })
    const derriere = rend({ vise, corps: [lune(0, -45)] })
    expect(devant.sortie.cibles.some((c) => c.type === 'CORPS')).toBe(true)
    expect(devant.sortie.labels.some((l) => l.texte === 'Lune')).toBe(true)
    expect(derriere.sortie.cibles.some((c) => c.type === 'CORPS')).toBe(false)
    expect(derriere.sortie.labels.some((l) => l.texte === 'Lune')).toBe(false)
  })

  it('écarte un corps sous le sol quand la couche Sol est active', () => {
    const vise = { azimutDeg: 180, hauteurDeg: 0 }
    const sousLHorizon = [lune(vise.azimutDeg, -10)]
    expect(
      rend({ vise, corps: sousLHorizon }).sortie.cibles.some((c) => c.type === 'CORPS'),
    ).toBe(true)
    expect(
      rend({ vise, corps: sousLHorizon, couches: { ...COUCHES, sol: true } }).sortie.cibles.some(
        (c) => c.type === 'CORPS',
      ),
    ).toBe(false)
  })
})

/**
 * T-0110 — l'écart des couches de repérage par calotte englobante.
 *
 * Les frontières, les figures et les astérismes sont une géométrie J2000 FIXE : elle ne bouge
 * ni au zoom ni au défilement. Avant T-0110, la passe projetait ses 1 400 sommets à chaque
 * image quel que soit le champ, pour n'en garder qu'une poignée en vue serrée — le défaut que
 * §3.7 avait déjà corrigé sur la bande, resté sur la couche d'à côté.
 *
 * Le test tient les deux bouts. Il ne suffit pas d'écarter beaucoup : il faut n'écarter QUE ce
 * qui ne peint pas. La référence est donc recalculée ici sans aucun écart, et la comparaison
 * porte sur les seuls segments qui touchent le canevas — ceux qui tombent au-delà du bord ne
 * posent pas de couleur, et les perdre n'est pas une régression.
 */
describe('écart des couches de repérage — T-0110', () => {
  const SEULES_FRONTIERES: CouchesActives = {
    figures: false,
    frontieres: true,
    asterismes: false,
    cadre: false,
    horizon: false,
    voieLactee: false,
    sol: false,
  }

  /** Seules les deux coordonnées écran comptent ici : le reste de `PointEcran` ne sert pas. */
  interface Sommet {
    readonly xPx: number
    readonly yPx: number
  }

  /** Un segment touche-t-il le canevas ? La demi-épaisseur du trait vaut 0,5 px. */
  const touche = (a: Sommet, b: Sommet): boolean =>
    Math.max(a.xPx, b.xPx) + 0.5 >= 0 &&
    Math.min(a.xPx, b.xPx) - 0.5 <= LARGEUR &&
    Math.max(a.yPx, b.yPx) + 0.5 >= 0 &&
    Math.min(a.yPx, b.yPx) - 0.5 <= HAUTEUR

  const cle = (a: Sommet, b: Sommet): string =>
    `${a.xPx.toFixed(3)},${a.yPx.toFixed(3)}>${b.xPx.toFixed(3)},${b.yPx.toFixed(3)}`

  /** Les segments réellement peints, relus dans les ordres enregistrés par l'espion. */
  function segmentsPeints(appels: readonly Appel[]): string[] {
    const segments: string[] = []
    let precedent: Sommet | null = null
    for (const appel of appels) {
      if (appel.nom === 'moveTo') {
        precedent = { xPx: appel.args[0] as number, yPx: appel.args[1] as number }
      } else if (appel.nom === 'lineTo') {
        const point: Sommet = { xPx: appel.args[0] as number, yPx: appel.args[1] as number }
        if (precedent !== null && touche(precedent, point)) segments.push(cle(precedent, point))
        precedent = point
      } else if (appel.nom === 'beginPath') {
        precedent = null
      }
    }
    return segments.sort()
  }

  /** La même passe SANS écart : la référence de ce qui aurait dû être peint. */
  function segmentsAttendus(entree: EntreeDessin): string[] {
    const segments: string[] = []
    for (const ligne of entree.frontieres.polylignes) {
      let precedent: Sommet | null = null
      for (const point of ligne) {
        const projete = entree.projecteur.projette(point)
        if (projete === null) {
          precedent = null
          continue
        }
        if (precedent !== null && touche(precedent, projete)) segments.push(cle(precedent, projete))
        precedent = projete
      }
    }
    return segments.sort()
  }

  const VISEES = [
    { azimutDeg: 0, hauteurDeg: 20 },
    { azimutDeg: 90, hauteurDeg: 60 },
    { azimutDeg: 180, hauteurDeg: 45 },
    { azimutDeg: 270, hauteurDeg: 5 },
  ] as const

  for (const fovDeg of [15, 60, 120, 180]) {
    for (const vise of VISEES) {
      it(`peint exactement les frontières visibles à ${fovDeg}° vers ${vise.azimutDeg}°/${vise.hauteurDeg}°`, () => {
        const { ctx, entree } = rend({ couches: SEULES_FRONTIERES, fovDeg, vise })
        expect(segmentsPeints(ctx.appels)).toEqual(segmentsAttendus(entree))
      })
    }
  }

  it('cesse de projeter la sphère entière dès que le champ se referme', () => {
    const serre = rend({ couches: SEULES_FRONTIERES, fovDeg: 15 })
    const sommets = (appels: readonly Appel[]): number =>
      appels.filter((a) => a.nom === 'moveTo' || a.nom === 'lineTo').length
    // La référence sans écart projette TOUTE la couche : c'est le coût d'avant T-0110. Le
    // seuil n'est pas un réglage — c'est le constat qu'un champ serré ne doit plus payer la
    // sphère entière, et il tomberait à 1 si l'écart disparaissait.
    const total = entierePolyligne(serre.entree)
    expect(sommets(serre.ctx.appels)).toBeLessThan(total / 4)
  })

  /** Le nombre de sommets que la couche entière représente, écart mis à part. */
  function entierePolyligne(entree: EntreeDessin): number {
    let n = 0
    for (const ligne of entree.frontieres.polylignes) n += ligne.length
    return n
  }
})

describe('§9.1 — T-0142, la carte de pose peinte dans le cadre', () => {
  /** Un grand-angle ouvert : la NPF y donne des poses de quelques dizaines de secondes. */
  const OPTIQUE: OptiquePose = { focaleMm: 24, ouvertureN: 2.8, pitchUm: 5.94 }

  /** Les textes de la passe, dans l'ordre où ils ont été peints. */
  function textes(ctx: ReturnType<typeof contexteEspion>): readonly string[] {
    return ctx.appels.filter((a) => a.nom === 'fillText').map((a) => String(a.args[0]))
  }

  const estPose = (texte: string): boolean => /^(∞|[\d.]+ s)$/.test(texte)
  const estDeclinaison = (texte: string): boolean => texte.startsWith('δ ')

  it('ne peint rien tant que l’optique n’est pas demandée', () => {
    const { ctx } = rend()
    expect(textes(ctx).some(estPose)).toBe(false)
    expect(textes(ctx).some(estDeclinaison)).toBe(false)
  })

  it('porte une pose et une déclinaison par cellule de la grille de §9.1', () => {
    const { ctx } = rend({ poseCadre: OPTIQUE })
    const cote = K('CELLULES_CARTE_POSE')
    const poses = textes(ctx).filter(estPose)
    expect(poses.length).toBe(cote * cote)
    const declinaisons = textes(ctx).filter(estDeclinaison)
    expect(declinaisons.length).toBe(cote * cote)
    // La grille couvre le cadre, elle ne répète pas son centre : sur 17° de champ, les
    // cellules ne tombent pas toutes sur la même déclinaison — c'est tout le propos de §9.1.
    expect(new Set(declinaisons).size).toBeGreaterThan(1)
  })

  it('masque ce qu’elle recouvre : le noir du cadre est peint après le dernier repère', () => {
    const { ctx } = rend({ poseCadre: OPTIQUE })
    const appels = ctx.appels
    const dernierRemplissage = appels.map((a) => a.nom).lastIndexOf('fill')
    const dernierRepere = appels.reduce(
      (dernier, appel, i) =>
        appel.nom === 'fillText' && !estPose(String(appel.args[0])) &&
        !estDeclinaison(String(appel.args[0]))
          ? i
          : dernier,
      -1,
    )
    expect(dernierRepere).toBeGreaterThan(-1)
    expect(dernierRemplissage).toBeGreaterThan(dernierRepere)
    expect(ctx.couleurs).toContain('#000000')
  })

  it('renonce plutôt que de masquer pour rien quand le cadre est trop petit à l’écran', () => {
    const { ctx } = rend({ poseCadre: OPTIQUE, fovDeg: 300 })
    expect(textes(ctx).some(estPose)).toBe(false)
  })

  it('n’écrit aucune composante verte ou bleue en mode nuit', () => {
    const { ctx } = rend({ poseCadre: OPTIQUE, modeNuit: true })
    for (const couleur of ctx.couleurs) {
      const rgb = couleur.match(/rgb\((\d+) (\d+) (\d+)\)/)
      if (rgb !== null) {
        expect(Number(rgb[2]), couleur).toBe(0)
        expect(Number(rgb[3]), couleur).toBe(0)
        continue
      }
      expect(couleur, couleur).toBe('#000000')
    }
  })
})

/**
 * §8.4 / T-0324 — la scène sous un parcours de pointage.
 *
 * L'assertion ne porte pas sur les ordres de tracé — le trajet en émet lui-même — mais sur les
 * TEINTES : chaque couche a la sienne, et une couche qui n'a rien peint n'a jamais posé sa
 * couleur sur le contexte. C'est la seule façon de dire « cette couche est absente » sans
 * dépendre de la géométrie du champ.
 */
describe('T-0324 — le parcours ne laisse que ce qui sert à le suivre', () => {
  const TEINTES = palette(false)
  const OBJET: ObjetCielProfond = {
    designation: 'NGC7000',
    nomsCommuns: 'Amérique du Nord',
    adDeg: CENTRE_VUE.longitudeDeg,
    decDeg: CENTRE_VUE.latitudeDeg,
    type: 'EMISSION',
    majAxArcmin: 120,
    minAxArcmin: 100,
    posAngDeg: null,
    vMag: 4,
    bMag: null,
    surfBr: null,
  }
  /** Trois étapes autour de la direction visée : elles tombent dans le canevas par construction. */
  const PARCOURS: ParcoursScene = {
    designation: OBJET.designation,
    etapes: [
      { ordre: 1, adH: CENTRE_VUE.longitudeDeg / 15 + 0.4, decDeg: CENTRE_VUE.latitudeDeg + 4, nom: 'Deneb' },
      { ordre: 2, adH: CENTRE_VUE.longitudeDeg / 15 + 0.2, decDeg: CENTRE_VUE.latitudeDeg + 2, nom: '' },
      { ordre: 3, adH: CENTRE_VUE.longitudeDeg / 15 + 0.1, decDeg: CENTRE_VUE.latitudeDeg + 1, nom: 'Sadr' },
    ],
    adCibleH: OBJET.adDeg / 15,
    decCibleDeg: OBJET.decDeg,
  }
  const COUCHES_TOUTES: CouchesActives = { ...COUCHES, sol: true }
  const options = {
    couches: COUCHES_TOUTES,
    objets: [OBJET],
    corps: [
      {
        corps: 'Moon' as unknown as PositionCorps['corps'],
        azimutDeg: 180,
        hauteurDeg: 45,
        adH: 0,
        decDeg: 0,
      } as PositionCorps,
    ],
  }

  it('efface les quatre couches de repérage, le sol et l’horizon', () => {
    const { ctx } = rend({ ...options, parcours: PARCOURS })
    for (const absente of [
      TEINTES.figures,
      TEINTES.frontieres,
      TEINTES.asterismes,
      TEINTES.voieLactee,
      TEINTES.sol,
      TEINTES.horizon,
      TEINTES.corps,
    ]) {
      expect(ctx.couleurs).not.toContain(absente)
    }
  })

  it('efface les marqueurs du ciel profond', () => {
    const { ctx } = rend({ ...options, parcours: PARCOURS })
    const teintesObjet = teintesObjets(false, false, SB_PLANCHER_NATUREL)[OBJET.type]
    expect(ctx.couleurs).not.toContain(teintesObjet.bord)
    expect(ctx.couleurs).not.toContain(teintesObjet.coeur)
  })

  it('garde le cadre matériel : c’est la seule échelle de distance qui reste', () => {
    const { ctx } = rend({ ...options, parcours: PARCOURS })
    expect(ctx.couleurs).toContain(TEINTES.cadre)
  })

  it('garde le cadre même quand le rail l’a éteint', () => {
    const { ctx } = rend({
      ...options,
      couches: { ...COUCHES_TOUTES, cadre: false },
      parcours: PARCOURS,
    })
    expect(ctx.couleurs).toContain(TEINTES.cadre)
  })

  it('peint le trajet en tirets, et le nomme', () => {
    const { ctx } = rend({ ...options, parcours: PARCOURS })
    expect(ctx.couleurs).toContain(TEINTES.parcours)
    const tirets = ctx.appels.filter((a) => a.nom === 'setLineDash')
    expect(tirets.some((a) => (a.args[0] as number[]).length > 0)).toBe(true)
    const textes = ctx.appels.filter((a) => a.nom === 'fillText').map((a) => a.args[0])
    expect(textes).toContain('1 · Deneb')
    expect(textes).toContain('2 · sans nom')
    expect(textes).toContain(OBJET.designation)
  })

  it('garde les étoiles de fond, mais atténuées', () => {
    const nu = rend(options)
    const avec = rend({ ...options, parcours: PARCOURS })
    // Les étoiles sont toujours peintes : la scène dépouillée dit encore où l'on regarde.
    expect(avec.sortie.etoilesDessinees).toBe(nu.sortie.etoilesDessinees)
    expect(avec.ctx.opacitesRemplies).toContain(OPACITE_ETOILE_PARCOURS)
    expect(nu.ctx.opacitesRemplies).not.toContain(OPACITE_ETOILE_PARCOURS)
  })

  it('ne laisse rien à désigner : ce qui n’est pas peint ne se survole pas', () => {
    const { sortie } = rend({ ...options, parcours: PARCOURS })
    expect(sortie.cibles).toHaveLength(0)
    expect(sortie.labels).toHaveLength(0)
  })

  it('reste rouge pur en mode nuit, canaux vert et bleu nuls', () => {
    const { ctx } = rend({ ...options, parcours: PARCOURS, modeNuit: true })
    for (const couleur of ctx.couleurs) {
      const m = /rgb\((\d+) (\d+) (\d+)\)/.exec(couleur)
      if (m === null) continue
      expect(Number(m[2])).toBe(0)
      expect(Number(m[3])).toBe(0)
    }
  })
})

/**
 * T-0324 — la carte du plan et le rail restent montés quel que soit l'onglet : ouvrir un
 * parcours en ciel profond puis basculer en panorama amenait les deux modes sur la même image.
 * Aucun des deux ne prévoit l'autre, et le résultat — un aperçu de filé au cadre forcé visible,
 * au sol forcé invisible, avec un trajet en tirets par-dessus — n'était voulu par personne.
 */
describe('T-0324 — l’aperçu §9.5 l’emporte sur le parcours', () => {
  const TEINTES = palette(false)
  const PARCOURS: ParcoursScene = {
    designation: 'NGC7000',
    etapes: [
      {
        ordre: 1,
        adH: CENTRE_VUE.longitudeDeg / 15 + 0.2,
        decDeg: CENTRE_VUE.latitudeDeg + 2,
        nom: 'Deneb',
      },
    ],
    adCibleH: CENTRE_VUE.longitudeDeg / 15,
    decCibleDeg: CENTRE_VUE.latitudeDeg,
  }
  const COUCHES_TOUTES: CouchesActives = { ...COUCHES, sol: true }
  /** Une passe de filé qui ne peint rien : sa seule présence suffit à déclarer l'aperçu. */
  const APERCU = () => {}

  it('ne peint aucun trajet sous l’aperçu', () => {
    const { ctx } = rend({
      couches: COUCHES_TOUTES,
      passeFile: APERCU,
      parcours: PARCOURS,
    })
    expect(ctx.couleurs).not.toContain(TEINTES.parcours)
  })

  it('laisse l’aperçu strictement identique à ce qu’il est sans parcours', () => {
    const seul = rend({ couches: COUCHES_TOUTES, passeFile: APERCU })
    const avec = rend({ couches: COUCHES_TOUTES, passeFile: APERCU, parcours: PARCOURS })
    expect(avec.ctx.couleurs).toEqual(seul.ctx.couleurs)
    expect(avec.ctx.appels.map((a) => a.nom)).toEqual(seul.ctx.appels.map((a) => a.nom))
    expect(avec.ctx.opacitesRemplies).toEqual(seul.ctx.opacitesRemplies)
  })

  it('garde le sol et l’horizon que l’aperçu, lui, conserve', () => {
    const { ctx } = rend({
      couches: COUCHES_TOUTES,
      passeFile: APERCU,
      parcours: PARCOURS,
    })
    expect(ctx.couleurs).toContain(TEINTES.sol)
    expect(ctx.couleurs).toContain(TEINTES.horizon)
  })
})

describe('repère de la cible ouverte — T-0283', () => {
  const textes = (r: ReturnType<typeof rend>) =>
    r.ctx.appels.filter((a) => a.nom === 'fillText').map((a) => a.args[0])

  it('marque la cible ouverte et la nomme, une seule fois', () => {
    const r = rend({ objets: [OBJET_AU_CENTRE], cibleOuverte: OBJET_AU_CENTRE })
    expect(r.sortie.repere?.texte).toBe(OBJET_AU_CENTRE.designation)
    expect(textes(r).filter((t) => t === OBJET_AU_CENTRE.designation)).toHaveLength(1)
  })

  it('tient à grand champ, où le nom de l’objet serait masqué', () => {
    const r = rend({ objets: [], cibleOuverte: OBJET_AU_CENTRE, fovDeg: 180 })
    expect(r.sortie.repere).not.toBeNull()
    expect(textes(r)).toContain(OBJET_AU_CENTRE.designation)
  })

  it('marque aussi une cible trop faible pour le plafond des marqueurs', () => {
    const faible = { ...OBJET_AU_CENTRE, vMag: null }
    expect(rend({ objets: [faible], cibleOuverte: faible }).sortie.repere).not.toBeNull()
  })

  it('ne marque rien sans cible ouverte, ni hors du champ', () => {
    expect(rend({ objets: [OBJET_AU_CENTRE] }).sortie.repere).toBeNull()
    const dos = rend({ cibleOuverte: OBJET_AU_CENTRE, vise: { azimutDeg: 0, hauteurDeg: -45 } })
    expect(dos.sortie.repere).toBeNull()
  })
})
