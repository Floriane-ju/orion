/**
 * §9 — Les nombres du panneau Filé, calculés à part de ce qui les affiche.
 *
 * Les quatre features de §9 partagent le même pointage et le même projecteur, parce qu'elles
 * décrivent la même photographie. Ce module tient cette chaîne : de la visée courante à la
 * carte de pose, au diagnostic des arcs et à la séquence de prises de vue.
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
 * Définition de référence du cadre pour les diagnostics. Elle ne décrit aucun canevas :
 * c'est l'échelle en pixels sur laquelle §9.3 chiffre longueurs d'arcs et position du pôle.
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
  /** Centre du cadre en coordonnées équatoriales : ce que le boîtier vise vraiment. */
  readonly visee: { readonly longitudeDeg: number; readonly latitudeDeg: number }
  readonly carte: CartePoseMax
  /** T-0374 — photo unique ou filé, et la pose qui en découle. */
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
  // Les arcs tournent autour du pôle DE L'ÉPOQUE, pas de l'axe z du repère J2000 (§3.1).
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
        // En panorama, la monture est réputée coupée : la rotation du ciel seule borne la pose.
        tMaxSuiviS: null,
      }),
    [materiel, visee, rotationDeg],
  )

  // La pose max calculée ici est celle que la scène et la profondeur attendent : publiée au
  // magasin, elle y décide du même plan que celui lu au panneau.
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
