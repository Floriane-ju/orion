/**
 * §6.1, §6.2 — T-0408 : sous un zoom, la fiche a sa propre bague.
 *
 * La focale réglée ici est LOCALE à la fiche : essayer 200 mm sur une galaxie ne doit pas
 * changer le cadre du planétarium, ni la liste, ni le plan — ils restent à la focale optimale
 * de chaque cible. Le curseur s'ouvre sur cette focale et l'aimante : c'est la réponse à
 * « où régler la bague ? », les autres crans sont des essais.
 *
 * La fiche ne recalcule rien : la chaîne fournit le contexte de chaque focale (`Zoom.aFocale`).
 */

import { useState } from 'react'
import { K } from '../registry/constants.ts'
import { nombre, pourcentage } from '../registry/ecriture.ts'
import type { ContexteSession } from '../core/session-types.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { ContexteFiche } from './fiche-cible-calcul.ts'
import { Curseur } from './Curseur.tsx'
import { FicheCible, type FicheCibleProps } from './FicheCible.tsx'
import { Icone } from './Icone.tsx'
import type { Zoom } from './zoom-calcul.ts'

/** Une bague de zoom se règle au millimètre, comme `focaleOptimale` l'arrondit. */
const PAS_FOCALE_MM = 1

interface ReglageZoomProps {
  readonly zoom: Zoom
  readonly focaleMm: number
  readonly optimaleMm: number
  readonly sur: (focaleMm: number) => void
}

function ReglageZoom({ zoom, focaleMm, optimaleMm, sur }: ReglageZoomProps) {
  const texte = `${nombre(focaleMm, 0)} mm`
  return (
    <section>
      <h2>Zoom</h2>
      <label>
        <span className="libelle">
          {zoom.objectif.nom} : <span className="casse-exacte">{texte}</span>
        </span>
        <Curseur
          libelle={`Focale du ${zoom.objectif.nom}`}
          valeur={focaleMm}
          min={zoom.objectif.focaleMinMm}
          max={zoom.objectif.focaleMaxMm}
          pas={PAS_FOCALE_MM}
          texte={texte}
          accroche={{
            valeur: optimaleMm,
            libelle: `optimale, ${pourcentage(K('REMPLISSAGE_ZOOM_OPTIMAL'))} du cadre`,
          }}
          sur={sur}
        />
      </label>
      {focaleMm !== optimaleMm && (
        <button type="button" onClick={() => sur(optimaleMm)}>
          <Icone nom="center_focus_strong" />
          Revenir à la focale optimale ({nombre(optimaleMm, 0)} mm)
        </button>
      )}
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
      reglageZoom={
        <ReglageZoom
          zoom={zoom}
          focaleMm={focaleMm}
          optimaleMm={optimaleMm}
          sur={(f) => setEssai({ designation: objet.designation, focaleMm: f })}
        />
      }
    />
  )
}
