/**
 * §2.2 + §4.1 — le site : où l'on est, sous quel ciel, derrière quel relief.
 *
 * T-0113 — c'était le groupe « Séance » en tête du panneau droit, déplié en permanence. Il
 * descend dans la barre basse, derrière la pastille qui affiche déjà le lieu et son Bortle :
 * les six champs commandent bien tout le reste, mais on les règle une fois par sortie, pas
 * une fois par cible. Ce qu'il fallait garder n'était pas leur présence à l'écran — c'était
 * la LECTURE de leurs valeurs sans clic, et c'est la pastille qui la porte maintenant.
 *
 * La date reste dehors, dans la barre : elle date la nuit entière et se change en cours de
 * planification, contrairement aux coordonnées d'un site.
 *
 * T-0228 — la source de la table de Bortle, et la limite de validité qu'elle énonce, sont
 * parties dans le tiroir « info ». Elles ne varient pas avec la saisie : les poser sous un
 * champ qu'on règle une fois par sortie revenait à les faire relire à chaque ouverture.
 *
 * La barre basse est démontée : les champs vivent dans la carte « Site » posée sur la scène,
 * sans `<section>` ni `h2` — la carte porte déjà le cadre et le nom.
 */

import type { MasqueHorizon, PointMasque, SeuilsSite } from '../core/site.ts'
import { MasqueHorizonSaisie } from './MasqueHorizon.tsx'
import { ChampDomaine } from './ChampDomaine.tsx'
import { TracedValue } from './TracedValue.tsx'
import { Mention } from './Mention.tsx'

export interface ChampsSiteProps {
  readonly latitude: string
  readonly surLatitude: (v: string) => void
  readonly longitude: string
  readonly surLongitude: (v: string) => void
  readonly altitude: string
  readonly surAltitude: (v: string) => void
  readonly bortle: string
  readonly surBortle: (v: string) => void
  readonly sqm: string
  readonly surSqm: (v: string) => void
  readonly masque: MasqueHorizon
  /** §4.1 — les relevés de relief saisis à la main, et leur commande d'édition. */
  readonly pointsMasque: readonly PointMasque[]
  readonly surPointsMasque: (v: readonly PointMasque[]) => void
  /** Seuils de déclinaison du site — propriété de la latitude, absents si la saisie est refusée. */
  readonly seuils?: SeuilsSite
  /**
   * La cause du refus de la saisie en cours, `null` si le lieu est calculable. La scène
   * continue d'afficher le dernier ciel valide : c'est ici, au pied des champs qui l'ont
   * produit, que le refus se dit.
   */
  readonly cielRefus: string | null
}

export function ChampsSite(props: ChampsSiteProps) {
  return (
    <>
      <div className="champs">
        <ChampDomaine
          domaine="latitude_deg"
          cle="latitude"
          valeur={props.latitude}
          surValeur={props.surLatitude}
          requis
        />
        <ChampDomaine
          domaine="longitude_deg"
          cle="longitude"
          valeur={props.longitude}
          surValeur={props.surLongitude}
          requis
        />
        <ChampDomaine
          domaine="altitude_m"
          cle="altitude_site"
          valeur={props.altitude}
          surValeur={props.surAltitude}
          requis
        />
        {/* Bortle est un indice ENTIER (1 à 9, DOMAINES.bortle_declare) : le pavé numérique
            sans séparateur décimal évite une saisie qu'aucune valeur du domaine
            n'accepterait. */}
        <ChampDomaine
          domaine="bortle_declare"
          cle="bortle"
          valeur={props.bortle}
          surValeur={props.surBortle}
          inputMode="numeric"
        />
        <ChampDomaine
          domaine="sqm_mesure"
          cle="sqm"
          valeur={props.sqm}
          surValeur={props.surSqm}
          placeholder="prioritaire si renseigné"
        />
      </div>

      <MasqueHorizonSaisie
        points={props.pointsMasque}
        surPoints={props.surPointsMasque}
        masque={props.masque}
      />

      {props.cielRefus !== null && (
        <Mention ton="erreur" role="status">
          {props.cielRefus} — le ciel garde la dernière valeur valide.
        </Mention>
      )}

      {/* Les seuils de déclinaison sont une propriété de la latitude, pas de l'optique. */}
      {props.seuils !== undefined && (
        <>
          <TracedValue
            terme="seuil_imagerie"
            trace={props.seuils.decMinImagerie}
            decimales={1}
            unite="°"
          />
          <TracedValue
            terme="seuil_visuel"
            trace={props.seuils.decMinVisuel}
            decimales={1}
            unite="°"
          />
          <TracedValue
            terme="circumpolaire"
            trace={props.seuils.decCircumpolaire}
            decimales={1}
            unite="°"
          />
        </>
      )}
    </>
  )
}
