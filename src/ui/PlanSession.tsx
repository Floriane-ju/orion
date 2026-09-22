/**
 * §8.3 plan de session ordonné, §8.4 carte de pointage, §11.2 export imprimable.
 *
 * Livrable du lot 3 : ce qui est affiché ici est exécutable sur le terrain. Une chronologie,
 * un budget, une aide au pointage sans GoTo, et un export texte qui survit à l'écran éteint.
 */

import { useMemo, useState } from 'react'
import { dureeLisible } from '../core/exposure.ts'
import { cartePointage, RAPPEL_MISE_EN_STATION } from '../core/pointage.ts'
import { planEnTexte, type EnTetePlan } from '../core/plan-texte.ts'
import type { EtapePlan, PlanSession as Plan } from '../core/session.ts'
import type { Site } from '../core/ephem.ts'
import type { FenetreUtile } from '../core/moon.ts'
import type { Etoile } from '../data/catalog.ts'
import { Icone } from './Icone.tsx'
import { TracedValue } from './TracedValue.tsx'
import { Etiquette } from './Terme.tsx'
import { heure } from './horaire.ts'
import { Mention } from './Mention.tsx'
import {
  LIBELLE_MODE_POINTAGE,
  LIBELLE_VERDICT_CADRAGE,
  LIBELLE_VERDICT_DETECTABILITE,
} from '../registry/libelles.ts'

const DEG_PAR_HEURE = 15
const POURCENT = 100

export interface PlanSessionProps {
  readonly plan: Plan
  readonly fenetreUtile: FenetreUtile
  readonly site: Site
  readonly fovHDeg: number
  readonly fovLDeg: number
  readonly mLimOeil: number | null
  readonly fovChercheurDeg?: number
  readonly etoiles: readonly Etoile[]
  readonly enTete: EnTetePlan
}

export function PlanSessionVue(props: PlanSessionProps) {
  const { plan } = props
  const texte = useMemo(() => planEnTexte(plan, props.enTete), [plan, props.enTete])

  function surTelecharge() {
    const blob = new Blob([texte], { type: 'text/plain;charset=utf-8' })
    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(blob)
    lien.download = `orion-plan-${props.enTete.nuitIso}.txt`
    lien.click()
    URL.revokeObjectURL(lien.href)
  }

  return (
    <>
      <section>
        <h2>Plan de session</h2>
        <p className="etat">{plan.message}</p>
        {plan.contrainteDominante !== undefined && (
          <Mention ton="cause">{plan.contrainteDominante}</Mention>
        )}
        {plan.alternative !== undefined && <p className="etat">{plan.alternative}</p>}
        <Mention ton="cause">{plan.avertissementMeteo}</Mention>
        {plan.avertissementBatterie !== undefined && (
          <Mention ton="cause">{plan.avertissementBatterie}</Mention>
        )}

        {plan.etapes.map((etape, index) => (
          <Etape key={etape.objet.designation} etape={etape} rang={index + 1} {...props} />
        ))}
      </section>

      <section>
        <h2>Export imprimable</h2>
        <div className="actions">
          <button type="button" onClick={surTelecharge}>
            Télécharger le plan (texte)
          </button>
          <button type="button" onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
        <textarea className="plan-export" readOnly value={texte} />
      </section>
    </>
  )
}

interface EtapeProps extends PlanSessionProps {
  readonly etape: EtapePlan
  readonly rang: number
}

function Etape({ etape, rang, ...props }: EtapeProps) {
  const [pointageOuvert, setPointageOuvert] = useState(false)
  const nom =
    etape.objet.nomsCommuns === ''
      ? etape.objet.designation
      : `${etape.objet.designation} — ${etape.objet.nomsCommuns.split('|')[0]}`

  return (
    <div className="etape">
      <p className="etape-titre">
        <span>
          {rang}. {nom}
        </span>
        <span className="etape-horaire">
          {heure(etape.creneauAlloue.debut)} → {heure(etape.creneauAlloue.fin)} ·{' '}
          {etape.dureeAlloueeMin.toFixed(0)} min
        </span>
      </p>
      <p className="etat">
        Pose {etape.tPoseS} s · {etape.nPoses} poses · {etape.volumeGo.toFixed(1)} Go ·{' '}
        intégration requise {dureeLisible(etape.integration.tRequisS.value)}
        {/* §7.6 — k est un ordre de grandeur : la durée porte sa fourchette, jamais une
            valeur exacte. Sans elle, l'utilisateur lit une précision qui n'existe pas. */}
        {etape.integration.tRequisS.range !== undefined &&
          ` (${dureeLisible(etape.integration.tRequisS.range[0])} à ${dureeLisible(
            etape.integration.tRequisS.range[1],
          )} selon le ciel)`}
      </p>
      <p className="etat">
        Verdict{' '}
        {etape.verdict === null
          ? 'donnée manquante'
          : LIBELLE_VERDICT_DETECTABILITE[etape.verdict]}{' '}
        · cadrage {LIBELLE_VERDICT_CADRAGE[etape.verdictCadrage]} · fond
        de ciel {etape.sbCielEffectif.toFixed(2)} mag/as²
      </p>
      {!etape.integrationComplete && (
        <Mention ton="cause">
          Trop long pour une nuit : prévoir {etape.nNuits} nuits.
        </Mention>
      )}
      {etape.creneau.retournementMeridien && (
        <Mention ton="cause">
          Retournement au méridien à {heure(etape.creneau.heureCulmination!)} : recadrer, puis
          relancer la séquence.
        </Mention>
      )}
      {/* §7.6 — la masse d'air qui a dosé cette intégration : la MOYENNE du créneau, pas
          celle de la culmination. La cible passe une partie de la nuit plus bas. */}
      <TracedValue
        terme="masse_air"
        suffixe="moyenne du créneau"
        trace={etape.extinction.masseAir}
      />
      <TracedValue
        terme="extinction_atmospherique"
        trace={etape.extinction.attenuation}
        decimales={3}
      />
      <TracedValue terme="degradation_lunaire" trace={etape.deltaSbLuneMag} unite="mag/as²" />
      <TracedValue terme="score_cible" trace={etape.score} decimales={3} unite="sur 1" />
      <p className="score-detail">
        <span>cadrage {(etape.detailScore.cadrage * POURCENT).toFixed(0)} %</span>
        <span>hauteur {(etape.detailScore.hauteur * POURCENT).toFixed(0)} %</span>
        <span>signal {(etape.detailScore.signal * POURCENT).toFixed(0)} %</span>
        <span>fenêtre {(etape.detailScore.fenetre * POURCENT).toFixed(0)} %</span>
        <span>Lune {(etape.detailScore.lune * POURCENT).toFixed(0)} %</span>
      </p>
      <p className="etat">{etape.consigne}</p>

      <button type="button" onClick={() => setPointageOuvert(!pointageOuvert)}>
        {pointageOuvert ? 'Masquer' : 'Afficher'} l’aide au pointage
      </button>
      {pointageOuvert && <Pointage etape={etape} rang={rang} {...props} />}
    </div>
  )
}

function Pointage({ etape, ...props }: EtapeProps) {
  const carte = cartePointage({
    site: props.site,
    date: etape.creneauAlloue.debut,
    adCibleH: etape.objet.adDeg / DEG_PAR_HEURE,
    decCibleDeg: etape.objet.decDeg,
    fovHDeg: props.fovHDeg,
    fovLDeg: props.fovLDeg,
    mLimOeil: props.mLimOeil,
    ...(props.fovChercheurDeg === undefined ? {} : { fovChercheurDeg: props.fovChercheurDeg }),
    etoiles: props.etoiles,
  })

  return (
    <>
      <h3>
        <Etiquette cle="mode_pointage" /> : {LIBELLE_MODE_POINTAGE[carte.mode]}
      </h3>
      <p className="etat">{carte.message}</p>
      {carte.cause !== undefined && <Mention ton="cause">{carte.cause}</Mention>}
      {carte.contraintesARelacher?.map((contrainte) => (
        <p key={contrainte} className="etat">
          À relâcher : {contrainte}
        </p>
      ))}
      <TracedValue
        terme="angle_orientation"
        trace={carte.angleOrientationDeg}
        decimales={0}
        unite="°"
      />

      {carte.ancrages.length > 0 && (
        <>
          {/* T-0068 — sans rôle, l'`aria-label` d'une `div` n'est pas exposé : l'intention
                était bonne, l'effet nul. Le schéma est une image composée en HTML. */}
          <div className="schema" role="img" aria-label="Schéma du cadre, cible au centre">
            <span className="schema-astre schema-cible" style={{ left: '50%', top: '50%' }}>
              <Icone nom="my_location" />
            </span>
            {carte.ancrages.map((ancrage) => (
              <span
                key={`${ancrage.adH}-${ancrage.decDeg}`}
                className="schema-astre"
                style={{
                  left: `${(1 / 2 - ancrage.xCadre) * POURCENT}%`,
                  top: `${(1 / 2 - ancrage.yCadre) * POURCENT}%`,
                }}
              >
                <Icone nom="circle" />
                {ancrage.principal && <Icone nom="star" />}
              </span>
            ))}
          </div>
          <table>
            <thead>
              <tr>
                <th>Ancrage</th>
                <th>Magnitude</th>
                <th>Séparation</th>
                <th>Δ ascension droite</th>
                <th>Δ déclinaison</th>
              </tr>
            </thead>
            <tbody>
              {carte.ancrages.map((ancrage) => (
                <tr key={`${ancrage.adH}-${ancrage.decDeg}-l`}>
                  {/* Le glyphe REND LA LIGNE AU SCHÉMA : sans lui, rien ne dit lequel des
                      points de l'image est celui que la ligne décrit. Le mot porte le sens,
                      l'icône reste donc `aria-hidden` — c'est le défaut d'`Icone`. */}
                  <td>
                    {ancrage.principal ? (
                      <>
                        principal <Icone nom="star" />
                      </>
                    ) : (
                      'secondaire'
                    )}
                  </td>
                  <td>{ancrage.magV.toFixed(1)} mag</td>
                  <td>{ancrage.separationDeg.toFixed(2)} °</td>
                  <td>{ancrage.deltaAdH.toFixed(3)} h</td>
                  <td>{ancrage.deltaDecDeg.toFixed(2)} °</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {carte.sauts.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Saut</th>
              <th>Magnitude</th>
              <th>Distance au suivant</th>
            </tr>
          </thead>
          <tbody>
            {carte.sauts.map((saut) => (
              <tr key={saut.ordre}>
                <td>{saut.ordre}</td>
                <td>{saut.magV.toFixed(1)} mag</td>
                <td>{saut.distanceDeg.toFixed(2)} °</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="etat">
        <Etiquette cle="decalage_pointage" /> : {carte.deltaAdH.toFixed(3)} h et{' '}
        {carte.deltaDecDeg.toFixed(2)} °
      </p>
      <p className="etat">{RAPPEL_MISE_EN_STATION}</p>
    </>
  )
}
