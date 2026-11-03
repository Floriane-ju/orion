/**
 * Onglet « Filé » — §9.1 pose maximale, §9.2 prévisualisation, §9.3 filé, §9.4 séquence.
 * Four features share one pointing and one projector (same photograph). Lot 6: no canvas here;
 * render is seen in the matériel cadre on the scène (§3.5) with its projector — only settings
 * and their numbers remain.
 * Assembles regions only: numbers from `useLecturesFile`, each region a named component in
 * `SectionsFile.tsx`.
 */

import type { ModeProjection } from '../core/projection.ts'
import type { Site } from '../core/ephem.ts'
import { useTrancheScene, vueScene } from './scene-etat.ts'
import { fileSeance, useTrancheSeance } from './seance-etat.ts'
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
  /** §5.1 — projection imposed by objectif type, set in the matériel panel. */
  readonly modeObjectif: ModeProjection
}

export function PanneauFile(props: PanneauFileProps) {
  // Pointing is the scène's: framing here frames the §3 planétarium, and conversely.
  const vue = useTrancheScene(vueScene)
  const file = useTrancheSeance(fileSeance)
  const lectures = useLecturesFile(props, vue, file)

  return (
    <>
      {/* T-0374 — single input on top, what it prescribes below. */}
      <TempsDePriseDeVue lectures={lectures} file={file} />
      {/* Under pose max the time fits one photo: no sequence to pace; §9.4 counters would
          present a single pose as a computed budget. */}
      {lectures.plan.mode === 'FILE' && <SequenceDePrises lectures={lectures} />}
    </>
  )
}
