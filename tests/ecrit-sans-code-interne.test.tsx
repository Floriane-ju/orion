/**
 * T-0275 — aucun code interne ne s'affiche à l'écran.
 *
 * Le défaut que ce fichier garde fermé : une valeur d'énumération ou un nom de variable rendu
 * tel quel. « verdict : CADRAGE_LARGE », « Tolérance à la Lune : FAIBLE », « FACTEUR DOMINANT
 * sb_obj ». Pour le persona de §1.3, la ligne qui porte la réponse était la moins lisible de
 * la fiche.
 *
 * Le test ne liste pas les codes connus : il cherche leur FORME. C'est ce qui le rend capable
 * d'attraper une union ajoutée demain, que personne n'aurait pensé à traduire — un `Record`
 * exhaustif protège les unions typées, ce motif protège tout le reste (clés de `Traced.inputs`,
 * phrases composées dans le cœur, libellés interpolés).
 *
 * Ce qui reste volontairement hors du filet : les EXPRESSIONS de formules du niveau 3 de
 * §10.2 (`sb = m_int + 2,5·log(aire)`) et les références de constantes (`POGSON`). Elles sont
 * le livrable de ce niveau — celui qui se rapproche du PRD — et les traduire l'effacerait.
 * Elles vivent dans des balises dédiées, ce qui permet de les retirer du texte avant l'examen.
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
import { ouvreCible, reinitialiseSeance } from '../src/ui/seance-etat.ts'
import { reinitialiseCatalogue } from '../src/ui/catalogue-etat.ts'
import { ouvreCarte, reinitialiseCoque } from '../src/ui/coque-etat.ts'
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
  LIBELLE_REGIME_POSE,
  LIBELLE_SOURCE_SB,
  LIBELLE_TOLERANCE_LUNE,
  LIBELLE_VERDICT_CADRAGE,
  LIBELLE_VERDICT_DETECTABILITE,
  LIBELLE_ZP_SOURCE,
} from '../src/registry/libelles.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

/**
 * Une cible du catalogue, avec tout ce qu'il faut pour que la chaîne aille jusqu'au bout :
 * magnitude et dimensions, donc un verdict, une pose et une explication §10.2. Sans elles, la
 * fiche se replierait sur « donnée manquante » et le test ne verrait aucune des lignes qu'il
 * doit surveiller.
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
 * Les identifiants que le registre sait traduire — donc exactement ceux qui n'ont RIEN à faire
 * à l'écran. Dérivés des tables elles-mêmes : câbler une nouvelle union dans `libelles.ts`
 * étend ce filet sans que personne ait à y penser.
 *
 * C'est la moitié qui compte. Le motif morphologique plus bas ne voit que les codes COMPOSÉS
 * (`CADRAGE_LARGE`, `sb_obj`) : il laisse passer les valeurs d'un seul mot — `FAIBLE`,
 * `NOMINAL`, `FLATS`, `OK` — c'est-à-dire plus de la moitié des valeurs du ticket, dont son
 * propre exemple « Tolérance à la Lune : FAIBLE ». Les deux filets sont complémentaires :
 * celui-ci connaît les codes existants, l'autre attrape ceux que personne n'a encore câblés.
 */
const TABLES_DE_LIBELLES: readonly object[] = [
  LIBELLE_VERDICT_CADRAGE,
  LIBELLE_VERDICT_DETECTABILITE,
  LIBELLE_TOLERANCE_LUNE,
  LIBELLE_REGIME_POSE,
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
  // Une clé en minuscules d'un seul mot — `bortle`, `facteur`, `sb` — est aussi un mot français
  // ordinaire : la chercher telle quelle ferait échouer le test sur de la prose légitime. Ces
  // trois-là restent couvertes par le fait qu'elles SONT traduites ; le jour où elles ne le
  // seraient plus, seul un œil le verrait.
  .filter((cle) => cle.includes('_') || cle === cle.toUpperCase())

/**
 * SCREAMING_SNAKE_CASE : deux capitales ou plus, un tiret bas, une capitale. Le motif du
 * ticket, repris tel quel — il attrape `CADRAGE_LARGE`, `OEIL_NU`, `NUIT_ASTRONOMIQUE`.
 */
const CODE_MAJUSCULE = /[A-Z]{2,}_[A-Z][A-Z_]*/g

/**
 * snake_case : un mot en minuscules, un tiret bas, un mot. Attrape `sb_obj`, `t_pose_s`,
 * `masse_air` — y compris une clé de trace flambant neuve qu'aucune table ne connaît encore.
 */
const CODE_MINUSCULE = /\b[a-z]+(?:_[a-z0-9]+)+\b/g

/**
 * Retire un élément et tout son contenu, repéré par une classe. Le comptage des balises
 * ouvrantes et fermantes évite de couper au premier `</tag>` venu, qui pourrait fermer un
 * enfant plutôt que l'élément visé.
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
 * Le texte que l'utilisateur LIT comme de la prose. Trois familles en sortent, et chacune
 * pour la même raison : ce sont des surfaces d'AUDIT, où le verbatim est le livrable.
 *
 * - `verbatim` — la seule COLONNE qui cite le PRD ou une provenance (§2.1, §12.2), jamais le
 *   tableau entier : une colonne ajoutée demain reste surveillée au lieu d'hériter en silence
 *   d'une exemption que personne n'aurait décidée.
 * - `tracee-source` — la source et la tolérance d'une constante, sous une valeur dépliée.
 * - `<code>` — les expressions de formules, niveau 3 de §10.2.
 * - `icone` — la ligature Material Symbols (`light_mode`). C'est l'identifiant de la police,
 *   pas un libellé : la règle du projet impose l'anglais, et l'utilisateur voit un glyphe.
 */
function texteLu(html: string): string {
  return ['verbatim', 'tracee-source', 'icone']
    .reduce(retireParClasse, html)
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/g, ' ')
}

/**
 * Le code apparaît-il SEUL, et non noyé dans une suite de capitales ?
 *
 * L'export titre ses sections en capitales — « BUDGET DE NUIT », « CIBLES ÉCARTÉES » — et
 * `BUDGET` est aussi une cause d'écart. Chercher la clé nue ferait échouer le test sur un
 * titre parfaitement français. Un code qui fuit, lui, arrive seul : « Verdict : OEIL_NU »,
 * « Tolérance à la Lune : FAIBLE ». La règle est donc : la clé doit constituer à elle seule
 * toute la suite de mots en capitales où elle se trouve.
 */
function estIsole(cle: string, texte: string): boolean {
  const suites: readonly string[] =
    texte.match(/\b[A-ZÀ-Ý][A-ZÀ-Ý0-9_]*(?:[ ’'-][A-ZÀ-Ý][A-ZÀ-Ý0-9_]*)*\b/g) ?? []
  if (cle === cle.toUpperCase()) return suites.includes(cle)
  return new RegExp(`\\b${cle}\\b`).test(texte)
}

/** Tous les codes trouvés, pour que l'échec les nomme au lieu de rendre un booléen. */
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
  reinitialiseCoque()
  reinitialiseCatalogue()
})

/** Le setup ciel profond de l'Annexe A, celui des autres tests de plan : 120 mm f/2,8. */
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
    ouvreCarte('PLAN')
    expect(codesRendus(renderToStaticMarkup(<App />))).toEqual([])
  })

  /**
   * §11.2 — l'export part sur une feuille et sur le terrain, loin de toute infobulle. Il ne
   * passe par aucun composant, donc le rendu HTML ne le couvre pas : il porte ses propres
   * verdicts, ses lots de calibration et ses causes d'écart, et les portait en clair.
   */
  it('l’export texte du plan de la nuit, verdicts et causes comprises', () => {
    const texte = planEnTexte(planSession(CONTEXTE, [M31]), {
      nuitIso: '2026-08-14',
      lieu: 'site de référence',
      materiel: '120 mm f/2,8',
    })
    expect(texte).toContain('PLAN DE SESSION')
    // Le plan porte bien une étape, sans quoi le test passerait à vide sur un export creux :
    // ce sont les lignes « Verdict » et « Cadrage » de l'étape qui portaient les codes.
    expect(texte).toContain('M31')
    expect(texte).toContain('Verdict')
    expect(texte).toContain('Cadrage')
    // Le titre et les en-têtes de colonnes sont en capitales sans tiret bas : le motif du
    // ticket ne les touche pas, et c'est voulu — ce sont des titres, pas des codes.
    expect(codesRendus(texte)).toEqual([])
  })
})

/**
 * Le motif ci-dessus prouve qu'aucun code ne sort ; il ne prouve pas que ce qui sort DIT la
 * bonne chose. Les autres tests de la suite comparent le rendu à la table de libellés
 * elle-même : ils vérifient qu'un composant appelle bien la traduction, jamais que la
 * traduction est juste — les deux côtés de l'assertion pointent le même symbole.
 *
 * D'où ce bloc, seul endroit où les libellés sont écrits À LA MAIN. Il a une raison d'être
 * concrète : la première version de ce ticket nommait `c_facteur` « facteur de cadrage »
 * (c'est le facteur C de pose, §7.2) et `phi_deg` « latitude » (c'est l'angle du grand axe,
 * §6.2). Deux libellés faux, invisibles pour le motif, et invisibles aussi pour un test qui
 * se serait comparé à la table. On remplaçait un code incompréhensible par un mot faux.
 */
describe('T-0275 — les libellés nomment la bonne grandeur, pas seulement une grandeur', () => {
  it('nomme chaque verdict de détectabilité par le moyen de l’observer', () => {
    expect(LIBELLE_VERDICT_DETECTABILITE.OEIL_NU).toBe('à l’œil nu')
    expect(LIBELLE_VERDICT_DETECTABILITE.JUMELLES).toBe('aux jumelles')
    expect(LIBELLE_VERDICT_DETECTABILITE.TELESCOPE).toBe('au télescope')
    expect(LIBELLE_VERDICT_DETECTABILITE.PHOTO_SEULE).toBe('en photo seulement')
  })

  it('ne confond pas le facteur de pose avec le cadrage, ni un angle avec une latitude', () => {
    // §7.2 — `c_facteur` vaut C-03, le facteur de tolérance au bruit de la pose optimale.
    expect(LIBELLE_ENTREE['c_facteur']).toBe('facteur de pose C')
    // §6.2 — `phi_deg` est φ, l'orientation de l'ellipse ; la latitude, c'est `latitude_deg`.
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

  it('nomme ce qui borne la pose, et ce que le type d’objet supporte de Lune', () => {
    expect(LIBELLE_REGIME_POSE.LIMITE_SUIVI).toBe('limité par le suivi')
    expect(LIBELLE_TOLERANCE_LUNE.FAIBLE).toBe('faible')
  })
})
