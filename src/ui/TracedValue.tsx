/**
 * §1.5 critère 2, §10.2 — tout nombre affiché porte sa formule et sa constante source, et
 * §10.1 — le libellé porte sa définition au contact.
 *
 * Plus de repli au clic : glose, explication, formule, entrées et constantes sortent toutes
 * dans la bulle du libellé. Contenu volontairement exhaustif, à trier ensuite.
 *
 * Quand une constante consommée est un ordre de grandeur, la valeur s'accompagne de sa
 * plage : l'affichage ne présente jamais comme exacte une sortie qui ne peut pas l'être.
 */

import type { Traced } from '../core/traced.ts'
import { dependDUnOrdreDeGrandeur } from '../core/traced.ts'
import type { TermeGlossaire } from '../registry/glossaire.ts'
import { GLOSSAIRE } from '../registry/glossaire.ts'
import { degres, nombre, nombreLibre } from '../registry/ecriture.ts'
import { POURCENT } from '../core/unites.ts'
import { sansSection } from './sans-section.ts'
import { Etiquette } from './Terme.tsx'
import { MENTION_DONNEE_MANQUANTE, libelleEntree, libelleFlag } from '../registry/libelles.ts'

interface TracedValueProps {
  /** Clé de glossaire : un libellé sans définition ne compile pas (§10.1). */
  readonly terme: TermeGlossaire
  readonly trace: Traced<number | null>
  readonly decimales?: number
  readonly unite?: string
  /** Précision non technique quand un même terme sert deux fois (largeur / hauteur). */
  readonly suffixe?: string
  /** T-0276 — une fraction se lit en pour cent : « 0,261 » sans unité ne dit rien. */
  readonly pourcent?: boolean
}

/** Le degré se colle au nombre ; toute autre unité s'en détache d'une espace. */
function formate(valeur: number | null, decimales: number, unite?: string): string | null {
  if (valeur === null) return null
  if (unite === '°') return degres(valeur, decimales)
  return `${nombre(valeur, decimales)}${unite === undefined ? '' : ` ${unite}`}`
}

/** Tout ce que le repli dépliait, en lignes de bulle : des `span`, la bulle vit dans un `<p>`. */
function DetailTrace({
  terme,
  trace,
  valeur,
}: {
  readonly terme: TermeGlossaire
  readonly trace: Traced<number | null>
  readonly valeur: string | null
}) {
  const entree = GLOSSAIRE[terme]
  return (
    <>
      <span className="bulle-ligne">{entree.glose}</span>
      <span className="bulle-ligne">{entree.explication}</span>
      <span className="bulle-ligne">
        {valeur === null
          ? 'Pas encore calculée : complétez le lieu ou le matériel.'
          : `Votre valeur : ${valeur}`}
      </span>
      <span className="bulle-ligne">{entree.consequence}</span>
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
  // La plage encadre la valeur au lieu de la remplacer : la sortie reste lisible sans
  // jamais se présenter comme exacte (§2.1).
  const plage =
    trace.range === undefined
      ? null
      : `${nombre(trace.range[0] * echelle, decimales)} à ${formate(trace.range[1] * echelle, decimales, unite) ?? ''}`

  return (
    <p className="tracee tracee-vide">
      <span>
        <Etiquette cle={terme} glose={<DetailTrace terme={terme} trace={trace} valeur={valeur} />} />
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
