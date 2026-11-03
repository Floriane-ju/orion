/**
 * §8.3 — ordered session plan; §11.2 — printable text export. Output = CHRONOLOGY, not ranking.
 * Dropped targets carry their cause, kept apart; plan never padded with refused targets.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import {
  AUCUNE_CIBLE_CHOISIE,
  planSession,
  poidsParDefaut,
  type ContexteSession,
} from '../src/core/session.ts'
import { planEnTexte } from '../src/core/plan-texte.ts'
import { profilSuivi } from '../src/core/suivi.ts'
import { etatsCibles, photographiable } from '../src/core/cibles-liste.ts'
import { decodeObjets, type ObjetCielProfond } from '../src/data/deepsky.ts'
import { K } from '../src/registry/constants.ts'
import { LIBELLE_CAUSE_ECART, LIBELLE_LOT_CALIBRATION } from '../src/registry/libelles.ts'
import { objetNebuleuse as objet, SITE_REFERENCE } from './fixtures.ts'

const NUIT = fenetreNocturne(SITE_REFERENCE, new Date('2026-08-14T12:00:00Z'))

/** Annexe A deep-sky setup: 120 mm f/2.8 full frame. */
function contexte(surcharge: Partial<ContexteSession> = {}): ContexteSession {
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
    mLimOeil: 6.05,
    tMaxS: 200,
    domaineCpFerme: null,
    snrCible: 10,
    typeMonture: 'TRACKER',
    ...surcharge,
  }
}

/**
 * Three targets: framable, too small, overflowing the field. Real sizes/magnitudes: M31 gets
 * Annexe A's 22.17 mag/arcsec² surface brightness.
 */
const CATALOGUE: readonly ObjetCielProfond[] = [
  objet({
    designation: 'NGC7000',
    nomsCommuns: 'Amérique du Nord',
    adDeg: 314.75,
    decDeg: 44.52,
    type: 'EMISSION',
    majAxArcmin: 120,
    minAxArcmin: 100,
    vMag: 4,
  }),
  objet({
    designation: 'M31',
    nomsCommuns: 'Andromède',
    adDeg: 10.68,
    decDeg: 41.27,
    type: 'GALAXIE',
    majAxArcmin: 190,
    minAxArcmin: 60,
    vMag: 3.4,
  }),
  objet({
    designation: 'M45',
    nomsCommuns: 'Pléiades',
    adDeg: 56.75,
    decDeg: 24.12,
    type: 'AMAS_OUVERT',
    majAxArcmin: 110,
    minAxArcmin: 110,
    vMag: 1.6,
  }),
  objet({
    designation: 'M33',
    adDeg: 23.46,
    decDeg: 30.66,
    type: 'GALAXIE',
    majAxArcmin: 71,
    minAxArcmin: 42,
    vMag: 5.7,
  }),
  objet({ designation: 'IMMENSE', adDeg: 312, decDeg: 42, majAxArcmin: 1500, vMag: 3 }),
]

describe('plan de session §8.3', () => {
  const plan = planSession(contexte(), CATALOGUE)

  it('produit une chronologie ordonnée dans le temps, pas un palmarès', () => {
    expect(plan.etapes.length).toBeGreaterThan(0)
    const debuts = plan.etapes.map((e) => e.creneauAlloue.debut.getTime())
    expect(debuts).toStrictEqual([...debuts].sort((a, b) => a - b))
  })

  it('n’alloue jamais deux fois le même morceau de nuit', () => {
    for (let i = 1; i < plan.etapes.length; i++) {
      const precedente = plan.etapes[i - 1]!
      const courante = plan.etapes[i]!
      expect(courante.creneauAlloue.debut.getTime()).toBeGreaterThanOrEqual(
        precedente.creneauAlloue.fin.getTime(),
      )
    }
  })

  it('expose la décomposition du score de chaque cible', () => {
    for (const etape of plan.etapes) {
      const d = etape.detailScore
      expect(d.cadrage).toBeGreaterThanOrEqual(0)
      expect(d.hauteur).toBeLessThanOrEqual(1)
      expect(etape.score.formula.section).toBe('8.3')
      expect(etape.score.constants.map((c) => c.ref)).toContain('C-15')
    }
  })

  it('tient le budget de nuit, calibration et pointage inclus', () => {
    expect(plan.budget.tient).toBe(true)
    expect(plan.budget.miseEnStationMin).toBeGreaterThan(0)
    expect(plan.budget.pointageMin).toBeGreaterThan(0)
    expect(plan.budget.totalMin.value).toBeLessThanOrEqual(plan.budget.disponibleMin)
  })

  it('écarte les cibles non cadrables avec leur cause, hors de la chronologie', () => {
    const designations = plan.etapes.map((e) => e.objet.designation)
    expect(designations).not.toContain('M33')
    expect(designations).not.toContain('IMMENSE')
    const ecartees = plan.ciblesEcartees.map((c) => c.designation)
    expect(ecartees).toContain('M33')
    expect(ecartees).toContain('IMMENSE')
    for (const ecartee of plan.ciblesEcartees) expect(ecartee.cause).not.toBe('')
  })

  it('donne à chaque étape sa consigne de terrain', () => {
    for (const etape of plan.etapes) expect(etape.consigne).not.toBe('')
  })

  it('rappelle qu’aucun filtre météo n’est appliqué', () => {
    expect(plan.avertissementMeteo).toMatch(/Météo/)
    expect(plan.avertissementMeteo).toMatch(/nuages/)
  })

  it('rappelle la batterie quand la capture dépasse le seuil, sans chiffrer d’autonomie', () => {
    // Annexe A setup under threshold: no rappel by default.
    expect(plan.budget.captureMin).toBeLessThanOrEqual(K('DUREE_RAPPEL_BATTERIE_MIN'))
    expect(plan.avertissementBatterie).toBeUndefined()

    // Demanding target lengthens capture: rappel appears, no autonomy figure.
    const long = planSession(contexte({ snrCible: 30 }), CATALOGUE)
    expect(long.budget.captureMin).toBeGreaterThan(K('DUREE_RAPPEL_BATTERIE_MIN'))
    expect(long.avertissementBatterie).toMatch(/batterie/)
    expect(long.avertissementBatterie).not.toMatch(/CIPA|°C/)
    expect(
      planEnTexte(long, { nuitIso: '2026-08-14', lieu: 'site', materiel: 'setup' }),
    ).toContain('BATTERIE')
  })

  it('expose les poids de scoring, réglables et non appris', () => {
    expect(plan.poids).toStrictEqual(poidsParDefaut())
    const somme = Object.values(plan.poids).reduce((a, b) => a + b, 0)
    expect(somme).toBeCloseTo(1, 6)
  })
})

/**
 * §8.3 — engine input = user SELECTION (§6.4), never the catalogue. Kept plan compared with engine
 * output on same selection; dropped targets carry engine cause.
 */
describe('le plan n’ordonne que les cibles choisies §8.3', () => {
  const cibleDe = (designation: string): ObjetCielProfond =>
    CATALOGUE.find((o) => o.designation === designation)!

  it('dit le geste qui manque quand rien n’est choisi, sans accuser le ciel', () => {
    const vide = planSession(contexte(), [])
    expect(vide.etapes).toStrictEqual([])
    expect(vide.message).toBe(AUCUNE_CIBLE_CHOISIE)
    // Grand champ answers "aucune cible compatible", not "nothing ticked".
    expect(vide.alternative).toBeUndefined()
    expect(vide.contrainteDominante).toBeUndefined()
    expect(vide.ciblesEcartees).toStrictEqual([])
  })

  it('ne retient que les cibles reçues, et les rend dans l’ordre du temps', () => {
    const choisies = [cibleDe('M31'), cibleDe('NGC7000')]
    const plan = planSession(contexte(), choisies)

    // Premise computed: empty plan would pass next two assertions.
    expect(plan.etapes.length).toBeGreaterThan(0)
    const designations = plan.etapes.map((e) => e.objet.designation)
    expect(designations.every((d) => choisies.some((o) => o.designation === d))).toBe(true)

    const debuts = plan.etapes.map((e) => e.creneauAlloue.debut.getTime())
    expect(debuts).toStrictEqual([...debuts].sort((a, b) => a - b))
  })

  it('ignore une cible du catalogue qui n’a pas été choisie', () => {
    const seule = planSession(contexte(), [cibleDe('M31')])
    const complet = planSession(contexte(), CATALOGUE)
    // Premise: full catalogue plans more, else nothing demonstrated.
    expect(complet.etapes.length).toBeGreaterThan(seule.etapes.length)
    expect(seule.etapes.map((e) => e.objet.designation)).toStrictEqual(['M31'])
  })

  it('nomme la cause d’une cible choisie que la nuit refuse', () => {
    const refusee = cibleDe('IMMENSE')
    const plan = planSession(contexte(), [refusee])
    expect(plan.etapes).toStrictEqual([])
    const ecartee = plan.ciblesEcartees.find((c) => c.designation === refusee.designation)
    expect(ecartee, refusee.designation).toBeDefined()
    expect(ecartee!.cause.length).toBeGreaterThan(20)
  })

  it('garde au plan TOUTE cible que la liste annonce photographiable', () => {
    // T-0322: list said "photographiable, 2 nuits", plan said "non retenue, la moins bien notée est
    // retirée" — two verdicts for one target. Criterion = list's (`photographiable`); plan can't
    // undo.
    const etats = etatsCibles(contexte(), CATALOGUE)
    const attendues = CATALOGUE.filter((o) => photographiable(etats.get(o.designation)))
    expect(attendues.length).toBeGreaterThan(0)

    const plan = planSession(contexte(), attendues)
    const auPlan = new Set(plan.etapes.map((e) => e.objet.designation))
    expect(attendues.filter((o) => !auPlan.has(o.designation)).map((o) => o.designation)).toStrictEqual(
      [],
    )
  })

  it('annonce le dépassement de la nuit au lieu de retirer une cible', () => {
    // Pointage alone (10 min/target) overflows any night once many picked; used to drop one by one.
    const etats = etatsCibles(contexte(), CATALOGUE)
    const photographiables = CATALOGUE.filter((o) => photographiable(etats.get(o.designation)))
    const beaucoup = Array.from({ length: 20 }, (_, i) =>
      photographiables.map((o) => ({ ...o, designation: `${o.designation}-${i}` })),
    ).flat()

    const plan = planSession(contexte(), beaucoup)
    // Premise: without overflow nothing proven (10 min pointage/target suffices).
    expect(plan.budget.tient).toBe(false)
    // Yet none dropped: partage gives each its share; overflow shows on the budget.
    expect(plan.etapes).toHaveLength(beaucoup.length)
    expect(plan.ciblesEcartees).toStrictEqual([])
  })

  it('ne laisse pas une cible de plusieurs nuits affamer une cible courte', () => {
    // T-0322 — `alloueCreneau` caps at what target CLAIMS; multi-night target claims > whole night:
    // served first, it took its whole créneau, neighbour came out "non retenue". Same coords → same
    // créneau: without "ce qui se termine ce soir passe d'abord", one gets no minute.
    const gourmande = objet({ designation: 'GOURMANDE', vMag: 3.8, decDeg: 46 })
    const rapide = objet({
      designation: 'RAPIDE',
      vMag: 1.5,
      decDeg: 15,
      majAxArcmin: 110,
      minAxArcmin: 90,
    })

    const etats = etatsCibles(contexte(), [gourmande, rapide])
    // Premise: both photographiable, one overflows the night.
    expect(photographiable(etats.get('GOURMANDE'))).toBe(true)
    expect(photographiable(etats.get('RAPIDE'))).toBe(true)
    expect(etats.get('GOURMANDE')!.pose!.nNuits).toBeGreaterThan(1)
    expect(etats.get('RAPIDE')!.pose!.nNuits).toBe(1)

    const plan = planSession(contexte(), [gourmande, rapide])
    // 2nd premise: greedy one wins score arbitration, else test passes for the wrong reason (short
    // one served first by chance).
    const score = (d: string) => plan.etapes.find((e) => e.objet.designation === d)!.score.value
    expect(score('GOURMANDE')).toBeGreaterThan(score('RAPIDE'))
    expect(plan.etapes.map((e) => e.objet.designation).sort()).toStrictEqual([
      'GOURMANDE',
      'RAPIDE',
    ])
    // Short one SERVED, not just present: its integration fits tonight.
    expect(plan.etapes.find((e) => e.objet.designation === 'RAPIDE')!.integrationComplete).toBe(
      true,
    )
  })

  it('annonce le même nombre de nuits que la liste, pour la même cible', () => {
    const etats = etatsCibles(contexte(), CATALOGUE)
    const plan = planSession(
      contexte(),
      CATALOGUE.filter((o) => photographiable(etats.get(o.designation))),
    )
    expect(plan.etapes.length).toBeGreaterThan(0)
    for (const etape of plan.etapes) {
      const pose = etats.get(etape.objet.designation)?.pose
      expect(pose, etape.objet.designation).toBeDefined()
      expect(etape.nNuits, etape.objet.designation).toBe(pose!.nNuits)
    }
  })

  it('n’écarte aucune cible choisie en silence, si nombreuses soient-elles', () => {
    // Old candidate cap cut selection by magnitude, causeless. Wider selection must come back
    // ENTIRE (plan or dropped).
    const large = Array.from({ length: 45 }, (_, i) =>
      objet({ designation: `CHOISIE-${i}`, adDeg: i * 8, decDeg: 20 + (i % 40) }),
    )
    const plan = planSession(contexte(), large)
    const nommees = new Set([
      ...plan.etapes.map((e) => e.objet.designation),
      ...plan.ciblesEcartees.map((c) => c.designation),
    ])
    expect(large.filter((o) => !nommees.has(o.designation)).map((o) => o.designation)).toStrictEqual(
      [],
    )
  })
})

describe('cas limite : aucune cible compatible §8.3', () => {
  const plan = planSession(contexte(), [
    objet({ designation: 'TROP_AU_SUD', adDeg: 266, decDeg: -29, majAxArcmin: 280 }),
  ])

  it('annonce l’absence de cible et nomme la contrainte dominante', () => {
    expect(plan.etapes).toStrictEqual([])
    expect(plan.contrainteDominante).toContain(LIBELLE_CAUSE_ECART.HAUTEUR)
  })

  it('propose une alternative sans remplir la liste avec les cibles écartées', () => {
    expect(plan.alternative).toMatch(/grand champ|filé/)
    expect(plan.ciblesEcartees.length).toBe(1)
  })
})

describe('export imprimable §11.2', () => {
  it('contient cibles, créneaux, poses, nombres d’images et calibration', () => {
    const plan = planSession(contexte(), CATALOGUE)
    const texte = planEnTexte(plan, {
      nuitIso: '2026-08-14',
      lieu: '46,391° N / 6,697° E — Bortle 4,5',
      materiel: '120 mm f/2,8, plein format',
    })
    expect(texte).toContain('PLAN DE SESSION')
    // T-0267 — title names night by its two dates, not just evening day.
    expect(texte).toContain('nuit du 14/08/2026 au 15/08/2026')
    expect(texte).toContain('CHRONOLOGIE')
    expect(texte).toContain('CALIBRATION')
    expect(texte).toMatch(/Pose unitaire\s+: \d+ s/)
    expect(texte).toMatch(/Nombre de poses\s+: \d+ poses/)
    expect(texte).toContain(LIBELLE_LOT_CALIBRATION.FLATS)
    expect(texte).toMatch(/météo|nuages/i)
  })

  it('porte une unité sur chaque valeur affichée', () => {
    const plan = planSession(contexte(), CATALOGUE)
    const texte = planEnTexte(plan, { nuitIso: '2026-08-14', lieu: 'site', materiel: 'setup' })
    // No "label: number" line without a unit after the number.
    const sansUnite = texte
      .split('\n')
      .filter((ligne) => /:\s+-?\d+(?:[.,]\d+)?\s*$/.test(ligne))
    expect(sansUnite).toStrictEqual([])
  })
})

describe('sur le catalogue OpenNGC embarqué', () => {
  const dossier = join(import.meta.dirname, '..', 'public', 'data')
  const lit = (nom: string): ArrayBuffer => {
    const octets = readFileSync(join(dossier, nom))
    return octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength)
  }
  const catalogue = decodeObjets({
    enregistrements: lit('openngc-1.bin'),
    chaines: lit('openngc-noms-1.bin'),
  })

  it('produit un plan sur les 12 458 objets réels, sans lever d’erreur', () => {
    expect(catalogue.length).toBeGreaterThan(10000)
    const depart = Date.now()
    const plan = planSession(contexte(), catalogue)
    const duree = Date.now() - depart

    expect(plan.etapes.length).toBeGreaterThan(0)
    expect(plan.budget.tient).toBe(true)
    // Hard pre-filter bounds cost: ephemeris only for retained candidates, not whole catalogue.
    expect(duree).toBeLessThan(5000)
  })

  it('dit ce que le catalogue ne porte pas, au lieu d’inventer une magnitude', () => {
    const plan = planSession(contexte(), catalogue)
    expect(plan.comptesEcartees.DONNEE_MANQUANTE).toBeGreaterThan(0)
    expect(plan.noteCouvertureCatalogue).toMatch(/faute de taille ou de magnitude/)
  })

  it('nomme la cause de chaque cible écartée, sans jamais en laisser une muette', () => {
    const plan = planSession(contexte(), catalogue)
    for (const ecartee of plan.ciblesEcartees) {
      expect(ecartee.cause.length, ecartee.designation).toBeGreaterThan(20)
    }
  })
})

/**
 * T-0079 → T-0266 — what grand champ really holds, on the REAL CATALOGUE.
 * Epic wanted a plan citing a Sharpless/Barnard target; passed only via Barnard opacity class read
 * as magnitude (removed T-0266). The 344 Barnard objects have no photometry (dark nebula absorbs);
 * Sharpless with one sit below grand champ profile's lower fill bound: disjoint sets.
 * Checks honesty: complement dropped for true, named reason; no invented magnitude (old criterion
 * needs flux §6.3 forbids).
 */
describe('grand champ bout en bout §6.1 (T-0079, T-0266)', () => {
  /** Sharpless + Barnard — complement NGC/IC don't carry. */
  const EST_COMPLEMENT = /^(Sh2-|B)\d+$/

  function catalogueReel(): readonly ObjetCielProfond[] {
    const lit = (nom: string): ArrayBuffer => {
      const octets = readFileSync(join(import.meta.dirname, '..', 'public', 'data', nom))
      return octets.buffer.slice(
        octets.byteOffset,
        octets.byteOffset + octets.byteLength,
      ) as ArrayBuffer
    }
    return [
      ...decodeObjets({
        enregistrements: lit('openngc-1.bin'),
        chaines: lit('openngc-noms-1.bin'),
      }),
      ...decodeObjets({
        enregistrements: lit('deepsky-1.bin'),
        chaines: lit('deepsky-noms-1.bin'),
      }),
    ]
  }

  it('tient un plan sur le catalogue réel, et compte ce que le grand champ n’y trouve pas', () => {
    const catalogue = catalogueReel()
    const plan = planSession(contexte(), catalogue)
    expect(plan.etapes.length).toBeGreaterThan(0)

    // No integrated magnitude → no surface brightness → no verdict: complement can't enter plan
    // (needs flux neither OpenNGC nor DSO catalogue publishes).
    const planifiees = plan.etapes.filter((e) => EST_COMPLEMENT.test(e.objet.designation))
    expect(planifiees.map((e) => e.objet.designation).join(', ')).toBe('')

    // Not lost silently: pre-filter counts dataless targets (thousands) instead of listing them;
    // coverage note carries count to screen. Threshold derived from pack.
    const sansPhotometrie = catalogue.filter(
      (objet) => EST_COMPLEMENT.test(objet.designation) && objet.vMag === null,
    )
    expect(sansPhotometrie.length).toBeGreaterThan(0)
    expect(plan.comptesEcartees.DONNEE_MANQUANTE ?? 0).toBeGreaterThanOrEqual(
      sansPhotometrie.length,
    )
    expect(plan.noteCouvertureCatalogue).toMatch(/faute de taille ou de magnitude/)
  })
})

/**
 * §5.2 — "AUCUN → domaine ciel profond VERROUILLÉ, seul le grand champ reste ouvert".
 * Plan CLOSED, not empty "for lack of target": §5.2 requires saying so, grand champ as alternative.
 * Anonymous dominant constraint ("SUIVI, 14 000 cibles écartées") fails.
 */
describe('§5.2 — plan de séance verrouillé sans suivi', () => {
  const sansSuivi = profilSuivi({ suiviActif: false, typeMonture: 'TRACKER', focaleMm: 120 })
  const ferme = planSession(contexte({ domaineCpFerme: sansSuivi.cause }), CATALOGUE)

  it('ne retient aucune cible là où le suivi en retient', () => {
    // Premise computed: else test passes on a day the catalogue is empty.
    expect(planSession(contexte(), CATALOGUE).etapes.length).toBeGreaterThan(0)
    expect(ferme.etapes).toStrictEqual([])
  })

  it('nomme le suivi et garde le grand champ en alternative', () => {
    expect(ferme.message).toBe(sansSuivi.cause)
    expect(ferme.alternative).toMatch(/grand champ|filé/)
    expect(ferme.contrainteDominante).toBeUndefined()
  })
})
