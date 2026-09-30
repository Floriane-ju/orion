/**
 * Couleur de rendu d'une étoile d'après son indice B−V (§3.3).
 *
 * Table d'ancrage classique de la conversion indice de couleur → RVB, interpolée
 * linéairement. C'est une correspondance d'apparence, pas un calcul de physique : elle ne
 * nourrit aucun verdict et n'a donc pas sa place au registre §2.1, qui ne porte que les
 * valeurs consommées par une formule.
 *
 * Les couleurs sont quantifiées en quelques teintes : le rendu regroupe les étoiles par
 * teinte pour ne changer la couleur du contexte que quelques fois par image, au lieu de
 * plusieurs milliers.
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

/** Nombre de teintes distinctes utilisées au rendu. */
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
 * Couleur d'une teinte. En mode nuit, les canaux vert et bleu sont strictement nuls : la
 * même règle que la palette de §11.1, appliquée au canevas que la feuille de style
 * n'atteint pas.
 */
export function couleurTeinte(index: number, modeNuit: boolean): string {
  const min = ANCRES[0]![0]
  const max = ANCRES[ANCRES.length - 1]![0]
  const bv = min + ((max - min) * index) / (TEINTES - 1)
  const [r, v, b] = interpole(bv)
  return modeNuit ? rougeEquivalent(r, v, b) : `rgb(${r} ${v} ${b})`
}

/** Coefficients de luminance BT.601 — une DÉFINITION, comme ceux de WCAG plus bas. */
const BT601_R = 0.299
const BT601_V = 0.587
const BT601_B = 0.114

/**
 * §11.1 — la même luminance perçue, portée par le seul canal rouge.
 *
 * Une seule écriture de la règle du mode nuit sur le canevas : étoiles (§3.3) et marqueurs
 * d'objets (`apparence-objets.ts`) ne peuvent pas l'appliquer de deux façons.
 */
export function rougeEquivalent(r: number, v: number, b: number): string {
  return `rgb(${Math.round(BT601_R * r + BT601_V * v + BT601_B * b)} 0 0)`
}

/**
 * Couleur d'une teinte, à opacité donnée.
 *
 * T-0119 — l'opacité entre dans la COULEUR au lieu de passer par `globalAlpha`. Le résultat est
 * le même en composition source-over, mais un disque dont l'opacité est dans sa couleur peut
 * rejoindre un chemin partagé, là où `globalAlpha` impose un ordre de tracé par étoile. C'est ce
 * qui permet de peindre seize mille étoiles en quelques dizaines d'ordres.
 */
export function couleurTeinteOpacite(index: number, opacite: number, modeNuit: boolean): string {
  return avecOpacite(couleurTeinte(index, modeNuit), opacite)
}

/**
 * La même couleur, à opacité donnée. Le canal alpha entre dans la COULEUR pour la raison dite
 * plus haut : une couleur porte son opacité, `globalAlpha` impose un ordre de tracé.
 */
export function avecOpacite(couleur: string, opacite: number): string {
  if (opacite >= 1) return couleur
  return `${couleur.slice(0, -1)} / ${opacite.toFixed(3)})`
}

/**
 * La famille des textes que la scène écrit — noms, chiffres de pose, étapes du parcours : celle
 * de l'interface (`--police-mono`), pas celle du système. Même lien que la palette ci-dessous,
 * tenu par `mode-nuit.test.tsx`.
 */
export const POLICE_SCENE = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

export interface PaletteCiel {
  readonly fond: string
  readonly figures: string
  readonly frontieres: string
  readonly asterismes: string
  readonly corps: string
  /** La part éclairée de la Lune : le texte de l'interface, comme le disque de la frise de nuit. */
  readonly lune: string
  readonly cadre: string
  readonly horizon: string
  /** §4.1 — le sol : opaque et très foncé, il se distingue du fond de ciel sans l'éclairer. */
  readonly sol: string
  /** T-0033 — plan galactique : rose en vue normale, rouge pur en mode nuit comme le reste. */
  readonly voieLactee: string
  /**
   * §8.4 / T-0324 — le trajet de pointage. Il ne peut pas se distinguer du cadre par la teinte :
   * en mode nuit tout est rouge. Il s'en distingue par la FORME — trait tireté contre contour
   * plein — et la teinte ne fait que le poser au premier plan de sa scène dépouillée.
   */
  readonly parcours: string
  readonly texte: string
}

/**
 * T-0065 — deux palettes gelées, pas deux littéraux par image. Elles ne dépendent que du
 * mode nuit : les reconstruire à chaque passe de rendu n'apporte rien et alloue.
 */
const PALETTE_NUIT: PaletteCiel = Object.freeze({
  fond: '#000000',
  figures: 'rgb(90 0 0)',
  frontieres: 'rgb(70 0 0)',
  asterismes: 'rgb(120 0 0)',
  corps: 'rgb(190 0 0)',
  lune: 'rgb(250 0 0)',
  cadre: 'rgb(246 0 0)',
  horizon: 'rgb(70 0 0)',
  sol: 'rgb(18 0 0)',
  voieLactee: 'rgb(110 0 0)',
  parcours: 'rgb(250 0 0)',
  texte: 'rgb(170 0 0)',
})

/**
 * T-0113 — la scène partage la palette de l'interface, là où elle peint de l'interface.
 *
 * Le canevas et la feuille de style peignent le même écran : deux familles de teintes y
 * font deux applications superposées. Ce que la scène EMPRUNTE à l'interface reprend donc son
 * jeton : le fond (`--fond`), le cadre visé (`--accent`), le parcours et la Lune (`--texte`), et de jour
 * les corps du système solaire (`--avertissement`, l'ambre).
 *
 * T-0330 — le reste est une GRADUATION PROPRE À LA SCÈNE, et le dit : figures, frontières,
 * astérismes et horizon sont des traits filaires étagés entre eux pour se hiérarchiser sur le
 * ciel, pas des nuances de `--base-neutre`. Ce sont des VOILES de blanc, pas des gris : un gris
 * opaque tranche sur un fond de ciel relevé (halo d'horizon, Lune) comme une découpe plus sombre
 * que lui, là où un voile s'y ajoute et reste un trait plus clair que ce qu'il traverse. Sur le
 * noir, chaque opacité redonne le gris qu'elle remplace ; les noms peints (`texte`) restent sous le texte de
 * l'interface pour ne pas lutter avec lui ; la nuit, les corps descendent sous l'ambre-rouge de
 * l'interface pour la même raison que tout le reste de la scène. La Voie lactée garde une teinte
 * froide : c'est la seule structure peinte qui ne soit ni un tracé de l'instrument ni un objet
 * pointé, et l'écart de teinte est ce qui la sépare des astérismes sans la rendre plus lumineuse.
 *
 * Les couleurs d'étoile ne sont pas ici : elles viennent de l'indice B−V (§3.3), c'est une
 * mesure, pas une décision de dessin.
 *
 * CE QUE LA SCÈNE EMPRUNTE À L'INTERFACE EST TENU ÉGAL À SON JETON, et chaque autre teinte est
 * déclarée hors kit dans `mode-nuit.test.tsx` : une teinte nouvelle doit choisir son camp.
 * Le canevas ne lit pas la feuille de style : c'est `mode-nuit.test.tsx` qui compare, et une
 * origine changée dans `styles.css` sans être reportée ici fait échouer `pnpm test`. Le cadre
 * avait dérivé de l'accent sans que rien ne le dise.
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
  horizon: avecOpacite(BLANC, 0.588),
  sol: 'rgb(5 5 5)',
  voieLactee: 'rgb(150 186 205)',
  parcours: 'rgb(233 233 233)',
  texte: 'rgb(214 214 214)',
})

export function palette(modeNuit: boolean): PaletteCiel {
  return modeNuit ? PALETTE_NUIT : PALETTE_JOUR
}

// ---------------------------------------------------------------------------
// T-0097 — fond de ciel réaliste et compensation de contraste
// ---------------------------------------------------------------------------

/**
 * Les coefficients qui suivent sont des DÉFINITIONS de l'espace sRGB et du calcul de
 * contraste WCAG 2.1, au même titre que 180° est un demi-tour. Ce ne sont ni des seuils de
 * projet ni des valeurs mesurées : le registre §2.1 ne porte que les grandeurs consommées par
 * une formule d'astronomie, et les y ranger laisserait croire qu'elles se règlent.
 */
const SRGB_SEUIL_LINEAIRE = 0.0031308
const SRGB_SEUIL_ENCODE = 0.04045
const SRGB_PENTE = 12.92
const SRGB_ALPHA = 0.055
const SRGB_GAMMA = 2.4
const WCAG_R = 0.2126
const WCAG_V = 0.7152
const WCAG_B = 0.0722
/** Le 0,05 du rapport WCAG : la réflexion d'ambiance ajoutée aux deux luminances. */
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

/** Composantes linéaires d'une couleur CSS de la palette — `#rrggbb` ou `rgb(r v b)`. */
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

/** Luminance relative WCAG d'une couleur donnée en lumière linéaire. */
export function luminanceRelative(composantes: Composantes): number {
  return WCAG_R * composantes[0] + WCAG_V * composantes[1] + WCAG_B * composantes[2]
}

/** Rapport de contraste WCAG entre deux luminances relatives. */
export function rapportContraste(claire: number, sombre: number): number {
  return (claire + WCAG_AMBIANCE) / (sombre + WCAG_AMBIANCE)
}

/** Luminance du fond de référence : celui sur lequel la palette de jour a été choisie. */
export const LUMINANCE_FOND_REFERENCE = luminanceRelative(composantesDeCss(PALETTE_JOUR.fond))

/**
 * T-0102 — chromaticité de la lumière stellaire intégrée, normalisée pour que sa luminance WCAG
 * égale celle du fond de ciel.
 *
 * Sans cette normalisation, bande et fond à brillance de surface ÉGALE ne rendraient pas la même
 * luminance : `K_EXPOSITION_FOND_CIEL` — seule constante libre du modèle de fond — cesserait de
 * s'appliquer aux deux, et le contraste de la bande deviendrait un artefact du choix de teinte.
 * C'est le rapport R/V/B qui porte l'information physique (la teinte perçue, C-45 à C-47), pas son échelle.
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
 * T-0102 — le mode nuit ne cherche pas la fidélité photométrique mais la préservation de
 * l'adaptation à l'obscurité (§11.1) : la bande y passe au rouge pur, sans normalisation. Une
 * chromaticité (1, 0, 0) ne PEUT pas atteindre la luminance du fond — le rouge n'apporte que
 * 0,2126 de la luminance — et la forcer saturerait le canal au lieu d'éclairer.
 */
const CHROMA_BANDE_NUIT: Composantes = [1, 0, 0]

/**
 * T-0102 — la Voie lactée composée sur le fond de ciel : sa part de la brillance totale, et la
 * couleur de cette totale.
 *
 * Même patron que `dessineHaloLune` (T-0100) : la part sert d'opacité, la somme sert de couleur.
 * Les deux sont couplées, et c'est ce couplage qui fait le rendu juste — là où la bande domine,
 * la couleur composée est exactement celle du modèle ; là où elle s'efface, sa part multiplie
 * une couleur devenue indiscernable du fond, donc ne se voit pas. Aucun seuil n'est introduit.
 *
 * `deltaPeintOctets` dit ce que la tranche CHANGE réellement à l'écran : le canevas compose en
 * octets, donc le pixel obtenu vaut fond + part × (couleur − fond), et l'écart au fond se lit
 * en niveaux d'octet. Sous un demi-niveau, la tranche se peint sur elle-même — l'appelant s'en
 * sert pour ne pas la tracer. Ce n'est pas un seuil de rendu de plus : c'est la résolution de
 * la cible, et elle se mesure.
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
  // Le fond garde sa chromaticité propre : le mode nuit peint un canevas noir (§11.1), donc
  // seule la bande y apporte de la lumière.
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
    // Ce que la bande AJOUTE au fond, en octets : peint en `lighter` à l'opacité `part`, il
    // redonne exactement `couleur` sur le fond du zénith, et ne peut qu'éclaircir un fond
    // déjà relevé par les halos — la lumière s'additionne, elle ne recouvre pas.
    ajoutOctets: [Math.max(0, ecarts[0]), Math.max(0, ecarts[1]), Math.max(0, ecarts[2])],
  }
}

/**
 * Couleur du fond de ciel pour cette brillance de surface, en vue réaliste, l'œil adapté au
 * zénith `sbZenith` — par défaut la brillance elle-même.
 */
export function fondRealiste(sbCiel: number, sbZenith = sbCiel): string {
  return cssFond(composantesFond(sbCiel, sbZenith))
}

/**
 * Écrit une couleur linéaire déjà ramenée dans [0, 1] en octets sRGB opaques à `out[i..i+3]`.
 * Pour les couches peintes pixel par pixel : rien n'est alloué, pas même la chaîne CSS.
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

/** Hautes lumières compressées à teinte constante (`GENOU_HAUTES_LUMIERES`), pas écrêtées. */
function cssCompresse(c: readonly [number, number, number]): string {
  return css(compresseHautesLumieres(c) as Composantes)
}

/** Le fond seul : compressé à teinte constante, un horizon clair reste bleu pâle. */
function cssFond(c: readonly [number, number, number]): string {
  return css(compresseTeinte(c) as Composantes)
}

/**
 * T-0356 — fond relevé par la lumière du Soleil. Le fond `bFondNl` et le terme de Rayleigh
 * gardent la teinte du ciel ; celui de Mie, neutre, passe par le `rougissement` du trajet
 * solaire (`rougissement`). Soleil bas : Mie orangé autour de lui, rosé là où il se
 * mêle au bleu — le couchant sort de là, sans teinte choisie à la main.
 *
 * ponytail: le Rayleigh n'est pas rougi, sinon le zénith du couchant virerait à l'orange ; il
 * reste bleu dans la réalité par l'absorption de Chappuis de l'ozone, que rien ne modélise ici.
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
 * Retient une teinte de repère à SON rapport de contraste actuel contre le fond de jour
 * (`PALETTE_JOUR.fond`, celui de `LUMINANCE_FOND_REFERENCE`).
 *
 * Sans cela, `frontieres` passe de 2,14:1 à 1,15:1 sur un fond de Bortle 9 et disparaît —
 * exactement ce que §3.7 interdit. Préserver le rapport que chaque teinte a déjà évite
 * d'introduire un seuil arbitraire et de re-litiger la palette.
 *
 * ponytail: la luminance est relevée par une homothétie sur les trois canaux, donc à
 * chromaticité constante, puis chaque canal est écrêté à 1. Une teinte déjà proche du blanc —
 * `cadre`, `corps`, `texte` — ne PEUT pas garder un rapport de 10:1 ou 16:1 sur un fond de
 * Bortle 9 : le maximum atteignable y est 8,2:1, blanc pur compris. Elle sature donc, et
 * `saturee` le dit. C'est une limite du gamut de l'écran, pas un défaut du modèle.
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
 * Même retenue pour un voile (`rgb(r v b / a)`) : on compense le gris qu'il donne sur le fond
 * de référence (noir), puis on relève l'OPACITÉ jusqu'à ce que le voile posé sur `fond` atteigne
 * ce gris sur chaque canal. Le canevas compose en sRGB encodé : `f + a·(t − f)` par octet. Le
 * trait reste un voile, donc reste plus clair que les halos qu'il traverse.
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
 * Palette de vue réaliste : le fond prend la luminance du site, les repères la compensent.
 *
 * `sol` n'est pas compensé — le sol masque, il n'oriente pas, et l'éclaircir défait T-0094.
 * Le fond n'est pas compensé non plus : c'est lui la référence.
 *
 * ponytail: un seul résultat gardé en cache. La boucle de rendu appelle cette fonction par
 * image avec le même `sbCiel` pendant des milliers d'images ; recomposer neuf teintes à
 * chaque fois allouerait pour rien, et un cache par valeur n'aurait jamais plus d'une entrée.
 */
let cacheRealiste: { sb: number; palette: PaletteCiel } | null = null

/** Luminance du fond de ciel à cette brillance de surface : la référence de la compensation. */
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
    horizon: compense(PALETTE_JOUR.horizon),
    voieLactee: compense(PALETTE_JOUR.voieLactee),
    parcours: compense(PALETTE_JOUR.parcours),
    texte: compense(PALETTE_JOUR.texte),
  })
  cacheRealiste = { sb: sbCiel, palette: composee }
  return composee
}

/**
 * La palette de la scène : mode nuit d'abord — il protège l'adaptation à l'obscurité, et
 * éclaircir tout le canevas le rendrait inutile. En mode nuit, la vue réaliste ne change donc
 * que la magnitude limite (§11.1).
 */
export function paletteScene(modeNuit: boolean, vueRealiste: boolean, sbCiel: number): PaletteCiel {
  if (modeNuit || !vueRealiste) return palette(modeNuit)
  return paletteRealiste(sbCiel)
}
