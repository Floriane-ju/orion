/**
 * T-0382 — la Lune décide de la possibilité ET de la facilité (§6.3, §8.1, §8.3).
 *
 * Ce que ce fichier interdit de régresser : une galaxie notée « idéale » sous une pleine Lune
 * levée toute la nuit. §8.1 : « FENÊTRE UTILE = nuit_noire ∩ (Lune sous l'horizon OU tolérance
 * du type d'objet) » — une tolérance FAIBLE ne se photographie que Lune couchée, dès que la
 * Lune gêne vraiment.
 *
 * Aucune éphéméride écrite : les nuits de pleine et de nouvelle Lune sont CHERCHÉES à
 * l'exécution, et les seuils viennent du registre.
 */

import { describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { etatLune, fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import { prepareEvaluation } from '../src/core/cibles-liste.ts'
import { evalueCandidate } from '../src/core/session-candidates.ts'
import { scoreLune } from '../src/core/session-score.ts'
import { faciliteCible } from '../src/core/facilite.ts'
import { causesCarte } from '../src/ui/CibleImpossible.tsx'
import { prochaineNuitSansLune } from '../src/core/cible-ecartee.ts'
import { nuitFiche } from '../src/ui/fiche-cible-creneau.ts'
import type { ContexteSession } from '../src/core/session-types.ts'
import { profilOptique } from '../src/core/optics.ts'
import {
  BOITIER_REFERENCE,
  capteurEffectif,
  isoRecommande,
  pointZeroSysteme,
} from '../src/data/equipment.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { PRESET_SNR_DEFAUT } from '../src/registry/verdicts.ts'
import { K } from '../src/registry/constants.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const CAPTEUR = capteurEffectif(BOITIER_REFERENCE, 'FULL_FRAME')
const OPTIQUE = profilOptique({ focaleMm: 120, ouvertureN: 2.8, ...CAPTEUR })
const ZERO = pointZeroSysteme(BOITIER_REFERENCE)
const ISO = isoRecommande(BOITIER_REFERENCE)

/** M31 telle que le catalogue la décrit : grande, haute en automne depuis le site de référence. */
const GALAXIE: ObjetCielProfond = {
  designation: 'NGC224',
  nomsCommuns: 'Andromède',
  adDeg: 10.68,
  decDeg: 41.27,
  type: 'GALAXIE',
  majAxArcmin: 190,
  minAxArcmin: 60,
  posAngDeg: null,
  vMag: 3.4,
  bMag: null,
  surfBr: null,
}

/** La même géométrie, tolérance FORTE : seule la tolérance diffère. */
const EMISSION: ObjetCielProfond = { ...GALAXIE, designation: 'EMISSION_TEST', type: 'EMISSION' }

function contexte(jour: Date): ContexteSession {
  const nuit = fenetreNocturne(SITE, jour)
  return {
    site: SITE,
    nuit,
    fenetreUtile: fenetreUtile(SITE, nuit),
    masque: masquePlat(),
    fovHDeg: OPTIQUE.fovHDeg.value,
    echApx: OPTIQUE.echApx.value,
    dMm: OPTIQUE.dMm.value,
    capteurHMm: CAPTEUR.capteurHMm,
    pitchUm: CAPTEUR.pitchUm,
    ouvertureN: 2.8,
    zpSys: ZERO.valeur,
    zpEstime: ZERO.estime,
    readNoiseE: ISO.readNoiseE,
    tailleRawMo: BOITIER_REFERENCE.tailleRawMo,
    isoSession: ISO.iso,
    sbCielNoir: 20.95,
    mLimOeil: 6.05,
    tMaxS: 200,
    domaineCpFerme: null,
    snrCible: PRESET_SNR_DEFAUT,
    typeMonture: 'TRACKER',
  }
}

function evalue(c: ContexteSession, objet: ObjetCielProfond) {
  const entree = prepareEvaluation(c)
  if (entree === null) throw new Error('Nuit non chiffrable au site de référence en automne.')
  return evalueCandidate(c, objet, entree.fenetre, entree.sbCielBase, entree.poids)
}

const MS_JOUR = 86_400_000

/** Les nuits de septembre à décembre 2026, classées par ce que la Lune y fait. */
function nuits() {
  const pleines: ContexteSession[] = []
  const partielles: ContexteSession[] = []
  const noires: ContexteSession[] = []
  const depart = Date.UTC(2026, 8, 1, 12)
  for (let i = 0; i < 120; i += 1) {
    const c = contexte(new Date(depart + i * MS_JOUR))
    const milieu = c.nuit.debutReference
    if (milieu === null) continue
    const illumination = etatLune(SITE, milieu).illumination
    const fu = c.fenetreUtile
    if (fu.debut === null && illumination > 0.9) pleines.push(c)
    else if (fu.debut !== null && fu.luneInterfere && illumination > 0.6) partielles.push(c)
    else if (!fu.luneInterfere) noires.push(c)
  }
  return { pleines, partielles, noires }
}

const { pleines, partielles, noires } = nuits()

describe('T-0382 — une galaxie ne se photographie pas sous une Lune gênante', () => {
  it('trouve les trois sortes de nuit sur l’automne', () => {
    expect(pleines.length).toBeGreaterThan(0)
    expect(partielles.length).toBeGreaterThan(0)
    expect(noires.length).toBeGreaterThan(0)
  })

  it('pleine Lune levée toute la nuit : écartée pour la Lune, facilité 0', () => {
    for (const c of pleines) {
      const r = evalue(c, GALAXIE)
      expect('code' in r && r.code).toBe('LUNE')
      expect(faciliteCible(r)?.note).toBe(0)
    }
  })

  it('la carte dit la cause du moteur sous « Photographie impossible »', () => {
    const c = pleines[0]!
    const r = evalue(c, GALAXIE)
    if (!('code' in r)) throw new Error('attendue écartée')
    const { phrases } = causesCarte(c, GALAXIE, {
      note: 0,
      libelle: '',
      code: r.code,
      cause: r.cause,
      pose: null,
    })
    expect(phrases).toEqual([r.cause])
  })

  it('la fiche porte la même exclusion que la liste', () => {
    const c = pleines[0]!
    const r = evalue(c, GALAXIE)
    if (!('code' in r)) throw new Error('attendue écartée')
    expect(nuitFiche(c, GALAXIE).capture.exclusion).toBe(r.cause)
  })

  it('Lune qui se couche ou se lève en cours de nuit : le créneau tient dans la fenêtre utile dès que la Lune gêne', () => {
    let retenues = 0
    for (const c of partielles) {
      const r = evalue(c, GALAXIE)
      if ('code' in r) {
        expect(r.code).toBe('LUNE')
        continue
      }
      const { debut, fin } = c.fenetreUtile
      const dansLaFenetreUtile = r.creneau.creneaux.every(
        (sc) => sc.debut.getTime() >= debut!.getTime() && sc.fin.getTime() <= fin!.getTime(),
      )
      // Hors de la fenêtre utile, la Lune ne peut être que sous le seuil de gêne.
      if (!dansLaFenetreUtile) {
        expect(r.deltaSbLuneMag.value).toBeLessThanOrEqual(K('SEUIL_GENE_LUNE_DELTA_SB_MAG'))
      } else retenues += 1
    }
    expect(retenues).toBeGreaterThan(0)
  })

  it('nuit sans Lune : la galaxie est retenue', () => {
    for (const c of noires) expect('objet' in evalue(c, GALAXIE)).toBe(true)
  })

  it('tolérance FORTE : jamais écartée pour la Lune, même pleine', () => {
    for (const c of pleines) {
      const r = evalue(c, EMISSION)
      expect('code' in r ? r.code : null).not.toBe('LUNE')
    }
  })
})

describe('T-0382 — S_lune dépend de la tolérance du type (§8.3)', () => {
  it('la même gêne coûte plus à une tolérance plus faible', () => {
    expect(scoreLune(0.8, 'FAIBLE')).toBeLessThan(scoreLune(0.8, 'MOYENNE'))
    expect(scoreLune(0.8, 'MOYENNE')).toBeLessThan(scoreLune(0.8, 'FORTE'))
  })

  it('sans gêne, le score est plein quelle que soit la tolérance', () => {
    for (const t of ['FAIBLE', 'MOYENNE', 'FORTE'] as const) expect(scoreLune(0, t)).toBe(1)
  })
})

describe('T-0382 — une cible écartée par la Lune propose sa prochaine nuit sans Lune', () => {
  /**
   * La nuit qui CONTIENT l'instant rendu : 18 h avant tombe avant le coucher du Soleil de cette
   * nuit-là (fin du crépuscule au plus tôt) et après le lever de la précédente, en automne.
   */
  const MS_DIX_HUIT_HEURES = 18 * 3_600_000

  it('rend une nuit, après celle du contexte, où la galaxie est retenue', () => {
    const c = pleines[0]!
    const instant = prochaineNuitSansLune(c, GALAXIE)
    expect(instant).not.toBeNull()
    expect(instant!.getTime()).toBeGreaterThan(c.nuit.finReference!.getTime())
    const r = evalue(contexte(new Date(instant!.getTime() - MS_DIX_HUIT_HEURES)), GALAXIE)
    expect('objet' in r).toBe(true)
  })
})
