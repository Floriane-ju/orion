/**
 * T-0409 — l'interface passe en clair du lever au coucher du Soleil, à l'instant affiché par
 * la scène et au lieu saisi ; le mode nuit l'emporte toujours.
 *
 * Les instants de référence viennent de `fenetreNocturne`, calculés par le même moteur :
 * aucune heure de lever recopiée.
 */

import { describe, expect, it } from 'vitest'
import { fenetreNocturne, soleilLeve } from '../src/core/nuit.ts'
import { MS_PAR_MINUTE } from '../src/core/unites.ts'
import { lecteurJourClair } from '../src/ui/jour-clair.ts'
import { SITE_REFERENCE } from './fixtures.ts'

const decale = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * MS_PAR_MINUTE)

describe('soleilLeve', () => {
  const nuit = fenetreNocturne(SITE_REFERENCE, new Date('2026-08-14T08:00:00Z'))
  const coucher = nuit.coucherSoleil!
  const lever = nuit.leverSoleil!

  it('bascule au coucher, puis au lever suivant', () => {
    expect(soleilLeve(SITE_REFERENCE, decale(coucher, -1))).toBe(true)
    expect(soleilLeve(SITE_REFERENCE, decale(coucher, 1))).toBe(false)
    expect(soleilLeve(SITE_REFERENCE, decale(lever, -1))).toBe(false)
    expect(soleilLeve(SITE_REFERENCE, decale(lever, 1))).toBe(true)
  })

  it('tranche sans lever ni coucher : soleil de minuit, nuit polaire', () => {
    const arctique = { ...SITE_REFERENCE, latitudeDeg: 80 }
    expect(soleilLeve(arctique, new Date('2026-06-21T00:00:00Z'))).toBe(true)
    expect(soleilLeve(arctique, new Date('2026-12-21T12:00:00Z'))).toBe(false)
  })
})

describe('lecteurJourClair', () => {
  it('suit l’instant de la scène, pas l’horloge', () => {
    const nuit = fenetreNocturne(SITE_REFERENCE, new Date('2026-08-14T08:00:00Z'))
    const lit = lecteurJourClair(SITE_REFERENCE)
    expect(lit(decale(nuit.coucherSoleil!, -2).getTime())).toBe(true)
    expect(lit(decale(nuit.coucherSoleil!, 2).getTime())).toBe(false)
    expect(lit(decale(nuit.leverSoleil!, 2).getTime())).toBe(true)
  })

  it('ne tranche pas pour un lieu illisible', () => {
    expect(lecteurJourClair({ ...SITE_REFERENCE, latitudeDeg: Number.NaN })(Date.now())).toBeNull()
  })
})
