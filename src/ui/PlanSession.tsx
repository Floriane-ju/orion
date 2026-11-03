/**
 * §8.3 ordered session plan, §8.4 pointage map, §11.2 printable export.
 * Lot 3 deliverable: what shows here is executable in the field. Timeline, budget, pointage
 * aid without GoTo, and a text export surviving a dead screen.
 */

import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { degres, dureeMinLisible, nombre } from '../registry/ecriture.ts'
import { faciliteCible } from '../core/facilite.ts'
import {
  cartePointage,
  etapesParcours,
  RAPPEL_MISE_EN_STATION,
  type Ancrage,
} from '../core/pointage.ts'
import { planEnTexte, type EnTetePlan } from '../core/plan-texte.ts'
import { manqueIntegration, retournementDansEtape } from '../core/session-nuit.ts'
import type { CibleEcartee, EtapePlan, PlanSession as Plan } from '../core/session.ts'
import type { Site } from '../core/ephem.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { Etoile } from '../data/catalog.ts'
import type { EtoileNommee } from '../data/constellations.ts'
import { K } from '../registry/constants.ts'
import { Icone } from './Icone.tsx'
import { Pastilles } from './Pastilles.tsx'
import { PlanCalibration } from './PlanCalibration.tsx'
import { TracedValue } from './TracedValue.tsx'
import { Etiquette } from './Terme.tsx'
import { heure } from './horaire.ts'
import { Mention } from './Mention.tsx'
import { ouvreCible } from './seance-etat.ts'
import { masqueParcours, parcoursScene, useTrancheScene } from './scene-etat.ts'
import { poseParcours } from './parcours-scene.ts'
import { LIBELLE_MODE_POINTAGE, SANS_NOM } from '../registry/libelles.ts'
import { DEG_PAR_HEURE, POURCENT } from '../core/unites.ts'


/**
 * T-0287 — five bright real-sky stars have no designation in the versioned packs, and the
 * cadre holds fainter ones than the named pack covers. Row SAYS so instead of an empty cell:
 * a blank column reads as a display bug, not an anonymous star.
 */

export interface PlanSessionProps {
  readonly plan: Plan
  readonly site: Site
  readonly fovHDeg: number
  readonly fovLDeg: number
  readonly mLimOeil: number | null
  readonly fovChercheurDeg?: number
  readonly etoiles: readonly Etoile[]
  /** §3.4 — pack naming the §8.4 reference stars (T-0287). */
  readonly nommees: readonly EtoileNommee[]
  /** §3.3 — bounds of the champ "Voir le parcours" asks of the scène (T-0324). */
  readonly gaiaCharge: boolean
  readonly enTete: EnTetePlan
}

/**
 * T-0288 — true during printing. Pointage aid computed on demand only (one catalogue pass per
 * étape): on paper it must appear for ALL étapes. `flushSync`: browser freezes the page on
 * `beforeprint` exit, a scheduled render would land after.
 */
function useImpression(): boolean {
  const [imprime, setImprime] = useState(false)
  useEffect(() => {
    const avant = () => flushSync(() => setImprime(true))
    const apres = () => setImprime(false)
    window.addEventListener('beforeprint', avant)
    window.addEventListener('afterprint', apres)
    return () => {
      window.removeEventListener('beforeprint', avant)
      window.removeEventListener('afterprint', apres)
    }
  }, [])
  return imprime
}

export function PlanSessionVue(props: PlanSessionProps) {
  const { plan } = props
  const imprime = useImpression()
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
        {/* T-0322 — budget no longer removes a target: it is STATED. Without this sentence an
            overflowing plan reads as one that fits. Budget detail stays off screen (T-0318) and
            in the export; the fact is what matters here. */}
        {!plan.budget.tient && plan.etapes.length > 0 && (
          <Mention ton="cause">
            Le total dépasse la nuit de{' '}
            {dureeMinLisible(plan.budget.totalMin.value - plan.budget.disponibleMin)}, mise en
            station, pointages et calibration compris. Rien n’est retiré : à vous de raccourcir
            une cible ou d’en reporter une.
          </Mention>
        )}
        {plan.avertissementBatterie !== undefined && (
          <Mention ton="cause">{plan.avertissementBatterie}</Mention>
        )}
        <Ecartees ecartees={plan.ciblesEcartees} />

        {plan.etapes.map((etape, index) => (
          <Etape
            key={etape.objet.designation}
            etape={etape}
            rang={index + 1}
            imprime={imprime}
            {...props}
          />
        ))}
      </section>

      <PlanCalibration calibration={plan.calibration} />

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
 * §8.3 — fate of a requested target with no place tonight.
 * T-0318 removed the discarded table, rightly: thousands of catalogue refusals the fiche
 * already explains per target. Reason inverts since plan input is a SELECTION: these rows are
 * explicitly ticked targets, one or two; a mute disappearance would make the add gesture read
 * as a broken button. §1.5 forbids it anyway — no discarded target without cause.
 * T-0322 — list shrank, intended: budget removes nothing, multi-night target no longer takes a
 * short one's place. Remaining: the only case where the night offers nothing (fully occupied
 * créneau) + chosen targets a matériel change made impossible since.
 * Cause from the engine, never from here; internal code not displayed.
 * T-0429 — no separate card: these targets continue the plan, not another section. One alert
 * groups them, at plan top, where one checks what was asked.
 */
function Ecartees({ ecartees }: { readonly ecartees: readonly CibleEcartee[] }) {
  if (ecartees.length === 0) return null
  return (
    <Mention ton="cause">
      Hors de portée cette nuit :
      {ecartees.map((ecartee) => (
        <span key={ecartee.designation}>
          <br />
          {ecartee.designation} — {ecartee.cause}
        </span>
      ))}
    </Mention>
  )
}

interface EtapeProps extends PlanSessionProps {
  readonly etape: EtapePlan
  readonly rang: number
  readonly imprime: boolean
}

export function Etape({ etape, rang, imprime, ...props }: EtapeProps) {
  const [pointageOuvert, setPointageOuvert] = useState(false)
  const nom =
    etape.objet.nomsCommuns === ''
      ? etape.objet.designation
      : `${etape.objet.designation} — ${etape.objet.nomsCommuns.split('|')[0]}`
  const facilite = faciliteCible(etape)
  const manque = manqueIntegration(etape)
  const retournement = retournementDansEtape(etape)

  return (
    <div className="etape">
      <p className="etape-titre">
        {/* T-0323 — name opens the fiche, the only detour the plan keeps. All the étape
            announced (pose, volume, verdicts, masse d'air, sous-scores) is already written
            there, in context with its trace. Repeating it made a timeline to execute in the dark
            a dashboard to decipher. */}
        <button type="button" className="etape-lien" onClick={() => ouvreCible(etape.objet)}>
          {rang}. {nom}
        </button>
        <span className="etape-horaire">
          {heure(etape.creneauAlloue.debut)} → {heure(etape.creneauAlloue.fin)} ·{' '}
          {dureeMinLisible(etape.dureeAlloueeMin)}
          {/* T-0407 — under a zoom, the ring is set per target: étape says so. T-0436: and the
              objectif changes, when the parc offers several. */}
          {etape.objectifNom !== undefined && ` · ${etape.objectifNom} à`}
          {etape.focaleMm !== undefined && ` ${etape.objectifNom === undefined ? '· ' : ''}${nombre(etape.focaleMm, 0)} mm`}
        </span>
      </p>
      {/* §6.4 — the only reading left: counted at a glance, headlamp on, same note as the list
          row, same score. */}
      {facilite !== null && <Pastilles note={facilite.note} libelle={facilite.libelle} />}
      {manque !== null && <Mention ton="cause">{manque}</Mention>}
      {retournement !== null && (
        <Mention ton="cause">
          Retournement au méridien à {heure(retournement)} : recadrer, puis relancer la
          séquence.
        </Mention>
      )}

      <button
        type="button"
        className="etape-pointage"
        onClick={() => setPointageOuvert(!pointageOuvert)}
      >
        {pointageOuvert ? 'Masquer' : 'Afficher'} l’aide au pointage
      </button>
      {(pointageOuvert || imprime) && (
        <Pointage
          objet={etape.objet}
          date={etape.creneauAlloue.debut}
          site={props.site}
          fovHDeg={props.fovHDeg}
          fovLDeg={props.fovLDeg}
          mLimOeil={props.mLimOeil}
          {...(props.fovChercheurDeg === undefined
            ? {}
            : { fovChercheurDeg: props.fovChercheurDeg })}
          etoiles={props.etoiles}
          nommees={props.nommees}
          gaiaCharge={props.gaiaCharge}
        />
      )}
    </div>
  )
}

/**
 * §8.4 — one reference star per row: what recognises it in the sky + what sets graduated
 * circles.
 * T-0287 — glyph RETURNS THE ROW TO THE SCHEMA: without it nothing says which image point the
 * row describes. It alone carries the anchor rank (star name fills the cell), hence its
 * `libelle` — two adjacent icons also ligatured across ("circle" then "star" gave "circles"
 * and the rest in plain text).
 */
function TableAncrages({ ancrages }: { readonly ancrages: readonly Ancrage[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Étoile</th>
          <th>Magnitude</th>
          <th>Séparation</th>
          <th>Δ ascension droite</th>
          <th>Δ déclinaison</th>
        </tr>
      </thead>
      <tbody>
        {ancrages.map((ancrage) => (
          <tr key={`${ancrage.adH}-${ancrage.decDeg}-l`}>
            <td>
              <Icone
                nom={ancrage.principal ? 'star' : 'circle'}
                libelle={ancrage.principal ? 'Ancrage principal' : 'Ancrage secondaire'}
              />{' '}
              {ancrage.nom === '' ? SANS_NOM : ancrage.nom}
            </td>
            <td>{nombre(ancrage.magV, 1)} mag</td>
            <td>{degres(ancrage.separationDeg, 2)}</td>
            <td>{nombre(ancrage.deltaAdH, 3)} h</td>
            <td>{degres(ancrage.deltaDecDeg, 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * §8.4 — pointage aid for a target at an instant.
 * T-0287 — takes NOT the plan étape: target + time suffice; the full plan as input forced a
 * whole session to exist to be looked at.
 */
export interface PointageProps {
  readonly objet: ObjetCielProfond
  readonly date: Date
  readonly site: Site
  readonly fovHDeg: number
  readonly fovLDeg: number
  readonly mLimOeil: number | null
  readonly fovChercheurDeg?: number | undefined
  readonly etoiles: readonly Etoile[]
  readonly nommees: readonly EtoileNommee[]
  /** §3.3 — bounds of the champ "Voir le parcours" asks of the scène (T-0324). */
  readonly gaiaCharge: boolean
}

export function Pointage(props: PointageProps) {
  // T-0324 — a cheminement is a breadth-first pass over the catalogue: memo keeps it so toggling
  // the parcours, or any scène switch, does not rerun it.
  const carte = useMemo(
    () =>
      cartePointage({
        site: props.site,
        date: props.date,
        adCibleH: props.objet.adDeg / DEG_PAR_HEURE,
        decCibleDeg: props.objet.decDeg,
        fovHDeg: props.fovHDeg,
        fovLDeg: props.fovLDeg,
        mLimOeil: props.mLimOeil,
        ...(props.fovChercheurDeg === undefined
          ? {}
          : { fovChercheurDeg: props.fovChercheurDeg }),
        etoiles: props.etoiles,
        nommees: props.nommees,
      }),
    [
      props.site,
      props.date,
      props.objet,
      props.fovHDeg,
      props.fovLDeg,
      props.mLimOeil,
      props.fovChercheurDeg,
      props.etoiles,
      props.nommees,
    ],
  )
  const parcours = useTrancheScene(parcoursScene)
  const etapes = useMemo(() => etapesParcours(carte), [carte])
  const montre = parcours !== null && parcours.designation === props.objet.designation
  const deplies = K('ANCRAGES_DEPLIES_MAX')
  const tete = carte.ancrages.slice(0, deplies)
  const reste = carte.ancrages.slice(deplies)

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

      {/* T-0324 — table states the path, scène SHOWS it. Absent when the map has nothing to
          offer: it already gives the cause just above. */}
      {etapes.length > 0 && (
        <button
          type="button"
          className="etape-pointage"
          aria-pressed={montre}
          onClick={() => {
            if (montre) {
              masqueParcours()
              return
            }
            poseParcours(props, etapes)
          }}
        >
          <Icone nom="route" /> {montre ? 'Masquer le parcours' : 'Voir le parcours'}
        </button>
      )}

      {carte.ancrages.length > 0 && (
        <>
          {/* T-0068 — without a role a `div`'s `aria-label` is not exposed (good intent, no
              effect). Schema = an image composed in HTML. */}
          <div
            className="schema"
            role="img"
            aria-label="Schéma du champ autour de la cible, zénith en haut"
          >
            <span className="schema-astre schema-cible" style={{ left: '50%', top: '50%' }}>
              <Icone nom="my_location" />
            </span>
            {/* T-0287 — zenith is up by construction, nord turns with the hour. Both named: an
                oriented schema not saying by what it reads is like any schema. */}
            <span className="schema-astre schema-repere" style={{ left: '50%', top: '0%' }}>
              zénith
            </span>
            <span
              className="schema-astre schema-repere"
              style={{
                left: `${(1 / 2 + carte.xNord) * POURCENT}%`,
                top: `${(1 / 2 - carte.yNord) * POURCENT}%`,
              }}
            >
              nord
            </span>
            {tete.map((ancrage) => (
              <span
                key={`${ancrage.adH}-${ancrage.decDeg}`}
                className="schema-astre"
                style={{
                  left: `${(1 / 2 + ancrage.xDisque) * POURCENT}%`,
                  top: `${(1 / 2 - ancrage.yDisque) * POURCENT}%`,
                }}
              >
                <Icone nom={ancrage.principal ? 'star' : 'circle'} />
              </span>
            ))}
          </div>
          <TableAncrages ancrages={tete} />
          {/* T-0287 — a 17° cadre holds ~20 stars below naked-eye magnitude: unfolded they read
              as a scatter, main anchor lost. The others stay available, folded. */}
          {reste.length > 0 && (
            <details>
              <summary>
                {reste.length} autre{reste.length > 1 ? 's' : ''} étoile
                {reste.length > 1 ? 's' : ''} repère{reste.length > 1 ? 's' : ''} dans le cadre
              </summary>
              <TableAncrages ancrages={reste} />
            </details>
          )}
        </>
      )}

      {carte.sauts.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Saut</th>
              <th>Étoile</th>
              <th>Magnitude</th>
              <th>Distance au suivant</th>
            </tr>
          </thead>
          <tbody>
            {carte.sauts.map((saut) => (
              <tr key={saut.ordre}>
                <td>{saut.ordre}</td>
                <td>{saut.nom === '' ? SANS_NOM : saut.nom}</td>
                <td>{nombre(saut.magV, 1)} mag</td>
                <td>{degres(saut.distanceDeg, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="etat">
        <Etiquette cle="decalage_pointage" /> : {nombre(carte.deltaAdH, 3)} h et{' '}
        {degres(carte.deltaDecDeg, 2)}
      </p>
      <p className="etat">{RAPPEL_MISE_EN_STATION}</p>
    </>
  )
}
