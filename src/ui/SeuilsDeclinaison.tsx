/**
 * §4.1 — site déclinaison thresholds, in "info" modal. Property of latitude, not saisie: under
 * Site card fields they were reread per setting without being set. Here: for "why is a low cible
 * never proposed?".
 */

import type { SeuilsSite } from '../core/site.ts'
import { Accordeon } from './Accordeon.tsx'
import { TracedValue } from './TracedValue.tsx'

export function SeuilsDeclinaison({ seuils }: { readonly seuils: SeuilsSite }) {
  return (
    <Accordeon titre="Déclinaisons du site">
      <TracedValue terme="seuil_imagerie" trace={seuils.decMinImagerie} decimales={1} unite="°" />
      <TracedValue terme="seuil_visuel" trace={seuils.decMinVisuel} decimales={1} unite="°" />
      <TracedValue terme="circumpolaire" trace={seuils.decCircumpolaire} decimales={1} unite="°" />
    </Accordeon>
  )
}
