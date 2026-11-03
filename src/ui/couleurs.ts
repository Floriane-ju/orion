/**
 * Star render colour from B−V (§3.3). Anchor table index → RVB, linear interpolation. Appearance
 * mapping, not physics: feeds no verdict → not in registre §2.1 (formula-consumed values only).
 * Quantized to few teintes: render groups stars by teinte → few context colour changes/frame, not
 * thousands.
 */

import { K } from '../registry/constants.ts'
import {
  composantesFond,
  compresseHautesLumieres,
  compresseTeinte,
  luminanceEcran,
  sbDepuisNanolamberts,
  type LueurSoleil,
} from '../core/fond-ciel-rendu.ts'
import { encadre } from '../core/unites.ts'

const ANCRES: readonly (readonly [number, number, number, number])[] = [
  [-0.4, 155, 176, 255],
  [0.0, 202, 215, 255],
  [0.4, 248, 247, 255],
  [0.8, 255, 244, 234],
  [1.2, 255, 210, 161],
  [1.6, 255, 204, 111],
  [2.0, 255, 180, 80],
]

/** Distinct teintes at render. */
export const TEINTES = 8

export function teinte(bv: number): number {
  const min = ANCRES[0]![0]
  const max = ANCRES[ANCRES.length - 1]![0]
  const borne = encadre(bv, min, max)
  const index = Math.round(((borne - min) / (max - min)) * (TEINTES - 1))
  return encadre(index, 0, TEINTES - 1)
}

function interpole(bv: number): readonly [number, number, number] {
  const min = ANCRES[0]!
  const max = ANCRES[ANCRES.length - 1]!
  if (bv <= min[0]) return [min[1], min[2], min[3]]
  if (bv >= max[0]) return [max[1], max[2], max[3]]
  for (let i = 0; i + 1 < ANCRES.length; i++) {
    const a = ANCRES[i]!
    const b = ANCRES[i + 1]!
    if (bv <= b[0]) {
      const f = (bv - a[0]) / (b[0] - a[0])
      return [
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
        Math.round(a[3] + (b[3] - a[3]) * f),
      ]
    }
  }
  return [max[1], max[2], max[3]]
}

/**
 * Teinte colour. Mode nuit: green/blue channels strictly 0 (§11.1 palette rule, for canvas the
 * stylesheet can't reach).
 */
export function couleurTeinte(index: number, modeNuit: boolean): string {
  const min = ANCRES[0]![0]
  const max = ANCRES[ANCRES.length - 1]![0]
  const bv = min + ((max - min) * index) / (TEINTES - 1)
  // T-0402 — teinte mixed with white: photo star core saturates to white, colour survives only in
  // fringe. Attenuated, not removed.
  const blanc = K('DESATURATION_ETOILE')
  const [r, v, b] = interpole(bv).map((c) => Math.round(c + (255 - c) * blanc)) as [
    number,
    number,
    number,
  ]
  return modeNuit ? rougeEquivalent(r, v, b) : `rgb(${r} ${v} ${b})`
}

/** BT.601 luminance coefficients — a DEFINITION, like WCAG ones below. */
const BT601_R = 0.299
const BT601_V = 0.587
const BT601_B = 0.114

/**
 * §11.1 — same perceived luminance on red channel only. Single statement of mode nuit canvas rule:
 * stars (§3.3) and object markers (`apparence-objets.ts`) must not apply it two ways.
 */
export function rougeEquivalent(r: number, v: number, b: number): string {
  return `rgb(${Math.round(BT601_R * r + BT601_V * v + BT601_B * b)} 0 0)`
}

/**
 * Teinte colour at given opacity.
 * T-0119 — opacity in the COLOUR, not `globalAlpha`: same source-over result, but disc can join a
 * shared path (`globalAlpha` forces per-star draw order) → 16000 stars in a few dozen orders.
 */
export function couleurTeinteOpacite(index: number, opacite: number, modeNuit: boolean): string {
  return avecOpacite(couleurTeinte(index, modeNuit), opacite)
}

/** Same at given opacity; alpha in the COLOUR (see above). */
export function avecOpacite(couleur: string, opacite: number): string {
  if (opacite >= 1) return couleur
  return `${couleur.slice(0, -1)} / ${opacite.toFixed(3)})`
}

/**
 * Font family of scène-written texts (names, pose figures, parcours steps): interface's
 * (`--police-mono`). Same link as palette below, held by `mode-nuit.test.tsx`.
 */
export const POLICE_SCENE = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

export interface PaletteCiel {
  readonly fond: string
  readonly figures: string
  readonly frontieres: string
  readonly asterismes: string
  readonly corps: string
  /** Lit part of Lune: interface text, like frise de nuit disc. */
  readonly lune: string
  readonly cadre: string
  /**
   * Frame of opened/hovered cible at its zoom focale. Doubles matériel cadre: only teinte differs
   * — interface amber, corps' (points, not outlines). Night: corps red.
   */
  readonly cadreCible: string
  readonly horizon: string
  /**
   * T-0395 — sol contour lines: below horizon (counts); above sol they layer without lighting.
   * Painted on sol not fond → no compensation in vue réaliste (sol doesn't brighten).
   */
  readonly courbes: string
  /** §4.1 — sol: opaque, very dark; distinct from fond de ciel without lighting it. */
  readonly sol: string
  /**
   * T-0409 — sol while scène Soleil is up: blue-grey (black night sol = hole under day sky). Red
   * night keeps its sol: no day under §11.1.
   */
  readonly solJour: string
  /** T-0033 — galactic plane: pink in normal view, pure red in mode nuit. */
  readonly voieLactee: string
  /**
   * §8.4 / T-0324 — pointage path. Can't differ from cadre by teinte (mode nuit all red): differs
   * by FORM — dashed vs solid; teinte only puts it foreground in its stripped scène.
   */
  readonly parcours: string
  readonly texte: string
}

/**
 * T-0065 — two frozen palettes, not two literals per frame. Depend only on mode nuit; per-render
 * rebuild allocates for nothing.
 */
const PALETTE_NUIT: PaletteCiel = Object.freeze({
  fond: '#000000',
  figures: 'rgb(90 0 0)',
  frontieres: 'rgb(70 0 0)',
  asterismes: 'rgb(120 0 0)',
  corps: 'rgb(190 0 0)',
  lune: 'rgb(250 0 0)',
  cadre: 'rgb(246 0 0)',
  cadreCible: 'rgb(190 0 0)',
  horizon: 'rgb(50 0 0)',
  courbes: 'rgb(36 0 0)',
  sol: 'rgb(18 0 0)',
  solJour: 'rgb(18 0 0)',
  voieLactee: 'rgb(110 0 0)',
  parcours: 'rgb(250 0 0)',
  texte: 'rgb(170 0 0)',
})

/**
 * T-0113 — scène shares interface palette where it paints interface: fond (`--fond`), aimed cadre
 * (`--accent`), parcours and Lune (`--texte`), day solar-system corps (`--avertissement`, amber).
 * T-0330 — rest = scène-own GRADUATION: figures, frontières, astérismes, horizon = wireframe
 * strokes tiered to hierarchize on sky, not `--base-neutre` shades. White VEILS not greys: opaque
 * grey cuts darker on raised fond (horizon halo, Lune); veil adds, stays lighter than what it
 * crosses; on black each opacity gives the grey it replaces. Painted names (`texte`) stay under
 * interface text; night corps below interface amber-red likewise. Voie lactée keeps cold teinte:
 * only painted structure that is neither instrument trace nor pointed object; hue gap separates
 * it from astérismes without brightening.
 * Star colours not here: from B−V (§3.3), a measure not a drawing choice.
 * WHAT SCÈNE BORROWS FROM INTERFACE = ITS TOKEN; every other teinte declared hors kit in
 * `mode-nuit.test.tsx` (new teinte must pick a side). Canvas can't read stylesheet: the test
 * compares; origin changed in `styles.css` without update here fails `pnpm test` (cadre had
 * drifted from accent unnoticed).
 */
const BLANC = 'rgb(255 255 255)'

const PALETTE_JOUR: PaletteCiel = Object.freeze({
  fond: '#000000',
  figures: avecOpacite(BLANC, 0.392),
  frontieres: avecOpacite(BLANC, 0.282),
  asterismes: avecOpacite(BLANC, 0.392),
  corps: 'rgb(244 199 106)',
  lune: 'rgb(233 233 233)',
  cadre: 'rgb(139 255 239)',
  cadreCible: 'rgb(244 199 106)',
  horizon: avecOpacite(BLANC, 0.33),
  courbes: avecOpacite(BLANC, 0.16),
  sol: 'rgb(5 5 5)',
  solJour: 'rgb(59 61 69)',
  voieLactee: 'rgb(150 186 205)',
  parcours: 'rgb(233 233 233)',
  texte: 'rgb(214 214 214)',
})

export function palette(modeNuit: boolean): PaletteCiel {
  return modeNuit ? PALETTE_NUIT : PALETTE_JOUR
}

// T-0097 — realistic fond de ciel and contrast compensation

/**
 * Coefficients below are DEFINITIONS of sRGB and WCAG 2.1 contrast (like 180° = half turn): not
 * project thresholds nor measured. Registre §2.1 holds only astronomy-formula quantities; putting
 * them there would suggest they're tunable.
 */
const SRGB_SEUIL_LINEAIRE = 0.0031308
const SRGB_SEUIL_ENCODE = 0.04045
const SRGB_PENTE = 12.92
const SRGB_ALPHA = 0.055
const SRGB_GAMMA = 2.4
const WCAG_R = 0.2126
const WCAG_V = 0.7152
const WCAG_B = 0.0722
/** WCAG 0.05: ambient reflection added to both luminances. */
const WCAG_AMBIANCE = 0.05
const OCTET_MAX = 255

type Composantes = readonly [number, number, number]

function versLineaire(octet: number): number {
  const encode = octet / OCTET_MAX
  return encode <= SRGB_SEUIL_ENCODE
    ? encode / SRGB_PENTE
    : ((encode + SRGB_ALPHA) / (1 + SRGB_ALPHA)) ** SRGB_GAMMA
}

function versOctet(lineaire: number): number {
  const borne = encadre(lineaire, 0, 1)
  const encode =
    borne <= SRGB_SEUIL_LINEAIRE
      ? borne * SRGB_PENTE
      : (1 + SRGB_ALPHA) * borne ** (1 / SRGB_GAMMA) - SRGB_ALPHA
  return Math.round(encode * OCTET_MAX)
}

const HEXA = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const RVB = /^rgb\((\d+) (\d+) (\d+)\)$/
const VOILE = /^(rgb\((\d+) (\d+) (\d+)) \/ ([\d.]+)\)$/

/** Linear components of a palette CSS colour: `#rrggbb` or `rgb(r v b)`. */
export function composantesDeCss(css: string): Composantes {
  const hexa = HEXA.exec(css)
  if (hexa !== null) {
    return [
      versLineaire(parseInt(hexa[1]!, 16)),
      versLineaire(parseInt(hexa[2]!, 16)),
      versLineaire(parseInt(hexa[3]!, 16)),
    ]
  }
  const rvb = RVB.exec(css)
  if (rvb === null) throw new Error(`Couleur de palette non reconnue : ${css}`)
  return [
    versLineaire(Number(rvb[1])),
    versLineaire(Number(rvb[2])),
    versLineaire(Number(rvb[3])),
  ]
}

function css(composantes: Composantes): string {
  return `rgb(${versOctet(composantes[0])} ${versOctet(composantes[1])} ${versOctet(composantes[2])})`
}

/** WCAG relative luminance of a colour in linear light. */
export function luminanceRelative(composantes: Composantes): number {
  return WCAG_R * composantes[0] + WCAG_V * composantes[1] + WCAG_B * composantes[2]
}

/** WCAG contrast ratio between two relative luminances. */
export function rapportContraste(claire: number, sombre: number): number {
  return (claire + WCAG_AMBIANCE) / (sombre + WCAG_AMBIANCE)
}

/** Reference fond luminance: the one day palette was chosen on. */
export const LUMINANCE_FOND_REFERENCE = luminanceRelative(composantesDeCss(PALETTE_JOUR.fond))

/**
 * T-0102 — chromaticity of integrated starlight, normalized so WCAG luminance = fond de ciel's.
 * Else band and fond at EQUAL surface brightness differ in luminance: `K_EXPOSITION_FOND_CIEL`
 * (sole free fond-model constant) would stop applying to both; band contrast = teinte-choice
 * artefact. R/V/B ratio carries the physics (perceived teinte, C-45 to C-47), not its scale.
 */
const CHROMA_BANDE: Composantes = (() => {
  const brut: Composantes = [
    K('CHROMA_VOIE_LACTEE_R'),
    K('CHROMA_VOIE_LACTEE_V'),
    K('CHROMA_VOIE_LACTEE_B'),
  ]
  const cible = luminanceRelative([
    K('CHROMA_FOND_CIEL_R'),
    K('CHROMA_FOND_CIEL_V'),
    K('CHROMA_FOND_CIEL_B'),
  ])
  const facteur = cible / luminanceRelative(brut)
  return [brut[0] * facteur, brut[1] * facteur, brut[2] * facteur]
})()

/**
 * T-0102 — mode nuit preserves dark adaptation (§11.1), not photometric fidelity: band pure red,
 * unnormalized. Chromaticity (1, 0, 0) CAN'T reach fond luminance (red = 0.2126 of luminance);
 * forcing it saturates the channel instead of lighting.
 */
const CHROMA_BANDE_NUIT: Composantes = [1, 0, 0]

/**
 * T-0102 — Voie lactée composited on fond de ciel: its share of total brightness, and colour of
 * that total. Same pattern as `dessineHaloLune` (T-0100): share = opacity, sum = colour. Where band
 * dominates, composite = model colour exactly; where it fades, share multiplies a colour
 * indistinguishable from fond → invisible. No threshold.
 * `deltaPeintOctets` = what slice CHANGES on screen: canvas composes in bytes, pixel = fond + part
 * × (couleur − fond), gap in byte levels. Under half a level slice paints over itself → caller
 * skips drawing. Not a render threshold: target resolution, measurable.
 */
export function bandeRealiste(
  brillanceCielNl: number,
  brillanceBandeNl: number,
  modeNuit: boolean,
): {
  readonly couleur: string
  readonly part: number
  readonly deltaPeintOctets: number
  readonly ajoutOctets: readonly [number, number, number]
} {
  const chroma = modeNuit ? CHROMA_BANDE_NUIT : CHROMA_BANDE
  const yCiel = K('K_EXPOSITION_FOND_CIEL') * brillanceCielNl
  const yBande = K('K_EXPOSITION_FOND_CIEL') * brillanceBandeNl
  // Fond keeps own chromaticity: mode nuit paints black canvas (§11.1), only band brings light.
  const fond: Composantes = modeNuit
    ? [0, 0, 0]
    : [
        yCiel * K('CHROMA_FOND_CIEL_R'),
        yCiel * K('CHROMA_FOND_CIEL_V'),
        yCiel * K('CHROMA_FOND_CIEL_B'),
      ]
  const composee: Composantes = [
    fond[0] + yBande * chroma[0],
    fond[1] + yBande * chroma[1],
    fond[2] + yBande * chroma[2],
  ]
  const part = brillanceBandeNl / (brillanceCielNl + brillanceBandeNl)
  const ecart = (c: 0 | 1 | 2): number => versOctet(composee[c]) - versOctet(fond[c])
  const ecarts = [ecart(0), ecart(1), ecart(2)] as const
  return {
    couleur: css(composee),
    part,
    deltaPeintOctets: part * Math.max(...ecarts.map(Math.abs)),
    // What band ADDS to fond, in bytes: painted `lighter` at opacity `part` gives back exactly
    // `couleur` on zenith fond, only brightens a fond already raised by halos (light adds).
    ajoutOctets: [Math.max(0, ecarts[0]), Math.max(0, ecarts[1]), Math.max(0, ecarts[2])],
  }
}

/**
 * Fond de ciel colour at this surface brightness, realistic view, eye adapted to zenith
 * `sbZenith` (default: itself).
 */
export function fondRealiste(sbCiel: number, sbZenith = sbCiel): string {
  return cssFond(composantesFond(sbCiel, sbZenith))
}

/**
 * Writes linear colour in [0, 1] as opaque sRGB bytes to `out[i..i+3]`. Per-pixel: no allocation,
 * not even CSS string.
 */
export function ecritOctets(
  c: readonly [number, number, number],
  out: Uint8ClampedArray,
  i: number,
): void {
  out[i] = versOctet(c[0])
  out[i + 1] = versOctet(c[1])
  out[i + 2] = versOctet(c[2])
  out[i + 3] = OCTET_MAX
}

/** Highlights compressed at constant teinte (`GENOU_HAUTES_LUMIERES`), not clipped. */
function cssCompresse(c: readonly [number, number, number]): string {
  return css(compresseHautesLumieres(c) as Composantes)
}

/** Fond alone: compressed at constant teinte, bright horizon stays pale blue. */
function cssFond(c: readonly [number, number, number]): string {
  return css(compresseTeinte(c) as Composantes)
}

/**
 * T-0356 — fond raised by Sun light. Fond `bFondNl` and Rayleigh term keep sky teinte; neutral Mie
 * goes through solar path `rougissement`. Low Sun: orange Mie around it, pink where it mixes with
 * blue → sunset emerges, no hand-picked teinte.
 *
 * ponytail: Rayleigh not reddened, else sunset zenith turns orange; reality keeps it blue via
 * ozone Chappuis absorption, unmodelled here.
 */
export function fondRealisteSoleil(
  bFondNl: number,
  lueur: LueurSoleil,
  rougissement: readonly [number, number, number],
  sbZenith: number,
): string {
  const fond = composantesFond(sbDepuisNanolamberts(bFondNl), sbZenith)
  const rayleigh = composantesFond(sbDepuisNanolamberts(lueur.rayleighNl), sbZenith)
  const mie = luminanceEcran(sbDepuisNanolamberts(lueur.mieNl), sbZenith)
  const canal = (c: 0 | 1 | 2): number => fond[c] + rayleigh[c] + mie * rougissement[c]
  return cssCompresse([canal(0), canal(1), canal(2)])
}

/**
 * Holds a repère teinte at ITS current contrast ratio vs day fond (`PALETTE_JOUR.fond`, that of
 * `LUMINANCE_FOND_REFERENCE`). Else `frontieres` goes 2.14:1 → 1.15:1 on Bortle 9 fond and
 * vanishes (§3.7 forbids). Keeping each teinte's ratio avoids arbitrary threshold and
 * re-litigating the palette.
 *
 * ponytail: luminance raised by homothety on 3 channels (constant chromaticity), then each channel
 * clipped to 1. Near-white teinte (`cadre`, `corps`, `texte`) CAN'T keep 10:1 or 16:1 on Bortle 9
 * fond: max reachable 8.2:1, pure white included → saturates, `saturee` says so. Screen gamut
 * limit, not model defect.
 */
export function ajusteContrasteSurFond(
  teinte: string,
  luminanceFond: number,
): { readonly couleur: string; readonly saturee: boolean } {
  const base = composantesDeCss(teinte)
  const luminance = luminanceRelative(base)
  if (luminance <= 0) return { couleur: teinte, saturee: false }
  const rapport = rapportContraste(luminance, LUMINANCE_FOND_REFERENCE)
  const cible = rapport * (luminanceFond + WCAG_AMBIANCE) - WCAG_AMBIANCE
  if (cible <= luminance) return { couleur: teinte, saturee: false }
  const facteur = cible / luminance
  const etendues: Composantes = [base[0] * facteur, base[1] * facteur, base[2] * facteur]
  return { couleur: css(etendues), saturee: etendues.some((c) => c > 1) }
}

/**
 * Same retention for a veil (`rgb(r v b / a)`): compensate its grey on reference fond (black),
 * then raise OPACITY until veil on `fond` reaches that grey per channel. Canvas composes in
 * encoded sRGB: `f + a·(t − f)` per byte. Stays a veil → lighter than halos it crosses.
 */
function compenseVoile(teinte: string, fond: Composantes, luminanceFond: number): string {
  const voile = VOILE.exec(teinte)
  if (voile === null) return ajusteContrasteSurFond(teinte, luminanceFond).couleur
  const opacite = Number(voile[5])
  const trait = [Number(voile[2]), Number(voile[3]), Number(voile[4])] as const
  const surNoir: Composantes = [
    versLineaire(trait[0] * opacite),
    versLineaire(trait[1] * opacite),
    versLineaire(trait[2] * opacite),
  ]
  const cible = composantesDeCss(ajusteContrasteSurFond(css(surNoir), luminanceFond).couleur)
  let requise = opacite
  for (let c = 0; c < trait.length; c++) {
    const f = versOctet(fond[c]!)
    const ecart = trait[c]! - f
    if (ecart > 0) requise = Math.max(requise, (versOctet(cible[c]!) - f) / ecart)
  }
  return avecOpacite(voile[1]! + ')', Math.min(requise, 1))
}

/**
 * Realistic-view palette: fond takes site luminance, repères compensate. `sol` not compensated
 * (masks, doesn't orient; brightening undoes T-0094). Fond neither: it's the reference.
 *
 * ponytail: one result cached. Render loop calls this per frame with same `sbCiel` for thousands
 * of frames; recomposing nine teintes each time allocates for nothing, and per-value cache would
 * never hold more than one entry.
 */
let cacheRealiste: { sb: number; palette: PaletteCiel } | null = null

/** Fond de ciel luminance at this surface brightness: compensation reference. */
export function luminanceFondRealiste(sbCiel: number): number {
  return luminanceRelative(composantesFond(sbCiel))
}

export function paletteRealiste(sbCiel: number): PaletteCiel {
  if (cacheRealiste !== null && cacheRealiste.sb === sbCiel) return cacheRealiste.palette
  const composantes = composantesFond(sbCiel) as Composantes
  const fond = css(composantes)
  const luminanceFond = luminanceRelative(composantes)
  const compense = (teinte: string): string => compenseVoile(teinte, composantes, luminanceFond)
  const composee: PaletteCiel = Object.freeze({
    ...PALETTE_JOUR,
    fond,
    figures: compense(PALETTE_JOUR.figures),
    frontieres: compense(PALETTE_JOUR.frontieres),
    asterismes: compense(PALETTE_JOUR.asterismes),
    corps: compense(PALETTE_JOUR.corps),
    lune: compense(PALETTE_JOUR.lune),
    cadre: compense(PALETTE_JOUR.cadre),
    cadreCible: compense(PALETTE_JOUR.cadreCible),
    horizon: compense(PALETTE_JOUR.horizon),
    voieLactee: compense(PALETTE_JOUR.voieLactee),
    parcours: compense(PALETTE_JOUR.parcours),
    texte: compense(PALETTE_JOUR.texte),
  })
  cacheRealiste = { sb: sbCiel, palette: composee }
  return composee
}

/**
 * Scène palette: mode nuit first — protects dark adaptation, brightening whole canvas would defeat
 * it. In mode nuit, vue réaliste changes only limiting magnitude (§11.1).
 */
export function paletteScene(modeNuit: boolean, vueRealiste: boolean, sbCiel: number): PaletteCiel {
  if (modeNuit || !vueRealiste) return palette(modeNuit)
  return paletteRealiste(sbCiel)
}
