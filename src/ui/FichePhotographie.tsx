/**
 * §6.2, §7.1–§7.3 — la carte « Photographie » de la fiche : ce qui décide du cadre, ce qu'on
 * règle et ce que la séance coûte.
 *
 * T-0381 — la facilité en tête, puis la taille dans le cadre et l'inclinaison.
 * T-0385 — les régions « Pose » et « Combien de photos » s'y fondent : pose unitaire, qualité
 * visée, nombre d'images, intégration, stockage et nuits se lisent ensemble, et leurs
 * avertissements avec eux. Le reste de ces régions (flux, masse d'air, plancher au méridien)
 * ne décidait rien au moment de déclencher, et vit dans les traces dépliables.
 */

import { dureeLisible, degres, pourcentage } from '../registry/ecriture.ts'
import { LIBELLE_DEGRADATION_LUNE, LIBELLE_VERDICT_CADRAGE } from '../registry/libelles.ts'
import { PRESETS_SNR } from '../registry/verdicts.ts'
import { libelleZpSource, type PointZeroSysteme } from '../data/equipment.ts'
import { degradationLune } from '../core/session-score.ts'
import type { EtatCible } from '../core/cibles-liste.ts'
import { Lecture } from './ChampsCible.tsx'
import { Icone } from './Icone.tsx'
import { Interrupteur } from './Interrupteur.tsx'
import { Mention } from './Mention.tsx'
import { Pastilles } from './Pastilles.tsx'
import { Etiquette } from './Terme.tsx'
import { TracedValue } from './TracedValue.tsx'
import type { Resultat } from './fiche-cible-calcul.ts'
import type { SyntheseFiche } from './fiche-synthese.ts'

const NON_CHIFFRE = '—'

export interface PhotographieProps {
  readonly r: Resultat
  readonly s: SyntheseFiche
  readonly facilite: EtatCible | null
  readonly snrCible: number
  readonly surSnr: (valeur: number) => void
  /** §7.1 — `zp_source` accompagne toute pose affichée. */
  readonly zeroSysteme: PointZeroSysteme
  /** §7.2 — mode permissif C-03 : demandé, jamais déduit. */
  readonly permissif: boolean
  readonly surPermissif: (valeur: boolean) => void
}

export function Photographie(props: PhotographieProps) {
  const { r, facilite } = props
  const cadrage = r.cadrage
  return (
    <section>
      <div className="fiche-tete">
        <p className="fiche-tete-titre">
          <Icone nom="photo_camera" />
          {facilite === null ? 'Photographie' : `Photographie ${facilite.libelle}`}
        </p>
        {/* Sans note, aucune pastille : cinq vides se liraient « impossible ». */}
        {facilite !== null && (
          <Pastilles note={facilite.note} libelle={facilite.libelle} cause={facilite.cause} />
        )}
      </div>
      {cadrage !== null && (
        <Lecture
          libelle="Taille dans le cadre"
          valeur={`${pourcentage(cadrage.remplissage.value)} — ${LIBELLE_VERDICT_CADRAGE[cadrage.verdict]}`}
        />
      )}
      {/* Une cible presque ronde, ou d'orientation inconnue, n'a pas d'angle à conseiller. */}
      {cadrage !== null && cadrage.angleBoitierDeg !== null && (
        <Lecture libelle="Inclinaison objet" valeur={degres(cadrage.angleBoitierDeg)} />
      )}
      {/* La même ΔSB_lune que le plan, pesée par la tolérance du type (§6.3). */}
      <Lecture
        libelle="Dégradation lunaire"
        valeur={
          r.lune.evaluee
            ? LIBELLE_DEGRADATION_LUNE[degradationLune(r.lune.ciel.delta.value, r.detect.toleranceLune)]
            : NON_CHIFFRE
        }
      />
      <Pose {...props} />
      <Integration {...props} />
    </section>
  )
}

/** §7.1, §7.2 — la pose unitaire et ce qui la borne. */
function Pose({ r, zeroSysteme, permissif, surPermissif }: PhotographieProps) {
  // Sans donnée de détectabilité, aucune pose n'est chiffrable : le point zéro et le fond de
  // ciel du setup ne diraient rien de cette cible-là.
  if (r.detect.verdict === null) return null
  const pose = r.pose
  if (pose === null) {
    return <Mention ton="cause">Pose non calculable : données manquantes pour cette cible.</Mention>
  }
  return (
    <>
      {/* La pose RETENUE, pas l'optimum : bridée par la monture, t_opt annoncerait une pose
          que le suivi ne tient pas. */}
      <TracedValue terme="pose_unitaire" trace={pose.tRecommandeS} decimales={1} unite="s" />
      {/* T-0383 — une pose courte malgré le suivi se lit comme un oubli : la carte en dit la cause. */}
      {pose.limiteeParCiel && <Mention ton="conseil">{pose.message}</Mention>}
      {pose.regime !== 'NOMINAL' && <Mention ton="cause">{pose.message}</Mention>}
      <Mention ton={zeroSysteme.estime ? 'cause' : 'etat'}>{libelleZpSource(zeroSysteme)}</Mention>
      {zeroSysteme.note !== undefined && <Mention ton="cause">{zeroSysteme.note}</Mention>}
      {pose.readNoiseEstime && (
        <Mention ton="cause">
          [ESTIMÉ] Bruit de lecture inconnu : {pose.readNoiseUtiliseE} e⁻ par défaut.
        </Mention>
      )}
      <Interrupteur actif={permissif} surChangement={surPermissif}>
        <Etiquette cle="mode_permissif" /> — ciel pollué, suivi imprécis, vent
      </Interrupteur>
      {pose.notePermissif !== undefined && <Mention ton="cause">{pose.notePermissif}</Mention>}
    </>
  )
}

/** §7.3 — l'intégration requise pour la qualité visée, en poses, en durée, en gigaoctets. */
function Integration({ r, s, snrCible, surSnr }: PhotographieProps) {
  const integration = r.integration
  if (integration === null) {
    // T-0268 — cible écartée du créneau : sa cause passe AVANT tout refus d'extinction. Un
    // refus se lit : le taire laisserait croire que le calcul n'a pas été demandé.
    const refus = r.exclusionCreneau ?? r.extinction?.attenuation.note
    return refus === undefined ? null : <Mention ton="cause">{refus}</Mention>
  }
  return (
    <>
      <label>
        <span className="libelle">
          <Etiquette cle="snr_cible" />
        </span>
        <select value={snrCible} onChange={(e) => surSnr(Number(e.target.value))}>
          {PRESETS_SNR.map((p) => (
            <option key={p.cle} value={p.valeur}>
              {p.libelle} — {p.valeur}
            </option>
          ))}
        </select>
      </label>
      <Lecture libelle="Images" valeur={String(integration.nPoses.value)} />
      {/* T-0282 — le plan peut n'allouer qu'une part de l'intégration, à sa propre qualité :
          la qualité choisie ici ne le réécrit pas, la carte dit donc ce qu'il prévoit. */}
      {s.auPlan && s.nPoses !== null && s.nPoses !== integration.nPoses.value && (
        <Mention ton="etat">Le plan de la nuit en prévoit {s.nPoses}.</Mention>
      )}
      <TracedValue terme="integration_totale" trace={integration.tRequisS} decimales={0} unite="s" />
      <p className="etat">soit {dureeLisible(integration.tRequisS.value)}</p>
      <TracedValue terme="volume_stockage" trace={integration.volumeGo} decimales={1} unite="Go" />
      {integration.nNuits !== undefined && (
        <TracedValue terme="nombre_nuits" trace={integration.nNuits} decimales={0} unite="nuits" />
      )}
      {integration.messages.map((m) => (
        <Mention key={m} ton={integration.horsDePortee ? 'cause' : 'etat'}>
          {m}
        </Mention>
      ))}
    </>
  )
}
