/**
 * §6.1, §6.2 — T-0408 : sous un zoom, la fiche a sa propre bague.
 *
 * La focale réglée ici est LOCALE à la fiche : essayer 200 mm sur une galaxie ne doit pas
 * changer le cadre du planétarium, ni la liste, ni le plan — ils restent à la focale optimale
 * de chaque cible. Le curseur s'ouvre sur cette focale et l'aimante : c'est la réponse à
 * « où régler la bague ? », les autres crans sont des essais. Le repère suffit à y revenir :
 * un bouton de plus redirait ce que l'aimant fait déjà.
 *
 * La fiche ne recalcule rien : la chaîne fournit le contexte de chaque focale (`Zoom.aFocale`).
 */

import { useState } from 'react'
import { nombre, pourcentage } from '../registry/ecriture.ts'
import type { ContexteSession } from '../core/session-types.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { ContexteFiche } from './fiche-cible-calcul.ts'
import { Curseur } from './Curseur.tsx'
import { FicheCible, type FicheCibleProps } from './FicheCible.tsx'
import { Lecture } from './ChampsCible.tsx'
import type { Zoom } from './zoom-calcul.ts'

/** Une bague de zoom se règle au millimètre, comme `focaleOptimale` l'arrondit. */
const PAS_FOCALE_MM = 1

interface ReglageZoomProps {
  readonly zoom: Zoom
  readonly focaleMm: number
  readonly optimaleMm: number
  /** Le remplissage de la fiche à cette focale ; `null` sans cadrage calculé. */
  readonly remplissage: number | null
  readonly sur: (focaleMm: number) => void
}

function ReglageZoom({ zoom, focaleMm, optimaleMm, remplissage, sur }: ReglageZoomProps) {
  const texte = `${nombre(focaleMm, 0)} mm`
  return (
    <section>
      <h2>Zoom</h2>
      <Lecture
        libelle={texte}
        valeur={remplissage === null ? '—' : `${pourcentage(remplissage)} du cadre`}
      />
      <Curseur
        libelle={`Focale du ${zoom.objectif.nom}`}
        valeur={focaleMm}
        min={zoom.objectif.focaleMinMm}
        max={zoom.objectif.focaleMaxMm}
        pas={PAS_FOCALE_MM}
        texte={texte}
        accroche={{ valeur: optimaleMm, libelle: 'optimale' }}
        sur={sur}
      />
    </section>
  )
}

export interface FicheSousZoomProps extends FicheCibleProps {
  readonly zoom: Zoom | null
}

/**
 * La fiche, à la focale que sa bague désigne. La focale est retenue PAR CIBLE : changer de
 * cible rouvre sur la focale optimale de la nouvelle, un essai sur l'une ne suit pas l'autre.
 */
export function FicheSousZoom({ zoom, ...fiche }: FicheSousZoomProps) {
  const [essai, setEssai] = useState<{ readonly designation: string; readonly focaleMm: number } | null>(
    null,
  )
  const objet: ObjetCielProfond = fiche.objet
  const optimaleMm = zoom?.focaleDe(objet) ?? null
  if (zoom === null || optimaleMm === null) return <FicheCible {...fiche} />

  const focaleMm = essai?.designation === objet.designation ? essai.focaleMm : optimaleMm
  const aFocale = zoom.aFocale(focaleMm)
  const contexteFiche: ContexteFiche = aFocale?.fiche ?? fiche
  const contexteSession: ContexteSession | null = aFocale?.contexte ?? fiche.contexteSession

  return (
    <FicheCible
      {...fiche}
      {...contexteFiche}
      contexteSession={contexteSession}
      reglageZoom={(remplissage) => (
        <ReglageZoom
          zoom={zoom}
          focaleMm={focaleMm}
          optimaleMm={optimaleMm}
          remplissage={remplissage}
          sur={(f) => setEssai({ designation: objet.designation, focaleMm: f })}
        />
      )}
    />
  )
}
