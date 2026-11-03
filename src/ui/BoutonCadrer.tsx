/**
 * T-0046, T-0221, T-0283 — "Cadrer" centres scène on a cible AND sets field to the matériel cadre.
 * List and fiche share the button (two drawings would announce two things). No chiffrable
 * matériel → no cadre → no button.
 * Below horizon the direction still exists (view to −90°) and tells where to wait for rise: button
 * stays; Sol layer masks what it covers, bulle says why the cible won't appear.
 * §3.5, T-0339 — "Aligner" = fiche's 2nd gesture: rotate boîtier to put major axis on sensor
 * length. Only if cible is in cadre and moteur finds an angle (round / no position angle: nothing
 * to align, a no-op button would lie).
 */

import { cibleDominante, rotationSuggeree, type ProfilCadre } from '../core/cadre.ts'
import { coordonneesHorizon } from '../core/cibles-liste.ts'
import type { Site } from '../core/ephem.ts'
import { matriceALaMinute } from '../core/horloges.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { bornesZoom } from '../core/projection.ts'
import { BoutonGlyphe, type VarianteGlyphe } from './BoutonGlyphe.tsx'
import { champPourCadrer } from './planetarium-gestes.ts'
import {
  etatScene,
  majVue,
  minuteAffichee,
  suisCible,
  useTrancheScene,
  vueScene,
} from './scene-etat.ts'

export interface AlignementCibleProps {
  readonly objet: ObjetCielProfond
  readonly site: Site
  /** Declared matériel cadre; absent if not chiffrable. */
  readonly profil: ProfilCadre | undefined
}

/** §3.5 — suggested angle applied on click. Nothing when nothing to align. */
export function AlignementCible({ objet, site, profil }: AlignementCibleProps) {
  const minute = useTrancheScene(minuteAffichee)
  const vue = useTrancheScene(vueScene)
  if (profil === undefined) return null
  const matrice = matriceALaMinute(site, minute)
  const cadre = {
    profil,
    azimutDeg: vue.azimutDeg,
    hauteurDeg: vue.hauteurDeg,
    rotationDeg: vue.rotationCadreDeg,
  }
  const dansCadre = cibleDominante([objet], cadre, matrice)
  if (dansCadre === null) return null
  const { angleDeg, message } = rotationSuggeree(dansCadre, cadre, matrice)
  if (angleDeg === null) return null
  return (
    <BoutonGlyphe
      icone="rotate_right"
      aide={message}
      place="gauche"
      onClick={() => majVue({ rotationCadreDeg: angleDeg })}
    />
  )
}

export interface CadrerCibleProps {
  readonly objet: ObjetCielProfond
  readonly site: Site
  /** Declared matériel cadre; absent if not chiffrable. */
  readonly profil: ProfilCadre | undefined
  readonly gaiaCharge: boolean
}

/** §6.4 — one gesture shows the cible with the cadre on a readable part of the scène. */
export function CadrerCible({ objet, site, profil, gaiaCharge }: CadrerCibleProps) {
  const minute = useTrancheScene(minuteAffichee)
  const { azimutDeg, hauteurDeg } = coordonneesHorizon(objet, matriceALaMinute(site, minute))
  return (
    <BoutonCadrer
      objet={objet}
      azimutDeg={azimutDeg}
      hauteurDeg={hauteurDeg}
      profil={profil}
      gaiaCharge={gaiaCharge}
    />
  )
}

export interface BoutonCadrerProps {
  readonly objet: ObjetCielProfond
  readonly azimutDeg: number
  readonly hauteurDeg: number
  /** Declared matériel cadre; absent if not chiffrable. */
  readonly profil: ProfilCadre | undefined
  readonly gaiaCharge: boolean
  readonly variante?: VarianteGlyphe
  /** List card foot spells the gesture out. */
  readonly avecLibelle?: boolean
}

/**
 * The "Cadrer" gesture, shared with "Prochain créneau" (T-0380): jumping to a night without
 * turning toward the cible would leave searching a new sky. No matériel cadre: view centres, field
 * unchanged. Visée then follows the cible through sky rotation until first gesture moving it (a
 * cadre losing its cible in minutes framed only an instant).
 */
export function cadreScene(
  objet: ObjetCielProfond,
  azimutDeg: number,
  hauteurDeg: number,
  profil: ProfilCadre | undefined,
  gaiaCharge: boolean,
): void {
  const suivi = { designation: objet.designation, adDeg: objet.adDeg, decDeg: objet.decDeg }
  if (profil === undefined) {
    suisCible(suivi, { azimutDeg, hauteurDeg })
    return
  }
  const fovDeg = champPourCadrer(profil.fovLDeg, bornesZoom(gaiaCharge, etatScene().vue.mode))
  suisCible(suivi, { azimutDeg, hauteurDeg, fovDeg })
}

/**
 * List row already supplies the direction. View mode read at click only: subscribing would redraw
 * every row on each scène drag.
 */
export function BoutonCadrer({
  objet,
  azimutDeg,
  hauteurDeg,
  profil,
  gaiaCharge,
  variante,
  avecLibelle = false,
}: BoutonCadrerProps) {
  if (profil === undefined) return null
  const aide = `Cadrer ${objet.designation} avec le cadre du matériel`
  return (
    <BoutonGlyphe
      icone="center_focus_strong"
      aide={hauteurDeg > 0 ? aide : `${aide} — sous l’horizon`}
      place="gauche"
      {...(variante === undefined ? {} : { variante })}
      {...(avecLibelle ? { texte: 'Cadrer' } : {})}
      onClick={() => cadreScene(objet, azimutDeg, hauteurDeg, profil, gaiaCharge)}
    />
  )
}
