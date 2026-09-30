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
import { dureeLisible } from './exposure.ts'
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
  creneau: Pick<CreneauCible, 'creneaux'>,
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
export function creneauxSeChevauchent(
  a: Pick<CreneauCible, 'creneaux'>,
  b: Pick<CreneauCible, 'creneaux'>,
): boolean {
  return a.creneaux.some((sousA) => b.creneaux.some((sousB) => chevauche(sousA, sousB)))
}

/**
 * Le PLUS LONG morceau libre du créneau de la cible, d'au plus `dureeMaxMin` minutes. Le
 * plus long, et non le premier venu : prendre les neuf minutes qui précèdent une cible déjà
 * placée, quand quatre heures restent libres ensuite, produirait un plan absurde.
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
 * T-0271 — l'heure du retournement au méridien QUAND L'ÉTAPE LE TRAVERSE, sinon `null`.
 *
 * `creneau` décrit la cible sur toute la nuit : son retournement peut tomber quatre heures
 * après la fin de l'étape. L'alerte ne vaut que pour la capture qu'on mène, donc pour le
 * créneau alloué. Une étape qui commence pile au méridien pointe déjà du bon côté.
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
 * T-0271 — ce qui manque à l'étape pour atteindre son intégration, dit par la contrainte qui
 * mord vraiment, ou `null` quand l'étape est complète.
 *
 * Deux contraintes différentes : le créneau de la cible est plus court que la pose requise
 * (il faut plusieurs nuits), ou la cible tiendrait dans la nuit mais le plan lui a alloué
 * moins — partage avec d'autres cibles, frais fixes réservés. Accuser la nuit dans le second
 * cas renvoyait l'utilisateur à un problème qu'il n'a pas.
 */
export function manqueIntegration(
  etape: Pick<EtapePlan, 'integrationComplete' | 'nNuits' | 'dureeAlloueeMin'> & {
    readonly integration: { readonly tRequisS: { readonly value: number } }
  },
): string | null {
  if (etape.integrationComplete) return null
  return etape.nNuits > 1
    ? `Trop long pour une nuit : prévoir ${etape.nNuits} nuits, avec des darks à chaque nuit.`
    : `Créneau alloué de ${etape.dureeAlloueeMin.toFixed(0)} min pour ` +
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

