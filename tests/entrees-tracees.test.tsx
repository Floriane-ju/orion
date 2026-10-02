/**
 * T-0120 — §6.3, §10.2 : une entrée tracée absente se lit comme une valeur absente.
 *
 * `Traced.inputs` accepte `null`, donc un moteur qui n'a pas la grandeur le déclare au lieu
 * d'écrire `Number.NaN` faute de mot. Ce qui est vérifié ici est double : les quatre moteurs
 * ne fabriquent plus de `NaN`, et l'écran rend cette absence avec la seule et même formule
 * que celle d'une sortie absente.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { DetailTrace } from '../src/ui/TracedValue.tsx'
import { trace } from '../src/core/traced.ts'
import {
  fluxCiel,
  fluxObjet,
  fluxObjetReel,
  planIntegration,
  poseUnitaire,
} from '../src/core/exposure.ts'
import { detectabilite } from '../src/core/detectability.ts'
import { profilOptique } from '../src/core/optics.ts'
import { BOITIER_REFERENCE, capteurEffectif } from '../src/data/equipment.ts'

const OPTIQUE_REF = { zpSys: 20.2, pitchUm: 5.12, ouvertureN: 2.8 }
const E_CIEL = fluxCiel({ sbMagArcsec2: 20.95, ...OPTIQUE_REF }).value
const E_OBJ = fluxObjet({ sbMagArcsec2: 23.0148, ...OPTIQUE_REF })

const OPTIQUE = profilOptique({
  focaleMm: 120,
  ouvertureN: 2.8,
  ...capteurEffectif(BOITIER_REFERENCE, 'FULL_FRAME'),
})

describe('entrées tracées sans valeur — §6.3', () => {
  it('ne laisse aucun NaN dans l’écran, panneau sur la liste sans objet désigné', () => {
    expect(renderToStaticMarkup(<App />)).not.toContain('NaN')
  })

  it('déclare la masse d’air absente quand la hauteur de la cible est inconnue (§7.6)', () => {
    const reel = fluxObjetReel(E_OBJ, trace({ value: null, formula: 'MASSE_AIR' }))
    expect(reel.attenuation.inputs.masse_air).toBeNull()
  })

  it('déclare le plafond de suivi absent quand aucun suivi n’est déclaré (§7.2)', () => {
    const pose = poseUnitaire({ eCiel: E_CIEL, readNoiseE: 1.5, tMaxS: null })
    expect(pose.tRecommandeS.inputs.t_max_suivi_s).toBeNull()
  })

  it('ne produit pas de découpe en nuits quand il n’y a pas de créneau (§7.3)', () => {
    const plan = planIntegration({
      eObj: E_OBJ.value,
      eCiel: E_CIEL,
      tPoseS: 2,
      readNoiseE: 1.5,
      snrCible: 10,
      tailleRawMo: 33,
      dureeCreneauS: null,
    })
    expect(plan.nNuits).toBeUndefined()
    expect(Object.values(plan.tRequisS.inputs)).not.toContain(Number.NaN)
  })

  it('déclare la magnitude limite à l’œil absente hors table Bortle (§6.3)', () => {
    const d = detectabilite({
      mInt: 5.7,
      aArcmin: 71,
      bArcmin: 42,
      typeObjet: 'GALAXIE',
      sbCiel: 20.95,
      mLimOeil: null,
      dMm: OPTIQUE.dMm.value,
    })
    expect(d.mLimInstr.inputs.m_lim_oeil).toBeNull()
  })

  it('rend une entrée absente avec la convention d’une valeur absente', () => {
    // T-0386 — les entrées ne se lisent plus dans la bulle, mais dans la rubrique « Calcul ».
    const markup = renderToStaticMarkup(
      <DetailTrace
        terme="extinction_atmospherique"
        trace={trace({
          value: 1,
          formula: 'ATTENUATION_ATMOSPHERIQUE',
          inputs: { masse_air: null },
        })}
        valeur="1,00"
      />,
    )
    expect(markup).not.toContain('NaN')
    expect(markup).toContain('[DONNÉE MANQUANTE]')
  })
})
