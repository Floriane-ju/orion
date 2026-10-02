/**
 * §7.4 — les lots de calibration que la nuit exige, et ce qu'ils coûtent en temps.
 *
 * Il vit dans le plan de nuit, plus dans la fiche : les flats se prennent une fois pour
 * l'optique, les darks une fois par durée de pose, et c'est le plan entier qui fixe ces
 * durées. Sur la fiche, il redisait le même lot à chaque cible ouverte.
 */

import type { PlanCalibration as Calibration } from '../core/calibration.ts'
import { nombreLibre } from '../registry/ecriture.ts'
import { LIBELLE_LOT_CALIBRATION } from '../registry/libelles.ts'
import { Mention } from './Mention.tsx'
import { Etiquette } from './Terme.tsx'
import { TracedValue } from './TracedValue.tsx'

export function PlanCalibration({ calibration }: { readonly calibration: Calibration | null }) {
  if (calibration === null) return null
  return (
    <section>
      <h2>Plan de calibration</h2>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Nombre</th>
            <th>Plage</th>
            <th>Consigne</th>
          </tr>
        </thead>
        <tbody>
          {calibration.lots.map((lot) => (
            <tr key={`${lot.type}-${lot.tPoseS ?? ''}`}>
              <td>
                {LIBELLE_LOT_CALIBRATION[lot.type]}
                {lot.tPoseS !== undefined && ` de ${nombreLibre(lot.tPoseS)} s`}
              </td>
              <td>{lot.nombre}</td>
              <td>
                {lot.plage[0]} à {lot.plage[1]}
              </td>
              <td>{lot.consigne}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TracedValue
        terme="plan_calibration"
        suffixe="surcoût de temps"
        trace={calibration.surcoutTempsMin}
        decimales={0}
        unite="min"
      />
      <p className="etat">
        <Etiquette cle="dithering" /> : {calibration.dithering}
      </p>
      {calibration.avertissements.map((a) => (
        <Mention key={a} ton="cause">
          {a}
        </Mention>
      ))}
    </section>
  )
}
