/**
 * §9 — numbers of the Filé panel, computed apart from what shows them.
 * The four §9 features share one pointing and one projector (same photograph): this module
 * holds the chain current aim → pose map, arc diagnostic, shot sequence.
 */

import { useEffect, useMemo } from 'react'
import { axePoleDeDate, cielInstantane } from '../core/horloges.ts'
import { cartePoseMax, type CartePoseMax } from '../core/grand-champ.ts'
import { diagnosticFile, type DiagnosticFile } from '../core/file-etoiles.ts'
import {
  planPanorama,
  sequenceFile,
  type PlanPanorama,
  type SequenceFile,
} from '../core/sequence-file.ts'
import type { Site } from '../core/ephem.ts'
import { DEG, versSpherique } from '../core/mat3.ts'
import { projecteur, rayonProjete, type ModeProjection, type Vue } from '../core/projection.ts'
import type { VueScene } from './scene-etat.ts'
import { posePoseMaxCadre, type ReglagesFile } from './seance-etat.ts'
import { S_PAR_MIN } from '../core/unites.ts'

/**
 * Reference frame for diagnostics. Describes no canvas: pixel scale on which §9.3 quantifies
 * arc lengths and pole position.
 */
const LARGEUR_CADRE_PX = 1200

export interface MaterielCadre {
  readonly site: Site
  readonly focaleMm: number
  readonly ouvertureN: number
  readonly pitchUm: number
  readonly capteurLMm: number
  readonly capteurHMm: number
  readonly fovLDeg: number
  readonly fovHDeg: number
  readonly tailleRawMo: number
  readonly modeObjectif: ModeProjection
}

export interface LecturesFile {
  /** Frame centre, equatorial: what the boîtier really aims at. */
  readonly visee: { readonly longitudeDeg: number; readonly latitudeDeg: number }
  readonly carte: CartePoseMax
  /** T-0374 — single photo or filé, and the resulting pose. */
  readonly plan: PlanPanorama
  readonly diagnostic: DiagnosticFile
  readonly sequence: SequenceFile
}

export function useLecturesFile(
  materiel: MaterielCadre,
  vue: VueScene,
  file: ReglagesFile,
): LecturesFile {
  const mode = materiel.modeObjectif
  const { azimutDeg, hauteurDeg, rotationCadreDeg: rotationDeg } = vue
  const hauteurCadrePx = Math.round(
    (LARGEUR_CADRE_PX * rayonProjete(mode, (materiel.fovHDeg / 2) * DEG)) /
      rayonProjete(mode, (materiel.fovLDeg / 2) * DEG),
  )

  const ciel = useMemo(() => cielInstantane(materiel.site, new Date()), [materiel.site])
  // Arcs rotate around the pole OF THE EPOCH, not the J2000 z axis (§3.1).
  const axePoleNord = useMemo(() => axePoleDeDate(ciel.epoqueAnnee), [ciel.epoqueAnnee])

  const proj = useMemo(() => {
    const vueCadre: Vue = {
      mode,
      fovDeg: materiel.fovLDeg,
      largeurPx: LARGEUR_CADRE_PX,
      hauteurPx: hauteurCadrePx,
      azimutDeg,
      hauteurDeg,
      rotationDeg,
    }
    return projecteur(vueCadre, ciel.matrice)
  }, [mode, materiel.fovLDeg, hauteurCadrePx, azimutDeg, hauteurDeg, rotationDeg, ciel])
  const visee = useMemo(
    () => versSpherique(proj.inverse(LARGEUR_CADRE_PX / 2, hauteurCadrePx / 2)),
    [proj, hauteurCadrePx],
  )

  const carte = useMemo(
    () =>
      cartePoseMax({
        focaleMm: materiel.focaleMm,
        ouvertureN: materiel.ouvertureN,
        pitchUm: materiel.pitchUm,
        fovLDeg: materiel.fovLDeg,
        fovHDeg: materiel.fovHDeg,
        modeObjectif: mode,
        centreAdDeg: visee.longitudeDeg,
        centreDecDeg: visee.latitudeDeg,
        rotationDeg,
        // Panorama: mount assumed off; sky rotation alone bounds the pose.
        tMaxSuiviS: null,
      }),
    [materiel, visee, rotationDeg],
  )

  // Pose max computed here is the one scène and depth expect: published to the store, it
  // decides the same plan the panel reads.
  const poseMaxS = carte.poseOperanteS
  useEffect(() => posePoseMaxCadre(poseMaxS), [poseMaxS])
  const plan = planPanorama(file.dureeTotaleS, poseMaxS)

  const dureeMin = file.dureeTotaleS / S_PAR_MIN
  const diagnostic = useMemo(
    () =>
      diagnosticFile({
        projecteur: proj,
        latitudeDeg: materiel.site.latitudeDeg,
        axePoleNord,
        dureeMin,
        decMinAbsDeg: carte.decMinAbsDeg,
        decMaxAbsDeg: carte.decMaxAbsDeg,
        hauteurCadreDeg: materiel.fovHDeg,
      }),
    [proj, materiel.site.latitudeDeg, axePoleNord, materiel.fovHDeg, dureeMin, carte],
  )

  const sequence = useMemo(
    () =>
      sequenceFile({
        dureeTotaleMin: dureeMin,
        tPoseS: plan.tPoseS.value,
        intervalleS: plan.intervalleS.value,
        tailleRawMo: materiel.tailleRawMo,
      }),
    [dureeMin, plan.tPoseS.value, plan.intervalleS.value, materiel.tailleRawMo],
  )

  return {
    visee,
    carte,
    plan,
    diagnostic,
    sequence,
  }
}
