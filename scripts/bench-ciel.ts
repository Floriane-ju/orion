/**
 * T-0065 — allocations d'une image du planétarium, chiffrées.
 *
 * L'audit annonce « de l'ordre de 10⁵ objets par seconde ». Un ordre de grandeur ne dit pas
 * si une optimisation a servi : ce script rejoue `dessineCiel` hors navigateur, sur la scène
 * de référence, et compte ce qui est alloué par image.
 *
 * Deux mesures, complémentaires :
 *
 *   - le COMPTE, par la projection. Chaque appel à `projette` alloue exactement deux objets
 *     — le littéral d'entrée chez l'appelant, le `PointEcran` en sortie ; chaque appel à
 *     `projetteEn` n'en alloue aucun. Les `Path2D` sont comptés à la construction.
 *   - le RAMASSE-MIETTES, toutes causes confondues. `perf_hooks` observe les GC réellement
 *     déclenchés pendant la série, sous les heuristiques par défaut du moteur. C'est le
 *     symptôme que l'audit décrit — des saccades, pas un FPS moyen plus bas — et il porte
 *     sur toutes les allocations, y compris celles que le compte ne voit pas.
 *
 * Une mesure d'octets alloués a été essayée et abandonnée : la croissance du tas dépend
 * plus des heuristiques de dimensionnement de la jeune génération que du code mesuré, et
 * deux passes consécutives donnaient 195 ko et 225 ko par image. Un chiffre instable ne
 * décide de rien.
 *
 * `--empreinte` remplace la mesure par le condensé des ordres de peinture : c'est lui qui
 * dit qu'une optimisation n'a PAS changé l'image (§critère « identique au pixel près »).
 *
 * Usage : `pnpm bench:ciel [--empreinte] [--realiste]`.
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
/**
 * T-0110 — le champ se choisit. Un défaut de rendu ne se voit pas au même champ pour toutes
 * les couches : les étoiles dominent en vue serrée, la bande et les frontières en vue large.
 * Mesurer à un seul champ, c'est ne mesurer qu'une moitié du chemin chaud.
 */
const arg = (nom: string, defaut: number): number =>
  Number(process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? defaut)
const FOV = arg('fov', 30)
/** T-0110 — la visée se choisit aussi : un écart peut n'être faux que dans une direction. */
const AZIMUT = arg('az', 180)
const HAUTEUR_VISEE = arg('alt', 40)
/**
 * T-0110 — `--appels` compte les ORDRES DE PEINTURE, pas les allocations. C'est la mesure qui
 * manquait à T-0054 : un `stroke()` par élément coûte le pilote graphique, pas le tas, et
 * aucun compteur d'objets ne le voit passer.
 */
const APPELS = process.argv.includes('--appels')
/**
 * T-0110 — `--effective` hache la PEINTURE, quand `--empreinte` hache les ORDRES.
 *
 * La différence décide d'une optimisation. Supprimer un `stroke()` sur un chemin vide, ou une
 * écriture de style que rien n'utilise avant d'être réécrite, change le flux d'ordres sans
 * toucher un pixel : `--empreinte` le signale comme une régression, à tort. Cette empreinte-ci
 * n'absorbe un ordre qu'au moment où il pose de la couleur, avec l'état de style qui s'y
 * applique — deux passes qui peignent la même image la partagent, quel que soit le chemin pris
 * pour y arriver.
 */
const EFFECTIVE = process.argv.includes('--effective')
/** T-0098 — `--realiste` ajoute le fond peint et ses paliers de halo : c'est leur surcoût. */
const REALISTE = process.argv.includes('--realiste')

/** Scène de référence : plein champ, toutes les couches, le ciel d'un site réel. */
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

/** Node n'a pas de `Path2D` : ce substitut absorbe les ordres et se laisse compter. */
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
 * Empreinte de la peinture seule : ce qui touche un pixel, et rien d'autre.
 *
 * Trois choses sont volontairement invisibles à cette empreinte, parce qu'elles sont
 * invisibles à l'écran — et c'est ce qui la rend capable de valider une optimisation :
 *
 *   - une écriture de style que rien n'utilise avant d'être réécrite ;
 *   - un `stroke()` sur un chemin vide ;
 *   - un segment de chemin qui tombe HORS du canevas. C'est le cas décisif : écarter une
 *     géométrie avant de la projeter supprime des `moveTo`/`lineTo` dont aucun ne posait de
 *     couleur. Une empreinte qui hache le chemin entier crie à la régression ; celle-ci ne
 *     retient que les segments dont la boîte, élargie de la demi-épaisseur du trait, croise
 *     le canevas.
 *
 * Deux passes qui peignent la même image la partagent, quel que soit le chemin pris.
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
  /** Le chemin en cours, en sous-chemins : `moveTo` en ouvre un, `lineTo` le prolonge. */
  let sousChemins: Pt[][] = []
  const courant = (): Pt[] => {
    const dernier = sousChemins[sousChemins.length - 1]
    if (dernier !== undefined) return dernier
    const neuf: Pt[] = []
    sousChemins.push(neuf)
    return neuf
  }
  /** La boîte élargie de `marge` croise-t-elle le canevas ? */
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
      // L'arc est son propre sous-chemin : il se juge sur son disque englobant.
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

/** Contexte 2D muet : il absorbe les ordres de peinture, il n'en exécute aucun. */
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
    // T-0144 — le marqueur d'un objet étendu se peint dans un repère tourné puis remis en
    // place. Sans ces quatre ordres, le banc s'arrête sur la première galaxie du champ.
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
 * Contexte 2D qui compte les ordres. Les affectations de style sont comptées deux fois : le
 * total, et la part REDONDANTE — réécrire `strokeStyle` avec la valeur qu'il porte déjà est
 * un appel au pilote pour rien, et c'est le symptôme du tracé élément par élément.
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
  /** Un accesseur qui compte les écritures, et celles qui ne changent rien. */
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
  // `Object.fromEntries` produit des descripteurs de données : les convertir en accesseurs.
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

/**
 * Projecteur instrumenté. `projette` alloue deux objets par appel — l'entrée et la sortie ;
 * `projetteEn` n'en alloue aucun. Compter les appels, c'est compter les objets.
 */
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
    // §3.7 — le ciel le plus noir de la table : c'est lui qui donne la magnitude limite la
    // plus profonde, donc le plus d'étoiles à sélectionner et à tracer. Le cas le plus lourd
    // POUR LA BANDE est l'inverse — un ciel de ville y fait peindre toutes les tranches, à une
    // opacité invisible — mais la bande coûte deux ordres de grandeur de moins que les étoiles.
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

  // Chauffe : le JIT compile, et la jeune génération grandit jusqu'à sa taille de croisière —
  // `--max-semi-space-size` est un plafond, pas une taille de départ.
  for (let i = 0; i < 200; i++) image(contexteMuet())
  // L'observateur de GC livre ses entrées sur un tour de boucle ultérieur : rendre la main
  // ici vide la file de la chauffe, pour que le compteur ne parle que de la mesure.
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
