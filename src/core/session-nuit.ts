/**
 * §8.3 — the nuit is a resource to allocate, not a list to sort.
 * Two time accounts: which créneau piece stays free for a target, and total plan cost once
 * calibration, mise en station, pointage are added.
 * T-0322 — removes nothing. Overrun is OBSERVED (`tient`), not resolved: selection is the user's,
 * dropping their worst-scored target silently undid their action. What the nuit doesn't cover
 * reads on the étape, with its night count.
 */

import { K } from '../registry/constants.ts'
import type { CreneauCible, Intervalle } from './creneaux.ts'
import { dureeLisible, dureeMinLisible } from '../registry/ecriture.ts'
import { trace } from './traced.ts'
import type { PlanCalibration } from './calibration.ts'
import type { BudgetNuit, ContexteSession, EtapePlan } from './session-types.ts'
import { MIN_PAR_H, MS_PAR_MINUTE } from './unites.ts'


function chevauche(a: Intervalle, b: Intervalle): boolean {
  return a.debut.getTime() < b.fin.getTime() && b.debut.getTime() < a.fin.getTime()
}

function duree(intervalle: Intervalle): number {
  return intervalle.fin.getTime() - intervalle.debut.getTime()
}

/** What remains of a sub-créneau once everything already allocated is removed. */
function intervallesLibres(
  sous: Intervalle,
  occupes: readonly Intervalle[],
): readonly Intervalle[] {
  let libres: Intervalle[] = [{ debut: sous.debut, fin: sous.fin }]
  for (const occupe of occupes) {
    const suivants: Intervalle[] = []
    for (const libre of libres) {
      if (!chevauche(libre, occupe)) {
        suivants.push(libre)
        continue
      }
      if (occupe.debut.getTime() > libre.debut.getTime()) {
        suivants.push({ debut: libre.debut, fin: occupe.debut })
      }
      if (occupe.fin.getTime() < libre.fin.getTime()) {
        suivants.push({ debut: occupe.fin, fin: libre.fin })
      }
    }
    libres = suivants
  }
  return libres
}

/** Minutes of a target's créneau nothing occupies yet. */
export function minutesLibres(
  creneau: Pick<CreneauCible, 'creneaux'>,
  occupes: readonly Intervalle[],
): number {
  const libres = creneau.creneaux.flatMap((sous) => intervallesLibres(sous, occupes))
  return libres.reduce((somme, libre) => somme + duree(libre), 0) / MS_PAR_MINUTE
}

/**
 * True when two targets contest ≥ 1 minute of the nuit.
 * Tells HOW MANY targets share a night part: disjoint créneaux don't hinder each other; counting
 * them would reserve time nobody can take.
 */
export function creneauxSeChevauchent(
  a: Pick<CreneauCible, 'creneaux'>,
  b: Pick<CreneauCible, 'creneaux'>,
): boolean {
  return a.creneaux.some((sousA) => b.creneaux.some((sousB) => chevauche(sousA, sousB)))
}

/**
 * LONGEST free piece of target's créneau, ≤ `dureeMaxMin` minutes. Longest, not first: taking the
 * 9 min before an already placed target when 4 h stay free after = absurd plan.
 */
export function alloueCreneau(
  creneau: Pick<CreneauCible, 'creneaux'>,
  occupes: readonly Intervalle[],
  dureeMaxMin: number,
): Intervalle | null {
  const libres = creneau.creneaux.flatMap((sous) => intervallesLibres(sous, occupes))
  const meilleur = libres.reduce<Intervalle | null>(
    (max, libre) => (max === null || duree(libre) > duree(max) ? libre : max),
    null,
  )
  if (meilleur === null || duree(meilleur) <= 0) return null
  const alloue = Math.min(Math.ceil(dureeMaxMin * MS_PAR_MINUTE), duree(meilleur))
  return { debut: meilleur.debut, fin: new Date(meilleur.debut.getTime() + alloue) }
}

/**
 * T-0271 — meridian flip time WHEN THE ÉTAPE CROSSES IT, else `null`.
 * `creneau` covers the whole night: flip may fall 4 h after étape end. Alert applies only to the
 * capture being run → allocated créneau. Étape starting exactly at meridian already points the
 * right side.
 */
export function retournementDansEtape(etape: {
  readonly creneau: Pick<CreneauCible, 'retournementMeridien' | 'heureCulmination'>
  readonly creneauAlloue: Intervalle
}): Date | null {
  const instant = etape.creneau.heureCulmination
  if (!etape.creneau.retournementMeridien || instant === null) return null
  const { debut, fin } = etape.creneauAlloue
  return instant.getTime() > debut.getTime() && instant.getTime() < fin.getTime()
    ? instant
    : null
}

/**
 * T-0271 — what the étape lacks to reach its integration, named by the constraint that really
 * bites; `null` when complete.
 * Two constraints: target créneau shorter than required pose (several nights), or target would
 * fit the night but plan allocated less (sharing, reserved fixed costs). Blaming the nuit in the
 * second case sent user to a problem they don't have.
 */
export function manqueIntegration(
  etape: Pick<EtapePlan, 'integrationComplete' | 'nNuits' | 'dureeAlloueeMin'> & {
    readonly integration: { readonly tRequisS: { readonly value: number } }
  },
): string | null {
  if (etape.integrationComplete) return null
  return etape.nNuits > 1
    ? `Trop long pour une nuit : prévoir ${etape.nNuits} nuits, avec des darks à chaque nuit.`
    : `Créneau alloué de ${dureeMinLisible(etape.dureeAlloueeMin)} pour ` +
        `${dureeLisible(etape.integration.tRequisS.value)} requises : ce soir n’en couvre ` +
        'qu’une partie.'
}

export function calculeBudget(
  contexte: ContexteSession,
  etapes: readonly EtapePlan[],
  calibration: PlanCalibration | null,
): BudgetNuit {
  const disponibleMin = contexte.nuit.dureeReferenceH * MIN_PAR_H
  const captureMin = etapes.reduce((somme, e) => somme + e.dureeAlloueeMin, 0)
  const calibrationMin = calibration === null ? 0 : calibration.surcoutTempsMin.value
  const miseEnStationMin = K('TEMPS_MISE_EN_STATION_MIN')
  const pointageMin = K('TEMPS_POINTAGE_PAR_CIBLE_MIN') * etapes.length
  const total = captureMin + calibrationMin + miseEnStationMin + pointageMin

  return {
    disponibleMin,
    captureMin,
    calibrationMin,
    miseEnStationMin,
    pointageMin,
    totalMin: trace({
      value: total,
      formula: 'BUDGET_NUIT',
      inputs: {
        capture_min: captureMin,
        calibration_min: calibrationMin,
        mise_en_station_min: miseEnStationMin,
        pointage_min: pointageMin,
      },
      constants: ['TEMPS_MISE_EN_STATION_MIN', 'TEMPS_POINTAGE_PAR_CIBLE_MIN'],
    }),
    tient: total <= disponibleMin,
  }
}

