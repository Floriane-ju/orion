/**
 * Fiche d'une cible : §6.2 cadrage, §6.3 détectabilité, §7 pose, intégration et calibration,
 * §10.2 explication dépliable.
 *
 * Toute la valeur de l'application tient dans cet écran, et il se livre avant le
 * planétarium. Ce qui est vérifiable ici, c'est la chaîne complète : d'un lieu et d'un
 * matériel jusqu'à « pose 13 s, 252 images, 8,3 Go », chaque nombre dépliable jusqu'à sa
 * formule et sa constante source.
 *
 * Ce fichier n'assemble que les régions. Le calcul est dans `fiche-cible-calcul.ts`, la
 * description de la cible dans `ChampsCible.tsx` et les verdicts dans `Verdicts.tsx`.
 *
 * T-0156 — la cible vient toujours du catalogue : sans objet désigné, il n'y a pas de fiche,
 * et c'est la carte qui le dit.
 */

import { useMemo, useState } from 'react'
import { SaisieRefuseeError } from '../registry/domains.ts'
import { PRESET_SNR_DEFAUT } from '../registry/verdicts.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import type { Site } from '../core/ephem.ts'
import type { CibleEcartee, ContexteSession } from '../core/session-types.ts'
import { ChampsCible } from './ChampsCible.tsx'
import { ImageCible } from './ImageCible.tsx'
import { Verdicts } from './Verdicts.tsx'
import { nuitFiche } from './fiche-cible-creneau.ts'
import { conseilsCible, evalue, type ContexteFiche, type Resultat } from './fiche-cible-calcul.ts'
import { Mention } from './Mention.tsx'
import { Etiquette } from './Terme.tsx'

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
}

export function FicheCible(props: FicheCibleProps) {
  const [filtreDualBand, setFiltreDualBand] = useState(false)
  /** §7.2 — mode permissif C-03 = 3, désactivé par défaut : il se choisit, il ne se subit pas. */
  const [permissif, setPermissif] = useState(false)
  const [explicationDepliee, setExplicationDepliee] = useState(false)
  const [snrCible, setSnrCible] = useState(PRESET_SNR_DEFAUT)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props, objet, snrCible, iso.iso, nuit, permissif])

  const conseils = useMemo(
    () =>
      calcul.ok
        ? conseilsCible(props, calcul.r, {
            typeObjet: objet.type,
            snrCible,
            filtreDualBand,
            explicationDepliee,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calcul, filtreDualBand, explicationDepliee, objet, snrCible, props],
  )

  const cadre =
    calcul.ok && calcul.r.cadrage !== null
      ? {
          fovLDeg: props.optique.fovLDeg.value,
          fovHDeg: props.optique.fovHDeg.value,
          angleBoitierDeg: calcul.r.cadrage.angleBoitierDeg,
        }
      : null

  return (
    <>
      {/* §6.4, §6.2 — l'objet avant ses nombres, et le cadre du capteur posé dessus. Sans
          image disponible, le composant ne rend rien : une cible sans image reste une cible
          complète. Sans cadrage calculé — pas de dimensions au catalogue — l'image reste, mais
          nue : un rectangle tracé contre un champ de repli mentirait sur l'échelle. */}
      <ImageCible objet={objet} cadre={cadre} />
      <ChampsCible objet={objet} />
      {(props.ecarteePlan ?? null) !== null && (
        <Mention ton="cause">
          <Etiquette cle="cause_exclusion" /> : {props.ecarteePlan!.cause}
        </Mention>
      )}
      {!calcul.ok && <Mention ton="erreur">{calcul.erreur}</Mention>}
      {calcul.ok && (
        <Verdicts
          r={calcul.r}
          creneau={nuit.creneau}
          snrCible={snrCible}
          surSnr={setSnrCible}
          zeroSysteme={props.zeroSysteme}
          conseils={conseils}
          permissif={permissif}
          surPermissif={setPermissif}
          filtreDualBand={filtreDualBand}
          surFiltre={setFiltreDualBand}
          surDeplie={setExplicationDepliee}
        />
      )}
    </>
  )
}
