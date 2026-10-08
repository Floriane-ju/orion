/**
 * §9.3 — Ce que la passe de filé du mode Panorama tient des réglages, publié pour la boucle.
 *
 * T-0116 — il n'y a plus d'image à peindre ici. La passe se dessine dans la boucle, image par
 * image, avec le projecteur de la scène : ce module ne fournit plus que la part des paramètres
 * qui vient du matériel et du panneau, et qui ne dépend donc d'aucune image en particulier.
 *
 * Les paramètres s'écrivent PENDANT le rendu React, comme l'état de boucle de `Planetarium` :
 * la boucle les relit à chaque image, et un panoramique n'a donc rien à replanifier. T-0117 a
 * retiré le dernier report de geste : plus de signature à surveiller, plus d'attente à annoncer.
 */

import { useRef, type RefObject } from 'react'
import { K } from '../registry/constants.ts'
import { magnitudeLimitePrevisu } from '../core/galactique.ts'
import { planDeSeance, type EtatSeance, type ModeInterface } from './seance-etat.ts'
import type { ParametresFile } from './dessine-champ.ts'
import type { MaterielFile } from './planetarium-materiel.ts'


export interface EntreeParametresFile {
  readonly mode: ModeInterface
  readonly seance: Pick<EtatSeance, 'file' | 'poseMaxCadreS'>
  readonly materiel: MaterielFile | undefined
}

/**
 * Les paramètres de la passe de filé, ou `null` hors Panorama. La référence est lue
 * par la boucle de rendu : c'est elle qui appelle `dessineChamp` avec la vue de l'image.
 */
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
  // T-0398 — la pose unitaire se joint ici, où la séance se lit déjà : la chaîne de
  // l'application n'a plus à se recalculer quand la pose max suit la visée.
  const profondeur = { ...materiel.profondeur, tPoseS: plan.tPoseS.value }
  // T-0398 — ni catalogue ni semis ici : les index se construisent là où la passe peint
  // (`file-index.ts`), dans le worker quand il existe.
  parametres.current = {
    magLimite: magnitudeLimitePrevisu(profondeur).value,
    profondeur,
    echApx: materiel.echApx,
    sbSiteMag: materiel.sbCiel,
    // En panorama, la monture est réputée coupée : le ciel tourne, dans le filé comme dans
    // l'aperçu de champ, quel que soit le suivi déclaré au matériel.
    suiviActif: false,
    // Une photo unique accumule sa pose, un filé sa séquence : dans les deux cas, le temps de
    // prise de vue entier (T-0374).
    dureeS: seance.file.dureeTotaleS,
    // T-0119 — deux plafonds, deux portées. La LISIBILITÉ ne concerne que le filé : l'aperçu de
    // champ montre des points, qui ne se recouvrent pas et dont aucune longueur ne se lit. Le
    // COÛT concerne les deux : l'aperçu de champ lisait le catalogue à pleine profondeur, soit
    // cent quatre-vingt mille étoiles et 160 ms par image au plein ciel.
    //
    // Ce que T-0118 exigeait tient dans les deux cas : aucun des deux plafonds ne dépend du
    // geste. Ils suivent le champ et la durée, donc ils bougent au zoom comme le champ lui-même,
    // jamais sous un panoramique.
    couvertureMax: apercu === 'FILE' ? K('COUVERTURE_TRACES_MAX') : null,
    effectifMax: K('EFFECTIF_CIEL_MAX_APERCU'),
  }
  return parametres
}
