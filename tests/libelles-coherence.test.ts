/**
 * T-0334 — une même donnée se lit pareil partout : le nom commun d'un objet, un nombre tapé
 * avec la virgule française.
 *
 * L'objet est forgé — ni sa position ni sa magnitude ne comptent ici, seul son champ de noms,
 * écrit comme OpenNGC l'écrit (plusieurs noms séparés par une virgule).
 */

import { describe, expect, it } from 'vitest'
import { nombre } from '../src/registry/ecriture.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { titreCible } from '../src/ui/libelles-cibles.ts'
import { nomCommun } from '../src/ui/libelles-objet.ts'
import { resumeSite } from '../src/ui/RegionSeance.tsx'
import { lisSaisie } from '../src/ui/Compteur.tsx'
import { nombreDeTexte } from '../src/registry/domains.ts'

const OBJET: ObjetCielProfond = {
  designation: 'FORGE',
  nomsCommuns: 'Premier nom,Second nom',
  adDeg: 0,
  decDeg: 0,
  type: 'GALAXIE',
  majAxArcmin: 1,
  minAxArcmin: 1,
  posAngDeg: null,
  vMag: null,
  bMag: null,
  surfBr: null,
}

describe('T-0334 — une donnée, une lecture', () => {
  it('le titre de fiche porte le même nom commun que la liste', () => {
    const titre = titreCible({ type: 'OBJET', xPx: 0, yPx: 0, nom: '', objet: OBJET })
    expect(titre).toBe(`${OBJET.designation} — ${nomCommun(OBJET)}`)
    expect(titre).not.toContain(',')
  })

  it('le résumé du site lit la virgule décimale comme le moteur', () => {
    const lu = nombreDeTexte('45,6')
    expect(resumeSite('45,6', '6,7')).toBe(
      `${nombre(lu, 1)}° / ${nombre(nombreDeTexte('6,7'), 1)}°`,
    )
  })

  it('le compteur lit une frappe comme le domaine', () => {
    for (const tape of ['44,5', ' 390 ', '1,2,3', '']) {
      const attendu = nombreDeTexte(tape)
      expect(lisSaisie(tape)).toBe(Number.isFinite(attendu) ? attendu : null)
    }
  })
})
