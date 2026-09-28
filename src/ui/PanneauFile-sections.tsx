/**
 * Les cinq régions de l'onglet « Filé », nommées d'après ce qu'elles montrent.
 *
 * Aucune ne calcule : elles reçoivent les lectures de `useLecturesFile` et les réglages du
 * magasin de séance. Le rendu de l'image, lui, se voit dans le cadre matériel sur la scène.
 */

import { DOMAINES } from '../registry/domains.ts'
import { vignettageDiaph } from '../core/galactique.ts'
import { libelleZpSource, type PointZeroSysteme } from '../data/equipment.ts'
import type { ModeProjection } from '../core/projection.ts'
import type { ActionsScene } from './scene-etat.ts'
import {
  DUREE_APERCU_CHAMP_MIN,
  majFile,
  modeApercu,
  type ModeInterface,
  type ReglagesFile,
  type RenduFile,
} from './seance-etat.ts'
import { MENTION_PLAFOND_CHAMP, MENTION_PLAFOND_FILE } from './scene-overlay.ts'
import { Curseur } from './Curseur.tsx'
import { Interrupteur } from './Interrupteur.tsx'
import { TracedValue } from './TracedValue.tsx'
import { Etiquette } from './Terme.tsx'
import type { LecturesFile } from './panneau-file-lectures.ts'
import { Mention } from './Mention.tsx'

const S_PAR_MIN = 60
const POURCENT = 100

/** Une pose courte se lit à la dizaine de seconde près : l'arrondi à l'unité l'écraserait. */
function formatePose(tS: number): string {
  return tS < 10 ? tS.toFixed(1) : tS.toFixed(0)
}

interface CadrageProps {
  readonly lectures: LecturesFile
  readonly file: ReglagesFile
  readonly fovLDeg: number
  readonly modeObjectif: ModeProjection
  /** T-0179 — la portée de l'aperçu ne se coche plus : elle suit le mode de l'interface. */
  readonly mode: ModeInterface
  readonly actions: ActionsScene
}

/** Ce que le boîtier vise, et l'écart entre ce que la scène montre et ce que le capteur voit. */
export function CadrageDuFile({
  lectures,
  file,
  fovLDeg,
  modeObjectif,
  mode,
  actions,
}: CadrageProps) {
  return (
    <section>
      <h2>Grand champ et filé</h2>

      <p className="etat">
        {modeApercu(file) === 'FILE' ? MENTION_PLAFOND_FILE : MENTION_PLAFOND_CHAMP}
      </p>

      {/* Azimut, hauteur et rotation n'ont pas de curseur ici : le pointage se fait à la
          scène, en faisant glisser le planétarium, et la rotation se règle au panneau Vue
          ou avec Maj + glisser. Ce panneau les lit, il ne les commande pas — la visée
          courante se lit au centre de la barre basse (§11.1). */}

      {mode === 'PANORAMA' && (
        <>
          {lectures.mentionProj !== null && (
            <>
              <Mention ton="cause">{lectures.mentionProj}</Mention>
              <button type="button" onClick={() => actions.majVue({ mode: modeObjectif, fovDeg: fovLDeg })}>
                Voir comme l’objectif
              </button>
            </>
          )}
        </>
      )}
    </section>
  )
}

/**
 * §9.1 — la pose maximale n'est pas un nombre, c'est une carte par déclinaison.
 *
 * T-0142 — et cette carte EST le cadre : elle se lit dans le cadre du capteur, sur la scène,
 * pas dans une grille abstraite posée à côté de lui. Ne restent ici que les valeurs qui ne
 * dépendent d'aucune cellule — la pose retenue — et les avertissements qui portent une
 * décision.
 */
export function PoseMaximale({
  lectures,
  file,
}: {
  readonly lectures: LecturesFile
  readonly file: ReglagesFile
}) {
  const { carte } = lectures
  return (
    <section>
      <Interrupteur
        actif={file.poseDansCadre}
        surChangement={(poseDansCadre) => majFile({ poseDansCadre })}
      >
        Afficher la pose maximale dans le cadre
      </Interrupteur>
      {file.poseDansCadre && (
        <p className="etat">Le cadre est masqué tant que la grille est affichée.</p>
      )}
      <TracedValue terme="pose_max_cadre" trace={carte.tMaxCadreS} decimales={1} unite="s" />
      {carte.messages.map((message) => (
        <Mention ton="cause" key={message}>
          {message}
        </Mention>
      ))}
    </section>
  )
}

/** §9.2 — ce qu'une pose unitaire atteint, et ce qu'elle traîne quand elle est trop longue. */
export function ProfondeurDUnePose({
  lectures,
  file,
  renduFile,
  zeroSysteme,
}: {
  readonly lectures: LecturesFile
  readonly file: ReglagesFile
  readonly renduFile: RenduFile | null
  readonly zeroSysteme: PointZeroSysteme
}) {
  const { carte, trainee, poseDepassee } = lectures
  // T-0169 — le rail porte la pose max du cadre : elle décide de tout, et jusqu'ici elle ne se
  // manifestait qu'après coup, une fois dépassée. Arrondie vers le bas comme le bouton de
  // correction : une accroche qui atterrirait au-dessus du seuil ovaliserait les étoiles.
  const accroche =
    carte.poseOperanteS === null
      ? null
      : {
          valeur: Math.floor(carte.poseOperanteS),
          // Avec suivi, la limite n'est plus la rotation du ciel mais la monture : la légende
          // ne doit pas promettre des étoiles ponctuelles que la mise en station décide.
          libelle: carte.regime === 'SUIVI' ? 'max monture' : 'max étoile comme des points',
        }
  return (
    <section>
      <h3>Prévisualisation de champ</h3>
      <label>
        <span className="libelle">Pose unitaire : {file.tPoseS.toFixed(0)} s</span>
        <Curseur
          libelle="Pose unitaire"
          valeur={file.tPoseS}
          min={DOMAINES.t_pose_s.min}
          max={DOMAINES.t_pose_s.max}
          pas={DOMAINES.t_pose_s.pas}
          texte={`${file.tPoseS.toFixed(0)} s`}
          {...(accroche === null ? {} : { accroche })}
          sur={(tPoseS) => majFile({ tPoseS })}
        />
      </label>
      <TracedValue
        terme="profondeur_previsu"
        trace={lectures.profondeur}
        decimales={1}
        unite="mag"
      />
      <TracedValue terme="trainee" trace={trainee} decimales={1} unite="px" />
      {/* §7.1 — une pose s'affiche toujours avec la source de son point zéro. */}
      <Mention ton={zeroSysteme.estime ? 'cause' : 'etat'}>{libelleZpSource(zeroSysteme)}</Mention>
      {/* Le vignettage n'a plus d'interrupteur : il se centre sur le canevas et non sur le
          cadre, donc il n'est jamais incrusté. Son chiffre, lui, reste une lecture du
          matériel — et il vaut pour l'image que le capteur enregistrera (§9.2). */}
      <TracedValue
        terme="vignettage"
        suffixe="coins du cadre"
        trace={vignettageDiaph(1)}
        decimales={1}
        unite="diaph"
      />
      {poseDepassee && carte.poseOperanteS !== null && (
        <Mention ton="cause">
          Pose trop longue : étoiles étirées de {trainee.value.toFixed(1)} px. Maximum{' '}
          {carte.poseOperanteS.toFixed(0)} s.
        </Mention>
      )}
      {poseDepassee && carte.poseOperanteS !== null && (
        <button
          type="button"
          onClick={() => majFile({ tPoseS: Math.max(DOMAINES.t_pose_s.min, Math.floor(carte.poseOperanteS!)) })}
        >
          Corriger la pose à {formatePose(carte.poseOperanteS)} s
        </button>
      )}
      {renduFile !== null && renduFile.reelles === 0 && (
        <Mention ton="cause">
          Aucune étoile repère dans ce cadre : difficile à trouver sans GoTo.
        </Mention>
      )}
    </section>
  )
}

/** §9.3 — la longueur des arcs et la place du pôle : ce que la durée dessine dans le cadre. */
export function ArcsDuFile({
  lectures,
  file,
}: {
  readonly lectures: LecturesFile
  readonly file: ReglagesFile
}) {
  const { diagnostic } = lectures
  return (
    <section>
      <h3>Filé d’étoiles</h3>
      <label>
        <span className="libelle">
          <Etiquette cle="duree_file" /> : {file.dureeTotaleMin.toFixed(0)} min
        </span>
        {/* La borne basse n'est pas celle de §9.3 : le domaine ouvre le filé à 5 min, mais
            0 n'est pas un filé plus court — c'est l'aperçu de champ, l'autre bout de la même
            commande. La borne haute, elle, est bien celle que le PRD déclare. */}
        <Curseur
          libelle="Durée du filé"
          valeur={file.dureeTotaleMin}
          min={DUREE_APERCU_CHAMP_MIN}
          max={DOMAINES.duree_file_min.max}
          pas={DOMAINES.duree_file_min.pas}
          texte={`${file.dureeTotaleMin.toFixed(0)} min`}
          sur={(dureeTotaleMin) => majFile({ dureeTotaleMin })}
        />
      </label>
      <p className="etat">
        durée dessinée dans le cadre :{' '}
        {modeApercu(file) === 'FILE'
          ? `${(file.dureeTotaleMin * S_PAR_MIN).toFixed(0)} s accumulées`
          : `${file.tPoseS.toFixed(0)} s de pose unitaire`}
      </p>
      <TracedValue
        terme="longueur_arc"
        suffixe="arc le plus long du cadre"
        trace={diagnostic.longueurArcMaxDeg}
        decimales={2}
        unite="°"
      />
      <TracedValue
        terme="longueur_arc"
        suffixe="arc le plus court du cadre"
        trace={diagnostic.longueurArcMinDeg}
        decimales={2}
        unite="°"
      />
      <p className="etat">
        <Etiquette cle="pole_celeste" /> :{' '}
        {diagnostic.pole.dansCadre ? 'dans le cadre' : 'hors du cadre'} · hauteur{' '}
        {diagnostic.pole.altitudeDeg.toFixed(1)}° · azimut {diagnostic.pole.azimutDeg}° ·{' '}
        {(diagnostic.fractionHauteurCadre * POURCENT).toFixed(0)} % de la hauteur du cadre
      </p>
      {diagnostic.messages.map((message) => (
        <Mention ton="cause" key={message}>
          {message}
        </Mention>
      ))}
    </section>
  )
}

/** §9.4 — combien de photos, combien de gigaoctets, et ce qu'il faut avoir désactivé. */
export function SequenceDePrises({
  lectures,
  file,
}: {
  readonly lectures: LecturesFile
  readonly file: ReglagesFile
}) {
  const { sequence } = lectures
  return (
    <section>
      <h3>Séquence de filé</h3>
      <label>
        <span className="libelle">
          <Etiquette cle="intervalle_file" />
        </span>
        <input
          type="number"
          min={0}
          step={1}
          value={file.intervalleS}
          onChange={(e) => {
            // T-0210 — un champ vidé donne `Number('') === 0`, mais un contenu que le
            // navigateur n'a pas su lire donne `NaN`, qui se propagerait dans toute la
            // séquence. Une valeur illisible garde la précédente.
            const saisi = Number(e.target.value)
            if (Number.isFinite(saisi)) majFile({ intervalleS: Math.max(0, saisi) })
          }}
        />
      </label>

      {sequence.intervalleRefuse !== null && <Mention ton="erreur">{sequence.intervalleRefuse}</Mention>}
      <TracedValue terme="n_poses_file" trace={sequence.nPoses} decimales={0} />
      <TracedValue terme="volume_stockage" trace={sequence.volumeGo} decimales={1} unite="Go" />
      <ul>
        {sequence.consignesBloquantes.map((consigne) => (
          <li key={consigne}>{consigne}</li>
        ))}
      </ul>
      {sequence.messages.map((message) => (
        <p className="etat" key={message}>
          {message}
        </p>
      ))}
    </section>
  )
}
