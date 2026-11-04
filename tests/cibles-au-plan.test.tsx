/**
 * §6.4 → §8.3 — add-to-plan gesture on list row; tests its CONDITION, not button drawing
 * (`cible.test.tsx`). Button on a night-forbidden target = broken promise; missing on a
 * photographable one = plan not composable. Both silent.
 * No ephemeris value: compares what the list SHOWS to `etatsCibles` (same engine as plan).
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import { etatsCibles, photographiable } from '../src/core/cibles-liste.ts'
import type { ContexteSession } from '../src/core/session.ts'
import { PanneauCibles } from '../src/ui/PanneauCibles.tsx'
import { basculeChoixCible, reinitialiseCiblesChoisies } from '../src/ui/cibles-choisies.ts'
import { majCatalogue, reinitialiseCatalogue } from '../src/ui/catalogue-etat.ts'
import { reinitialiseScene, vaA } from '../src/ui/scene-etat.ts'
import { LIBELLE_TYPE_OBJET } from '../src/ui/libelles-objet.ts'
import { objetNebuleuse as objet, SITE_REFERENCE as SITE } from './fixtures.ts'

const NUIT = fenetreNocturne(SITE, new Date('2026-08-14T12:00:00Z'))

/** Annexe A deep-sky setup: 120 mm f/2,8 full frame. */
const CONTEXTE: ContexteSession = {
  site: SITE,
  nuit: NUIT,
  fenetreUtile: fenetreUtile(SITE, NUIT),
  masque: masquePlat(),
  fovHDeg: 11.38,
  echApx: 8.8,
  dMm: 42.9,
  capteurHMm: 23.9,
  pitchUm: 5.12,
  ouvertureN: 2.8,
  zpSys: 20.2,
  zpEstime: true,
  readNoiseE: 1.5,
  tailleRawMo: 33,
  isoSession: 640,
  sbCielNoir: 20.95,
  mLimOeil: 6.05,
  tMaxS: 200,
  domaineCpFerme: null,
  snrCible: 10,
  typeMonture: 'TRACKER',
}

/** One target this setup photographs, one its cadre cannot hold. */
const CADRABLE = objet({
  designation: 'NGC7000',
  nomsCommuns: 'Amérique du Nord',
  adDeg: 314.75,
  decDeg: 44.52,
  majAxArcmin: 120,
  minAxArcmin: 100,
  vMag: 4,
})
const TROP_GRANDE = objet({ designation: 'IMMENSE', adDeg: 312, decDeg: 42, majAxArcmin: 1500, vMag: 3 })
const CATALOGUE = [CADRABLE, TROP_GRANDE]

const ETATS = etatsCibles(CONTEXTE, CATALOGUE)

function liste(): string {
  // Default scope = photographables only; refused target would vanish, test needs both rows.
  majCatalogue({ photographiablesSeules: false })
  vaA(NUIT.debutReference!.getTime())
  return renderToStaticMarkup(
    <PanneauCibles
      catalogue={CATALOGUE}
      site={SITE}
      contexteSession={CONTEXTE}
      etats={ETATS}
      profil={undefined}
      recalcul={false}
    />,
  )
}

/** Row fragment of a target, up to the end of its `<li>`. */
function ligne(html: string, designation: string): string {
  const debut = html.indexOf(designation)
  expect(debut, designation).toBeGreaterThan(-1)
  return html.slice(debut, html.indexOf('</li>', debut))
}

afterEach(() => {
  reinitialiseCiblesChoisies()
  reinitialiseCatalogue()
  reinitialiseScene()
})

describe('§8.3 — ajouter au plan depuis la liste', () => {
  it('la prémisse tient : une cible est photographiable, l’autre non', () => {
    expect(photographiable(ETATS.get(CADRABLE.designation))).toBe(true)
    expect(photographiable(ETATS.get(TROP_GRANDE.designation))).toBe(false)
  })

  it('offre le geste sur la cible que la nuit permet', () => {
    expect(ligne(liste(), CADRABLE.designation)).toContain('cible-photographier')
  })

  it('ne l’offre pas sur une cible que le cadre refuse', () => {
    const refusee = ligne(liste(), TROP_GRANDE.designation)
    expect(refusee).not.toContain('cible-photographier')
    // Row stays and states why: §6.4 erases no object.
    expect(refusee).toContain(TROP_GRANDE.designation)
  })

  it('montre du même geste ce qui est déjà au plan', () => {
    basculeChoixCible(CADRABLE.designation)
    const retenue = ligne(liste(), CADRABLE.designation)
    expect(retenue).toContain('aria-pressed="true"')
    expect(retenue).toContain('Retirer NGC7000 du plan de nuit')
  })
})

describe('§6.4 — la carte de liste en fiche technique', () => {
  it('étiquette ses trois mesures : facilité, cadre, pose', () => {
    const carte = ligne(liste(), CADRABLE.designation)
    for (const etiquette of ['Facilité', 'Cadre', 'Pose']) {
      expect(carte, etiquette).toContain(`>${etiquette}</span>`)
    }
  })

  it('nomme le type sous la désignation, et le nom d’usage à part', () => {
    const carte = ligne(liste(), CADRABLE.designation)
    expect(carte).toContain(`>${LIBELLE_TYPE_OBJET[CADRABLE.type]}</span>`)
    expect(carte).toContain(CADRABLE.nomsCommuns)
  })
})
