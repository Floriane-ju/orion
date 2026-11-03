/**
 * T-0275 — no internal code displayed on screen. Closes: enum value or variable name rendered
 * raw ("verdict : CADRAGE_LARGE", "Tolérance à la Lune : FAIBLE", "FACTEUR DOMINANT sb_obj");
 * for §1.3 persona the answer line was the least readable of the fiche.
 * Searches the FORM of codes, not a list of known ones: catches a union added tomorrow.
 * Exhaustive `Record` protects typed unions; this pattern protects the rest (`Traced.inputs`
 * keys, phrases composed in core, interpolated labels).
 * Outside the net on purpose: §10.2 level-3 formula EXPRESSIONS (`sb = m_int + 2,5·log(aire)`)
 * and constant references (`POGSON`): that level's deliverable (closest to PRD), translating
 * would erase it. Dedicated tags, stripped from text before the check.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import { planSession, type ContexteSession } from '../src/core/session.ts'
import { planEnTexte } from '../src/core/plan-texte.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { reinitialiseScene } from '../src/ui/scene-etat.ts'
import { ouvreCible, poseMode, reinitialiseSeance } from '../src/ui/seance-etat.ts'
import { reinitialiseCatalogue } from '../src/ui/catalogue-etat.ts'
import {
  LIBELLE_CAUSE_ECART,
  LIBELLE_DISPONIBILITE_HORS_LIGNE,
  LIBELLE_ENTREE,
  LIBELLE_ETAT_NUIT,
  LIBELLE_FLAG,
  LIBELLE_INTEGRITE_PAQUET,
  LIBELLE_LOT_CALIBRATION,
  LIBELLE_MODE_POINTAGE,
  LIBELLE_MODE_RESEAU,
  LIBELLE_SOURCE_SB,
  LIBELLE_VERDICT_CADRAGE,
  LIBELLE_VERDICT_DETECTABILITE,
  LIBELLE_ZP_SOURCE,
} from '../src/registry/libelles.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

/**
 * Catalogue target with all the chain needs: magnitude + dimensions → verdict, pose, §10.2
 * explanation. Without them fiche falls back to "donnée manquante" and test sees none of the
 * lines to watch.
 */
const M31: ObjetCielProfond = {
  designation: 'M31',
  nomsCommuns: 'Galaxie d’Andromède',
  adDeg: 10.6847,
  decDeg: 41.269,
  type: 'GALAXIE',
  majAxArcmin: 190,
  minAxArcmin: 60,
  posAngDeg: 35,
  vMag: 3.4,
  bMag: 4.4,
  surfBr: 13.5,
}

/**
 * Identifiers the registry can translate — exactly those with NO business on screen. Derived
 * from tables: wiring a new union in `libelles.ts` extends this net automatically.
 * The half that counts: morphological pattern below sees only COMPOSED codes (`CADRAGE_LARGE`,
 * `sb_obj`); lets one-word values through — `FAIBLE`, `NOMINAL`, `FLATS`, `OK` — over half the
 * ticket's values, incl. its own "Tolérance à la Lune : FAIBLE". Complementary nets: this one
 * knows existing codes, the other catches unwired ones.
 */
const TABLES_DE_LIBELLES: readonly object[] = [
  LIBELLE_VERDICT_CADRAGE,
  LIBELLE_VERDICT_DETECTABILITE,
  LIBELLE_ETAT_NUIT,
  LIBELLE_SOURCE_SB,
  LIBELLE_FLAG,
  LIBELLE_MODE_POINTAGE,
  LIBELLE_CAUSE_ECART,
  LIBELLE_LOT_CALIBRATION,
  LIBELLE_ZP_SOURCE,
  LIBELLE_MODE_RESEAU,
  LIBELLE_DISPONIBILITE_HORS_LIGNE,
  LIBELLE_INTEGRITE_PAQUET,
  LIBELLE_ENTREE,
]

const CODES_CONNUS: readonly string[] = TABLES_DE_LIBELLES.flatMap((table) => Object.keys(table))
  // One-word lowercase key (`bortle`, `facteur`, `sb`) is also an ordinary French word: raw
  // search fails on legitimate prose. Covered by being translated; if that stops, only an eye
  // sees it.
  .filter((cle) => cle.includes('_') || cle === cle.toUpperCase())

/** SCREAMING_SNAKE_CASE (2+ capitals, `_`, capital), ticket pattern: `CADRAGE_LARGE`, `OEIL_NU`. */
const CODE_MAJUSCULE = /[A-Z]{2,}_[A-Z][A-Z_]*/g

/** snake_case (`sb_obj`, `t_pose_s`, `masse_air`), incl. new trace keys no table knows. */
const CODE_MINUSCULE = /\b[a-z]+(?:_[a-z0-9]+)+\b/g

/**
 * Removes element + content, found by class. Open/close tag counting: first `</tag>` may
 * close a child.
 */
function retireParClasse(html: string, classe: string): string {
  const ouvrante = new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${classe}\\b[^"]*"[^>]*>`)
  let texte = html
  for (;;) {
    const debut = ouvrante.exec(texte)
    if (debut === null) return texte
    const tag = debut[1]!
    const bornes = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g')
    bornes.lastIndex = debut.index
    let profondeur = 0
    let fin = texte.length
    for (let m = bornes.exec(texte); m !== null; m = bornes.exec(texte)) {
      profondeur += m[0].startsWith('</') ? -1 : 1
      if (profondeur === 0) {
        fin = m.index + m[0].length
        break
      }
    }
    texte = texte.slice(0, debut.index) + ' ' + texte.slice(fin)
  }
}

/**
 * Text the user READS as prose. Excluded, same reason (AUDIT surfaces: verbatim = deliverable):
 * - `verbatim` — only COLUMN citing PRD or provenance (§2.1, §12.2), not the whole table: a
 *   column added tomorrow stays watched, inherits no exemption.
 * - `tracee-source` — source + tolerance of a constant, under unfolded value.
 * - `<code>` — formula expressions, §10.2 level 3.
 * - `icone` — Material Symbols ligature (`light_mode`): font identifier, not a label (project
 *   rule: English; user sees a glyph).
 */
function texteLu(html: string): string {
  return ['verbatim', 'tracee-source', 'icone']
    .reduce(retireParClasse, html)
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/g, ' ')
}

/**
 * Code appears ALONE, not drowned in a run of capitals? Export titles sections in capitals
 * ("BUDGET DE NUIT", "CIBLES ÉCARTÉES") and `BUDGET` is also a gap cause: bare-key search
 * would fail on a French title. A leaking code arrives alone ("Verdict : OEIL_NU"). Rule: key
 * must be the whole run of capital words it sits in.
 */
function estIsole(cle: string, texte: string): boolean {
  const suites: readonly string[] =
    texte.match(/\b[A-ZÀ-Ý][A-ZÀ-Ý0-9_]*(?:[ ’'-][A-ZÀ-Ý][A-ZÀ-Ý0-9_]*)*\b/g) ?? []
  if (cle === cle.toUpperCase()) return suites.includes(cle)
  return new RegExp(`\\b${cle}\\b`).test(texte)
}

/** All codes found, so failure names them instead of returning a boolean. */
function codesRendus(html: string): readonly string[] {
  const texte = texteLu(html)
  const connus = CODES_CONNUS.filter((cle) => estIsole(cle, texte))
  return [
    ...new Set([
      ...connus,
      ...(texte.match(CODE_MAJUSCULE) ?? []),
      ...(texte.match(CODE_MINUSCULE) ?? []),
    ]),
  ]
}

afterEach(() => {
  reinitialiseSeance()
  reinitialiseScene()
  reinitialiseCatalogue()
})

/** Annexe A deep-sky setup, as other plan tests: 120 mm f/2,8. */
const NUIT = fenetreNocturne(SITE, new Date('2026-08-14T12:00:00Z'))

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

describe('T-0275 — les surfaces principales ne montrent aucun identifiant interne', () => {
  it('l’écran au démarrage : barres, scène, matériel, cartes', () => {
    expect(codesRendus(renderToStaticMarkup(<App />))).toEqual([])
  })

  it('la fiche d’une cible : cadrage, détectabilité, pose, intégration, calibration', () => {
    ouvreCible(M31)
    expect(codesRendus(renderToStaticMarkup(<App />))).toEqual([])
  })

  it('le plan de la nuit, et les cibles qu’il écarte avec leur cause', () => {
    poseMode('PLAN')
    expect(codesRendus(renderToStaticMarkup(<App />))).toEqual([])
  })

  /**
   * §11.2 — export leaves on paper/in the field, far from any tooltip. Goes through no
   * component, so HTML render doesn't cover it: carries its own verdicts, calibration lots, gap
   * causes, formerly in clear.
   */
  it('l’export texte du plan de la nuit, verdicts et causes comprises', () => {
    const texte = planEnTexte(planSession(CONTEXTE, [M31]), {
      nuitIso: '2026-08-14',
      lieu: 'site de référence',
      materiel: '120 mm f/2,8',
    })
    expect(texte).toContain('PLAN DE SESSION')
    // Plan holds a step, else test passes vacuously on hollow export: "Verdict" and "Cadrage"
    // lines carried the codes.
    expect(texte).toContain('M31')
    expect(texte).toContain('Verdict')
    expect(texte).toContain('Cadrage')
    // Title and column headers = capitals without underscore: ticket pattern skips them on purpose.
    expect(codesRendus(texte)).toEqual([])
  })
})

/**
 * Pattern above proves no code leaks, not that what shows SAYS the right thing. Other tests
 * compare render to the label table itself: check a component calls the translation, never
 * that it's right (both sides = same symbol). Hence this block, the only place labels are
 * HAND-WRITTEN. First version of this ticket named `c_facteur` "facteur de cadrage" (it is
 * pose factor C, §7.2) and `phi_deg` "latitude" (major-axis angle, §6.2): two wrong labels,
 * invisible to pattern and table comparison — incomprehensible code replaced by a wrong word.
 */
describe('T-0275 — les libellés nomment la bonne grandeur, pas seulement une grandeur', () => {
  it('nomme chaque verdict de détectabilité par le moyen de l’observer', () => {
    expect(LIBELLE_VERDICT_DETECTABILITE.OEIL_NU).toBe('à l’œil nu')
    expect(LIBELLE_VERDICT_DETECTABILITE.JUMELLES).toBe('aux jumelles')
    expect(LIBELLE_VERDICT_DETECTABILITE.TELESCOPE).toBe('au télescope')
    expect(LIBELLE_VERDICT_DETECTABILITE.PHOTO_SEULE).toBe('en photo seulement')
  })

  it('ne confond pas le facteur de pose avec le cadrage, ni un angle avec une latitude', () => {
    // §7.2 — `c_facteur` is C-03, noise-tolerance factor of optimal pose.
    expect(LIBELLE_ENTREE['c_facteur']).toBe('facteur de pose C')
    // §6.2 — `phi_deg` is φ, ellipse orientation; latitude is `latitude_deg`.
    expect(LIBELLE_ENTREE['phi_deg']).toBe('angle du grand axe')
    expect(LIBELLE_ENTREE['latitude_deg']).toBe('latitude')
  })

  it('distingue la brillance de l’objet de celle du fond de ciel', () => {
    expect(LIBELLE_ENTREE['sb_obj']).toBe('brillance de surface de l’objet')
    expect(LIBELLE_ENTREE['sb_ciel']).toBe('brillance du fond de ciel')
  })

  it('dit d’où vient le point zéro, ce que §7.1 exige avec toute pose affichée', () => {
    expect(LIBELLE_ZP_SOURCE.BASE_MATERIEL).toBe('base matériel')
    expect(LIBELLE_ZP_SOURCE.GENERIQUE).toBe('valeur générique')
  })
})
