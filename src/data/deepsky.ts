/**
 * §12.2 — Binary deep-sky catalogue encoding. Like stars: fixed-size records, strings in a
 * separate block indexed by offset. 28 bytes/object + strings ≈ 0,8 Mo for ~14 000 OpenNGC
 * entries, under §12.2 budget 1,2 Mo.
 * Absent fields carry a sentinel, not zero: no integrated magnitude → [DONNÉE MANQUANTE], not
 * magnitude 0 (§6.3).
 */

import { dUnBloc, pointDeCoupe, type Decoupable } from '../core/tranches.ts'

const OCTETS_PAR_OBJET = 28

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

/** Absence sentinels, distinct from any plausible value. */
const ABSENT_U16 = 0xffff
const ABSENT_I16 = -32768

/** Separator between main designation and common names. */
const SEPARATEUR_NOMS = '\u001f'

/** §6.3 types: drive Moon tolerance and filter advice. */
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
  /** Main designation: « M31 », « NGC0224 », « Sh2-276 ». */
  readonly designation: string
  /** Common names separated by « | »; empty if none. */
  readonly nomsCommuns: string
  readonly adDeg: number
  readonly decDeg: number
  readonly type: TypeObjet
  /** Major axis, arcmin; `null` if catalogue lacks it. */
  readonly majAxArcmin: number | null
  readonly minAxArcmin: number | null
  /** Major-axis position angle, deg; often absent (§6.2). */
  readonly posAngDeg: number | null
  /** Integrated visual magnitude; `null` → no détectabilité verdict (§6.3). */
  readonly vMag: number | null
  readonly bMag: number | null
  /** Published surface brightness, if catalogue gives it. */
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
 * T-0317 — size under package resolution (0,05′) encodes ABSENT, never zero: rounded to 0 → null
 * area → SB = m + 2,5 log10(0) = −∞ (§6.3), target infinitely bright (9 small planetary nebulae).
 * Position angle keeps `encodeU16`: zero is real there.
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
 * T-0296 — decode names its cut points; see `decodeEtoilesPas` (same reason, same driving):
 * `dUnBloc` outside browser, `parTranches` on screen.
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
