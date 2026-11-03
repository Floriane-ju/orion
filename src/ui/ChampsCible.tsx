/**
 * Fiche card magnitude + dimensions: what is aimed at.
 * T-0381 — untitled: like the preceding summary, it describes, doesn't file. Designation and type
 * moved to the summary at fiche top (repeating read the first two lines twice).
 * T-0156 — cible no longer typed. Catalogue-OR-hand regime cost more than it gave: edited
 * magnitude yields a verdict of unknown origin; cible without coordinates can't chiffrer Lune,
 * extinction or image. Embedded catalogue >13 000 objects, search spans all: missing object is
 * theoretical.
 * Values are readings via the untraced-quantity row (§6.4): from OpenNGC, not a formula, nothing
 * unfolds. T-0158 — three apparent dimensions grouped, no subtitle; T-0233 — labels "Dimension
 * grand axe" / "Dimension petit axe" read without it.
 * T-0228 — provenance no longer stated here (same for every cible): "info" tiroir of top bar.
 */

import type { ReactNode } from 'react'
import type { ObjetCielProfond } from '../data/deepsky.ts'
import { nombre } from '../registry/ecriture.ts'
import { Etiquette } from './Terme.tsx'
import { MENTION_DONNEE_MANQUANTE } from '../registry/libelles.ts'

/** §6.3 — what the catalogue doesn't carry is named; no input would change it. */
export const MANQUANTE = MENTION_DONNEE_MANQUANTE

export interface ChampsCibleProps {
  readonly objet: ObjetCielProfond
}

export function Lecture({
  libelle,
  valeur,
}: {
  /** Text, or an `Etiquette` when the label carries its glossaire bulle. */
  readonly libelle: ReactNode
  readonly valeur: string
}) {
  return (
    <p className="tracee tracee-vide">
      <span>{libelle}</span>
      <span className="tracee-valeur">{valeur}</span>
    </p>
  )
}

/**
 * T-0381 — dimensions the catalogue really carries: grand axe × petit axe on one line. Absent one
 * yields nothing. Position angle not shown: photo card's "Inclinaison objet" carries it.
 */
function lignesDimensions(objet: ObjetCielProfond) {
  const axes = [objet.majAxArcmin, objet.minAxArcmin]
    .filter((axe) => axe !== null)
    .map((axe) => `${nombre(axe, 1)}’`)
  return axes.length === 0 ? [] : [{ libelle: 'Dimensions', valeur: axes.join(' × ') }]
}

/**
 * Catalogue apparent dimensions. Absent value hidden: OpenNGC often lacks them, "donnée manquante"
 * rows would fill the place of three readings. Total emptiness is named once.
 */
function Dimensions({ objet }: ChampsCibleProps) {
  const lignes = lignesDimensions(objet)

  return (
    <>
      {lignes.length === 0 ? (
        <p className="etat">{MANQUANTE}</p>
      ) : (
        lignes.map((ligne) => (
          <Lecture key={ligne.libelle} libelle={ligne.libelle} valeur={ligne.valeur} />
        ))
      )}
    </>
  )
}

export function ChampsCible({ objet }: ChampsCibleProps) {
  return (
    <section>
      <p className="tracee tracee-vide">
        <span>
          <Etiquette cle="magnitude_integree" />
        </span>
        <span className="tracee-valeur">
          {objet.vMag === null ? MANQUANTE : objet.vMag}
        </span>
      </p>
      {/* T-0228 — no OpenNGC pointer under dimensions: constant per cible, decides nothing, reread
          at each fiche; lives in "info" tiroir with other provenances. */}
      <Dimensions objet={objet} />
    </section>
  )
}
