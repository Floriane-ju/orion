/**
 * T-0228 — d'où viennent les données que l'application affiche.
 *
 * Ces phrases vivaient au contact des valeurs qu'elles couvrent : sous les dimensions de la
 * fiche, sous le champ Bortle, sous le verdict de détectabilité, sous le conseil filtre. Elles
 * ne servent aucune décision d'observation et ne changent jamais d'une cible à l'autre — les
 * relire à chaque ouverture de fiche coûtait la place d'une lecture utile. Elles se lisent
 * désormais en un seul endroit, quand on les cherche.
 *
 * Le module est dans le registre et non dans l'UI pour la raison qui vaut pour `constants.ts` :
 * une provenance est une DONNÉE SOURCÉE. Trois entrées ne font d'ailleurs que renvoyer aux
 * constantes de source déjà tenues par leur table — les recopier ici en ferait deux vérités
 * qui divergeraient à la première mise à jour d'amont.
 *
 * Les versions et les noms de fichier viennent de `scripts/build-catalogs.ts`, où chaque amont
 * est épinglé à un SHA de commit. Ce que cette table nomme est donc exactement ce que
 * `pnpm data:build` a produit, pas ce que l'amont sert aujourd'hui.
 *
 * Ce qui n'est PAS ici, et ne doit pas y venir : l'attribution sous l'image de la fiche, que
 * §6.4 impose visible sans interaction, et la source d'une constante dépliée, qui est le
 * niveau 3 de traçabilité de §10.2. Les deux sont au contact parce que le PRD les y exige.
 */

import { SOURCE_TABLE_BORTLE } from './bortle.ts'
import { SOURCE_TABLE_CONTRASTE } from './contrast.ts'
import { SOURCE_TABLE_FILTRES } from './filters.ts'
import { CREDIT_RELEVE } from './imagerie.ts'
import { CREDIT_RELIEF } from './relief.ts'

export interface Source {
  /** Ce que cette source alimente, dit du point de vue de l'écran, pas du fichier. */
  readonly donnee: string
  /** L'amont, avec sa version quand il en porte une : c'est elle qui date la lecture. */
  readonly provenance: string
  /** Absent quand l'amont n'a pas d'adresse publique stable à citer. */
  readonly lien?: string
}

/**
 * L'ordre suit celui d'une séance : ce qu'on vise, puis quand, puis ce que ça demande, puis ce
 * qu'on voit. Un classement par nature de fichier — binaire, calcul, réseau — n'aurait de sens
 * que pour qui connaît déjà l'architecture.
 */
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
