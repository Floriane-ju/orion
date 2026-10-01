/**
 * §9.2 — Prévisualisation de champ à étoiles fixes.
 *
 * Ce qui est vérifié ici est ce qui distingue une prévisualisation d'une carte : les étoiles
 * brillantes sont aux positions réelles du catalogue, le fond au-delà du seuil est généré et
 * déclaré comme tel, sa densité suit la latitude galactique, la bande de la Voie lactée
 * s'efface avec le fond de ciel du site, et le même cadre régénéré deux fois donne exactement
 * le même rendu.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Etoile } from '../src/data/catalog.ts'
import { semisGeneratif } from '../src/data/semis.ts'
import {
  densite,
  latitudeGalactiqueDeg,
  magnitudeLimitePrevisu,
  opaciteEtoile,
  vignettageDiaph,
  type EntreeProfondeur,
} from '../src/core/galactique.ts'
import { construitIndex } from '../src/core/index-ciel.ts'
import { axePoleDeDate, cielInstantane, epoqueAnnee } from '../src/core/horloges.ts'
import { versVecteur } from '../src/core/mat3.ts'
import { arcEtoile, arcInvisible, arcsVisibles } from '../src/core/file-etoiles.ts'
import { projecteur, type Vue } from '../src/core/projection.ts'
import { dessineChamp, type EntreeDessinChamp } from '../src/ui/dessine-champ.ts'
import { pointZeroSysteme } from '../src/data/equipment.ts'
import { PanneauFile, type PanneauFileProps } from '../src/ui/PanneauFile.tsx'
import { dureeApercuMin, etatSeance, majFile, reinitialiseSeance } from '../src/ui/seance-etat.ts'
import { K } from '../src/registry/constants.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const DATE = new Date('2026-08-15T22:00:00Z')
const SECONDES_PAR_MINUTE = 60
const LARGEUR = 800
const HAUTEUR = 600
const AXE_POLE = axePoleDeDate(epoqueAnnee(DATE))
/** Le semis complet est produit une fois pour tout le fichier : il ne dépend d'aucun réglage. */
const SEMIS = semisGeneratif()
const INDEX_SEMIS = construitIndex(SEMIS)

interface Appel {
  readonly nom: string
  readonly args: readonly unknown[]
}

/** Contexte 2D instrumenté : il enregistre, il ne peint pas. */
/** `Path2D` n'existe pas hors navigateur : la passe n'en attend que `moveTo` et `arc`. */
class Path2DEspion {
  readonly arcs: unknown[][] = []
  /** Sommets d'une polyligne : `moveTo` ouvre, `lineTo` prolonge. */
  readonly sommets: unknown[][] = []
  moveTo(...args: unknown[]): void {
    this.sommets.push(args)
  }
  arc(...args: unknown[]): void {
    this.arcs.push(args)
  }
  lineTo(...args: unknown[]): void {
    this.sommets.push(args)
  }
}
;(globalThis as unknown as { Path2D: unknown }).Path2D = Path2DEspion

/** Les disques d'étoiles sont les arcs déposés dans les `Path2D` remplis par la passe (T-0119). */
function arcsDeDisques(ctx: { appels: Appel[] }): unknown[][] {
  return ctx.appels
    .filter((a) => a.nom === 'fill' && a.args[0] instanceof Path2DEspion)
    .flatMap((a) => (a.args[0] as Path2DEspion).arcs)
}

/** Les traces sont les sommets déposés dans les `Path2D` TRACÉS, largeur de trait par chemin. */
function traces(ctx: { appels: Appel[] }): Path2DEspion[] {
  return ctx.appels
    .filter((a) => a.nom === 'stroke' && a.args[0] instanceof Path2DEspion)
    .map((a) => a.args[0] as Path2DEspion)
}

/**
 * Opacités appliquées, lues dans les couleurs : depuis T-0119 l'opacité est DANS la couleur, pour
 * qu'une étoile puisse rejoindre un chemin partagé au lieu d'exiger son propre ordre de tracé.
 */
function opacites(ctx: { couleurs: string[] }): number[] {
  return ctx.couleurs.map((c) => {
    const trouve = /\/ ([\d.]+)\)$/.exec(c)
    return trouve === null ? 1 : Number(trouve[1])
  })
}

function contexteEspion() {
  const appels: Appel[] = []
  const enregistre =
    (nom: string) =>
    (...args: unknown[]) => {
      appels.push({ nom, args })
    }
  const couleurs: string[] = []
  const alphas: number[] = []
  let alpha = 1
  return {
    appels,
    couleurs,
    /** Opacités successivement appliquées : c'est la brillance de rendu de chaque étoile. */
    alphas,
    set globalAlpha(v: number) {
      alpha = v
      alphas.push(v)
    },
    get globalAlpha() {
      return alpha
    },
    lineWidth: 1,
    lineCap: 'butt',
    set fillStyle(v: unknown) {
      couleurs.push(String(v))
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
    stroke: enregistre('stroke'),
    fill: enregistre('fill'),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  }
}

const VUE: Vue = {
  mode: 'MODE_CADRE',
  fovDeg: 100,
  largeurPx: LARGEUR,
  hauteurPx: HAUTEUR,
  azimutDeg: 180,
  hauteurDeg: 40,
  rotationDeg: 0,
}

/** Setup grand angle de référence : 10 mm f/2,8 sous un ciel Bortle 4,5. */
const PROFONDEUR: EntreeProfondeur = {
  tPoseS: 25,
  dMm: 10 / 2.8,
  zpSys: K('ZP_SYS_GENERIQUE'),
  eCielPxS: 1.68,
  readNoiseE: 1.5,
}

/** Le setup grand angle de référence de §9.3, en props du panneau. */
const PROPS_PANNEAU: PanneauFileProps = {
  site: SITE,
  focaleMm: 10,
  ouvertureN: 2.8,
  pitchUm: 5.12,
  capteurLMm: 35.9,
  capteurHMm: 23.9,
  fovLDeg: 121.7,
  fovHDeg: 100.2,
  echApx: 105.6,
  tailleRawMo: 33,
  profondeur: { ...PROFONDEUR, zpEstime: true },
  zeroSysteme: pointZeroSysteme(null),
  modeObjectif: 'MODE_CADRE',
}

const CIEL = cielInstantane(SITE, DATE)
/** T-0115 — le cercle exact n'existe qu'en stéréographique : c'est là que le rejet s'applique. */
const VUE_PLANETARIUM: Vue = { ...VUE, mode: 'MODE_PLANETARIUM', fovDeg: 180 }
const PROJECTEUR = projecteur(VUE, CIEL.matrice)
const PROJECTEUR_PLANETARIUM = projecteur(VUE_PLANETARIUM, CIEL.matrice)

/** Étoile placée exactement au centre du cadre, pour vérifier la position rendue. */
function etoileAuCentre(magV = 2): Etoile {
  const centre = PROJECTEUR.inverse(LARGEUR / 2, HAUTEUR / 2)
  const lon = (Math.atan2(centre.y, centre.x) * 180) / Math.PI
  const lat = (Math.asin(centre.z) * 180) / Math.PI
  return { adDeg: lon, decDeg: lat, magV, bv: 0.5 }
}

function rend(options: Partial<EntreeDessinChamp> = {}) {
  const ctx = contexteEspion()
  const sortie = dessineChamp({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    projecteur: PROJECTEUR,
    indexReel: construitIndex([etoileAuCentre()]),
    indexSemis: INDEX_SEMIS,
    magLimite: 10,
    profondeur: PROFONDEUR,
    echApx: 105.6,
    suiviActif: false,
    vueRealiste: false,
    sbCiel: 21.0,
    dureeS: 1,
    couvertureMax: null,
    effectifMax: null,
    latitudeDeg: SITE.latitudeDeg,
    axePoleNord: AXE_POLE,
    modeNuit: false,
    ...options,
  })
  return { ctx, sortie }
}

describe('§9.2 — coordonnées galactiques', () => {
  it('place le centre galactique et le pôle nord galactique où ils sont', () => {
    // Sagittarius A*, J2000 : 266,405° / −28,936°.
    expect(latitudeGalactiqueDeg(versVecteur(266.405, -28.936))).toBeCloseTo(0, 1)
    expect(
      latitudeGalactiqueDeg(
        versVecteur(K('POLE_GALACTIQUE_AD_DEG'), K('POLE_GALACTIQUE_DEC_DEG')),
      ),
    ).toBeCloseTo(90, 6)
  })

  it('module la densité par la latitude galactique', () => {
    expect(densite(0)).toBeCloseTo(1, 6)
    // À une échelle de décroissance, il ne reste que 1/e de la densité du plan.
    expect(densite(K('ECHELLE_LATITUDE_GALACTIQUE_DEG'))).toBeCloseTo(1 / Math.E, 6)
    expect(densite(-60)).toBeLessThan(densite(-10))
  })
})

describe('§9.2 — semis génératif', () => {
  const semis = SEMIS

  it('concentre les étoiles générées dans le plan galactique', () => {
    const proche = semis.filter(
      (e) => Math.abs(latitudeGalactiqueDeg(versVecteur(e.adDeg, e.decDeg))) < 10,
    ).length
    const loin = semis.filter(
      (e) => Math.abs(latitudeGalactiqueDeg(versVecteur(e.adDeg, e.decDeg))) > 40,
    ).length
    // Sans cette modulation, la bande de la Voie lactée n'apparaîtrait pas.
    expect(proche).toBeGreaterThan(loin)
  })

  it('ne génère aucune étoile plus brillante que le seuil catalographié', () => {
    const seuil = K('SEUIL_MAG_ETOILES_REELLES')
    const magnitudes = semis.map((e) => e.magV)
    expect(magnitudes.reduce((a, b) => Math.min(a, b))).toBeGreaterThanOrEqual(seuil)
    expect(magnitudes.reduce((a, b) => Math.max(a, b))).toBeLessThanOrEqual(K('SEMIS_MAG_MAX'))
  })

  it('rend deux fois le même cadre à l’identique — graine déterministe', () => {
    const premier = rend().ctx.appels
    const second = rend().ctx.appels
    expect(second.length).toBe(premier.length)
    expect(JSON.stringify(second)).toBe(JSON.stringify(premier))
  })
})

describe('§9.2 — les trois couches', () => {
  it('trace l’étoile réelle à la position exacte du catalogue', () => {
    const { ctx, sortie } = rend()
    expect(sortie.etoilesReelles).toBe(1)
    const centre = arcsDeDisques(ctx).find(
      (a) =>
        Math.abs((a[0] as number) - LARGEUR / 2) < 1 &&
        Math.abs((a[1] as number) - HAUTEUR / 2) < 1,
    )
    expect(centre).toBeDefined()
  })

  it('compose les couches 2 et 3 même quand aucune étoile réelle n’est dans le champ', () => {
    const { sortie } = rend({ indexReel: construitIndex([]) })
    expect(sortie.etoilesReelles).toBe(0)
    expect(sortie.etoilesGenerees).toBeGreaterThan(0)
  })

  it('s’arrête au catalogue réel tant que la pose ne descend pas sous le seuil', () => {
    const { sortie } = rend({ magLimite: K('SEUIL_MAG_ETOILES_REELLES') })
    expect(sortie.etoilesGenerees).toBe(0)
  })

})

describe('§9.2 — modulation par les paramètres de capture', () => {
  const profondeur = (tPoseS: number, sbCiel: number, dMm: number) =>
    magnitudeLimitePrevisu({
      tPoseS,
      dMm,
      zpSys: K('ZP_SYS_GENERIQUE'),
      // Flux de fond de ciel approché par la même loi que §7.1, à pitch et ouverture fixés.
      eCielPxS: K('BASE_MAGNITUDE') ** (-(sbCiel - K('ZP_SYS_GENERIQUE')) / K('POGSON')) * (5.12 / 2.8) ** 2,
      readNoiseE: 1.5,
    }).value

  it('descend plus profond avec une pose plus longue', () => {
    expect(profondeur(60, 21, 3.57)).toBeGreaterThan(profondeur(15, 21, 3.57))
  })

  it('descend moins profond sous un ciel pollué', () => {
    expect(profondeur(25, 18.5, 3.57)).toBeLessThan(profondeur(25, 21.5, 3.57))
  })

  it('descend plus profond avec une pupille plus grande', () => {
    expect(profondeur(25, 21, 20)).toBeGreaterThan(profondeur(25, 21, 3.57))
  })

  it('ovalise les étoiles quand la pose est longue : la trace devient une polyligne', () => {
    const ponctuel = rend({ dureeS: 1 })
    const file = rend({ dureeS: 600 })
    expect(arcsDeDisques(ponctuel.ctx).length).toBeGreaterThan(0)
    const tracees = traces(file.ctx)
    expect(tracees.length).toBeGreaterThan(0)
    expect(tracees.flatMap((t) => t.sommets).length).toBeGreaterThan(0)
  })

  it('assombrit les coins et laisse le centre intact', () => {
    expect(vignettageDiaph(0).value).toBe(0)
    expect(vignettageDiaph(1).value).toBeCloseTo(K('VIGNETTAGE_COINS_DIAPH'), 6)
    // Loi en carré du rayon relatif : à mi-champ, le quart de l'atténuation des coins.
    expect(vignettageDiaph(0.5).value).toBeCloseTo(K('VIGNETTAGE_COINS_DIAPH') / 4, 6)
  })
})

describe('§9 — le panneau du filé', () => {
  it('compose les quatre features sur un seul pointage', () => {
    const html = renderToStaticMarkup(createElement(PanneauFile, PROPS_PANNEAU))
    // T-0142 — la carte de pose se lit dans le cadre : le panneau n'en porte que la bascule.
    expect(html).toContain('Afficher la pose maximale dans le cadre')
    expect(html).not.toContain('carte-pose')
    expect(html).toContain('Prévisualisation de champ')
    expect(html).toContain('Filé d’étoiles')
    expect(html).toContain('Séquence de filé')
    // T-0174 — la règle des 500 ne s'affiche plus : un repère qu'aucun calcul ne retient
    // n'a pas sa place à côté des valeurs qui décident.
    expect(html).not.toContain('Règle des 500')
    // Le rappel batterie remplace le budget chiffré : une durée, pas un nombre de batteries.
    expect(html).toContain('Attention à la batterie')
  })
})

describe('§9.3 — T-0119, le filé plafonne la surface peinte', () => {
  /** Longue durée : c'est elle qui distingue un plafond de surface d'un plafond d'effectif. */
  const FILE_LONG = { dureeS: K('DUREE_FILE_SPECTACULAIRE_MIN') * 60, magLimite: K('SEMIS_MAG_MAX') }

  /**
   * La cible est une CONSIGNE, pas une borne dure : le plafond l'atteint par une estimation —
   * densité moyenne du ciel, largeur de trait plancher, recouvrements non comptés. Ce qui doit
   * être vrai est que la couverture reste du même ordre que la consigne, quelle que soit la
   * scène. Ce facteur est la marge dans laquelle l'estimation doit tenir.
   */
  const MARGE_CIBLE = 2

  it('borne la surface peinte, pas l’effectif : le plafond ramène la couverture à la consigne', () => {
    // Le critère de T-0119. Sans plafond la passe peint plusieurs fois le canevas ; avec, elle
    // revient à l'ordre de la consigne — et c'est vrai d'un filé long, là où un budget d'étoiles
    // lâchait.
    const sansPlafond = rend({ ...FILE_LONG, couvertureMax: null })
    expect(sansPlafond.sortie.couverturePeinte).toBeGreaterThan(1)
    const cible = K('COUVERTURE_TRACES_MAX')
    const plafonne = rend({ ...FILE_LONG, couvertureMax: cible })
    expect(plafonne.sortie.couverturePeinte).toBeLessThan(cible * MARGE_CIBLE)
    expect(plafonne.sortie.couverturePeinte).toBeLessThan(sansPlafond.sortie.couverturePeinte)
  })

  it('tient la même surface peinte quelle que soit la durée du filé', () => {
    // L'invariance que le budget d'étoiles de T-0118 ne tenait pas : à effectif plafonné, la
    // surface peinte croît avec la durée, donc l'image se referme sur elle-même au filé long.
    const cible = K('COUVERTURE_TRACES_MAX')
    const durees = [K('DUREE_FILE_LISIBLE_MIN'), K('DUREE_FILE_SPECTACULAIRE_MIN'), 480]
    for (const dureeMin of durees) {
      const sortie = rend({ ...FILE_LONG, dureeS: dureeMin * 60, couvertureMax: cible }).sortie
      expect(sortie.couverturePeinte).toBeLessThan(cible * MARGE_CIBLE)
    }
  })

  it('tient la même surface peinte quelle que soit l’inclinaison de la visée', () => {
    // Le pôle est le cas qui piège : la trace du CENTRE y est minuscule, cos δ tendant vers zéro,
    // alors que le champ contient tout le reste du ciel. Un plafond qui lit la longueur d'arc au
    // centre du champ s'y effondre — 1 241 % de couverture mesurés — et la même scène visée près
    // de l'horizon reste, elle, correctement plafonnée.
    const cible = K('COUVERTURE_TRACES_MAX')
    const visee = (hauteurDeg: number, azimutDeg: number) =>
      rend({
        ...FILE_LONG,
        couvertureMax: cible,
        projecteur: projecteur({ ...VUE_PLANETARIUM, hauteurDeg, azimutDeg }, CIEL.matrice),
      }).sortie.couverturePeinte
    // Pôle céleste au centre, puis l'équateur céleste à l'est, puis une visée intermédiaire.
    for (const [hauteurDeg, azimutDeg] of [
      [SITE.latitudeDeg, 0],
      [10, 90],
      [40, 180],
    ] as const) {
      expect(visee(hauteurDeg, azimutDeg)).toBeLessThan(cible * MARGE_CIBLE)
    }
  })

  it('lit moins d’étoiles plafonné qu’à profondeur pleine', () => {
    // C'est `etoilesVisitees` que le plafond vise : ce qui est LU, donc ce qui est payé.
    const sansPlafond = rend({ ...FILE_LONG, couvertureMax: null })
    const plafonne = rend({ ...FILE_LONG, couvertureMax: K('COUVERTURE_TRACES_MAX') })
    expect(plafonne.sortie.etoilesVisitees).toBeLessThan(sansPlafond.sortie.etoilesVisitees)
  })

  it('écarte le semis avant le catalogue réel : le ciel reconnaissable part en dernier', () => {
    // L'ordre de dépense. Un plafond serré coupe tout le semis et garde encore le catalogue.
    const serre = rend({ ...FILE_LONG, couvertureMax: 1e-6 })
    expect(serre.sortie.etoilesGenerees).toBe(0)
    const large = rend({ ...FILE_LONG, couvertureMax: null })
    expect(large.sortie.etoilesGenerees).toBeGreaterThan(0)
  })

  it('borne aussi ce que la passe LIT, pas seulement ce qu’elle peint', () => {
    // Deuxième plafond, deuxième grandeur. Un filé court peint peu par trace : la couverture
    // seule en autorise des dizaines de milliers, et le coût repart. Le plafond de coût borne
    // l'effectif lu, quelle que soit la couverture que l'image aurait tolérée.
    const bref = rend({
      magLimite: K('SEMIS_MAG_MAX'),
      dureeS: K('DUREE_FILE_LISIBLE_MIN'),
      couvertureMax: K('COUVERTURE_TRACES_MAX'),
      effectifMax: K('EFFECTIF_CIEL_MAX_APERCU'),
    })
    expect(bref.sortie.etoilesVisitees).toBeLessThanOrEqual(K('EFFECTIF_CIEL_MAX_APERCU'))
  })

  it('borne l’aperçu de champ par le coût seul, jamais par la couverture', () => {
    // §9.2 — l'aperçu de pose montre des POINTS : rien ne se recouvre, aucune longueur ne se lit,
    // donc aucune couverture à borner. Ce qui coûtait était de LIRE le catalogue à pleine
    // profondeur, et c'est cela seul que le plafond d'effectif retire.
    const sansPlafond = rend({ magLimite: K('SEMIS_MAG_MAX'), effectifMax: null })
    const champ = rend({
      magLimite: K('SEMIS_MAG_MAX'),
      effectifMax: K('EFFECTIF_CIEL_MAX_APERCU'),
    })
    expect(sansPlafond.sortie.etoilesVisitees).toBeGreaterThan(K('EFFECTIF_CIEL_MAX_APERCU'))
    expect(champ.sortie.etoilesVisitees).toBeLessThanOrEqual(K('EFFECTIF_CIEL_MAX_APERCU'))
    // La couverture, elle, n'a jamais mordu : les points ne remplissent pas le canevas.
    expect(sansPlafond.sortie.couverturePeinte).toBeLessThan(K('COUVERTURE_TRACES_MAX'))
  })

  it('ne plafonne rien du tout sans aucune consigne', () => {
    // Les deux à `null` : le cas de référence du banc, celui qui doit reproduire l'image d'avant.
    const sansConsigne = rend({ ...FILE_LONG, couvertureMax: null, effectifMax: null })
    const plafonne = rend({ ...FILE_LONG, couvertureMax: K('COUVERTURE_TRACES_MAX') })
    expect(sansConsigne.sortie.etoilesVisitees).toBeGreaterThan(K('EFFECTIF_CIEL_MAX_APERCU'))
    expect(plafonne.sortie.etoilesVisitees).toBeLessThan(sansConsigne.sortie.etoilesVisitees)
  })

  it('laisse l’aperçu de champ intact — même image deux fois', () => {
    const premier = rend({ magLimite: K('SEMIS_MAG_MAX'), couvertureMax: null }).ctx.appels
    const second = rend({ magLimite: K('SEMIS_MAG_MAX'), couvertureMax: null }).ctx.appels
    expect(JSON.stringify(second)).toBe(JSON.stringify(premier))
  })

  it('retire la logistique de séquence quand la durée du filé est nulle', () => {
    const html = () => renderToStaticMarkup(createElement(PanneauFile, PROPS_PANNEAU))
    try {
      // §9.4 — à durée nulle l'aperçu ne décrit qu'une photo : il n'y a rien à cadencer. La
      // section est ABSENTE, pas affichée à zéro — un compteur à zéro se lit comme un budget
      // calculé, donc comme un résultat.
      majFile({ dureeTotaleMin: 0 })
      expect(html()).not.toContain('Séquence de filé')

      majFile({ dureeTotaleMin: K('DUREE_FILE_SPECTACULAIRE_MIN') })
      expect(html()).toContain('Séquence de filé')
    } finally {
      reinitialiseSeance()
    }
  })

  it('accumule la pose unitaire quand la durée du filé est nulle', () => {
    try {
      // Le mode ne se choisit plus : la durée le décide. Et une photo unique n'accumule pas
      // rien — elle accumule sa pose, donc l'arc lu au panneau est celui de cette pose, pas
      // zéro. Le peintre et le diagnostic lisent cette même durée.
      majFile({ dureeTotaleMin: 0 })
      const { file } = etatSeance()
      expect(dureeApercuMin(file) * SECONDES_PAR_MINUTE).toBeCloseTo(file.tPoseS, 9)

      majFile({ dureeTotaleMin: K('DUREE_FILE_SPECTACULAIRE_MIN') })
      expect(dureeApercuMin(etatSeance().file)).toBe(K('DUREE_FILE_SPECTACULAIRE_MIN'))
    } finally {
      reinitialiseSeance()
    }
  })
})

describe('§9.3 — un arc hors du canevas n’est pas peint', () => {
  /** Balayage échantillonné très finement : aucun point ne doit tomber dans le canevas. */
  const aucunPointVisible = (
    cercle: { xPx: number; yPx: number; rayonPx: number; debutRad: number; balayageRad: number },
    margePx: number,
  ): boolean => {
    const pas = 4000
    for (let i = 0; i <= pas; i++) {
      const a = cercle.debutRad + (cercle.balayageRad * i) / pas
      const x = cercle.xPx + cercle.rayonPx * Math.cos(a)
      const y = cercle.yPx + cercle.rayonPx * Math.sin(a)
      if (
        x >= -margePx &&
        y >= -margePx &&
        x <= VUE_PLANETARIUM.largeurPx + margePx &&
        y <= VUE_PLANETARIUM.hauteurPx + margePx
      ) {
        return false
      }
    }
    return true
  }

  it('ne rejette que des arcs dont aucun point ne touche le canevas', () => {
    // Le rejet se fonde sur la boîte englobante, donc sur une PREUVE ; ce test le confronte à
    // un échantillonnage dense du balayage. Un seul point visible dans un arc rejeté serait
    // une trace effacée à l'écran.
    let rejetes = 0
    let gardes = 0
    for (const etoile of SEMIS.slice(0, 4000)) {
      const v = versVecteur(etoile.adDeg, etoile.decDeg)
      const arc = arcEtoile(PROJECTEUR_PLANETARIUM, v, 480, AXE_POLE)
      if (arc.cercle === null) continue
      const marge = 2
      if (arcInvisible(arc, VUE_PLANETARIUM, marge)) {
        rejetes++
        expect(aucunPointVisible(arc.cercle, marge)).toBe(true)
      } else {
        gardes++
      }
    }
    // Le test ne vaut que s'il a effectivement rejeté et gardé des arcs.
    expect(rejetes).toBeGreaterThan(0)
    expect(gardes).toBeGreaterThan(0)
  })

  it('ne rejette jamais une polyligne : elle se borne déjà elle-même', () => {
    // En projection rectilinéaire l'arc n'est pas un cercle : il rompt son tracé au bord du
    // canevas, et n'a donc pas de boîte à tester.
    const arc = arcEtoile(PROJECTEUR, versVecteur(0, 80), 480, AXE_POLE)
    expect(arc.cercle).toBeNull()
    expect(arc.boite).toBeNull()
    expect(arcInvisible(arc, VUE, 1)).toBe(false)
  })
})

describe('§9.3 — le balayage est découpé sur le bord du canevas', () => {
  const MARGE = 2
  const dedans = (x: number, y: number, marge: number): boolean =>
    x >= -marge &&
    y >= -marge &&
    x <= VUE_PLANETARIUM.largeurPx + marge &&
    y <= VUE_PLANETARIUM.hauteurPx + marge

  /** Tous les cercles exacts d'un échantillon d'étoiles, en projection stéréographique. */
  const cercles = () => {
    const sortie = []
    for (const etoile of SEMIS.slice(0, 800)) {
      const arc = arcEtoile(
        PROJECTEUR_PLANETARIUM,
        versVecteur(etoile.adDeg, etoile.decDeg),
        480,
        AXE_POLE,
      )
      if (arc.cercle !== null) sortie.push(arc.cercle)
    }
    return sortie
  }

  it('garde tout ce qui est visible : aucune trace n’est effacée', () => {
    // Le sens du test : pour chaque point du balayage qui tombe DANS le canevas, une portion
    // gardée doit le couvrir. Un point visible non couvert serait une trace disparue.
    // Le comptage est cumulé et vérifié une fois : un `expect` par échantillon coûterait des
    // millions d'appels et ferait expirer le test au lieu de le faire échouer.
    const pas = 600
    let visibles = 0
    let manques = 0
    for (const c of cercles()) {
      const portions = arcsVisibles(c, VUE_PLANETARIUM, MARGE)
      for (let i = 0; i <= pas; i++) {
        const t = (c.balayageRad * i) / pas
        const a = c.debutRad + t
        if (!dedans(c.xPx + c.rayonPx * Math.cos(a), c.yPx + c.rayonPx * Math.sin(a), 0)) continue
        visibles++
        const avancee = Math.abs(t)
        const couvert = portions.some((p) => {
          const debut = Math.abs(p.debutRad - c.debutRad)
          return avancee >= debut - 1e-9 && avancee <= debut + Math.abs(p.balayageRad) + 1e-9
        })
        if (!couvert) manques++
      }
    }
    expect(visibles).toBeGreaterThan(0)
    expect(manques).toBe(0)
  })

  it('ne garde rien d’invisible : la marge du demi-trait est la seule tolérance', () => {
    const pas = 200
    let verifies = 0
    let fautifs = 0
    for (const c of cercles()) {
      for (const p of arcsVisibles(c, VUE_PLANETARIUM, MARGE)) {
        for (let i = 1; i < pas; i++) {
          const a = p.debutRad + (p.balayageRad * i) / pas
          const x = c.xPx + c.rayonPx * Math.cos(a)
          const y = c.yPx + c.rayonPx * Math.sin(a)
          // Le découpage est exact aux franchissements ; entre eux, un point gardé est dedans.
          if (!dedans(x, y, MARGE)) fautifs++
          verifies++
        }
      }
    }
    expect(verifies).toBeGreaterThan(0)
    expect(fautifs).toBe(0)
  })

  it('ne sort jamais du balayage demandé, et ne se chevauche pas', () => {
    for (const c of cercles()) {
      const portions = arcsVisibles(c, VUE_PLANETARIUM, MARGE)
      let avanceePrecedente = -1
      for (const p of portions) {
        const debut = (p.debutRad - c.debutRad) / (c.balayageRad < 0 ? -1 : 1)
        expect(debut).toBeGreaterThanOrEqual(-1e-9)
        expect(debut + Math.abs(p.balayageRad)).toBeLessThanOrEqual(Math.abs(c.balayageRad) + 1e-9)
        // Même sens de rotation que le balayage : une portion inversée tracerait à l'envers.
        expect(Math.sign(p.balayageRad)).toBe(Math.sign(c.balayageRad))
        expect(debut).toBeGreaterThan(avanceePrecedente)
        avanceePrecedente = debut
      }
    }
  })

  it('rend le balayage entier, en un seul ordre, quand le cercle tient dans le canevas', () => {
    // Un petit cercle au centre du canevas : rien à découper.
    const c = {
      xPx: VUE_PLANETARIUM.largeurPx / 2,
      yPx: VUE_PLANETARIUM.hauteurPx / 2,
      rayonPx: 40,
      debutRad: 0.3,
      balayageRad: 2,
    }
    const portions = arcsVisibles(c, VUE_PLANETARIUM, MARGE)
    expect(portions).toHaveLength(1)
    expect(portions[0]!.debutRad).toBeCloseTo(c.debutRad, 9)
    expect(portions[0]!.balayageRad).toBeCloseTo(c.balayageRad, 9)
  })

  it('ne rend rien quand le cercle est tout entier hors du canevas', () => {
    const c = { xPx: -9000, yPx: -9000, rayonPx: 40, debutRad: 0, balayageRad: 2 }
    expect(arcsVisibles(c, VUE_PLANETARIUM, MARGE)).toHaveLength(0)
  })
})

describe('§9.3 — une trace est moins brillante qu’un point', () => {
  it('pâlit la trace d’une même étoile quand la focale étale son flux sur plus de pixels', () => {
    // Une seule étoile de magnitude 7, deux heures de filé, même ciel : au grand angle chaque
    // pixel la voit sept secondes, au téléobjectif moins d'une seconde.
    const seule = (echApx: number) =>
      rend({
        dureeS: 7200,
        echApx,
        indexReel: construitIndex([etoileAuCentre(7)]),
        indexSemis: construitIndex([]),
      })

    const grandAngle = opacites(seule(105.6).ctx)
    const teleobjectif = opacites(seule(8.8).ctx)
    expect(grandAngle.length).toBeGreaterThan(0)
    expect(teleobjectif[0]!).toBeLessThan(grandAngle[0]!)
  })

  it('étire l’affichage en racine du rapport signal sur bruit, saturation comprise', () => {
    // Une étoile très au-dessus du seuil sature le rendu.
    expect(opaciteEtoile(2, 10)).toBe(1)
    // Au seuil de détection, la trace est visible mais faible.
    expect(opaciteEtoile(10, 10)).toBeCloseTo(
      Math.sqrt(K('SNR_DETECTION_PREVISU') / K('SNR_RENDU_SATURATION')),
      6,
    )
    // Une magnitude sous le seuil : deux fois et demie plus pâle encore.
    expect(opaciteEtoile(11, 10)).toBeLessThan(opaciteEtoile(10, 10))
  })
})

/**
 * T-0116 — la passe ne peint plus son propre fond. Le planétarium a déjà peint le vrai fond de
 * ciel du site — pollution lumineuse, halo d'horizon, halo lunaire, crépuscule (§3.7) — et un
 * aplat par-dessus l'effacerait. Ce que la passe ajoute, ce sont les traces, rien d'autre.
 */
describe('T-0116 — la passe de filé n’a pas de fond à elle', () => {
  it('ne remplit aucune surface pleine, vue réaliste comprise', () => {
    for (const vueRealiste of [false, true]) {
      const { ctx } = rend({ vueRealiste, sbCiel: 19.4 })
      expect(ctx.appels.some((a) => a.nom === 'fillRect')).toBe(false)
    }
  })

  it('ne peint aucune bande galactique : celle du planétarium reste la seule', () => {
    // La bande se peignait en polygones remplis — un remplissage du chemin COURANT, et un
    // `fillRect` pour le fond. Depuis T-0119 les étoiles remplissent un `Path2D` partagé, et leur
    // couleur porte l'opacité : c'est donc la FORME de l'ordre qui distingue les deux, pas la
    // couleur. Aucun remplissage sans chemin nommé ne sort plus de la passe.
    const { ctx } = rend({ sbCiel: 21.5 })
    const surfaces = ctx.appels.filter(
      (a) => a.nom === 'fillRect' || (a.nom === 'fill' && !(a.args[0] instanceof Path2DEspion)),
    )
    expect(surfaces).toHaveLength(0)
  })
})
