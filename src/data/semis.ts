/**
 * §9.2, couche 2 — fond génératif au-delà du seuil catalographié.
 *
 * GRAINE DÉTERMINISTE : même cadre, même rendu. Un semis retiré à chaque image scintillerait
 * et rendrait la prévisualisation inutilisable pour décider d'un cadrage.
 *
 * DENSITÉ NON UNIFORME, modulée par la latitude galactique. C'est cette modulation qui fait
 * apparaître la bande de la Voie lactée ; sans elle, la prévisualisation manque le cas
 * d'usage principal du grand champ.
 *
 * Le semis est produit une fois pour toute la sphère, puis indexé comme un catalogue ordinaire
 * (§3.3) : la sélection, le tri par magnitude et le tracé sont ceux des étoiles réelles, sans
 * une ligne de rendu spécifique.
 *
 * ponytail: le nombre total d'étoiles est plafonné par C-33. La modulation relative de densité
 * est respectée, le comptage absolu ne l'est pas — un ciel complet jusqu'à magnitude 12 pèse
 * des millions d'étoiles. Le plafond est déclaré à l'écran, jamais silencieux.
 */

import { K } from '../registry/constants.ts'
import { latitudeGalactiqueDeg, magnitudeSemis } from '../core/galactique.ts'
import { DEG, versVecteur } from '../core/mat3.ts'
import type { Etoile } from './catalog.ts'

/** Graine fixe : c'est elle qui rend le rendu reproductible d'une session à l'autre. */
const GRAINE = 0x9e3779b9

/** Générateur mulberry32 : court, sans dépendance, et strictement déterministe. */
function generateur(graine: number): () => number {
  let etat = graine >>> 0
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0
    let t = etat
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Indices de couleur plausibles pour des étoiles faibles : majorité jaune à rouge. */
const BV_MIN = K('SEMIS_BV_MIN')
const BV_ETENDUE = K('SEMIS_BV_ETENDUE')

/**
 * Semis génératif de toute la sphère. Aucun cache n'est conservé : la fonction est
 * déterministe, et l'appelant garde l'INDEX, pas la liste d'objets — cent mille objets
 * retenus pour rien coûteraient plusieurs dizaines de mégaoctets sur un téléphone.
 */
export function semisGeneratif(): readonly Etoile[] {
  const alea = generateur(GRAINE)
  const total = Math.round(K('SEMIS_ETOILES_TOTAL'))
  const echelle = K('ECHELLE_LATITUDE_GALACTIQUE_DEG')
  const etoiles: Etoile[] = []

  while (etoiles.length < total) {
    const adDeg = alea() * 360
    // Tirage uniforme en sin(δ) : uniforme en déclinaison concentrerait tout aux pôles.
    const decDeg = Math.asin(2 * alea() - 1) / DEG
    const b = latitudeGalactiqueDeg(versVecteur(adDeg, decDeg))
    // Rejet selon densite(b) = exp(−|b| / 20°), normalisée à 1 dans le plan galactique.
    if (alea() > Math.exp(-Math.abs(b) / echelle)) continue
    etoiles.push({
      adDeg,
      decDeg,
      magV: magnitudeSemis(alea()),
      bv: BV_MIN + alea() * BV_ETENDUE,
    })
  }

  return etoiles
}

