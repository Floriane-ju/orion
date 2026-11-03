/**
 * §6.2, §7.1–§7.3 — fiche « Photographie » card: what decides cadre, what's set, séance cost.
 * T-0381 — ease first, then taille dans le cadre and inclination.
 * T-0385 — « Pose » and « Combien de photos » merge in: pose unitaire, target quality, image count,
 * integration, storage, nights, with their warnings. Rest of those regions (flux, masse d'air,
 * meridian floor) decided nothing at shooting time: in expandable traces.
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
  /** §7.1 — `zp_source` accompanies every displayed pose. */
  readonly zeroSysteme: PointZeroSysteme
  /** §7.2 — permissif C-03 mode: requested, never deduced. */
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
        {/* No note, no pastille: five empties would read « impossible ». */}
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
      {/* Near-round cible, or unknown orientation: no angle to advise. */}
      {cadrage !== null && cadrage.angleBoitierDeg !== null && (
        <Lecture libelle="Inclinaison objet" valeur={degres(cadrage.angleBoitierDeg)} />
      )}
      {/* Same ΔSB_lune as plan, weighted by type tolerance (§6.3). */}
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

/** §7.1, §7.2 — pose unitaire and what bounds it. */
function Pose({ r, zeroSysteme, permissif, surPermissif }: PhotographieProps) {
  // No détectabilité data → no priceable pose: zero point and fond de ciel say nothing of cible.
  if (r.detect.verdict === null) return null
  const pose = r.pose
  if (pose === null) {
    return <Mention ton="cause">Pose non calculable : données manquantes pour cette cible.</Mention>
  }
  return (
    <>
      {/* RETAINED pose not optimum: monture-capped, t_opt announces a pose suivi can't hold. */}
      <TracedValue terme="pose_unitaire" trace={pose.tRecommandeS} decimales={1} unite="s" />
      {/* T-0383 — short pose despite suivi reads as an oversight: card says the cause. */}
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

/** §7.3 — integration required for target quality, in poses, duration, gigabytes. */
function Integration({ r, s, snrCible, surSnr }: PhotographieProps) {
  const integration = r.integration
  if (integration === null) {
    // T-0268 — cible écartée from créneau: cause goes BEFORE any extinction refusal (a refusal is
    // read: silencing it would suggest calc wasn't requested).
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
      {/* T-0282 — plan may allot only part of integration, at its own quality: quality chosen here
          doesn't rewrite it, so card says what plan foresees. */}
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
