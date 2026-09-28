/**
 * §6.4, §6.2 — l'image d'une cible : la vue de la fiche avec son cadre, et la vignette de la
 * liste.
 *
 * Deux composants pour deux portées, et la différence n'est pas cosmétique. La fiche a le
 * droit de demander l'image au réseau : la cible y a été choisie. La liste ne l'a pas — deux
 * cents lignes qui se refiltrent à chaque frappe feraient du défilement une rafale de
 * requêtes, et le service répondrait 429. La vignette de liste ne montre donc que ce qui est
 * déjà là.
 *
 * Une seule image, là où la fiche en montrait deux. Le champ de la découpe est connu, donc le
 * cadre du capteur s'y lit à la bonne échelle : inutile de télécharger une seconde vue du même
 * objet pour répondre à « qu'est-ce qui tient dans mon cadre ».
 *
 * L'attribution n'est pas une mention légale posée en petit : c'est la condition d'usage d'un
 * fichier sous licence libre. Elle est visible sans interaction, et une image dont l'auteur
 * n'a pas pu être lu n'arrive jamais jusqu'ici — le résolveur l'a écartée (§6.4).
 *
 * Aucune absence n'est signalée. Une cible sans image reste une cible complète : sa
 * désignation et son type sont déjà à l'écran, et §12.5 dit que l'imagerie qui tombe se
 * signale sans être présentée comme une erreur.
 */

import type { CSSProperties } from 'react'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { cadreSurImage } from '../data/imagerie-cible.ts'
import { I } from '../registry/imagerie.ts'
import { Icone } from './Icone.tsx'
import { useImageCible } from './image-cible-memoire.ts'
import { LIBELLE_TYPE_OBJET, nomCommun } from './libelles-objet.ts'
import { POURCENT } from '../core/unites.ts'


/**
 * L'alternative textuelle décrit l'OBJET, pas le média : « image de M31 » n'apprend rien à qui
 * ne voit pas l'image, alors que « M31, galaxie d'Andromède — galaxie » dit ce qui est là.
 */
export function alternativeCible(objet: ObjetCielProfond): string {
  const commun = nomCommun(objet)
  const nom = commun === '' ? objet.designation : `${objet.designation}, ${commun}`
  return `${nom} — ${LIBELLE_TYPE_OBJET[objet.type]}`
}

/** §6.2 — le cadre à poser. `null` quand le catalogue ne donne pas les dimensions de la cible. */
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
      {/* Auteur et licence en clair, jamais repliés : c'est ce qui autorise l'affichage. */}
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
 * Le cadre est décoratif au sens des lecteurs d'écran : ce qu'il illustre — verdict,
 * remplissage, nombre de tuiles, note d'orientation — est déjà en texte dans « Cadrage de la
 * cible ». L'annoncer une seconde fois en géométrie n'ajouterait rien.
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

  // La largeur part en variable CSS, pas en `width` : au survol, l'encart prend toute la vue,
  // et un `width` en ligne gagnerait contre la règle qui l'agrandit.
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
 * La vignette d'une ligne de liste. T-0166 — la case est TOUJOURS là, garnie ou non : les
 * images arrivent une par une depuis le cache, et une case qui apparaît décalerait le nom,
 * les pastilles et les lectures de sa ligne après le rendu — la liste bougerait sous le
 * curseur pendant qu'on la pointe.
 *
 * La case en attente porte un GLYPHE, pas du vide. Un carré sombre entre deux vignettes de
 * ciel profond ne se lit pas comme une place réservée : il se lit comme une pose ratée, ou
 * comme une nébuleuse trop faible pour ressortir. Le pictogramme dit « il y aura une image
 * ici », ce qu'un fond uni ne peut pas dire. Ce n'est pas pour autant un signalement d'échec
 * (§12.5) : le glyphe est celui d'une image, pas d'une erreur, et il reste atténué.
 *
 * L'état vide ne porte pas `.image-cible-vue` : le fond clair que cette classe prend en mode
 * nuit n'existe que pour le fondu multiplicatif de l'image. Sans image à fondre, il ne
 * servirait qu'à noyer le glyphe dans la même teinte que lui.
 */
export function VignetteCible({ objet }: { readonly objet: ObjetCielProfond }) {
  const affichable = useImageCible(objet, 'CACHE')
  if (affichable === null)
    return (
      <span className="cible-vignette cible-vignette-vide">
        <Icone nom="image" />
      </span>
    )
  return (
    <span className="image-cible-vue cible-vignette">
      <img src={affichable.url} alt="" />
    </span>
  )
}
