/**
 * §11.2 — Export texte imprimable du plan de session.
 *
 * Un plan qui exige un écran allumé pendant trois heures est un plan qui vide la batterie.
 * L'export est donc du texte brut : imprimable, lisible sans l'application, et sans aucune
 * dépendance au réseau.
 *
 * TOUTE VALEUR PORTE SON UNITÉ. Un « 13 » sans unité est une source d'erreur de manipulation
 * sur le terrain — c'est la règle de §11.2, et elle vaut aussi dans l'export.
 */

import { dureeLisible, dureeMinLisible, nombre, nombreLibre } from '../registry/ecriture.ts'
import { nomDeLaNuit } from './nuit-datee.ts'
import type { PlanSession } from './session.ts'
import type { CauseEcart } from './session-types.ts'
import { manqueIntegration, retournementDansEtape } from './session-nuit.ts'
import {
  LIBELLE_CAUSE_ECART,
  LIBELLE_LOT_CALIBRATION,
  LIBELLE_VERDICT_CADRAGE,
  LIBELLE_VERDICT_DETECTABILITE,
} from '../registry/libelles.ts'
import { S_PAR_MIN } from './unites.ts'

/** Colonne des lots de calibration : le plus long libellé, pour que les deux-points s'alignent. */
const LARGEUR_LOT = Math.max(...Object.values(LIBELLE_LOT_CALIBRATION).map((l) => l.length))

const MINUTE_DEUX_CHIFFRES = 2

function heure(date: Date): string {
  return (
    `${date.getHours().toString().padStart(MINUTE_DEUX_CHIFFRES, '0')}:` +
    `${date.getMinutes().toString().padStart(MINUTE_DEUX_CHIFFRES, '0')}`
  )
}

export interface EnTetePlan {
  readonly nuitIso: string
  readonly lieu: string
  readonly materiel: string
}

export function planEnTexte(plan: PlanSession, enTete: EnTetePlan): string {
  const lignes: string[] = []
  // T-0267 — la nuit porte deux dates : un plan lu à 2 h du matin sous la frontale ne doit
  // pas laisser deviner si « 17/09 » désigne le soir écoulé ou celui qui vient.
  const titre = `PLAN DE SESSION — ${nomDeLaNuit(enTete.nuitIso)}`
  lignes.push(titre, '='.repeat(titre.length), '')
  lignes.push(`Lieu     : ${enTete.lieu}`)
  lignes.push(`Matériel : ${enTete.materiel}`)
  lignes.push('')

  const b = plan.budget
  lignes.push('BUDGET DE NUIT')
  lignes.push(`  Nuit exploitable    : ${dureeMinLisible(b.disponibleMin)}`)
  lignes.push(`  Capture             : ${dureeMinLisible(b.captureMin)}`)
  lignes.push(`  Calibration         : ${dureeMinLisible(b.calibrationMin)}`)
  lignes.push(`  Mise en station     : ${dureeMinLisible(b.miseEnStationMin)}`)
  lignes.push(`  Pointage            : ${dureeMinLisible(b.pointageMin)}`)
  lignes.push(
    `  Total               : ${dureeMinLisible(b.totalMin.value)} — ` +
      `${b.tient ? 'tient dans la nuit' : 'DÉPASSE la nuit disponible'}`,
  )
  lignes.push('')

  if (plan.etapes.length === 0) {
    lignes.push('AUCUNE CIBLE PLANIFIÉE')
    lignes.push(`  ${plan.message}`)
    if (plan.contrainteDominante !== undefined) lignes.push(`  ${plan.contrainteDominante}`)
    if (plan.alternative !== undefined) lignes.push(`  ${plan.alternative}`)
  } else {
    lignes.push('CHRONOLOGIE')
    for (const [index, etape] of plan.etapes.entries()) {
      const nom =
        etape.objet.nomsCommuns === ''
          ? etape.objet.designation
          : `${etape.objet.designation} — ${etape.objet.nomsCommuns.split('|')[0]}`
      lignes.push('')
      lignes.push(
        `${index + 1}. ${heure(etape.creneauAlloue.debut)} → ` +
          `${heure(etape.creneauAlloue.fin)}  ${nom}`,
      )
      lignes.push(`     Créneau alloué   : ${dureeMinLisible(etape.dureeAlloueeMin)}`)
      lignes.push(`     Pose unitaire    : ${nombreLibre(etape.tPoseS)} s`)
      lignes.push(`     Nombre de poses  : ${etape.nPoses} poses`)
      lignes.push(`     Volume           : ${nombre(etape.volumeGo, 1)} Go`)
      lignes.push(
        `     Intégration      : ${dureeLisible(etape.integration.tRequisS.value)} requises`,
      )
      const manque = manqueIntegration(etape)
      if (manque !== null) lignes.push(`     Couverture       : ${manque}`)
      lignes.push(`     Verdict          : ${etape.verdict === null ? 'donnée manquante' : LIBELLE_VERDICT_DETECTABILITE[etape.verdict]}`)
      lignes.push(`     Cadrage          : ${LIBELLE_VERDICT_CADRAGE[etape.verdictCadrage]}`)
      lignes.push(
        `     Fond de ciel     : ${nombre(etape.sbCielEffectif, 2)} mag/arcsec²` +
          ` (Lune : +${nombre(etape.deltaSbLuneMag.value, 2)} mag/arcsec²)`,
      )
      // Le score est sans dimension : « sur 1 » le dit, plutôt que de laisser un nombre nu.
      lignes.push(`     Score            : ${nombre(etape.score.value, 3)} sur 1`)
      lignes.push(`     Consigne         : ${etape.consigne}`)
      const retournement = retournementDansEtape(etape)
      if (retournement !== null) {
        lignes.push(
          `     Méridien         : retournement à ${heure(retournement)}, orientation du ` +
            'capteur basculée de 180° — re-vérifier le cadrage, la séquence redémarre',
        )
      }
    }
  }

  if (plan.calibration !== null) {
    lignes.push('', 'CALIBRATION')
    for (const lot of plan.calibration.lots) {
      lignes.push(
        `  ${LIBELLE_LOT_CALIBRATION[lot.type].padEnd(LARGEUR_LOT)} : ${lot.nombre} images ` +
          `(${lot.plage[0]} à ${lot.plage[1]}) — ${lot.consigne}`,
      )
    }
    lignes.push(
      `  Surcoût de temps : ${dureeMinLisible(plan.calibration.surcoutTempsMin.value)}`,
    )
    lignes.push(`  Dithering        : ${plan.calibration.dithering}`)
    for (const avertissement of plan.calibration.avertissements) {
      lignes.push(`  ! ${avertissement}`)
    }
  }

  if (plan.ciblesEcartees.length > 0) {
    lignes.push('', 'CIBLES ÉCARTÉES — avec leur cause')
    for (const ecartee of plan.ciblesEcartees) {
      lignes.push(`  ${ecartee.designation} — ${LIBELLE_CAUSE_ECART[ecartee.code]} : ${ecartee.cause}`)
    }
    lignes.push(
      `  Décompte par cause : ${Object.entries(plan.comptesEcartees)
        // `Object.entries` élargit toujours la clé en `string` ; le cast est sûr depuis que
        // `comptesEcartees` est typé par `CauseEcart` — c'est le type qui garantit la clé.
        .map(([code, nombre]) => `${LIBELLE_CAUSE_ECART[code as CauseEcart]} ${nombre} objets`)
        .join(', ')}`,
    )
  }

  if (plan.noteCouvertureCatalogue !== undefined) {
    lignes.push('', 'COUVERTURE DU CATALOGUE', `  ${plan.noteCouvertureCatalogue}`)
  }

  lignes.push('', 'MÉTÉO', `  ${plan.avertissementMeteo}`)

  if (plan.avertissementBatterie !== undefined) {
    lignes.push('', 'BATTERIE', `  ${plan.avertissementBatterie}`)
  }
  lignes.push(
    '',
    'Durée totale de capture : ' + dureeLisible(b.captureMin * S_PAR_MIN) + '.',
  )
  return lignes.join('\n')
}
