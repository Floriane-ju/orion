/**
 * §5.1, T-0406 — l'ajout ou la retouche d'un objectif du parc, dans une modale.
 *
 * Le parc se lit, il ne se corrige plus en place : une ligne de quatre champs nus ne disait pas
 * ce qu'on y tapait, et recopier le dernier objectif pour le retoucher faisait passer un doublon
 * pour un ajout. La modale pose d'abord ce qui change la forme de la saisie — zoom, fisheye —,
 * puis, sous un filet, focale et ouverture max — une rangée par bout pour un zoom. La notation qui en sortira se lit
 * avant d'ajouter.
 *
 * Pas d’élément `dialog` natif : la couche du haut échapperait au masque du mode nuit (`mode-nuit.test.tsx`).
 */

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Objectif } from '../core/objectif.ts'
import { ChampDomaine } from './ChampDomaine.tsx'
import { Interrupteur } from './Interrupteur.tsx'
import { Mention } from './Mention.tsx'
import { caracteristiques, objectifDeSaisie, saisieDe, type SaisieObjectif } from './parc-saisie.ts'

export interface ModaleObjectifProps {
  /** L'objectif à retoucher ; absent, la modale en ajoute un nouveau. */
  readonly objectif?: Objectif | undefined
  readonly surValide: (o: Objectif) => void
  readonly surFermeture: () => void
}

const VIDE: SaisieObjectif = { focaleMin: '', focaleMax: '', ouvertureGrandAngle: '', ouvertureTele: '' }

export type LectureAjout = { readonly objectif: Objectif } | { readonly refus: string } | null

/** L'objectif que la saisie décrit, ou le refus qui nomme le champ ; `null` tant qu'un champ requis manque. */
export function lectureAjout(saisie: SaisieObjectif, zoom: boolean, fisheye: boolean, id: string): LectureAjout {
  // Sans zoom, les bouts télé n'existent pas : vides, ils valent focale fixe et ouverture constante.
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

/** Une focale et sa pleine ouverture, sur une rangée. */
function Bout({ focale, ouverture }: { readonly focale: ChampLie; readonly ouverture: ChampLie }) {
  return (
    <div className="champs paire">
      <ChampDomaine domaine="focale_mm" libelle="Focale" unite requis {...focale} />
      <ChampDomaine domaine="ouverture_N" libelle="Ouverture max" requis {...ouverture} />
    </div>
  )
}

/**
 * La saisie d'un objectif à retoucher. Un zoom à ouverture constante garde son ouverture télé
 * écrite : `saisieDe` la laisse vide (la ligne d'avant la lisait « constante »), et la modale
 * exige les deux bouts d'un zoom.
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
  // Retoucher garde l'identifiant : l'objectif reste à sa place dans le parc, et monté s'il l'était.
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

  // Échap s'arrête ici : la modale se ferme seule, sans emporter un tiroir ou une carte dessous.
  function touche(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    surFermeture()
  }

  return (
    <div className="modale" role="dialog" aria-modal="true" aria-labelledby={titre} onKeyDown={touche}>
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
        {/* Un bout de zoom par groupe, chacun comme une focale fixe : sa focale, son ouverture max.
            La légende du groupe distingue les deux « Focale » pour un lecteur d'écran. Le bout
            télé reste à l'écran, désactivé, hors zoom : basculer le zoom ne fait rien sauter. */}
        <fieldset className="modale-bout">
          <legend>{zoom ? 'Focale min' : 'Focale fixe'}</legend>
          <Bout focale={champ('focaleMin')} ouverture={champ('ouvertureGrandAngle')} />
        </fieldset>
        <hr />
        {/* Hors zoom, le titre s'efface en tiret : une focale fixe n'a pas de bout max. Le groupe
            garde son nom pour un lecteur d'écran, qui lirait sinon « tiret ». */}
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
