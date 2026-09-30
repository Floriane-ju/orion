/**
 * §8.3 et §2.4 — les poids C-15 se règlent, la somme reste à 1, et rien ne s'apprend.
 *
 * Ce qui est vérifié ici n'est pas une valeur de poids — le registre la porte — mais deux
 * propriétés : la normalisation tient quelle que soit l'échelle des curseurs, et le plan
 * produit change bien quand les poids changent, à ciel et matériel identiques.
 */

import { describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import {
  normalisePoids,
  planSession,
  poidsParDefaut,
  type ContexteSession,
  type PoidsScoring,
} from '../src/core/session.ts'
import { scoreGlobal } from '../src/core/session-score.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import { objetNebuleuse as objet, SITE_REFERENCE } from './fixtures.ts'

const NUIT = fenetreNocturne(SITE_REFERENCE, new Date('2026-08-14T12:00:00Z'))

/** Trois cibles cadrables par ce setup, comme dans `plan-session.test.ts`. */
const CATALOGUE: readonly ObjetCielProfond[] = [
  objet({ designation: 'NGC7000', adDeg: 314.75, decDeg: 44.52, majAxArcmin: 120, minAxArcmin: 100, vMag: 4 }),
  objet({ designation: 'M31', adDeg: 10.68, decDeg: 41.27, type: 'GALAXIE', majAxArcmin: 190, minAxArcmin: 60, vMag: 3.4 }),
  objet({ designation: 'M45', adDeg: 56.75, decDeg: 24.12, type: 'AMAS_OUVERT', majAxArcmin: 110, minAxArcmin: 110, vMag: 1.6 }),
]

/** Setup ciel profond de l'Annexe A, comme `plan-session.test.ts`. */
function contexte(poids?: PoidsScoring): ContexteSession {
  return {
    site: SITE_REFERENCE,
    nuit: NUIT,
    fenetreUtile: fenetreUtile(SITE_REFERENCE, NUIT),
    masque: masquePlat(),
    fovHDeg: 11.38,
    echApx: 8.8,
    dMm: 42.9,
    capteurHMm: 23.9,
    pitchUm: 5.12,
    ouvertureN: 2.8,
    zpSys: 20.2,
    zpEstime: true,
    readNoiseE: 1.5,
    tailleRawMo: 33,
    isoSession: 640,
    sbCielNoir: 20.95,
    mLimOeil: 5.9,
    tMaxS: 13,
    domaineCpFerme: null,
    snrCible: 10,
    typeMonture: 'TRACKER',
    ...(poids === undefined ? {} : { poids }),
  }
}

function somme(p: PoidsScoring): number {
  return p.cadrage + p.hauteur + p.signal + p.fenetre + p.lune
}

describe('normalisation des poids §8.3', () => {
  it('ramène la somme à 1 quelle que soit l’échelle des curseurs', () => {
    const brut = { cadrage: 0.8, hauteur: 0.8, signal: 0.4, fenetre: 0.2, lune: 0.2 }
    expect(somme(normalisePoids(brut))).toBeCloseTo(1, 12)
  })

  it('conserve les rapports entre critères : c’est le réglage, pas les valeurs', () => {
    const brut = { cadrage: 0.8, hauteur: 0.4, signal: 0.4, fenetre: 0.2, lune: 0.2 }
    const effectifs = normalisePoids(brut)
    expect(effectifs.cadrage / effectifs.hauteur).toBeCloseTo(brut.cadrage / brut.hauteur, 12)
  })

  it('est idempotente : réimporter des poids déjà normalisés ne les déplace pas', () => {
    const une = normalisePoids({ cadrage: 0.5, hauteur: 0.3, signal: 0.9, fenetre: 0.1, lune: 0.4 })
    expect(normalisePoids(une)).toStrictEqual(une)
  })

  it('retombe sur C-15 quand tout est à zéro, plutôt que de rendre des scores NaN', () => {
    const zero = { cadrage: 0, hauteur: 0, signal: 0, fenetre: 0, lune: 0 }
    expect(normalisePoids(zero)).toStrictEqual(poidsParDefaut())
    expect(somme(normalisePoids(zero))).toBeCloseTo(1, 12)
  })

  it('accepte un critère seul à fond : le curseur va jusqu’aux bornes du domaine', () => {
    const seul = {
      cadrage: DOMAINES.poids_scoring.max,
      hauteur: DOMAINES.poids_scoring.min,
      signal: DOMAINES.poids_scoring.min,
      fenetre: DOMAINES.poids_scoring.min,
      lune: DOMAINES.poids_scoring.min,
    }
    expect(normalisePoids(seul).cadrage).toBeCloseTo(1, 12)
  })
})

describe('le score suit les poids courants', () => {
  const detail = { cadrage: 1, hauteur: 0, signal: 0, fenetre: 0, lune: 0 }

  it('vaut le poids du seul critère non nul', () => {
    const poids = normalisePoids({ cadrage: 0.5, hauteur: 0.5, signal: 0, fenetre: 0, lune: 0 })
    expect(scoreGlobal(detail, poids).value).toBeCloseTo(poids.cadrage, 12)
  })

  it('porte les poids employés dans sa trace, pas seulement ceux du registre', () => {
    const poids = normalisePoids({ cadrage: 0.9, hauteur: 0.1, signal: 0, fenetre: 0, lune: 0 })
    const t = scoreGlobal(detail, poids)
    expect(t.inputs.w_cadrage).toBeCloseTo(poids.cadrage, 12)
    expect(t.inputs.w_cadrage).not.toBeCloseTo(poidsParDefaut().cadrage, 6)
  })
})

describe('le plan se recalcule au changement de poids §8.3', () => {
  it('normalise les poids reçus avant de les exposer', () => {
    const plan = planSession(
      contexte({ cadrage: 0.6, hauteur: 0.6, signal: 0.6, fenetre: 0.6, lune: 0.6 }),
      CATALOGUE,
    )
    expect(somme(plan.poids)).toBeCloseTo(1, 12)
    for (const valeur of Object.values(plan.poids)) expect(valeur).toBeCloseTo(1 / 5, 12)
  })

  it('produit d’autres scores que les poids par défaut, à ciel et matériel identiques', () => {
    const parDefaut = planSession(contexte(), CATALOGUE)
    const hauteurSeule = planSession(
      contexte({ cadrage: 0, hauteur: 1, signal: 0, fenetre: 0, lune: 0 }),
      CATALOGUE,
    )
    expect(hauteurSeule.etapes.length).toBeGreaterThan(0)
    const scores = (plan: typeof parDefaut) => plan.etapes.map((e) => e.score.value)
    expect(scores(hauteurSeule)).not.toStrictEqual(scores(parDefaut))
    // Un seul critère pesant : le score de chaque étape est exactement sa composante hauteur.
    for (const etape of hauteurSeule.etapes) {
      expect(etape.score.value).toBeCloseTo(etape.detailScore.hauteur, 12)
    }
  })

  it('rend le même plan deux fois de suite : aucun apprentissage, aucune dérive', () => {
    const poids = { cadrage: 0.1, hauteur: 0.9, signal: 0.3, fenetre: 0.2, lune: 0.5 }
    const premier = planSession(contexte(poids), CATALOGUE)
    const second = planSession(contexte(poids), CATALOGUE)
    expect(second.poids).toStrictEqual(premier.poids)
    expect(second.etapes.map((e) => e.objet.designation)).toStrictEqual(
      premier.etapes.map((e) => e.objet.designation),
    )
  })
})
