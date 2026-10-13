/**
 * T-0407 — sous un zoom, chaque cible est évaluée à sa focale optimale, et la liste et le plan
 * l'évaluent à la MÊME : sinon la liste dirait photographiable ce que le plan écarte.
 *
 * Aucune pose n'est écrite en dur : le test compare des sorties de moteur entre elles. Le
 * contexte à une focale est reconstruit par `profilOptique`, comme la chaîne le fait.
 */

import { describe, expect, it } from 'vitest'
import { etatsCibles, lignesInvariantes } from '../src/core/cibles-liste.ts'
import { K } from '../src/registry/constants.ts'
import { ARCMIN_PAR_DEG } from '../src/core/unites.ts'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import { focaleOptimale, type Objectif } from '../src/core/objectif.ts'
import { profilOptique } from '../src/core/optics.ts'
import { planSession, type ContexteSession } from '../src/core/session.ts'
import type { ContexteDe } from '../src/core/session-types.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const NUIT = fenetreNocturne(SITE, new Date('2026-08-14T12:00:00Z'))
const CAPTEUR = { capteurLMm: 35.9, capteurHMm: 23.9, pitchUm: 5.12 }
const OUVERTURE_N = 5.6

const ZOOM: Objectif = {
  id: 'zoom',
  nom: '100-400',
  focaleMinMm: 100,
  focaleMaxMm: 400,
  ouvertureGrandAngleN: OUVERTURE_N,
  ouvertureTeleN: OUVERTURE_N,
  typeObjectif: 'RECTILINEAIRE',
}

function contexteA(focaleMm: number): ContexteSession {
  const optique = profilOptique({ focaleMm, ouvertureN: OUVERTURE_N, ...CAPTEUR })
  return {
    site: SITE,
    nuit: NUIT,
    fenetreUtile: fenetreUtile(SITE, NUIT),
    masque: masquePlat(),
    focaleMm,
    fovHDeg: optique.fovHDeg.value,
    echApx: optique.echApx.value,
    dMm: optique.dMm.value,
    capteurHMm: CAPTEUR.capteurHMm,
    pitchUm: CAPTEUR.pitchUm,
    ouvertureN: OUVERTURE_N,
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
}

/** Le contexte de base : le zoom réglé à son grand-angle. */
const BASE = contexteA(ZOOM.focaleMinMm)

/** Mémoïsé par focale, comme la chaîne : des cibles à la même focale partagent leur contexte. */
function resolveur(): ContexteDe {
  const parFocale = new Map<number, ContexteSession>()
  return (objet) => {
    if (objet.majAxArcmin === null) return BASE
    const f = focaleOptimale(ZOOM, objet.majAxArcmin, CAPTEUR.capteurHMm)
    const deja = parFocale.get(f)
    if (deja !== undefined) return deja
    const c = contexteA(f)
    parFocale.set(f, c)
    return c
  }
}

/** Petite au grand-angle, cadrable au télé : elle n'existe que par la plage du zoom. */
const PETITE: ObjetCielProfond = {
  designation: 'PETITE',
  nomsCommuns: '',
  adDeg: 314.75,
  decDeg: 44.52,
  type: 'EMISSION',
  majAxArcmin: 60,
  minAxArcmin: 50,
  posAngDeg: null,
  vMag: 4,
  bMag: null,
  surfBr: null,
}

describe('T-0407 — la liste parcourt la plage du zoom', () => {
  it('écartée pour sa taille à la focale courante, retenue à sa focale optimale', () => {
    expect(etatsCibles(BASE, [PETITE]).get('PETITE')?.code).toBe('CADRAGE')
    const sousZoom = etatsCibles(BASE, [PETITE], resolveur()).get('PETITE')
    expect(sousZoom?.code).not.toBe('CADRAGE')
    expect(sousZoom?.pose).not.toBeNull()
  })

  it('la ligne porte sa focale, bornée au télé quand 80 % n’y est pas atteint', () => {
    const [ligne] = lignesInvariantes({
      catalogue: [PETITE],
      sbCiel: BASE.sbCielNoir,
      mLimOeil: BASE.mLimOeil,
      dMm: BASE.dMm,
      fovHDeg: BASE.fovHDeg,
      echApx: BASE.echApx,
      capteurHMm: BASE.capteurHMm,
      contexteDe: resolveur(),
    })
    expect(ligne?.focaleMm).toBe(ZOOM.focaleMaxMm)
    expect(ligne?.remplissage).toBeLessThan(K('REMPLISSAGE_ZOOM_OPTIMAL'))
    expect(ligne?.remplissage).toBeCloseTo(
      PETITE.majAxArcmin! / ARCMIN_PAR_DEG / contexteA(ZOOM.focaleMaxMm).fovHDeg,
      6,
    )
  })

  it('sans résolveur, le résultat est celui du contexte unique', () => {
    expect(etatsCibles(BASE, [PETITE], () => BASE)).toEqual(etatsCibles(BASE, [PETITE]))
  })
})

describe('T-0407 — le plan évalue la cible à la focale de la liste', () => {
  it('même pose que la liste, et l’étape dit sa focale', () => {
    const contexteDe = resolveur()
    const pose = etatsCibles(BASE, [PETITE], contexteDe).get('PETITE')?.pose
    const plan = planSession(BASE, [PETITE], contexteDe)
    const etape = plan.etapes.find((e) => e.objet.designation === 'PETITE')
    expect(etape?.tPoseS).toBe(pose?.tPoseS)
    expect(etape?.focaleMm).toBe(contexteDe(PETITE).focaleMm)
    expect(etape?.focaleMm).toBeGreaterThan(ZOOM.focaleMinMm)
  })
})
