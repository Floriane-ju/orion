/**
 * §6.1, §6.2 — T-0408: under a zoom, fiche has its own ring.
 * Focale set here is LOCAL to fiche: trying 200 mm on a galaxy must not change planétarium ring
 * cadres, list, nor plan — they stay at each cible's optimal focale. Only cible cadre (other
 * teinte) follows the trial. Slider opens on that focale and magnets it: answer to « where to set
 * the ring? », other crans are trials. Marker suffices to return: another button would restate
 * what magnet does.
 * T-0436 — own objectif too: fiche opens on parc objectif best framing cible, lets try another,
 * never touching mounted objectif. Changing objectif reopens on ITS optimal focale; ring exists
 * only on a zoom.
 * Fiche recomputes nothing: chain supplies each focale's context (`Zoom.aFocale`).
 */

import { nombre, pourcentage } from '../registry/ecriture.ts'
import type { ContexteSession } from '../core/session-types.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { ContexteFiche } from './fiche-cible-calcul.ts'
import type { Objectif } from '../core/objectif.ts'
import { estZoom } from '../core/objectif.ts'
import { ChampChoix } from './ChampChoix.tsx'
import { Curseur } from './Curseur.tsx'
import { FicheCible, type FicheCibleProps } from './FicheCible.tsx'
import { Lecture } from './ChampsCible.tsx'
import { choixFiche, focaleSous, type Zoom } from './zoom-calcul.ts'
import { essaieFocale, essaiZoomSeance, useTrancheSeance } from './seance-etat.ts'

/** A zoom ring is set to the mm, as `focaleOptimale` rounds. */
export const PAS_FOCALE_MM = 1

interface ReglageZoomProps {
  readonly zoom: Zoom
  readonly objectif: Objectif
  readonly optimal: Objectif | null
  readonly focaleMm: number
  readonly optimaleMm: number
  /** Fiche fill at this focale; `null` without computed cadrage. */
  readonly remplissage: number | null
  readonly surObjectif: (objectif: Objectif) => void
  readonly sur: (focaleMm: number) => void
}

function ReglageZoom({ zoom, objectif, optimal, focaleMm, optimaleMm, remplissage, surObjectif, sur }: ReglageZoomProps) {
  const texte = `${nombre(focaleMm, 0)} mm`
  const parId = (id: string) => zoom.parc.find((o) => o.id === id)
  return (
    <section>
      <h2>{zoom.parc.length > 1 ? 'Optique' : 'Zoom'}</h2>
      {zoom.parc.length > 1 && (
        <div className="champs">
          <ChampChoix
            cle="objectif_cible"
            valeur={objectif.id}
            surChangement={(id) => {
              const choisi = parId(id)
              if (choisi !== undefined) surObjectif(choisi)
            }}
          >
            {zoom.parc.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id === optimal?.id ? `${o.nom} (optimal)` : o.nom}
              </option>
            ))}
          </ChampChoix>
        </div>
      )}
      <Lecture
        libelle={texte}
        valeur={remplissage === null ? '—' : `${pourcentage(remplissage)} du cadre`}
      />
      {estZoom(objectif) && (
        <Curseur
          libelle={`Focale du ${objectif.nom}`}
          valeur={focaleMm}
          min={objectif.focaleMinMm}
          max={objectif.focaleMaxMm}
          pas={PAS_FOCALE_MM}
          texte={texte}
          accroche={{ valeur: optimaleMm, libelle: 'optimale' }}
          sur={sur}
        />
      )}
    </section>
  )
}

export interface FicheSousZoomProps extends FicheCibleProps {
  readonly zoom: Zoom | null
}

/**
 * Fiche at objectif and focale it designates. Trial kept PER CIBLE: changing cible reopens on the
 * new one's optima; trial doesn't follow.
 */
export function FicheSousZoom({ zoom, ...fiche }: FicheSousZoomProps) {
  const essai = useTrancheSeance(essaiZoomSeance)
  const objet: ObjetCielProfond = fiche.objet
  const optimal = zoom?.choixDe(objet) ?? null
  const choix = zoom === null ? null : choixFiche(zoom, objet, essai)
  if (zoom === null || choix === null) return <FicheCible {...fiche} />

  const { objectif, focaleMm } = choix
  const optimaleMm = focaleSous(objectif, objet, fiche.capteurHMm)
  const aFocale = zoom.aFocale(objectif, focaleMm)
  const contexteFiche: ContexteFiche = aFocale?.fiche ?? fiche
  const contexteSession: ContexteSession | null = aFocale?.contexte ?? fiche.contexteSession
  const essaie = (o: Objectif, f: number) =>
    essaieFocale({ designation: objet.designation, objectifId: o.id, focaleMm: f })

  return (
    <FicheCible
      {...fiche}
      {...contexteFiche}
      contexteSession={contexteSession}
      reglageZoom={(remplissage) => (
        <ReglageZoom
          zoom={zoom}
          objectif={objectif}
          optimal={optimal?.objectif ?? null}
          focaleMm={focaleMm}
          optimaleMm={optimaleMm}
          remplissage={remplissage}
          surObjectif={(o) => essaie(o, focaleSous(o, objet, fiche.capteurHMm))}
          sur={(f) => essaie(objectif, f)}
        />
      )}
    />
  )
}
