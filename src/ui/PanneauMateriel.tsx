/**
 * §5.1 + §5.2 — matériel panel: what one has, and what it gives.
 * Cards carry only equipment properties (boîtier, focale, ouverture, sensor crop, objectif
 * type, suivi), below them the direct reading of what it produces. Lieu and date not here:
 * they describe the séance, live in the bottom bar.
 * T-0234 — two cards, not three. Camera + mount describe one station → "Boîtier" card; only
 * the objectif remains, its two numbers side by side (focale and ouverture set and re-read
 * together, `f/`).
 * T-0238 — the two cards became two rail menus (`TiroirRail`), under Site's.
 * Objectif type was lost in the grand champ view. It is a matériel property with a physical
 * consequence (§5.1): rectilinéaire vs fisheye selects the scène projection, not a render tweak.
 * Each number unfolds to its formula (§1.5.2): readings are `TracedValue`, never bare figures.
 */

import type { TypeObjectif } from '../core/optics.ts'
import { nombre, saisieLue } from '../registry/ecriture.ts'
import { Curseur } from './Curseur.tsx'
import { PAS_FOCALE_MM } from './FicheZoom.tsx'
import type { ProfilSuivi, QualiteMiseEnStation, TypeMonture } from '../core/suivi.ts'
import type {
  CapteurMode,
  IsoRetenu,
  PointZeroSysteme,
  SaisieBoitier,
} from '../data/equipment.ts'
import { TiroirRail } from './TiroirRail.tsx'
import { PanneauBoitier } from './PanneauBoitier.tsx'
import { ligneBoitier } from '../data/boitiers.ts'
import { ChampChoix } from './ChampChoix.tsx'
import { ChampDomaine } from './ChampDomaine.tsx'
import { Interrupteur } from './Interrupteur.tsx'
import { Mention } from './Mention.tsx'
import { PanneauParc } from './PanneauParc.tsx'
import type { Objectif } from '../core/objectif.ts'
import { objectifActif, reglageOptique } from './objectif-saisie.ts'

/** §5.2 — what input describes of a mount: what it tracks, how it is set up. */
export type ChoixMonture =
  | 'AUCUN'
  | 'TRACKER_SOIGNE'
  | 'TRACKER_APPROX'
  | 'GEM_SOIGNE'
  | 'GEM_APPROX'

interface ProfilMonture {
  readonly suiviActif: boolean
  readonly qualiteMes: QualiteMiseEnStation
  readonly typeMonture: TypeMonture
}

/**
 * T-0236 — without suivi the mount type has no consequence: retained one imposes nothing, no
 * meridian flip (§8.2), mise en station unset. `APPROX` and `INCONNUE` merged: `modeSuivi`
 * (core/suivi.ts) already treats both as one approximate mise en station; `INCONNUE` survives
 * only in already-stored profiles.
 */
export const PROFILS_MONTURE: Readonly<Record<ChoixMonture, ProfilMonture>> = Object.freeze({
  AUCUN: { suiviActif: false, qualiteMes: 'INCONNUE', typeMonture: 'TRACKER' },
  TRACKER_SOIGNE: { suiviActif: true, qualiteMes: 'SOIGNEE', typeMonture: 'TRACKER' },
  TRACKER_APPROX: { suiviActif: true, qualiteMes: 'APPROX', typeMonture: 'TRACKER' },
  GEM_SOIGNE: { suiviActif: true, qualiteMes: 'SOIGNEE', typeMonture: 'GEM' },
  GEM_APPROX: { suiviActif: true, qualiteMes: 'APPROX', typeMonture: 'GEM' },
})

/**
 * The choice describing a profile. Altazimutale falls back to rotule, as on reloading a profile
 * still carrying it (T-0207): selector does not offer it, keeping it would leave the field on a
 * value with no option.
 */
export function choixMonture(profil: ProfilMonture): ChoixMonture {
  if (!profil.suiviActif) return 'AUCUN'
  const soignee = profil.qualiteMes === 'SOIGNEE'
  if (profil.typeMonture === 'GEM') return soignee ? 'GEM_SOIGNE' : 'GEM_APPROX'
  return soignee ? 'TRACKER_SOIGNE' : 'TRACKER_APPROX'
}

/** What the typed matériel produces. Absent while input is refused. */
/**
 * T-0264 — four short labels that DISTINGUISH: mount type, then how it is set up. One table
 * read by selector and folded card (T-0282).
 */
export const LIBELLE_MONTURE: Readonly<Record<ChoixMonture, string>> = Object.freeze({
  AUCUN: 'Pas de suivi',
  TRACKER_SOIGNE: 'Tracker — viseur polaire',
  TRACKER_APPROX: 'Tracker — à la boussole',
  GEM_SOIGNE: 'Équatoriale — viseur polaire',
  GEM_APPROX: 'Équatoriale — à la boussole',
})

/**
 * T-0282 — folded Boîtier card says what DECIDES the pose: which sensor, tracked or not.
 * Crop mode alone left, with cards folded to free the scène, no way to check the tracker was
 * counted. Only the fact of tracking shows, not mount detail (re-readable in the selector; full
 * label lengthened the summary to truncation).
 */
export function resumeBoitier(
  boitierId: string,
  profil: Parameters<typeof choixMonture>[0],
): string {
  const boitier = ligneBoitier(boitierId)?.libelle ?? 'Boîtier personnalisé'
  return `${boitier} · ${profil.suiviActif ? 'Monture de suivi' : LIBELLE_MONTURE.AUCUN}`
}

export interface LecturesMateriel {
  readonly suivi: ProfilSuivi
  /** §7.1 — `zp_source` of the retained boîtier, shown with every pose. */
  readonly zeroSysteme: PointZeroSysteme
  /** §7.2 — retained ISO + justification. */
  readonly iso: IsoRetenu
  /** §5.1 — crop tightens the cadre without touching échantillonnage. */
  readonly noteRecadrage?: string
}

export interface PanneauMaterielProps {
  /** T-0204 — `boitiers.md` DB row, or `''` = describe the sensor by hand. */
  readonly boitierId: string
  readonly surBoitierId: (v: string) => void
  /** §5.1 — retained boîtier, + sensor quantities when typed by hand. */
  readonly boitier: SaisieBoitier
  readonly surBoitier: (v: SaisieBoitier) => void
  /** §7.2 — capture ISO; empty = the one double-gain threshold recommends. */
  readonly iso: string
  readonly surIso: (v: string) => void
  /** T-0404 — objectif parc + mounted one (`''` = free objectif). */
  readonly objectifs: readonly Objectif[]
  readonly surObjectifs: (v: readonly Objectif[]) => void
  readonly objectifId: string
  readonly surObjectifId: (v: string) => void
  readonly focale: string
  readonly surFocale: (v: string) => void
  readonly ouverture: string
  readonly surOuverture: (v: string) => void
  readonly capteurMode: CapteurMode
  readonly surCapteurMode: (v: CapteurMode) => void
  readonly typeObjectif: TypeObjectif
  readonly surTypeObjectif: (v: TypeObjectif) => void
  readonly suiviActif: boolean
  readonly surSuiviActif: (v: boolean) => void
  readonly qualiteMes: QualiteMiseEnStation
  readonly surQualiteMes: (v: QualiteMiseEnStation) => void
  readonly typeMonture: TypeMonture
  readonly surTypeMonture: (v: TypeMonture) => void
  /** Readings of current matériel, or the cause of input refusal. */
  readonly lectures?: LecturesMateriel
  readonly erreur?: string
}

/**
 * §5.2 — suivi: what the mount allows and forbids.
 * T-0234 — closes the "Boîtier" card instead of holding one. No title: field already names the
 * subject, an `h3` under a card `h2` would announce only itself.
 * T-0236 — one field, not three: switch + two selectors asked three questions, two moot until
 * the first was ticked, for five really distinct answers. Engine and stored profile keep three
 * fields (§5.2 contract, §12.3 export format); input shows one.
 */
function ChampsSuivi(props: PanneauMaterielProps) {
  const lectures = props.lectures

  function surMonture(choix: ChoixMonture) {
    const profil = PROFILS_MONTURE[choix]
    props.surSuiviActif(profil.suiviActif)
    props.surQualiteMes(profil.qualiteMes)
    props.surTypeMonture(profil.typeMonture)
  }

  return (
    <>
      <div className="champs">
        {/* T-0207/T-0237 — altazimutale is no choice while field rotation is not modelled
            (§5.2): offering it only led to a refusal. Bubble carries this scope instead of a
            fixed paragraph — concerns only the chosen suivi. */}
        <ChampChoix
          cle="type_monture"
          precision={
            props.suiviActif ? 'Les montures altazimutales ne sont pas encore gérées.' : undefined
          }
          valeur={choixMonture(props)}
          surChangement={surMonture}
        >
          {(Object.keys(LIBELLE_MONTURE) as ChoixMonture[]).map((choix) => (
            <option key={choix} value={choix}>
              {LIBELLE_MONTURE[choix]}
            </option>
          ))}
        </ChampChoix>
      </div>
      {/* §5.2 — closing ciel profond and justifying it is one gesture (core/suivi.ts): cause
          stays visible without navigating, tracked or not. Without suivi it is no input defect
          but grand champ's natural regime: `etat`, no alert sign. Long sentence (grand champ,
          NPF) stays in `profilSuivi` — `domaineCpFerme` (PanneauCibles) needs it to justify
          excluding ciel profond; this panel shows only the short marker. */}
      {lectures?.suivi.mode === 'AUCUN' && (
        <Mention ton="etat">Sans suivi, les poses restent courtes.</Mention>
      )}
      {lectures?.suivi.cause !== null &&
        lectures?.suivi.cause !== undefined &&
        lectures.suivi.mode !== 'AUCUN' && <Mention ton="cause">{lectures.suivi.cause}</Mention>}
      {lectures?.suivi.gainMiseEnStation !== undefined && (
        <Mention ton="cause">{lectures.suivi.gainMiseEnStation}</Mention>
      )}
    </>
  )
}

/**
 * T-0238 — objectif on one line for the folded card: photographer's notation, as in the printed
 * plan header. Emptied field shows "?" rather than orphan "mm f/" — without `Inconnu`'s bubble
 * (cannot sit inside a button).
 */
export function resumeOptique(focale: string, ouverture: string): string {
  const marque = (v: string) => (v.trim() === '' ? '?' : saisieLue(v))
  return `${marque(focale)} mm f/${marque(ouverture)}`
}

export function PanneauMateriel(props: PanneauMaterielProps) {
  const lectures = props.lectures
  const objectif = objectifActif(props.objectifs, props.objectifId)
  const reglage = reglageOptique(objectif, props.focale, props.ouverture)
  // Summary states the retained setting (computed, saved), not the keystroke.
  const retenu = (texte: string, b: typeof reglage.focale) =>
    b.refus !== null && Number.isFinite(b.valeur) ? String(b.valeur) : texte
  // Fixed focale has nothing to set: its parc row says it.
  const focaleReglable = objectif === null || objectif.focaleMinMm !== objectif.focaleMaxMm
  // Re-read empty setting has no rail position: thumb starts at wide-angle.
  const focaleMm = Number.isFinite(reglage.focale.valeur) ? reglage.focale.valeur : (objectif?.focaleMinMm ?? Number.NaN)
  const texteFocale = Number.isFinite(reglage.focale.valeur) ? `${nombre(focaleMm, 0)} mm` : '?'
  return (
    <>
      <TiroirRail cle="boitier" titre="Boîtier" icone="photo_camera" resume={resumeBoitier(props.boitierId, props)}>
        <PanneauBoitier
          boitierId={props.boitierId}
          surBoitierId={props.surBoitierId}
          boitier={props.boitier}
          surBoitier={props.surBoitier}
          iso={props.iso}
          surIso={props.surIso}
          capteurMode={props.capteurMode}
          surCapteurMode={props.surCapteurMode}
          noteRecadrage={lectures?.noteRecadrage}
          lectureIso={lectures?.iso}
          suivi={<ChampsSuivi {...props} />}
        />
      </TiroirRail>

      <TiroirRail
        cle="optique"
        titre="Optique"
        icone="center_focus_strong"
        resume={resumeOptique(retenu(props.focale, reglage.focale), retenu(props.ouverture, reglage.ouverture))}
      >
        {/* T-0404 — parc first: one row per objectif, the used one ticked. */}
        {props.objectifs.length > 0 && (
          <PanneauParc
            objectifs={props.objectifs}
            surObjectifs={props.surObjectifs}
            objectifId={props.objectifId}
            surObjectifId={props.surObjectifId}
          />
        )}
        {/* T-0404 — parc says everything of the objectif; remaining: a zoom's focale, the only
            thing set in séance. Ouverture = objectif's full ouverture at that focale. */}
        {/* T-0433 — zoom range bounded both sides: a rail shows it whole, nothing typed outside */}
        {objectif !== null && focaleReglable && (
          <div className="champs">
            <label>
              <span className="libelle">
                Focale
                <span className="curseur-valeur">{texteFocale}</span>
              </span>
              <Curseur
                libelle={`Focale du ${objectif.nom}`}
                valeur={focaleMm}
                min={objectif.focaleMinMm}
                max={objectif.focaleMaxMm}
                pas={PAS_FOCALE_MM}
                texte={texteFocale}
                sur={(mm) => props.surFocale(String(mm))}
              />
            </label>
          </div>
        )}
        {/* Empty parc — unreadable re-read setting: input without objectif, to fix it. */}
        {objectif === null && (
          <>
            <div className="champs paire">
              <ChampDomaine domaine="focale_mm" cle="focale" valeur={props.focale} surValeur={props.surFocale} requis />
              <ChampDomaine domaine="ouverture_N" cle="ouverture" valeur={props.ouverture} surValeur={props.surOuverture} requis />
            </div>
            <Interrupteur
              actif={props.typeObjectif === 'FISHEYE'}
              surChangement={(fisheye) => props.surTypeObjectif(fisheye ? 'FISHEYE' : 'RECTILINEAIRE')}
            >
              Objectif fisheye
            </Interrupteur>
          </>
        )}
        {/* T-0238 — refusal said under the fields that produced it, not floating over the sky. */}
        {props.erreur !== undefined && <Mention ton="erreur">{props.erreur}</Mention>}
      </TiroirRail>
    </>
  )
}
