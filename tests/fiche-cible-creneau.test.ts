/**
 * T-0222 — le créneau photo de la fiche est celui du plan de séance (§8.2).
 *
 * Aucune heure n'est écrite : le test compare la sortie de la fiche à celle de `planSession`
 * sur le même contexte. Une monture GEM est choisie pour que le découpage au méridien — la
 * partie la plus facile à perdre en reconstruisant l'entrée — soit comparé lui aussi.
 */

import { describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masqueDepuisPoints, masquePlat, type PointMasque } from '../src/core/site.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import { planSession, type ContexteSession } from '../src/core/session.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { CAUSE_NUIT_NON_CHIFFREE, nuitFiche } from '../src/ui/fiche-cible-creneau.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const NUIT = fenetreNocturne(SITE, new Date('2026-08-14T12:00:00Z'))

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
  typeMonture: 'GEM',
}

/**
 * Un relief qui monte au maximum du domaine sur tout le tour : il cache n'importe quelle
 * cible, quelle que soit sa culmination. C'est le seul moyen de forcer l'exclusion RELIEF
 * sans écrire d'éphéméride ni supposer le relief d'un lieu réel.
 */
const MASQUE_INTEGRAL: readonly PointMasque[] = Array.from({ length: 360 }, (_, azimutDeg) => ({
  azimutDeg,
  altitudeDeg: DOMAINES.masque_horizon_deg.max,
}))

const NGC7000: ObjetCielProfond = {
  designation: 'NGC7000',
  nomsCommuns: 'Amérique du Nord',
  adDeg: 314.75,
  decDeg: 44.52,
  type: 'EMISSION',
  majAxArcmin: 120,
  minAxArcmin: 100,
  posAngDeg: null,
  vMag: 4,
  bMag: null,
  surfBr: null,
}

describe('nuitFiche — le créneau', () => {
  it('annonce le créneau que le plan de séance retient pour la même cible', () => {
    const etape = planSession(CONTEXTE, [NGC7000]).etapes[0]
    expect(etape).toBeDefined()

    const fiche = nuitFiche(CONTEXTE, NGC7000).creneau
    if (!fiche.chiffre) throw new Error(fiche.cause)
    expect(fiche.creneau.creneaux).toEqual(etape!.creneau.creneaux)
    expect(fiche.creneau.heureCulmination).toEqual(etape!.creneau.heureCulmination)
  })

  it('nomme la cause du moteur quand la cible ne se lève pas', () => {
    const fiche = nuitFiche(CONTEXTE, { ...NGC7000, designation: 'AUSTRALE', decDeg: -80 }).creneau
    if (!fiche.chiffre) throw new Error(fiche.cause)
    expect(fiche.creneau.causeExclusion).toBe('JAMAIS_LEVE')
    expect(fiche.creneau.creneaux).toHaveLength(0)
  })

  /**
   * T-0268 — hors créneau, la fiche porte la cause du moteur au lieu de chiffrer. Elle
   * repliait sur la culmination : une cible dont le méridien passe haut mais que le relief
   * cache toute la nuit gardait une masse d'air valide, donc une intégration complète — un
   * plan de capture affiché deux blocs sous « cachée par le relief ».
   */
  it('porte la cause du moteur au lieu de replier sur la culmination', () => {
    const nuit = nuitFiche(CONTEXTE, { ...NGC7000, designation: 'AUSTRALE', decDeg: -80 })
    expect(nuit.capture.exclusion).not.toBeNull()
    expect(nuit.capture.masseAir.value).toBeNull()
    expect(nuit.capture.plusHaut).toBeNull()
    expect(nuit.capture.dureeCreneauS).toBeNull()
  })

  /**
   * Le cas que la culmination masquait : le relief exclut la cible alors qu'elle passe TRÈS
   * haut. `masseAirMin` restait une valeur valide, et la fiche chiffrait une intégration là
   * où la liste et le plan écartaient la cible. Un masque intégral force ce cas sans écrire
   * la moindre éphéméride.
   */
  it('n’en chiffre pas davantage quand le relief cache une cible qui culmine haut', () => {
    const contexte: ContexteSession = { ...CONTEXTE, masque: masqueDepuisPoints(MASQUE_INTEGRAL) }
    const circumpolaire: ObjetCielProfond = { ...NGC7000, designation: 'HAUTE', decDeg: 85 }

    expect(planSession(contexte, [circumpolaire]).etapes).toHaveLength(0)

    const nuit = nuitFiche(contexte, circumpolaire)
    const creneau = nuit.creneau.chiffre ? nuit.creneau.creneau : null
    expect(creneau?.causeExclusion).toBe('RELIEF')
    // La culmination reste chiffrable : c'est exactement ce qui rendait le repli invisible.
    expect(creneau?.altCulminationDeg.value).toBeGreaterThan(0)
    expect(nuit.capture.exclusion).toBe(creneau?.message)
    expect(nuit.capture.masseAir.value).toBeNull()
  })

  it('ne chiffre rien sans contexte de nuit', () => {
    expect(nuitFiche(null, NGC7000).creneau).toEqual({
      chiffre: false,
      cause: CAUSE_NUIT_NON_CHIFFREE,
    })
  })
})
