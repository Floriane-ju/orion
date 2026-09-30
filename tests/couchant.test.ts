/**
 * T-0356 — le couchant en vue réaliste : la lumière du Soleil bas est rougie par sa masse
 * d'air (Kasten & Young), puis rougie encore sur le trajet de visée — d'où des bandes étagées
 * en hauteur, orangé au ras de l'horizon, bleu au zénith. Les hautes lumières se compressent au
 * lieu de s'écrêter, et une lueur persiste côté Soleil en début de nuit avant de s'éteindre.
 */
import { describe, expect, it } from 'vitest'
import {
  brillanceSoleilZenithNl,
  composantesCielSoleil,
  composantesFond,
  compresseHautesLumieres,
  compresseTeinte,
  eclairageSoleil,
  lueurSoleil,
  masseAirKastenYoung,
  rougissement,
  sbDepuisNanolamberts,
  sbZenithAvecCrepuscule,
} from '../src/core/fond-ciel-rendu.ts'
import { nanolamberts } from '../src/core/moon.ts'
import { interpoleBortle } from '../src/registry/bortle.ts'
import { K } from '../src/registry/constants.ts'

const SB_SITE = interpoleBortle(4).sb
const PROCHE_DEG = 5
const SOLEIL_HAUT_DEG = 45
const SOLEIL_RASANT_DEG = 1
const DEBUT_DE_NUIT_DEG = -6
const NUIT_DEG = -18
const HORIZON_DEG = 0
const ZENITH_DEG = 90
const MI_HAUTEUR_DEG = 8

/** L'éclairage du ciel pour un Soleil à cette hauteur, au-dessus d'un site Bortle 4. */
function eclairage(altitudeDeg: number) {
  const sbZenith = sbZenithAvecCrepuscule(SB_SITE, -altitudeDeg)
  const bFond = Math.max(0, nanolamberts(sbZenith) - brillanceSoleilZenithNl(-altitudeDeg))
  return eclairageSoleil(altitudeDeg, bFond, sbZenith)
}

/** Couleur du ciel à la hauteur `h`, dans l'azimut du Soleil. */
function versLeSoleil(altitudeDeg: number, hauteurDeg: number) {
  return composantesCielSoleil(
    eclairage(altitudeDeg),
    hauteurDeg,
    Math.abs(hauteurDeg - altitudeDeg),
  )
}

describe('couchant', () => {
  it('la masse d’air de Kasten & Young vaut 1 au zénith et reste finie à l’horizon', () => {
    expect(masseAirKastenYoung(ZENITH_DEG)).toBeCloseTo(1, 3)
    expect(Number.isFinite(masseAirKastenYoung(HORIZON_DEG))).toBe(true)
    expect(masseAirKastenYoung(HORIZON_DEG)).toBeGreaterThan(masseAirKastenYoung(SOLEIL_HAUT_DEG))
  })

  it('le rougissement retire du vert et du bleu, jamais n’ajoute de rouge', () => {
    const [r, v, b] = rougissement(SOLEIL_RASANT_DEG)
    expect(r).toBe(1)
    expect(v).toBeLessThan(r)
    expect(b).toBeLessThan(v)
    expect(rougissement(SOLEIL_HAUT_DEG)[2]).toBeGreaterThan(b)
  })

  it('Soleil haut, le ciel près de lui blanchit', () => {
    const [r, v, b] = composantesCielSoleil(eclairage(SOLEIL_HAUT_DEG), SOLEIL_HAUT_DEG, PROCHE_DEG)
    expect(Math.min(r, v, b)).toBeGreaterThan(K('GENOU_HAUTES_LUMIERES'))
  })

  it('Soleil rasant, le ciel s’étage : orangé à l’horizon, plus jaune au-dessus, bleu au zénith', () => {
    const [rH, vH, bH] = versLeSoleil(SOLEIL_RASANT_DEG, HORIZON_DEG)
    expect(rH).toBeGreaterThan(vH)
    expect(vH).toBeGreaterThan(bH)
    expect(bH).toBeLessThan(K('GENOU_HAUTES_LUMIERES') / 2)

    const [rM, vM] = versLeSoleil(SOLEIL_RASANT_DEG, MI_HAUTEUR_DEG)
    expect(vM / rM).toBeGreaterThan(vH / rH)

    const [rZ, , bZ] = versLeSoleil(SOLEIL_RASANT_DEG, ZENITH_DEG)
    expect(bZ).toBeGreaterThan(rZ)
  })

  it('en début de nuit, une lueur reste côté Soleil ; la nuit, plus rien', () => {
    expect(lueurSoleil(DEBUT_DE_NUIT_DEG, PROCHE_DEG).mieNl).toBeGreaterThan(0)
    expect(lueurSoleil(DEBUT_DE_NUIT_DEG, PROCHE_DEG).rayleighNl).toBe(0)
    expect(lueurSoleil(NUIT_DEG, PROCHE_DEG).mieNl).toBe(0)
    expect(lueurSoleil(DEBUT_DE_NUIT_DEG, PROCHE_DEG).mieNl).toBeLessThan(
      lueurSoleil(HORIZON_DEG, PROCHE_DEG).mieNl,
    )
  })

  it('la nuit, le ciel est exactement le fond du site : aucune teinte de couchant', () => {
    const e = eclairage(NUIT_DEG)
    const attendu = compresseTeinte(composantesFond(sbDepuisNanolamberts(e.bFondNl), e.sbZenith))
    const obtenu = composantesCielSoleil(e, ZENITH_DEG, ZENITH_DEG)
    for (let c = 0; c < 3; c++) expect(obtenu[c]).toBeCloseTo(attendu[c]!, 12)
  })

  it('la compression à teinte constante garde le rapport des canaux', () => {
    const sous = K('GENOU_HAUTES_LUMIERES') / 2
    expect(compresseTeinte([sous, sous, sous])).toEqual([sous, sous, sous])
    const [r, v, b] = compresseTeinte([3, 6, 12])
    expect(b).toBeLessThanOrEqual(1)
    expect(v / b).toBeCloseTo(0.5, 12)
    expect(r / b).toBeCloseTo(0.25, 12)
  })

  it('la compression par canal plafonne à 1 sans inverser l’ordre des canaux', () => {
    const sous = K('GENOU_HAUTES_LUMIERES') / 2
    expect(compresseHautesLumieres([sous, sous, sous])).toEqual([sous, sous, sous])
    const [r, v, b] = compresseHautesLumieres([12, 3, sous])
    expect(r).toBeLessThanOrEqual(1)
    expect(r).toBeGreaterThan(v)
    expect(v).toBeGreaterThan(b)
    expect(b).toBe(sous)
  })
})
