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
import { composantesFond } from '../core/fond-ciel-rendu.ts'

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
  const borne = Math.max(min, Math.min(max, bv))
  const index = Math.round(((borne - min) / (max - min)) * (TEINTES - 1))
  return Math.max(0, Math.min(TEINTES - 1, index))
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
  frontieres: 'rgb(55 0 0)',
  asterismes: 'rgb(140 0 0)',
  corps: 'rgb(190 0 0)',
  cadre: 'rgb(246 0 0)',
  horizon: 'rgb(70 0 0)',
  sol: 'rgb(18 0 0)',
  voieLactee: 'rgb(110 0 0)',
  parcours: 'rgb(250 0 0)',
  texte: 'rgb(170 0 0)',
})

/**
 * T-0113 — la scène partage la palette de l'interface.
 *
 * Le canevas et la feuille de style peignent le même écran : deux familles de teintes y
 * font deux applications superposées. Les repères de tracé reprennent donc les jetons de
 * `styles.css` — gris filaire pour ce que l'instrument dessine, bleu glace pour ce qu'il vise, ambre
 * pour les corps du système solaire. La Voie lactée garde une teinte froide : c'est la
 * seule structure peinte qui ne soit ni un tracé de l'instrument ni un objet pointé, et
 * l'écart de teinte est ce qui la sépare des astérismes sans la rendre plus lumineuse.
 *
 * Les couleurs d'étoile ne sont pas ici : elles viennent de l'indice B−V (§3.3), c'est une
 * mesure, pas une décision de dessin.
 *
 * CE QUE LA SCÈNE EMPRUNTE À L'INTERFACE EST TENU ÉGAL À SON JETON. Le cadre du matériel est
 * une commande posée sur le ciel — il prend `--accent` ; le parcours de pointage est un tracé de
 * l'interface — il prend `--texte`. Les deux jours, puis la nuit au facteur nominal.
 * Le canevas ne lit pas la feuille de style : c'est `mode-nuit.test.tsx` qui compare, et une
 * origine changée dans `styles.css` sans être reportée ici fait échouer `pnpm test`. Le cadre
 * avait dérivé de l'accent sans que rien ne le dise.
 */
const PALETTE_JOUR: PaletteCiel = Object.freeze({
  fond: '#000000',
  figures: 'rgb(110 110 110)',
  frontieres: 'rgb(52 52 52)',
  asterismes: 'rgb(170 170 170)',
  corps: 'rgb(244 199 106)',
  cadre: 'rgb(139 255 239)',
  horizon: 'rgb(150 150 150)',
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
  const borne = Math.min(1, Math.max(0, lineaire))
  const encode =
    borne <= SRGB_SEUIL_LINEAIRE
      ? borne * SRGB_PENTE
      : (1 + SRGB_ALPHA) * borne ** (1 / SRGB_GAMMA) - SRGB_ALPHA
  return Math.round(encode * OCTET_MAX)
}

const HEXA = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const RVB = /^rgb\((\d+) (\d+) (\d+)\)$/

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
 * C'est le rapport R/V/B qui porte l'information physique (B−V ≈ +0,9), pas son échelle.
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
): { readonly couleur: string; readonly part: number; readonly deltaPeintOctets: number } {
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
  const ecartOctets = Math.max(
    Math.abs(versOctet(composee[0]) - versOctet(fond[0])),
    Math.abs(versOctet(composee[1]) - versOctet(fond[1])),
    Math.abs(versOctet(composee[2]) - versOctet(fond[2])),
  )
  return {
    couleur: css(composee),
    part,
    deltaPeintOctets: part * ecartOctets,
  }
}

/** Couleur du fond de ciel pour cette brillance de surface, en vue réaliste. */
export function fondRealiste(sbCiel: number): string {
  return css(composantesFond(sbCiel) as Composantes)
}

/**
 * Retient une teinte de repère à SON rapport de contraste actuel contre `#05070d`.
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
  const fond = fondRealiste(sbCiel)
  const luminanceFond = luminanceFondRealiste(sbCiel)
  const compense = (teinte: string): string =>
    ajusteContrasteSurFond(teinte, luminanceFond).couleur
  const composee: PaletteCiel = Object.freeze({
    ...PALETTE_JOUR,
    fond,
    figures: compense(PALETTE_JOUR.figures),
    frontieres: compense(PALETTE_JOUR.frontieres),
    asterismes: compense(PALETTE_JOUR.asterismes),
    corps: compense(PALETTE_JOUR.corps),
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
