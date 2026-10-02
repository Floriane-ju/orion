/**
 * Ce que la chaîne de calcul répond, région par région : §6.3 détectabilité, §7 pose et
 * intégration, §10.2 explication dépliable.
 *
 * T-0381 — la région « Cadrage de la cible » (§6.2) est partie : la carte « Photographie »
 * de la fiche en résume la taille dans le cadre et l'inclinaison.
 *
 * Aucune de ces régions ne calcule quoi que ce soit : elles lisent le `Resultat` produit par
 * `fiche-cible-calcul.ts`, et chaque nombre reste dépliable jusqu'à sa formule.
 *
 * T-0228 — les deux renvois d'amont que ces régions portaient — seuils de contraste, familles
 * de filtres — sont dans le tiroir « info ». Ils ne bougeaient pas d'une cible à l'autre et
 * n'arbitraient rien, là où tout le reste de la fiche répond à la cible du moment. La source
 * d'une CONSTANTE reste au contact, dépliée sous sa valeur : c'est §10.2, pas une bibliographie.
 */

import { degres, dureeLisible, nombre, nombreLibre } from '../registry/ecriture.ts'
import { PRESETS_SNR } from '../registry/verdicts.ts'
import { libelleZpSource, type PointZeroSysteme } from '../data/equipment.ts'
import { MANQUANTE } from './ChampsCible.tsx'
import { Interrupteur } from './Interrupteur.tsx'
import { TracedValue } from './TracedValue.tsx'
import { Etiquette } from './Terme.tsx'
import { heure } from './horaire.ts'
import type { Conseils, Resultat } from './fiche-cible-calcul.ts'
import type { CreneauFiche } from './fiche-cible-creneau.ts'
import { Mention } from './Mention.tsx'
import {
  LIBELLE_REGIME_POSE,
  LIBELLE_TOLERANCE_LUNE,
  LIBELLE_VERDICT_DETECTABILITE,
  libelleEntree,
} from '../registry/libelles.ts'

export interface VerdictsProps {
  readonly r: Resultat
  /** T-0222 — le créneau photo de la nuit, celui du plan de séance. */
  readonly creneau: CreneauFiche
  readonly snrCible: number
  readonly surSnr: (valeur: number) => void
  /** §7.1 — `zp_source` accompagne toute pose affichée. */
  readonly zeroSysteme: PointZeroSysteme
  readonly conseils: Conseils | null
  /** §7.2 — mode permissif C-03 : demandé, jamais déduit. */
  readonly permissif: boolean
  readonly surPermissif: (valeur: boolean) => void
  readonly filtreDualBand: boolean
  readonly surFiltre: (valeur: boolean) => void
  readonly explicationDepliee: boolean
  readonly surDeplie: (valeur: boolean) => void
}

export function Verdicts(props: VerdictsProps) {
  const { r } = props
  return (
    <>
      <Detectabilite r={r} creneau={props.creneau} />
      {/* Sans donnée de détectabilité, aucune pose n'est chiffrable : la région n'aurait plus
          que le point zéro du boîtier et le fond de ciel à montrer, deux grandeurs du setup
          qui ne disent rien de cette cible-là. */}
      {r.detect.verdict !== null && (
        <PoseUnitaire
          r={r}
          zeroSysteme={props.zeroSysteme}
          permissif={props.permissif}
          surPermissif={props.surPermissif}
        />
      )}
      <CombienDePhotos r={r} snrCible={props.snrCible} surSnr={props.surSnr} />
      <PourquoiCeVerdict
        r={r}
        conseils={props.conseils}
        filtreDualBand={props.filtreDualBand}
        surFiltre={props.surFiltre}
        explicationDepliee={props.explicationDepliee}
        surDeplie={props.surDeplie}
      />
    </>
  )
}

/**
 * §8.1 — sous quel ciel la cible est évaluée, et à quel instant. T-0089 posait la question,
 * T-0268 la ferme : l'instant est celui du plan de séance — le milieu du créneau — et il est
 * nommé. La phrase datait auparavant un état que la scène contredisait, « Lune à 12:47 »
 * pendant qu'on préparait une nuit d'août.
 */
function CielSousLaLune({
  r,
  creneau,
}: {
  readonly r: Resultat
  readonly creneau: CreneauFiche
}) {
  if (!r.lune.evaluee) return <Mention ton="cause">{r.lune.cause}</Mention>
  // Cible écartée du créneau : `instantLune` retombe sur le début de la fenêtre nocturne. La
  // phrase le dit plutôt que d'annoncer le milieu d'un créneau qui n'existe pas.
  const dansLeCreneau = creneau.chiffre && creneau.creneau.creneaux.length > 0
  return (
    <>
      <p className="etat">
        Lune évaluée à {heure(r.lune.instant)},{' '}
        {dansLeCreneau ? 'au milieu du créneau' : 'au début de la nuit'}.
      </p>
      <TracedValue terme="degradation_lunaire" trace={r.lune.ciel.delta} unite="mag/arcsec²" />
    </>
  )
}

/**
 * §8.2, T-0222 — quand déclencher : début et fin du créneau photo de la nuit. Un créneau GEM
 * s'affiche en deux lignes, parce que la séquence s'arrête vraiment au méridien. Le verdict
 * dit si la cible se voit ; sans l'heure, on ne sait pas encore quand la photographier.
 */
function CreneauPhoto({ creneau }: { readonly creneau: CreneauFiche }) {
  if (!creneau.chiffre) return <Mention ton="cause">{creneau.cause}</Mention>
  const c = creneau.creneau
  if (c.causeExclusion !== undefined || c.creneaux.length === 0) {
    return <Mention ton="cause">{c.message}</Mention>
  }
  return (
    <>
      {c.creneaux.map((sous) => (
        <p className="etat" key={sous.debut.getTime()}>
          <Etiquette cle="creneau" /> : de {heure(sous.debut)} à {heure(sous.fin)}
          {sous.apresRetournement ? ', après le retournement' : ''}
        </p>
      ))}
      {c.heureCulmination !== null && (
        <p className="etat">Culmination à {heure(c.heureCulmination)}, au plus haut de la nuit.</p>
      )}
      <Mention ton="etat">{c.message}</Mention>
    </>
  )
}

/** §6.3 — ce qui verra la cible : l'œil, des jumelles, un télescope, ou la photo seule. */
function Detectabilite({
  r,
  creneau,
}: {
  readonly r: Resultat
  readonly creneau: CreneauFiche
}) {
  // Verdict nul = magnitude ou dimensions absentes du catalogue. Tout ce que la région
  // porterait alors — brillance de surface, contraste, magnitude limite — vaut lui aussi
  // « donnée manquante », et quatre fois la même absence n'en apprend pas plus qu'une. La
  // région se nomme une fois vide, comme les dimensions de la carte qui décrit la cible.
  if (r.detect.verdict === null) {
    return (
      <section>
        <h2>Détectabilité</h2>
        <p className="etat">{MANQUANTE}</p>
        <CreneauPhoto creneau={creneau} />
      </section>
    )
  }

  return (
    <section>
      <h2>Détectabilité</h2>
      <p className="etat">verdict : {LIBELLE_VERDICT_DETECTABILITE[r.detect.verdict]}</p>
      <CreneauPhoto creneau={creneau} />
      <CielSousLaLune r={r} creneau={creneau} />
      <TracedValue terme="brillance_surface" trace={r.detect.sbObj} unite="mag/arcsec²" />
      <TracedValue terme="contraste_ciel" trace={r.detect.deltaSb} unite="mag/arcsec²" />
      <TracedValue terme="magnitude_limite_instrument" trace={r.detect.mLimInstr} unite="mag" />
      <p>{r.detect.explication}</p>
      <p className="etat">
        <Etiquette cle="tolerance_lune" /> : {LIBELLE_TOLERANCE_LUNE[r.detect.toleranceLune]} — {r.detect.conseilType}
      </p>
      {r.detect.noteLune !== undefined && <p className="etat">{r.detect.noteLune}</p>}
    </section>
  )
}

/** §7.1 et §7.2 — combien de temps dure une photo, et pourquoi pas davantage. */
function PoseUnitaire({
  r,
  zeroSysteme,
  permissif,
  surPermissif,
}: {
  readonly r: Resultat
  readonly zeroSysteme: PointZeroSysteme
  readonly permissif: boolean
  readonly surPermissif: (valeur: boolean) => void
}) {
  return (
    <section>
      <h2>Pose</h2>
      {/* §7.1 — zp_source doit être affiché partout où une pose l'est. */}
      <Mention ton={zeroSysteme.estime ? 'cause' : 'etat'}>{libelleZpSource(zeroSysteme)}</Mention>
      {zeroSysteme.note !== undefined && <Mention ton="cause">{zeroSysteme.note}</Mention>}
      <TracedValue terme="flux_ciel" trace={r.eCiel} unite="e⁻/s/px" />
      {r.eObj !== null && <TracedValue terme="flux_objet" trace={r.eObj} decimales={3} unite="e⁻/s/px" />}
      {r.pose === null && (
        <Mention ton="cause">
          Pose non calculable : données manquantes pour cette cible.
        </Mention>
      )}
      {r.pose !== null && (
        <>
          <TracedValue terme="pose_unitaire" trace={r.pose.tOptS} decimales={1} unite="s" />
          <p className="etat">
            <Etiquette cle="plage_utile" /> : poser {nombreLibre(r.pose.tAfficheeS)} s — de{' '}
            {nombreLibre(r.pose.plageUtileS.value[0])} à {nombreLibre(r.pose.plageUtileS.value[1])} s, même résultat.
          </p>
          <p className="etat">
            <Etiquette cle="regime_pose" /> : {LIBELLE_REGIME_POSE[r.pose.regime]}
          </p>
          <Mention ton={r.pose.regime === 'NOMINAL' ? 'etat' : 'cause'}>{r.pose.message}</Mention>
          {r.pose.readNoiseEstime && (
            <Mention ton="cause">
              [ESTIMÉ] Bruit de lecture inconnu : {r.pose.readNoiseUtiliseE} e⁻ par défaut.
            </Mention>
          )}
          {/* §7.2 — le mode permissif se demande, et s'annonce avec son coût chiffré. */}
          <Interrupteur actif={permissif} surChangement={surPermissif}>
            <Etiquette cle="mode_permissif" /> — ciel pollué, suivi imprécis, vent
          </Interrupteur>
          {r.pose.notePermissif !== undefined && (
            <Mention ton="cause">{r.pose.notePermissif}</Mention>
          )}
        </>
      )}
    </section>
  )
}

/**
 * §7.6 — l'atténuation atmosphérique du flux de l'objet, avec la convention qui la produit.
 *
 * Rendue avec l'intégration et non avec la pose : c'est la durée totale que ce terme dose,
 * et la pose unitaire n'en dépend pas — elle ne tient qu'au fond de ciel.
 *
 * T-0268 — la convention est écrite en clair. La fiche chiffrait la culmination et annonçait
 * « au plus haut » : le meilleur instant de la nuit présenté comme la prévision, donc toujours
 * moins de temps que la capture n'en demande. C'est la moyenne du créneau qui dose désormais,
 * et le meilleur instant reste affiché sous elle, comme plancher.
 *
 * Deux états seulement, et ils viennent du MÊME champ que le calcul : un créneau, donc une
 * moyenne ; pas de créneau chiffrable, donc pas de hauteur. Une cible écartée ne passe pas
 * par ici — `CombienDePhotos` affiche sa cause à la place.
 */
function Extinction({ r }: { readonly r: Resultat }) {
  const extinction = r.extinction
  if (extinction === null) return null
  return (
    <>
      <p className="etat">
        {r.plusHaut === null
          ? 'Hauteur de la cible inconnue : le temps annoncé est un minimum.'
          : 'Masse d’air moyennée sur tout le créneau : c’est ce que la capture paiera.'}
      </p>
      <TracedValue terme="masse_air" trace={extinction.masseAir} />
      <TracedValue terme="extinction_atmospherique" trace={extinction.attenuation} decimales={3} />
      <TracedValue
        terme="flux_objet"
        suffixe="reçu au capteur, après atténuation"
        trace={extinction.eObjReel}
        decimales={3}
        unite="e⁻/s/px"
      />
    </>
  )
}

/**
 * §7.6, T-0268 — la même cible au seul meilleur instant du créneau : le plancher.
 *
 * Affiché SOUS la prévision, jamais à sa place. L'écart entre les deux chiffre ce que coûte
 * le fait de poser toute la fenêtre plutôt que l'heure du méridien — c'est un levier, et
 * l'utilisateur en fait quelque chose : raccourcir la séance autour de la culmination.
 */
function Plancher({ plancher }: { readonly plancher: Resultat['plancher'] }) {
  if (plancher === null) return null
  const { plusHaut, integration } = plancher
  return (
    <p className="etat">
      Au plus haut du créneau — {degres(plusHaut.altitudeDeg, 1)}
      {plusHaut.instant === null ? '' : `, vers ${heure(plusHaut.instant)}`} :{' '}
      {dureeLisible(integration.tRequisS.value)} et {integration.nPoses.value} poses. Un
      plancher, atteint en ne posant qu’autour de la culmination.
    </p>
  )
}

/** §7.3 — l'intégration requise pour la qualité visée, en heures, en poses et en gigaoctets. */
function CombienDePhotos({
  r,
  snrCible,
  surSnr,
}: {
  readonly r: Resultat
  readonly snrCible: number
  readonly surSnr: (valeur: number) => void
}) {
  const integration = r.integration
  if (integration === null) {
    // T-0268 — cible écartée du créneau : sa cause passe AVANT tout refus d'extinction. Le
    // repli sur la culmination faisait afficher ici un plan complet pour une cible que le
    // plan de séance venait d'écarter, et que la section « Créneau photo » disait cachée.
    const refus = r.exclusionCreneau ?? r.extinction?.attenuation.note
    // §7.6 — un refus se lit. Faire disparaître la section laisserait croire que le calcul
    // n'a pas été demandé, alors qu'il a été refusé, et pour une raison nommable.
    return refus === undefined ? null : (
      <section>
        <h2>Combien de photos</h2>
        <Mention ton="cause">{refus}</Mention>
      </section>
    )
  }
  return (
    <section>
      <h2>Combien de photos</h2>
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
      <Extinction r={r} />
      <TracedValue terme="integration_totale" trace={integration.tRequisS} decimales={0} unite="s" />
      <p className="etat">soit {dureeLisible(integration.tRequisS.value)}</p>
      <TracedValue terme="nombre_poses" trace={integration.nPoses} decimales={0} unite="poses" />
      <Plancher plancher={r.plancher} />
      <TracedValue terme="volume_stockage" trace={integration.volumeGo} decimales={1} unite="Go" />
      {integration.nNuits !== undefined && (
        <TracedValue terme="nombre_nuits" trace={integration.nNuits} decimales={0} unite="nuits" />
      )}
      <p className="etat">{integration.loiFondamentale}</p>
      {integration.messages.map((m) => (
        <Mention key={m} ton={integration.horsDePortee ? 'cause' : 'etat'}>
          {m}
        </Mention>
      ))}
    </section>
  )
}

/** §10.2 — le facteur dominant, les leviers, puis §7.5 et §10.3 s'ils se déclenchent. */
function PourquoiCeVerdict({
  r,
  conseils,
  filtreDualBand,
  surFiltre,
  explicationDepliee,
  surDeplie,
}: {
  readonly r: Resultat
  readonly conseils: Conseils | null
  readonly filtreDualBand: boolean
  readonly surFiltre: (valeur: boolean) => void
  readonly explicationDepliee: boolean
  readonly surDeplie: (valeur: boolean) => void
}) {
  const explique = r.explique
  if (explique === null) return null
  return (
    <section>
      <h2>Pourquoi ce verdict</h2>
      <p className="etat">{explique.n1}</p>
      <Interrupteur actif={filtreDualBand} surChangement={surFiltre}>
        Je possède un filtre bi-bande Hα / OIII
      </Interrupteur>
      <details
        className="tracee"
        open={explicationDepliee}
        onToggle={(e) => surDeplie((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <span>
            <Etiquette cle="facteur_dominant" />
          </span>
          <span className="tracee-valeur">
            {explique.facteurs.map(libelleEntree).join(' et ')}
          </span>
        </summary>
        <div className="tracee-detail">
          <p>{explique.n2}</p>
          {/* T-0275 — le nombre seul ne dit rien : une sensibilité est |∂ln(sortie)/∂ln(entrée)|,
              une pente sans dimension. On ne peut pas la lire comme « doubler cette valeur
              double le temps » — sur une magnitude, doubler n'a aucun sens, et la valeur
              absolue a déjà perdu le signe. Ce qu'elle dit vraiment, et tout ce qu'elle dit,
              c'est QUI décide. La phrase l'énonce une fois, au-dessus de la liste. */}
          <p className="etat">Plus le nombre est grand, plus cette grandeur décide du résultat.</p>
          <dl className="tracee-entrees">
            {Object.entries(explique.sensibilites).map(([nom, valeur]) => (
              <div key={nom}>
                <dt>{libelleEntree(nom)}</dt>
                <dd>{nombre(valeur, 2)}</dd>
              </div>
            ))}
          </dl>
          <ul className="tracee-constantes">
            {explique.leviers.map((l) => (
              <li key={l.code}>
                <strong>{l.libelle}</strong> — gain {l.gain}, coût {l.cout}
              </li>
            ))}
          </ul>

          {conseils !== null && <ConseilsEtRecommandations conseils={conseils} />}
          <ChaineDeCalcul etapes={explique.n3} />
        </div>
      </details>
    </section>
  )
}

/** §7.5 puis §10.3 — le conseil filtre vient APRÈS les leviers gratuits, jamais avant. */
function ConseilsEtRecommandations({ conseils }: { readonly conseils: Conseils }) {
  return (
    <>
      <Mention ton={conseils.filtre.declenche ? 'cause' : 'etat'}>{conseils.filtre.message}</Mention>
      {/* §10.3 — recommandation d'équipement : catégorie et gain chiffré, rien d'autre. */}
      <p className="etat">{conseils.recommandations.message}</p>
      {conseils.recommandations.recommandations.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Sans</th>
              <th>Avec</th>
              <th>Rapport</th>
            </tr>
          </thead>
          <tbody>
            {conseils.recommandations.recommandations.map((reco) => (
              <tr key={reco.categorie}>
                <td>{reco.libelle}</td>
                <td>{reco.sans}</td>
                <td>{reco.avec}</td>
                <td>× {nombre(reco.rapport, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

/** §10.2 niveau 3 — chaque étape avec sa formule, sa section et ses constantes sources. */
function ChaineDeCalcul({
  etapes,
}: {
  readonly etapes: NonNullable<Resultat['explique']>['n3']
}) {
  return (
    <details className="tracee">
      <summary>
        <span>Chaîne de calcul complète</span>
      </summary>
      <div className="tracee-detail">
        {etapes.map((etape) => (
          <p key={etape.libelle} className="tracee-formule">
            <strong>{etape.libelle}</strong> = {etape.valeur === null || etape.valeur === undefined ? '—' : nombre(etape.valeur, 3)} {etape.unite}
            <br />
            <code>{etape.expression}</code>
            {etape.constantes.length > 0 && (
              <span className="tracee-source">
                <br />
                constantes : {etape.constantes.map((c) => `${c.ref} = ${c.valeur}`).join(', ')}
              </span>
            )}
          </p>
        ))}
      </div>
    </details>
  )
}
