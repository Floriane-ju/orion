/**
 * §6.4 — le catalogue comme écran : ce qu'on peut photographier, et ce que ça demande.
 *
 * Ce panneau REMPLACE deux chemins qui posaient la même question sans jamais en afficher la
 * réponse — le `<select>` « Cibles visibles » de la carte Cible, et « Chercher dans le
 * catalogue » du tiroir des réglages. Un troisième chemin de plus n'aurait rien réglé : ce
 * sont les deux autres qui disparaissent au même commit.
 *
 * La liste par défaut — case « Ne montrer que les objets photographiables » cochée — porte sur le CRÉNEAU de la nuit, jamais sur la hauteur à
 * l'instant affiché. §6.4 l'interdit nommément : « fusionner les deux ferait disparaître de
 * la vue une cible qui sera bonne dans deux heures ». Une galaxie à 12° au-dessus de
 * l'horizon maintenant, qui culmine à 60° avant l'aube, est photographiable — et le reste.
 *
 * Aucun calcul ici. Les lectures viennent de `cibles-liste.ts` ; la pose et la note de
 * facilité arrivent en props, calculées une fois par la chaîne, qui réemploie le moteur du
 * plan de séance : la liste, la carte Cible et le plan ne peuvent pas annoncer deux poses —
 * ni deux notes — différentes pour la même cible.
 *
 * §6.4 — le filtre par type est un choix MULTIPLE (`types_retenus`). Des cases repliées
 * derrière un résumé plutôt qu'un `<select multiple>` : ce dernier demande Ctrl ou Cmd pour
 * cocher, ce qui ne se fait pas au gant (§11.2).
 */

import { useEffect, useMemo } from 'react'
import {
  ajouteCoordonnees,
  filtreLignes,
  lignesInvariantes,
  photographiable,
  restreintParType,
  typesPresents,
  type EtatCible,
  type LigneCible,
  type PoseCible,
} from '../core/cibles-liste.ts'
import {
  bornesTailleCadre,
  compteTropPetites,
  type BornesTailleCadre,
} from '../core/session-candidates.ts'
import { dureeLisible } from '../core/exposure.ts'
import { cielInstantane } from '../core/horloges.ts'
import type { Site } from '../core/ephem.ts'
import type { ContexteSession } from '../core/session.ts'
import { K } from '../registry/constants.ts'
import { DOMAINES } from '../registry/domains.ts'
import { I } from '../registry/imagerie.ts'
import { TYPES_OBJET, type ObjetCielProfond, type TypeObjet } from '../data/deepsky.ts'
import { RECALCUL_EN_COURS } from './app-calcul.ts'
import { BoutonVisee } from './BoutonVisee.tsx'
import { BoutonChoixCible } from './BoutonChoixCible.tsx'
import { Bulle } from './Bulle.tsx'
import { Mention } from './Mention.tsx'
import { Curseur } from './Curseur.tsx'
import { Icone } from './Icone.tsx'
import { Interrupteur } from './Interrupteur.tsx'
import { VignetteCible } from './ImageCible.tsx'
import { prechargeVignettes } from './image-cible-memoire.ts'
import { Pastilles } from './Pastilles.tsx'
import { LIBELLE_TYPE_OBJET, nomCommun } from './libelles-objet.ts'
import { ouvreCible, poseMode } from './seance-etat.ts'
import { ouvreCarte } from './coque-etat.ts'
import { majCatalogue, useCatalogue } from './catalogue-etat.ts'
import { minuteAffichee, useTrancheScene, MS_PAR_MINUTE } from './scene-etat.ts'

const DOMAINE_MAG = DOMAINES.m_int
const PAS_MAG = 0.5
const POURCENT = 100

/**
 * T-0281 — « Aucun objet de ce nom » affirmait l'inexistence d'objets bel et bien au
 * catalogue : « NGC 224 » n'y échouait pas faute d'objet, mais faute d'espace toléré. Le
 * message ne conclut donc plus sur le ciel, il dit sur QUOI la recherche a porté — c'est la
 * seule information qui permet de reformuler la demande.
 */
export const RIEN_SOUS_CE_NOM =
  'Aucune désignation ni aucun nom d’usage ne correspond. La recherche porte sur les ' +
  'désignations (M42, NGC 7000) et sur les noms d’usage, français comme anglais.'

/**
 * Ce que la case « photographiables » coupe, en une glose de survol plutôt qu'en paragraphe
 * sous la liste (T-0278 en avait fait un texte permanent) : la phrase décrit le contrôle,
 * elle se lit quand on l'interroge et ne pousse plus les lignes vers le bas à chaque
 * changement de matériel. Le compte des trop petites reste dedans — c'est lui qui explique
 * qu'un objectif plus court RACCOURCISSE la liste au lieu de l'allonger.
 */
function aidePortee(
  seuilDeg: number,
  taille: BornesTailleCadre,
  tropPetites: number,
): string {
  const pluriel = tropPetites > 1
  return (
    `Objets à plus de ${seuilDeg}° cette nuit, dont le grand axe mesure de ` +
    `${taille.minArcmin.toFixed(0)}’ à ${taille.maxArcmin.toFixed(0)}’ — plus petit, ` +
    `l’objet ne fait que quelques pixels ; plus grand, il déborde du cadre. ` +
    `${tropPetites.toLocaleString('fr-FR')} objet${pluriel ? 's' : ''} du catalogue ` +
    `${pluriel ? 'sont écartés' : 'est écarté'} comme trop petit${pluriel ? 's' : ''} ` +
    `pour ce cadre.`
  )
}

export interface PanneauCiblesProps {
  readonly catalogue: readonly ObjetCielProfond[]
  readonly site: Site
  /**
   * §8.3 — le ciel, le site et le matériel de la nuit. La liste n'en reçoit plus de copie
   * champ par champ : T-0291 — le fond de ciel, le champ, l'échantillonnage et l'ouverture y
   * étaient recopiés depuis `calcul` et `ciel`, donc rafraîchis dans le rendu de la TOUCHE,
   * pendant que le plan, lui, était différé. Une seule entrée, une seule cadence.
   */
  readonly contexteSession: ContexteSession
  /**
   * §6.4 — la pose et la note par désignation, calculées par la chaîne. Ce panneau ne les
   * calcule pas : la carte Cible lit la MÊME map, et deux calculs séparés se sont déjà
   * contredits une fois — la carte notait ce que la liste laissait vide.
   */
  readonly etats: ReadonlyMap<string, EtatCible>
  /** T-0291 — vrai quand ce qui est affiché est le résultat de la saisie précédente. */
  readonly recalcul: boolean
  /** T-0188 — le champ de recherche est le repli du focus au retour de la fiche. */
  readonly inputRef?: React.RefObject<HTMLInputElement | null>
}

export function PanneauCibles(props: PanneauCiblesProps) {
  const { catalogue, site, etats, contexteSession } = props
  const { fovHDeg, echApx, dMm, capteurHMm, mLimOeil } = contexteSession
  const sbCiel = contexteSession.sbCielNoir
  // T-0182 — la saisie vit dans le magasin : la fiche démonte cette liste, et une recherche
  // perdue au retour ferait recommencer le tri à chaque cible consultée.
  const { photographiablesSeules, recherche, types, magMax } = useCatalogue()

  // T-0056 — la minute affichée, pas l'instant : la scène publie deux fois par seconde, et
  // une minute de granularité ne change pas la hauteur au degré près sur 14 000 entrées.
  const minute = useTrancheScene(minuteAffichee)

  // Les dépendances sont énumérées champ par champ, jamais `props` : l'objet de props est
  // neuf à chaque rendu, et 14 000 verdicts recalculés à chaque frappe rendraient la
  // recherche inutilisable.
  // T-0190, T-0248 — détectabilité, cadrage et tri ne dépendent pas de l'instant : ils ne se
  // recalculent qu'avec le catalogue ou l'optique. La minute n'ajoute qu'azimut et hauteur.
  const invariantes = useMemo(
    () => lignesInvariantes({ catalogue, sbCiel, mLimOeil, dMm, fovHDeg, echApx, capteurHMm }),
    [catalogue, sbCiel, mLimOeil, dMm, fovHDeg, echApx, capteurHMm],
  )
  const lignes = useMemo(
    () =>
      ajouteCoordonnees(
        invariantes,
        cielInstantane(site, new Date(minute * MS_PAR_MINUTE)).matrice,
      ),
    [invariantes, site, minute],
  )

  const typesOfferts = useMemo(() => typesPresents(lignes), [lignes])

  const retenues = useMemo(() => {
    const filtrees = filtreLignes(lignes, { types, magMax, recherche })
    if (!photographiablesSeules) return filtrees
    // Le critère vit dans `cibles-liste.ts` : la liste, la scène et le bouton d'ajout au plan
    // le lisent au même endroit, faute de quoi ils finiraient par désigner trois ensembles.
    return filtrees.filter((l) => photographiable(etats.get(l.objet.designation)))
  }, [lignes, types, magMax, recherche, photographiablesSeules, etats])

  // §6.4 — le haut de la liste est demandé au réseau, une fois, après que la saisie s'est
  // posée. Ce sont les RÉSULTATS qui déclenchent, donc les trois gestes en sont couverts :
  // recherche, bascule de portée, filtres. Le défilement, lui, ne demande toujours rien.
  const aPrecharger = useMemo(
    () => retenues.slice(0, I('VIGNETTES_PRECHARGEES_MAX')).map((l) => l.objet),
    [retenues],
  )

  useEffect(() => {
    const attente = setTimeout(() => prechargeVignettes(aPrecharger), I('DELAI_PRECHARGE_MS'))
    return () => clearTimeout(attente)
  }, [aPrecharger])

  // Le verrou ne vaut que case cochée : le catalogue reste consultable sans suivi, c'est la
  // SÉANCE qui est fermée, pas la base d'objets.
  const domaineCpFerme = photographiablesSeules
    ? contexteSession.domaineCpFerme
    : null

  // T-0278 — le filtre coupe par la TAILLE, dans les deux sens, et surtout par le bas :
  // la phrase doit nommer ses deux bornes, et le compte de trop petites est ce qui explique
  // qu'un objectif plus court raccourcisse la liste au lieu de l'allonger.
  const taille = useMemo(() => bornesTailleCadre(fovHDeg), [fovHDeg])
  const tropPetites = useMemo(() => compteTropPetites(catalogue, fovHDeg), [catalogue, fovHDeg])

  const plafond = K('CIBLES_LISTEES_MAX')
  const listees = retenues.slice(0, plafond)
  const seuil = contexteSession.seuilHauteurDeg ?? K('SEUIL_HAUTEUR_IMAGERIE_DEG')

  return (
    /* T-0291 — `aria-busy` pendant que le calcul est en vol : la phrase ci-dessous le dit à
       l'œil, cet attribut le dit à la technologie d'assistance, qui n'a pas à lire une liste
       en train d'être remplacée. Hors région vive — l'annoncer à chaque touche ne dirait rien
       de neuf, et couvrirait le compte que T-0187 fait annoncer. */
    <section className="cibles" aria-busy={props.recalcul}>
      <input
        ref={props.inputRef}
        className="cibles-recherche"
        type="search"
        aria-label="Rechercher un objet du catalogue"
        value={recherche}
        placeholder="M42, dentelles du Cygne, NGC 7000…"
        onChange={(e) => majCatalogue({ recherche: e.target.value })}
      />

      <Bulle texte={aidePortee(seuil, taille, tropPetites)} place="bas">
        <Interrupteur
          actif={photographiablesSeules}
          surChangement={(actif) => majCatalogue({ photographiablesSeules: actif })}
        >
          <span className="aide">Ne montrer que les objets photographiables</span>
        </Interrupteur>
      </Bulle>

      <div className="cibles-filtres">
        <details className="cibles-types">
          {/* Le résumé dit la sélection fermé : un filtre replié qui restreint sans le dire
              ferait chercher pourquoi la liste est courte. */}
          <summary>
            <span className="libelle">Type</span>
            <span className="cibles-types-valeur">
              {resumeTypes(typesOfferts, types)}
              <Icone nom="expand_more" classe="chevron" />
            </span>
          </summary>
          <div className="cibles-types-choix" role="group" aria-label="Types d’objet retenus">
            <div className="cibles-types-tout">
              <button type="button" onClick={() => majCatalogue({ types: new Set(TYPES_OBJET) })}>
                Tout cocher
              </button>
              <button type="button" onClick={() => majCatalogue({ types: new Set() })}>
                Tout décocher
              </button>
            </div>
            {typesOfferts.map((t) => (
              <Interrupteur
                key={t}
                actif={types.has(t)}
                surChangement={(actif) => majCatalogue({ types: bascule(types, t, actif) })}
              >
                {LIBELLE_TYPE_OBJET[t]}
              </Interrupteur>
            ))}
          </div>
        </details>
        <label>
          <span className="libelle">
            Jusqu’à la magnitude{' '}
            <span className="cibles-mag-valeur">
              {magMax >= DOMAINE_MAG.max ? 'toutes' : magMax.toFixed(1)}
            </span>
          </span>
          <Curseur
            libelle="Jusqu’à la magnitude"
            valeur={magMax}
            min={DOMAINE_MAG.min}
            max={DOMAINE_MAG.max}
            pas={PAS_MAG}
            texte={magMax >= DOMAINE_MAG.max ? 'toutes' : `${magMax.toFixed(1)} mag`}
            sur={(magMax) => majCatalogue({ magMax })}
          />
        </label>
      </div>

      {/* T-0187 — une seule région vive pour le compte ET le message de liste vide.
          Deux régions annonceraient deux fois le même changement. */}
      <div aria-live="polite" aria-atomic="true">
        <p className="etat">
          {retenues.length.toLocaleString('fr-FR')} objet{retenues.length > 1 ? 's' : ''}
          {retenues.length > plafond ? `, les ${plafond} plus brillants affichés` : ''}.
        </p>

        {listees.length === 0 && (
          <p className="etat">
            {/* §5.2 — domaine fermé : la liste vide n'est pas un filtre trop serré, c'est le
                suivi qui manque. Le dire ici évite de chercher le levier dans les filtres. */}
            {domaineCpFerme !== null
              ? domaineCpFerme
              : recherche.trim() === ''
                ? 'Aucun objet ne passe ces filtres.'
                : RIEN_SOUS_CE_NOM}
          </p>
        )}
      </div>

      {/* T-0280 — §1.5.1 promet un plan en moins de deux minutes. Sur un profil neuf la liste
          est vide par le SUIVI, et la cause du moteur ne désigne ni le champ qui la lève ni
          l'autre issue : il fallait trois gestes que rien ne montrait. Les deux issues sont
          donc ici, contre la phrase qui les motive — régler la monture, ou prendre le grand
          champ que §5.2 laisse ouvert sans suivi.

          Hors de la région vive de T-0187 : ces boutons ne changent pas quand le compte
          change, et les réannoncer à chaque frappe de la recherche ne dirait rien de neuf. */}
      {listees.length === 0 && domaineCpFerme !== null && (
        <div className="cibles-issues">
          {/* La carte Boîtier s'ouvre SUR ce champ : T-0280 l'a mis en tête de son corps. */}
          <button type="button" onClick={() => ouvreCarte('BOITIER')}>
            Choisir une monture
          </button>
          <button type="button" onClick={() => poseMode('PANORAMA')}>
            Passer en Panorama
          </button>
        </div>
      )}

      {props.recalcul && <Mention ton="etat">{RECALCUL_EN_COURS}</Mention>}

      <ul className="cibles-liste">
        {listees.map((ligne) => (
          <LigneListe
            key={ligne.objet.designation}
            ligne={ligne}
            etat={etats.get(ligne.objet.designation) ?? null}
          />
        ))}
      </ul>

      <p className="etat cibles-note">
        Temps de pose total pour un signal/bruit de {contexteSession.snrCible}.
      </p>
    </section>
  )
}

function bascule(
  types: ReadonlySet<TypeObjet>,
  type: TypeObjet,
  actif: boolean,
): ReadonlySet<TypeObjet> {
  return new Set(actif ? [...types, type] : [...types].filter((t) => t !== type))
}

/** Compté sur les types PROPOSÉS : « 3 types sur 10 » ne doit pas compter ceux qu'on ne voit pas. */
function resumeTypes(offerts: readonly TypeObjet[], types: ReadonlySet<TypeObjet>): string {
  if (!restreintParType(types)) return 'Tous types'
  const coches = offerts.filter((t) => types.has(t))
  if (coches.length === 0) return 'Aucun type'
  if (coches.length === offerts.length) return 'Tous types'
  const [premier] = coches
  if (coches.length === 1 && premier !== undefined) return LIBELLE_TYPE_OBJET[premier]
  return `${coches.length} types sur ${offerts.length}`
}

/**
 * Une ligne : ce qui décide, dans l'ordre où on le lit. Le nom, la note, puis l'encombrement
 * sur le capteur et le temps de pose. Magnitude, hauteur et brillance de surface n'y sont plus :
 * elles filtrent et ordonnent la liste, elles ne disent rien de la prise de vue que la note et
 * le temps de pose ne disent mieux.
 *
 * Deux boutons distincts et non imbriqués : choisir la cible n'est pas la même intention que
 * pointer la scène dessus, et un `<button>` dans un `<button>` n'est pas du HTML valide.
 */
function LigneListe({ ligne, etat }: { readonly ligne: LigneCible; readonly etat: EtatCible | null }) {
  const { objet } = ligne
  const nom = nomCommun(objet)

  return (
    <li className="cible-item">
      {/* §6.4 — depuis le cache seulement : le défilement de la liste n'émet aucune requête.
          C'est le préchargement du haut de liste qui garnit ce cache, en une salve plafonnée.
          Hors du bouton, pour que l'image ne soit pas un contenu cliquable de plus. */}
      <VignetteCible objet={objet} />
      <button type="button" className="cible-ligne" onClick={() => ouvreCible(objet)}>
        <span className="cible-designation">{objet.designation}</span>
        {/* Sans note, aucune pastille : cinq pastilles vides se lisent « impossible », ce qui
            serait faux d'une cible que le moteur n'a simplement pas évaluée. */}
        {etat !== null && (
          <Pastilles note={etat.note} libelle={etat.libelle} cause={etat.cause} />
        )}
        <span className="cible-commun">{nom === '' ? LIBELLE_TYPE_OBJET[objet.type] : nom}</span>
        <span className="cible-lectures">
          {lectures(ligne, etat).map((mesure) => (
            <span key={mesure}>{mesure}</span>
          ))}
        </span>
      </button>
      <BoutonVisee
        designation={objet.designation}
        azimutDeg={ligne.azimutDeg}
        hauteurDeg={ligne.hauteurDeg}
      />
      {/* §8.3 — ajouter au plan sans ouvrir la fiche : empiler trois cibles est un geste de
          liste. Offert sous le même critère que la fiche — la pose que le moteur annonce. */}
      {photographiable(etat ?? undefined) && (
        <BoutonChoixCible designation={objet.designation} />
      )}
    </li>
  )
}

/**
 * Les lectures d'une ligne, séparées : chacune doit pouvoir tenir sur une ligne. Le temps de
 * pose vient en dernier parce qu'il dépend de tout le reste — sans évaluation du moteur, il ne
 * s'invente pas, et la lecture disparaît plutôt que d'annoncer un tiret de plus.
 */
function lectures(ligne: LigneCible, etat: EtatCible | null): readonly string[] {
  const pose = etat?.pose ?? null
  return [
    libelleEncombrement(ligne),
    ...(pose === null ? [] : [libellePose(pose)]),
  ]
}

/** §7.3 — plus d'une nuit change la nature du plan, pas seulement sa durée : ça se dit. */
function libellePose(pose: PoseCible): string {
  const total = `temps de pose ${dureeLisible(pose.tRequisS)}`
  return pose.nNuits > 1 ? `${total} · ${pose.nNuits} nuits` : total
}

/**
 * La place sur la photo, et rien d'autre : c'est la question qu'on se pose devant une ligne de
 * catalogue. Le diamètre en pixels reste sur la fiche cible (§6.2), où il tranche le détail —
 * sur une liste il se lisait comme un encombrement, ce qu'il n'est pas.
 */
function libelleEncombrement(ligne: LigneCible): string {
  const { remplissage } = ligne
  if (remplissage === null) return 'dimensions absentes'
  return `${(remplissage * POURCENT).toFixed(0)} % du cadre`
}
