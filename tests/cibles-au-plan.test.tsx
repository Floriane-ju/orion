/**
 * §6.4 → §8.3 — le geste d'ajout au plan, là où il se rencontre : la ligne de la liste.
 *
 * Ce qui est vérifié ici n'est pas le dessin du bouton — `cible.test.tsx` s'en charge — mais
 * sa CONDITION. Un bouton offert sur une cible que la nuit ne permet pas promettrait une
 * étape qui n'arriverait jamais ; un bouton absent d'une cible photographiable rendrait le
 * plan incomposable depuis la liste. Les deux cassent en silence.
 *
 * Aucune valeur d'éphéméride n'est écrite : les états viennent de `etatsCibles`, le même
 * moteur que le plan, et le test compare ce que la liste MONTRE à ce que le moteur DIT.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/night.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import { etatsCibles, photographiable } from '../src/core/cibles-liste.ts'
import type { ContexteSession } from '../src/core/session.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { PanneauCibles } from '../src/ui/PanneauCibles.tsx'
import { basculeChoixCible, reinitialiseCiblesChoisies } from '../src/ui/cibles-choisies.ts'
import { majCatalogue, reinitialiseCatalogue } from '../src/ui/catalogue-etat.ts'
import { reinitialiseScene, vaA } from '../src/ui/scene-etat.ts'

const SITE = { latitudeDeg: 46.391, longitudeDeg: 6.697, altitudeM: 500 }
const NUIT = fenetreNocturne(SITE, new Date('2026-08-14T12:00:00Z'))

/** Setup ciel profond de l'Annexe A : 120 mm f/2,8 sur plein format. */
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

function objet(surcharge: Partial<ObjetCielProfond>): ObjetCielProfond {
  return {
    designation: 'TEST',
    nomsCommuns: '',
    adDeg: 315,
    decDeg: 40,
    type: 'EMISSION',
    majAxArcmin: 280,
    minAxArcmin: 220,
    posAngDeg: null,
    vMag: 5,
    bMag: null,
    surfBr: null,
    ...surcharge,
  }
}

/** Une cible que ce setup photographie, et une que son cadre ne tient pas. */
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
  // La portée par défaut ne montre que les photographiables : la cible refusée en sortirait,
  // et ce test veut voir les deux lignes côte à côte.
  majCatalogue({ photographiablesSeules: false })
  vaA(NUIT.debutReference!.getTime())
  return renderToStaticMarkup(
    <PanneauCibles
      catalogue={CATALOGUE}
      site={SITE}
      contexteSession={CONTEXTE}
      etats={ETATS}
      recalcul={false}
    />,
  )
}

/** Le fragment de la ligne d'une cible, jusqu'à la fin de son `<li>`. */
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
    expect(ligne(liste(), CADRABLE.designation)).toContain('photo_camera')
  })

  it('ne l’offre pas sur une cible que le cadre refuse', () => {
    const refusee = ligne(liste(), TROP_GRANDE.designation)
    expect(refusee).not.toContain('photo_camera')
    // La ligne existe toujours, et elle dit pourquoi : §6.4 n'efface aucun objet.
    expect(refusee).toContain(TROP_GRANDE.designation)
  })

  it('montre du même geste ce qui est déjà au plan', () => {
    basculeChoixCible(CADRABLE.designation)
    const retenue = ligne(liste(), CADRABLE.designation)
    expect(retenue).toContain('aria-pressed="true"')
    expect(retenue).toContain('Retirer NGC7000 du plan de nuit')
  })
})
