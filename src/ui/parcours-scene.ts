/**
 * T-0324, T-0338 — « Voir le parcours » : la scène montre le cheminement et se cadre dessus.
 *
 * Sorti de `PlanSession.tsx` : c'est un calcul de scène (cadrage, visée, champ), pas du rendu.
 * Le composant appelle, il ne calcule pas.
 */

import { cadrageParcours, type EtapeParcours } from '../core/pointage.ts'
import type { Site } from '../core/ephem.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { K } from '../registry/constants.ts'
import { bornesZoom, fovPourRayonDeg } from '../core/projection.ts'
import { cielInstantane } from '../core/horloges.ts'
import { DEG_PAR_HEURE } from '../core/unites.ts'
import { fovBorne } from './planetarium-gestes.ts'
import { viseeVersVue } from './scene-lecture.ts'
import {
  etatScene,
  majVue,
  montreParcours,
  vuePlanetarium,
  type ParcoursScene,
} from './scene-etat.ts'

export interface EntreeParcours {
  readonly objet: ObjetCielProfond
  readonly date: Date
  readonly site: Site
  /** §3.3 — il borne le champ que « Voir le parcours » demande à la scène. */
  readonly gaiaCharge: boolean
}

/**
 * T-0324 — la scène prend le trajet, puis s'y range : elle va à l'heure du pointage, se centre
 * dessus et ouvre son champ juste assez pour le contenir.
 *
 * L'HORLOGE SAUTE, contrairement au bouton « Voir » de T-0046 qui ne bouge que la visée. Ce
 * n'est pas la même question : « Voir » demande où est cette cible en ce moment, le parcours
 * montre le trajet qu'on fera à l'heure de l'étape. Le reste de l'aide au pointage — la table,
 * le schéma, l'angle parallactique de §8.4 — est déjà calculé pour cette heure-là ; laisser la
 * scène à la sienne montrerait le ciel d'un autre moment sous des chiffres qui n'en parlent
 * pas, et le cadrage automatique raterait le trajet d'autant que les deux heures diffèrent.
 *
 * Le rayon du trajet devient un champ par `fovPourRayonDeg`, qui le fait tenir sur le bord le
 * plus proche : `fovDeg` est horizontal, et un trajet à dominante verticale sortirait d'un champ
 * dimensionné sur la largeur d'un canevas plus large que haut.
 *
 * Le champ passe ensuite par `bornesZoom` alors que `majVue` ne pose que le plafond de la
 * projection. Sans ce plancher, un trajet court laisserait la scène sous la profondeur du
 * catalogue embarqué — et l'y laisserait encore après la fermeture du parcours.
 */
export function poseParcours(props: EntreeParcours, etapes: readonly EtapeParcours[]): void {
  const adCibleH = props.objet.adDeg / DEG_PAR_HEURE
  const parcours: ParcoursScene = {
    designation: props.objet.designation,
    etapes,
    adCibleH,
    decCibleDeg: props.objet.decDeg,
  }
  montreParcours(parcours, props.date.getTime())

  const cadrage = cadrageParcours(etapes, adCibleH, props.objet.decDeg)
  const { matrice } = cielInstantane(props.site, props.date)
  const { azimutDeg, hauteurDeg } = viseeVersVue(cadrage.adDeg, cadrage.decDeg, matrice)
  const vue = etatScene().vue
  const fovDeg = fovPourRayonDeg(
    vuePlanetarium(vue),
    cadrage.rayonDeg * K('MARGE_CADRAGE_PARCOURS'),
  )
  majVue({
    azimutDeg,
    hauteurDeg,
    fovDeg: fovBorne(fovDeg, bornesZoom(props.gaiaCharge, vue.mode)),
  })
}
