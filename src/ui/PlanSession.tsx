/**
 * §8.3 plan de session ordonné, §8.4 carte de pointage, §11.2 export imprimable.
 *
 * Livrable du lot 3 : ce qui est affiché ici est exécutable sur le terrain. Une chronologie,
 * un budget, une aide au pointage sans GoTo, et un export texte qui survit à l'écran éteint.
 */

import { useMemo, useState } from 'react'
import { faciliteCible } from '../core/facilite.ts'
import { cartePointage, RAPPEL_MISE_EN_STATION } from '../core/pointage.ts'
import { planEnTexte, type EnTetePlan } from '../core/plan-texte.ts'
import type { CibleEcartee, EtapePlan, PlanSession as Plan } from '../core/session.ts'
import type { Site } from '../core/ephem.ts'
import type { FenetreUtile } from '../core/moon.ts'
import type { Etoile } from '../data/catalog.ts'
import { Icone } from './Icone.tsx'
import { Pastilles } from './Pastilles.tsx'
import { TracedValue } from './TracedValue.tsx'
import { Etiquette } from './Terme.tsx'
import { heure } from './horaire.ts'
import { Mention } from './Mention.tsx'
import { ouvreCible } from './seance-etat.ts'
import { LIBELLE_MODE_POINTAGE } from '../registry/libelles.ts'

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
        {/* T-0322 — le budget ne retire plus de cible : il se CONSTATE. Sans cette phrase, un
            plan qui déborde de la nuit se lirait comme un plan qui tient. Le détail du budget
            reste hors de l'écran (T-0318) et dans l'export ; ce qui compte ici est le fait. */}
        {!plan.budget.tient && plan.etapes.length > 0 && (
          <Mention ton="cause">
            Le total dépasse la nuit de{' '}
            {(plan.budget.totalMin.value - plan.budget.disponibleMin).toFixed(0)} min, mise en
            station, pointages et calibration compris. Rien n’est retiré : à vous de raccourcir
            une cible ou d’en reporter une.
          </Mention>
        )}
        <Mention ton="cause">{plan.avertissementMeteo}</Mention>
        {plan.avertissementBatterie !== undefined && (
          <Mention ton="cause">{plan.avertissementBatterie}</Mention>
        )}

        {plan.etapes.map((etape, index) => (
          <Etape key={etape.objet.designation} etape={etape} rang={index + 1} {...props} />
        ))}
      </section>

      <Ecartees ecartees={plan.ciblesEcartees} />

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

/**
 * §8.3 — ce qu'il advient d'une cible qu'on a demandée et qui n'a pas de place ce soir.
 *
 * T-0318 avait retiré la table des écartées, et c'était juste : elle listait des milliers de
 * refus du catalogue que la fiche explique déjà, cible par cible. Le motif s'inverse depuis
 * que l'entrée du plan est une SÉLECTION : ces lignes-là sont des cibles qu'on a explicitement
 * cochées, elles sont une ou deux, et une disparition muette ferait lire le geste d'ajout
 * comme un bouton cassé. §1.5 l'interdit par ailleurs — aucune cible écartée sans sa cause.
 *
 * T-0322 — la liste a beaucoup maigri, et c'est le but : le budget ne retire plus rien, et
 * une cible de plusieurs nuits ne prend plus la place d'une cible courte. Ce qui reste est
 * le seul cas où la nuit n'offre rien — un créneau intégralement occupé —, plus les cibles
 * choisies qu'un changement de matériel a rendues impossibles depuis.
 *
 * La cause vient du moteur, jamais d'ici, et le code interne ne s'affiche pas.
 */
function Ecartees({ ecartees }: { readonly ecartees: readonly CibleEcartee[] }) {
  if (ecartees.length === 0) return null
  return (
    <section>
      <h2>Choisies, sans place cette nuit</h2>
      {ecartees.map((ecartee) => (
        <p key={ecartee.designation} className="etat">
          {ecartee.designation} — {ecartee.cause}
        </p>
      ))}
    </section>
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
  const facilite = faciliteCible(etape)

  return (
    <div className="etape">
      <p className="etape-titre">
        {/* T-0323 — le nom ouvre la fiche, seul détour que le plan garde. Tout ce que l'étape
            annonçait d'elle-même — pose, volume, verdicts, masse d'air, sous-scores — y est
            déjà écrit, en contexte et avec sa trace. Le redire ici faisait d'une chronologie
            à exécuter dans le noir un tableau de bord à déchiffrer. */}
        <button type="button" className="etape-lien" onClick={() => ouvreCible(etape.objet)}>
          {rang}. {nom}
        </button>
        <span className="etape-horaire">
          {heure(etape.creneauAlloue.debut)} → {heure(etape.creneauAlloue.fin)} ·{' '}
          {etape.dureeAlloueeMin.toFixed(0)} min
        </span>
      </p>
      {/* §6.4 — la seule lecture qui reste : elle se compte d'un coup d'œil, à la frontale,
          et c'est la même note que la ligne de liste, lue sur le même score. */}
      {facilite !== null && <Pastilles note={facilite.note} libelle={facilite.libelle} />}
      {!etape.integrationComplete && (
        <Mention ton="cause">
          {etape.nNuits > 1
            ? `Trop long pour une nuit : prévoir ${etape.nNuits} nuits, avec des darks à chaque nuit.`
            : 'Créneau partagé avec une cible mieux notée : ce soir n’en couvre qu’une partie.'}
        </Mention>
      )}
      {etape.creneau.retournementMeridien && (
        <Mention ton="cause">
          Retournement au méridien à {heure(etape.creneau.heureCulmination!)} : recadrer, puis
          relancer la séquence.
        </Mention>
      )}

      <button
        type="button"
        className="etape-pointage"
        onClick={() => setPointageOuvert(!pointageOuvert)}
      >
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
