/**
 * §6.4, §6.2 — origin, framing and weight of the object image.
 * Two reasons, 2nd is the real one. 1: widths/margins/size caps are values, not engine code.
 * 2: §13.1 — privacy promise is read in `ORIGINES_IMAGERIE`. Single source: CSP of
 * `vite.config.ts` derives from it, a test rejects divergence. New origin = PRD amendment.
 * Only `connect-src` opens: bytes downloaded, stored in IndexedDB, shown from `blob:`; no
 * third-party host in `img-src` (one surface to watch, not two).
 * One origin: object image = always a survey cut-out, since it carries the §6.2 cadre and a cadre
 * needs known scale (encyclopedia images are author-framed, field unwritten).
 * §6.4 still describes two sources: gap accepted, arbitrated apart, not amended here.
 */

export interface OrigineImagerie {
  readonly origine: string
  /** Sent in clear to this third party; §13.1 enumerates it. */
  readonly transmis: string
}

export const ORIGINES_IMAGERIE: readonly OrigineImagerie[] = Object.freeze(
  [
    {
      origine: 'https://alasky.cds.unistra.fr',
      transmis: 'les coordonnées équatoriales de la cible consultée',
    },
  ].map(Object.freeze) as OrigineImagerie[],
)

/**
 * CDS cut-out host: canonical alias of the docs. `alaskybis` and `alasky.u-strasbg.fr` are
 * identical aliases; only this one wired + CSP-allowed (3 origins for 1 service = 3 surfaces).
 */
export const HOTE_DECOUPE = 'https://alasky.cds.unistra.fr'

export const CHEMIN_DECOUPE = '/hips-image-services/hips2fits'

/** Survey queried; same as §6.2 cadre preview. */
export const RELEVE_DECOUPE = 'CDS/P/DSS2/color'

export interface ValeurImagerie {
  readonly valeur: number
  readonly unite: string
  readonly source: string
  readonly tolerance: string
}

function valeur(v: ValeurImagerie): ValeurImagerie {
  return Object.freeze(v)
}

const IMAGERIE = Object.freeze({
  /** Cut-out width requested. Thumbnail, not plate: DSS2 ~10 kB keeps per-object cache viable. */
  LARGEUR_VIGNETTE_PX: valeur({
    valeur: 320,
    unite: 'px',
    source: 'convention d’affichage — mesuré à 9,5 ko pour une découpe DSS2 de 300 px',
    tolerance: 'sans objet — aucun verdict ne dépend de cette largeur',
  }),

  /**
   * Cut-out field = object size × margin. Not by eye: 2,5 → object at 40 % of field, mid
   * CADRAGE_OPTIMAL band of §6.2 (0,33 – 0,5).
   */
  MARGE_CADRAGE_DECOUPE: valeur({
    valeur: 2.5,
    unite: '—',
    source: 'inverse du milieu de la bande CADRAGE_OPTIMAL de §6.2 (0,4)',
    tolerance: 'sans objet — cadrage d’illustration',
  }),

  /** Fallback when catalogue has no dimension (frequent, §6.2). */
  CHAMP_DECOUPE_DEFAUT_DEG: valeur({
    valeur: 1,
    unite: '°',
    source: 'convention — ordre de grandeur du champ d’un instrument grand champ de §5.1',
    tolerance: 'sans objet — cadrage d’illustration',
  }),

  /** Field bounds asked of service: below, no survey left; above, no object left. */
  CHAMP_DECOUPE_MIN_DEG: valeur({
    valeur: 0.05,
    unite: '°',
    source: 'résolution du relevé DSS2 — sous 3′ la découpe n’ajoute aucun détail',
    tolerance: 'sans objet — cadrage d’illustration',
  }),

  CHAMP_DECOUPE_MAX_DEG: valeur({
    valeur: 10,
    unite: '°',
    source: 'convention — au-delà la découpe montre le voisinage, plus la cible',
    tolerance: 'sans objet — cadrage d’illustration',
  }),

  /**
   * §6.2 — cadre inset width, share of image width. Inset carries sensor cadre with target at
   * real size; only way the cadre reads at rest (hover enlarges). 1/3: sees a half-frame target
   * without masking the view.
   */
  PART_ENCART_CADRE: valeur({
    valeur: 0.33,
    unite: '—',
    source: 'convention d’affichage — un tiers de la largeur, l’encart commente sans couvrir',
    tolerance: 'sans objet — cadrage d’illustration',
  }),

  /** Max file accepted. Cut-outs are tens of kB; cap guards unexpected responses (§12.3). */
  POIDS_VIGNETTE_MAX_KO: valeur({
    valeur: 512,
    unite: 'ko',
    source: 'convention — vingt fois le poids observé d’une vignette, marge pour un format lourd',
    tolerance: 'sans objet — plafond de garde',
  }),

  /**
   * §6.4 — thumbnails a results list fetches at once. List thumbnail used cache only: fresh
   * search gave imageless list. Cap motive = request count to a public service, not volume
   * (60 cut-outs ≈ hundreds of kB). Below `CIBLES_LISTEES_MAX`: requested = TOP of list.
   */
  VIGNETTES_PRECHARGEES_MAX: valeur({
    valeur: 60,
    unite: '—',
    source: 'convention d’affichage — le haut de liste, à ~10 ko la découpe',
    tolerance: 'sans objet — aucun verdict ne dépend de ce plafond',
  }),

  /** Concurrent prefetch requests; cap motive: service 429. */
  PRECHARGE_SIMULTANEE_MAX: valeur({
    valeur: 2,
    unite: '—',
    source: 'politesse envers un service public — hips2fits répond 429 à une rafale',
    tolerance: 'sans objet — plafond de débit',
  }),

  /** Rest before prefetch. List refilters per keystroke; else "pleiades" fires 8 bursts. */
  DELAI_PRECHARGE_MS: valeur({
    valeur: 400,
    unite: 'ms',
    source: 'convention d’interaction — au-dessus de la cadence de frappe soutenue',
    tolerance: 'sans objet — temporisation d’interface',
  }),
} satisfies Record<string, ValeurImagerie>)

export type IdImagerie = keyof typeof IMAGERIE

/** Value read, like `K()` of registre §2.1. */
export function I(id: IdImagerie): number {
  return IMAGERIE[id].valeur
}

/** Credit of a survey cut-out: no individual author to name. */
export const CREDIT_RELEVE = Object.freeze({
  auteur: 'DSS2 couleur — relevé numérisé du ciel',
  licence: 'domaine public, distribué par le CDS (Strasbourg)',
  lien: 'https://aladin.cds.unistra.fr/hips/list',
})
