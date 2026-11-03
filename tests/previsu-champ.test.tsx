/**
 * §9.2 — fixed-star field preview ≠ map: bright stars at real catalogue positions; background past
 * threshold generated + declared; density follows galactic latitude; Voie lactée fades with site
 * fond de ciel; same frame twice → identical render.
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
import { construitIndex, magnitudePourEffectif } from '../src/core/index-ciel.ts'
import { axePoleDeDate, cielInstantane, epoqueAnnee } from '../src/core/horloges.ts'
import { versVecteur } from '../src/core/mat3.ts'
import { arcEtoile, arcInvisible, arcsVisibles } from '../src/core/file-etoiles.ts'
import { projecteur, type Vue } from '../src/core/projection.ts'
import { dessineChamp, tableMagParZ, type EntreeDessinChamp } from '../src/ui/dessine-champ.ts'
import { PanneauFile, type PanneauFileProps } from '../src/ui/PanneauFile.tsx'
import {
  etatSeance,
  majFile,
  planDeSeance,
  posePoseMaxCadre,
  reinitialiseSeance,
} from '../src/ui/seance-etat.ts'
import { K } from '../src/registry/constants.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const DATE = new Date('2026-08-15T22:00:00Z')
const SECONDES_PAR_MINUTE = 60
const LARGEUR = 800
const HAUTEUR = 600
const AXE_POLE = axePoleDeDate(epoqueAnnee(DATE))
/** Full seed, built once per file. */
const SEMIS = semisGeneratif()
const INDEX_SEMIS = construitIndex(SEMIS)

interface Appel {
  readonly nom: string
  readonly args: readonly unknown[]
}

/** Instrumented 2D context: records, doesn't paint. */
/** `Path2D` absent outside browsers: pass only needs `moveTo` + `arc`. */
class Path2DEspion {
  readonly arcs: unknown[][] = []
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

/** Star discs = arcs in filled `Path2D`s (T-0119). */
function arcsDeDisques(ctx: { appels: Appel[] }): unknown[][] {
  return ctx.appels
    .filter((a) => a.nom === 'fill' && a.args[0] instanceof Path2DEspion)
    .flatMap((a) => (a.args[0] as Path2DEspion).arcs)
}

/** Traces = vertices in STROKED `Path2D`s. */
function traces(ctx: { appels: Appel[] }): Path2DEspion[] {
  return ctx.appels
    .filter((a) => a.nom === 'stroke' && a.args[0] instanceof Path2DEspion)
    .map((a) => a.args[0] as Path2DEspion)
}

/** Opacities read from colours: since T-0119 opacity is IN the colour (stars share a path). */
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

/** Reference wide-angle: 10 mm f/2.8, Bortle 4.5. */
const PROFONDEUR: EntreeProfondeur = {
  tPoseS: 25,
  dMm: 10 / 2.8,
  zpSys: K('ZP_SYS_GENERIQUE'),
  eCielPxS: 1.68,
  readNoiseE: 1.5,
}

/** §9.3 reference setup as panel props. */
const PROPS_PANNEAU: PanneauFileProps = {
  site: SITE,
  focaleMm: 10,
  ouvertureN: 2.8,
  pitchUm: 5.12,
  capteurLMm: 35.9,
  capteurHMm: 23.9,
  fovLDeg: 121.7,
  fovHDeg: 100.2,
  tailleRawMo: 33,
  modeObjectif: 'MODE_CADRE',
}

const CIEL = cielInstantane(SITE, DATE)
/** T-0115 — exact circle exists only in stereographic: where rejection applies. */
const VUE_PLANETARIUM: Vue = { ...VUE, mode: 'MODE_PLANETARIUM', fovDeg: 180 }
const PROJECTEUR = projecteur(VUE, CIEL.matrice)
const PROJECTEUR_PLANETARIUM = projecteur(VUE_PLANETARIUM, CIEL.matrice)

/** Star at frame centre: checks rendered position. */
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
    tacheArcsec: 105.6,
    sbSiteMag: 21.0,
    suiviActif: false,
    dureeS: 1,
    couvertureMax: null,
    effectifMax: null,
    axePoleNord: AXE_POLE,
    modeNuit: false,
    ...options,
  })
  return { ctx, sortie }
}

describe('§9.2 — coordonnées galactiques', () => {
  it('place le centre galactique et le pôle nord galactique où ils sont', () => {
    // Sagittarius A*, J2000: 266.405° / −28.936°.
    expect(latitudeGalactiqueDeg(versVecteur(266.405, -28.936))).toBeCloseTo(0, 1)
    expect(
      latitudeGalactiqueDeg(
        versVecteur(K('POLE_GALACTIQUE_AD_DEG'), K('POLE_GALACTIQUE_DEC_DEG')),
      ),
    ).toBeCloseTo(90, 6)
  })

  it('module la densité par la latitude galactique', () => {
    expect(densite(0)).toBeCloseTo(1, 6)
    // One decay scale away: 1/e of plane density.
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
    // Without modulation no Voie lactée band.
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
    // Suivi: no trail, star = disc at catalogue position.
    const { ctx, sortie } = rend({ suiviActif: true })
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
      // Fond de ciel flux ≈ §7.1 law, fixed pitch + aperture.
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

  // Native arc with end angle ≈ start may be mis-normalised by browser raster (loops, stray
  // strokes); under tolerated sagitta the chord IS the arc.
  it('trace en cordes les arcs courts d’une pose brève, jamais en arc natif', () => {
    const { ctx } = rend({
      projecteur: projecteur(VUE_PLANETARIUM, CIEL.matrice),
      dureeS: 2,
    })
    const tracees = traces(ctx)
    expect(tracees.flatMap((t) => t.sommets).length).toBeGreaterThan(0)
    expect(tracees.flatMap((t) => t.arcs)).toHaveLength(0)
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
    // Squared relative radius law: mid-field = ¼ corner attenuation.
    expect(vignettageDiaph(0.5).value).toBeCloseTo(K('VIGNETTAGE_COINS_DIAPH') / 4, 6)
  })
})

describe('§9 — le panneau du filé', () => {
  it('compose les quatre features sur un seul pointage', () => {
    const html = renderToStaticMarkup(createElement(PanneauFile, PROPS_PANNEAU))
    // T-0142 — pose map reads in the frame; panel carries only the toggle.
    expect(html).toContain('Afficher la pose maximale dans le cadre')
    expect(html).not.toContain('carte-pose')
    // T-0374 — one input: shooting time, + what it prescribes.
    expect(html.match(/role="slider"/g)).toHaveLength(1)
    expect(html).toContain('Temps de prise de vue')
    expect(html).toContain('max étoiles comme des points')
    expect(html).not.toContain('type="number"')
    expect(html).not.toContain('Profondeur d’une pose')
    expect(html).toContain('<h2>Temps de prise de vue</h2>')
    expect(html).toContain('Longueur d’arc')
    expect(html).toContain('Séquence de filé')
    // T-0174 — règle des 500 gone: a reference no calculation uses doesn't sit beside deciding
    // values.
    expect(html).not.toContain('Règle des 500')
    // Rappel batterie replaces numeric budget: duration, not battery count.
    expect(html).toContain('Attention à la batterie')
  })
})

describe('§9.3 — T-0119, le filé plafonne la surface peinte', () => {
  /** Long duration: separates surface cap from headcount cap. */
  const FILE_LONG = { dureeS: K('DUREE_FILE_SPECTACULAIRE_MIN') * 60, magLimite: K('SEMIS_MAG_MAX') }

  /**
   * Target = GUIDELINE: cap reaches it by estimate (mean density, floor stroke width, overlaps
   * uncounted). Must hold: coverage same order as target; factor = estimate margin.
   */
  const MARGE_CIBLE = 2

  it('borne la surface peinte, pas l’effectif : le plafond ramène la couverture à la consigne', () => {
    // T-0119: without cap the pass paints canvas several times; with it, back to target order (also
    // long filé, where star-count budget failed). T-0400 — very dark sky: background over whole
    // pose unitaire dims faint traces; under reference sky pass no longer overflows enough for cap
    // to bite. Here it must.
    const noir = { ...FILE_LONG, profondeur: { ...PROFONDEUR, eCielPxS: PROFONDEUR.eCielPxS / 10 } }
    const sansPlafond = rend({ ...noir, couvertureMax: null })
    expect(sansPlafond.sortie.couverturePeinte).toBeGreaterThan(1)
    const cible = K('COUVERTURE_TRACES_MAX')
    const plafonne = rend({ ...noir, couvertureMax: cible })
    expect(plafonne.sortie.couverturePeinte).toBeLessThan(cible * MARGE_CIBLE)
    expect(plafonne.sortie.couverturePeinte).toBeLessThan(sansPlafond.sortie.couverturePeinte)
  })

  it('tient la même surface peinte quelle que soit la durée du filé', () => {
    // T-0118 star budget failed this invariance: capped headcount → painted area grows with
    // duration → image closes on itself.
    const cible = K('COUVERTURE_TRACES_MAX')
    const durees = [K('DUREE_FILE_LISIBLE_MIN'), K('DUREE_FILE_SPECTACULAIRE_MIN'), 480]
    for (const dureeMin of durees) {
      const sortie = rend({ ...FILE_LONG, dureeS: dureeMin * 60, couvertureMax: cible }).sortie
      expect(sortie.couverturePeinte).toBeLessThan(cible * MARGE_CIBLE)
    }
  })

  it('tient la même surface peinte quelle que soit l’inclinaison de la visée', () => {
    // Pole trap: CENTRE trace tiny there (cos δ → 0) while field holds rest of sky; cap reading arc
    // length at centre collapses (1 241 % coverage measured), same scene near horizon stays capped.
    const cible = K('COUVERTURE_TRACES_MAX')
    const visee = (hauteurDeg: number, azimutDeg: number) =>
      rend({
        ...FILE_LONG,
        couvertureMax: cible,
        projecteur: projecteur({ ...VUE_PLANETARIUM, hauteurDeg, azimutDeg }, CIEL.matrice),
      }).sortie.couverturePeinte
    // Pole at centre, equator to east, intermediate aim.
    for (const [hauteurDeg, azimutDeg] of [
      [SITE.latitudeDeg, 0],
      [10, 90],
      [40, 180],
    ] as const) {
      expect(visee(hauteurDeg, azimutDeg)).toBeLessThan(cible * MARGE_CIBLE)
    }
  })

  it('lit moins d’étoiles plafonné qu’à profondeur pleine', () => {
    // `etoilesVisitees` = what cap targets: READ, hence paid.
    const sansPlafond = rend({ ...FILE_LONG, couvertureMax: null })
    const plafonne = rend({ ...FILE_LONG, couvertureMax: K('COUVERTURE_TRACES_MAX') })
    expect(plafonne.sortie.etoilesVisitees).toBeLessThan(sansPlafond.sortie.etoilesVisitees)
  })

  it('écarte le semis avant le catalogue réel : le ciel reconnaissable part en dernier', () => {
    // Spend order: tight cap cuts whole seed, keeps catalogue.
    const serre = rend({ ...FILE_LONG, couvertureMax: 1e-6 })
    expect(serre.sortie.etoilesGenerees).toBe(0)
    const large = rend({ ...FILE_LONG, couvertureMax: null })
    expect(large.sortie.etoilesGenerees).toBeGreaterThan(0)
  })

  it('borne aussi ce que la passe LIT, pas seulement ce qu’elle peint', () => {
    // 2nd cap, 2nd quantity: short filé paints little per trace → coverage allows tens of
    // thousands, cost runs away; cost cap bounds headcount read regardless.
    const bref = rend({
      magLimite: K('SEMIS_MAG_MAX'),
      dureeS: K('DUREE_FILE_LISIBLE_MIN'),
      couvertureMax: K('COUVERTURE_TRACES_MAX'),
      effectifMax: K('EFFECTIF_CIEL_MAX_APERCU'),
    })
    expect(bref.sortie.etoilesVisitees).toBeLessThanOrEqual(K('EFFECTIF_CIEL_MAX_APERCU'))
  })

  it('borne l’aperçu de champ par le coût seul, jamais par la couverture', () => {
    // §9.2 — pose preview shows POINTS: no overlap/length → no coverage to bound; cost = READING
    // catalogue at full depth, only headcount cap removes it.
    const sansPlafond = rend({ magLimite: K('SEMIS_MAG_MAX'), effectifMax: null })
    const champ = rend({
      magLimite: K('SEMIS_MAG_MAX'),
      effectifMax: K('EFFECTIF_CIEL_MAX_APERCU'),
    })
    expect(sansPlafond.sortie.etoilesVisitees).toBeGreaterThan(K('EFFECTIF_CIEL_MAX_APERCU'))
    expect(champ.sortie.etoilesVisitees).toBeLessThanOrEqual(K('EFFECTIF_CIEL_MAX_APERCU'))
    // Coverage never bit: points don't fill canvas.
    expect(sansPlafond.sortie.couverturePeinte).toBeLessThan(K('COUVERTURE_TRACES_MAX'))
  })

  it('ne plafonne rien du tout sans aucune consigne', () => {
    // Both `null`: bench reference, must reproduce earlier image.
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

  it('retire la logistique de séquence quand le temps tient en une photo', () => {
    const html = () => renderToStaticMarkup(createElement(PanneauFile, PROPS_PANNEAU))
    try {
      // §9.4, T-0374 — below frame pose max, shooting time = single photo: nothing to pace; section
      // ABSENT.
      majFile({ dureeTotaleS: DOMAINES.duree_prise_vue_s.min })
      expect(html()).not.toContain('Séquence de filé')

      majFile({ dureeTotaleS: K('DUREE_FILE_SPECTACULAIRE_MIN') * SECONDES_PAR_MINUTE })
      expect(html()).toContain('Séquence de filé')
    } finally {
      reinitialiseSeance()
    }
  })

  it('avertit des étoiles étirées entre la pose max et un filé lisible, pas avant ni après', () => {
    const html = () => renderToStaticMarkup(createElement(PanneauFile, PROPS_PANNEAU))
    try {
      majFile({ dureeTotaleS: DOMAINES.duree_prise_vue_s.min })
      expect(html()).not.toContain('étoiles étirées')
      // Beyond pose max, under readable filé: neither points nor arcs.
      majFile({ dureeTotaleS: (K('DUREE_FILE_LISIBLE_MIN') * SECONDES_PAR_MINUTE) / 2 })
      expect(html()).toContain('étoiles étirées')
      majFile({ dureeTotaleS: K('DUREE_FILE_LISIBLE_MIN') * SECONDES_PAR_MINUTE })
      expect(html()).not.toContain('étoiles étirées')
    } finally {
      reinitialiseSeance()
    }
  })

  it('bascule de la photo au filé à la pose max du cadre', () => {
    try {
      // Time + pose max decide mode. Single photo poses whole shooting time; beyond, pose = filé's
      // (C-36 high).
      const poseMax = K('T_POSE_FILE_MAX_S') * 2
      posePoseMaxCadre(poseMax)
      majFile({ dureeTotaleS: poseMax })
      const photo = planDeSeance(etatSeance())
      expect(photo.mode).toBe('CHAMP')
      expect(photo.tPoseS.value).toBe(poseMax)

      majFile({ dureeTotaleS: poseMax + 1 })
      const file = planDeSeance(etatSeance())
      expect(file.mode).toBe('FILE')
      expect(file.tPoseS.value).toBe(K('T_POSE_FILE_MAX_S'))
      expect(file.intervalleS.value).toBe(K('INTERVALLE_INTER_POSE_FILE_MAX_S'))
    } finally {
      reinitialiseSeance()
    }
  })
})

describe('§9.3 — un arc hors du canevas n’est pas peint', () => {
  /** Very fine sweep: no point may fall inside canvas. */
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
    // Rejection rests on bounding box = PROOF; dense sweep confronts it. Visible point in rejected
    // arc = trace erased.
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
    // Valid only if it actually rejected and kept arcs.
    expect(rejetes).toBeGreaterThan(0)
    expect(gardes).toBeGreaterThan(0)
  })

  it('ne rejette jamais une polyligne : elle se borne déjà elle-même', () => {
    // Rectilinear: arc ≠ circle, breaks path at canvas edge → no box to test.
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

  /** All exact circles of a star sample, stereographic projection. */
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
    // Each sweep point INSIDE canvas must be covered by a kept portion; uncovered visible point =
    // vanished trace.
    // Count accumulated, checked once: `expect` per sample = millions of calls → timeout.
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
          // Clipping exact at crossings; between them a kept point is inside.
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
        // Same sense as sweep: reversed portion traces backwards.
        expect(Math.sign(p.balayageRad)).toBe(Math.sign(c.balayageRad))
        expect(debut).toBeGreaterThan(avanceePrecedente)
        avanceePrecedente = debut
      }
    }
  })

  it('rend le balayage entier, en un seul ordre, quand le cercle tient dans le canevas', () => {
    // Small circle at canvas centre: nothing to clip.
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
    // One magnitude-5 star, 2 h filé, same sky: wide-angle pixel sees it 7 s, tele <1 s.
    // T-0400 — background accumulates over whole pose unitaire: magnitude 7 no longer stands out.
    const seule = (tacheArcsec: number) =>
      rend({
        dureeS: 7200,
        tacheArcsec,
        indexReel: construitIndex([etoileAuCentre(5)]),
        indexSemis: construitIndex([]),
      })

    const grandAngle = opacites(seule(105.6).ctx)
    const teleobjectif = opacites(seule(8.8).ctx)
    expect(grandAngle.length).toBeGreaterThan(0)
    expect(teleobjectif[0]!).toBeLessThan(grandAngle[0]!)
  })

  it('étire l’affichage en racine du rapport signal sur bruit, saturation comprise', () => {
    // A star far above threshold saturates the render.
    expect(opaciteEtoile(2, 10)).toBe(1)
    // At detection threshold: trace visible but faint.
    expect(opaciteEtoile(10, 10)).toBeCloseTo(
      Math.sqrt(K('SNR_DETECTION_PREVISU') / K('SNR_RENDU_SATURATION')),
      6,
    )
    // Magnitude below threshold: 2.5× fainter still.
    expect(opaciteEtoile(11, 10)).toBeLessThan(opaciteEtoile(10, 10))
  })
})

/**
 * T-0116 — pass no longer paints its background: planetarium already painted real fond de ciel
 * (pollution, horizon/lunar halo, crépuscule §3.7); a flat fill would erase it. Traces only.
 */
describe('T-0116 — la passe de filé n’a pas de fond à elle', () => {
  it('ne remplit aucune surface pleine', () => {
    const { ctx } = rend()
    expect(ctx.appels.some((a) => a.nom === 'fillRect')).toBe(false)
  })

  it('ne peint aucune bande galactique : celle du planétarium reste la seule', () => {
    // Band used to paint filled polygons (fill of CURRENT path) + `fillRect` background. Since
    // T-0119 stars fill a shared `Path2D`, colour carries opacity: FORM of the order tells them
    // apart. No fill without a named path.
    const { ctx } = rend()
    const surfaces = ctx.appels.filter(
      (a) => a.nom === 'fillRect' || (a.nom === 'fill' && !(a.args[0] instanceof Path2DEspion)),
    )
    expect(surfaces).toHaveLength(0)
  })
})

describe('T-0401 — la circumpolaire garde plus d’étoiles sous le plafond de couverture', () => {
  // Trace sweeps an arc in cos δ: near pole it paints little; T-0119's single cutoff (cut for
  // equator) emptied the sky there.
  const effectif = INDEX_SEMIS.nombreEtoiles / 100
  const derniere = (table: Float64Array) => table[table.length - 1]!
  const equateur = (table: Float64Array) => table[table.length / 2]!

  it('descend plus profond près du pôle qu’à l’équateur céleste, à budget égal', () => {
    const table = tableMagParZ(INDEX_SEMIS, { couverture: effectif, max: Infinity }, 0, Infinity)
    expect(equateur(table)).toBe(magnitudePourEffectif(INDEX_SEMIS, effectif))
    expect(derniere(table)).toBeGreaterThan(equateur(table))
    expect(table[0]!).toBe(derniere(table))
  })

  it('ne compense pas le plafond de coût : il compte des étoiles lues, pas une surface', () => {
    const table = tableMagParZ(INDEX_SEMIS, { couverture: Infinity, max: effectif }, 0, Infinity)
    expect(derniere(table)).toBe(equateur(table))
  })

  it('ne dépasse jamais le plafond de la couche', () => {
    const plafond = magnitudePourEffectif(INDEX_SEMIS, effectif)
    const table = tableMagParZ(INDEX_SEMIS, { couverture: effectif, max: Infinity }, 0, plafond)
    expect(Math.max(...table)).toBe(plafond)
  })
})

describe('T-0400 — la Lune voile le filé, plus fort près d’elle', () => {
  const centre = PROJECTEUR.inverse(PROJECTEUR.centreXPx, PROJECTEUR.centreYPx)
  const lune = (anglePhaseDeg: number) => ({
    direction: centre,
    verticale: centre,
    altitudeDeg: 60,
    anglePhaseDeg,
    sbSiteMag: 21,
  })
  const peintes = (options: Partial<EntreeDessinChamp>) => {
    const { sortie } = rend({ indexReel: INDEX_SEMIS, magLimite: 14, dureeS: 600, ...options })
    return sortie.etoilesReelles + sortie.etoilesGenerees
  }

  it('une Lune dans le champ éteint des traces', () => {
    expect(peintes({ lune: lune(10) })).toBeLessThan(peintes({}))
  })

  it('un croissant en éteint moins qu’une Lune presque pleine', () => {
    expect(peintes({ lune: lune(10) })).toBeLessThan(peintes({ lune: lune(140) }))
  })

  it('sans Lune, rien ne change', () => {
    expect(peintes({ lune: null })).toBe(peintes({}))
  })
})
