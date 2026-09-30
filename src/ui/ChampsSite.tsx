/**
 * §2.2 — le site : où l'on est, sous quel ciel.
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
 *
 * Le relevé manuel du masque d'horizon en est sorti : le relief du terrain se dessine déjà
 * sur le planétarium, et c'est là qu'il se lit.
 */

import type { MasqueHorizon } from '../core/site.ts'
import { libelleFlag } from '../registry/libelles.ts'
import { ChampDomaine } from './ChampDomaine.tsx'
import { Mention } from './Mention.tsx'
import { ChoixLieu } from './ChoixLieu.tsx'

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
  /** §4.1 — le masque en vigueur : un repli plat [HYP] se dit sous la carte. */
  readonly masque: MasqueHorizon
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
      {/* T-0363 — la carte écrit dans les deux champs qui suivent : ils restent la vérité. */}
      <ChoixLieu
        latitude={props.latitude}
        longitude={props.longitude}
        surLieu={(latitude, longitude) => {
          props.surLatitude(latitude)
          props.surLongitude(longitude)
        }}
        surAltitude={props.surAltitude}
      />
      {/* Le relief se lit sur le planétarium ; son absence, elle, ne s'y voit pas. Pendant un
          chargement, le masque n'a pas de note : rien ne s'affiche. */}
      {props.masque.estHypothese && props.masque.note !== undefined && (
        <Mention ton="cause">
          {props.masque.flags?.map((f) => `${libelleFlag(f)} `).join('')}
          {props.masque.note}
        </Mention>
      )}
      {/* Latitude et longitude se lisent d'un seul mot — un lieu — et se règlent ensemble :
          la paire les pose côte à côte, comme la focale et l'ouverture (T-0234). */}
      <div className="champs paire">
        <ChampDomaine
          domaine="latitude_deg"
          glisse
          cle="latitude"
          valeur={props.latitude}
          surValeur={props.surLatitude}
          requis
        />
        <ChampDomaine
          domaine="longitude_deg"
          glisse
          cle="longitude"
          valeur={props.longitude}
          surValeur={props.surLongitude}
          requis
        />
      </div>
      <div className="champs">
        <ChampDomaine
          domaine="altitude_m"
          glisse
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
          glisse
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

      {props.cielRefus !== null && (
        <Mention ton="erreur" role="status">
          {props.cielRefus} — le ciel garde la dernière valeur valide.
        </Mention>
      )}

    </>
  )
}
