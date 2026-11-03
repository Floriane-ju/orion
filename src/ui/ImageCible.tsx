/**
 * §6.4, §6.2 — target image: fiche view with frame, and list thumbnail.
 * Two scopes: fiche may ask network (target chosen); list may not (200 rows refiltering per
 * keystroke → request burst → 429): thumbnail shows only what is there.
 * Cutout field known → sensor frame read at right scale on one image.
 * Attribution = usage condition of a free-licence file, visible without interaction; image with
 * unreadable author never reaches here (resolver drops it, §6.4).
 * Absence never signalled: no image = complete; §12.5 imagery failure signalled, not as error.
 */

import type { CSSProperties } from 'react'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { cadreSurImage } from '../data/imagerie-cible.ts'
import { I } from '../registry/imagerie.ts'
import { Icone } from './Icone.tsx'
import { useImageCible } from './image-cible-memoire.ts'
import { ICONE_TYPE_OBJET, LIBELLE_TYPE_OBJET, nomCommun } from './libelles-objet.ts'
import { POURCENT } from '../core/unites.ts'


/** Alt text describes the OBJECT, not the medium: "M31, galaxie d'Andromède — galaxie". */
export function alternativeCible(objet: ObjetCielProfond): string {
  const commun = nomCommun(objet)
  const nom = commun === '' ? objet.designation : `${objet.designation}, ${commun}`
  return `${nom} — ${LIBELLE_TYPE_OBJET[objet.type]}`
}

/** §6.2 — frame to draw; `null` when catalogue gives no target dimensions. */
export interface CadreCible {
  readonly fovLDeg: number
  readonly fovHDeg: number
  readonly angleBoitierDeg: number | null
}

export interface ImageCibleProps {
  readonly objet: ObjetCielProfond | null
  readonly cadre: CadreCible | null
}

export function ImageCible({ objet, cadre }: ImageCibleProps) {
  const affichable = useImageCible(objet, 'RESEAU')
  if (objet === null || affichable === null) return null

  const { credit } = affichable.image

  return (
    <figure className="image-cible">
      <span className="image-cible-vue">
        <img src={affichable.url} alt={alternativeCible(objet)} />
        {cadre !== null && <EncartCadre objet={objet} url={affichable.url} cadre={cadre} />}
      </span>
      {/* Author and licence in clear, never folded: they authorise display. */}
      <figcaption>
        {credit.auteur} · {credit.licence}{' '}
        <a href={credit.lien} target="_blank" rel="noreferrer">
          source
        </a>
      </figcaption>
    </figure>
  )
}

/**
 * Frame decorative for screen readers: verdict, fill, tile count, orientation note already
 * text in "Cadrage de la cible".
 */
function EncartCadre({
  objet,
  url,
  cadre,
}: {
  readonly objet: ObjetCielProfond
  readonly url: string
  readonly cadre: CadreCible
}) {
  const pose = cadreSurImage(objet, cadre.fovLDeg, cadre.fovHDeg, cadre.angleBoitierDeg)

  // Width as CSS variable, not `width`: on hover the inset fills the view, inline `width`
  // would beat the enlarging rule.
  const boite = {
    '--encart-largeur': `${I('PART_ENCART_CADRE') * POURCENT}%`,
    aspectRatio: `${cadre.fovLDeg} / ${cadre.fovHDeg}`,
  } as CSSProperties

  return (
    <span className="image-cible-encart" aria-hidden="true" style={boite}>
      <img
        src={url}
        alt=""
        style={{
          width: `${pose.partObjetPct}%`,
          transform: `translate(-50%, -50%) rotate(${pose.rotationDeg}deg)`,
        }}
      />
      <span className="image-cible-encart-mention">aperçu sur le capteur</span>
    </span>
  )
}

/**
 * List-row thumbnail. T-0166 — box ALWAYS present, filled or not: images arrive one by one
 * from cache, an appearing box would shift name/pastilles/readings under the cursor.
 * Pending box carries a GLYPH (large type icon), not blank: a dark square reads as failed
 * exposure or faint nebula. Muted, no error wording (§12.5).
 * Empty state lacks `.image-cible-vue`: its night-mode light background exists only for the
 * multiplicative image fade; it would drown the glyph.
 */
export function VignetteCible({ objet }: { readonly objet: ObjetCielProfond }) {
  const affichable = useImageCible(objet, 'CACHE')
  if (affichable === null)
    return (
      <span className="cible-vignette cible-vignette-vide">
        <Icone nom={ICONE_TYPE_OBJET[objet.type]} />
      </span>
    )
  return (
    <span className="image-cible-vue cible-vignette">
      <img src={affichable.url} alt="" />
    </span>
  )
}
