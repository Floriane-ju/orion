/**
 * §4.1 — les seuils de déclinaison du site, dans la modale « info ».
 *
 * Ils sont une propriété de la latitude, pas une saisie : sous les champs de la carte Site,
 * ils se relisaient à chaque réglage sans jamais se régler. Ici, ils se consultent quand on
 * se demande pourquoi une cible basse n'est jamais proposée.
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
