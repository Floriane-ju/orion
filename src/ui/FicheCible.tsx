/**
 * Fiche d'une cible : §6.2 cadrage, §6.3 détectabilité, §7 pose et intégration.
 *
 * Toute la valeur de l'application tient dans cet écran, et il se livre avant le
 * planétarium. Ce qui est vérifiable ici, c'est la chaîne complète : d'un lieu et d'un
 * matériel jusqu'à « pose 13 s, 252 images, 8,3 Go », chaque nombre dépliable jusqu'à sa
 * formule et sa constante source.
 *
 * Ce fichier n'assemble que les régions. Le calcul est dans `fiche-cible-calcul.ts`, la
 * description de la cible dans `ChampsCible.tsx`.
 *
 * T-0156 — la cible vient toujours du catalogue : sans objet désigné, il n'y a pas de fiche,
 * et c'est la carte qui le dit.
 */

import { useMemo } from 'react'
import { SaisieRefuseeError } from '../registry/domains.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { Site } from '../core/ephem.ts'
import type { CibleEcartee, ContexteSession, EtapePlan } from '../core/session-types.ts'
import { ChampsCible, Lecture } from './ChampsCible.tsx'
import { syntheseFiche, type SyntheseFiche } from './fiche-synthese.ts'
import { heure } from './horaire.ts'
import type { EtatCible } from '../core/cibles-liste.ts'
import { ImageCible } from './ImageCible.tsx'
import { Photographie } from './FichePhotographie.tsx'
import { TracedValue } from './TracedValue.tsx'
import { nuitFiche } from './fiche-cible-creneau.ts'
import { evalue, type ContexteFiche, type Resultat } from './fiche-cible-calcul.ts'
import { Mention } from './Mention.tsx'
import { Etiquette } from './Terme.tsx'
import { majFiche, useSeance } from './seance-etat.ts'

import { LIBELLE_TYPE_OBJET, nomCommun } from './libelles-objet.ts'

export { LIBELLE_TYPE_OBJET, libelleObjet } from './libelles-objet.ts'

export interface FicheCibleProps extends ContexteFiche {
  /**
   * §3.4 — cible ouverte depuis le planétarium. Un clic sur un objet du ciel profond charge
   * ici son verdict de cadrage, de détectabilité et son plan de capture : le planétarium
   * n'est pas décoratif, c'est le point d'entrée vers les moteurs.
   */
  readonly objet: ObjetCielProfond
  /** T-0045 — le lieu, sans lequel « au-dessus de l'horizon » ne veut rien dire. */
  readonly site: Site
  /** T-0222 — la nuit du plan de séance, `null` tant qu'elle n'est pas chiffrable. */
  readonly contexteSession: ContexteSession | null
  /**
   * §8.3 — cette cible dans `plan.ciblesEcartees`, code `CONFLIT_CRENEAU` ou `BUDGET`.
   *
   * Les autres causes d'écart (cadrage, hauteur, relief, fenêtre, hors de portée, donnée
   * manquante) se recalculent déjà plus bas, indépendamment du plan — cadrage et détectabilité
   * portent leur propre verdict, le créneau sa propre cause. Ces deux-là sont différentes :
   * `evalueCandidate` ne les produit pas, elles ne naissent qu'à l'allocation de la nuit
   * (`session.ts`), quand une cible par ailleurs viable perd sa place à une autre mieux notée
   * ou au budget. Sans ce prop, rien dans la fiche ne dit qu'une cible évaluable n'est
   * pourtant pas au plan ce soir.
   */
  readonly ecarteePlan?: CibleEcartee | null
  /** T-0282 — l'étape de cette cible au plan : la tête de fiche en reprend les valeurs. */
  readonly etapePlan?: EtapePlan | null
  /** T-0381 — la note de la liste pour cette cible, lue dans la même map, jamais recalculée. */
  readonly facilite?: EtatCible | null
}

const NON_CHIFFRE = '—'

/**
 * T-0381 — la première carte dit QUOI et QUAND, comme la carte de liste dont on vient : la
 * désignation et son nom d'usage, le type, puis le créneau et la culmination. Sans titre de
 * rubrique — elle ne range rien, elle nomme. Le type est dit ici une fois, la carte suivante
 * ne le redit pas.
 */
function Resume({
  objet,
  s,
  culmination,
  extinction,
}: {
  readonly objet: ObjetCielProfond
  readonly s: SyntheseFiche | null
  /** L'heure du plus haut de la nuit, `null` sans nuit chiffrée : la ligne ne meuble pas. */
  readonly culmination: Date | null
  /** §7.6 — l'atténuation de la nuit, `null` sans créneau chiffrable. */
  readonly extinction: Resultat['extinction']
}) {
  const nom = nomCommun(objet)
  const creneau = s?.creneau ?? null
  return (
    <section>
      <div className="fiche-tete">
        <p className="fiche-resume-nom">
          <span className="cible-designation">{objet.designation}</span>
          {nom !== '' && <span>{nom}</span>}
        </p>
        <p className="fiche-resume-type">{LIBELLE_TYPE_OBJET[objet.type]}</p>
      </div>
      <Lecture
        libelle="Créneau d’observation"
        valeur={creneau === null ? NON_CHIFFRE : `${heure(creneau.debut)} → ${heure(creneau.fin)}`}
      />
      {culmination !== null && (
        <Lecture libelle={<Etiquette cle="culmination" />} valeur={heure(culmination)} />
      )}
      {/* T-0385 — la perte dans l'air est une propriété de la nuit, comme le créneau. */}
      {extinction !== null && extinction.attenuation.value !== null && (
        <TracedValue terme="extinction_atmospherique" trace={extinction.attenuation} decimales={3} />
      )}
    </section>
  )
}

export function FicheCible(props: FicheCibleProps) {
  // T-0362 — les réglages de la fiche vivent dans la séance : ils survivent au rechargement.
  const { snrCible, permissif } = useSeance().fiche

  const objet = props.objet
  const iso = props.iso
  /**
   * T-0268 — la nuit du plan de séance : créneau, Lune au milieu de ce créneau, masse d'air
   * moyenne. Mémoïsée sur la NUIT et la cible seules — pas sur l'horloge de la scène : c'est
   * ce qui rend la fiche incapable d'annoncer une pose différente selon l'heure de
   * consultation, et d'annoncer autre chose que la liste et le plan.
   */
  const nuit = useMemo(
    () => nuitFiche(props.contexteSession, objet),
    [props.contexteSession, objet],
  )

  const calcul = useMemo<{ ok: true; r: Resultat } | { ok: false; erreur: string }>(() => {
    try {
      return { ok: true, r: evalue(props, objet, snrCible, iso, nuit.lune, nuit.capture, permissif) }
    } catch (erreur) {
      if (erreur instanceof SaisieRefuseeError) return { ok: false, erreur: erreur.message }
      throw erreur
    }
  }, [props, objet, snrCible, iso.iso, nuit, permissif])

  const cadre =
    calcul.ok && calcul.r.cadrage !== null
      ? {
          fovLDeg: props.optique.fovLDeg.value,
          fovHDeg: props.optique.fovHDeg.value,
          angleBoitierDeg: calcul.r.cadrage.angleBoitierDeg,
        }
      : null

  const synthese = calcul.ok
    ? syntheseFiche(calcul.r, nuit.creneau, props.etapePlan ?? null)
    : null

  return (
    <div className="fiche">
      {/* §6.4, §6.2 — l'objet avant ses nombres, et le cadre du capteur posé dessus. Sans
          image disponible, le composant ne rend rien : une cible sans image reste une cible
          complète. Sans cadrage calculé — pas de dimensions au catalogue — l'image reste, mais
          nue : un rectangle tracé contre un champ de repli mentirait sur l'échelle. */}
      <ImageCible objet={objet} cadre={cadre} />
      <Resume
        objet={objet}
        s={synthese}
        culmination={nuit.creneau.chiffre ? nuit.creneau.creneau.heureCulmination : null}
        extinction={calcul.ok ? calcul.r.extinction : null}
      />
      <ChampsCible objet={objet} />
      {calcul.ok && synthese !== null && (
        <Photographie
          r={calcul.r}
          s={synthese}
          facilite={props.facilite ?? null}
          snrCible={snrCible}
          surSnr={(snrCible) => majFiche({ snrCible })}
          zeroSysteme={props.zeroSysteme}
          permissif={permissif}
          surPermissif={(permissif) => majFiche({ permissif })}
        />
      )}
      {(props.ecarteePlan ?? null) !== null && (
        <Mention ton="cause">
          <Etiquette cle="cause_exclusion" /> : {props.ecarteePlan!.cause}
        </Mention>
      )}
      {!calcul.ok && <Mention ton="erreur">{calcul.erreur}</Mention>}
    </div>
  )
}
