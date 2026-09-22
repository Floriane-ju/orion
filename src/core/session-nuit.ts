/**
 * §8.3 — La nuit est une ressource à allouer, pas une liste à trier.
 *
 * Ce module tient les deux comptes du temps : quel morceau de créneau reste libre pour une
 * cible donnée, et ce que le plan coûte au total une fois la calibration, la mise en station
 * et le pointage ajoutés.
 *
 * T-0322 — il ne retire plus rien. Le dépassement se CONSTATE (`tient`), il ne se résout pas :
 * la sélection vient de l'utilisateur, et supprimer sa cible la moins bien notée revenait à
 * défaire son geste sans le lui dire. Ce que la nuit ne couvre pas se lit sur l'étape, qui
 * porte son nombre de nuits.
 */

import { K } from '../registry/constants.ts'
import type { CreneauCible, Intervalle } from './creneaux.ts'
import { trace } from './traced.ts'
import type { PlanCalibration } from './calibration.ts'
import type { BudgetNuit, ContexteSession, EtapePlan } from './session-types.ts'

const MINUTES_PAR_HEURE = 60
const MS_PAR_MINUTE = 60000

function chevauche(a: Intervalle, b: Intervalle): boolean {
  return a.debut.getTime() < b.fin.getTime() && b.debut.getTime() < a.fin.getTime()
}

function duree(intervalle: Intervalle): number {
  return intervalle.fin.getTime() - intervalle.debut.getTime()
}

/** Ce qui reste d'un sous-créneau une fois retiré tout ce qui est déjà alloué. */
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

/** Les minutes du créneau d'une cible que rien n'occupe encore. */
export function minutesLibres(
  creneau: CreneauCible,
  occupes: readonly Intervalle[],
): number {
  const libres = creneau.creneaux.flatMap((sous) => intervallesLibres(sous, occupes))
  return libres.reduce((somme, libre) => somme + duree(libre), 0) / MS_PAR_MINUTE
}

/**
 * Vrai quand deux cibles se disputent au moins une minute de la nuit.
 *
 * Sert à savoir avec COMBIEN de cibles une part de nuit se partage : deux cibles aux créneaux
 * disjoints ne se gênent pas, et les compter l'une contre l'autre ferait réserver du temps
 * que personne ne peut prendre.
 */
export function creneauxSeChevauchent(a: CreneauCible, b: CreneauCible): boolean {
  return a.creneaux.some((sousA) => b.creneaux.some((sousB) => chevauche(sousA, sousB)))
}

/**
 * Le PLUS LONG morceau libre du créneau de la cible, d'au plus `dureeMaxMin` minutes. Le
 * plus long, et non le premier venu : prendre les neuf minutes qui précèdent une cible déjà
 * placée, quand quatre heures restent libres ensuite, produirait un plan absurde.
 */
export function alloueCreneau(
  creneau: CreneauCible,
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

export function calculeBudget(
  contexte: ContexteSession,
  etapes: readonly EtapePlan[],
  calibration: PlanCalibration | null,
): BudgetNuit {
  const disponibleMin = contexte.nuit.dureeReferenceH * MINUTES_PAR_HEURE
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

