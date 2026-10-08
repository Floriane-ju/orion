/**
 * T-0021 — coût d'une passe de filé, chiffré.
 *
 * L'epic porte la mesure : « ça semble plus fluide » n'est pas un critère. Ce script rejoue
 * hors navigateur exactement ce que la boucle fait — même `dessineChamp`, même projecteur,
 * même catalogue réel, même semis — sur un contexte 2D muet. Ce qui est mesuré est donc le
 * calcul (sélection, tri, arcs, projections), jamais la peinture : c'est le calcul qui doit
 * tenir dans une image de la boucle.
 *
 * T-0116 — la passe couvre tout le champ de la scène : la sélection resserrée sur le cadre a
 * disparu du code, et `--champ-scene` avec elle. Ce qui est mesuré ici est le plein ciel.
 *
 * Usage : `node scripts/bench-incrustation.ts` (le catalogue vient de `public/data/`).
 * `--planetarium` mesure la même passe en projection stéréographique : c'est le seul mode où
 * la primitive de cercle de T-0115 s'applique, et le gain ne se lit que par comparaison.
 * `--couverture=F` rejoue la passe avec une autre cible de surface peinte que celle du registre
 * (T-0119), `--effectif=N` avec un autre plafond de coût ; les mettre tous deux à 0 rejoue la
 * passe sans aucun plafond, comme avant T-0119.
 */

import { K } from '../src/registry/constants.ts'
import { decodeEtoiles, type Etoile } from '../src/data/catalog.ts'
import { semisGeneratif } from '../src/data/semis.ts'
import { construitIndex, type IndexCiel } from '../src/core/index-ciel.ts'
import { axePoleDeDate, cielInstantane, epoqueAnnee } from '../src/core/horloges.ts'
import { magnitudeLimitePrevisu, type EntreeProfondeur } from '../src/core/galactique.ts'
import type { ProfilCadre } from '../src/core/cadre.ts'
import {
  projecteur,
  type ModeProjection,
  type PointEcran,
  type Projecteur,
  type Vue,
} from '../src/core/projection.ts'
import { dessineChamp } from '../src/ui/dessine-champ.ts'
import { lit, mediane, SITE } from './bench-commun.ts'

const DATE = new Date('2026-08-15T22:00:00Z')
const LARGEUR = 1920
const HAUTEUR = 1080
const S_PAR_MIN = 60
const PASSES = 5

/** Setup grand angle de référence de §9.3 : 10 mm plein format f/2,8 sous un ciel Bortle 4,5. */
const PROFONDEUR: EntreeProfondeur = {
  tPoseS: 25,
  dMm: 10 / 2.8,
  zpSys: K('ZP_SYS_GENERIQUE'),
  eCielPxS: 1.68,
  readNoiseE: 1.5,
}
/** §9.3 — le grand angle de référence : le cadre couvre presque toute la scène. */
const PROFIL_10MM: ProfilCadre = {
  libelle: '10 mm plein format',
  fovLDeg: 121.0,
  fovHDeg: 100.4,
  echApx: 105.6,
  capteurHMm: 24,
  modeObjectif: 'MODE_CADRE',
  tPoseS: null,
}
/** Objectif standard : le cadre n'est plus qu'une vignette dans la scène. */
const PROFIL_50MM: ProfilCadre = {
  libelle: '50 mm plein format',
  fovLDeg: 39.6,
  fovHDeg: 27.0,
  echApx: 24.5,
  capteurHMm: 24,
  modeObjectif: 'MODE_CADRE',
  tPoseS: null,
}

/**
 * Empreinte des ordres de peinture : c'est elle qui dit qu'une optimisation n'a PAS changé
 * l'image. `--empreinte` remplace la mesure de durée par ce condensé, à comparer entre deux
 * versions du code (T-0022 et T-0023 promettent l'identité, T-0024 non).
 */
const EMPREINTE = process.argv.includes('--empreinte')
/**
 * T-0115 — axe « mode de projection ». `MODE_CADRE` reste le défaut, c'est celui de
 * l'incrustation ; `MODE_PLANETARIUM` est celui où l'arc devient un cercle exact.
 */
const MODE: ModeProjection = process.argv.includes('--planetarium')
  ? 'MODE_PLANETARIUM'
  : 'MODE_CADRE'
/**
 * T-0119 — le levier du plafond, réglable en ligne de commande : c'est la MESURE qui choisit la
 * valeur du registre, pas l'inverse. `--couverture=0` retire le plafond, et c'est ce cas qui doit
 * reproduire les compteurs et les condensés d'avant T-0119 sous `--empreinte`.
 */
function levier(nom: string, defaut: number): number | null {
  const arg = process.argv.find((a) => a.startsWith(`--${nom}=`))
  const n = arg === undefined ? defaut : Number(arg.slice(nom.length + 3))
  return Number.isFinite(n) && n > 0 ? n : null
}
const COUVERTURE = levier('couverture', K('COUVERTURE_TRACES_MAX'))
/** T-0119 — le plafond de coût, second levier : `--effectif=0` le retire. */
const EFFECTIF = levier('effectif', K('EFFECTIF_CIEL_MAX_APERCU'))

/**
 * `Path2D` n'existe pas hors navigateur : la passe n'en attend que `moveTo`, `lineTo` et `arc`.
 *
 * T-0119 — les étoiles se déposent dans des chemins partagés, donc la géométrie de l'image passe
 * par ICI et non plus par le contexte. Un condensé qui n'écouterait que le contexte ne verrait
 * plus que quelques dizaines d'ordres de remplissage : il faut que le chemin parle au condensé.
 * `avaleur` est le point d'écoute courant, posé par `empreinteur`.
 */
let avaleur: ((texte: string) => void) | null = null
class Path2DMuet {
  moveTo(...args: number[]): void {
    avaleur?.(`p.moveTo(${args.map((a) => a.toFixed(3)).join(',')})`)
  }
  lineTo(...args: number[]): void {
    avaleur?.(`p.lineTo(${args.map((a) => a.toFixed(3)).join(',')})`)
  }
  arc(...args: unknown[]): void {
    avaleur?.(
      `p.arc(${args.map((a) => (typeof a === 'number' ? a.toFixed(3) : String(a))).join(',')})`,
    )
  }
}
;(globalThis as unknown as { Path2D: unknown }).Path2D = Path2DMuet

function empreinteur(): { ctx: CanvasRenderingContext2D; valeur: () => string } {
  let h = 0x811c9dc5
  const avale = (texte: string): void => {
    for (let i = 0; i < texte.length; i++) {
      h ^= texte.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  const ordre =
    (nom: string) =>
    (...args: unknown[]): void => {
      // Les coordonnées sont arrondies au millième de pixel : le condensé ne doit pas
      // dépendre du dernier bit d'un flottant, il doit dépendre de l'image.
      avale(
        `${nom}(${args
          .map((a) => (typeof a === 'number' ? a.toFixed(3) : String(a)))
          .join(',')})`,
      )
    }
  avaleur = avale
  const ctx = {
    set globalAlpha(v: number) {
      avale(`alpha=${v.toFixed(4)}`)
    },
    get globalAlpha() {
      return 1
    },
    set fillStyle(v: unknown) {
      avale(`fill=${String(v)}`)
    },
    get fillStyle() {
      return ''
    },
    set strokeStyle(v: unknown) {
      avale(`stroke=${String(v)}`)
    },
    get strokeStyle() {
      return ''
    },
    set lineWidth(v: number) {
      avale(`lw=${v.toFixed(3)}`)
    },
    get lineWidth() {
      return 1
    },
    lineCap: 'butt',
    filter: 'none',
    fillRect: ordre('fillRect'),
    beginPath: ordre('beginPath'),
    closePath: ordre('closePath'),
    moveTo: ordre('moveTo'),
    lineTo: ordre('lineTo'),
    arc: ordre('arc'),
    stroke: ordre('stroke'),
    fill: ordre('fill'),
    createRadialGradient: () => ({ addColorStop: (): void => undefined }),
  } as unknown as CanvasRenderingContext2D
  return { ctx, valeur: () => h.toString(16).padStart(8, '0') }
}

/** Contexte 2D muet : il absorbe les ordres de peinture, il n'en exécute aucun. */
function contexteMuet(): CanvasRenderingContext2D {
  const rien = (): void => undefined
  return {
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    filter: 'none',
    fillStyle: '',
    strokeStyle: '',
    fillRect: rien,
    beginPath: rien,
    closePath: rien,
    moveTo: rien,
    lineTo: rien,
    arc: rien,
    stroke: rien,
    fill: rien,
    createRadialGradient: () => ({ addColorStop: rien }),
  } as unknown as CanvasRenderingContext2D
}

/** Projecteur instrumenté : le nombre de projections est LA mesure du coût géométrique. */
function projecteurCompte(base: Projecteur): { proj: Projecteur; projections: () => number } {
  let n = 0
  const proj: Projecteur = {
    ...base,
    projette: (v): PointEcran | null => {
      n++
      return base.projette(v)
    },
    projetteEn: (x, y, z, out) => {
      n++
      return base.projetteEn(x, y, z, out)
    },
    inverse: (x, y) => base.inverse(x, y),
  }
  return { proj, projections: () => n }
}

function etoilesReelles(): readonly Etoile[] {
  const brut = decodeEtoiles(lit('hyg-1.bin'))
  return brut.filter((e) => e.magV <= K('SEUIL_MAG_ETOILES_REELLES'))
}

interface Cas {
  readonly nom: string
  readonly fovDeg: number
  readonly dureeMin: number
  /** Pupille de l'objectif déclaré : c'est elle qui décide si le semis est atteint. */
  readonly dMm: number
  readonly profil: ProfilCadre
}

const CAS: readonly Cas[] = [
  // Le 10 mm f/2,8 ne descend pas jusqu'au semis : le pire cas demande une pupille qui
  // l'atteint, sinon la mesure ne porte que sur le catalogue réel et sous-estime tout.
  {
    nom: 'pire cas — 180°, 480 min, 50 mm f/1,4',
    fovDeg: K('FOV_MAX_DEG'),
    dureeMin: 480,
    dMm: 35.7,
    profil: PROFIL_50MM,
  },
  {
    nom: 'pire cas — 180°, 480 min, 10 mm f/2,8',
    fovDeg: K('FOV_MAX_DEG'),
    dureeMin: 480,
    dMm: 10 / 2.8,
    profil: PROFIL_10MM,
  },
  // T-0118 — même durée, deux champs : c'est CE couple qui dit si le plafond borne bien un
  // nombre d'étoiles et non une magnitude. Un plafond de magnitude ferait suivre le coût
  // l'angle solide, environ 9× d'un champ à l'autre.
  {
    nom: 'invariance — 180°, 120 min, 50 mm f/1,4',
    fovDeg: K('FOV_MAX_DEG'),
    dureeMin: 120,
    dMm: 35.7,
    profil: PROFIL_50MM,
  },
  {
    nom: 'usuel — 60°, 120 min, 50 mm f/1,4',
    fovDeg: 60,
    dureeMin: 120,
    dMm: 35.7,
    profil: PROFIL_50MM,
  },
  {
    nom: 'usuel — 60°, 120 min, 10 mm f/2,8',
    fovDeg: 60,
    dureeMin: 120,
    dMm: 10 / 2.8,
    profil: PROFIL_10MM,
  },
]

function mesure(cas: Cas, indexReel: IndexCiel, indexSemis: IndexCiel): void {
  const ciel = cielInstantane(SITE, DATE)
  const vue: Vue = {
    mode: MODE,
    fovDeg: cas.fovDeg,
    largeurPx: LARGEUR,
    hauteurPx: HAUTEUR,
    azimutDeg: 180,
    hauteurDeg: 40,
    rotationDeg: 0,
  }
  const profondeur: EntreeProfondeur = { ...PROFONDEUR, dMm: cas.dMm }
  const magLimite = magnitudeLimitePrevisu(profondeur).value
  const durees: number[] = []
  let derniere = { visitees: 0, tracees: 0, projections: 0, couverture: 0 }
  let empreinte = ''

  for (let i = 0; i < (EMPREINTE ? 1 : PASSES); i++) {
    const { proj, projections } = projecteurCompte(projecteur(vue, ciel.matrice))
    const trace = EMPREINTE ? empreinteur() : null
    const debut = performance.now()
    const sortie = dessineChamp({
      ctx: trace?.ctx ?? contexteMuet(),
      projecteur: proj,
      indexReel,
      indexSemis,
      vueRealiste: false,
      magLimite,
      profondeur,
      echApx: cas.profil.echApx,
      sbSiteMag: 21.0,
      suiviActif: false,
      sbCiel: 21.0,
      dureeS: cas.dureeMin * S_PAR_MIN,
      couvertureMax: COUVERTURE,
      effectifMax: EFFECTIF,
      latitudeDeg: SITE.latitudeDeg,
      axePoleNord: axePoleDeDate(epoqueAnnee(DATE)),
      modeNuit: false,
    })
    durees.push(performance.now() - debut)
    empreinte = trace?.valeur() ?? ''
    derniere = {
      visitees: sortie.etoilesVisitees,
      tracees: sortie.etoilesReelles + sortie.etoilesGenerees,
      projections: projections(),
      couverture: sortie.couverturePeinte,
    }
  }

  if (EMPREINTE) {
    console.log(
      `${cas.nom.padEnd(38)} empreinte ${empreinte}  ` +
        `${derniere.visitees.toLocaleString('fr-FR').padStart(10)} visitées  ` +
        `${derniere.tracees.toLocaleString('fr-FR').padStart(8)} tracées`,
    )
    return
  }
  const ms = mediane(durees)
  console.log(
    `${cas.nom.padEnd(38)} mag ${magLimite.toFixed(1)}  ${ms.toFixed(0).padStart(6)} ms  ` +
      `${derniere.visitees.toLocaleString('fr-FR').padStart(10)} visitées  ` +
      `${derniere.tracees.toLocaleString('fr-FR').padStart(8)} tracées  ` +
      `${`${(derniere.couverture * 100).toFixed(0)} %`.padStart(7)} peints  ` +
      `${derniere.projections.toLocaleString('fr-FR').padStart(12)} projections`,
  )
}

const indexReel = construitIndex(etoilesReelles())
const indexSemis = construitIndex(semisGeneratif())
console.log(
  `catalogue réel ${indexReel.nombreEtoiles} étoiles · semis ${indexSemis.nombreEtoiles} · ` +
    `médiane de ${PASSES} passes · ${MODE} · ` +
    `couverture ${COUVERTURE === null ? 'sans plafond' : `≤ ${(COUVERTURE * 100).toFixed(0)} % du canevas`} · ` +
    `effectif ${EFFECTIF === null ? 'sans plafond' : `≤ ${EFFECTIF.toLocaleString('fr-FR')} étoiles`}`,
)
for (const cas of CAS) mesure(cas, indexReel, indexSemis)
