/**
 * §4.1 — le relief du terrain converti en élévations apparentes, une par degré d'azimut.
 *
 * Le long de chaque azimut, on lit l'altitude du terrain à pas réguliers jusqu'au rayon de
 * §4.1, et on garde le point vu le plus haut. Chaque point est abaissé de la chute due à la
 * rotondité, sur une Terre de rayon R / (1 − k) : la réfraction terrestre k rend le masque
 * APPARENT, comme le sont les hauteurs de cibles qui lui sont comparées.
 *
 *   e = atan( (h_point − h_œil − (1 − k)·d² / 2R) / d )
 *
 * L'œil est posé sur le modèle de terrain, pas à l'altitude saisie : les deux altitudes
 * comparées viennent alors du même modèle et du même datum, et une altitude de site laissée à
 * sa valeur par défaut ne met pas l'observateur sous terre.
 *
 * Le moteur ne sait rien des tuiles : il reçoit un altimètre. C'est `src/data/relief.ts` qui
 * le construit.
 */

import { K } from '../registry/constants.ts'
import { DOMAINES } from '../registry/domains.ts'
import { R } from '../registry/relief.ts'
import { DEG } from './mat3.ts'
import { NB_AZIMUTS } from './site.ts'

const M_PAR_KM = 1000

/** L'altitude du terrain en mètres à ces coordonnées, ou null quand le modèle ne la connaît pas. */
export type Altimetre = (latDeg: number, lonDeg: number) => number | null

/** Élévation apparente d'un point à `distanceM`, `deniveleM` au-dessus de l'œil. */
export function elevationApparenteDeg(deniveleM: number, distanceM: number): number {
  const rayonM = K('RAYON_TERRE_KM') * M_PAR_KM
  const chuteM = ((1 - R('COEF_REFRACTION_TERRESTRE')) * distanceM ** 2) / (2 * rayonM)
  return Math.atan2(deniveleM - chuteM, distanceM) / DEG
}

/** Le point atteint en partant de (lat, lon) le long d'un grand cercle d'azimut donné. */
export function pointA(
  latDeg: number,
  lonDeg: number,
  azimutDeg: number,
  distanceM: number,
): { readonly latDeg: number; readonly lonDeg: number } {
  const delta = distanceM / (K('RAYON_TERRE_KM') * M_PAR_KM)
  const phi1 = latDeg * DEG
  const theta = azimutDeg * DEG
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  const phi2 = Math.asin(sinPhi2)
  const lambda =
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * sinPhi2,
    ) / DEG
  return { latDeg: phi2 / DEG, lonDeg: lonDeg + lambda }
}

/**
 * Les 360 élévations du relief vu depuis (lat, lon), ramenées au plancher du domaine du
 * masque : un horizon qui plonge sous 0° ne dévoile rien de plus, la hauteur minimale d'une
 * cible garde la main. Null sans altitude au site — le masque plat [HYP] s'appliquera.
 */
export function profilRelief(
  altitude: Altimetre,
  latDeg: number,
  lonDeg: number,
): readonly number[] | null {
  const sol = altitude(latDeg, lonDeg)
  if (sol === null) return null
  const oeilM = sol + R('HAUTEUR_OEIL_M')
  const pas = R('PAS_RADIAL_RELIEF_M')
  const nbPas = Math.floor((R('RAYON_RELIEF_KM') * M_PAR_KM) / pas)
  // Le champ proche est laissé au relevé : le bruit du modèle y invente des secteurs entiers.
  const premierPas = Math.max(1, Math.ceil(R('DISTANCE_MIN_RELIEF_M') / pas))
  const { min, max } = DOMAINES.masque_horizon_deg

  return Array.from({ length: NB_AZIMUTS }, (_, azimut) => {
    let haut = min
    for (let rang = premierPas; rang <= nbPas; rang++) {
      const d = rang * pas
      const point = pointA(latDeg, lonDeg, azimut, d)
      const h = altitude(point.latDeg, point.lonDeg)
      if (h === null) continue
      haut = Math.max(haut, elevationApparenteDeg(h - oeilM, d))
    }
    return Math.min(haut, max)
  })
}
