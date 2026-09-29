/**
 * §12.3 — la frontière entre la saisie à l'écran et les enregistrements de §12.1.
 *
 * La saisie est du texte, un enregistrement est un nombre validé : la traversée se fait ici,
 * dans les deux sens. Une saisie hors domaine ne s'enregistre pas — un `NaN` ou un Bortle 12
 * persisté ressortirait à chaque démarrage, et rendrait l'export irréimportable puisque le
 * contrôle du réimport applique les mêmes plages du registre §2.1.
 *
 * Deux choses ne sont pas persistées ici : la date de séance se déduit de l'instant de la
 * scène, que `scene-persistee.ts` garde (T-0355) — l'horloge en marche la ramène à ce soir,
 * seul un instant figé garde sa nuit — et la comparaison de recadrage est un affichage, pas
 * une saisie.
 */

import type { SiteEnregistre, ProfilMateriel } from '../data/db.ts'
import type { ProfilAEnregistrer, SiteAExporter } from '../data/persistence.ts'
import type { MasqueHorizon } from '../core/site.ts'
import { borne, valide, type DomaineId } from '../registry/domains.ts'
import { nombreSaisi, nombreSiRenseigne } from './saisie-bornee.ts'
import {
  DEFAUT,
  type DepartLieu,
  type DepartMateriel,
  type SaisieLieu,
  type SaisieMateriel,
} from './app-saisie.ts'

/**
 * Un champ optionnel de la saisie : absent quand il est vide, BORNÉ quand il est hors domaine.
 *
 * T-0208 — c'est la valeur ramenée dans le domaine qui s'enregistre, la même que celle dont la
 * scène est déduite : ce qu'on voit est ce qu'on retrouve au démarrage suivant.
 */
function siRenseigne<C extends string>(
  nom: C,
  saisi: string,
  domaine: DomaineId,
): { readonly [K in C]?: number } {
  const { valeur } = nombreSiRenseigne(domaine, saisi)
  return (valeur === undefined ? {} : { [nom]: valeur }) as { readonly [K in C]?: number }
}

/**
 * Une grandeur sans laquelle l'enregistrement n'a pas de sens. Un champ vide est refusé comme
 * un `NaN`, jamais coercé en 0 : une latitude vide enregistrée à 0° ne serait pas un aveu
 * d'oubli mais un point au large du golfe de Guinée, relu tel quel à chaque démarrage.
 *
 * `valide` reste le dernier mot : sur une valeur déjà bornée il ne peut plus lever que pour
 * un `NaN`, c'est-à-dire exactement le champ vide.
 */
function requis(saisi: string, domaine: DomaineId): number {
  return valide(domaine, nombreSaisi(domaine, saisi).valeur)
}

/**
 * Le texte d'une grandeur relue de la base ; vide quand elle est absente, jamais « undefined ».
 *
 * T-0208 — et borné à la RELECTURE. Rien ne revalide ce que rend `litSiteActif` : une valeur
 * hors domaine déjà en base — export retouché, version antérieure, DevTools — repartait dans
 * la chaîne de calcul avant que le moindre champ soit éditable. Elle repart maintenant à sa
 * borne, et le champ reste corrigeable.
 */
function texteDe(valeur: number | undefined, domaine: DomaineId): string {
  if (valeur === undefined) return ''
  const { valeur: borne_ } = borne(domaine, valeur)
  return Number.isFinite(borne_) ? String(borne_) : ''
}

/**
 * Le site à enregistrer, ou `null` quand la saisie n'est pas encore chiffrable. Le refus n'a
 * pas à être annoncé ici : la chaîne de calcul l'affiche déjà, et le dernier enregistrement
 * valable reste en base plutôt que d'être écrasé par une saisie en cours de frappe.
 */
export function siteAEnregistrer(lieu: SaisieLieu, masque: MasqueHorizon): SiteAExporter | null {
  try {
    return {
      latitudeDeg: requis(lieu.latitude, 'latitude_deg'),
      longitudeDeg: requis(lieu.longitude, 'longitude_deg'),
      altitudeM: requis(lieu.altitude, 'altitude_m'),
      ...siRenseigne('bortleDeclare', lieu.bortle, 'bortle_declare'),
      ...siRenseigne('sqmMesure', lieu.sqm, 'sqm_mesure'),
      masque,
      pointsMasque: lieu.pointsMasque,
    }
  } catch {
    return null
  }
}

/** Le profil matériel à enregistrer, ou `null` quand la saisie n'est pas chiffrable. */
export function profilAEnregistrer(materiel: SaisieMateriel): ProfilAEnregistrer | null {
  const boitier = materiel.boitier
  try {
    return {
      focaleMm: requis(materiel.focale, 'focale_mm'),
      ouvertureN: requis(materiel.ouverture, 'ouverture_N'),
      typeObjectif: materiel.typeObjectif,
      ...(materiel.boitierId === '' ? {} : { boitierId: materiel.boitierId }),
      formatCapteur: boitier.formatCapteur,
      ...siRenseigne('resolutionMpx', boitier.resolutionMpx, 'resolution_mpx'),
      ...siRenseigne('readNoiseE', boitier.readNoiseE, 'read_noise_e'),
      ...siRenseigne('seuilDoubleGainIso', boitier.seuilDoubleGainIso, 'seuil_double_gain_iso'),
      ...siRenseigne('fullWellE', boitier.fullWellE, 'full_well_e'),
      ...siRenseigne('zpSys', boitier.zpSys, 'zp_sys'),
      ...siRenseigne('tailleRawMo', boitier.tailleRawMo, 'taille_raw_mo'),
      ...siRenseigne('isoCapture', materiel.iso, 'iso_capture'),
      capteurMode: materiel.capteurMode,
      suiviActif: materiel.suiviActif,
      qualiteMes: materiel.qualiteMes,
      typeMonture: materiel.typeMonture,
    }
  } catch {
    return null
  }
}

/** Le lieu tel qu'il se ressaisit au démarrage. `null` : rien n'a encore été enregistré. */
export function departLieu(site: SiteEnregistre | null): DepartLieu | null {
  if (site === null) return null
  return {
    latitude: texteDe(site.latitudeDeg, 'latitude_deg'),
    longitude: texteDe(site.longitudeDeg, 'longitude_deg'),
    altitude: texteDe(site.altitudeM, 'altitude_m'),
    // Un Bortle vidé pour un SQM le reste : sans cela, le Bortle par défaut reviendrait au
    // rechargement et le ciel changerait seul. Sans l'un ni l'autre, le fond de ciel serait
    // indéterminable dès le démarrage : le Bortle de l'Annexe A reprend alors sa place.
    bortle:
      site.bortleDeclare === undefined && site.sqmMesure === undefined
        ? DEFAUT.bortle
        : texteDe(site.bortleDeclare, 'bortle_declare'),
    sqm: texteDe(site.sqmMesure, 'sqm_mesure'),
    pointsMasque: site.masquePoints ?? [],
  }
}

/** Le matériel tel qu'il se ressaisit au démarrage. */
export function departMateriel(profil: ProfilMateriel | null): DepartMateriel | null {
  if (profil === null) return null
  return {
    ...(profil.boitierId === undefined ? {} : { boitierId: profil.boitierId }),
    boitier: {
      formatCapteur: profil.formatCapteur,
      resolutionMpx: texteDe(profil.resolutionMpx, 'resolution_mpx'),
      readNoiseE: texteDe(profil.readNoiseE, 'read_noise_e'),
      seuilDoubleGainIso: texteDe(profil.seuilDoubleGainIso, 'seuil_double_gain_iso'),
      fullWellE: texteDe(profil.fullWellE, 'full_well_e'),
      zpSys: texteDe(profil.zpSys, 'zp_sys'),
      tailleRawMo: texteDe(profil.tailleRawMo, 'taille_raw_mo'),
    },
    iso: texteDe(profil.isoCapture, 'iso_capture'),
    focale: texteDe(profil.focaleMm, 'focale_mm'),
    ouverture: texteDe(profil.ouvertureN, 'ouverture_N'),
    capteurMode: profil.capteurMode,
    typeObjectif: profil.typeObjectif,
    suiviActif: profil.suiviActif,
    // Absents d'un fichier importé d'ailleurs : les valeurs de départ de la saisie reprennent.
    ...(profil.qualiteMes === undefined ? {} : { qualiteMes: profil.qualiteMes }),
    // T-0207 — l'altazimutale a quitté le sélecteur : un profil qui la porte encore retomberait
    // sur un `<select>` sans option correspondante. Le moteur sait toujours la traiter, mais la
    // saisie ne peut plus la représenter, donc elle revient au type par défaut.
    ...(profil.typeMonture === undefined
      ? {}
      : { typeMonture: profil.typeMonture === 'ALTAZ' ? 'TRACKER' : profil.typeMonture }),
  }
}
