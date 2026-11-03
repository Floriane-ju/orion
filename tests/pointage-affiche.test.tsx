/**
 * T-0287 — §8.4 on screen: what aide au pointage SHOWS, not what it computes.
 * The 3 unusable defects were render defects (schema not rotating, unnamed lines, glyph as full
 * text); an engine-only suite couldn't fail on them.
 * No hardcoded positions: repères recomputed from the map's published angle, as `pointage.test.ts`.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Pointage, type PointageProps } from '../src/ui/PlanSession.tsx'
import { cartePointage } from '../src/core/pointage.ts'
import { K } from '../src/registry/constants.ts'
import type { Etoile } from '../src/data/catalog.ts'
import type { EtoileNommee } from '../src/data/constellations.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const DATE = new Date('2026-08-14T22:30:00Z')
const DEG_PAR_HEURE = 15
const POURCENT = 100

/** Annexe A reference profile: 120 mm full frame, 17.0° × 11.4°. */
const FOV_H_DEG = 11.38
const FOV_L_DEG = 17.02

const CIBLE: ObjetCielProfond = {
  designation: 'NGC7000',
  nomsCommuns: 'Amérique du Nord',
  adDeg: 314.75,
  decDeg: 44.52,
  type: 'EMISSION',
  majAxArcmin: 120,
  minAxArcmin: 100,
  posAngDeg: null,
  vMag: 4,
  bMag: null,
  surfBr: null,
}

/**
 * Twelve stars, one named: > unfold cap so the fold has something to hide; anonymous ones so the
 * nameless cell renders.
 */
const CIEL: readonly Etoile[] = Array.from({ length: 12 }, (_, i) => ({
  adDeg: CIBLE.adDeg + ((i % 4) - 1.5),
  decDeg: CIBLE.decDeg + (Math.floor(i / 4) - 1),
  magV: 2 + i / 4,
  bv: 0,
}))

const NOMMEE: EtoileNommee = {
  adDeg: CIEL[0]!.adDeg,
  decDeg: CIEL[0]!.decDeg,
  magV: CIEL[0]!.magV,
  designation: 'α Cyg',
  nomPropre: 'Deneb',
  spectre: '',
  distancePc: null,
  constellation: 'Cyg',
}

const PROPS: PointageProps = {
  objet: CIBLE,
  date: DATE,
  site: SITE,
  fovHDeg: FOV_H_DEG,
  fovLDeg: FOV_L_DEG,
  mLimOeil: 6.05,
  etoiles: CIEL,
  nommees: [NOMMEE],
  gaiaCharge: false,
}

/** Same map the component requests: repères derive from it. */
const CARTE = cartePointage({
  site: SITE,
  date: DATE,
  adCibleH: CIBLE.adDeg / DEG_PAR_HEURE,
  decCibleDeg: CIBLE.decDeg,
  fovHDeg: FOV_H_DEG,
  fovLDeg: FOV_L_DEG,
  mLimOeil: 6.05,
  etoiles: CIEL,
  nommees: [NOMMEE],
})

function rendu(): string {
  return renderToStaticMarkup(<Pointage {...PROPS} />)
}

/** Only `<details>` without a class = the fold: `TracedValue` carries `.tracee`. */
function replie(html: string): string {
  return html.slice(html.indexOf('<details>'))
}

/** Schema alone, container to closing tag. */
function schema(html: string): string {
  const debut = html.indexOf('<div class="schema"')
  return html.slice(debut, html.indexOf('</div>', debut))
}

/** What React writes for a schema position, same rounding. */
function place(x: number, y: number): string {
  return `left:${(1 / 2 + x) * POURCENT}%;top:${(1 / 2 - y) * POURCENT}%`
}

describe('T-0287 — la carte directe ne déplie que ce qui se lit', () => {
  it('a bien de quoi replier : le cadre contient plus d’étoiles que le plafond', () => {
    expect(CARTE.ancrages.length).toBeGreaterThan(K('ANCRAGES_DEPLIES_MAX'))
  })

  it('n’en déplie pas plus que le registre ne l’autorise', () => {
    const html = rendu()
    const deplie = html.slice(0, html.indexOf('<details>'))
    expect([...deplie.matchAll(/<tr><td>/g)]).toHaveLength(K('ANCRAGES_DEPLIES_MAX'))
  })

  it('garde les autres à portée, repliées, sans en perdre une seule', () => {
    const html = rendu()
    expect([...replie(html).matchAll(/<tr><td>/g)]).toHaveLength(
      CARTE.ancrages.length - K('ANCRAGES_DEPLIES_MAX'),
    )
    expect([...html.matchAll(/<tr><td>/g)]).toHaveLength(CARTE.ancrages.length)
  })

  it('ne pose sur le schéma que les ancrages dépliés', () => {
    // Target, zenith, north, unfolded anchors only.
    expect([...schema(rendu()).matchAll(/class="schema-astre/g)]).toHaveLength(
      K('ANCRAGES_DEPLIES_MAX') + 3,
    )
  })
})

describe('T-0287 — le schéma dit selon quoi il est orienté', () => {
  it('porte un repère de zénith et un repère de nord', () => {
    const html = rendu()
    expect(html).toContain('>zénith<')
    expect(html).toContain('>nord<')
    expect(html).toContain('zénith en haut')
  })

  it('met le zénith en haut et le nord là où la carte l’annonce', () => {
    const html = rendu()
    expect(html).toContain('left:50%;top:0%')
    expect(html).toContain(place(CARTE.xNord, CARTE.yNord))
  })

  it('rend les ancrages à la position tournée, jamais à celle du cadre', () => {
    const html = rendu()
    const a = CARTE.ancrages[0]!
    // Chosen anchor on neither repère's meridian: positions really differ, else next assertion
    // proves nothing.
    expect(a.xDisque).not.toBeCloseTo(-a.xCadre, 6)
    expect(html).toContain(place(a.xDisque, a.yDisque))
    expect(html).not.toContain(place(-a.xCadre, a.yCadre))
  })
})

describe('T-0287 — chaque ligne nomme son étoile', () => {
  it('écrit le nom du catalogue quand il y en a un', () => {
    expect(rendu()).toContain('Deneb — α Cyg')
  })

  it('le dit plutôt que de laisser la cellule vide quand il n’y en a pas', () => {
    expect(CARTE.ancrages.filter((a) => a.nom === '').length).toBeGreaterThan(0)
    expect(rendu()).toContain('sans nom')
  })
})

/**
 * Original defect: adjacent "circle" + "star" ligated into "circles", rest as full text.
 * Lasting guarantee: `icone.test.tsx` (no two glyphs touch). Here: this rendering.
 */
describe('T-0287 — aucun glyphe ne s’affiche en toutes lettres', () => {
  it('ne colle jamais deux ligatures, dans le schéma comme dans les lignes', () => {
    const html = rendu()
    expect(html).not.toMatch(/<\/span><span class="icone"/)
    expect(html).not.toContain('circlestar')
  })

  it('confie au glyphe seul le rang de l’ancrage, donc son libellé accessible', () => {
    const html = rendu()
    expect(html).toContain('aria-label="Ancrage principal"')
    expect(html).toContain('aria-label="Ancrage secondaire"')
  })
})

/**
 * T-0324 — table says the route, scene shows it. Button = only path to it: absent, §8.4 vignette
 * debt stays whole regardless of engine.
 */
describe('T-0324 — l’aide au pointage mène le parcours à la scène', () => {
  it('offre de voir le parcours quand la carte en propose un', () => {
    expect(CARTE.ancrages.length + CARTE.sauts.length).toBeGreaterThan(0)
    expect(rendu()).toContain('Voir le parcours')
  })

  it('n’offre rien quand la carte n’a aucun repère à donner', () => {
    // Empty sky: no anchor → no route.
    const html = renderToStaticMarkup(<Pointage {...PROPS} etoiles={[]} nommees={[]} />)
    expect(html).not.toContain('Voir le parcours')
  })

  it('passe le trajet par une ligature, jamais par un caractère dessiné', () => {
    const html = rendu()
    expect(html).toContain('>route<')
  })
})
