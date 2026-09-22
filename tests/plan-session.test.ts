/**
 * §8.3 — Plan de session ordonné, et §11.2 — export texte imprimable.
 *
 * Ce qui est vérifié ici tient en une phrase : la sortie est une CHRONOLOGIE, pas un
 * palmarès. Et tout ce qui est écarté l'est avec sa cause, à part, sans jamais remplir le
 * plan avec des cibles refusées.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/night.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import {
  AUCUNE_CIBLE_CHOISIE,
  planSession,
  poidsParDefaut,
  type ContexteSession,
} from '../src/core/session.ts'
import { planEnTexte } from '../src/core/plan-texte.ts'
import { profilSuivi } from '../src/core/tracking.ts'
import { etatsCibles, photographiable } from '../src/core/cibles-liste.ts'
import { decodeObjets, type ObjetCielProfond } from '../src/data/deepsky.ts'
import { K } from '../src/registry/constants.ts'
import { LIBELLE_CAUSE_ECART, LIBELLE_LOT_CALIBRATION } from '../src/registry/libelles.ts'

const SITE_REFERENCE = { latitudeDeg: 46.391, longitudeDeg: 6.697, altitudeM: 500 }
const NUIT = fenetreNocturne(SITE_REFERENCE, new Date('2026-08-14T12:00:00Z'))

/** Setup ciel profond de l'Annexe A : 120 mm f/2,8 sur plein format. */
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

function objet(surcharge: Partial<ObjetCielProfond>): ObjetCielProfond {
  return {
    designation: 'TEST',
    nomsCommuns: '',
    adDeg: 315,
    decDeg: 40,
    type: 'EMISSION',
    majAxArcmin: 280,
    minAxArcmin: 220,
    posAngDeg: null,
    vMag: 5,
    bMag: null,
    surfBr: null,
    ...surcharge,
  }
}

/**
 * Trois cibles cadrables par ce setup, une trop petite pour lui, une qui déborde du champ.
 * Les dimensions et magnitudes sont celles des objets réels : M31 y retrouve la brillance
 * de surface de 22,17 mag/arcsec² de l'Annexe A.
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
    // Le setup de l'Annexe A tient sous le seuil : aucun rappel n'est servi par défaut.
    expect(plan.budget.captureMin).toBeLessThanOrEqual(K('DUREE_RAPPEL_BATTERIE_MIN'))
    expect(plan.avertissementBatterie).toBeUndefined()

    // Une cible exigeante allonge la capture : le rappel apparaît, sans chiffrer d'autonomie.
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
 * §8.3 — l'entrée du moteur est la SÉLECTION de l'utilisateur (§6.4), jamais le catalogue.
 *
 * Rien n'est recopié ici : ce que le plan retient se compare à ce que le moteur rend sur la
 * même sélection, et ce qu'il écarte doit porter une cause venue du moteur.
 */
describe('le plan n’ordonne que les cibles choisies §8.3', () => {
  const cibleDe = (designation: string): ObjetCielProfond =>
    CATALOGUE.find((o) => o.designation === designation)!

  it('dit le geste qui manque quand rien n’est choisi, sans accuser le ciel', () => {
    const vide = planSession(contexte(), [])
    expect(vide.etapes).toStrictEqual([])
    expect(vide.message).toBe(AUCUNE_CIBLE_CHOISIE)
    // Le grand champ répond à « aucune cible compatible », pas à « vous n'avez rien coché ».
    expect(vide.alternative).toBeUndefined()
    expect(vide.contrainteDominante).toBeUndefined()
    expect(vide.ciblesEcartees).toStrictEqual([])
  })

  it('ne retient que les cibles reçues, et les rend dans l’ordre du temps', () => {
    const choisies = [cibleDe('M31'), cibleDe('NGC7000')]
    const plan = planSession(contexte(), choisies)

    // La prémisse se calcule : un plan vide ferait passer les deux assertions suivantes.
    expect(plan.etapes.length).toBeGreaterThan(0)
    const designations = plan.etapes.map((e) => e.objet.designation)
    expect(designations.every((d) => choisies.some((o) => o.designation === d))).toBe(true)

    const debuts = plan.etapes.map((e) => e.creneauAlloue.debut.getTime())
    expect(debuts).toStrictEqual([...debuts].sort((a, b) => a - b))
  })

  it('ignore une cible du catalogue qui n’a pas été choisie', () => {
    const seule = planSession(contexte(), [cibleDe('M31')])
    const complet = planSession(contexte(), CATALOGUE)
    // La prémisse : le catalogue entier en planifie davantage, sinon rien n'est démontré.
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
    // Le défaut corrigé par T-0322 : la liste annonçait « photographiable, 2 nuits », le plan
    // répondait « non retenue, la moins bien notée est retirée ». Deux verdicts pour une même
    // cible. Le critère est celui de la liste — `photographiable`, sur l'état du moteur — et
    // le plan n'a plus le droit d'en défaire aucune.
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
    // Le pointage seul — dix minutes par cible — fait déborder n'importe quelle nuit dès
    // qu'on en choisit beaucoup. C'est la situation qui retirait des cibles une à une.
    const etats = etatsCibles(contexte(), CATALOGUE)
    const photographiables = CATALOGUE.filter((o) => photographiable(etats.get(o.designation)))
    const beaucoup = Array.from({ length: 20 }, (_, i) =>
      photographiables.map((o) => ({ ...o, designation: `${o.designation}-${i}` })),
    ).flat()

    const plan = planSession(contexte(), beaucoup)
    // La prémisse : sans dépassement, ce test ne démontre rien. Dix minutes de pointage par
    // cible suffisent à faire déborder n'importe quelle nuit.
    expect(plan.budget.tient).toBe(false)
    // Et pourtant aucune n'est retirée : le partage donne sa part à chacune, et le
    // dépassement se lit sur le budget.
    expect(plan.etapes).toHaveLength(beaucoup.length)
    expect(plan.ciblesEcartees).toStrictEqual([])
  })

  it('ne laisse pas une cible de plusieurs nuits affamer une cible courte', () => {
    // T-0322 — `alloueCreneau` borne à ce que la cible RÉCLAME, et une cible de plusieurs
    // nuits en réclame plus que la nuit entière : servie en premier, elle prenait tout son
    // créneau et sa voisine ressortait « non retenue ». Mêmes coordonnées ici, donc même
    // créneau : sans la règle « ce qui se termine ce soir passe d'abord », l'une des deux
    // n'a plus une minute.
    const gourmande = objet({ designation: 'GOURMANDE', vMag: 3.8, decDeg: 46 })
    const rapide = objet({
      designation: 'RAPIDE',
      vMag: 1.5,
      decDeg: 15,
      majAxArcmin: 110,
      minAxArcmin: 90,
    })

    const etats = etatsCibles(contexte(), [gourmande, rapide])
    // La prémisse : les deux sont photographiables, et l'une déborde de la nuit.
    expect(photographiable(etats.get('GOURMANDE'))).toBe(true)
    expect(photographiable(etats.get('RAPIDE'))).toBe(true)
    expect(etats.get('GOURMANDE')!.pose!.nNuits).toBeGreaterThan(1)
    expect(etats.get('RAPIDE')!.pose!.nNuits).toBe(1)

    const plan = planSession(contexte(), [gourmande, rapide])
    // Seconde prémisse : c'est bien la gourmande qui gagnerait l'arbitrage par score. Sans
    // elle, le test passerait pour la mauvaise raison — la courte servie d'abord par hasard.
    const score = (d: string) => plan.etapes.find((e) => e.objet.designation === d)!.score.value
    expect(score('GOURMANDE')).toBeGreaterThan(score('RAPIDE'))
    expect(plan.etapes.map((e) => e.objet.designation).sort()).toStrictEqual([
      'GOURMANDE',
      'RAPIDE',
    ])
    // Et la courte est SERVIE, pas juste présente : son intégration tient ce soir.
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
    // L'ancien plafond de candidates coupait la sélection par magnitude, sans cause. Une
    // sélection plus large que lui doit se retrouver ENTIÈRE : au plan, ou dans les écartées.
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
    // T-0267 — le titre nomme la nuit par ses deux dates, pas par le seul jour du soir.
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
    // Aucune ligne « libellé : nombre » sans unité derrière le nombre.
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
    // Le pré-filtrage dur borne le coût : le calcul d'éphéméride ne porte que sur les
    // candidates retenues, pas sur le catalogue entier.
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
 * T-0079 puis T-0266 — ce que le grand champ tient vraiment, mesuré sur le CATALOGUE RÉEL.
 *
 * L'épique exigeait qu'un plan cite une cible Sharpless ou Barnard. Ce critère ne passait que
 * par la classe d'opacité de Barnard lue comme une magnitude : T-0266 l'a retirée, et la
 * promesse est tombée avec. Les 344 objets Barnard ne portent aucune photométrie — une
 * nébuleuse obscure absorbe, elle n'émet pas — et les Sharpless qui en portent une plafonnent
 * sous la borne basse de remplissage du profil grand champ. Les deux ensembles sont disjoints.
 *
 * Ce qui se vérifie ici n'est donc plus la promesse, c'est l'honnêteté : le complément est
 * écarté pour la raison vraie, nommée, au lieu de disparaître en silence ou de remonter sur
 * une magnitude inventée. Faire repasser l'ancien critère demanderait de réintroduire le flux
 * que §6.3 interdit.
 */
describe('grand champ bout en bout §6.1 (T-0079, T-0266)', () => {
  /** Sharpless et Barnard — le complément que ni NGC ni IC ne portent. */
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

    // Sans magnitude intégrée, aucune brillance de surface n'est calculable, donc aucun
    // verdict : le complément ne peut pas entrer dans le plan. L'y faire remonter demanderait
    // un flux que ni OpenNGC ni le catalogue DSO ne publient.
    const planifiees = plan.etapes.filter((e) => EST_COMPLEMENT.test(e.objet.designation))
    expect(planifiees.map((e) => e.objet.designation).join(', ')).toBe('')

    // Il n'est pas perdu en silence pour autant. Le pré-filtrage compte les cibles sans donnée
    // plutôt que de les lister une par une (elles sont des milliers), et la note de couverture
    // porte ce décompte jusqu'à l'écran : le seuil se dérive du paquet, jamais d'un nombre écrit.
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
 * §5.2 — « AUCUN → domaine ciel profond VERROUILLÉ, seul le grand champ reste ouvert ».
 *
 * Le plan n'est alors pas vide « faute de cible » : il est FERMÉ, et le critère d'acceptation
 * de §5.2 exige qu'il le dise avec le grand champ en alternative. Une contrainte dominante
 * anonyme — « SUIVI, 14 000 cibles écartées » — ne remplit pas ce contrat.
 */
describe('§5.2 — plan de séance verrouillé sans suivi', () => {
  const sansSuivi = profilSuivi({ suiviActif: false, typeMonture: 'TRACKER', focaleMm: 120 })
  const ferme = planSession(contexte({ domaineCpFerme: sansSuivi.cause }), CATALOGUE)

  it('ne retient aucune cible là où le suivi en retient', () => {
    // La prémisse se calcule : sans elle, le test passerait un jour où le catalogue est vide.
    expect(planSession(contexte(), CATALOGUE).etapes.length).toBeGreaterThan(0)
    expect(ferme.etapes).toStrictEqual([])
  })

  it('nomme le suivi et garde le grand champ en alternative', () => {
    expect(ferme.message).toBe(sansSuivi.cause)
    expect(ferme.alternative).toMatch(/grand champ|filé/)
    expect(ferme.contrainteDominante).toBeUndefined()
  })
})
