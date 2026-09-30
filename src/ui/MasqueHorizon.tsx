/**
 * §4.1 — l'édition manuelle du masque d'horizon, sous le groupe « Séance ».
 *
 * Le modèle numérique de terrain de §4.1 demande le réseau et un cache par site ; le relevé
 * à la main, lui, est hors ligne et suffit à rendre les créneaux justes. On saisit quelques
 * crêtes — azimut, hauteur d'obstruction — et [[masqueDepuisPoints]] interpole le reste.
 *
 * Le refus est montré à la saisie, jamais après coup : une altitude hors domaine nomme son
 * champ et n'entre pas dans la liste, plutôt que de faire tomber la chaîne de calcul.
 */

import { useState } from 'react'
import { nombreLibre } from '../registry/ecriture.ts'
import { masqueDepuisPoints, repereCardinal, type MasqueHorizon, type PointMasque } from '../core/site.ts'
import { SaisieRefuseeError } from '../registry/domains.ts'
import { nombreSaisi, refusDe } from './saisie-bornee.ts'
import { ChampDomaine } from './ChampDomaine.tsx'
import { Terme } from './Terme.tsx'
import { Mention } from './Mention.tsx'
import { libelleFlag } from '../registry/libelles.ts'

export interface MasqueHorizonProps {
  readonly points: readonly PointMasque[]
  readonly surPoints: (v: readonly PointMasque[]) => void
  /** Le masque effectivement en vigueur : relevés interpolés, ou repli plat [HYP]. */
  readonly masque: MasqueHorizon
}

export function MasqueHorizonSaisie(props: MasqueHorizonProps) {
  const [azimut, surAzimut] = useState('')
  const [altitude, surAltitude] = useState('')
  const [refus, surRefus] = useState<string | null>(null)

  function ajoute() {
    // T-0208 — un relevé hors plage est RAMENÉ à sa borne, pas jeté : une crête notée à 95°
    // est une crête à 90°, et perdre la saisie sans rien retenir n'aide personne. Un champ
    // vide, lui, n'est pas un relevé : il reste refusé.
    const azimutBorne = nombreSaisi('azimut_masque_deg', azimut)
    const altitudeBornee = nombreSaisi('masque_horizon_deg', altitude)
    const point = { azimutDeg: azimutBorne.valeur, altitudeDeg: altitudeBornee.valeur }
    try {
      // Le constructeur du masque porte les bornes du registre : on l'appelle pour valider,
      // plutôt que de recopier ici un min et un max qui divergeraient.
      masqueDepuisPoints([...props.points, point])
      props.surPoints([...props.points, point])
      surAzimut('')
      surAltitude('')
      surRefus(refusDe(azimutBorne, altitudeBornee))
    } catch (erreur) {
      surRefus(
        erreur instanceof SaisieRefuseeError
          ? erreur.message
          : 'Saisie refusée : relevé inexploitable.',
      )
    }
  }

  return (
    <div className="masque-horizon">
      <Terme
        cle="masque_horizon"
        contexte={
          props.masque.estHypothese
            ? `horizon plat supposé ${libelleFlag('HYP')}`
            : `${props.points.length} relevé${props.points.length > 1 ? 's' : ''}`
        }
      />
      {/* L'hypothèse plate est une alerte — le relevé saisi, lui, n'est qu'une lecture. */}
      {props.masque.note !== undefined && (
        <Mention ton={props.masque.estHypothese ? 'cause' : 'tracee-source'}>
          {props.masque.flags?.map((f) => `${libelleFlag(f)} `).join('')}
          {props.masque.note}
        </Mention>
      )}

      {props.points.length > 0 && (
        <ul className="masque-releves">
          {props.points.map((p, rang) => (
            <li key={`${p.azimutDeg}-${p.altitudeDeg}-${rang}`}>
              <span>
                azimut {nombreLibre(p.azimutDeg)}° ({repereCardinal(p.azimutDeg)}) →{' '}
                {nombreLibre(p.altitudeDeg)}°
              </span>
              <button
                type="button"
                aria-label={`Effacer le relevé de l’azimut ${nombreLibre(p.azimutDeg)}°`}
                onClick={() => props.surPoints(props.points.filter((_, i) => i !== rang))}
              >
                Effacer
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="champs">
        <ChampDomaine
          domaine="azimut_masque_deg"
          libelle="Azimut du relevé"
          valeur={azimut}
          surValeur={surAzimut}
          placeholder="0 = nord, 90 = est"
        />
        <ChampDomaine
          domaine="masque_horizon_deg"
          libelle="Hauteur d’obstruction"
          valeur={altitude}
          surValeur={surAltitude}
          placeholder="crête, arbre, bâtiment"
        />
      </div>

      <div className="actions">
        <button type="button" onClick={ajoute}>
          Relever
        </button>
        {props.points.length > 0 && (
          <button type="button" onClick={() => props.surPoints([])}>
            Tout effacer
          </button>
        )}
      </div>

      {refus !== null && <Mention ton="cause">{refus}</Mention>}
    </div>
  )
}
