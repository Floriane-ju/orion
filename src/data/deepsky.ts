/**
 * §12.2 — Encodage binaire du catalogue d'objets du ciel profond.
 *
 * Même principe que les étoiles : enregistrements de taille fixe, chaînes déportées dans
 * un bloc séparé indexé par offset. 28 octets par objet plus les chaînes, soit environ
 * 0,8 Mo pour les ~14 000 entrées d'OpenNGC, sous le budget de 1,2 Mo de §12.2.
 *
 * Les champs absents portent une sentinelle plutôt qu'un zéro : un objet sans magnitude
 * intégrée affiche [DONNÉE MANQUANTE], il ne reçoit pas une magnitude 0 (§6.3).
 */

import { dUnBloc, pointDeCoupe, type Decoupable } from '../core/tranches.ts'

export const OCTETS_PAR_OBJET = 28

const OFFSET_AD = 0
const OFFSET_DEC = 4
const OFFSET_MAJ_AX = 8
const OFFSET_MIN_AX = 10
const OFFSET_POS_ANG = 12
const OFFSET_V_MAG = 14
const OFFSET_B_MAG = 16
const OFFSET_SURF_BR = 18
const OFFSET_TYPE = 20
const OFFSET_NOM_POS = 22
const OFFSET_NOM_LEN = 26

const ECHELLE_ARCMIN = 10
const ECHELLE_DEG = 10
const ECHELLE_MAG = 100

const LITTLE_ENDIAN = true

/** Sentinelles d'absence : distinctes de toute valeur physique plausible. */
const ABSENT_U16 = 0xffff
const ABSENT_I16 = -32768

/** Séparateur entre la désignation principale et les noms communs. */
export const SEPARATEUR_NOMS = '\u001f'

/** Types de §6.3, qui pilotent la tolérance à la Lune et le conseil filtre. */
export const TYPES_OBJET = [
  'INCONNU',
  'GALAXIE',
  'AMAS_OUVERT',
  'AMAS_GLOB',
  'NEB_PLANETAIRE',
  'EMISSION',
  'REFLEXION',
  'NEB_OBSCURE',
  'RESTE_SUPERNOVA',
  'AUTRE',
] as const

export type TypeObjet = (typeof TYPES_OBJET)[number]

export interface ObjetCielProfond {
  /** Désignation principale : « M31 », « NGC0224 », « Sh2-276 ». */
  readonly designation: string
  /** Noms communs, séparés par « | ». Chaîne vide si aucun. */
  readonly nomsCommuns: string
  readonly adDeg: number
  readonly decDeg: number
  readonly type: TypeObjet
  /** Grand axe, en minutes d'arc. `null` si le catalogue ne le donne pas. */
  readonly majAxArcmin: number | null
  readonly minAxArcmin: number | null
  /** Angle de position du grand axe, en degrés. Souvent absent du catalogue (§6.2). */
  readonly posAngDeg: number | null
  /** Magnitude visuelle intégrée. `null` → aucun verdict de détectabilité (§6.3). */
  readonly vMag: number | null
  readonly bMag: number | null
  /** Brillance de surface publiée, quand le catalogue la donne. */
  readonly surfBr: number | null
}

export interface PaquetCielProfond {
  readonly enregistrements: ArrayBuffer
  readonly chaines: ArrayBuffer
}

function encodeU16(valeur: number | null, echelle: number): number {
  if (valeur === null || !Number.isFinite(valeur)) return ABSENT_U16
  const brut = Math.round(valeur * echelle)
  return brut < 0 || brut >= ABSENT_U16 ? ABSENT_U16 : brut
}

function decodeU16(brut: number, echelle: number): number | null {
  return brut === ABSENT_U16 ? null : brut / echelle
}

/**
 * T-0317 — une taille sous la résolution du paquet (0,05′) s'encode ABSENTE, jamais nulle.
 *
 * Arrondie à zéro, elle donne une aire nulle, donc SB = m + 2,5 log10(0) = −∞ (§6.3) : la
 * cible se retrouve infiniment brillante alors que le paquet ne sait simplement pas la
 * mesurer. Neuf nébuleuses planétaires de quelques secondes d'arc étaient dans ce cas.
 * L'angle de position garde `encodeU16` : pour lui, zéro est une vraie valeur.
 */
function encodeTailleU16(valeur: number | null): number {
  const brut = encodeU16(valeur, ECHELLE_ARCMIN)
  return brut === 0 ? ABSENT_U16 : brut
}

function encodeI16(valeur: number | null, echelle: number): number {
  if (valeur === null || !Number.isFinite(valeur)) return ABSENT_I16
  const brut = Math.round(valeur * echelle)
  return brut <= ABSENT_I16 || brut > 32767 ? ABSENT_I16 : brut
}

function decodeI16(brut: number, echelle: number): number | null {
  return brut === ABSENT_I16 ? null : brut / echelle
}

export function encodeObjets(objets: readonly ObjetCielProfond[]): PaquetCielProfond {
  const encodeur = new TextEncoder()
  const morceaux: Uint8Array[] = []
  let curseur = 0

  const buffer = new ArrayBuffer(objets.length * OCTETS_PAR_OBJET)
  const vue = new DataView(buffer)

  for (let i = 0; i < objets.length; i++) {
    const o = objets[i]!
    const base = i * OCTETS_PAR_OBJET
    const chaine = encodeur.encode(o.designation + SEPARATEUR_NOMS + o.nomsCommuns)
    morceaux.push(chaine)

    vue.setFloat32(base + OFFSET_AD, o.adDeg, LITTLE_ENDIAN)
    vue.setFloat32(base + OFFSET_DEC, o.decDeg, LITTLE_ENDIAN)
    vue.setUint16(base + OFFSET_MAJ_AX, encodeTailleU16(o.majAxArcmin), LITTLE_ENDIAN)
    vue.setUint16(base + OFFSET_MIN_AX, encodeTailleU16(o.minAxArcmin), LITTLE_ENDIAN)
    vue.setUint16(base + OFFSET_POS_ANG, encodeU16(o.posAngDeg, ECHELLE_DEG), LITTLE_ENDIAN)
    vue.setInt16(base + OFFSET_V_MAG, encodeI16(o.vMag, ECHELLE_MAG), LITTLE_ENDIAN)
    vue.setInt16(base + OFFSET_B_MAG, encodeI16(o.bMag, ECHELLE_MAG), LITTLE_ENDIAN)
    vue.setInt16(base + OFFSET_SURF_BR, encodeI16(o.surfBr, ECHELLE_MAG), LITTLE_ENDIAN)
    vue.setUint8(base + OFFSET_TYPE, Math.max(0, TYPES_OBJET.indexOf(o.type)))
    vue.setUint32(base + OFFSET_NOM_POS, curseur, LITTLE_ENDIAN)
    vue.setUint16(base + OFFSET_NOM_LEN, chaine.byteLength, LITTLE_ENDIAN)
    curseur += chaine.byteLength
  }

  const chaines = new Uint8Array(curseur)
  let position = 0
  for (const morceau of morceaux) {
    chaines.set(morceau, position)
    position += morceau.byteLength
  }

  return { enregistrements: buffer, chaines: chaines.buffer }
}

/**
 * T-0296 — le décodage nomme ses points de coupe. Voir `decodeEtoilesPas` : même raison,
 * même pilotage — `dUnBloc` hors navigateur, `parTranches` à l'écran.
 */
export function* decodeObjetsPas(paquet: PaquetCielProfond): Decoupable<ObjetCielProfond[]> {
  const vue = new DataView(paquet.enregistrements)
  const octetsChaines = new Uint8Array(paquet.chaines)
  const decodeur = new TextDecoder()
  const n = Math.floor(paquet.enregistrements.byteLength / OCTETS_PAR_OBJET)
  const objets: ObjetCielProfond[] = new Array(n)

  for (let i = 0; i < n; i++) {
    if (pointDeCoupe(i)) yield
    const base = i * OCTETS_PAR_OBJET
    const debut = vue.getUint32(base + OFFSET_NOM_POS, LITTLE_ENDIAN)
    const longueur = vue.getUint16(base + OFFSET_NOM_LEN, LITTLE_ENDIAN)
    const brut = decodeur.decode(octetsChaines.subarray(debut, debut + longueur))
    const [designation = '', nomsCommuns = ''] = brut.split(SEPARATEUR_NOMS)

    objets[i] = {
      designation,
      nomsCommuns,
      adDeg: vue.getFloat32(base + OFFSET_AD, LITTLE_ENDIAN),
      decDeg: vue.getFloat32(base + OFFSET_DEC, LITTLE_ENDIAN),
      type: TYPES_OBJET[vue.getUint8(base + OFFSET_TYPE)] ?? 'INCONNU',
      majAxArcmin: decodeU16(vue.getUint16(base + OFFSET_MAJ_AX, LITTLE_ENDIAN), ECHELLE_ARCMIN),
      minAxArcmin: decodeU16(vue.getUint16(base + OFFSET_MIN_AX, LITTLE_ENDIAN), ECHELLE_ARCMIN),
      posAngDeg: decodeU16(vue.getUint16(base + OFFSET_POS_ANG, LITTLE_ENDIAN), ECHELLE_DEG),
      vMag: decodeI16(vue.getInt16(base + OFFSET_V_MAG, LITTLE_ENDIAN), ECHELLE_MAG),
      bMag: decodeI16(vue.getInt16(base + OFFSET_B_MAG, LITTLE_ENDIAN), ECHELLE_MAG),
      surfBr: decodeI16(vue.getInt16(base + OFFSET_SURF_BR, LITTLE_ENDIAN), ECHELLE_MAG),
    }
  }
  return objets
}

export function decodeObjets(paquet: PaquetCielProfond): ObjetCielProfond[] {
  return dUnBloc(decodeObjetsPas(paquet))
}
