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

import { useMemo, useRef, type RefObject } from 'react'
import { K } from '../registry/constants.ts'
import { semisGeneratif } from '../data/semis.ts'
import { magnitudeLimitePrevisu } from '../core/galactique.ts'
import { INDEX_VIDE, construitIndex, type IndexCiel } from '../core/index-ciel.ts'
import type { Etoile } from '../data/catalog.ts'
import {
  dureeApercuMin,
  modeApercu,
  type ModeInterface,
  type ReglagesFile,
} from './seance-etat.ts'
import type { ParametresFile } from './dessine-champ.ts'
import type { MaterielFile } from './planetarium-materiel.ts'

const S_PAR_MIN = 60

export interface EntreeParametresFile {
  readonly etoiles: readonly Etoile[]
  readonly mode: ModeInterface
  readonly file: ReglagesFile
  readonly materiel: MaterielFile | undefined
}

/**
 * L'index des étoiles réellement catalographiées sous le seuil de §9.3 : au-delà, c'est le
 * semis génératif qui garnit le champ, et il n'est construit qu'à la première passe de filé.
 *
 * T-0296 — `actif` est faux hors Panorama, et l'index n'est alors pas construit. Il l'était
 * au démarrage, dans un mode qui ne s'en sert pas : une seconde indexation du catalogue
 * entier, payée sur le fil principal pour un aperçu que personne n'avait ouvert.
 */
export function useIndexReel(etoiles: readonly Etoile[], actif: boolean): IndexCiel {
  return useMemo(
    () =>
      actif
        ? construitIndex(etoiles.filter((e) => e.magV <= K('SEUIL_MAG_ETOILES_REELLES')))
        : INDEX_VIDE,
    [etoiles, actif],
  )
}

/**
 * Les paramètres de la passe de filé, ou `null` hors Panorama. La référence est lue
 * par la boucle de rendu : c'est elle qui appelle `dessineChamp` avec la vue de l'image.
 */
export function useParametresFile(
  entree: EntreeParametresFile,
): RefObject<ParametresFile | null> {
  const { file, materiel } = entree
  const enPanorama = entree.mode === 'PANORAMA'
  const indexReel = useIndexReel(entree.etoiles, enPanorama)
  const parametres = useRef<ParametresFile | null>(null)
  const indexSemis = useRef<IndexCiel | null>(null)

  if (!enPanorama || materiel === undefined) {
    parametres.current = null
    return parametres
  }
  const apercu = modeApercu(file)
  // Le semis n'est construit qu'à la première passe : sans elle, il ne sert à rien.
  indexSemis.current ??= construitIndex(semisGeneratif())
  parametres.current = {
    indexReel,
    indexSemis: indexSemis.current,
    magLimite: magnitudeLimitePrevisu(materiel.profondeur).value,
    profondeur: materiel.profondeur,
    echApx: materiel.echApx,
    // Un filé se fait sans suivi par construction : la bascule ne vaut que pour l'aperçu
    // de champ, où une monture qui suit rend les étoiles ponctuelles.
    suiviActif: apercu === 'CHAMP' && materiel.tMaxSuiviS !== null,
    dureeS: dureeApercuMin(file) * S_PAR_MIN,
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
