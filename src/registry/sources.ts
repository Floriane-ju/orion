/**
 * T-0228 — where displayed data comes from.
 * Moved out of the values it covers (fiche dimensions, Bortle, detectability, filter advice):
 * serves no observation decision, never varies per cible; read in one place, on demand.
 * In registre, not UI: provenance = SOURCED DATA. Three entries only point to source constants
 * already held by their table (copy here = two diverging truths).
 * Versions/file names from `scripts/build-catalogs.ts` (upstreams pinned to commit SHA): names
 * what `pnpm data:build` produced, not what upstream serves today.
 * NOT here: attribution under fiche image (§6.4, visible without interaction) and unfolded
 * constant source (§10.2 level 3); PRD requires both at point of use.
 */

import { SOURCE_TABLE_BORTLE } from './bortle.ts'
import { SOURCE_TABLE_CONTRASTE } from './contrast.ts'
import { SOURCE_TABLE_FILTRES } from './filters.ts'
import { CREDIT_RELEVE } from './imagerie.ts'
import { CREDIT_RELIEF } from './relief.ts'
import { CREDIT_CARTE } from './lieu-carte.ts'

export interface Source {
  /** What this source feeds, screen's view not file's. */
  readonly donnee: string
  /** Upstream + version when it has one (dates the reading). */
  readonly provenance: string
  /** Absent: upstream has no stable public address. */
  readonly lien?: string
}

/** Order follows a séance: aimed at, when, demands, seen. */
export const SOURCES: readonly Source[] = Object.freeze(
  [
    {
      donnee: 'Objets du ciel profond — désignation, type, position, dimensions, magnitude',
      provenance: 'OpenNGC (NGC.csv et addendum.csv)',
      lien: 'https://github.com/mattiaverga/OpenNGC',
    },
    {
      donnee: 'Nébuleuses Sharpless et Barnard, et leurs noms d’usage',
      provenance: 'Catalogue DSO de Stellarium, v3.23',
      lien: 'https://github.com/Stellarium/stellarium',
    },
    {
      donnee: 'Étoiles du planétarium — position, magnitude, indice de couleur',
      provenance: 'HYG v4.1 (hygdata_v41.csv), complet jusqu’à magnitude ≈ 9',
      lien: 'https://github.com/astronexus/HYG-Database',
    },
    {
      donnee: 'Figures, astérismes et frontières de constellations',
      provenance:
        'Culture « modern » de Stellarium ; frontières IAU de Delporte (1930) en coordonnées B1875',
      lien: 'https://github.com/Stellarium/stellarium',
    },
    {
      donnee: 'Position du Soleil, de la Lune et des planètes, crépuscules, phase lunaire',
      provenance: 'Calculées à l’exécution par astronomy-engine — aucune éphéméride embarquée',
      lien: 'https://github.com/cosinekitty/astronomy',
    },
    {
      donnee: 'Masque d’horizon — relief du terrain dans un rayon de 30 km autour du site',
      provenance: `${CREDIT_RELIEF.auteur} · ${CREDIT_RELIEF.licence}`,
      lien: CREDIT_RELIEF.lien,
    },
    {
      donnee: 'Carte de choix du lieu — côtes, frontières et villes, embarquées',
      provenance: 'Natural Earth 1:50 M (ne_50m_land, admin_0_boundary_lines_land, populated_places_simple), domaine public',
      lien: 'https://www.naturalearthdata.com',
    },
    {
      donnee: 'Carte de choix du lieu — tuiles affichées quand le réseau est là',
      provenance: `OpenStreetMap, ${CREDIT_CARTE.auteur} · ${CREDIT_CARTE.licence}`,
      lien: CREDIT_CARTE.lien,
    },
    {
      donnee: 'Fond de ciel et magnitude limite à l’œil nu, à partir du Bortle saisi',
      provenance: SOURCE_TABLE_BORTLE,
    },
    {
      donnee: 'Seuils de contraste de détectabilité',
      provenance: SOURCE_TABLE_CONTRASTE,
    },
    {
      donnee: 'Familles de filtres',
      provenance: SOURCE_TABLE_FILTRES,
    },
    {
      donnee: 'Image de la cible — découpe de relevé aux coordonnées de l’objet',
      provenance: `${CREDIT_RELEVE.auteur} · ${CREDIT_RELEVE.licence}`,
      lien: CREDIT_RELEVE.lien,
    },
  ].map(Object.freeze) as Source[],
)
