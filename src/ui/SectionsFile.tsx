/**
 * §9.1–§9.4 — Panorama tab regions, named after what they show. None computes: they receive
 * `useLecturesFile` readings + séance store settings. Image render is seen in cadre matériel.
 */

import { DOMAINES } from '../registry/domains.ts'
import {
  degres,
  dureeLisible,
  nombre,
  nombreLibre,
  pourcentage,
} from '../registry/ecriture.ts'
import { majFile, type ReglagesFile } from './seance-etat.ts'
import { Curseur } from './Curseur.tsx'
import { cranDeDuree } from './curseur-glisse.ts'
import { Interrupteur } from './Interrupteur.tsx'
import { TracedValue } from './TracedValue.tsx'
import { Etiquette } from './Terme.tsx'
import type { LecturesFile } from './panneau-file-lectures.ts'
import { Mention } from './Mention.tsx'
import { S_PAR_MIN } from '../core/unites.ts'


/**
 * §9.1, T-0374 — Panorama's only saisie: how long to photograph.
 * Rail carries cadre pose max (T-0169): below, time fits one photo with point stars; above,
 * trailing stars are the goal. Rounded down: a hook above threshold would ovalise stars.
 */
export function TempsDePriseDeVue({
  lectures,
  file,
}: {
  readonly lectures: LecturesFile
  readonly file: ReglagesFile
}) {
  const { carte, plan } = lectures
  const domaine = DOMAINES.duree_prise_vue_s
  const texte = ecritDuree(file.dureeTotaleS)
  const accroche =
    carte.poseOperanteS === null
      ? null
      : { valeur: Math.floor(carte.poseOperanteS), libelle: 'max étoiles comme des points' }
  return (
    <section>
      <h2>Temps de prise de vue</h2>
      <label>
        <span className="libelle">
          <Etiquette cle="duree_file" /> : <span className="casse-exacte">{texte}</span>
        </span>
        <Curseur
          libelle="Temps de prise de vue"
          valeur={file.dureeTotaleS}
          min={domaine.min}
          max={domaine.max}
          pas={cranDeDuree}
          echelle="log"
          texte={texte}
          {...(accroche === null ? {} : { accroche })}
          sur={(dureeTotaleS) => majFile({ dureeTotaleS })}
        />
      </label>
      {/* §9.1, T-0142 — pose max read with the rail carrying it. Its déclinaison map is read in
          sensor cadre on scène: only retained pose, map-painting toggle and decision-bearing
          warnings remain here. */}
      <TracedValue terme="pose_max_cadre" trace={carte.tMaxCadreS} decimales={1} unite="s" />
      <Interrupteur
        actif={file.poseDansCadre}
        surChangement={(poseDansCadre) => majFile({ poseDansCadre })}
      >
        Afficher la pose maximale dans le cadre
      </Interrupteur>
      {carte.messages.map((message) => (
        <Mention ton="cause" key={message}>
          {message}
        </Mention>
      ))}
      {/* Between pose max and a readable filé, stars are neither points nor arcs: they look
          blurry. Warning read at the slider where one crosses it — never for a single photo,
          whose stars are point-like by construction. */}
      {plan.mode === 'FILE' &&
        lectures.diagnostic.messages.map((message) => (
          <Mention ton="cause" key={message}>
            {message}
          </Mention>
        ))}
      {/* §9.3 — what the duration draws in cadre: read with the slider that sets it. */}
      <TracedValue
        terme="longueur_arc"
        suffixe="arc le plus long du cadre"
        trace={lectures.diagnostic.longueurArcMaxDeg}
        decimales={2}
        unite="°"
      />
      <TracedValue
        terme="longueur_arc"
        suffixe="arc le plus court du cadre"
        trace={lectures.diagnostic.longueurArcMinDeg}
        decimales={2}
        unite="°"
      />
      {/* Off cadre, hauteur and azimut say nothing of what is photographed: only used to place
          it when cadrant. */}
      <p className="etat">
        <Etiquette cle="pole_celeste" /> :{' '}
        {lectures.diagnostic.pole.dansCadre
          ? `dans le cadre · hauteur ${degres(lectures.diagnostic.pole.altitudeDeg, 1)} · ` +
            `azimut ${nombreLibre(lectures.diagnostic.pole.azimutDeg)}° · ` +
            `${pourcentage(lectures.diagnostic.fractionHauteurCadre)} de la hauteur du cadre`
          : 'hors du cadre'}
      </p>
    </section>
  )
}

/** "25 s" under a minute, "45 min" or "2 h 05" beyond: rail notches read in it. */
function ecritDuree(secondes: number): string {
  return secondes < S_PAR_MIN ? `${nombre(secondes, 0)} s` : dureeLisible(secondes)
}

/** §9.4 — how many photos, how many GB, and what must be disabled. */
export function SequenceDePrises({ lectures }: { readonly lectures: LecturesFile }) {
  const { sequence, plan } = lectures
  return (
    <section>
      <h2>Séquence de filé</h2>
      <TracedValue terme="n_poses_file" trace={sequence.nPoses} decimales={0} />
      <TracedValue terme="pose_unitaire" trace={plan.tPoseS} decimales={0} unite="s" />
      <TracedValue terme="intervalle_file" trace={plan.intervalleS} decimales={0} unite="s" />
      <TracedValue terme="volume_stockage" trace={sequence.volumeGo} decimales={1} unite="Go" />
      {sequence.consignesBloquantes.map((consigne) => (
        <Mention ton="conseil" key={consigne}>
          {consigne}
        </Mention>
      ))}
      {sequence.messages.map((message) => (
        <p className="etat" key={message}>
          {message}
        </p>
      ))}
    </section>
  )
}
