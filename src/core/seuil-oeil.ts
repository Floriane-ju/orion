/**
 * §3.3, T-0357 — magnitude limite à l'œil nu sous un ciel PLUS CLAIR que Bortle 9 : le crépuscule.
 *
 * La table Bortle s'arrête à 18 mag/arcsec² et `mLimOeilBorne` borne à son bord, magnitude 4.
 * Juste sous la pleine Lune, faux au crépuscule : le Soleil à peine couché, le fond tombait
 * hors table et des centaines d'étoiles apparaissaient d'un coup. Le seuil de Schaefer (1990)
 * couvre, lui, tout le domaine de l'œil, de la nuit au plein jour.
 *
 * Il ne remplace pas la table : sous un ciel noir, ses magnitudes sont plus pessimistes que
 * l'échelle de Bortle. Il ne sert qu'au-delà du bord clair, RECALÉ sur lui (≈ −0,2 mag) : la
 * magnitude limite reste continue quand le ciel quitte la table.
 */

import { K } from '../registry/constants.ts'
import { M_LIM_OEIL_PLANCHER, SB_PLAFOND_TABLE } from '../registry/bortle.ts'
import { nanolamberts } from './moon.ts'

/** 10^x : les coefficients de Schaefer sont publiés en logarithmes décimaux. */
function puissanceDeDix(x: number): number {
  return Math.exp(x * Math.LN10)
}

/** Schaefer (1990) brut : magnitude du point le plus faible détectable sur ce fond. */
export function mLimSchaefer(sbMag: number): number {
  const fondNl = nanolamberts(sbMag)
  const diurne = fondNl > K('SCHAEFER_BASCULE_PHOTOPIQUE_NL')
  const c1 = puissanceDeDix(K(diurne ? 'SCHAEFER_LOG_C1_PHOTOPIQUE' : 'SCHAEFER_LOG_C1_SCOTOPIQUE'))
  const c2 = puissanceDeDix(K(diurne ? 'SCHAEFER_LOG_C2_PHOTOPIQUE' : 'SCHAEFER_LOG_C2_SCOTOPIQUE'))
  const seuil = c1 * (1 + Math.sqrt(c2 * fondNl)) ** 2
  return K('SCHAEFER_ZERO_MAG') - K('POGSON') * Math.log10(seuil)
}

const RACCORD_MAG = M_LIM_OEIL_PLANCHER - mLimSchaefer(SB_PLAFOND_TABLE)

/** Magnitude limite sous un fond plus clair que la table Bortle, continue à son bord. */
export function mLimOeilCielClair(sbMag: number): number {
  return mLimSchaefer(sbMag) + RACCORD_MAG
}
