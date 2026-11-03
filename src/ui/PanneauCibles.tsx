/**
 * §6.4 — catalogue as a screen: what can be photographed, and what it demands.
 * REPLACES two paths asking the same question without showing the answer — Cible card's
 * "Cibles visibles" `<select>` and the settings drawer's "Chercher dans le catalogue". A third
 * path would settle nothing: the other two vanish in the same commit.
 * Default list ("Ne montrer que les objets photographiables" ticked) is about the night's
 * CRÉNEAU, never altitude at the displayed instant. §6.4 forbids it by name: "fusionner les
 * deux ferait disparaître de la vue une cible qui sera bonne dans deux heures". Galaxy at 12°
 * now, culminating at 60° before dawn = photographable, stays so.
 * No calc here. Readings from `cibles-liste.ts`; pose and facilité note arrive as props, computed
 * once by the chain reusing the plan de séance engine: list, Cible card and plan cannot
 * announce two poses or notes for one target.
 * §6.4 — type filter is a MULTIPLE choice (`types_retenus`). Toggle chips, not `<select
 * multiple>` (needs Ctrl/Cmd, impossible gloved, §11.2).
 */

import { useEffect, useMemo, type ReactNode } from 'react'
import { dureeLisible, nombre, pourcentage } from '../registry/ecriture.ts'
import {
  ajouteCoordonnees,
  filtreLignes,
  lignesInvariantes,
  photographiable,
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
import { matriceALaMinute } from '../core/horloges.ts'
import type { Site } from '../core/ephem.ts'
import type { ContexteSession } from '../core/session.ts'
import { K } from '../registry/constants.ts'
import { DOMAINES } from '../registry/domains.ts'
import { I } from '../registry/imagerie.ts'
import type { ObjetCielProfond, TypeObjet } from '../data/deepsky.ts'
import { RECALCUL_EN_COURS } from './app-calcul.ts'
import { BoutonCadrer } from './BoutonCadrer.tsx'
import type { ProfilCadre } from '../core/cadre.ts'
import { BoutonChoixCible } from './BoutonChoixCible.tsx'
import { BoutonGlyphe } from './BoutonGlyphe.tsx'
import { Bulle } from './Bulle.tsx'
import {
  BoutonProchainCreneau,
  causesCarte,
  CibleImpossible,
} from './CibleImpossible.tsx'
import { trieParPhotographiabilite } from '../core/cible-ecartee.ts'
import { Mention } from './Mention.tsx'
import { Curseur } from './Curseur.tsx'
import { Icone } from './Icone.tsx'
import { Interrupteur } from './Interrupteur.tsx'
import { Pastilles } from './Pastilles.tsx'
import { VignetteCible } from './ImageCible.tsx'
import { prechargeVignettes } from './image-cible-memoire.ts'
import { LIBELLE_TYPE_OBJET, nomCommun } from './libelles-objet.ts'
import { LIBELLE_CAUSE_ECART } from '../registry/libelles.ts'
import { ouvreCible, poseMode, survoleCible } from './seance-etat.ts'
import { ouvreReglage } from './TiroirRail.tsx'
import { majCatalogue, useCatalogue } from './catalogue-etat.ts'
import { minuteAffichee, useTrancheScene } from './scene-etat.ts'
import { compte } from './horaire.ts'
import type { Objectif } from '../core/objectif.ts'
import { champsExtremes, type Zoom } from './zoom-calcul.ts'

/** Single reference for "no parc": card memo does not redo per render. */
const PARC_VIDE: readonly Objectif[] = Object.freeze([])

const DOMAINE_MAG = DOMAINES.m_int

/**
 * T-0281 — "Aucun objet de ce nom" asserted nonexistence of catalogue objects: "NGC 224"
 * failed for lack of tolerated space, not of object. Message now says what the search was ON,
 * not a conclusion on the sky — the only info allowing a rephrase.
 */
export const RIEN_SOUS_CE_NOM =
  'Aucune désignation ni aucun nom d’usage ne correspond. La recherche porte sur les ' +
  'désignations (M42, NGC 7000) et sur les noms d’usage, français comme anglais.'

/** T-0297 — what the list says while the catalogue loads. */
export const CATALOGUE_EN_CHARGE = 'Chargement du catalogue d’objets…'

/**
 * What the "photographiables" box cuts, as hover gloss rather than a paragraph under the list
 * (T-0278 made it permanent text): describes the control, read when asked, no longer pushes
 * rows down on every matériel change. Count of too-small ones stays: it explains why a shorter
 * objectif SHORTENS the list.
 */
function aidePortee(
  seuilDeg: number,
  taille: BornesTailleCadre,
  tropPetites: number,
): string {
  const pluriel = tropPetites > 1
  return (
    `Objets à plus de ${seuilDeg}° cette nuit, dont le grand axe mesure de ` +
    `${nombre(taille.minArcmin, 0)}’ à ${nombre(taille.maxArcmin, 0)}’ — plus petit, ` +
    `l’objet ne fait que quelques pixels ; plus grand, il déborde du cadre. ` +
    `${compte(tropPetites)} objet${pluriel ? 's' : ''} du catalogue ` +
    `${pluriel ? 'sont écartés' : 'est écarté'} comme trop petit${pluriel ? 's' : ''} ` +
    `pour ce cadre.`
  )
}

export interface PanneauCiblesProps {
  readonly catalogue: readonly ObjetCielProfond[]
  readonly site: Site
  /**
   * §8.3 — sky, site and matériel of the night. List no longer gets a field-by-field copy:
   * T-0291 — fond de ciel, champ, échantillonnage, ouverture were re-copied from `calcul` and
   * `ciel`, refreshed in the KEYSTROKE render while the plan was deferred. One input, one cadence.
   */
  readonly contexteSession: ContexteSession
  /**
   * §6.4 — pose and note per designation, computed by the chain. Not computed here: Cible card
   * reads the SAME map; two separate calcs already contradicted once (card rated what the list
   * left empty).
   */
  readonly etats: ReadonlyMap<string, EtatCible>
  /** T-0283 — matériel cadre, so "Cadrer" does here what it does in the fiche. */
  readonly profil: ProfilCadre | undefined
  readonly gaiaCharge: boolean
  /** T-0404 — §6.1: a target discarded for size names the parc objectif that would frame it. */
  readonly parc?: readonly Objectif[]
  /** T-0407 — under a zoom, each row is read at its optimal focale. */
  readonly zoom?: Zoom | null
  /** T-0291 — true when what is shown is the previous input's result. */
  readonly recalcul: boolean
  /** T-0297 — catalogue not decoded yet: neither count nor "aucun objet" to say. */
  readonly enCharge?: boolean
  /** T-0188 — search field = focus fallback on return from the fiche. */
  readonly inputRef?: React.RefObject<HTMLInputElement | null>
}

export function PanneauCibles(props: PanneauCiblesProps) {
  const { catalogue, site, etats, contexteSession } = props
  const zoom = props.zoom ?? null
  const contexteDe = zoom?.contexteDe
  const { fovHDeg, echApx, dMm, capteurHMm, mLimOeil } = contexteSession
  const sbCiel = contexteSession.sbCielNoir
  // T-0182 — input lives in the store: fiche unmounts this list, a lost search would restart
  // the sort per consulted target.
  const { photographiablesSeules, recherche, types, magMax, filtresOuverts } = useCatalogue()

  // T-0056 — displayed minute, not the instant: scène publishes 2×/s, minute granularity does
  // not change altitude to the degree over 14 000 entries.
  const minute = useTrancheScene(minuteAffichee)

  // Dependencies field by field, never `props` (new object per render): 14 000 verdicts
  // recomputed per keystroke would make search unusable.
  // T-0190, T-0248 — detectability, cadrage, sort do not depend on the instant: recomputed only
  // with catalogue or optics. Minute adds only azimut and altitude.
  const invariantes = useMemo(
    () =>
      lignesInvariantes({
        catalogue,
        sbCiel,
        mLimOeil,
        dMm,
        fovHDeg,
        echApx,
        capteurHMm,
        ...(contexteDe === undefined ? {} : { contexteDe }),
      }),
    [catalogue, sbCiel, mLimOeil, dMm, fovHDeg, echApx, capteurHMm, contexteDe],
  )
  const lignes = useMemo(
    () =>
      ajouteCoordonnees(
        invariantes,
        matriceALaMinute(site, minute),
      ),
    [invariantes, site, minute],
  )

  const typesOfferts = useMemo(() => typesPresents(lignes), [lignes])

  const retenues = useMemo(() => {
    const filtrees = filtreLignes(lignes, { types, magMax, recherche })
    // A search keeps its relevance order: typed name stays on top.
    if (!photographiablesSeules) {
      return recherche.trim() === ''
        ? trieParPhotographiabilite(filtrees, etats, { fovHDeg, capteurHMm }, contexteDe)
        : filtrees
    }
    // Criterion in `cibles-liste.ts`: list, scène and add-to-plan button read one place, else
    // three sets get designated.
    return filtrees.filter((l) => photographiable(etats.get(l.objet.designation)))
  }, [lignes, types, magMax, recherche, photographiablesSeules, etats, fovHDeg, capteurHMm, contexteDe])

  // §6.4 — list top requested from network once, after input settles. RESULTS trigger → covers
  // search, scope toggle, filters. Scrolling still requests nothing.
  const aPrecharger = useMemo(
    () => retenues.slice(0, I('VIGNETTES_PRECHARGEES_MAX')).map((l) => l.objet),
    [retenues],
  )

  useEffect(() => {
    const attente = setTimeout(() => prechargeVignettes(aPrecharger), I('DELAI_PRECHARGE_MS'))
    return () => clearTimeout(attente)
  }, [aPrecharger])

  // Lock only with box ticked: catalogue browsable without suivi; the SÉANCE is closed, not the
  // object DB.
  const domaineCpFerme = photographiablesSeules
    ? contexteSession.domaineCpFerme
    : null

  // T-0278 — filter cuts by SIZE, both ways, mostly from below: sentence names both bounds,
  // count of too-small ones explains why a shorter objectif shortens the list.
  // T-0407 — under a zoom, the whole range: low bound at télé, high at wide-angle.
  const { teleDeg, grandAngleDeg } = useMemo(() => champsExtremes(zoom, fovHDeg), [zoom, fovHDeg])
  const taille = useMemo(
    () => ({
      minArcmin: bornesTailleCadre(teleDeg).minArcmin,
      maxArcmin: bornesTailleCadre(grandAngleDeg).maxArcmin,
    }),
    [teleDeg, grandAngleDeg],
  )
  const tropPetites = useMemo(() => compteTropPetites(catalogue, teleDeg), [catalogue, teleDeg])

  const attendCatalogue = props.enCharge === true && catalogue.length === 0
  const plafond = K('CIBLES_LISTEES_MAX')
  const listees = retenues.slice(0, plafond)
  const seuil = contexteSession.seuilHauteurDeg ?? K('SEUIL_HAUTEUR_IMAGERIE_DEG')

  return (
    /* T-0291 — `aria-busy` while calc in flight: sentence tells the eye, this tells assistive
       tech not to read a list being replaced. Outside live region — announcing per keystroke
       says nothing new and would cover the count T-0187 announces. */
    <section className="cibles" aria-busy={props.recalcul}>
      <div className="cibles-recherche">
        <div className="cibles-champ">
          <Icone nom="search" />
          <input
            ref={props.inputRef}
            type="search"
            aria-label="Rechercher un objet du catalogue"
            value={recherche}
            placeholder="M42, Andromède…"
            onChange={(e) => majCatalogue({ recherche: e.target.value })}
          />
        </div>
        <BoutonGlyphe
          icone="filter_list"
          classe="cibles-filtre-bouton"
          aide={filtresOuverts ? 'Masquer les filtres' : 'Filtrer par type et magnitude'}
          presse={filtresOuverts}
          onClick={() => majCatalogue({ filtresOuverts: !filtresOuverts })}
        />
      </div>

      {/* Pane unfolds IN the flow, not overlaid: nothing masks the rows the filter changes. */}
      {/* Always mounted, inert once folded: lets the fold animate, like an absent layer on the
          rail (`RailVue`). */}
      <div className="cibles-volet" data-ouvert={filtresOuverts} inert={!filtresOuverts}>
        <div>
          <div className="cibles-filtres">
            <Bulle texte={aidePortee(seuil, taille, tropPetites)} place="bas">
              <Interrupteur
                actif={photographiablesSeules}
                surChangement={(actif) => majCatalogue({ photographiablesSeules: actif })}
              >
                <span className="aide">Ne montrer que les objets photographiables</span>
              </Interrupteur>
            </Bulle>
            {/* No chip retained = no type excluded. */}
            <div className="cibles-types">
              <span className="libelle" id="cibles-types-libelle">Type</span>
              <div className="cibles-types-choix" role="group" aria-labelledby="cibles-types-libelle">
                {typesOfferts.map((t) => (
                  <ChipType
                    key={t}
                    actif={types.has(t)}
                    sur={(actif) => majCatalogue({ types: bascule(types, t, actif) })}
                  >
                    {LIBELLE_TYPE_OBJET[t]}
                  </ChipType>
                ))}
              </div>
            </div>
            <label>
              <span className="libelle">
                Magnitude max
                <span className="curseur-valeur">
                  {magMax >= DOMAINE_MAG.max ? 'toutes' : nombre(magMax, 1)}
                </span>
              </span>
              <Curseur
                libelle="Magnitude max"
                valeur={magMax}
                min={DOMAINE_MAG.min}
                max={DOMAINE_MAG.max}
                pas={DOMAINE_MAG.pas}
                texte={magMax >= DOMAINE_MAG.max ? 'toutes' : `${nombre(magMax, 1)} mag`}
                sur={(magMax) => majCatalogue({ magMax })}
              />
            </label>
          </div>
        </div>
      </div>

      {/* T-0187 — single live region for count AND empty-list message; two would announce the
          change twice. */}
      <div aria-live="polite" aria-atomic="true">
        {attendCatalogue ? (
          <p className="etat">{CATALOGUE_EN_CHARGE}</p>
        ) : (
          <p className="etat">
            {compte(retenues.length)} objet{retenues.length > 1 ? 's' : ''}
            {retenues.length > plafond ? `, les ${plafond} plus brillants affichés` : ''}.
          </p>
        )}

        {listees.length === 0 && !attendCatalogue && (
          <p className="etat">
            {/* §5.2 — closed domain: empty list = suivi missing, not a too-tight filter.
                Saying it here saves hunting the lever in the filters. */}
            {domaineCpFerme !== null
              ? domaineCpFerme
              : recherche.trim() === ''
                ? 'Aucun objet ne passe ces filtres.'
                : RIEN_SOUS_CE_NOM}
          </p>
        )}
      </div>

      {/* T-0280 — §1.5.1 promises a plan in under two minutes. New profile: list empty because
          of SUIVI, and the engine cause names neither the field lifting it nor the other exit
          (three unshown gestures). Both exits here, against the sentence motivating them: set
          the mount, or take the grand champ §5.2 leaves open without suivi.

          Outside T-0187's live region: these buttons do not change with the count;
          re-announcing per search keystroke says nothing new. */}
      {listees.length === 0 && !attendCatalogue && domaineCpFerme !== null && (
        <div className="cibles-issues">
          {/* Boîtier menu opens ON this field: T-0280 put it first in its body. */}
          <button type="button" onClick={() => ouvreReglage('boitier')}>
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
            contexte={contexteDe?.(ligne.objet) ?? contexteSession}
            profil={props.profil}
            gaiaCharge={props.gaiaCharge}
            parc={props.parc ?? PARC_VIDE}
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

/** §11.1 — state not by colour alone: retained chip carries a tick. */
function ChipType(props: {
  readonly actif: boolean
  readonly sur: (actif: boolean) => void
  readonly children: ReactNode
}) {
  return (
    <button type="button" aria-pressed={props.actif} onClick={() => props.sur(!props.actif)}>
      {props.actif && <Icone nom="check" />}
      {props.children}
    </button>
  )
}

/**
 * T-0430 — card as datasheet: image + what it names (designation, type, usual name), then a row
 * of LABELLED measures (facilité, cadre, pose). Glyph-only chips forced hovering; uppercase
 * label = product grammar for "what names". Discarded target: cause in place of measures (same
 * question — can it be photographed — same place).
 * Fiche button covers header and measures: click anywhere opens the fiche. Gestures (cadrer,
 * add to plan, go to next créneau) are its siblings in a foot named in full: `<button>` in
 * `<button>` is invalid HTML.
 */
interface LigneListeProps {
  readonly ligne: LigneCible
  readonly etat: EtatCible | null
  readonly contexte: ContexteSession
  readonly profil: ProfilCadre | undefined
  readonly gaiaCharge: boolean
  readonly parc: readonly Objectif[]
}

function LigneListe({ ligne, etat, contexte, profil, gaiaCharge, parc }: LigneListeProps) {
  const { objet } = ligne
  const nom = nomCommun(objet)
  const pose = etat?.pose ?? null
  // Memoised: card redraws every scène minute, the season does not change.
  const ecart = useMemo(
    () => (etat !== null && pose === null ? causesCarte(contexte, objet, etat, parc) : null),
    [contexte, objet, etat, pose, parc],
  )

  return (
    // Hover puts the cadre the target would get in the scène; keyboard focus too.
    <li
      className="cible-item"
      onPointerEnter={() => survoleCible(objet)}
      onPointerLeave={() => survoleCible(null)}
      onFocus={() => survoleCible(objet)}
      onBlur={() => survoleCible(null)}
    >
      <button type="button" className="cible-ligne" onClick={() => ouvreCible(objet)}>
        <span className="cible-entete">
          {/* §6.4 — cache only: list scrolling emits no request. Top-of-list prefetch fills it
              in one capped burst. */}
          <VignetteCible objet={objet} />
          <span className="cible-corps">
            <span className="cible-titre">
              <span className="cible-designation">{objet.designation}</span>
              <span className="libelle">{LIBELLE_TYPE_OBJET[objet.type]}</span>
            </span>
            {nom !== '' && <span className="cible-commun">{nom}</span>}
          </span>
        </span>
        {ecart !== null ? (
          // §8.3 — a discarded one says why on the card: a mute zero does not say which lever
          // to pull (T-0379, T-0380).
          // T-0382 — discarded for the Moon: one-sentence cause, quantified gêne stays in fiche.
          <CibleImpossible
            phrases={etat?.code === 'LUNE' ? [LIBELLE_CAUSE_ECART.LUNE] : ecart.phrases}
          />
        ) : (
          <span className="cible-mesures">
            {/* No note, no pastille: five empty pastilles read "impossible", false for a target
                the engine did not evaluate. */}
            {etat !== null && (
              <span className="cible-mesure">
                <span className="libelle">Facilité</span>
                <Pastilles note={etat.note} libelle={etat.libelle} cause={etat.cause} />
              </span>
            )}
            <span className="cible-mesure">
              <span className="libelle">Cadre</span>
              {libelleEncombrement(ligne)}
            </span>
            {pose !== null && (
              <span className="cible-mesure">
                <span className="libelle">Pose</span>
                {libellePose(pose)}
              </span>
            )}
          </span>
        )}
      </button>
      {/* After the fiche button in the DOM (= focus order): read the card before taking a
          gesture. Empty (no matériel cadre nor gesture) → foot disappears (`:empty`). */}
      <div className="cible-actions">
        <BoutonCadrer
          objet={objet}
          azimutDeg={ligne.azimutDeg}
          hauteurDeg={ligne.hauteurDeg}
          profil={profil}
          gaiaCharge={gaiaCharge}
          variante="nu"
          avecLibelle
        />
        {/* §8.3 — add to plan without opening the fiche: stacking three targets is a list
            gesture. Offered under the fiche's criterion — the pose the engine announces. */}
        {photographiable(etat ?? undefined) && (
          <BoutonChoixCible designation={objet.designation} avecLibelle />
        )}
        {ecart?.horsSaison === true && (
          <BoutonProchainCreneau
            objet={objet}
            contexte={contexte}
            profil={profil}
            gaiaCharge={gaiaCharge}
            avecLibelle
          />
        )}
        {/* T-0382 — Moon passes in a few nights: date is the lever, like season. */}
        {etat?.code === 'LUNE' && (
          <BoutonProchainCreneau
            objet={objet}
            contexte={contexte}
            profil={profil}
            gaiaCharge={gaiaCharge}
            attendre="LUNE"
            avecLibelle
          />
        )}
      </div>
    </li>
  )
}

/** §7.3 — more than one night changes the plan's nature, not just its duration: say so. */
function libellePose(pose: PoseCible): string {
  const total = dureeLisible(pose.tRequisS)
  return pose.nNuits > 1 ? `${total} · ${pose.nNuits} nuits` : total
}

/**
 * Place on the photo, nothing else: the question asked of a catalogue card. Pixel diameter
 * stays on the fiche (§6.2), where it settles detail — on a list it read as clutter.
 * T-0430 — under a zoom, share = optimal focale's (T-0407), but focale no longer named here:
 * "Cadre" box hugs its content, the fiche names the focale.
 */
function libelleEncombrement({ remplissage }: LigneCible): string {
  return remplissage === null ? 'dimensions absentes' : pourcentage(remplissage)
}
