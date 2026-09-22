/**
 * §6.4 — la pose annoncée par la liste du catalogue est celle du plan de séance.
 *
 * C'est le seul point qui compte ici, et c'est une anti-régression : deux écrans qui dosent
 * la même cible avec deux conventions d'extinction annoncent deux poses différentes pour la
 * même nuit. T-0089 a corrigé ce désaccord une fois entre la fiche et le plan ; réemployer
 * `evalueCandidate` est ce qui empêche la liste de le réintroduire.
 *
 * Aucun temps n'est écrit en dur : le test compare deux sorties de moteur.
 *
 * Depuis T-0161, `etatsCibles` porte aussi la NOTE de facilité (§6.4), et les cibles écartées
 * entrent dans la map avec la note 0 au lieu d'en être absentes. « Aucune pose » se lit donc
 * `pose === null`, jamais `has() === false` : l'absence d'entrée veut dire « pas évaluée ».
 */

import { describe, expect, it } from 'vitest'
import { etatsCibles } from '../src/core/cibles-liste.ts'
import { preFiltre } from '../src/core/session-candidates.ts'
import { detectabilite } from '../src/core/detectability.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import { fenetreNocturne } from '../src/core/night.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import { planSession, type ContexteSession } from '../src/core/session.ts'
import { profilSuivi } from '../src/core/tracking.ts'
import { K } from '../src/registry/constants.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'

const SITE = { latitudeDeg: 46.391, longitudeDeg: 6.697, altitudeM: 500 }
const NUIT = fenetreNocturne(SITE, new Date('2026-08-14T12:00:00Z'))

/** Setup ciel profond de l'Annexe A : 120 mm f/2,8 sur plein format. */
const CONTEXTE: ContexteSession = {
  site: SITE,
  nuit: NUIT,
  fenetreUtile: fenetreUtile(SITE, NUIT),
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
}

function objet(surcharge: Partial<ObjetCielProfond>): ObjetCielProfond {
  return {
    designation: 'TEST',
    nomsCommuns: '',
    adDeg: 314.75,
    decDeg: 44.52,
    type: 'EMISSION',
    majAxArcmin: 120,
    minAxArcmin: 100,
    posAngDeg: null,
    vMag: 4,
    bMag: null,
    surfBr: null,
    ...surcharge,
  }
}

const CATALOGUE: readonly ObjetCielProfond[] = [
  objet({ designation: 'NGC7000', nomsCommuns: 'Amérique du Nord' }),
  objet({ designation: 'M31', adDeg: 10.68, decDeg: 41.27, type: 'GALAXIE', majAxArcmin: 190, minAxArcmin: 60, vMag: 3.4 }),
  objet({ designation: 'M27', adDeg: 299.9, decDeg: 22.72, type: 'NEB_PLANETAIRE', majAxArcmin: 8, minAxArcmin: 6, vMag: 7.4 }),
  // Déclinaison australe extrême : jamais levée depuis 46° N, donc jamais photographiable.
  objet({ designation: 'INVISIBLE', adDeg: 100, decDeg: -80, vMag: 5 }),
]

/**
 * §12.5 — un moteur qui refuse une entrée hors domaine ne fait pas tomber l'écran.
 *
 * Le cas réel : une optique de 300 mm rétrécit la fenêtre de cadrage, donc laisse entrer au
 * calcul des objets étendus et très faibles dont la brillance de surface dépasse les
 * 26 mag/as² du domaine de §7.1. `fluxObjet` refuse — c'est son rôle — et la liste doit
 * écarter la cible avec sa cause, comme le plan de séance le fait depuis toujours.
 */
describe('etatsCibles — un refus de domaine écarte la cible, il ne casse pas l’écran', () => {
  // 300 mm sur le même plein format : la fenêtre de cadrage descend, et des objets que le
  // grand champ écartait sur leur taille arrivent jusqu'aux moteurs de flux.
  const LONGUE_FOCALE: ContexteSession = { ...CONTEXTE, fovHDeg: 4.56, echApx: 3.5 }

  /** Étendue et très faible : sa brillance de surface sort du domaine par construction. */
  const DIFFUSE = objet({
    designation: 'DIFFUSE_HORS_DOMAINE',
    adDeg: 314.75,
    decDeg: 44.52,
    type: 'NEB_OBSCURE',
    majAxArcmin: 100,
    minAxArcmin: 100,
    vMag: 14,
  })

  it('forge bien une cible hors du domaine de brillance de surface', () => {
    // La prémisse du test se calcule, elle ne se recopie pas : sans elle, le test passerait
    // encore le jour où la cible cesserait d'être hors domaine.
    const sbObj = detectabilite({
      mInt: DIFFUSE.vMag,
      aArcmin: DIFFUSE.majAxArcmin,
      bArcmin: DIFFUSE.minAxArcmin,
      typeObjet: DIFFUSE.type,
      sbCiel: LONGUE_FOCALE.sbCielNoir,
      mLimOeil: LONGUE_FOCALE.mLimOeil,
      dMm: LONGUE_FOCALE.dMm,
    }).sbObj.value

    expect(sbObj).not.toBeNull()
    expect(sbObj!).toBeGreaterThan(DOMAINES.sb_obj.max)
  })

  it('n’annonce aucune pose pour elle, sans lever d’erreur', () => {
    expect(() => etatsCibles(LONGUE_FOCALE, [...CATALOGUE, DIFFUSE])).not.toThrow()
    expect(etatsCibles(LONGUE_FOCALE, [...CATALOGUE, DIFFUSE]).get(DIFFUSE.designation)?.pose)
      .toBeNull()
  })

  it('lui donne la note 0 et sa cause, pas un tiret muet', () => {
    const etat = etatsCibles(LONGUE_FOCALE, [...CATALOGUE, DIFFUSE]).get(DIFFUSE.designation)
    expect(etat).toBeDefined()
    expect(etat!.note).toBe(0)
    expect(etat!.cause).not.toBeNull()
  })

  it('ne prive pas les autres cibles de leur pose : le refus est individuel', () => {
    const etats = etatsCibles(LONGUE_FOCALE, [...CATALOGUE, DIFFUSE])
    expect([...etats.values()].filter((e) => e.pose !== null).length).toBeGreaterThan(0)
  })

  it('la range parmi les écartées du plan, avec sa cause', () => {
    const plan = planSession(LONGUE_FOCALE, [...CATALOGUE, DIFFUSE])
    const ecartee = plan.ciblesEcartees.find((c) => c.designation === DIFFUSE.designation)
    expect(ecartee).toBeDefined()
    expect(ecartee!.cause).toMatch(/brillance de surface/)
  })
})

describe('etatsCibles — la liste et le plan annoncent la même pose', () => {
  const POSES = etatsCibles(CONTEXTE, CATALOGUE)
  const PLAN = planSession(CONTEXTE, CATALOGUE)

  it('rend une pose pour chaque cible que le plan a retenue', () => {
    expect(PLAN.etapes.length).toBeGreaterThan(0)
    for (const etape of PLAN.etapes) {
      expect(POSES.has(etape.objet.designation), etape.objet.designation).toBe(true)
    }
  })

  it('annonce exactement l’intégration requise de l’étape du plan', () => {
    for (const etape of PLAN.etapes) {
      const pose = POSES.get(etape.objet.designation)!.pose!
      expect(pose.tRequisS, etape.objet.designation).toBeCloseTo(
        etape.integration.tRequisS.value,
        9,
      )
      expect(pose.nPoses).toBe(etape.integration.nPoses.value)
      expect(pose.dureeCreneauMin).toBeCloseTo(etape.creneau.dureeTotaleMin.value, 9)
    }
  })

  it('n’annonce aucune pose pour une cible qui ne se lève jamais depuis ce site', () => {
    // Elle est bien DANS la map — écartée, notée 0 — mais sans pose : le pré-filtrage l'a
    // refusée sur sa culmination, ce qui est un verdict et pas une absence de réponse.
    expect(POSES.get('INVISIBLE')?.pose ?? null).toBeNull()
  })

  it('n’évalue jamais plus de cibles que son propre plafond, celui de §6.4', () => {
    expect(POSES.size).toBeLessThanOrEqual(K('CIBLES_EVALUEES_MAX'))
  })

  it('ne rend rien quand la nuit n’a pas de fenêtre de référence', () => {
    const sansNuit: ContexteSession = {
      ...CONTEXTE,
      nuit: { ...NUIT, debutReference: null, finReference: null },
    }
    expect(etatsCibles(sansNuit, CATALOGUE).size).toBe(0)
  })
})

/**
 * §6.4 — la note de facilité, et sa COUVERTURE.
 *
 * Aucune note n'est recopiée : le test vérifie les invariants de l'échelle et le fait que
 * chaque cible refusée au pré-filtrage reçoive quand même sa note. C'est cette couverture qui
 * a manqué : sur un 120 mm plein format, onze objets du catalogue seulement vont jusqu'au
 * calcul de créneau — noter ces onze seuls laissait la liste presque vide de notes pendant que
 * la carte Cible en affichait une pour tout ce qu'on clique.
 */
describe('etatsCibles — la note de facilité', () => {
  const ETATS = etatsCibles(CONTEXTE, CATALOGUE)

  it('reste dans l’échelle du registre', () => {
    expect(ETATS.size).toBeGreaterThan(0)
    for (const [designation, etat] of ETATS) {
      expect(etat.note, designation).toBeGreaterThanOrEqual(0)
      expect(etat.note, designation).toBeLessThanOrEqual(K('FACILITE_NOTE_MAX'))
      expect(Number.isInteger(etat.note), designation).toBe(true)
      expect(etat.libelle, designation).not.toBe('')
    }
  })

  it('lie la note à la pose : une cible évaluée n’est jamais 0, une écartée n’est jamais notée', () => {
    for (const [designation, etat] of ETATS) {
      if (etat.pose === null) {
        expect(etat.note, designation).toBe(0)
        expect(etat.cause, designation).not.toBeNull()
      } else {
        expect(etat.note, designation).toBeGreaterThanOrEqual(1)
        expect(etat.cause, designation).toBeNull()
      }
    }
  })

  it('note TOUTE cible refusée au pré-filtrage, et pas seulement les candidates', () => {
    // La borne d'écartées du pré-filtrage est celle du catalogue entier : nommer un refus ne
    // coûte qu'une chaîne, alors que retenir une candidate coûte une éphéméride.
    const { candidates, ecartees } = preFiltre(CONTEXTE, CATALOGUE, CATALOGUE.length, CATALOGUE.length)
    expect(ecartees.length).toBeGreaterThan(0)

    for (const ecartee of ecartees) {
      if (ecartee.code === 'DONNEE_MANQUANTE') continue
      const etat = ETATS.get(ecartee.designation)
      expect(etat, ecartee.designation).toBeDefined()
      expect(etat!.note, ecartee.designation).toBe(0)
      expect(etat!.cause, ecartee.designation).toBe(ecartee.cause)
    }

    // La couverture dépasse donc les candidates : c'est tout l'objet du correctif.
    expect(ETATS.size).toBeGreaterThan(candidates.length)
  })

  it('ne note aucune cible dont le catalogue ne donne ni magnitude ni dimensions', () => {
    // Non documenté n'est pas difficile : ces cibles n'ont pas de note, ni ici ni sur la carte.
    for (const objet of CATALOGUE) {
      if (objet.majAxArcmin !== null && objet.vMag !== null) continue
      expect(ETATS.has(objet.designation), objet.designation).toBe(false)
    }
  })

  it('ne note rien quand la nuit n’a pas de fenêtre de référence', () => {
    const sansNuit: ContexteSession = {
      ...CONTEXTE,
      nuit: { ...NUIT, debutReference: null, finReference: null },
    }
    expect(etatsCibles(sansNuit, CATALOGUE).size).toBe(0)
  })
})

/**
 * §5.2 — sans suivi, le domaine ciel profond est VERROUILLÉ, pas seulement plafonné.
 *
 * L'ancien comportement ne fermait rien : `tMaxS` retombait sur la NPF, donc la pose unitaire
 * tenait en secondes, et les cibles brillantes restaient sous le plafond d'intégration de §7.3.
 * La liste les annonçait « photographiables » — en milliers de poses de deux secondes sur un
 * trépied fixe, ce qu'aucune séance ne peut exécuter.
 *
 * Le verrou se lit sur `pose === null` partout, et sur une cause qui vient de `profilSuivi` :
 * la phrase n'est pas réécrite ici, sinon deux écrans diraient deux choses.
 */
describe('§5.2 — sans suivi, aucune cible ciel profond n’est photographiable', () => {
  const sansSuivi = profilSuivi({ suiviActif: false, typeMonture: 'TRACKER', focaleMm: 120 })
  const etats = etatsCibles({ ...CONTEXTE, domaineCpFerme: sansSuivi.cause }, CATALOGUE)

  it('ferme bien le domaine dans le profil de suivi', () => {
    expect(sansSuivi.domaineCpOuvert).toBe(false)
    expect(sansSuivi.cause).not.toBeNull()
  })

  it('n’annonce aucune pose, et donne au suivi la cause de chaque refus', () => {
    // La prémisse : le MÊME catalogue produit des poses dès que le suivi est actif.
    const avecSuivi = etatsCibles(CONTEXTE, CATALOGUE)
    expect([...avecSuivi.values()].some((e) => e.pose !== null)).toBe(true)

    for (const objet of CATALOGUE) {
      const etat = etats.get(objet.designation)
      expect(etat?.pose ?? null).toBeNull()
      expect(etat?.cause).toBe(sansSuivi.cause)
    }
  })

  it('verrouille aussi la monture altazimutale, dont la rotation de champ n’est pas traitée', () => {
    const altaz = profilSuivi({ suiviActif: true, typeMonture: 'ALTAZ', focaleMm: 120 })
    const fermes = etatsCibles({ ...CONTEXTE, domaineCpFerme: altaz.cause }, CATALOGUE)
    expect(altaz.domaineCpOuvert).toBe(false)
    expect([...fermes.values()].every((e) => e.pose === null)).toBe(true)
  })
})
