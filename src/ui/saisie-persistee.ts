/**
 * §12.3 — boundary screen saisie ↔ §12.1 records. Saisie = text, record = validated number.
 * Out-of-domain saisie not saved: persisted `NaN`/Bortle 12 resurfaces every start and makes
 * export non-reimportable (reimport applies same §2.1 registry ranges).
 * Not persisted here: date de séance (derived from scène instant, kept by `scene-persistee.ts`,
 * T-0355: running clock returns to tonight, only frozen instant keeps its nuit); recadrage
 * comparison (display).
 */

import type { SiteEnregistre, ProfilMateriel } from '../data/db.ts'
import type { ProfilAEnregistrer, SiteAExporter } from '../data/persistence.ts'
import type { MasqueHorizon } from '../core/site.ts'
import { borne, valide, type DomaineId } from '../registry/domains.ts'
import { nombreSaisi, nombreSiRenseigne } from './saisie-bornee.ts'
import { objectifActif, reglageOptique } from './objectif-saisie.ts'
import {
  DEFAUT,
  type DepartLieu,
  type DepartMateriel,
  type SaisieLieu,
  type SaisieMateriel,
} from './app-saisie.ts'

/**
 * Optional saisie field: absent when empty, CLAMPED when out of domain.
 * T-0208 — clamped value saved, as scène's: what you see = what you get back at start.
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
 * Grandeur without which record is meaningless. Empty refused like `NaN`, never coerced to 0:
 * empty latitude saved as 0° = point off Gulf of Guinea, reread every start.
 * `valide` keeps last word: on clamped value it throws only for `NaN` = empty field.
 */
function requis(saisi: string, domaine: DomaineId): number {
  return valide(domaine, nombreSaisi(domaine, saisi).valeur)
}

/**
 * Grandeur text reread from DB; empty when absent, never "undefined".
 * T-0208 — clamped on REREAD too: nothing revalidates `litSiteActif`; out-of-domain value
 * already in DB (edited export, old version, DevTools) reached calcul chain before any field
 * was editable. Now goes to its bound, field stays correctable.
 */
function texteDe(valeur: number | undefined, domaine: DomaineId): string {
  if (valeur === undefined) return ''
  const { valeur: borne_ } = borne(domaine, valeur)
  return Number.isFinite(borne_) ? String(borne_) : ''
}

/**
 * Site to save, or `null` when saisie not chiffrable. Refusal shown by calcul chain, not here;
 * last valid record stays in DB, not overwritten by mid-typing input.
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
    }
  } catch {
    return null
  }
}

/** Profil matériel to save, or `null` when saisie not chiffrable. */
export function profilAEnregistrer(materiel: SaisieMateriel): ProfilAEnregistrer | null {
  const boitier = materiel.boitier
  // T-0404 — setting clamped by mounted objectif: what's seen and computed.
  const reglage = reglageOptique(
    objectifActif(materiel.objectifs, materiel.objectifId),
    materiel.focale,
    materiel.ouverture,
  )
  try {
    return {
      focaleMm: valide('focale_mm', reglage.focale.valeur),
      ouvertureN: valide('ouverture_N', reglage.ouverture.valeur),
      typeObjectif: materiel.typeObjectif,
      // Always written, even empty: missing parc rebuilt at start, emptied one not.
      objectifs: materiel.objectifs,
      ...(materiel.objectifId === '' ? {} : { objectifId: materiel.objectifId }),
      ...(materiel.boitierId === '' ? {} : { boitierId: materiel.boitierId }),
      formatCapteur: boitier.formatCapteur,
      ...siRenseigne('resolutionMpx', boitier.resolutionMpx, 'resolution_mpx'),
      ...siRenseigne('readNoiseE', boitier.readNoiseE, 'read_noise_e'),
      ...siRenseigne('seuilDoubleGainIso', boitier.seuilDoubleGainIso, 'seuil_double_gain_iso'),
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

/** Lieu as re-entered at start. `null`: nothing saved yet. */
export function departLieu(site: SiteEnregistre | null): DepartLieu | null {
  if (site === null) return null
  return {
    latitude: texteDe(site.latitudeDeg, 'latitude_deg'),
    longitude: texteDe(site.longitudeDeg, 'longitude_deg'),
    altitude: texteDe(site.altitudeM, 'altitude_m'),
    // Bortle emptied for a SQM stays so: else default Bortle returns on reload, ciel changes
    // alone. Neither → fond de ciel indeterminable at start: Annexe A Bortle takes over.
    bortle:
      site.bortleDeclare === undefined && site.sqmMesure === undefined
        ? DEFAUT.bortle
        : texteDe(site.bortleDeclare, 'bortle_declare'),
    sqm: texteDe(site.sqmMesure, 'sqm_mesure'),
  }
}

/** Matériel as re-entered at start. */
export function departMateriel(profil: ProfilMateriel | null): DepartMateriel | null {
  if (profil === null) return null
  return {
    ...(profil.boitierId === undefined ? {} : { boitierId: profil.boitierId }),
    boitier: {
      formatCapteur: profil.formatCapteur,
      resolutionMpx: texteDe(profil.resolutionMpx, 'resolution_mpx'),
      readNoiseE: texteDe(profil.readNoiseE, 'read_noise_e'),
      seuilDoubleGainIso: texteDe(profil.seuilDoubleGainIso, 'seuil_double_gain_iso'),
      zpSys: texteDe(profil.zpSys, 'zp_sys'),
      tailleRawMo: texteDe(profil.tailleRawMo, 'taille_raw_mo'),
    },
    iso: texteDe(profil.isoCapture, 'iso_capture'),
    ...(profil.objectifs === undefined ? {} : { objectifs: profil.objectifs }),
    ...(profil.objectifId === undefined ? {} : { objectifId: profil.objectifId }),
    focale: texteDe(profil.focaleMm, 'focale_mm'),
    ouverture: texteDe(profil.ouvertureN, 'ouverture_N'),
    capteurMode: profil.capteurMode,
    typeObjectif: profil.typeObjectif,
    suiviActif: profil.suiviActif,
    // Absent from a file imported elsewhere: saisie starting values take over.
    ...(profil.qualiteMes === undefined ? {} : { qualiteMes: profil.qualiteMes }),
    // T-0207 — altazimutale left selector: profil still carrying it would hit a `<select>` with
    // no matching option. Engine handles it, saisie can't represent it → default type.
    ...(profil.typeMonture === undefined
      ? {}
      : { typeMonture: profil.typeMonture === 'ALTAZ' ? 'TRACKER' : profil.typeMonture }),
  }
}
