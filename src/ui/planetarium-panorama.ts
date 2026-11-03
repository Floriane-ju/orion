/**
 * §9.3 — what the Panorama-mode filé pass takes from settings, published for the loop.
 * T-0116 — no image painted here. Pass drawn in the loop, per frame, with the scène projector:
 * module supplies only params from matériel and panel (frame-independent).
 * Params written DURING React render, like `Planetarium`'s loop state: loop re-reads them each
 * frame, a pan reschedules nothing. T-0117 removed the last gesture deferral.
 */

import { useRef, type RefObject } from 'react'
import { K } from '../registry/constants.ts'
import { magnitudeLimitePrevisu } from '../core/galactique.ts'
import { tacheNpfArcsec } from '../core/suivi.ts'
import { planDeSeance, type EtatSeance, type ModeInterface } from './seance-etat.ts'
import type { ParametresFile } from './dessine-champ.ts'
import type { MaterielFile } from './planetarium-materiel.ts'


export interface EntreeParametresFile {
  readonly mode: ModeInterface
  readonly seance: Pick<EtatSeance, 'file' | 'poseMaxCadreS'>
  readonly materiel: MaterielFile | undefined
}

/** Filé pass params, `null` outside Panorama. Loop reads it → `dessineChamp` with the frame vue. */
export function useParametresFile(
  entree: EntreeParametresFile,
): RefObject<ParametresFile | null> {
  const { seance, materiel } = entree
  const enPanorama = entree.mode === 'PANORAMA'
  const parametres = useRef<ParametresFile | null>(null)

  if (!enPanorama || materiel === undefined) {
    parametres.current = null
    return parametres
  }
  const plan = planDeSeance(seance)
  const apercu = plan.mode
  // T-0398 — pose unitaire joined here, where the séance is already read: app chain need not
  // recompute when pose max follows the visée.
  const profondeur = { ...materiel.profondeur, tPoseS: plan.tPoseS.value }
  // T-0398 — no catalogue or seeding here: indexes build where the pass paints (`file-index.ts`),
  // in the worker when present.
  parametres.current = {
    magLimite: magnitudeLimitePrevisu(profondeur).value,
    profondeur,
    tacheArcsec: tacheNpfArcsec(materiel.optique),
    sbSiteMag: materiel.sbCiel,
    // Panorama: mount assumed off, sky rotates in filé + champ preview whatever suivi says.
    suiviActif: false,
    // Single photo accumulates its pose, filé its sequence: both = whole shooting time (T-0374).
    dureeS: seance.file.dureeTotaleS,
    // T-0119 — two caps, two scopes. READABILITY concerns filé only (champ preview shows dots: no
    // overlap, no length to read). COST concerns both: preview at full catalogue depth = 180 000
    // stars, 160 ms/frame at full sky.
    // T-0118 still holds: neither cap depends on the gesture; they follow champ + duration
    // (move with zoom, never under a pan).
    couvertureMax: apercu === 'FILE' ? K('COUVERTURE_TRACES_MAX') : null,
    effectifMax: K('EFFECTIF_CIEL_MAX_APERCU'),
  }
  return parametres
}
