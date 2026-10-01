/**
 * §9.1–§9.4 — les régions de l'onglet Panorama, nommées d'après ce qu'elles montrent.
 *
 * Aucune ne calcule : elles reçoivent les lectures de `useLecturesFile` et les réglages du
 * magasin de séance. Le rendu de l'image, lui, se voit dans le cadre matériel sur la scène.
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
 * §9.1, T-0374 — la seule saisie du Panorama : combien de temps on photographie.
 *
 * Le rail porte la pose max du cadre (T-0169) : en deçà, le temps tient en une photo à
 * étoiles ponctuelles ; au-delà, des étoiles qui filent sont le but. Arrondie vers le bas :
 * une accroche au-dessus du seuil ovaliserait les étoiles de la photo unique.
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
      {/* §9.1, T-0142 — la pose max se lit avec le rail qui la porte. Sa carte par déclinaison
          se lit dans le cadre du capteur, sur la scène : ne restent ici que la pose retenue,
          la bascule qui peint la carte et les avertissements qui portent une décision. */}
      <TracedValue terme="pose_max_cadre" trace={carte.tMaxCadreS} decimales={1} unite="s" />
      <Interrupteur
        actif={file.poseDansCadre}
        surChangement={(poseDansCadre) => majFile({ poseDansCadre })}
      >
        Afficher la pose maximale dans le cadre
      </Interrupteur>
      {file.poseDansCadre && (
        <p className="etat">Le cadre est masqué tant que la grille est affichée.</p>
      )}
      {carte.messages.map((message) => (
        <Mention ton="cause" key={message}>
          {message}
        </Mention>
      ))}
      <p className="etat">
        {plan.mode === 'CHAMP'
          ? `Une photo de ${texte} : étoiles ponctuelles.`
          : 'Au-delà de la pose max : filé d’étoiles, en une séquence de poses.'}
      </p>
      {/* Entre la pose max et un filé lisible, les étoiles ne sont ni des points ni des arcs :
          elles paraissent floues. L'avertissement se lit au curseur, là où on le franchit — et
          jamais pour une photo unique, dont les étoiles sont ponctuelles par construction. */}
      {plan.mode === 'FILE' &&
        lectures.diagnostic.messages.map((message) => (
          <Mention ton="cause" key={message}>
            {message}
          </Mention>
        ))}
      {/* §9.3 — ce que la durée dessine dans le cadre : elle se lit avec le curseur qui la règle. */}
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
      {/* Hors du cadre, sa hauteur et son azimut ne disent rien de ce qu'on photographie : ils
          ne servent qu'à le placer quand on le cadre. */}
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

/** « 25 s » sous la minute, « 45 min » ou « 2 h 05 » au-delà : les crans du rail s'y lisent. */
function ecritDuree(secondes: number): string {
  return secondes < S_PAR_MIN ? `${nombre(secondes, 0)} s` : dureeLisible(secondes)
}

/** §9.4 — combien de photos, combien de gigaoctets, et ce qu'il faut avoir désactivé. */
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
