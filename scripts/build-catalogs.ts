/**
 * §12.2 — Génération des paquets de données binaires.
 *
 * Télécharge les catalogues publics, les filtre, les encode et écrit `public/data/`.
 * Lancé explicitement par `pnpm data:build`, jamais au `postinstall` : pnpm bloque les
 * scripts de cycle de vie par défaut et c'est une protection à conserver.
 *
 * Les binaires produits sont versionnés dans le dépôt avec leur manifeste, de sorte qu'un
 * clone n'ait pas besoin du réseau pour démarrer.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { K } from '../src/registry/constants.ts'
import { aireEllipseArcsec2 } from '../src/core/detectability.ts'
import { encodeEtoiles, sha256Hex, type Etoile } from '../src/data/catalog.ts'
import {
  encodeObjets,
  type ObjetCielProfond,
  type TypeObjet,
} from '../src/data/deepsky.ts'
import {
  encodeConstellations,
  type AreteFrontiere,
  type Asterisme,
  type EtoileNommee,
  type Figure,
  type Segment,
  type TypeArete,
} from '../src/data/constellations.ts'
import { encodeFondCarte, type FondCarteSource, type VilleSource } from '../src/data/fond-carte.ts'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOSSIER_SORTIE = join(RACINE, 'public', 'data')

/**
 * Sources amont — toutes épinglées à un SHA de commit, jamais à une branche.
 *
 * Une branche (`main`, `master`) ou un alias (`CURRENT`) désigne ce que l’amont y met
 * aujourd’hui : le contenu peut changer sous nos pieds — accident, ou compromission du
 * dépôt — sans que rien ne le signale, et le manifeste régénéré certifierait le résultat
 * de bonne foi. Un SHA de commit rend l’adresse immuable ; l’empreinte ci-dessous atteste
 * que les octets reçus sont bien ceux qui ont été relus.
 *
 * Mettre à jour une source, dans cet ordre :
 *   1. Repérer le commit voulu chez l’amont, p. ex.
 *      `gh api "repos/<dépôt>/commits?path=<chemin>&per_page=1" --jq '.[0].sha'`
 *   2. Lire le diff amont depuis le SHA actuellement épinglé. Un changement de données
 *      s’explique (nouvelle version du catalogue, correction publiée) ou ne s’explique pas.
 *   3. Télécharger le fichier à ce SHA et calculer `shasum -a 256 <fichier>`.
 *   4. Relever `url` **et** `sha256` ensemble, dans le même commit : l’un sans l’autre
 *      arrête la construction, ce qui est le comportement voulu.
 *   5. `pnpm data:build`, puis relire le diff des `.bin` et du manifeste.
 */
interface SourceEpinglee {
  /** Nommée par le message d’interruption : c’est ce que l’on ira vérifier chez l’amont. */
  readonly nom: string
  readonly url: string
  /** Empreinte des octets **téléchargés** — le manifeste, lui, couvre le paquet produit. */
  readonly sha256: string
}

/**
 * Le PRD nomme « HYG v3 ». Le projet amont a depuis publié la v4.1 sous `hyg/CURRENT`, et
 * ne sert plus la v3 à son ancienne adresse. Même base de données, version postérieure.
 */
const SOURCE_HYG: SourceEpinglee = {
  nom: 'HYG v4.1 (hygdata_v41.csv)',
  url:
    'https://raw.githubusercontent.com/astronexus/HYG-Database/' +
    '3bf37f4b2d5460e1278286320d1d62fab9b493c1/hyg/CURRENT/hygdata_v41.csv',
  sha256: 'd9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd',
}
const SOURCE_OPENNGC: SourceEpinglee = {
  nom: 'OpenNGC (NGC.csv)',
  url:
    'https://raw.githubusercontent.com/mattiaverga/OpenNGC/' +
    'da90466031b0372c896588b85be6016c617e205b/database_files/NGC.csv',
  sha256: 'be150bdaa1997dacbcb39f303074403edec7a953b589b36d5f1c4522c0cc6fae',
}
/**
 * OpenNGC range hors de `NGC.csv` les objets qui ne portent ni numéro NGC ni numéro IC —
 * dont M45, les Pléiades, cataloguées « Mel022 ». Sans ce second fichier, quatre Messier
 * (M24, M40, M45, M102) manquent au catalogue et restent introuvables. Même en-tête, même
 * séparateur : les deux se lisent avec le même analyseur.
 */
const SOURCE_OPENNGC_ADDENDUM: SourceEpinglee = {
  nom: 'OpenNGC (addendum.csv)',
  url:
    'https://raw.githubusercontent.com/mattiaverga/OpenNGC/' +
    '9609f2f29e2d6b108b16f2bfe810aab82f27aa95/database_files/addendum.csv',
  sha256: '1d8f0914e643ada325a5a94d88d8fefad6a4937a2f77cc34f21483af22b11983',
}
/**
 * §3.4 — un seul fichier porte les trois couches : figures (culture occidentale), astérismes
 * et frontières IAU de Delporte en coordonnées B1875. C'est le jeu de référence que le PRD
 * nomme, sous licence libre.
 */
const SOURCE_STELLARIUM: SourceEpinglee = {
  nom: 'Stellarium (culture « modern »)',
  url:
    'https://raw.githubusercontent.com/Stellarium/stellarium/' +
    'daace2add6a1bf886e8ee1934f51e9c69f818d18/skycultures/modern/index.json',
  sha256: '1f2f5ffd6c9e25a7d0dcfdbf1f756e2db03dd3b8ed4ec016a2839b09f6b0fe1e',
}

/**
 * §6.1 — Sharpless et Barnard, obligatoires au MVP. OpenNGC ne décrit pas les complexes
 * nébuleux de plusieurs degrés, qui sont précisément le domaine d'un setup grand champ :
 * la Boucle de Barnard est Sh2-276, absente de NGC comme d'IC.
 *
 * Le catalogue DSO de Stellarium porte les deux dans un seul fichier, avec les renvois
 * croisés NGC/IC qui servent à écarter les doublons.
 */
const SOURCE_STELLARIUM_DSO: SourceEpinglee = {
  nom: 'Stellarium (catalogue DSO v3.23)',
  url:
    'https://raw.githubusercontent.com/Stellarium/stellarium/' +
    '9ca023a97f344975e1faa96f91b20a4c18a7c02b/nebulae/default/catalog.txt',
  sha256: '38a7c8c19b07bb3b2a659769acf4e5611a261732727d8e541c52ce691ab607aa',
}
/**
 * Les noms d'usage vivent hors du catalogue, dans un second fichier de la même version.
 * Sans lui, Sh2-276 n'est qu'un numéro : « Barnard's Loop » ne se cherche plus (T-0052).
 */
const SOURCE_STELLARIUM_DSO_NOMS: SourceEpinglee = {
  nom: 'Stellarium (noms DSO v3.23)',
  url:
    'https://raw.githubusercontent.com/Stellarium/stellarium/' +
    '9ca023a97f344975e1faa96f91b20a4c18a7c02b/nebulae/default/names.dat',
  sha256: 'f66313ecbeb2bb3c0c98f1d24852fa586217a3ca87ae456394f123752091de8e',
}

/** §3.3 : HYG est complet jusqu'à magnitude ≈ 9. Au-delà, le catalogue n'est plus fiable. */
/** Natural Earth au 1:50 M — le fond embarqué de la carte du site (T-0364). */
const COMMIT_NATURAL_EARTH = 'ca96624a56bd078437bca8184e78163e5039ad19'
const urlNaturalEarth = (fichier: string): string =>
  `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${COMMIT_NATURAL_EARTH}/geojson/${fichier}.geojson`
const SOURCE_NE_TERRES: SourceEpinglee = {
  nom: 'Natural Earth (ne_50m_land)',
  url: urlNaturalEarth('ne_50m_land'),
  sha256: 'e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b',
}
const SOURCE_NE_FRONTIERES: SourceEpinglee = {
  nom: 'Natural Earth (ne_50m_admin_0_boundary_lines_land)',
  url: urlNaturalEarth('ne_50m_admin_0_boundary_lines_land'),
  sha256: '2faac4f6b34386f3d21b6e018cf151f241f00e5c936d44dd17d7d9bfb147fa48',
}
const SOURCE_NE_VILLES: SourceEpinglee = {
  nom: 'Natural Earth (ne_50m_populated_places_simple)',
  url: urlNaturalEarth('ne_50m_populated_places_simple'),
  sha256: '8e70756b39fae9bcdc1e332bfc510c024c5edd3a13203ffd20092ee37b61d978',
}

const MAG_LIMITE_HYG = 9
const VERSION_PAQUETS = '1'

const DEG_PAR_HEURE = 360 / 24

interface ManifestePaquet {
  nom: string
  version: string
  nombreEntrees: number
  octets: number
  sha256: string
  source: string
  obligatoire: boolean
}

async function telecharge(source: SourceEpinglee): Promise<string> {
  process.stdout.write(`  téléchargement ${source.url}\n`)
  const reponse = await fetch(source.url)
  if (!reponse.ok) {
    throw new Error(
      `Téléchargement impossible (${reponse.status}) : ${source.url}\n` +
        'Vérifier le réseau, ou l’adresse du catalogue si le projet amont l’a déplacée.',
    )
  }
  const octets = await reponse.arrayBuffer()
  const empreinte = await sha256Hex(octets)
  if (empreinte !== source.sha256) {
    throw new Error(
      `Source modifiée depuis son épinglage : ${source.nom}\n` +
        `  ${source.url}\n` +
        `  empreinte attendue : ${source.sha256}\n` +
        `  empreinte reçue    : ${empreinte}\n` +
        'À SHA de commit constant, le contenu ne devrait pas bouger. Vérifier l’amont ' +
        'avant tout : lire le diff du fichier depuis le SHA épinglé et s’assurer que le ' +
        'changement est légitime. S’il l’est, relever le SHA dans l’URL et cette ' +
        'empreinte ensemble (procédure en tête de ce script). Sinon, ne rien relever et ' +
        'signaler la source.',
    )
  }
  return new TextDecoder().decode(octets)
}

/** Découpe une ligne CSV en respectant les champs entre guillemets. */
function champsCsv(ligne: string, separateur: string): string[] {
  const champs: string[] = []
  let courant = ''
  let entreGuillemets = false
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]!
    if (c === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') {
        courant += '"'
        i++
      } else {
        entreGuillemets = !entreGuillemets
      }
    } else if (c === separateur && !entreGuillemets) {
      champs.push(courant)
      courant = ''
    } else {
      courant += c
    }
  }
  champs.push(courant)
  return champs
}

function nombreOuNull(brut: string | undefined): number | null {
  if (brut === undefined) return null
  const nettoye = brut.trim()
  if (nettoye === '') return null
  const valeur = Number(nettoye)
  return Number.isFinite(valeur) ? valeur : null
}

function analyseCsv(contenu: string, separateur: string): Map<string, string>[] {
  const lignes = contenu.split('\n').filter((l) => l.trim() !== '')
  const entetes = champsCsv(lignes[0]!, separateur).map((e) => e.replace(/"/g, '').trim())
  return lignes.slice(1).map((ligne) => {
    const valeurs = champsCsv(ligne, separateur)
    const enregistrement = new Map<string, string>()
    entetes.forEach((entete, i) => enregistrement.set(entete, valeurs[i] ?? ''))
    return enregistrement
  })
}

function construitEtoiles(csv: string): Etoile[] {
  const etoiles: Etoile[] = []
  for (const ligne of analyseCsv(csv, ',')) {
    const mag = nombreOuNull(ligne.get('mag'))
    const adH = nombreOuNull(ligne.get('ra'))
    const dec = nombreOuNull(ligne.get('dec'))
    if (mag === null || adH === null || dec === null) continue
    if (mag > MAG_LIMITE_HYG) continue
    // L'entrée « Sol » du catalogue est le Soleil vu depuis lui-même : distance nulle.
    if (nombreOuNull(ligne.get('dist')) === 0) continue
    etoiles.push({
      adDeg: adH * DEG_PAR_HEURE,
      decDeg: dec,
      magV: mag,
      bv: nombreOuNull(ligne.get('ci')) ?? 0,
    })
  }
  return etoiles
}

/** Correspondance des codes OpenNGC vers les types de §6.3. */
const TYPES_OPENNGC: Readonly<Record<string, TypeObjet>> = {
  G: 'GALAXIE',
  GPair: 'GALAXIE',
  GTrpl: 'GALAXIE',
  GGroup: 'GALAXIE',
  PN: 'NEB_PLANETAIRE',
  OCl: 'AMAS_OUVERT',
  GCl: 'AMAS_GLOB',
  'Cl+N': 'AMAS_OUVERT',
  HII: 'EMISSION',
  EmN: 'EMISSION',
  RfN: 'REFLEXION',
  DrkN: 'NEB_OBSCURE',
  SNR: 'RESTE_SUPERNOVA',
  Neb: 'AUTRE',
  Nova: 'AUTRE',
}

/** Entrées sans objet réel : doublons, non-existants, étoiles simples ou doubles. */
const TYPES_IGNORES = new Set(['Dup', 'NonEx', '*', '**', '*Ass'])

function sexagesimalVersDeg(brut: string | undefined, uniteParHeure: number): number | null {
  if (brut === undefined || brut.trim() === '') return null
  const morceaux = brut.trim().split(':').map(Number)
  const [a, b = 0, c = 0] = morceaux
  if (a === undefined || !Number.isFinite(a)) return null
  const SECONDES_PAR_MINUTE = 60
  const MINUTES_PAR_UNITE = 60
  const signe = brut.trim().startsWith('-') ? -1 : 1
  const magnitude =
    Math.abs(a) + b / MINUTES_PAR_UNITE + c / (MINUTES_PAR_UNITE * SECONDES_PAR_MINUTE)
  return signe * magnitude * uniteParHeure
}

function construitObjets(csv: string): ObjetCielProfond[] {
  const objets: ObjetCielProfond[] = []
  for (const ligne of analyseCsv(csv, ';')) {
    const codeType = (ligne.get('Type') ?? '').trim()
    if (TYPES_IGNORES.has(codeType)) continue

    const adDeg = sexagesimalVersDeg(ligne.get('RA'), DEG_PAR_HEURE)
    const decDeg = sexagesimalVersDeg(ligne.get('Dec'), 1)
    if (adDeg === null || decDeg === null) continue

    const messier = (ligne.get('M') ?? '').trim()
    const nom = (ligne.get('Name') ?? '').trim()
    const type = TYPES_OPENNGC[codeType] ?? 'INCONNU'
    const diffuse = TYPES_DIFFUS.has(type) || codeType === CODE_NEBULEUSE_GENERIQUE
    // T-0317 — `positifOuNull` et non `nombreOuNull` : OpenNGC écrit 0 pour une dimension
    // qu'il ne connaît pas, et un grand axe nul donne une aire nulle, donc une brillance de
    // surface infiniment brillante. Le complément lisait déjà ses tailles ainsi.
    const majAxArcmin = positifOuNull(ligne.get('MajAx'))
    const minAxArcmin = positifOuNull(ligne.get('MinAx'))
    objets.push({
      // OpenNGC écrit le numéro Messier sur trois chiffres : « 031 » devient « M31 ».
      designation: messier === '' ? nom : `M${Number(messier)}`,
      nomsCommuns: [(ligne.get('Common names') ?? '').trim(), messier === '' ? '' : nom]
        .filter((n) => n !== '')
        .join('|'),
      adDeg,
      decDeg,
      type,
      majAxArcmin,
      minAxArcmin,
      posAngDeg: positifOuNull(ligne.get('PosAng')),
      vMag: magnitudeDeNebuleuse(diffuse, nombreOuNull(ligne.get('V-Mag')), majAxArcmin, minAxArcmin),
      bMag: magnitudeDeNebuleuse(diffuse, nombreOuNull(ligne.get('B-Mag')), majAxArcmin, minAxArcmin),
      surfBr: nombreOuNull(ligne.get('SurfBr')),
    })
  }
  return objets
}

// ---------------------------------------------------------------------------
// §6.1 — Sharpless et Barnard, extraits du catalogue DSO de Stellarium
// ---------------------------------------------------------------------------

/** Colonnes du catalogue DSO, numérotées comme son en-tête (1 → indice 0). */
const COL_AD = 1
const COL_DEC = 2
const COL_B_MAG = 3
const COL_V_MAG = 4
const COL_TYPE = 5
const COL_MAJ_AX = 7
const COL_MIN_AX = 8
const COL_POS_ANG = 9
const COL_NGC = 16
const COL_IC = 17
const COL_BARNARD = 20
const COL_SHARPLESS = 21

/**
 * Stellarium écrit 99 pour « magnitude inconnue ». Encodée telle quelle, elle donnerait
 * une nébuleuse obscure « de magnitude 99 » plutôt qu'une magnitude absente (§6.3), et un
 * verdict de détectabilité serait rendu sur une valeur qui n'en est pas une.
 *
 * T-0266 — pour les nébuleuses obscures, le 99 n'est que sur la colonne B : la colonne V
 * porte un ENTIER de 1 à 6 sur les 343 entrées Barnard du catalogue, soit la classe
 * d'opacité de Barnard, pas une magnitude. Une nébuleuse obscure n'émet pas, elle absorbe :
 * elle n'a aucune magnitude intégrée, dans aucune bande. Lue comme telle, la classe 1 de
 * B144 devenait « magnitude 1 », donc SB = m + 2,5 log(aire) sur une grandeur qui n'est pas
 * un flux, donc verdict ŒIL_NU et facilité 5/5 en tête du plan de nuit — exactement le
 * piège que §6.3 existe pour éviter. B33, qui vient d'OpenNGC, n'a jamais porté de
 * magnitude : les deux moitiés du catalogue disent enfin la même chose.
 */
const MAG_INCONNUE_DSO = 99

/** Correspondance des codes de type du catalogue DSO vers les types de §6.3. */
const TYPES_DSO: Readonly<Record<string, TypeObjet>> = {
  DN: 'NEB_OBSCURE',
  MoC: 'NEB_OBSCURE',
  HII: 'EMISSION',
  EN: 'EMISSION',
  RN: 'REFLEXION',
  PN: 'NEB_PLANETAIRE',
  SNR: 'RESTE_SUPERNOVA',
  OpC: 'AMAS_OUVERT',
  GlC: 'AMAS_GLOB',
  G: 'GALAXIE',
  Gx: 'GALAXIE',
  GiG: 'GALAXIE',
  YSO: 'AUTRE',
}

/**
 * Le catalogue d'origine porte le type quand Stellarium ne le donne pas.
 *
 * Sept entrées Sharpless sont typées « étoile » : Stellarium y désigne l'étoile excitatrice
 * plutôt que la nébulosité. Les écarter perdrait Sh2-308 (Dolphin Head) et Sh2-9, deux
 * cibles grand champ de vingt minutes d'arc. Un numéro Sh2 désigne une région HII, un
 * numéro B une nébuleuse obscure : c'est le catalogue qui tranche, pas l'étiquette.
 */
function typeDso(codeType: string, sharpless: number): TypeObjet {
  return TYPES_DSO[codeType] ?? (sharpless > 0 ? 'EMISSION' : 'NEB_OBSCURE')
}

/**
 * Les désignations NGC et IC déjà portées par OpenNGC.
 *
 * OpenNGC range le numéro NGC dans les noms communs quand l'objet est un Messier : la
 * désignation seule laisserait passer M42 en doublon de son entrée Sharpless.
 */
function extraitDesignationsNgcIc(objets: readonly ObjetCielProfond[]): Set<string> {
  const presentes = new Set<string>()
  for (const objet of objets) {
    for (const nom of [objet.designation, ...objet.nomsCommuns.split('|')]) {
      const trouve = /^(NGC|IC)(\d+)/.exec(nom.trim())
      if (trouve !== null) presentes.add(`${trouve[1]}${Number(trouve[2])}`)
    }
  }
  return presentes
}

/**
 * Noms d'usage du catalogue DSO, indexés par « SH2 276 » ou « B 33 ».
 *
 * Format d'une ligne : préfixe, numéro, puis le nom entre `_("…")`. Un même objet peut en
 * porter plusieurs — « Barnard's Loop » et « Barnard's Arc » —, tous conservés.
 */
function analyseNomsDso(contenu: string): Map<string, string[]> {
  const noms = new Map<string, string[]>()
  for (const ligne of contenu.split('\n')) {
    if (ligne.startsWith('#')) continue
    const trouve = /^(\S+)\s+(\S+)\s+_\("(.+?)"\)/.exec(ligne)
    if (trouve === null) continue
    const cle = `${trouve[1]} ${Number(trouve[2])}`
    const deja = noms.get(cle)
    if (deja === undefined) noms.set(cle, [trouve[3]!])
    else deja.push(trouve[3]!)
  }
  return noms
}

/** Une taille ou un angle à zéro est l'absence de mesure, pas une mesure nulle. */
function positifOuNull(brut: string | undefined): number | null {
  const valeur = nombreOuNull(brut)
  return valeur === null || valeur <= 0 ? null : valeur
}

function magnitudeDso(brut: string | undefined): number | null {
  const valeur = nombreOuNull(brut)
  return valeur === null || valeur >= MAG_INCONNUE_DSO ? null : valeur
}

/**
 * T-0317 — les nébuleuses diffuses dont la colonne de magnitude porte celle d'une étoile.
 *
 * Même piège que la classe d'opacité de Barnard (T-0266), et repéré de la même façon : la
 * valeur est plausible en colonne, absurde une fois rapportée à la surface de l'objet. Sh2-9
 * porte V = 2,89, qui est la magnitude de σ Sco, son étoile excitatrice ; étalée sur 17′ × 3′
 * elle donne SB = 15,79 mag/arcsec², et le verdict ŒIL_NU sur une nébuleuse que personne n'a
 * jamais vue à l'œil.
 *
 * Le critère ne se règle pas à l'estime : une brillance MOYENNE ne peut pas dépasser le PIC de
 * la nébuleuse diffuse la plus brillante du ciel, mesuré sur M42. Plus brillant que ce pic, la
 * magnitude n'est pas celle de l'objet étendu.
 *
 * Borné aux trois types diffus, et c'est le point délicat : une nébuleuse PLANÉTAIRE est
 * compacte et dépasse légitimement ce pic (NGC7027 calcule 13,6), un amas est un paquet de
 * sources ponctuelles dont la « surface » ne veut rien dire. Les étendre au garde-fou
 * effacerait de la vraie photométrie.
 */
const TYPES_DIFFUS: ReadonlySet<TypeObjet> = new Set<TypeObjet>([
  'EMISSION',
  'REFLEXION',
  'RESTE_SUPERNOVA',
])

/**
 * OpenNGC range sous `Neb` les nébuleuses diffuses qu'il ne qualifie pas plus finement — M8,
 * M16, M17, M20 en sont. Elles arrivent sur le type fourre-tout AUTRE, qui porte aussi `Nova`,
 * un objet ponctuel : le garde-fou se déclenche donc sur le CODE SOURCE, pas sur le type, pour
 * ne pas prétendre qu'une nova est étendue. NGC6164 et NGC6165 portaient ainsi V = 6,71, la
 * magnitude de HD 148937, et décrochaient un verdict JUMELLES.
 */
const CODE_NEBULEUSE_GENERIQUE = 'Neb'

function magnitudeDeNebuleuse(
  diffuse: boolean,
  magnitude: number | null,
  majAxArcmin: number | null,
  minAxArcmin: number | null,
): number | null {
  if (magnitude === null || majAxArcmin === null || !diffuse) return magnitude
  // La même aire que §6.3, par la même fonction : un garde-fou qui calculerait autrement que
  // le moteur laisserait passer ce que le moteur, lui, jugerait absurde.
  const petitAxe = minAxArcmin ?? majAxArcmin
  const sb = magnitude + K('POGSON') * Math.log10(aireEllipseArcsec2(majAxArcmin, petitAxe))
  return sb < K('SB_PIC_M42_MAG') ? null : magnitude
}

/**
 * §6.1 — les entrées Sharpless et Barnard du catalogue DSO qu'OpenNGC ne porte pas déjà.
 *
 * Le filtre est un filtre de doublons, pas un filtre de qualité : une entrée Sharpless qui
 * renvoie vers un NGC présent décrit le même objet du ciel, et la liste des cibles §6.4 le
 * montrerait deux fois sous deux fiches. Caldwell est écarté en bloc pour la même raison —
 * ses 109 entrées sont *toutes* des redésignations NGC/IC, sans une seule cible nouvelle.
 */
function construitCataloguesComplementaires(
  catalogue: string,
  nomsBruts: string,
  dejaPresents: ReadonlySet<string>,
): ObjetCielProfond[] {
  const noms = analyseNomsDso(nomsBruts)
  const objets: ObjetCielProfond[] = []
  let donnees = false

  for (const ligne of catalogue.split('\n')) {
    if (!donnees) {
      donnees = ligne.startsWith('# --- DATA ---')
      continue
    }
    if (ligne.trim() === '') continue
    const champs = ligne.split('\t')

    const sharpless = nombreOuNull(champs[COL_SHARPLESS]) ?? 0
    const barnard = nombreOuNull(champs[COL_BARNARD]) ?? 0
    if (sharpless <= 0 && barnard <= 0) continue

    const ngc = nombreOuNull(champs[COL_NGC]) ?? 0
    const ic = nombreOuNull(champs[COL_IC]) ?? 0
    if (ngc > 0 && dejaPresents.has(`NGC${ngc}`)) continue
    if (ic > 0 && dejaPresents.has(`IC${ic}`)) continue

    const adDeg = nombreOuNull(champs[COL_AD])
    const decDeg = nombreOuNull(champs[COL_DEC])
    if (adDeg === null || decDeg === null) continue

    // Sharpless prime : un objet des deux catalogues est une région d'émission décrite par
    // Sharpless, que Barnard n'a relevée que par sa partie obscure.
    const cle = sharpless > 0 ? `SH2 ${sharpless}` : `B ${barnard}`
    const designation = sharpless > 0 ? `Sh2-${sharpless}` : `B${barnard}`
    const type = typeDso((champs[COL_TYPE] ?? '').trim(), sharpless)
    const obscure = type === 'NEB_OBSCURE'
    const majAxArcmin = positifOuNull(champs[COL_MAJ_AX])
    const minAxArcmin = positifOuNull(champs[COL_MIN_AX])

    objets.push({
      designation,
      nomsCommuns: (noms.get(cle) ?? []).join('|'),
      adDeg,
      decDeg,
      type,
      majAxArcmin,
      minAxArcmin,
      posAngDeg: positifOuNull(champs[COL_POS_ANG]),
      vMag: obscure
        ? null
        : magnitudeDeNebuleuse(
            TYPES_DIFFUS.has(type),
            magnitudeDso(champs[COL_V_MAG]),
            majAxArcmin,
            minAxArcmin,
          ),
      bMag: obscure
        ? null
        : magnitudeDeNebuleuse(
            TYPES_DIFFUS.has(type),
            magnitudeDso(champs[COL_B_MAG]),
            majAxArcmin,
            minAxArcmin,
          ),
      // Le catalogue DSO ne publie pas de brillance de surface.
      surfBr: null,
    })
  }
  return objets
}

// ---------------------------------------------------------------------------
// §3.4 — figures, astérismes, frontières et étoiles nommées
// ---------------------------------------------------------------------------

interface EtoileHyg {
  readonly adDeg: number
  readonly decDeg: number
  readonly magV: number
  readonly bayer: string
  readonly flamsteed: string
  readonly constellation: string
  readonly nomPropre: string
  readonly spectre: string
  readonly distancePc: number | null
}

/** Abréviations Bayer du catalogue vers la lettre grecque affichée. */
const LETTRES_GRECQUES: Readonly<Record<string, string>> = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ',
  Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ',
  Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ',
  Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
}

/**
 * Les astérismes portent leur nom d'usage français quand il en existe un. Pour les motifs
 * sans usage francophone établi, le nom anglais de la source est conservé tel quel :
 * traduire « Davis' Dog » n'aiderait personne à le reconnaître dans le ciel.
 */
const NOMS_FR_ASTERISMES: Readonly<Record<string, string>> = {
  'Big Dipper (Plough)': 'Grande Casserole',
  'Little Dipper': 'Petite Casserole',
  'Summer Triangle': 'Triangle d’été',
  'Winter Triangle': 'Triangle d’hiver',
  'Spring Triangle': 'Triangle du printemps',
  'Winter Hexagon (Winter Circle)': 'Hexagone d’hiver',
  "Orion's Belt": 'Ceinture d’Orion',
  "Orion's Sword": 'Épée d’Orion',
  Coathanger: 'Cintre',
  'Great Square of Pegasus': 'Grand Carré de Pégase',
  'Northern Cross': 'Croix du Nord',
  Teapot: 'Théière',
  Sickle: 'Faucille du Lion',
  Keystone: 'Clé de voûte d’Hercule',
  'The Pointers': 'Les Gardes',
  'Head of Medusa Gorgon': 'Tête de Méduse',
  'False Cross': 'Fausse Croix',
  'V of Taurus': 'V du Taureau',
  Kite: 'Cerf-volant du Bouvier',
  Circlet: 'Cercle des Poissons',
}

function indexeHyg(csv: string): Map<number, EtoileHyg> {
  const index = new Map<number, EtoileHyg>()
  for (const ligne of analyseCsv(csv, ',')) {
    const hip = nombreOuNull(ligne.get('hip'))
    const adH = nombreOuNull(ligne.get('ra'))
    const dec = nombreOuNull(ligne.get('dec'))
    const mag = nombreOuNull(ligne.get('mag'))
    if (hip === null || adH === null || dec === null || mag === null) continue
    const distance = nombreOuNull(ligne.get('dist'))
    index.set(hip, {
      adDeg: adH * DEG_PAR_HEURE,
      decDeg: dec,
      magV: mag,
      bayer: (ligne.get('bayer') ?? '').trim(),
      flamsteed: (ligne.get('flam') ?? '').trim(),
      constellation: (ligne.get('con') ?? '').trim(),
      nomPropre: (ligne.get('proper') ?? '').trim(),
      spectre: (ligne.get('spect') ?? '').trim(),
      // HYG range les étoiles sans parallaxe fiable à 100 000 pc : ce n'est pas une distance.
      distancePc: distance === null || distance <= 0 || distance >= 100000 ? null : distance,
    })
  }
  return index
}

function designationBayer(etoile: EtoileHyg): string {
  if (etoile.bayer === '') {
    return etoile.flamsteed === '' || etoile.constellation === ''
      ? ''
      : `${etoile.flamsteed} ${etoile.constellation}`
  }
  const lettre = LETTRES_GRECQUES[etoile.bayer] ?? etoile.bayer
  return etoile.constellation === '' ? lettre : `${lettre} ${etoile.constellation}`
}

interface ResolutionLignes {
  readonly segments: Segment[]
  readonly ignores: number
}

/** Une polyligne de la source est une suite d'identifiants HIP à relier deux à deux. */
function resoutLignes(
  lignes: readonly (readonly (number | string)[])[],
  index: Map<number, EtoileHyg>,
): ResolutionLignes {
  const segments: Segment[] = []
  let ignores = 0
  for (const ligne of lignes) {
    for (let i = 0; i + 1 < ligne.length; i++) {
      const a = typeof ligne[i] === 'number' ? index.get(ligne[i] as number) : undefined
      const b = typeof ligne[i + 1] === 'number' ? index.get(ligne[i + 1] as number) : undefined
      if (a === undefined || b === undefined) {
        // Sommet Gaia absent du catalogue HYG : le segment est écarté, jamais inventé.
        ignores++
        continue
      }
      segments.push({ ad1Deg: a.adDeg, dec1Deg: a.decDeg, ad2Deg: b.adDeg, dec2Deg: b.decDeg })
    }
  }
  return { segments, ignores }
}

function sexagesimal(brut: string, uniteParHeure: number): number {
  const signe = brut.trim().startsWith('-') ? -1 : 1
  const [a = '0', b = '0', c = '0'] = brut.trim().replace('+', '').replace('-', '').split(':')
  const MINUTES_PAR_UNITE = 60
  const SECONDES_PAR_MINUTE = 60
  return (
    signe *
    (Number(a) +
      Number(b) / MINUTES_PAR_UNITE +
      Number(c) / (MINUTES_PAR_UNITE * SECONDES_PAR_MINUTE)) *
    uniteParHeure
  )
}

interface SkycultureStellarium {
  readonly constellations: readonly {
    readonly id: string
    readonly lines?: readonly (readonly (number | string)[])[]
    readonly common_name?: { readonly native?: string; readonly english?: string }
  }[]
  readonly asterisms: readonly {
    readonly id: string
    readonly is_ray_helper?: boolean
    readonly lines?: readonly (readonly (number | string)[])[]
    readonly common_name?: { readonly english?: string }
  }[]
  readonly edges: readonly string[]
  readonly edges_epoch: string
}

/** « CON modern Aql » → « Aql ». Le code IAU est le dernier mot de l'identifiant source. */
function codeIau(id: string): string {
  const morceaux = id.trim().split(/\s+/)
  return (morceaux[morceaux.length - 1] ?? id).toUpperCase()
}

function construitConstellations(brut: string, index: Map<number, EtoileHyg>) {
  const source = JSON.parse(brut) as SkycultureStellarium
  if (source.edges_epoch !== 'B1875') {
    throw new Error(
      `Les frontières amont sont annoncées à l’époque ${source.edges_epoch} et non B1875. ` +
        'Le rendu les précesse depuis B1875 (§3.4) : ne pas encoder un jeu déjà précessé, ' +
        'la correction serait appliquée deux fois.',
    )
  }

  let ignores = 0

  const figures: Figure[] = source.constellations.map((c) => {
    const resolution = resoutLignes(c.lines ?? [], index)
    ignores += resolution.ignores
    return {
      code: codeIau(c.id),
      nom: c.common_name?.native ?? c.common_name?.english ?? codeIau(c.id),
      segments: resolution.segments,
    }
  })

  const asterismes: Asterisme[] = []
  for (const a of source.asterisms) {
    // Les « ray helpers » ne sont pas des astérismes : ce sont des guides de repérage
    // internes au moteur de rendu amont.
    if (a.is_ray_helper === true) continue
    const nomAnglais = a.common_name?.english
    if (nomAnglais === undefined) continue
    const resolution = resoutLignes(a.lines ?? [], index)
    ignores += resolution.ignores
    if (resolution.segments.length === 0) continue
    asterismes.push({
      id: a.id,
      nom: NOMS_FR_ASTERISMES[nomAnglais] ?? nomAnglais,
      segments: resolution.segments,
    })
  }

  const frontieres: AreteFrontiere[] = source.edges.map((ligne) => {
    const champs = ligne.trim().split(/\s+/)
    const [, type, ra1, dec1, ra2, dec2, con1, con2] = champs
    const typeArete: TypeArete = (type ?? '').startsWith('M') ? 'MERIDIEN' : 'PARALLELE'
    return {
      type: typeArete,
      ad1Deg: sexagesimal(ra1 ?? '0', DEG_PAR_HEURE),
      dec1Deg: sexagesimal(dec1 ?? '0', 1),
      ad2Deg: sexagesimal(ra2 ?? '0', DEG_PAR_HEURE),
      dec2Deg: sexagesimal(dec2 ?? '0', 1),
      codes: [(con1 ?? '').toUpperCase(), (con2 ?? '').toUpperCase()] as const,
    }
  })

  // §3.4 — les labels ne nomment que les étoiles de magnitude ≤ 3,5 ; le clic les identifie.
  const MAG_ETOILES_NOMMEES = 3.5
  const etoilesNommees: EtoileNommee[] = []
  for (const etoile of index.values()) {
    const designation = designationBayer(etoile)
    if (etoile.magV > MAG_ETOILES_NOMMEES && etoile.nomPropre === '') continue
    if (designation === '' && etoile.nomPropre === '') continue
    etoilesNommees.push({
      adDeg: etoile.adDeg,
      decDeg: etoile.decDeg,
      magV: etoile.magV,
      designation,
      nomPropre: etoile.nomPropre,
      spectre: etoile.spectre,
      distancePc: etoile.distancePc,
      constellation: etoile.constellation,
    })
  }
  etoilesNommees.sort((a, b) => a.magV - b.magV)

  return {
    figures,
    asterismes,
    frontieres,
    etoilesNommees,
    segmentsIgnores: ignores,
    source: `Stellarium, culture « modern » — ${SOURCE_STELLARIUM.url} ; frontières IAU de Delporte (B1875)`,
  }
}

type PointGeo = readonly [number, number]

interface GeometrieGeo {
  readonly type: string
  readonly coordinates: unknown
}

/** Les anneaux ou lignes d'une géométrie GeoJSON, à plat : le fond ne distingue pas les trous. */
function tracesGeo(g: GeometrieGeo): PointGeo[][] {
  switch (g.type) {
    case 'LineString':
      return [g.coordinates as PointGeo[]]
    case 'Polygon':
    case 'MultiLineString':
      return g.coordinates as PointGeo[][]
    case 'MultiPolygon':
      return (g.coordinates as PointGeo[][][]).flat()
    default:
      throw new Error(`Géométrie Natural Earth inattendue : ${g.type}`)
  }
}

function featuresGeo(contenu: string): { geometry: GeometrieGeo; properties: Record<string, unknown> }[] {
  return (JSON.parse(contenu) as { features: { geometry: GeometrieGeo; properties: Record<string, unknown> }[] })
    .features
}

async function construitFondCarte(): Promise<FondCarteSource> {
  const traces = async (source: SourceEpinglee) =>
    featuresGeo(await telecharge(source)).flatMap((f) => tracesGeo(f.geometry))
  const villes = featuresGeo(await telecharge(SOURCE_NE_VILLES)).map(
    ({ properties: p }): VilleSource => ({
      nom: String(p.name),
      latitudeDeg: Number(p.latitude),
      longitudeDeg: Number(p.longitude),
      zoomMin: Number(p.min_zoom),
    }),
  )
  return {
    terres: await traces(SOURCE_NE_TERRES),
    frontieres: await traces(SOURCE_NE_FRONTIERES),
    villes,
    source:
      `Natural Earth 1:50 M, commit ${COMMIT_NATURAL_EARTH} — ne_50m_land, ` +
      'ne_50m_admin_0_boundary_lines_land, ne_50m_populated_places_simple',
  }
}

async function ecritPaquet(
  nom: string,
  buffer: ArrayBuffer,
  nombreEnregistrements: number,
  source: string,
  obligatoire: boolean,
): Promise<ManifestePaquet> {
  const fichier = join(DOSSIER_SORTIE, `${nom}-${VERSION_PAQUETS}.bin`)
  await writeFile(fichier, Buffer.from(buffer))
  const OCTETS_PAR_MO = 1024 * 1024
  process.stdout.write(
    `  ${nom} : ${nombreEnregistrements} entrées, ` +
      `${(buffer.byteLength / OCTETS_PAR_MO).toFixed(2)} Mo\n`,
  )
  return {
    nom,
    version: VERSION_PAQUETS,
    nombreEntrees: nombreEnregistrements,
    octets: buffer.byteLength,
    sha256: await sha256Hex(buffer),
    source,
    obligatoire,
  }
}

const CHEMIN_MANIFESTE = join(DOSSIER_SORTIE, 'manifest.json')

async function litManifesteExistant(): Promise<ManifestePaquet[]> {
  try {
    return JSON.parse(await readFile(CHEMIN_MANIFESTE, 'utf8')) as ManifestePaquet[]
  } catch {
    return []
  }
}

/**
 * Fusionne les entrées produites avec celles déjà présentes. Régénérer un seul paquet ne
 * doit pas effacer le manifeste des autres, ni les forcer à retélécharger leur source.
 */
function fusionne(
  existant: readonly ManifestePaquet[],
  produits: readonly ManifestePaquet[],
): ManifestePaquet[] {
  const parNom = new Map(existant.map((p) => [p.nom, p]))
  for (const p of produits) parNom.set(p.nom, p)
  return [...parNom.values()]
}

/**
 * Groupes constructibles :
 * `pnpm data:build [hyg] [openngc] [deepsky] [constellations] [fond-carte]`.
 */
const GROUPES = ['hyg', 'openngc', 'deepsky', 'constellations', 'fond-carte'] as const
type Groupe = (typeof GROUPES)[number]

async function principal(): Promise<void> {
  await mkdir(DOSSIER_SORTIE, { recursive: true })

  const demandes = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const inconnus = demandes.filter((a) => !GROUPES.includes(a as Groupe))
  if (inconnus.length > 0) {
    throw new Error(
      `Groupe inconnu : ${inconnus.join(', ')}. Groupes disponibles : ${GROUPES.join(', ')}.`,
    )
  }
  const aConstruire = new Set<Groupe>(
    demandes.length === 0 ? GROUPES : (demandes as Groupe[]),
  )

  const produits: ManifestePaquet[] = []
  // Le CSV HYG sert deux paquets : il n'est téléchargé qu'une fois.
  let csvHyg: string | null = null
  const hyg = async (): Promise<string> => (csvHyg ??= await telecharge(SOURCE_HYG))

  if (aConstruire.has('hyg')) {
    process.stdout.write('HYG (étoiles)\n')
    const etoiles = construitEtoiles(await hyg())
    produits.push(
      await ecritPaquet(
        'hyg',
        encodeEtoiles(etoiles),
        etoiles.length,
        `HYG Database CURRENT (v4.1), filtré à magnitude ≤ ${MAG_LIMITE_HYG} — ${SOURCE_HYG.url}`,
        true,
      ),
    )
  }

  // OpenNGC sert deux groupes : `deepsky` s'en sert pour écarter les doublons NGC/IC.
  let objetsNgc: ObjetCielProfond[] | null = null
  const openngc = async (): Promise<ObjetCielProfond[]> =>
    (objetsNgc ??= [
      ...construitObjets(await telecharge(SOURCE_OPENNGC)),
      ...construitObjets(await telecharge(SOURCE_OPENNGC_ADDENDUM)),
    ])

  if (aConstruire.has('openngc')) {
    process.stdout.write('OpenNGC (ciel profond)\n')
    const objets = await openngc()
    const paquetObjets = encodeObjets(objets)
    produits.push(
      await ecritPaquet(
        'openngc',
        paquetObjets.enregistrements,
        objets.length,
        `OpenNGC — ${SOURCE_OPENNGC.url} + ${SOURCE_OPENNGC_ADDENDUM.url}`,
        true,
      ),
      await ecritPaquet(
        'openngc-noms',
        paquetObjets.chaines,
        objets.length,
        'Bloc de chaînes du paquet openngc',
        true,
      ),
    )
  }

  if (aConstruire.has('deepsky')) {
    process.stdout.write('Sharpless et Barnard (ciel profond complémentaire)\n')
    const objets = construitCataloguesComplementaires(
      await telecharge(SOURCE_STELLARIUM_DSO),
      await telecharge(SOURCE_STELLARIUM_DSO_NOMS),
      extraitDesignationsNgcIc(await openngc()),
    )
    const sharpless = objets.filter((o) => o.designation.startsWith('Sh2-')).length
    process.stdout.write(
      `  ${sharpless} Sharpless · ${objets.length - sharpless} Barnard, ` +
        'doublons NGC/IC et Caldwell écartés\n',
    )
    const paquetObjets = encodeObjets(objets)
    const source =
      `Sharpless et Barnard, catalogue DSO Stellarium v3.23 — ${SOURCE_STELLARIUM_DSO.url} ` +
      `+ ${SOURCE_STELLARIUM_DSO_NOMS.url} ; entrées doublant un NGC/IC d'OpenNGC écartées, ` +
      'Caldwell hors périmètre (redésignations NGC/IC)'
    produits.push(
      await ecritPaquet('deepsky', paquetObjets.enregistrements, objets.length, source, true),
      await ecritPaquet(
        'deepsky-noms',
        paquetObjets.chaines,
        objets.length,
        'Bloc de chaînes du paquet deepsky',
        true,
      ),
    )
  }

  if (aConstruire.has('constellations')) {
    process.stdout.write('Constellations (figures, astérismes, frontières B1875)\n')
    const paquet = construitConstellations(await telecharge(SOURCE_STELLARIUM), indexeHyg(await hyg()))
    process.stdout.write(
      `  ${paquet.figures.length} figures · ${paquet.asterismes.length} astérismes · ` +
        `${paquet.frontieres.length} arêtes · ${paquet.etoilesNommees.length} étoiles nommées · ` +
        `${paquet.segmentsIgnores} segments écartés faute d’étoile résolue\n`,
    )
    produits.push(
      await ecritPaquet(
        'constellations',
        encodeConstellations(paquet),
        paquet.figures.length + paquet.asterismes.length + paquet.frontieres.length,
        paquet.source,
        true,
      ),
    )
  }

  if (aConstruire.has('fond-carte')) {
    process.stdout.write('Fond de la carte du site (Natural Earth 1:50 M)\n')
    const fond = await construitFondCarte()
    produits.push(
      await ecritPaquet(
        'fond-carte',
        encodeFondCarte(fond),
        fond.terres.length + fond.frontieres.length + fond.villes.length,
        fond.source,
        // Sans lui, la carte reste — vide — et la saisie chiffrée aussi : il n'arrête pas le
        // démarrage (§12.5).
        false,
      ),
    )
  }

  const manifeste = fusionne(await litManifesteExistant(), produits)
  await writeFile(CHEMIN_MANIFESTE, `${JSON.stringify(manifeste, null, 2)}\n`)

  const OCTETS_PAR_MO = 1024 * 1024
  const total = manifeste.reduce((somme, p) => somme + p.octets, 0) / OCTETS_PAR_MO
  process.stdout.write(`Paquet de base : ${total.toFixed(2)} Mo\n`)
}

await principal()
