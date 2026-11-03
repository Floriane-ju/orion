/**
 * T-0335 — sliders read bounds + step from registry.
 * A literal `min=`, `max=`, `pas=` on a `<Curseur>` = input bound rewritten outside `DOMAINES`:
 * test reads sources, like design-system disciplines.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOMAINES } from '../src/registry/domains.ts'
import { K } from '../src/registry/constants.ts'

const DOSSIER_UI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui')

describe('T-0335 — rails bornés par le registre', () => {
  it('aucun rail n’écrit de borne ni de cran littéral', () => {
    const fautes = readdirSync(DOSSIER_UI)
      .filter((f) => f.endsWith('.tsx'))
      .flatMap((f) =>
        [...readFileSync(join(DOSSIER_UI, f), 'utf8').matchAll(/<Curseur\b[\s\S]*?\/>/g)]
          .map(([rail]) => rail)
          .filter((rail) => /\b(?:min|max|pas)=\{-?\d/.test(rail))
          .map((rail) => `${f}: ${rail.replace(/\s+/g, ' ')}`),
      )
    expect(fautes).toEqual([])
  })

  it('la pose unitaire plafonne au plafond sans autoguidage (C-07)', () => {
    expect(DOMAINES.t_pose_s.max).toBe(K('PLAFOND_POSE_SANS_AUTOGUIDAGE_S'))
  })
})
