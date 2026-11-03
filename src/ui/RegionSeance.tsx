/**
 * §11.3 — what coque puts on scène + what it opens beside it.
 * T-0113 — 4-tab panel removed: vue + cible tuned WHILE watching sky → foldable scène cards;
 * plan de nuit + filé read top-down → side panel. Fold frees scène, keeps state.
 * T-0181 — panel always present, mode picks content.
 * T-0238 — matériel back to cards (column since T-0197): `PanneauMateriel`, mounted by app.
 */

import { useRef, useEffect, type ReactNode } from 'react'
import { degres, saisieLue } from '../registry/ecriture.ts'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { photographiable, type EtatCible } from '../core/cibles-liste.ts'
import type { Etoile } from '../data/catalog.ts'
import type { PaquetConstellations } from '../data/constellations.ts'
import { libelleZpSource } from '../data/equipment.ts'
import { TiroirRail } from './TiroirRail.tsx'
import { ChampsSite } from './ChampsSite.tsx'
import { RailVue } from './RailVue.tsx'
import { PanneauLateral } from './PanneauLateral.tsx'
import { PanneauCibles } from './PanneauCibles.tsx'
import { PanneauFile } from './PanneauFile.tsx'
import { FicheSousZoom } from './FicheZoom.tsx'
import { Pastilles } from './Pastilles.tsx'
import { Bulle } from './Bulle.tsx'
import { AlignementCible, cadreA, CadrerCible } from './BoutonCadrer.tsx'
import { BoutonChoixCible } from './BoutonChoixCible.tsx'
import { PlanSessionVue } from './PlanSession.tsx'
import { RegionNuit } from './RegionNuit.tsx'
import { CarteNuit, LectureNuit } from './CarteNuit.tsx'
import { modeObjectif } from '../core/optics.ts'
import {
  modeSeance,
  montreListeCibles,
  useTrancheSeance,
  vueCiblesSeance,
  type VueCibles,
} from './seance-etat.ts'
import { AIDE_MATERIEL_INCOMPLET } from './Inconnu.tsx'
import type { SaisieLieu, SaisieMateriel } from './app-saisie.ts'
import { RECALCUL_EN_COURS, type ChaineCalcul } from './app-calcul.ts'
import { Mention } from './Mention.tsx'
import { cibleFocus, idLigneCible } from './focus-panneau.ts'
import { nombreDeTexte } from '../registry/domains.ts'
import { titreFiche } from './libelles-objet.ts'

export interface RegionSeanceProps {
  readonly chaine: ChaineCalcul
  readonly lieu: SaisieLieu
  readonly materiel: SaisieMateriel
  readonly catalogue: readonly ObjetCielProfond[]
  /** T-0297 — catalogue not decoded yet: empty list ≠ result. */
  readonly catalogueEnCharge: boolean
  readonly etoiles: readonly Etoile[]
  /** §3.4 — figures, frontières, named stars; §8.4 takes its anchor names from it. */
  readonly constellations: PaquetConstellations
  /** §3.4 — cible opened from planétarium, `null` until one is. */
  readonly cibleDuCiel: ObjetCielProfond | null
  readonly gaiaCharge: boolean
  readonly epoqueAnnee: number
}

/** Lat/lon at 1 decimal for folded header. Mid-typing input (empty, "-") → "?", not "NaN". */
export function resumeSite(latitude: string, longitude: string): string {
  const arrondi = (v: string) => {
    const n = nombreDeTexte(v)
    return v.trim() === '' || !Number.isFinite(n) ? '?' : degres(n, 1)
  }
  return `${arrondi(latitude)} / ${arrondi(longitude)}`
}

/**
 * Scène cards. Folded body NOT mounted: no store subscriptions, no recompute per visée gesture.
 * T-0213 — vue rail mounted here, not a card: always visible, reads only the 3 scène slices its
 * toggles need. Site/Boîtier/Optique = 3 menus under calques (`TiroirRail`).
 */
export function CartesSeance(props: RegionSeanceProps & { readonly cartesMateriel: ReactNode }) {
  const { chaine, lieu, materiel } = props

  return (
    <RailVue
      modeObjectif={modeObjectif(materiel.typeObjectif)}
      gaiaCharge={props.gaiaCharge}
      epoqueAnnee={props.epoqueAnnee}
      masque={chaine.masque}
      reglages={
        <>
          {/* Lieu READ on folded header, SET unfolded. 1 decimal: summary says where, exact
              value lives in fields. */}
          <TiroirRail cle="site" titre="Site" icone="location_on" resume={resumeSite(lieu.latitude, lieu.longitude)}>
            <ChampsSite
              latitude={lieu.latitude}
              surLatitude={lieu.surLatitude}
              longitude={lieu.longitude}
              surLongitude={lieu.surLongitude}
              altitude={lieu.altitude}
              bortle={lieu.bortle}
              surBortle={lieu.surBortle}
              sqm={lieu.sqm}
              surSqm={lieu.surSqm}
              masque={chaine.masque}
              cielRefus={chaine.cielRefus}
            />
          </TiroirRail>
          {props.cartesMateriel}
        </>
      }
    />
  )
}

/**
 * "Mon plan" tab: fenêtre nocturne, then plan de session. Stays mounted hidden: plan = ONLY
 * printable region (§11.2); unmounted → blank print from another tab. 2nd copy → 2 export
 * `<textarea>` in tree.
 */
function PlanNuit(props: RegionSeanceProps) {
  const { chaine, lieu, materiel } = props
  const { calcul, ciel } = chaine

  /* §11.2 — only region surviving print; named for that. */
  const planImprimable =
    calcul.ok && ciel.ok && chaine.plan !== null && chaine.fenetreUtile !== null ? (
      <PlanSessionVue
        plan={chaine.plan}
        site={chaine.site}
        fovHDeg={calcul.optique.fovHDeg.value}
        fovLDeg={calcul.optique.fovLDeg.value}
        mLimOeil={ciel.ciel.mLimOeil.value}
        etoiles={props.etoiles}
        nommees={props.constellations.etoilesNommees}
        gaiaCharge={props.gaiaCharge}
        enTete={{
          nuitIso: lieu.nuitIso,
          lieu: `${saisieLue(lieu.latitude)}° / ${saisieLue(lieu.longitude)}° — Bortle ${saisieLue(lieu.bortle)}`,
          materiel:
            `${saisieLue(materiel.focale)} mm f/${saisieLue(materiel.ouverture)} — ${calcul.boitier.libelle} · ` +
            `ISO ${calcul.iso.iso} · ${libelleZpSource(calcul.zeroSysteme)}`,
        }}
      />
    ) : null

  return (
    <>
      {ciel.ok && (
        <RegionNuit
          nuit={ciel.nuit}
          ciel={ciel.ciel}
          offsetMidi={ciel.offsetMidi}
          nuitIso={lieu.nuitIso}
          planIndisponible={chaine.plan === null && props.catalogue.length === 0}
        />
      )}
      {/* T-0291 — plan computed off typing render; in flight, block shows previous input's plan
          and says so (créneau time vs typed focale would be wrong unannounced). */}
      {chaine.recalculEnCours && <Mention ton="etat">{RECALCUL_EN_COURS}</Mention>}
      <div className="plan-session" aria-busy={chaine.recalculEnCours}>
        {planImprimable}
      </div>
    </>
  )
}

/**
 * §6.4 — facilité reminder: pastilles only, glose on hover.
 * Word "Facilité" pushed controls to 2nd header line + ambiguous. `Bulle` names it in one
 * sentence + cause d'écart on note 0 (bare 0 gives no lever). `Bulle` ≠ `title` — T-0147:
 * native tooltip unreachable by §11.1 palette → white lamp in night UI.
 */
function RappelFacilite({ etat }: { readonly etat: EtatCible }) {
  const glose =
    etat.cause === null
      ? 'Facilité de prise de vue avec ce matériel, cette nuit.'
      : `Facilité de prise de vue avec ce matériel, cette nuit. ${etat.cause}`
  return (
    <Bulle texte={glose} place="bas">
      <span className="carte-rappel-glose">
        <Pastilles note={etat.note} libelle={etat.libelle} />
      </span>
    </Bulle>
  )
}

/**
 * Side panel + printable plan.
 * T-0181 — mode decides: Ciel profond = catalogue cible, Panorama = panorama settings,
 * "Mon plan" = nuit + plan reread. Only plan stays mounted hidden (print).
 * T-0188 — focus management on panel content change.
 */
export function LateralSeance(props: RegionSeanceProps) {
  const { chaine, catalogue } = props
  const mode = useTrancheSeance(modeSeance)
  const vueCibles = useTrancheSeance(vueCiblesSeance)

  /* §3.4 — fiche only on designated cible: `ouvreCible` sets both, nothing else leads here. */
  const fiche = mode === 'CIEL_PROFOND' && vueCibles === 'FICHE' && props.cibleDuCiel !== null

  /**
   * §6.4 — note READ from chain map, not recomputed (= catalogue row entry): 2 engine calls =
   * 2 couvertures to sync (they weren't). ONLY in header: fiche details cadrage/pose/intégration.
   */
  const facilite =
    props.cibleDuCiel === null
      ? null
      : chaine.etatsCibles.get(props.cibleDuCiel.designation) ?? null

  /**
   * §8.3 — `CONFLIT_CRENEAU` born at nuit allocation only; fiche can't recompute it (unlike
   * cadrage/détectabilité/créneau). Via `chaine.plan.ciblesEcartees`.
   * T-0322 — now the ONLY allocation écart: budget no longer drops cible, short nuit shown on
   * étape, cible kept in plan with its nuit count.
   */
  const cible = props.cibleDuCiel
  const ecarteePlan =
    cible === null || chaine.plan === null
      ? null
      : (chaine.plan.ciblesEcartees.find(
          (c) => c.designation === cible.designation && c.code === 'CONFLIT_CRENEAU',
        ) ?? null)

  const etapePlan =
    cible === null || chaine.plan === null
      ? null
      : (chaine.plan.etapes.find((e) => e.objet.designation === cible.designation) ?? null)

  // T-0188 — focus follows panel content. List/fiche never coexist: the one holding focus is
  // already unmounted when effect runs.
  const titreRef = useRef<HTMLHeadingElement | null>(null)
  const rechercheRef = useRef<HTMLInputElement | null>(null)
  const vuePrecedente = useRef<VueCibles>(vueCibles)

  useEffect(() => {
    const precedente = vuePrecedente.current
    vuePrecedente.current = vueCibles

    // Consulted cible's row: just lifted, or filters dropped it meanwhile — fallback covers it.
    const ligne =
      props.cibleDuCiel === null
        ? null
        : document.getElementById(idLigneCible(props.cibleDuCiel.designation))

    switch (cibleFocus(precedente, vueCibles, ligne !== null)) {
      case 'TITRE_FICHE':
        titreRef.current?.focus()
        break
      case 'LIGNE_CIBLE':
        ligne?.focus()
        break
      case 'CHAMP_RECHERCHE':
        rechercheRef.current?.focus()
        break
      default:
        break
    }
  }, [vueCibles, props.cibleDuCiel])

  return (
    <PanneauLateral
      fiche={
        fiche && props.cibleDuCiel !== null
          ? {
              // T-0282 — "M31" means nothing to Andromède seekers: common name follows.
              titre: titreFiche(props.cibleDuCiel),
              retour: montreListeCibles,
              rappel: (
                <span className="lateral-actions">
                  {facilite !== null && <RappelFacilite etat={facilite} />}
                  {/* T-0221, T-0283 — viser + cadrer from fiche, one gesture. */}
                  <CadrerCible
                    objet={props.cibleDuCiel}
                    site={chaine.site}
                    profil={chaine.profilsCadre[0]}
                    gaiaCharge={props.gaiaCharge}
                  />
                  <AlignementCible
                    objet={props.cibleDuCiel}
                    site={chaine.site}
                    profil={chaine.profilsCadre[0]}
                  />
                  {/* §8.3 — gesture composing the plan. Same predicate as list: what nuit
                      forbids isn't added. */}
                  {photographiable(facilite ?? undefined) && (
                    <BoutonChoixCible designation={props.cibleDuCiel.designation} />
                  )}
                </span>
              ),
            }
          : null
      }
      titreRef={titreRef}
    >
      <>
        {mode === 'PLAN' ? null : fiche && props.cibleDuCiel !== null ? (
          /* T-0149 — no chiffrable optique: fiche says what's missing instead of padding. */
          chaine.contexteFiche === null ? (
            <p className="etat">{AIDE_MATERIEL_INCOMPLET}</p>
          ) : (
            <FicheSousZoom
              zoom={chaine.zoom}
              {...chaine.contexteFiche}
              objet={props.cibleDuCiel}
              site={chaine.site}
              contexteSession={chaine.contexteSession}
              ecarteePlan={ecarteePlan}
              etapePlan={etapePlan}
              facilite={facilite}
              vaAInstant={(instant) =>
                cadreA(
                  props.cibleDuCiel!,
                  chaine.site,
                  chaine.profilsCadre[0],
                  props.gaiaCharge,
                  instant,
                )
              }
            />
          )
        ) : mode === 'PANORAMA' ? (
          chaine.panneauFile === null ? (
            <p className="etat">{AIDE_MATERIEL_INCOMPLET}</p>
          ) : (
            <PanneauFile {...chaine.panneauFile} />
          )
        ) : /* T-0149 — list chiffre a cadrage: no optique → says what's missing.
               T-0291 — mounted by contexte de séance, not `calcul.ok && ciel.ok`: equivalent,
               but list reads from the former and it carries the deferred cadence. */
        chaine.contexteSession !== null ? (
          <PanneauCibles
            catalogue={catalogue}
            site={chaine.site}
            contexteSession={chaine.contexteSession}
            etats={chaine.etatsCibles}
            profil={chaine.profilsCadre[0]}
            gaiaCharge={props.gaiaCharge}
            parc={props.materiel.objectifs}
            zoom={chaine.zoom}
            recalcul={chaine.recalculEnCours}
            enCharge={props.catalogueEnCharge}
            inputRef={rechercheRef}
          />
        ) : (
          <p className="etat">{AIDE_MATERIEL_INCOMPLET}</p>
        )}
        <div className="lateral-plan" {...(mode === 'PLAN' ? {} : { hidden: true })}>
          <PlanNuit {...props} />
        </div>
      </>
    </PanneauLateral>
  )
}

/**
 * T-0346 — nuit; T-0411 — top bar, tied to clock. Needs only lieu + date: any mode, no matériel.
 * Out of séance panel: no scroll with list, no push.
 */
export function NuitSeance({ chaine }: RegionSeanceProps) {
  return chaine.ciel.ok ? <CarteNuit site={chaine.site} nuit={chaine.ciel.nuit} /> : null
}

/** T-0412 — phase + Lune at instant, under clock; absent without ciel, like frise. */
export function LectureSeance({ chaine }: RegionSeanceProps) {
  return chaine.ciel.ok ? <LectureNuit site={chaine.site} /> : null
}
