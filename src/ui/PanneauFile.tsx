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

import type { EntreeProfondeur } from '../core/galactique.ts'
import type { PointZeroSysteme } from '../data/equipment.ts'
import type { ModeProjection } from '../core/projection.ts'
import type { Site } from '../core/ephem.ts'
import { useScene } from './scene-etat.ts'
import { modeApercu, useSeance } from './seance-etat.ts'
import { useLecturesFile } from './panneau-file-lectures.ts'
import {
  ArcsDuFile,
  PoseMaximale,
  ProfondeurDUnePose,
  SequenceDePrises,
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
  readonly echApx: number
  readonly tailleRawMo: number
  /** Profondeur atteinte par la pose unitaire (§9.2), assemblée une fois par l'application. */
  readonly profondeur: EntreeProfondeur
  /** §7.1 — `zp_source` s'affiche partout où une pose l'est, celle du filé comprise. */
  readonly zeroSysteme: PointZeroSysteme
  /** §5.1 — la projection imposée par le type d'objectif, réglé au panneau matériel. */
  readonly modeObjectif: ModeProjection
}

export function PanneauFile(props: PanneauFileProps) {
  // Le pointage est celui de la scène : cadrer ici cadre le planétarium de §3, et l'inverse.
  const { vue } = useScene()
  const { file, renduFile } = useSeance()
  const lectures = useLecturesFile(props, vue, file)

  return (
    <>
      <PoseMaximale lectures={lectures} file={file} />
      <ProfondeurDUnePose
        lectures={lectures}
        file={file}
        renduFile={renduFile}
        zeroSysteme={props.zeroSysteme}
      />
      <ArcsDuFile lectures={lectures} file={file} />
      {/* Une durée d'accumulation nulle ne décrit qu'une photo : il n'y a pas de séquence à
          cadencer, et les compteurs de §9.4 y annonceraient zéro pose. */}
      {modeApercu(file) === 'FILE' && <SequenceDePrises lectures={lectures} file={file} />}
    </>
  )
}
