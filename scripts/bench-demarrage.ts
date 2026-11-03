/**
 * T-0296 — main-thread startup cost, and the long task it must no longer produce.
 * Run: `pnpm bench:demarrage`. Exit != 0 above threshold.
 *
 * Replays off-browser the ÉTAGES `useCatalogues` chains in order (T-0255 audit: 150-182 ms
 * decode 83 479 stars + index at CPU ×4 tablet; 235-248 ms at ×6 phone). Checks `core/tranches.ts`
 * slicing keeps its promise.
 *
 * Throttling: tranche bounded in WALL-CLOCK time → at ×4 does 4× less work, not 4× longer. Only
 * DÉPASSEMENT stretches (work after last cut point, before budget noticed).
 * Longest task at CPU ×N = `TRANCHE_MS + dépassement × N`, vs long-task threshold.
 *
 * Dépassement = upper bound: fast machine fits a short étage in one tranche (no overshoot) but
 * throttled it would be cut → observed optimistic. Keep max(observed, time of one chunk between
 * cut points = worst case before budget noticed).
 *
 * Not measured: IndexedDB read, React render, paint (browser only; same limit as
 * `bench-frappe.ts`; incriminated tasks are pure compute). Constellations pack omitted: 1,1 ms
 * decode, < 7 ms throttled phone → slicing costs more than it saves.
 */

import { decodeEtoilesPas, type Etoile } from '../src/data/catalog.ts'
import { decodeObjetsPas } from '../src/data/deepsky.ts'
import { construitIndexPas } from '../src/core/index-ciel.ts'
import { parTranches, type Decoupable, type Tranchage } from '../src/core/tranches.ts'
import { B, BUDGETS } from '../src/registry/budgets.ts'
import { lit } from './bench-commun.ts'


/** The two machine classes T-0255 measured in browser. */
const BRIDAGES: readonly number[] = [B('BRIDAGE_CPU'), 6]

interface Etage {
  readonly nom: string
  readonly elements: number
  readonly tranchage: Tranchage
}

const etages: Etage[] = []

/**
 * Play one étage as the app does (sliced), keep its measure. 1st pass warms up: cold JIT =
 * compilation, not decoding.
 */
async function etage<T>(
  nom: string,
  compte: (valeur: T) => number,
  travail: () => Decoupable<T>,
): Promise<T> {
  await parTranches(travail())
  let tranchage: Tranchage = { tranches: 0, travailMs: 0, plusLongueMs: 0, depassementMs: 0 }
  const valeur = await parTranches(travail(), (mesure) => {
    tranchage = mesure
  })
  etages.push({ nom, elements: compte(valeur), tranchage })
  return valeur
}

/**
 * Dépassement to retain: max(observed, what one chunk between cut points can produce).
 * Single-tranche étage would be cut when throttled; observed 0 says nothing.
 */
function depassementMs(etage: Etage): number {
  const parMorceau =
    (etage.tranchage.travailMs * Math.min(B('PAS_TRANCHE'), etage.elements)) / etage.elements
  return Math.max(etage.tranchage.depassementMs, parMorceau)
}

/** Longest expected task under throttling: wall-clock budget + throttled dépassement. */
function tacheLaPlusLongueMs(etage: Etage, bridage: number): number {
  return B('TRANCHE_MS') + depassementMs(etage) * bridage
}

const paquetEtoiles = lit('hyg-1.bin')
const paquetObjets = { enregistrements: lit('openngc-1.bin'), chaines: lit('openngc-noms-1.bin') }
const paquetComplement = {
  enregistrements: lit('deepsky-1.bin'),
  chaines: lit('deepsky-noms-1.bin'),
}

console.log(
  `Budget d'une tranche : ${BUDGETS.TRANCHE_MS.valeur} ms d'horloge, point de coupe tous ` +
    `les ${BUDGETS.PAS_TRANCHE.valeur.toLocaleString('fr-FR')} éléments.`,
)
console.log(
  `Seuil de tâche longue : ${BUDGETS.TACHE_LONGUE_MS.valeur} ms — ` +
    `${BUDGETS.TACHE_LONGUE_MS.source}.\n`,
)

// order of `useCatalogues`: stars + index first, list after
const etoiles: readonly Etoile[] = await etage(
  'décodage des étoiles (HYG)',
  (e: Etoile[]) => e.length,
  () => decodeEtoilesPas(paquetEtoiles),
)
await etage('indexation du ciel (§3.3)', () => etoiles.length, () =>
  construitIndexPas(etoiles),
)
const ngc = await etage('décodage du ciel profond (OpenNGC)', (o) => o.length, () =>
  decodeObjetsPas(paquetObjets),
)
const complement = await etage(
  'décodage du complément (Sharpless, Barnard)',
  (o) => o.length,
  () => decodeObjetsPas(paquetComplement),
)

const CHIFFRE = (ms: number): string => ms.toFixed(2).padStart(8)

let depasse = false

for (const mesure of etages) {
  const { nom, elements, tranchage } = mesure
  console.log(`${nom} — ${elements.toLocaleString('fr-FR')} éléments`)
  console.log(
    `  ${CHIFFRE(tranchage.travailMs)} ms de travail, en ${tranchage.tranches} tranche(s)`,
  )
  console.log(
    `  ${CHIFFRE(tranchage.plusLongueMs)} ms  la plus longue tranche ` +
      `(dépassement retenu ${depassementMs(mesure).toFixed(2)} ms)`,
  )
  for (const bridage of BRIDAGES) {
    const tache = tacheLaPlusLongueMs(mesure, bridage)
    const tient = tache <= B('TACHE_LONGUE_MS')
    if (!tient) depasse = true
    console.log(
      `  ${tient ? '✓' : '✗'} CPU ×${bridage} : plus longue tâche attendue ` +
        `${tache.toFixed(1)} ms, travail total ${(tranchage.travailMs * bridage).toFixed(0)} ms`,
    )
  }
  console.log('')
}

const travailTotal = etages.reduce((somme, e) => somme + e.tranchage.travailMs, 0)
const jusquAuxEtoiles = etages
  .slice(0, 2)
  .reduce((somme, e) => somme + e.tranchage.travailMs, 0)

console.log(
  `Jusqu'aux étoiles peintes — décodage + indexation : ${jusquAuxEtoiles.toFixed(2)} ms, ` +
    BRIDAGES.map((b) => `${(jusquAuxEtoiles * b).toFixed(0)} ms à ×${b}`).join(', ') +
    '.',
)
console.log(
  `Démarrage complet — ${(ngc.length + complement.length).toLocaleString('fr-FR')} objets ` +
    `et ${etoiles.length.toLocaleString('fr-FR')} étoiles : ${travailTotal.toFixed(2)} ms, ` +
    BRIDAGES.map((b) => `${(travailTotal * b).toFixed(0)} ms à ×${b}`).join(', ') +
    '.',
)
console.log(
  'La liste arrive après le ciel : le décodage du ciel profond est le dernier étage joué.',
)

if (depasse) {
  console.error(
    '\nTâche longue au démarrage : voir T-0296, `core/tranches.ts` et `registry/budgets.ts`.',
  )
  process.exit(1)
}
