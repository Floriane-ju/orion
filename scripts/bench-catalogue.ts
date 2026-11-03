/**
 * T-0190 — cost of 1-min step on catalogue list. Run: `pnpm bench:catalogue`.
 * Before: each minute recomputed détectabilité, cadrage, tri (96,6 % of cost, 0 % useful change).
 * Split: invariant (catalogue + optique) vs time-dependent (azimut/hauteur).
 * Target: coordinate-only pass < 5 ms over 13 132 objets.
 */

import { decodeObjets } from '../src/data/deepsky.ts'
import { cielInstantane } from '../src/core/horloges.ts'
import { ajouteCoordonnees, lignesCatalogue, lignesInvariantes } from '../src/core/cibles-liste.ts'
import { lit, SITE } from './bench-commun.ts'


/** §9.3 reference setup: 120 mm f/2.8, plein format, Bortle 4,5. */
const OPTIQUE = { fovHDeg: 16.4, echApx: 10.1, capteurHMm: 24, dMm: 42.86 }
const CIEL = { sbCiel: 21.0, mLimOeil: 6.1 }

/** Real catalogue. */
const CATALOGUE = decodeObjets({
  enregistrements: lit('openngc-1.bin'),
  chaines: lit('openngc-noms-1.bin'),
})

// warm-up
const date0 = new Date('2026-08-15T22:00:00Z')
const ciel0 = cielInstantane(SITE, date0)
for (let i = 0; i < 10; i++) {
  lignesCatalogue({ catalogue: CATALOGUE, matriceCiel: ciel0.matrice, ...OPTIQUE, ...CIEL })
}

console.log(`Catalogue réel : ${CATALOGUE.length.toLocaleString('fr-FR')} objets\n`)

// T-0190 before: recompute everything each minute
console.log('AVANT optimisation (tout recalculé par minute) :')
const minutes = 60
const debuts = performance.now()
for (let i = 0; i < minutes; i++) {
  const date = new Date(date0.getTime() + i * 60 * 1000)
  const ciel = cielInstantane(SITE, date)
  lignesCatalogue({ catalogue: CATALOGUE, matriceCiel: ciel.matrice, ...OPTIQUE, ...CIEL })
}
const avant = (performance.now() - debuts) / minutes
console.log(`  ${avant.toFixed(2)} ms/minute moyenne sur ${minutes} passes`)

// T-0190 after: invariant cache + coordinate pass
console.log('\nAPRÈS optimisation (cache invariant + coordonnées) :')
const lignesInvar = lignesInvariantes({ catalogue: CATALOGUE, ...OPTIQUE, ...CIEL })
const debut = performance.now()
for (let i = 0; i < minutes; i++) {
  const date = new Date(date0.getTime() + i * 60 * 1000)
  const ciel = cielInstantane(SITE, date)
  ajouteCoordonnees(lignesInvar, ciel.matrice)
}
const apres = (performance.now() - debut) / minutes
console.log(`  ${apres.toFixed(2)} ms/minute moyenne sur ${minutes} passes`)

console.log(`\nGain : ${(avant - apres).toFixed(2)} ms/minute (${((1 - apres / avant) * 100).toFixed(1)}%)`)
console.log(`Cible T-0190 : ${apres < 5 ? '✓ ATTEINTE' : '✗ échouée'} (< 5 ms)`)
