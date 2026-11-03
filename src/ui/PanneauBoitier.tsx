/**
 * §5.1 + §7.2 — Boîtier card body: which camera, the ISO it justifies, how it tracks.
 * T-0238 — no `<section>`/`h2`: hosting `Carte` carries frame and name.
 * T-0234 — sensor format here: plein format vs APS-C crop describes the camera, not the lens;
 * under "Optique" it split one description. Suivi joined for the inverse reason (alone in its
 * card it did not fill its frame); comes via `suivi`, not 8 more props — `PanneauMateriel`
 * holds mount state, this section hosts it.
 * T-0280 — suivi OPENS the section: it decides whether ciel profond is open (§5.2), i.e. lifts
 * a new profile's empty list; last in a scrolling body it was off-screen exactly when the
 * screen asked to set it. Boîtier loses nothing: summary readable on the folded card.
 * Two modes, one selector. DB boîtier brings its sensor quantities: nothing left to set →
 * fields disappear instead of being filled by something other than the user. ISO remains,
 * from a question to an answer.
 * T-0205 — image weight is the exception, editable in both modes: not a sensor property but
 * the current RAW setting (compressed/lossless/uncompressed = 1× to 3× file on one camera).
 * DB row gives a start, not an answer.
 * Custom mode unchanged: sensor type + resolution, derived pitch, folded advanced quantities.
 * First-class path for a boîtier absent from the DB, not a fallback — no gear DB is exhaustive.
 */

import type { ReactNode } from 'react'
import { nombre } from '../registry/ecriture.ts'
import {
  notesEstimation,
  type CapteurMode,
  type IsoRetenu,
  type SaisieBoitier,
} from '../data/equipment.ts'
import { BASE_BOITIERS, ligneBoitier, type LigneBoitier } from '../data/boitiers.ts'
import {
  TABLE_FORMATS_CAPTEUR,
  ligneFormatCapteur,
  pitchDepuisFormat,
  type FormatCapteur,
  estFormatCapteur,
} from '../registry/capteur-formats.ts'
import { nombreDeTexte, type DomaineId } from '../registry/domains.ts'
import { K } from '../registry/constants.ts'
import { GLOSSAIRE, type TermeGlossaire } from '../registry/glossaire.ts'
import { Etiquette } from './Terme.tsx'
import { ChampChoix } from './ChampChoix.tsx'
import { AlerteChamp, ChampDomaine } from './ChampDomaine.tsx'
import { Bulle } from './Bulle.tsx'
import { Icone } from './Icone.tsx'
import { Mention } from './Mention.tsx'

/**
 * T-0199 — why fill a disclosure one can leave closed. Each field already carries the
 * consequence of its absence; the disclosure says what filling gains, else advanced mode
 * looks like a technical corner to close.
 */
const AIDE_AVANCEES =
  'Facultatif. Rend la pose et l’ISO propres à votre boîtier. Valeurs sur Photons to Photos.'

/**
 * §5.1 — advanced-mode quantities, input order.
 * Single list: fields traverse it, closed disclosure says which are missing. Two enumerations
 * would diverge, and the summary (read unopened) would lie.
 */
const CHAMPS_AVANCES = Object.freeze([
  { champ: 'readNoiseE', domaine: 'read_noise_e', cle: 'bruit_de_lecture' },
  { champ: 'seuilDoubleGainIso', domaine: 'seuil_double_gain_iso', cle: 'seuil_double_gain' },
  { champ: 'zpSys', domaine: 'zp_sys', cle: 'point_zero_systeme' },
] as const satisfies readonly {
  readonly champ: keyof SaisieBoitier
  readonly domaine: DomaineId
  readonly cle: TermeGlossaire
}[])

/**
 * §5.1 — cropping as chosen. Single table read by the selector and the folded card (T-0238):
 * two separate labels would stop naming the same option.
 */
export const LIBELLE_RECADRAGE: Readonly<Record<CapteurMode, string>> = Object.freeze({
  FULL_FRAME: 'Plein format',
  APSC_CROP: 'Recadrage APS-C',
})

type NotesEstimation =Readonly<Partial<Record<keyof SaisieBoitier, string>>>

/**
 * T-0199 — what the CLOSED disclosure must say. Without it field alerts show only once open:
 * a missing quantity goes unnoticed by whoever never unfolds advanced mode.
 */
function resumeManquantes(notes: NotesEstimation): string | undefined {
  const manquantes = CHAMPS_AVANCES.filter((c) => notes[c.champ] !== undefined)
  if (manquantes.length === 0) return undefined
  const s = manquantes.length > 1 ? 's' : ''
  return (
    `${manquantes.length} grandeur${s} laissée${s} vide${s} : ` +
    manquantes.map((c) => GLOSSAIRE[c.cle].libelle.toLowerCase()).join(', ') +
    '. Valeurs types utilisées [ESTIMÉ].'
  )
}

/** §5.1 — advanced-mode quantities: optional, folded behind a disclosure. */
function ChampsAvances({
  boitier,
  surChamp,
  notes,
}: {
  readonly boitier: SaisieBoitier
  readonly surChamp: (champ: keyof SaisieBoitier) => (v: string) => void
  readonly notes: NotesEstimation
}) {
  return (
    <div className="champs">
      {CHAMPS_AVANCES.map(({ champ, domaine, cle }) => (
        <ChampDomaine
          key={champ}
          domaine={domaine}
          cle={cle}
          unite
          valeur={boitier[champ]}
          surValeur={surChamp(champ)}
          note={notes[champ]}
        />
      ))}
    </div>
  )
}

/**
 * §5.1 — immediate feedback on derived pitch once the typed resolution is usable.
 * No `TracedValue`: input preview, not a traced engine formula.
 */
function ApercuPitch({
  formatCapteur,
  resolutionMpx,
}: {
  readonly formatCapteur: FormatCapteur
  readonly resolutionMpx: string
}) {
  const mpx = nombreDeTexte(resolutionMpx)
  if (!Number.isFinite(mpx) || mpx <= 0) return null
  const pitch = pitchDepuisFormat(ligneFormatCapteur(formatCapteur), mpx)
  return <p className="etat">Pitch calculé : {nombre(pitch, 2)} µm</p>
}

/**
 * T-0204 — model selector, grouped by brand. Groups keep file order, not alphabetical: DB reads
 * top-down, a boîtier is found where it was written.
 */
function SelecteurBoitier({
  boitierId,
  surBoitierId,
}: {
  readonly boitierId: string
  readonly surBoitierId: (v: string) => void
}) {
  const marques: string[] = []
  for (const b of BASE_BOITIERS) if (!marques.includes(b.marque)) marques.push(b.marque)
  return (
    <ChampChoix cle="mon_boitier" valeur={boitierId} surChangement={surBoitierId}>
      <option value="">Personnalisé — décrire le capteur</option>
      {marques.map((marque) => (
        <optgroup key={marque} label={marque}>
          {BASE_BOITIERS.filter((b) => b.marque === marque).map((b) => (
            <option key={b.id} value={b.id}>
              {b.libelle}
            </option>
          ))}
        </optgroup>
      ))}
    </ChampChoix>
  )
}

/**
 * T-0204 — what is still missing from a DB boîtier.
 * Fields vanish, not the T-0199 contract: a quantity absent from the chosen row has the same
 * consequences as one left empty by hand, and must be said somewhere.
 * `notesEstimation` does not fit: it describes an INPUT (one read noise tied to one ISO). A DB
 * row carries a curve — the input contract would blame an absence that does not exist.
 * Double-gain threshold not listed: the ISO message just below says it better.
 * T-0205 — image weight not listed either: its field stays on screen and carries the alert.
 * An empty column is not an incomplete DB when the DB was not the one to give it.
 */
function ManquesDeLaBase({ ligne }: { readonly ligne: LigneBoitier }) {
  if (Object.keys(ligne.readNoiseE).length > 0) return null
  return (
    <Mention ton="cause">
      <AlerteChamp
        note={
          `Bruit de lecture inconnu : ${K('READ_NOISE_DEFAUT_E')} e⁻ par défaut, pose [ESTIMÉ].`
        }
      />{' '}
      Base incomplète pour ce boîtier.
    </Mention>
  )
}

/**
 * §7.2 — ISO. DB boîtier: a fact, not a question.
 * Double-gain ISO is observed, not chosen — asking to type the figure just computed answers a
 * question already answered.
 * T-0206 — no longer editable at all. Row threshold designates one step only: below it read
 * noise forces longer poses, above it dynamic range is wasted. Keeping control offered a
 * setting whose every value is worse than the displayed one, and forcing it skewed the
 * computed pose. A boîtier absent from the DB keeps its field: no curve answers for it.
 */
function LigneIso({
  iso,
  surIso,
  lecture,
  fige,
}: {
  readonly iso: string
  readonly surIso: (v: string) => void
  readonly lecture?: IsoRetenu | undefined
  /** True when a DB boîtier already answers the question. */
  readonly fige: boolean
}) {
  return (
    <>
      {fige ? (
        <p className="etat">
          <Etiquette cle="iso_recommande" precision={lecture?.message} /> :{' '}
          {lecture === undefined ? '—' : lecture.iso}
        </p>
      ) : (
        <ChampDomaine
          domaine="iso_capture"
          cle="iso_recommande"
          precision={lecture?.message}
          valeur={iso}
          surValeur={surIso}
          inputMode="numeric"
          placeholder={lecture === undefined ? 'recommandé' : `recommandé : ${lecture.iso}`}
        />
      )}
    </>
  )
}

export interface PanneauBoitierProps {
  readonly boitierId: string
  readonly surBoitierId: (v: string) => void
  readonly boitier: SaisieBoitier
  readonly surBoitier: (v: SaisieBoitier) => void
  readonly iso: string
  readonly surIso: (v: string) => void
  /** §5.1 — plein format or APS-C crop: a boîtier property, not the objectif's. */
  readonly capteurMode: CapteurMode
  readonly surCapteurMode: (v: CapteurMode) => void
  /** §5.1 — crop anti-confusion message, when it applies. */
  readonly noteRecadrage?: string | undefined
  /** §7.2 — retained ISO + justification. Absent while input is refused. */
  readonly lectureIso?: IsoRetenu | undefined
  /** §5.2 — suivi, mounted by `PanneauMateriel` which holds its state. */
  readonly suivi?: ReactNode
}

export function PanneauBoitier(props: PanneauBoitierProps) {
  const ligne = ligneBoitier(props.boitierId)
  // T-0199 — notes come from the INPUT, not readings: with input refused, seeing what is
  // missing matters most, and readings are absent.
  const notes = notesEstimation(props.boitier)
  const resumeAvancees = resumeManquantes(notes)
  const surChamp = (champ: keyof SaisieBoitier) => (v: string) =>
    props.surBoitier({ ...props.boitier, [champ]: v })

  return (
    <>
      {props.suivi}
      <div className="champs">
        <SelecteurBoitier boitierId={props.boitierId} surBoitierId={props.surBoitierId} />
        {ligne === null && (
          <>
            <ChampChoix
              cle="format_capteur"
              valeur={props.boitier.formatCapteur}
              surChangement={(v) => {
                // A `<select>` renders a string: only a table value gets in.
                if (estFormatCapteur(v)) props.surBoitier({ ...props.boitier, formatCapteur: v })
              }}
            >
              {TABLE_FORMATS_CAPTEUR.map((f) => (
                <option key={f.format} value={f.format}>
                  {f.libelle}
                </option>
              ))}
            </ChampChoix>
            <ChampDomaine
              domaine="resolution_mpx"
              cle="resolution_capteur"
              unite
              valeur={props.boitier.resolutionMpx}
              surValeur={surChamp('resolutionMpx')}
              requis
            />
          </>
        )}
        {/* T-0155 — §7.3 deems the storage budget "blocking in practice". A figure deciding the
            outcome does not hide under a disclosure: varies per boîtier, only advanced quantity
            whose absence skews a displayed volume.
            T-0205 — survives choosing a DB boîtier (prefilled): RAW setting changes weight
            without changing camera. */}
        <ChampDomaine
          domaine="taille_raw_mo"
          cle="poids_image"
          unite
          valeur={props.boitier.tailleRawMo}
          surValeur={surChamp('tailleRawMo')}
          note={notes.tailleRawMo}
        />
        {/* T-0234 — survives choosing a DB boîtier, like weight: crop is a shooting MODE, not a
            characteristic of the chosen row. */}
        <ChampChoix
          cle="recadrage_capteur"
          valeur={props.capteurMode}
          surChangement={props.surCapteurMode}
        >
          <option value="FULL_FRAME">{LIBELLE_RECADRAGE.FULL_FRAME}</option>
          <option value="APSC_CROP">{LIBELLE_RECADRAGE.APSC_CROP}</option>
        </ChampChoix>
      </div>
      {props.noteRecadrage !== undefined && <Mention ton="cause">{props.noteRecadrage}</Mention>}
      {ligne === null ? (
        <>
          <ApercuPitch
            formatCapteur={props.boitier.formatCapteur}
            resolutionMpx={props.boitier.resolutionMpx}
          />
          {/* T-0199 — absence of these quantities is signalled at each field, no longer in a
              block under the section: an alert far from its cause designates nothing. The
              `zp_source` line leaves too — §7.1 requires it wherever a pose is displayed, this
              panel displays none; it lives in verdicts, filé and séance. */}
          <details className="avancees">
            <summary>
              <Bulle texte={AIDE_AVANCEES} place="bas">
                <span className="aide">Grandeurs du capteur — mode avancé</span>
              </Bulle>
              {resumeAvancees !== undefined && <AlerteChamp note={resumeAvancees} />}
              {/* Chevron replaces the native marker (left of text; a wrapping label left it
                  alone on its line). */}
              <Icone nom="expand_more" classe="chevron" />
            </summary>
            <ChampsAvances boitier={props.boitier} surChamp={surChamp} notes={notes} />
          </details>
        </>
      ) : (
        <ManquesDeLaBase ligne={ligne} />
      )}
      <LigneIso
        iso={props.iso}
        surIso={props.surIso}
        lecture={props.lectureIso}
        fige={ligne !== null}
      />
    </>
  )
}
