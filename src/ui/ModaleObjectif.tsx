/**
 * §5.1, T-0406 — add or edit a parc objectif, in a modal.
 * Parc is read, no longer edited in place (row of 4 bare fields hid what was typed; copying
 * the last objectif to edit it passed a duplicate for an add). Modal first sets what changes
 * input shape (zoom, fisheye), then focale + ouverture max (one row per end for a zoom).
 * Resulting notation readable before adding.
 * No native `dialog`: top layer would escape the mode nuit mask (`mode-nuit.test.tsx`).
 */

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Objectif } from '../core/objectif.ts'
import { ChampDomaine } from './ChampDomaine.tsx'
import { Interrupteur } from './Interrupteur.tsx'
import { Mention } from './Mention.tsx'
import { caracteristiques, objectifDeSaisie, saisieDe, type SaisieObjectif } from './parc-saisie.ts'

export interface ModaleObjectifProps {
  /** Objectif to edit; absent = add. */
  readonly objectif?: Objectif | undefined
  readonly surValide: (o: Objectif) => void
  readonly surFermeture: () => void
}

const VIDE: SaisieObjectif = { focaleMin: '', focaleMax: '', ouvertureGrandAngle: '', ouvertureTele: '' }

export type LectureAjout = { readonly objectif: Objectif } | { readonly refus: string } | null

/** Objectif the input describes, or the refusal naming the field; `null` if a field is missing. */
export function lectureAjout(saisie: SaisieObjectif, zoom: boolean, fisheye: boolean, id: string): LectureAjout {
  // No zoom: télé ends do not exist; empty = fixed focale, constant ouverture.
  const retenue = zoom ? saisie : { ...saisie, focaleMax: '', ouvertureTele: '' }
  const requis = zoom ? Object.values(retenue) : [retenue.focaleMin, retenue.ouvertureGrandAngle]
  if (requis.some((t) => t.trim() === '')) return null
  try {
    return { objectif: objectifDeSaisie(retenue, id, fisheye ? 'FISHEYE' : 'RECTILINEAIRE') }
  } catch (erreur) {
    return { refus: erreur instanceof Error ? erreur.message : 'Objectif incohérent.' }
  }
}

interface ChampLie {
  readonly valeur: string
  readonly surValeur: (v: string) => void
}

/** One focale and its max ouverture, on a row. */
function Bout({ focale, ouverture }: { readonly focale: ChampLie; readonly ouverture: ChampLie }) {
  return (
    <div className="champs paire">
      <ChampDomaine domaine="focale_mm" libelle="Focale" unite requis {...focale} />
      <ChampDomaine domaine="ouverture_N" libelle="Ouverture max" requis {...ouverture} />
    </div>
  )
}

/**
 * Input of an objectif to edit. Constant-ouverture zoom keeps its télé ouverture written:
 * `saisieDe` leaves it empty (old row read "constante"), the modal requires both zoom ends.
 */
function saisieModale(objectif: Objectif): SaisieObjectif {
  const zoom = objectif.focaleMinMm !== objectif.focaleMaxMm
  return {
    ...saisieDe(objectif),
    ...(zoom ? { focaleMax: String(objectif.focaleMaxMm), ouvertureTele: String(objectif.ouvertureTeleN) } : {}),
  }
}

export function ModaleObjectif({ objectif, surValide, surFermeture }: ModaleObjectifProps) {
  const [zoom, setZoom] = useState(objectif !== undefined && objectif.focaleMinMm !== objectif.focaleMaxMm)
  const [saisie, setSaisie] = useState(() => (objectif === undefined ? VIDE : saisieModale(objectif)))
  const [fisheye, setFisheye] = useState(objectif?.typeObjectif === 'FISHEYE')
  // Editing keeps the id: objectif stays in place in the parc, and mounted if it was.
  const [id] = useState(() => objectif?.id ?? crypto.randomUUID())
  const titre = useId()
  const corps = useRef<HTMLFormElement>(null)

  useEffect(() => {
    corps.current?.querySelector('input')?.focus()
  }, [])

  const lecture = lectureAjout(saisie, zoom, fisheye, id)
  const champ = (cle: keyof SaisieObjectif): ChampLie => ({
    valeur: saisie[cle],
    surValeur: (v: string) => setSaisie({ ...saisie, [cle]: v }),
  })

  function valide(e: FormEvent) {
    e.preventDefault()
    if (lecture !== null && 'objectif' in lecture) surValide(lecture.objectif)
  }

  // Escape stops here: modal closes alone, not a drawer or card below.
  // `tabIndex={-1}` on the veil: click outside fields keeps focus there, not on `body`
  // where this listener no longer heard Escape.
  function touche(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    surFermeture()
  }

  return (
    <div className="modale" role="dialog" aria-modal="true" aria-labelledby={titre} tabIndex={-1} onKeyDown={touche}>
      <form ref={corps} className="modale-corps" onSubmit={valide}>
        <header className="modale-entete">
          <h2 id={titre}>{objectif === undefined ? 'Ajouter un objectif' : 'Modifier l’objectif'}</h2>
        </header>
        <Interrupteur switch actif={zoom} surChangement={setZoom}>
          Zoom
        </Interrupteur>
        <Interrupteur switch actif={fisheye} surChangement={setFisheye}>
          Objectif fisheye
        </Interrupteur>
        <hr />
        {/* One zoom end per group, each like a fixed focale: its focale, its max ouverture.
            Legend tells the two "Focale" apart for screen readers. Télé end stays on screen,
            disabled, outside zoom: toggling zoom jumps nothing. */}
        <fieldset className="modale-bout">
          <legend>{zoom ? 'Focale min' : 'Focale fixe'}</legend>
          <Bout focale={champ('focaleMin')} ouverture={champ('ouvertureGrandAngle')} />
        </fieldset>
        <hr />
        {/* Outside zoom the title fades to a dash: fixed focale has no max end. Group keeps its
            name for screen readers (else "tiret"). */}
        <fieldset className="modale-bout" disabled={!zoom} aria-label="Focale max">
          <legend>{zoom ? 'Focale max' : '-'}</legend>
          <Bout focale={champ('focaleMax')} ouverture={champ('ouvertureTele')} />
        </fieldset>
        {lecture !== null && 'refus' in lecture && (
          <Mention ton="erreur" role="alert">
            {lecture.refus}
          </Mention>
        )}
        {lecture !== null && 'objectif' in lecture && (
          <Mention ton="etat" role="status">
            {caracteristiques(lecture.objectif)}
          </Mention>
        )}
        <div className="modale-actions">
          <button type="button" onClick={surFermeture}>
            Annuler
          </button>
          <button type="submit" disabled={lecture === null || 'refus' in lecture}>
            {objectif === undefined ? 'Ajouter' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  )
}
