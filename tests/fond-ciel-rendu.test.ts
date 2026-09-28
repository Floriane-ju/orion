/**
 * T-0097, T-0098, T-0100 — le fond du ciel peint en vue réaliste.
 *
 * Trois choses se vérifient ici, et elles ne se remplacent pas :
 *
 *   1. le MODÈLE — les brillances s'additionnent en nanolamberts, le profil de van Rhijn est
 *      celui de la formule, la Lune sous l'horizon n'ajoute rien ;
 *   2. le CONTRAT D'AFFICHAGE — la table de couleurs annoncée par T-0097, à 1/255 près ;
 *   3. la COMPOSITION — le halo passe sous le sol, la Lune est centrée sur la Lune, et le
 *      mode nuit ne peint rien.
 */

import { describe, expect, it } from 'vitest'
import { cielInstantane } from '../src/core/horloges.ts'
import { projecteur, type Vue } from '../src/core/projection.ts'
import type { Site } from '../src/core/ephem.ts'
import { versVecteur } from '../src/core/mat3.ts'
import {
  brillanceLuneNl,
  deltaSbLune,
  nanolamberts,
  sbCielAvecLune,
  type GeometrieLune,
} from '../src/core/moon.ts'
import {
  bornesPaliersHalo,
  composantesFond,
  facteurHaloHorizon,
  hauteurRepresentative,
  luminanceEcran,
  sbDepuisNanolamberts,
  sbEffectifRendu,
  vanRhijn,
} from '../src/core/fond-ciel-rendu.ts'
import { interpoleBortle, SB_PLANCHER_NATUREL } from '../src/registry/bortle.ts'
import { K } from '../src/registry/constants.ts'
import {
  LUMINANCE_FOND_REFERENCE,
  fondRealiste,
  luminanceRelative,
  palette,
  paletteRealiste,
  paletteScene,
  rapportContraste,
} from '../src/ui/couleurs.ts'
import { dessineHaloHorizon, dessineHaloLune, type LuneEcran } from '../src/ui/dessine-fond-ciel.ts'

const SITE: Site = { latitudeDeg: 46.391, longitudeDeg: 6.697, altitudeM: 500 }
const DATE = new Date('2026-08-15T22:00:00Z')
const LARGEUR = 960
const HAUTEUR = 540
const ZENITH_DEG = 90

function vue(options: Partial<Vue> = {}): Vue {
  return {
    mode: 'MODE_PLANETARIUM',
    fovDeg: 60,
    largeurPx: LARGEUR,
    hauteurPx: HAUTEUR,
    azimutDeg: 180,
    hauteurDeg: 45,
    rotationDeg: 0,
    ...options,
  }
}

interface Degrade {
  readonly centreX: number
  readonly centreY: number
  readonly rayon: number
  readonly crans: [number, string][]
  addColorStop(offset: number, couleur: string): void
}

/** Contexte 2D instrumenté : il enregistre le remplissage et sa couleur, il ne peint pas. */
function contexteEspion() {
  const remplissages: { nom: string; couleur: unknown }[] = []
  const degrades: Degrade[] = []
  let style: unknown = ''
  const espion = {
    remplissages,
    degrades,
    lineWidth: 1,
    font: '',
    textBaseline: '',
    globalAlpha: 1,
    set fillStyle(v: unknown) {
      style = v
    },
    get fillStyle(): unknown {
      return style
    },
    set strokeStyle(v: unknown) {
      style = v
    },
    get strokeStyle(): unknown {
      return style
    },
    fillRect: () => remplissages.push({ nom: 'fillRect', couleur: style }),
    fill: () => remplissages.push({ nom: 'fill', couleur: style }),
    stroke: () => remplissages.push({ nom: 'stroke', couleur: style }),
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fillText: () => {},
    setLineDash: () => {},
    createRadialGradient(_x0: number, _y0: number, _r0: number, x1: number, y1: number, r1: number) {
      const degrade: Degrade = {
        centreX: x1,
        centreY: y1,
        rayon: r1,
        crans: [],
        addColorStop(offset: number, couleur: string) {
          this.crans.push([offset, couleur])
        },
      }
      degrades.push(degrade)
      return degrade
    },
  }
  return espion
}

const ctxDe = (espion: ReturnType<typeof contexteEspion>): CanvasRenderingContext2D =>
  espion as unknown as CanvasRenderingContext2D

/** Composantes d'une couleur `rgb(r v b)` ou `rgb(r v b / a)`. */
function canaux(couleur: string): readonly [number, number, number] {
  const m = /^rgb\((\d+) (\d+) (\d+)/.exec(couleur)
  if (m === null) throw new Error(`couleur inattendue : ${couleur}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function hexa(couleur: string): string {
  const [r, v, b] = canaux(couleur)
  return `#${[r, v, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

describe('modèle du fond de ciel §3.3 (T-0097)', () => {
  it('cale l’exposition sur le ciel le plus sombre de la table, et rien d’autre', () => {
    // La seule constante libre : le ciel le plus noir de la table est juste au-dessus du noir.
    const plancher = luminanceEcran(SB_PLANCHER_NATUREL)
    expect(plancher).toBeGreaterThan(0)
    expect(plancher).toBeLessThan(K('CHROMA_FOND_CIEL_B') / 100)
  })

  it('garde entre deux fonds le rapport PHYSIQUE de leurs brillances', () => {
    const b1 = interpoleBortle(1).sb
    const b9 = interpoleBortle(9).sb
    // Aucun choix de rendu là-dedans : Y = K × B, donc le rapport des Y est celui des B.
    expect(luminanceEcran(b9) / luminanceEcran(b1)).toBeCloseTo(
      nanolamberts(b9) / nanolamberts(b1),
      9,
    )
  })

  it('ne fait varier que la luminance, jamais la chromaticité', () => {
    for (const bortle of [1, 5, 9]) {
      const [r, v, b] = composantesFond(interpoleBortle(bortle).sb)
      expect(r / b).toBeCloseTo(K('CHROMA_FOND_CIEL_R') / K('CHROMA_FOND_CIEL_B'), 9)
      expect(v / b).toBeCloseTo(K('CHROMA_FOND_CIEL_V') / K('CHROMA_FOND_CIEL_B'), 9)
    }
  })

  it('inverse exactement la conversion en nanolamberts', () => {
    for (const sb of [17, 19.5, 21.9, 23]) {
      expect(sbDepuisNanolamberts(nanolamberts(sb))).toBeCloseTo(sb, 9)
    }
  })

  /**
   * Le contrat d'affichage de T-0097. Ce ne sont pas des valeurs astronomiques recopiées :
   * ce sont les couleurs que le ticket annonce à l'utilisateur, et elles se dérivent des
   * constantes du registre. Elles bougent si l'exposition ou la chromaticité bougent — c'est
   * précisément ce que ce test doit voir.
   */
  it('rend la table de couleurs annoncée, à 1/255 près par canal', () => {
    const attendus: Readonly<Record<number, string>> = {
      1: '#06070a',
      4: '#0b0c10',
      6: '#1c1f25',
      8: '#3a3f4a',
      9: '#494f5d',
    }
    for (const [bortle, attendu] of Object.entries(attendus)) {
      expect(hexa(fondRealiste(interpoleBortle(Number(bortle)).sb)), `Bortle ${bortle}`).toBe(
        attendu,
      )
    }
  })

  it('suit le fond de ciel mesuré, jamais le champ Bortle saisi', () => {
    // Un SQM mesuré prévaut (§2.2) : la teinte est fonction de `sb`, et de rien d'autre.
    const sqm = 20.15
    expect(fondRealiste(sqm)).not.toBe(fondRealiste(interpoleBortle(6).sb))
    expect(fondRealiste(sqm)).toBe(fondRealiste(sqm))
  })
})

describe('palette de vue réaliste (T-0097)', () => {
  it('laisse la scène intacte quand la case est décochée', () => {
    expect(paletteScene(false, false, interpoleBortle(9).sb)).toEqual(palette(false))
  })

  it('garde le fond noir et la palette de nuit en mode nuit', () => {
    const nuit = paletteScene(true, true, interpoleBortle(9).sb)
    expect(nuit).toEqual(palette(true))
    expect(nuit.fond).toBe('#000000')
  })

  it('retient chaque repère à son rapport de contraste actuel, ou déclare la saturation', () => {
    // Les marqueurs d'objets ne sont plus dans la palette : ils ont leur table par type, et
    // sa compensation se vérifie dans `marqueur-objet.test.ts`.
    const reperes = ['figures', 'frontieres', 'asterismes', 'corps', 'cadre',
      'horizon', 'voieLactee', 'texte'] as const
    for (const bortle of [1, 6, 9]) {
      const sb = interpoleBortle(bortle).sb
      const realiste = paletteRealiste(sb)
      const luminanceFond = luminanceRelative(composantesFond(sb))
      for (const repere of reperes) {
        const attendu = rapportContraste(
          luminanceRelative(lineaire(palette(false)[repere])),
          LUMINANCE_FOND_REFERENCE,
        )
        const obtenu = rapportContraste(luminanceRelative(lineaire(realiste[repere])), luminanceFond)
        const sature = canaux(realiste[repere]).some((c) => c === 255)
        // Soit le rapport est tenu à 2 % près, soit l'écran est à bout de gamut et le dit.
        expect(obtenu >= attendu * 0.98 || sature, `${repere} @ B${bortle}`).toBe(true)
      }
    }
  })

  it('n’éclaircit pas le sol : il masque, il n’oriente pas (T-0094)', () => {
    expect(paletteRealiste(interpoleBortle(9).sb).sol).toBe(palette(false).sol)
  })
})

/** Composantes linéaires d'une couleur `rgb(r v b)`, pour le calcul de contraste du test. */
function lineaire(couleur: string): readonly [number, number, number] {
  const versLin = (octet: number): number => {
    const e = octet / 255
    return e <= 0.04045 ? e / 12.92 : ((e + 0.055) / 1.055) ** 2.4
  }
  const [r, v, b] = canaux(couleur)
  return [versLin(r), versLin(v), versLin(b)]
}

describe('halo d’horizon — van Rhijn 1921 (T-0098)', () => {
  it('vaut exactement 1 au zénith', () => {
    expect(vanRhijn(ZENITH_DEG)).toBe(1)
    expect(facteurHaloHorizon(ZENITH_DEG)).toBeCloseTo(1, 12)
  })

  it('décroît strictement de l’horizon au zénith', () => {
    let precedent = Infinity
    for (let h = 0; h <= ZENITH_DEG; h += 5) {
      const facteur = facteurHaloHorizon(h)
      expect(facteur, `h=${h}`).toBeLessThan(precedent)
      precedent = facteur
    }
  })

  /**
   * Le terme d'extinction n'est pas décoratif : van Rhijn seul donnerait ×6 à l'horizon, ce
   * que personne n'observe. Avec l'extinction, l'écart tombe à ×3,2 — soit 1,26 mag/as².
   * (T-0098 annonçait ×2,9 : c'est la valeur de van Rhijn × extinction pour une couche plus
   * haute que les 90 km retenus. Le ticket a été corrigé sur la valeur du modèle codé.)
   */
  it('éclaircit l’horizon d’un facteur 3,2, pas des 6 de van Rhijn seul', () => {
    expect(vanRhijn(0)).toBeGreaterThan(5.5)
    expect(facteurHaloHorizon(0)).toBeCloseTo(3.19, 1)
    // Exprimé en magnitudes, l'écart que l'œil connaît entre l'horizon et le zénith.
    const sb = interpoleBortle(4).sb
    const ecartMag = sb - sbEffectifRendu({ sbSiteMag: sb, hauteurDeg: 0 })
    expect(ecartMag).toBeCloseTo(1.26, 1)
  })

  it('tire ses paliers du registre, du plus bas au plus haut', () => {
    const bornes = bornesPaliersHalo()
    expect(bornes.length).toBe(K('PALIERS_HALO_HORIZON'))
    expect(bornes[bornes.length - 1]).toBe(ZENITH_DEG)
    for (let i = 1; i < bornes.length; i++) expect(bornes[i]!).toBeGreaterThan(bornes[i - 1]!)
    // Chaque hauteur représentative tombe dans la bande que son palier referme.
    for (let i = 0; i < bornes.length; i++) {
      const bas = i === 0 ? 0 : bornes[i - 1]!
      expect(hauteurRepresentative(i)).toBeGreaterThan(bas)
      expect(hauteurRepresentative(i)).toBeLessThan(bornes[i]! + 1e-9)
    }
  })

  it('peint un palier de moins que la table : celui du zénith est le fond lui-même', () => {
    const ciel = cielInstantane(SITE, DATE)
    const espion = contexteEspion()
    dessineHaloHorizon(ctxDe(espion), projecteur(vue(), ciel.matrice), ciel.matrice, 20)
    expect(espion.remplissages.filter((r) => r.nom === 'fill').length).toBe(
      K('PALIERS_HALO_HORIZON') - 1,
    )
  })

  it('peint du plus sombre au plus clair : le dernier palier est celui de l’horizon', () => {
    const ciel = cielInstantane(SITE, DATE)
    const espion = contexteEspion()
    dessineHaloHorizon(
      ctxDe(espion),
      projecteur(vue({ hauteurDeg: 10 }), ciel.matrice),
      ciel.matrice,
      interpoleBortle(4).sb,
    )
    const luminances = espion.remplissages.map((r) => luminanceRelative(lineaire(String(r.couleur))))
    for (let i = 1; i < luminances.length; i++) {
      expect(luminances[i]!, `palier ${i}`).toBeGreaterThan(luminances[i - 1]!)
    }
  })

  it('tient dans les trois projections, y compris au champ gnomonique maximal', () => {
    const ciel = cielInstantane(SITE, DATE)
    const modes = [
      vue({ mode: 'MODE_PLANETARIUM', fovDeg: K('FOV_MAX_DEG') }),
      vue({ mode: 'MODE_CADRE', fovDeg: K('FOV_MAX_GNOMONIQUE_DEG') }),
      vue({ mode: 'MODE_FISHEYE', fovDeg: K('FOV_MAX_DEG') }),
    ] as const
    for (const v of modes) {
      const espion = contexteEspion()
      dessineHaloHorizon(ctxDe(espion), projecteur(v, ciel.matrice), ciel.matrice, 20)
      expect(espion.remplissages.length, v.mode).toBe(K('PALIERS_HALO_HORIZON') - 1)
      for (const r of espion.remplissages) expect(canaux(String(r.couleur)).length).toBe(3)
    }
  })
})

describe('halo lunaire — Krisciunas & Schaefer (T-0100)', () => {
  const PLEINE_LUNE_DEG = 0

  function lune(options: Partial<LuneEcran> = {}): LuneEcran {
    const ciel = cielInstantane(SITE, DATE)
    // La Lune est posée au centre exact de la visée : sa position écran est alors connue.
    const centre = projecteur(vue(), ciel.matrice).inverse(LARGEUR / 2, HAUTEUR / 2)
    const decDeg = (Math.asin(centre.z) * 180) / Math.PI
    const adDeg = (Math.atan2(centre.y, centre.x) * 180) / Math.PI
    return {
      adH: adDeg / 15,
      decDeg,
      altitudeDeg: 60,
      azimutDeg: 180,
      anglePhaseDeg: PLEINE_LUNE_DEG,
      ...options,
    }
  }

  it('n’ajoute rien quand la Lune est sous l’horizon, quelle que soit sa phase', () => {
    for (const anglePhaseDeg of [0, 45, 90, 180]) {
      const geometrie: GeometrieLune = {
        altitudeLuneDeg: -1,
        altitudeCibleDeg: 45,
        separationDeg: 20,
        anglePhaseDeg,
      }
      expect(brillanceLuneNl(geometrie)).toBe(0)
      const sb = interpoleBortle(4).sb
      expect(sbEffectifRendu({ sbSiteMag: sb, hauteurDeg: ZENITH_DEG, lune: geometrie })).toBeCloseTo(
        sb,
        9,
      )
    }
    const espion = contexteEspion()
    const ciel = cielInstantane(SITE, DATE)
    dessineHaloLune(ctxDe(espion), projecteur(vue(), ciel.matrice), 21, lune({ altitudeDeg: -5 }))
    expect(espion.remplissages).toEqual([])
  })

  it('éclaircit nettement plus près de la Lune qu’à 120° d’elle', () => {
    const sb = interpoleBortle(4).sb
    const geometrie = (separationDeg: number): GeometrieLune => ({
      altitudeLuneDeg: 60,
      altitudeCibleDeg: 60,
      separationDeg,
      anglePhaseDeg: PLEINE_LUNE_DEG,
    })
    const pres = sbEffectifRendu({ sbSiteMag: sb, hauteurDeg: 60, lune: geometrie(5) })
    const loin = sbEffectifRendu({ sbSiteMag: sb, hauteurDeg: 60, lune: geometrie(120) })
    expect(pres).toBeLessThan(loin - 1)
    // Le profil décroît avec la séparation sur tout l'intervalle peint. Au-delà de 90°, le
    // terme de Rayleigh (1,06 + cos²ρ) remonte vers la contre-Lune : c'est de la physique, pas
    // un rebond numérique, et c'est pourquoi le dégradé s'arrête au quart de tour.
    let precedent = Infinity
    for (let rho = 5; rho <= 90; rho += 5) {
      const b = brillanceLuneNl(geometrie(rho))
      expect(b, `ρ=${rho}`).toBeLessThan(precedent)
      precedent = b
    }
  })

  it('donne le même fond de ciel que le plan de séance, à la même minute (T-0089)', () => {
    const sb = interpoleBortle(4).sb
    const geometrie: GeometrieLune = {
      altitudeLuneDeg: 40,
      altitudeCibleDeg: ZENITH_DEG,
      separationDeg: 35,
      anglePhaseDeg: 30,
    }
    // Le plan de séance passe par ΔSB ; le rendu additionne les brillances. Même modèle,
    // donc même nombre : c'est ce qui interdit deux fonds de ciel sur deux écrans.
    const parLePlan = sbCielAvecLune(sb, deltaSbLune({ sbCielNoirMag: sb, ...geometrie }).value)
    // Les deux chemins ne diffèrent que par l'arrondi de NANOLAMBERT_PENTE (0,92104 pour
    // 0,4·ln10) : deux centièmes de millimagnitude, soit très en dessous du 1/255 d'un canal.
    expect(sbEffectifRendu({ sbSiteMag: sb, hauteurDeg: ZENITH_DEG, lune: geometrie })).toBeCloseTo(
      parLePlan,
      4,
    )
  })

  it('centre le dégradé sur la Lune affichée et décroît en s’en éloignant', () => {
    const ciel = cielInstantane(SITE, DATE)
    const espion = contexteEspion()
    dessineHaloLune(
      ctxDe(espion),
      projecteur(vue(), ciel.matrice),
      interpoleBortle(4).sb,
      lune(),
    )
    expect(espion.degrades.length).toBe(1)
    const degrade = espion.degrades[0]!
    expect(degrade.centreX).toBeCloseTo(LARGEUR / 2, 6)
    expect(degrade.centreY).toBeCloseTo(HAUTEUR / 2, 6)
    expect(degrade.rayon).toBeGreaterThan(0)
    const opacites = degrade.crans.map(([, couleur]) => Number(/\/ ([\d.e-]+)\)/.exec(couleur)![1]))
    expect(opacites[0]!).toBeGreaterThan(opacites[opacites.length - 1]!)
    for (const o of opacites) {
      expect(o).toBeGreaterThanOrEqual(0)
      expect(o).toBeLessThanOrEqual(1)
    }
  })

  it('projette la Lune à la même place que le corps dessiné', () => {
    const ciel = cielInstantane(SITE, DATE)
    const proj = projecteur(vue({ azimutDeg: 90, hauteurDeg: 20, fovDeg: 90 }), ciel.matrice)
    const l = lune({ altitudeDeg: 30 })
    const espion = contexteEspion()
    dessineHaloLune(ctxDe(espion), proj, 20, l)
    const attendu = proj.projette(versVecteur(l.adH * 15, l.decDeg))
    if (attendu === null) {
      expect(espion.degrades).toEqual([])
      return
    }
    expect(espion.degrades[0]!.centreX).toBeCloseTo(attendu.xPx, 6)
    expect(espion.degrades[0]!.centreY).toBeCloseTo(attendu.yPx, 6)
  })
})
