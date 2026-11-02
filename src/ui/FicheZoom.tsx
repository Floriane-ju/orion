/**
 * §6.1, §6.2 — T-0408 : sous un zoom, la fiche a sa propre bague.
 *
 * La focale réglée ici est LOCALE à la fiche : essayer 200 mm sur une galaxie ne doit pas
 * changer les cadres de la bague dans le planétarium, ni la liste, ni le plan — ils restent à
 * la focale optimale de chaque cible. Seul le cadre de la cible, peint d'une autre teinte,
 * suit l'essai. Le curseur s'ouvre sur cette focale et l'aimante : c'est la réponse à
 * « où régler la bague ? », les autres crans sont des essais. Le repère suffit à y revenir :
 * un bouton de plus redirait ce que l'aimant fait déjà.
 *
 * T-0436 — et son propre objectif : la fiche s'ouvre sur l'objectif du parc qui cadre le mieux
 * la cible, et en laisse essayer un autre, toujours sans toucher l'objectif monté. Changer
 * d'objectif rouvre sur SA focale optimale ; la bague n'existe que sur un zoom.
 *
 * La fiche ne recalcule rien : la chaîne fournit le contexte de chaque focale (`Zoom.aFocale`).
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

/** Une bague de zoom se règle au millimètre, comme `focaleOptimale` l'arrondit. */
export const PAS_FOCALE_MM = 1

interface ReglageZoomProps {
  readonly zoom: Zoom
  readonly objectif: Objectif
  readonly optimal: Objectif | null
  readonly focaleMm: number
  readonly optimaleMm: number
  /** Le remplissage de la fiche à cette focale ; `null` sans cadrage calculé. */
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
 * La fiche, à l'objectif et la focale qu'elle désigne. L'essai est retenu PAR CIBLE : changer
 * de cible rouvre sur les optimaux de la nouvelle, un essai sur l'une ne suit pas l'autre.
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
