/**
 * T-0021 — cost of one filé pass. Run: `node scripts/bench-incrustation.ts` (catalogue from
 * `public/data/`).
 *
 * Replays off-browser the loop (same `dessineChamp`, projector, real catalogue, semis) on a mute
 * 2D context. Measures compute (selection, sort, arcs, projections), never paint.
 *
 * T-0116 — pass covers whole scene field; cadre-tight selection and `--champ-scene` gone.
 * Measured: plein ciel.
 *
 * `--planetarium`: same pass in stereographic projection; only mode where T-0115 circle
 * primitive applies, gain readable by comparison only.
 * `--couverture=F`: other painted-surface target than registry's (T-0119);
 * `--effectif=N`: other cost cap; both 0 = no cap (pre-T-0119).
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

/** §9.3 reference grand-angle setup: 10 mm plein format f/2,8, Bortle 4,5. */
const PROFONDEUR: EntreeProfondeur = {
  tPoseS: 25,
  dMm: 10 / 2.8,
  zpSys: K('ZP_SYS_GENERIQUE'),
  eCielPxS: 1.68,
  readNoiseE: 1.5,
}
/** §9.3 reference grand angle: cadre covers almost the whole scene. */
const PROFIL_10MM: ProfilCadre = {
  libelle: '10 mm plein format',
  fovLDeg: 121.0,
  fovHDeg: 100.4,
  echApx: 105.6,
  capteurHMm: 24,
  modeObjectif: 'MODE_CADRE',
  tPoseS: null,
}
/** Standard objectif: cadre is only a thumbnail in the scene. */
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
 * Fingerprint of paint orders: proves an optimisation did NOT change the image. `--empreinte`
 * replaces duration with it, to compare code versions (T-0022/T-0023 promise identity,
 * T-0024 not).
 */
const EMPREINTE = process.argv.includes('--empreinte')
/** T-0115 — mode: `MODE_CADRE` default (incrustation), `MODE_PLANETARIUM` = exact arc. */
const MODE: ModeProjection = process.argv.includes('--planetarium')
  ? 'MODE_PLANETARIUM'
  : 'MODE_CADRE'
/**
 * T-0119 — cap lever, CLI-settable: the MEASURE picks the registry value. `--couverture=0`
 * removes the cap; must reproduce pre-T-0119 counters/digests under `--empreinte`.
 */
function levier(nom: string, defaut: number): number | null {
  const arg = process.argv.find((a) => a.startsWith(`--${nom}=`))
  const n = arg === undefined ? defaut : Number(arg.slice(nom.length + 3))
  return Number.isFinite(n) && n > 0 ? n : null
}
const COUVERTURE = levier('couverture', K('COUVERTURE_TRACES_MAX'))
/** T-0119 — cost-cap lever: `--effectif=0` removes it. */
const EFFECTIF = levier('effectif', K('EFFECTIF_CIEL_MAX_APERCU'))

/**
 * No `Path2D` off-browser: pass needs only `moveTo`, `lineTo`, `arc`.
 * T-0119 — stars go into shared paths: image geometry passes HERE, not via the context (a digest
 * on context alone sees a few dozen fills). `avaleur` = current listening point (`empreinteur`).
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
      // coords rounded to 1/1000 px: digest = image, not last float bit
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

/** Mute 2D context: absorbs paint orders. */
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

/** Instrumented projector: projection count = geometric cost. */
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
  /** Pupil of declared objectif: decides whether semis is reached. */
  readonly dMm: number
  readonly profil: ProfilCadre
}

const CAS: readonly Cas[] = [
  // 10 mm f/2,8 doesn't reach semis: worst case needs a pupil that does, else bench covers only
  // the real catalogue → underestimates.
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
  // T-0118 — same duration, two fields: pair shows cap bounds star count, not magnitude (a
  // magnitude cap → cost follows solid angle, ~9× between fields).
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
      magLimite,
      profondeur,
      // ponytail: bench measures a cost, not a brightness — sampling stands in for the spot;
      // upgrade when a bench must check rendered brightness.
      tacheArcsec: cas.profil.echApx,
      sbSiteMag: 21.0,
      suiviActif: false,
      dureeS: cas.dureeMin * S_PAR_MIN,
      couvertureMax: COUVERTURE,
      effectifMax: EFFECTIF,
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
