/**
 * Onglet « Filé » — §9.1 pose maximale, §9.2 prévisualisation, §9.3 filé, §9.4 séquence.
 *
 * Les quatre features partagent le même pointage et le même projecteur, parce qu'elles
 * décrivent la même photographie. Ce qui a changé au lot 6 : ce panneau n'a plus de canevas.
 * Le rendu se voit dans le cadre matériel, sur la scène (§3.5), avec le projecteur de la
 * scène — ici ne restent que les réglages et les nombres qu'ils produisent.
 *
 * Ce fichier n'assemble que les régions : les nombres viennent de `useLecturesFile`, et
 * chaque région est un composant nommé dans `SectionsFile.tsx`.
 */

import type { ModeProjection } from '../core/projection.ts'
import type { Site } from '../core/ephem.ts'
import { useScene } from './scene-etat.ts'
import { useSeance } from './seance-etat.ts'
import { useLecturesFile } from './panneau-file-lectures.ts'
import {
  SequenceDePrises,
  TempsDePriseDeVue,
} from './SectionsFile.tsx'

export interface PanneauFileProps {
  readonly site: Site
  readonly focaleMm: number
  readonly ouvertureN: number
  readonly pitchUm: number
  readonly capteurLMm: number
  readonly capteurHMm: number
  readonly fovLDeg: number
  readonly fovHDeg: number
  readonly tailleRawMo: number
  /** §5.1 — la projection imposée par le type d'objectif, réglé au panneau matériel. */
  readonly modeObjectif: ModeProjection
}

export function PanneauFile(props: PanneauFileProps) {
  // Le pointage est celui de la scène : cadrer ici cadre le planétarium de §3, et l'inverse.
  const { vue } = useScene()
  const { file } = useSeance()
  const lectures = useLecturesFile(props, vue, file)

  return (
    <>
      {/* T-0374 — une seule saisie en tête, ce qu'elle prescrit dessous. */}
      <TempsDePriseDeVue lectures={lectures} file={file} />
      {/* Sous la pose max, le temps tient en une photo : il n'y a pas de séquence à cadencer,
          et les compteurs de §9.4 y annonceraient une seule pose comme un budget calculé. */}
      {lectures.plan.mode === 'FILE' && <SequenceDePrises lectures={lectures} />}
    </>
  )
}
