/**
 * T-0296 — ce que le démarrage tient sur le fil principal, chiffré, et la tâche longue qu'il
 * n'a plus le droit de produire.
 *
 * L'audit de T-0255 annonçait deux blocages au navigateur : 150 à 182 ms pour décoder les
 * 83 479 étoiles puis en construire l'index (CPU ×4, tablette), 235 à 248 ms à CPU ×6 sur
 * téléphone. Un chiffre pris au navigateur ne se rejoue pas ; ce banc mesure hors navigateur
 * les ÉTAGES que `useCatalogues` enchaîne, dans l'ordre où il les enchaîne, et vérifie que le
 * découpage de `core/tranches.ts` tient ce qu'il promet.
 *
 * CE QUE LE BRIDAGE FAIT, ET CE QU'IL NE FAIT PAS. Une tranche est bornée en TEMPS D'HORLOGE :
 * sous bridage ×4 elle accomplit quatre fois moins de travail, elle ne dure pas quatre fois
 * plus longtemps. Seul le DÉPASSEMENT s'allonge — la part travaillée après le dernier point de
 * coupe, avant que le budget soit constaté. La tâche la plus longue attendue à CPU ×N vaut
 * donc `TRANCHE_MS + dépassement × N`, et c'est elle qu'on compare au seuil de tâche longue.
 *
 * LE DÉPASSEMENT EST MAJORÉ, PAS SEULEMENT CONSTATÉ. Sur une machine rapide, un étage court
 * tient dans une seule tranche et ne dépasse donc jamais ; sous bridage il se découperait, et
 * la mesure d'ici serait optimiste. Le banc retient donc le plus grand des deux : le
 * dépassement observé, et le temps d'un morceau entre deux points de coupe — ce qu'une tranche
 * peut travailler au pire avant que le budget soit constaté.
 *
 * CE QUE CE BANC NE MESURE PAS : la lecture IndexedDB, le rendu React et la peinture restent
 * au navigateur. C'est la même limite que `bench-frappe.ts`, et elle est acceptable ici parce
 * que les tâches incriminées sont du calcul pur — décoder, ranger, trier, projeter. Le paquet
 * de constellations n'y figure pas non plus : 1,1 ms de décodage, moins de sept sous le
 * bridage du téléphone — le découper coûterait plus que ce qu'il tient.
 *
 * Usage : `pnpm bench:demarrage`. Sortie non nulle au-delà du seuil.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { decodeEtoilesPas, type Etoile } from '../src/data/catalog.ts'
import { decodeObjetsPas } from '../src/data/deepsky.ts'
import { construitIndexPas } from '../src/core/index-ciel.ts'
import { parTranches, type Decoupable, type Tranchage } from '../src/core/tranches.ts'
import { B, BUDGETS } from '../src/registry/budgets.ts'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Les deux classes de machine que T-0255 a mesurées au navigateur. */
const BRIDAGES: readonly number[] = [B('BRIDAGE_CPU'), 6]

function lit(nom: string): ArrayBuffer {
  const octets = readFileSync(join(RACINE, 'public/data', nom))
  return octets.buffer.slice(
    octets.byteOffset,
    octets.byteOffset + octets.byteLength,
  ) as ArrayBuffer
}

interface Etage {
  readonly nom: string
  readonly elements: number
  readonly tranchage: Tranchage
}

const etages: Etage[] = []

/**
 * Joue un étage comme l'application le joue — tranché — et retient sa mesure.
 *
 * Un premier passage échauffe : une médiane n'a pas de sens sur un étage joué une seule fois
 * au démarrage, mais un JIT froid mesurerait la compilation plutôt que le décodage.
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
 * Le dépassement à retenir : le plus grand entre celui qu'on a vu et celui qu'un morceau entre
 * deux points de coupe peut produire. Un étage qui tient dans une seule tranche ici se
 * découperait sous bridage, et son dépassement observé — nul — ne dirait rien.
 */
function depassementMs(etage: Etage): number {
  const parMorceau =
    (etage.tranchage.travailMs * Math.min(B('PAS_TRANCHE'), etage.elements)) / etage.elements
  return Math.max(etage.tranchage.depassementMs, parMorceau)
}

/** La tâche la plus longue attendue sous bridage : budget d'horloge, dépassement bridé. */
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

// L'ordre est celui de `useCatalogues` : les étoiles et leur index d'abord, la liste ensuite.
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
