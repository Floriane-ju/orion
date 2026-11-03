/**
 * T-0065 — allocations per planétarium frame. Run: `pnpm bench:ciel [--empreinte] [--realiste]`.
 * Replays `dessineCiel` off-browser on reference scene; counts allocations per frame.
 *
 *   - COMPTE via projection: `projette` allocates 2 objects/call (input literal + `PointEcran`);
 *     `projetteEn` none. `Path2D` counted at construction.
 *   - RAMASSE-MIETTES, all causes: `perf_hooks` observes real GCs under default heuristics.
 *     = audit symptom (jank, not lower mean FPS); covers allocations the count misses.
 *
 * Allocated-bytes measure dropped: heap growth tracks young-generation heuristics (195 vs 225
 * kB/frame across 2 runs) → unstable.
 *
 * `--empreinte`: digest of paint orders instead of measure; proves an optimisation did NOT
 * change the image (critère « identique au pixel près »).
 */

import { PerformanceObserver } from 'node:perf_hooks'
import { decodeEtoiles, type Etoile } from '../src/data/catalog.ts'
import { decodeObjets } from '../src/data/deepsky.ts'
import { decodeConstellations } from '../src/data/constellations.ts'
import { coucheAsterismes, coucheFigures, coucheFrontieres } from '../src/core/constellations.ts'
import { construitIndex } from '../src/core/index-ciel.ts'
import { cielInstantane } from '../src/core/horloges.ts'
import { magnitudeRendue, projecteur, type Projecteur, type Vue } from '../src/core/projection.ts'
import { masquePlat } from '../src/core/site.ts'
import { dessineCiel, type CouchesActives } from '../src/ui/dessine-ciel.ts'
import { SB_PLANCHER_NATUREL } from '../src/registry/bortle.ts'
import { lit, SITE } from './bench-commun.ts'

const DATE = new Date('2026-08-15T22:00:00Z')
const LARGEUR = 1920
const HAUTEUR = 1080
const IMAGES = 200
const EMPREINTE = process.argv.includes('--empreinte')
/** T-0110 — champ selectable: stars dominate tight view, bande/frontières wide view. */
const arg = (nom: string, defaut: number): number =>
  Number(process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? defaut)
const FOV = arg('fov', 30)
/** T-0110 — visée selectable: a deviation may be wrong in one direction only. */
const AZIMUT = arg('az', 180)
const HAUTEUR_VISEE = arg('alt', 40)
/**
 * T-0110 — `--appels` counts PAINT ORDERS, not allocations (T-0054 gap): one `stroke()` per
 * element costs the driver, not the heap.
 */
const APPELS = process.argv.includes('--appels')
/**
 * T-0110 — `--effective` hashes the PAINT, `--empreinte` the ORDERS. Dropping a `stroke()` on an
 * empty path or an overwritten style write changes orders, not a pixel → `--empreinte` false
 * regression. This digest keeps an order only when it lays colour under the applying style.
 */
const EFFECTIVE = process.argv.includes('--effective')
/** T-0098 — `--realiste` adds painted fond + halo steps: measures their overhead. */
const REALISTE = process.argv.includes('--realiste')

/** Reference scene: plein champ, all layers, real site sky. */
const VUE: Vue = {
  mode: 'MODE_PLANETARIUM',
  fovDeg: FOV,
  largeurPx: LARGEUR,
  hauteurPx: HAUTEUR,
  azimutDeg: AZIMUT,
  hauteurDeg: HAUTEUR_VISEE,
  rotationDeg: 0,
}
const COUCHES: CouchesActives = {
  figures: true,
  frontieres: true,
  asterismes: true,
  cadre: false,
  horizon: true,
  voieLactee: true,
  sol: true,
}

let path2dConstruits = 0

/** Node has no `Path2D`: stand-in absorbing countable orders. */
class Path2DMuet {
  constructor() {
    path2dConstruits++
  }
  moveTo(): void {}
  arc(): void {}
  lineTo(): void {}
  closePath(): void {}
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
      avale(
        `${nom}(${args.map((a) => (typeof a === 'number' ? a.toFixed(3) : String(a))).join(',')})`,
      )
    }
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
    set font(v: string) {
      avale(`font=${v}`)
    },
    get font() {
      return ''
    },
    set textBaseline(v: string) {
      avale(`baseline=${v}`)
    },
    get textBaseline() {
      return ''
    },
    lineCap: 'butt',
    filter: 'none',
    fillRect: ordre('fillRect'),
    fillText: ordre('fillText'),
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

/**
 * Digest of paint only. Blind by design to 3 screen-invisible things (so it validates an
 * optimisation): overwritten style write; `stroke()` on empty path; path segment OUTSIDE canvas
 * (decisive: culling before projection drops `moveTo`/`lineTo` laying no colour; whole-path
 * hash cries regression). Kept: segments whose box widened by half stroke width crosses canvas.
 */
function empreinteurEffectif(): { ctx: CanvasRenderingContext2D; valeur: () => string } {
  let h = 0x811c9dc5
  const avale = (texte: string): void => {
    for (let i = 0; i < texte.length; i++) {
      h ^= texte.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  const nb = (v: unknown): string => (typeof v === 'number' ? v.toFixed(3) : String(v))
  const etat: Record<string, unknown> = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textBaseline: 'middle',
    filter: 'none',
  }
  interface Pt {
    readonly x: number
    readonly y: number
  }
  /** Current path as sub-paths (`moveTo` opens, `lineTo` extends). */
  let sousChemins: Pt[][] = []
  const courant = (): Pt[] => {
    const dernier = sousChemins[sousChemins.length - 1]
    if (dernier !== undefined) return dernier
    const neuf: Pt[] = []
    sousChemins.push(neuf)
    return neuf
  }
  /** Does the box widened by `marge` cross the canvas? */
  const croise = (x0: number, y0: number, x1: number, y1: number, marge: number): boolean =>
    Math.max(x0, x1) + marge >= 0 &&
    Math.min(x0, x1) - marge <= LARGEUR &&
    Math.max(y0, y1) + marge >= 0 &&
    Math.min(y0, y1) - marge <= HAUTEUR
  const styles = (noms: readonly string[]): string =>
    noms.map((c) => `${c}=${nb(etat[c])}`).join(',')
  const ctx = {
    beginPath: () => {
      sousChemins = []
    },
    closePath: () => {
      const c = sousChemins[sousChemins.length - 1]
      if (c !== undefined && c.length > 0) c.push(c[0]!)
    },
    moveTo: (x: number, y: number) => {
      sousChemins.push([{ x, y }])
    },
    lineTo: (x: number, y: number) => {
      courant().push({ x, y })
    },
    arc: (x: number, y: number, r: number, a0: number, a1: number) => {
      // arc is its own sub-path: judged on its bounding disc
      sousChemins.push([{ x: x - r, y: y - r }, { x: x + r, y: y + r }])
      if (croise(x - r, y - r, x + r, y + r, 0)) avale(`arc(${nb(x)},${nb(y)},${nb(r)},${nb(a0)},${nb(a1)})`)
    },
    stroke: () => {
      const marge = (etat['lineWidth'] as number) / 2
      let peint = false
      for (const sous of sousChemins) {
        for (let i = 1; i < sous.length; i++) {
          const a = sous[i - 1]!
          const b = sous[i]!
          if (!croise(a.x, a.y, b.x, b.y, marge)) continue
          if (!peint) {
            avale(`stroke[${styles(['globalAlpha', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin'])}]`)
            peint = true
          }
          avale(`${nb(a.x)},${nb(a.y)}>${nb(b.x)},${nb(b.y)};`)
        }
      }
    },
    fill: () => {
      let peint = false
      for (const sous of sousChemins) {
        if (sous.length === 0) continue
        const xs = sous.map((p) => p.x)
        const ys = sous.map((p) => p.y)
        if (!croise(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 0)) continue
        if (!peint) {
          avale(`fill[${styles(['globalAlpha', 'fillStyle'])}]`)
          peint = true
        }
        avale(sous.map((p) => `${nb(p.x)},${nb(p.y)}`).join(';'))
      }
    },
    fillText: (t: unknown, x: number, y: number) => {
      avale(`fillText[${styles(['globalAlpha', 'fillStyle', 'font', 'textBaseline'])}](${String(t)},${nb(x)},${nb(y)})`)
    },
    fillRect: (x: number, y: number, w: number, hh: number) => {
      avale(`fillRect[${styles(['globalAlpha', 'fillStyle', 'filter'])}](${nb(x)},${nb(y)},${nb(w)},${nb(hh)})`)
    },
    createRadialGradient: (...a: unknown[]) => {
      const paliers: string[] = []
      return {
        addColorStop: (o: number, c: string) => {
          paliers.push(`${nb(o)}:${c}`)
        },
        toString: () => `grad(${a.map(nb).join(',')};${paliers.join('|')})`,
      }
    },
  }
  for (const nom of Object.keys(etat)) {
    Object.defineProperty(ctx, nom, {
      get: () => etat[nom],
      set: (v: unknown) => {
        etat[nom] = v
      },
      configurable: true,
    })
  }
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    valeur: () => h.toString(16).padStart(8, '0'),
  }
}

/** Mute 2D context: absorbs paint orders. */
function contexteMuet(): CanvasRenderingContext2D {
  const rien = (): void => undefined
  return {
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    filter: 'none',
    font: '',
    textBaseline: 'middle',
    fillStyle: '',
    strokeStyle: '',
    fillRect: rien,
    fillText: rien,
    beginPath: rien,
    closePath: rien,
    moveTo: rien,
    lineTo: rien,
    arc: rien,
    stroke: rien,
    fill: rien,
    // T-0144 — extended-object marker painted in rotated frame then restored; without these 4
    // orders bench stops at first galaxy of champ.
    save: rien,
    restore: rien,
    translate: rien,
    rotate: rien,
    scale: rien,
    ellipse: rien,
    createRadialGradient: () => ({ addColorStop: rien }),
  } as unknown as CanvasRenderingContext2D
}

/**
 * 2D context counting orders. Style writes counted twice: total + REDUNDANT (rewriting
 * `strokeStyle` with current value = driver call for nothing; per-element stroking symptom).
 */
function contexteCompteur(): {
  ctx: CanvasRenderingContext2D
  ordres: () => Record<string, number>
} {
  const n: Record<string, number> = {}
  const compte =
    (nom: string) =>
    (): void => {
      n[nom] = (n[nom] ?? 0) + 1
    }
  /** Accessor counting writes, and no-op ones. */
  const style = <T,>(nom: string, initial: T) => {
    let valeur = initial
    return {
      get: () => valeur,
      set: (v: T) => {
        n[nom] = (n[nom] ?? 0) + 1
        if (v === valeur) n[`${nom}~redondant`] = (n[`${nom}~redondant`] ?? 0) + 1
        valeur = v
      },
    }
  }
  const ctx = {
    lineCap: 'butt',
    filter: 'none',
    textBaseline: 'middle',
    ...Object.fromEntries(
      (
        [
          ['globalAlpha', 1],
          ['fillStyle', ''],
          ['strokeStyle', ''],
          ['lineWidth', 1],
          ['font', ''],
        ] as const
      ).map(([nom, initial]) => [nom, style(nom, initial as unknown)]),
    ),
    fillRect: compte('fillRect'),
    fillText: compte('fillText'),
    beginPath: compte('beginPath'),
    closePath: compte('closePath'),
    moveTo: compte('moveTo'),
    lineTo: compte('lineTo'),
    arc: compte('arc'),
    stroke: compte('stroke'),
    fill: compte('fill'),
    createRadialGradient: () => ({ addColorStop: (): void => undefined }),
  }
  // `Object.fromEntries` yields data descriptors: convert them to accessors
  for (const nom of ['globalAlpha', 'fillStyle', 'strokeStyle', 'lineWidth', 'font']) {
    const acc = (ctx as unknown as Record<string, { get: () => unknown; set: (v: unknown) => void }>)[nom]!
    Object.defineProperty(ctx, nom, { get: acc.get, set: acc.set, configurable: true })
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ordres: () => n }
}

interface Comptes {
  readonly projette: () => number
  readonly projetteEn: () => number
}

/** Instrumented projector: `projette` = 2 objects/call, `projetteEn` = 0 → calls = objects. */
function projecteurCompte(base: Projecteur): { proj: Projecteur; comptes: Comptes } {
  let nProjette = 0
  let nProjetteEn = 0
  const proj: Projecteur = {
    ...base,
    projette: (v) => {
      nProjette++
      return base.projette(v)
    },
    projetteEn: (x, y, z, out) => {
      nProjetteEn++
      return base.projetteEn(x, y, z, out)
    },
    inverse: (x, y) => base.inverse(x, y),
  }
  return { proj, comptes: { projette: () => nProjette, projetteEn: () => nProjetteEn } }
}

const etoiles: readonly Etoile[] = decodeEtoiles(lit('hyg-1.bin'))
const objets = decodeObjets({
  enregistrements: lit('openngc-1.bin'),
  chaines: lit('openngc-noms-1.bin'),
})
const constellations = decodeConstellations(lit('constellations-1.bin'))
const index = construitIndex(etoiles)
const figures = coucheFigures(constellations.figures)
const asterismes = coucheAsterismes(constellations.asterismes)
const frontieres = coucheFrontieres(constellations)
const ciel = cielInstantane(SITE, DATE)
const magLimite = magnitudeRendue(VUE.fovDeg, null, false).value

function image(ctx: CanvasRenderingContext2D): { comptes: Comptes; dessinees: number } {
  const { proj, comptes } = projecteurCompte(projecteur(VUE, ciel.matrice))
  const sortie = dessineCiel({
    ctx,
    projecteur: proj,
    matriceCiel: ciel.matrice,
    masque: masquePlat(),
    vueRealiste: REALISTE,
    index,
    etoiles,
    objets,
    figures,
    asterismes,
    frontieres,
    etoilesNommees: constellations.etoilesNommees,
    corps: [],
    nomsCorps: {},
    cadres: [],
    couches: COUCHES,
    magLimite,
    // §3.7 — darkest sky of table: deepest magnitude limite → most stars. Worst case for BANDE is
    // the inverse (city sky paints all tranches invisibly) but bande costs 100× less than stars.
    sbCiel: SB_PLANCHER_NATUREL,
    latitudeDeg: SITE.latitudeDeg,
    modeNuit: false,
  })
  return { comptes, dessinees: sortie.etoilesDessinees }
}

if (EFFECTIVE) {
  const { ctx, valeur } = empreinteurEffectif()
  const { dessinees } = image(ctx)
  console.log(
    `peinture ${FOV}° ${valeur()}  ${dessinees.toLocaleString('fr-FR')} étoiles dessinées  ` +
      `mag ${magLimite.toFixed(1)}`,
  )
} else if (APPELS) {
  const { ctx, ordres } = contexteCompteur()
  const { dessinees } = image(ctx)
  const n = ordres()
  const total = (nom: string): number => n[nom] ?? 0
  const tracés = total('stroke') + total('fill') + total('fillText') + total('fillRect')
  const styles = (['globalAlpha', 'fillStyle', 'strokeStyle', 'lineWidth', 'font'] as const)
    .map((s) => total(s))
    .reduce((a, b) => a + b, 0)
  const redondants = (['globalAlpha', 'fillStyle', 'strokeStyle', 'lineWidth', 'font'] as const)
    .map((s) => total(`${s}~redondant`))
    .reduce((a, b) => a + b, 0)
  console.log(
    `${FOV}° de champ — ${dessinees.toLocaleString('fr-FR')} étoiles dessinées, ` +
      `mag ${magLimite.toFixed(1)}`,
  )
  console.log(
    `${tracés.toString().padStart(7)} tracés/image  ` +
      `(stroke ${total('stroke')}, fill ${total('fill')}, ` +
      `fillText ${total('fillText')}, fillRect ${total('fillRect')})`,
  )
  console.log(
    `${styles.toString().padStart(7)} styles/image  ` +
      `(dont ${redondants} redondants — ` +
      `alpha ${total('globalAlpha')}, strokeStyle ${total('strokeStyle')}, ` +
      `fillStyle ${total('fillStyle')}, lineWidth ${total('lineWidth')}, font ${total('font')})`,
  )
  console.log(
    `${(total('beginPath') + total('moveTo') + total('lineTo') + total('arc')).toString().padStart(7)} ` +
      `ordres de chemin  (beginPath ${total('beginPath')}, moveTo ${total('moveTo')}, ` +
      `lineTo ${total('lineTo')}, arc ${total('arc')})`,
  )
} else if (EMPREINTE) {
  const { ctx, valeur } = empreinteur()
  const { dessinees } = image(ctx)
  console.log(
    `empreinte ${FOV}° ${valeur()}  ${dessinees.toLocaleString('fr-FR')} étoiles dessinées  ` +
      `mag ${magLimite.toFixed(1)}`,
  )
} else {
  let gcs = 0
  let gcMs = 0
  const observateur = new PerformanceObserver((liste) => {
    for (const e of liste.getEntries()) {
      gcs++
      gcMs += e.duration
    }
  })
  observateur.observe({ entryTypes: ['gc'] })

  // Warm-up: JIT compiles, young generation grows to cruise size (`--max-semi-space-size` =
  // cap, not start size).
  for (let i = 0; i < 200; i++) image(contexteMuet())
  // GC observer delivers on a later loop turn: yield drains warm-up's queue → counter = measure
  // only.
  await new Promise((resoud) => setTimeout(resoud, 50))
  gcs = 0
  gcMs = 0
  path2dConstruits = 0
  const debut = performance.now()
  let comptes: Comptes | null = null
  let dessinees = 0
  for (let i = 0; i < IMAGES; i++) {
    const r = image(contexteMuet())
    comptes = r.comptes
    dessinees = r.dessinees
  }
  const ms = (performance.now() - debut) / IMAGES
  await new Promise((resoud) => setTimeout(resoud, 50))
  observateur.disconnect()

  const objetsParImage = comptes!.projette() * 2 + path2dConstruits / IMAGES
  console.log(
    `scène de référence${REALISTE ? ' — VUE RÉALISTE' : ''} — ${VUE.fovDeg}° de champ, ` +
      `${index.nombreEtoiles.toLocaleString('fr-FR')} ` +
      `étoiles au catalogue, ${dessinees.toLocaleString('fr-FR')} dessinées`,
  )
  console.log(
    `${objetsParImage.toLocaleString('fr-FR', { maximumFractionDigits: 0 }).padStart(9)} objets/image  ` +
      `(${comptes!.projette().toLocaleString('fr-FR')} projette ×2, ` +
      `${comptes!.projetteEn().toLocaleString('fr-FR')} projetteEn ×0, ` +
      `${(path2dConstruits / IMAGES).toFixed(0)} Path2D)`,
  )
  console.log(
    `${ms.toFixed(2).padStart(9)} ms/image   ` +
      `${gcs} GC sur ${IMAGES} images, ${gcMs.toFixed(1)} ms cumulés`,
  )
}
