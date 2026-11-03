/**
 * §1.5 critère 2, §10.2 — every displayed number carries formula + source constant;
 * §10.1 — label carries its definition on contact.
 * T-0386 — label bulle = glose + what glossaire keeps (`bulle`). Full chain (value, formula,
 * inputs, constants) registers in `traces-affichees.ts`; info modal "Calcul" section renders it
 * (§10.2 N3). Consumed constant = ordre de grandeur → value comes with its plage: never present
 * as exact an output that can't be.
 */

import { useEffect, useId } from 'react'
import type { Traced } from '../core/traced.ts'
import { dependDUnOrdreDeGrandeur } from '../core/traced.ts'
import type { TermeGlossaire } from '../registry/glossaire.ts'
import { GLOSSAIRE } from '../registry/glossaire.ts'
import { degres, nombre, nombreLibre } from '../registry/ecriture.ts'
import { POURCENT } from '../core/unites.ts'
import { sansSection } from './sans-section.ts'
import { Etiquette } from './Terme.tsx'
import { inscritTrace, retireTrace } from './traces-affichees.ts'
import { MENTION_DONNEE_MANQUANTE, libelleEntree, libelleFlag } from '../registry/libelles.ts'

interface TracedValueProps {
  /** Glossaire key: label without definition doesn't compile (§10.1). */
  readonly terme: TermeGlossaire
  readonly trace: Traced<number | null>
  readonly decimales?: number
  readonly unite?: string
  /** Non-technical precision when one term serves twice (largeur / hauteur). */
  readonly suffixe?: string
  /** T-0276 — a fraction reads as percent: "0,261" without unit says nothing. */
  readonly pourcent?: boolean
}

/** Degree sticks to number; any other unit detaches by a space. */
function formate(valeur: number | null, decimales: number, unite?: string): string | null {
  if (valeur === null) return null
  if (unite === '°') return degres(valeur, decimales)
  return `${nombre(valeur, decimales)}${unite === undefined ? '' : ` ${unite}`}`
}

/** `{cle}` of the explication, replaced by the traced entry of same key. */
function explicationAvec(
  explication: string | undefined,
  inputs: Traced<number | null>['inputs'],
): string | undefined {
  return explication?.replace(/\{([a-z_]+)\}/g, (marque, cle: string) => {
    const entree = inputs[cle]
    if (entree === undefined) return marque
    return entree === null ? MENTION_DONNEE_MANQUANTE : nombreLibre(entree)
  })
}

interface DetailTraceProps {
  readonly terme: TermeGlossaire
  readonly trace: Traced<number | null>
  readonly valeur: string | null
}

/** What bulle keeps: glose, then what glossaire adds. */
function BulleTrace({ terme, trace }: Omit<DetailTraceProps, 'valeur'>) {
  const entree = GLOSSAIRE[terme]
  const ajouts = entree.bulle ?? []
  return (
    <>
      {entree.glose !== undefined && <span className="bulle-ligne">{entree.glose}</span>}
      {ajouts.includes('explication') && entree.explication !== undefined && (
        <span className="bulle-ligne">{explicationAvec(entree.explication, trace.inputs)}</span>
      )}
      {ajouts.includes('consequence') && entree.consequence !== undefined && (
        <span className="bulle-ligne">{entree.consequence}</span>
      )}
    </>
  )
}

/** Full chain, as lines: `span`s, the section sets them in a `<p>`. */
export function DetailTrace({
  terme,
  trace,
  valeur,
}: DetailTraceProps) {
  const entree = GLOSSAIRE[terme]
  return (
    <>
      {entree.explication !== undefined && (
        <span className="bulle-ligne">{explicationAvec(entree.explication, trace.inputs)}</span>
      )}
      <span className="bulle-ligne">
        {valeur === null
          ? 'Pas encore calculée : complétez le lieu ou le matériel.'
          : `Votre valeur : ${valeur}`}
      </span>
      {entree.consequence !== undefined && (
        <span className="bulle-ligne">{entree.consequence}</span>
      )}
      <span className="bulle-ligne">
        <code>{trace.formula.expression}</code>
      </span>
      {trace.formula.note !== undefined && (
        <span className="bulle-ligne">{sansSection(trace.formula.note)}</span>
      )}
      {Object.entries(trace.inputs).map(([nom, valeurEntree]) => (
        <span key={nom} className="bulle-ligne">
          {libelleEntree(nom)} : {valeurEntree === null ? MENTION_DONNEE_MANQUANTE : nombreLibre(valeurEntree)}
        </span>
      ))}
      {trace.constants.map((c) => (
        <span key={c.id} className="bulle-ligne">
          {c.ref} {c.libelle} = {nombreLibre(c.valeur)} {c.unite} — source : {sansSection(c.source)}
          {c.tolerance !== null ? ` · tolérance : ${sansSection(c.tolerance)}` : ' · valeur exacte'}
        </span>
      ))}
      {trace.flags !== undefined && (
        <span className="bulle-ligne">{trace.flags.map(libelleFlag).join(' ')}</span>
      )}
      {trace.note !== undefined && <span className="bulle-ligne">{sansSection(trace.note)}</span>}
    </>
  )
}

export function TracedValue({
  terme,
  trace,
  decimales = 2,
  unite: uniteDemandee,
  suffixe,
  pourcent = false,
}: TracedValueProps) {
  const approximatif = dependDUnOrdreDeGrandeur(trace)
  const echelle = pourcent ? POURCENT : 1
  const unite = pourcent ? '%' : uniteDemandee
  const valeur = formate(trace.value === null ? null : trace.value * echelle, decimales, unite)
  // Plage brackets value, never replaces it: stays readable, not presented as exact (§2.1).
  const plage =
    trace.range === undefined
      ? null
      : `${nombre(trace.range[0] * echelle, decimales)} à ${formate(trace.range[1] * echelle, decimales, unite) ?? ''}`

  const id = useId()
  useEffect(() => {
    inscritTrace(id, { terme, suffixe, trace, valeur })
  }, [id, terme, suffixe, trace, valeur])
  useEffect(() => () => retireTrace(id), [id])

  return (
    <p className="tracee tracee-vide">
      <span>
        <Etiquette cle={terme} bulle={<BulleTrace terme={terme} trace={trace} />} />
        {suffixe !== undefined && <span className="tracee-suffixe"> — {suffixe}</span>}
      </span>
      <span className="tracee-valeur">
        {valeur ?? MENTION_DONNEE_MANQUANTE}
        {plage !== null && <span className="tracee-plage"> (ordre de grandeur : {plage})</span>}
        {plage === null && approximatif ? ' (ordre de grandeur)' : ''}
      </span>
    </p>
  )
}
