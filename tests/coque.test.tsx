/**
 * T-0113 — coque planétarium: scene fills all, rest laid over it. Tests structure, not look:
 * five regions exist, one panel content mounted at a time, folded card mounts no body,
 * clicked scene object unfolds its fiche, Panorama freezes time, plan de session printable
 * with panel closed. Static render suffices: screen toggles go through a module store,
 * callable without DOM (why coque state/target live there, not in component state).
 */

import { readFileSync } from 'node:fs'
import { nombre } from '../src/registry/ecriture.ts'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import {
  HAUTEUR_SCENE_PX,
  LARGEUR_SCENE_PX,
  etatScene,
  reinitialiseScene,
  resolutionRendu,
} from '../src/ui/scene-etat.ts'
import { MenuReglages } from '../src/ui/MenuReglages.tsx'
import { BoutonInfo } from '../src/ui/PageInfo.tsx'
import { DEFAUT } from '../src/ui/app-saisie.ts'
import { ALERTE_VERIFICATION } from '../src/ui/Verification.tsx'
import { SOURCES } from '../src/registry/sources.ts'
import { CREDIT_RELEVE } from '../src/registry/imagerie.ts'
import { poidsParDefaut } from '../src/core/session.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import {
  montreListeCibles,
  poseMode,
  etatSeance,
  ouvreCible,
  publicateurRenduFile,
  reinitialiseSeance,
  type RenduFile,
} from '../src/ui/seance-etat.ts'
import { majCatalogue, reinitialiseCatalogue } from '../src/ui/catalogue-etat.ts'

const M31: ObjetCielProfond = {
  designation: 'M31',
  nomsCommuns: 'Andromède',
  adDeg: 10.6847,
  decDeg: 41.269,
  type: 'GALAXIE',
  majAxArcmin: 189.1,
  minAxArcmin: 61.7,
  posAngDeg: 35,
  vMag: 3.4,
  bMag: 4.4,
  surfBr: 13.5,
}

function ecran(): string {
  return renderToStaticMarkup(<App />)
}

const CSS_COQUE = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

afterEach(() => {
  reinitialiseSeance()
  reinitialiseScene()
  reinitialiseCatalogue()
})

/** Weight settings have no state in static render: inert controls. */
const POIDS_INERTES = {
  poids: poidsParDefaut(),
  surPoids: () => undefined,
  surDefaut: () => undefined,
}

const REGLAGES_INERTES = {
  poids: POIDS_INERTES,
} as const

/** Top bar: everything before the scene in the document. */
function barreHaute(html: string): string {
  return html.slice(0, html.indexOf('coque-scene'))
}

/** T-0325 — info page, mounted last in the coque. */
function pageInfo(html: string): string {
  return html.slice(html.indexOf('class="page-info"'))
}

/** Side panel head: everything before its body. */
function ongletsPanneau(html: string): string {
  const aside = html.slice(html.indexOf('<aside class="coque-lateral"'))
  return aside.slice(0, aside.indexOf('lateral-corps'))
}

describe('T-0113 — la scène occupe tout, le reste se pose dessus', () => {
  it('monte les régions : la barre et son temps, la scène, le matériel, les cartes, le panneau, la visée', () => {
    const html = ecran()
    expect(html).toContain('coque-topbar')
    expect(html).toContain('coque-scene')
    expect(html).toContain('coque-droite')
    expect(html).toContain('panneau-temps')
    expect(html).toContain('tiroir-site')
    expect(html).toContain('coque-cartes')
    expect(html).toContain('coque-lateral')
    expect(html).toContain('coque-visee')
    // Bottom bar unmounted: content mounted in top bar and Site card.
    expect(html).not.toContain('coque-barrebas')
    expect(html).not.toContain('<footer')
    // Scene is the planétarium canvas, not a stack of sections.
    expect(html).toContain('class="planetarium"')
  })

  // T-0213 — Vue card became the rail: toggles border the scene, no unfolding. Plan de nuit
  // left scene for the "Mon plan" tab.
  it('pose le rail de la vue sur la scène, et plus aucune carte du plan', () => {
    const html = ecran()
    expect(html).toContain('coque-rail')
    expect(html).not.toContain('carte-plan')
    expect(html).not.toContain('carte-vue')
    expect(html).not.toContain('coque-seance')
  })

  // Rail on scene's left: tab order = after scene, before panel, like the card it replaces.
  it('range le rail entre la scène et le panneau latéral', () => {
    const html = ecran()
    expect(html.indexOf('coque-rail')).toBeGreaterThan(html.indexOf('coque-scene'))
    expect(html.indexOf('coque-rail')).toBeLessThan(html.indexOf('coque-lateral'))
  })

  /** T-0437 — site/matériel = rail menus under calques, closed at load, not scene cards. */
  it('pose Site, Boîtier et Optique en trois menus du rail, sous les calques, fermés', () => {
    const html = ecran()
    expect(html).not.toContain('coque-materiel')
    expect(html).not.toContain('class="carte')
    const rail = html.slice(html.indexOf('coque-rail'), html.indexOf('class="coque-nuit"'))
    const calques = rail.indexOf('</details>', rail.indexOf('tiroir-calques'))
    expect(rail.indexOf('tiroir-site')).toBeGreaterThan(calques)
    expect(rail.indexOf('tiroir-site')).toBeLessThan(rail.indexOf('tiroir-boitier'))
    expect(rail.indexOf('tiroir-boitier')).toBeLessThan(rail.indexOf('tiroir-optique'))
    for (const cle of ['site', 'boitier', 'optique']) {
      expect(rail, cle).toContain(`<details class="tiroir tiroir-${cle}"><summary>`)
    }
  })

  /** T-0411 — time moved to top bar; right column keeps width (bar, cards stop before it). */
  it('laisse la colonne de droite au seul panneau, et porte le temps hors d’elle', () => {
    const html = ecran()
    const colonne = html.slice(html.indexOf('coque-droite'), html.indexOf('coque-temps'))
    expect(colonne.indexOf('coque-lateral')).toBeGreaterThan(-1)
    expect(colonne).not.toContain('panneau-temps')
    // T-0413 — scene bottom, own region.
    expect(html.indexOf('panneau-temps')).toBeGreaterThan(html.indexOf('coque-temps'))

    const debut = CSS_COQUE.indexOf('.coque-droite {')
    expect(debut).toBeGreaterThan(-1)
    const regle = CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))
    expect(regle).toContain('width: var(--lateral)')
  })

  // Setting readable without opening the menu: tooltip states it after the title.
  it('résume le boîtier et l’objectif dans la bulle du menu', () => {
    const html = ecran()
    // T-0282 — boîtier and its suivi: what decides pose.
    expect(html).toMatch(/role="tooltip"[^>]*>Boîtier — [^<]+ · [^<]+<\/span>/)
    expect(html).toMatch(/role="tooltip"[^>]*>Optique — [^<?]+ mm f\/[^<?]+<\/span>/)
  })

  // T-0238 — one drawing for everything laid on the sky. Wireframe: window replaces corner
  // brackets; full rule, title bar filled --barre-fond under --barre-encre title; night mode
  // repaints that pair for all bars.
  it('donne aux cartes, aux rubriques et aux panneaux la même barre de titre', () => {
    const regleDe = (selecteur: string) => {
      const debut = CSS_COQUE.indexOf(`${selecteur} {`)
      expect(debut, selecteur).toBeGreaterThan(-1)
      return CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))
    }
    for (const selecteur of ['.tiroir-contenu > h2.tiroir-rail-titre:first-child', '.lateral-entete', 'section:not([class]) > h2:first-child']) {
      expect(regleDe(selecteur), selecteur).toMatch(/background: (linear-gradient\()?var\(--barre-fond\)/)
    }
    // Section title takes bar ink, nothing repaints it after: grouped `color: inherit` below
    // painted it --texte (white on white).
    const titre = 'section:not([class]) > h2:first-child'
    expect(regleDe(titre)).toContain('color: var(--barre-encre)')
    const suite = CSS_COQUE.slice(CSS_COQUE.indexOf(`${titre} {`) + titre.length)
    for (const bloc of suite.split('}').filter((b) => b.includes(titre))) {
      expect(bloc, 'une règle ultérieure recolore le titre de section').not.toMatch(/\bcolor:/)
    }
    // Same bar as a foldable card: same height, rule included.
    expect(regleDe(titre)).toContain('height: calc(var(--barre-titre) + var(--trait))')
    expect(CSS_COQUE).not.toContain('.coque-lateral::before')
  })

  it('décolle le panneau des bords comme une carte, filet complet', () => {
    // T-0314 — unsticking carried by containing column; takes height left under time panel,
    // keeps rule.
    const debut = CSS_COQUE.indexOf('.coque-lateral {')
    const panneau = CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))
    expect(panneau).toContain('flex: 1')
    expect(panneau).toContain('min-height: 0')
    expect(panneau).toContain('border: var(--trait) solid var(--bordure)')
    // Does not fold: no button header, no fold sign.
    const html = ecran()
    const aside = html.slice(html.indexOf('<aside class="coque-lateral"'))
    const entete = aside.slice(0, aside.indexOf('lateral-corps'))
    expect(entete).not.toContain('aria-expanded')
  })

  it('garde le lieu lisible et réglable dans les deux modes', () => {
    // Site fields live in Site card: constant accessibility must survive the move, not
    // permanent unfolding.
    for (const mode of ['CIEL_PROFOND', 'PANORAMA'] as const) {
      poseMode(mode)
      const html = ecran()
      const barre = html.slice(html.indexOf('tiroir-site'))
      expect(barre, mode).toContain('Bortle')
      // Relief loading: no warning.
      expect(barre, mode).not.toContain('Horizon supposé plat')
    }
  })

  it('affiche les coordonnées du site, au dixième, sans ouvrir le menu', () => {
    // Empty header makes the move costly: card would need unfolding to know which sky is computed.
    const html = ecran()
    const dixieme = (v: string) => `${nombre(Number(v), 1)}°`
    expect(html).toContain(`>Site — ${dixieme(DEFAUT.latitude)} / ${dixieme(DEFAUT.longitude)}</span>`)
  })

  it('pose le mode nuit en bas à gauche de la scène, et la vérification sur la page info', () => {
    const html = ecran()
    expect(barreHaute(html)).not.toContain('Activer le mode nuit')
    const nuit = html.slice(html.indexOf('class="coque-nuit"'))
    expect(nuit).toContain('aria-label="Réglages du mode nuit"') // l'icône, seul contenu du résumé
    expect(nuit).toContain('Activer le mode nuit')
    const debut = CSS_COQUE.indexOf('.coque-nuit {')
    const corps = CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))
    expect(corps).toContain('left: var(--jour-carte)')
    expect(corps).toContain('bottom: var(--jour-carte)')
    expect(barreHaute(html)).not.toContain('href="#info"')
    expect(nuit).toContain('href="#info"')
    expect(pageInfo(html)).toContain('Vérification')
    expect(pageInfo(html)).toContain('Registre de constantes')
  })

  // T-0153 — top bar no longer states view target: full phrase is at bottom; abbreviating
  // here = two readings of one fact.
  it('ne répète plus la visée : elle est au centre de la barre basse', () => {
    expect(barreHaute(ecran()).replaceAll('<!-- -->', '')).not.toMatch(/az \d+° · h \d+°/)
  })
})

describe('§11.2 — un seul jeu de réglages à la fois', () => {
  it('ne monte que le contenu du mode courant', () => {
    const profond = ecran()
    expect(profond).toContain('Ne montrer que les objets photographiables')
    expect(profond).not.toContain('Séquence de filé')

    poseMode('PANORAMA')
    const panorama = ecran()
    expect(panorama).toContain('Séquence de filé')
    expect(panorama).not.toContain('Ne montrer que les objets photographiables')
  })

  // T-0213 — view toggles no longer unfold: present from opening (rail's point). One store
  // read, not full subscription.
  it('monte les huit bascules de la vue, calques compris, dès l’ouverture', () => {
    const rail = ecran()
    const debut = rail.indexOf('coque-rail')
    const bloc = rail.slice(debut, rail.indexOf('tiroir-site'))
    for (const libelle of [
      'Vue comme l’appareil',
      'Vue réaliste',
      'Figures IAU',
      'Frontières IAU',
      'Astérismes',
      'Cadre matériel',
      'Sol',
      'Voie lactée',
    ]) {
      expect(bloc, libelle).toContain(`aria-label="${libelle}"`)
    }
    expect((bloc.match(/aria-pressed=/g) ?? []).length).toBe(8)
  })

  // Sky-dressing couches go in "Calques" drawer; cadre matériel (what is aimed at) stays alone
  // on rail.
  it('range figures, frontières, astérismes, sol et voie lactée dans les calques, pas le cadre', () => {
    const html = ecran()
    const rail = html.slice(html.indexOf('coque-rail'), html.indexOf('tiroir-site'))
    const debut = rail.indexOf('tiroir-calques')
    const fin = rail.indexOf('</details>', debut)
    expect(debut).toBeGreaterThan(-1)
    const calques = rail.slice(debut, fin)
    for (const libelle of ['Figures IAU', 'Frontières IAU', 'Astérismes', 'Sol', 'Voie lactée']) {
      expect(calques, libelle).toContain(`aria-label="${libelle}"`)
    }
    expect(calques).not.toContain('aria-label="Cadre matériel"')
    expect(rail).toContain('aria-label="Cadre matériel"')
  })

  // T-0403 — in Panorama rail drops what no longer acts under preview but keeps Voie lactée:
  // its toggle still drives galactic-plane line (T-0173).
  it('en Panorama, retire figures, frontières et astérismes mais garde la Voie lactée', () => {
    poseMode('PANORAMA')
    const html = ecran()
    const rail = html.slice(html.indexOf('coque-rail'), html.indexOf('tiroir-site'))
    const absente = (libelle: string): string | undefined =>
      rail
        .slice(0, rail.indexOf(`aria-label="${libelle}"`))
        .match(/data-absente="(true|false)"/g)
        ?.at(-1)
    for (const libelle of ['Figures IAU', 'Frontières IAU', 'Astérismes']) {
      expect(absente(libelle), libelle).toBe('data-absente="true"')
    }
    expect(absente('Voie lactée')).toBe('data-absente="false"')
  })

  /**
   * T-0069 — "un raccourci qui n'est écrit que dans le code n'existe pas". Vue card showed
   * them; rail: non-toggle button, announces, commands nothing, tooltip opens on focus as on
   * hover.
   */
  it('garde les raccourcis clavier atteignables depuis le rail', () => {
    const html = ecran()
    const rail = html.slice(html.indexOf('coque-rail'), html.indexOf('class="coque-nuit"'))
    expect(rail).toContain('aria-label="Raccourcis clavier de la scène"')
    expect(rail).toMatch(/← ↑ ↓ →/)
  })

  it('survit à un changement de matériel : le panneau reste sur le mode courant', () => {
    poseMode('PANORAMA')
    ecran()
    expect(etatSeance().mode).toBe('PANORAMA')
  })
})

/** T-0181 — side panel = column, not drawer: closed state gone, mode alone decides content. */
describe('§11.3 — le panneau est toujours ouvert et son contenu suit le mode', () => {
  it('est visible au démarrage, sans attribut de fermeture ni bouton pour le fermer', () => {
    const html = ecran()
    expect(html).toContain('<aside class="coque-lateral" id="panneau-lateral"')
    expect(html).not.toMatch(/<aside class="coque-lateral"[^>]*hidden/)
    expect(html).not.toContain('lateral-fermer')
    expect(html).not.toContain('Fermer le panneau')
  })

  // T-0246 — tabs already name what panel carries: a title would repeat.
  it('ne répète pas le mode dans un titre, sur la liste comme en Panorama', () => {
    for (const mode of ['CIEL_PROFOND', 'PANORAMA'] as const) {
      poseMode(mode)
      const entete = ongletsPanneau(ecran())
      expect(entete, mode).not.toContain('<h2')
      expect(entete, mode).not.toContain('Toutes les cibles')
    }
  })

  it('ne laisse plus aucun état fermé exister', () => {
    // Stylesheet cannot describe a closed panel either.
    expect(CSS_COQUE).not.toContain('.coque-lateral[hidden]')
  })

  it('porte le plan dans l’onglet « Mon plan »', () => {
    poseMode('PLAN')
    const html = ecran()
    const panneau = html.slice(html.indexOf('coque-lateral'))
    expect(panneau.slice(0, panneau.indexOf('</aside>'))).toContain('plan-session')
    expect(ongletsPanneau(html)).toContain('Mon plan')
  })
})

/**
 * T-0180 — top bar commanded the MODE, not panels. T-0246 — toggle moved to panel, forming
 * its tabs. Tests move + announcement: first-rank state carried by two pressed buttons at
 * panel head, nothing similar in top bar. Mode-decided content tested where mounted.
 */
describe('§11.3 — la bascule de mode forme les onglets du panneau latéral', () => {
  it('porte les deux positions en tête du panneau, et plus aucune dans la barre haute', () => {
    const html = ecran()
    const entete = ongletsPanneau(html)
    expect(entete).toContain('class="onglets" role="group" aria-label="Mode d’interface"')
    expect(entete).toContain('Ciel profond')
    expect(entete).toContain('Panorama')
    const topbar = barreHaute(html)
    expect(topbar).not.toContain('Mode d’interface')
    expect(topbar).not.toContain('class="onglet')
    // The three panel buttons left with the drawer they opened.
    expect(topbar).not.toContain('barrehaut-panneaux')
    expect(topbar).not.toContain('Toutes les cibles')
    expect(topbar).not.toContain('Plan de nuit')
    expect(topbar).not.toContain('aria-controls="panneau-lateral"')
  })

  it('annonce la position active par aria-pressed, et elle seule', () => {
    const profond = ongletsPanneau(ecran())
    expect(profond).toMatch(/aria-pressed="true">Ciel profond/)
    expect(profond).toMatch(/aria-pressed="false">Panorama/)
    poseMode('PANORAMA')
    const panorama = ongletsPanneau(ecran())
    expect(panorama).toMatch(/aria-pressed="false">Ciel profond/)
    expect(panorama).toMatch(/aria-pressed="true">Panorama/)
  })

  it('marque la position active autrement que par la seule couleur', () => {
    poseMode('PANORAMA')
    expect(ongletsPanneau(ecran())).toMatch(
      /class="onglet actif"[^>]*aria-pressed="true">Panorama/,
    )
    // Background, but also rule and weight.
    const debut = CSS_COQUE.indexOf('.onglet.actif {')
    expect(debut).toBeGreaterThan(-1)
    const actif = CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))
    expect(actif).toContain('background: var(--surface-haute)')
    expect(actif).toContain('border-bottom-color: var(--texte)')
    expect(actif).toContain('font-weight: var(--graisse-forte)')
  })

  it('garde les onglets au-dessus de la fiche : on en sort sans repasser par la liste', () => {
    ouvreCible(M31)
    const html = ecran()
    const aside = html.slice(html.indexOf('<aside class="coque-lateral"'))
    const onglets = aside.indexOf('class="onglets"')
    expect(onglets).toBeGreaterThan(-1)
    expect(onglets).toBeLessThan(aside.indexOf('<h2 tabindex="-1">M31 — '))
  })

  it('garde la cible de clic gantée sur les deux positions (§11.2)', () => {
    const debut = CSS_COQUE.indexOf('.onglet {')
    expect(debut).toBeGreaterThan(-1)
    expect(CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))).toContain(
      'min-height: var(--cible-clic)',
    )
  })
})

describe('§3.4 — un objet cliqué ouvre sa fiche', () => {
  it('met la fiche à la place de la liste, garnie, sans autre geste', () => {
    // List holds panel until an object is designated: scene click must put fiche there, else
    // gesture shows nothing.
    expect(etatSeance().vueCibles).toBe('LISTE')
    expect(ecran()).toContain('Ne montrer que les objets photographiables')
    ouvreCible(M31)
    expect(etatSeance().vueCibles).toBe('FICHE')
    expect(etatSeance().cible?.designation).toBe('M31')
    // §6.2 / §6.3 / §7 fiche opens, not a bare name. Mount effect fills fields from object:
    // not run in static render, only fiche presence checkable.
    const html = ecran()
    expect(html).toContain('Photographie')
    expect(html).toContain('Cadrage')
    // List unmounted: not kept alive behind the fiche.
    expect(html).not.toContain('Ne montrer que les objets photographiables')
  })

  it('rend la liste au retour, recherche et filtre intacts', () => {
    majCatalogue({ recherche: 'andro', photographiablesSeules: false })
    ouvreCible(M31)
    montreListeCibles()
    const html = ecran()
    expect(html).toContain('Ne montrer que les objets photographiables')
    expect(html).toContain('value="andro"')
    // Target stays designated: READING changes, not the choice.
    expect(etatSeance().cible?.designation).toBe('M31')
  })

  it('n’offre le retour que sur la fiche, jamais sur la liste', () => {
    expect(ecran()).not.toContain('lateral-retour')
    ouvreCible(M31)
    const fiche = ecran()
    expect(fiche).toContain('lateral-retour')
    // Tooltip names button (`BoutonGlyphe`): its text is the accessible name.
    expect(fiche).toContain('role="tooltip" data-place="bas">Revenir à la liste des cibles<')
    // Header names target and carries its note, outside any button: announced.
    expect(fiche).toContain('<h2 tabindex="-1">M31 — ')
  })

  it('garde l’état du panneau d’un mode à l’autre', () => {
    ouvreCible(M31)
    poseMode('PANORAMA')
    expect(ecran()).toContain('Séquence de filé')
    poseMode('CIEL_PROFOND')
    expect(etatSeance().vueCibles).toBe('FICHE')
    expect(ecran()).toContain('<h2 tabindex="-1">M31 — ')
  })

  it('ne pose plus aucune carte Cible sur la scène', () => {
    ouvreCible(M31)
    const html = ecran()
    expect(html).not.toContain('carte-cible')
    expect(html).not.toContain('data-accent')
  })
})

describe('§9.3 — le mode Panorama fige le temps', () => {
  it('démarre en Ciel profond', () => {
    expect(etatSeance().mode).toBe('CIEL_PROFOND')
  })

  it('bascule la scène en temps figé au passage en Panorama', () => {
    expect(etatScene().temps.modeTemps).toBe('MAINTENANT')
    poseMode('PANORAMA')
    expect(etatSeance().mode).toBe('PANORAMA')
    expect(etatScene().temps.modeTemps).toBe('FIGE')
  })

  it('ne redémarre pas le temps tout seul au retour en Ciel profond', () => {
    poseMode('PANORAMA')
    poseMode('CIEL_PROFOND')
    expect(etatSeance().mode).toBe('CIEL_PROFOND')
    // Handing time back to system clock is a gesture, not a side effect (§3.2).
    expect(etatScene().temps.modeTemps).toBe('FIGE')
  })
})

/**
 * T-0116 — filé painted per frame, its counters not published at same rate. `poseRenduFile`
 * writes to séance store → React render: per-paint publish = 30/s (T-0056). Loop calls
 * publisher only at diagnostic rate; it drops anything unchanged.
 */
describe('T-0116 — les compteurs du filé ne rendent pas par image', () => {
  const RENDU: RenduFile = { reelles: 12 }

  it('ne publie qu’une fois tant que les compteurs ne bougent pas', () => {
    const publies: (RenduFile | null)[] = []
    const publie = publicateurRenduFile((r) => publies.push(r))
    // Whole diagnostic period of identical passes: one React render.
    for (let i = 0; i < 30; i++) publie({ ...RENDU })
    expect(publies).toHaveLength(1)
    expect(publies[0]).toEqual(RENDU)
  })

  it('publie dès qu’un compteur change, et une seule fois à l’extinction', () => {
    const publies: (RenduFile | null)[] = []
    const publie = publicateurRenduFile((r) => publies.push(r))
    publie(RENDU)
    publie({ ...RENDU, reelles: RENDU.reelles + 1 })
    publie(null)
    publie(null)
    expect(publies).toHaveLength(3)
    expect(publies[2]).toBeNull()
  })

  it('publie le premier état même quand le filé est éteint dès le départ', () => {
    // Without primer, initial `null` reads "unchanged": previous séance's counters stay on
    // empty cadre.
    const publies: (RenduFile | null)[] = []
    publicateurRenduFile((r) => publies.push(r))(null)
    expect(publies).toEqual([null])
  })
})

describe('T-0183 — le plan de nuit est l’onglet « Mon plan », et il reste imprimable', () => {
  it('n’est plus une carte posée sur la scène', () => {
    expect(ecran()).not.toContain('carte-plan')
  })

  it('garde le plan monté, masqué, hors de son onglet', () => {
    for (const mode of ['CIEL_PROFOND', 'PANORAMA'] as const) {
      poseMode(mode)
      const html = ecran()
      // Hidden, not unmounted: unmounted, printing from another tab yields a blank page.
      expect(html, mode).toMatch(/<div class="lateral-plan" hidden="">/)
      expect(html, mode).toContain('plan-session')
    }
  })

  it('montre le plan sur l’onglet « Mon plan », sans la liste', () => {
    poseMode('PLAN')
    const html = ecran()
    expect(html).toContain('<div class="lateral-plan">')
    expect(html).not.toContain('Ne montrer que les objets photographiables')
  })

  it('n’existe qu’en un exemplaire : un seul textarea d’export dans le document', () => {
    for (const mode of ['CIEL_PROFOND', 'PLAN'] as const) {
      poseMode(mode)
      const html = ecran()
      expect(html.split('plan-export').length - 1, mode).toBeLessThanOrEqual(1)
      expect(html.split('class="plan-session"').length - 1).toBe(1)
    }
  })

  it('sort le plan à l’impression, depuis n’importe quel onglet, et rien d’autre', () => {
    const impression = CSS_COQUE.slice(CSS_COQUE.indexOf('@media print'))
    // No bars, scene, cards, canvas.
    expect(impression).toMatch(/\.panneau-temps \{\n\s*display: none/)
    expect(impression).toContain('.planetarium')
    // Except plan tab, even with `hidden`, nothing else of the panel.
    expect(impression).toContain('.lateral-plan[hidden]')
    expect(impression).toContain('.lateral-corps > :not(.lateral-plan)')
    expect(impression).toContain('.lateral-plan > :not(.plan-session)')
  })
})

/**
 * T-0153 — only one reading left, in the bar. T-0038 info drawer mixed image-dating phrase
 * with four workshop readings (limiting magnitude, époque, cadrage, render diagnostic);
 * persona doesn't measure rendering. Tests: phrase visible without click, drawer gone.
 * Bottom bar unmounted, phrase in top bar.
 */
describe('T-0153 — la phrase de visée se lit sans un clic', () => {
  // T-0414 — phrase at scene top right, against the panel.
  it('pose la phrase en haut à droite, hors de la barre haute', () => {
    const html = ecran().replaceAll('<!-- -->', '')
    const visee = html.slice(html.indexOf('coque-visee'))
    // Six prefixed fields, in the order of the phrase they replace.
    expect(visee).toMatch(/>AD<[\s\S]*>δ<[\s\S]*>AZ<[\s\S]*>H<[\s\S]*>CH<[\s\S]*>ROT</)
    const haut = barreHaute(html)
    expect(haut).not.toContain('coque-visee')
    // T-0325 — legend left the bar for the info modal.
    expect(haut).not.toContain('Couleur — famille')
    expect(haut).toContain('<h1')
    expect(haut).not.toContain('panneau-temps')
  })

  it('se rogne plutôt que de passer sous le panneau de séance', () => {
    const debut = CSS_COQUE.indexOf('.coque-visee {')
    expect(debut).toBeGreaterThan(-1)
    const corps = CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))
    expect(corps).toContain('right: calc(var(--lateral) + 2 * var(--jour-carte))')
    expect(corps).toContain('overflow: hidden')
  })

  it('ne monte plus aucun tiroir de lectures dans la barre haute', () => {
    const html = ecran()
    expect(html).not.toContain('scene-lectures')
    expect(html).not.toContain('tiroir-infos')
    // Workshop readings left with it: no frames-per-second counter.
    expect(html).not.toContain('images/s')
    expect(html).not.toContain('étoiles tracées sur')
  })
})

/**
 * T-0040 — canvas alone in centre, no margins. No renderer → tests the rule itself. T-0037
 * reserved-height bottom row moot once readings left; `min-height: 0` stays essential, else
 * canvas regains intrinsic height, page scroll returns.
 */
describe('T-0040 — la colonne centrale ne porte plus que la scène', () => {
  const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

  /** Body of a rule, isolated from the rest of the stylesheet. */
  function regle(selecteur: string): string {
    const debut = CSS.indexOf(`${selecteur} {`)
    expect(debut).toBeGreaterThan(-1)
    return CSS.slice(debut, CSS.indexOf('}', debut))
  }

  it('ne réserve plus aucune hauteur sous le canevas', () => {
    expect(CSS).not.toContain('--hauteur-lectures')
    expect(CSS).not.toContain('.scene-lectures')
    expect(regle('.coque-scene > .scene')).not.toContain('grid-template-rows')
  })

  it('colle le canevas aux bordures : ni marge ni remplissage', () => {
    const scene = regle('.coque-scene > .scene')
    expect(scene).toContain('padding: 0')
    expect(scene).toContain('margin: 0')
    // Without it the grid track takes the canvas's intrinsic height.
    expect(scene).toContain('min-height: 0')
    expect(regle('.coque-scene')).toContain('padding: 0')
  })

  it('remplit la boîte plutôt que d’y loger un rapport figé', () => {
    const canevas = regle('.coque-scene .planetarium')
    expect(canevas).toContain('width: 100%')
    expect(canevas).toContain('height: 100%')
    // `contain` fit a 16/9 in non-16/9 box: black bands top/bottom. Render definition now
    // follows box.
    expect(canevas).not.toContain('object-fit')
    // Inline canvas reserves line gap under baseline: page scrolls.
    expect(canevas).toContain('display: block')
  })

  it('fait suivre la définition de rendu à la boîte, sans déformer', () => {
    // Definition ratio = box ratio: round stars stay round.
    const haute = resolutionRendu(1000, 1000, 1)
    expect(haute.largeurPx / haute.hauteurPx).toBeCloseTo(1, 6)
    const large = resolutionRendu(1600, 400, 1)
    expect(large.largeurPx / large.hauteurPx).toBeCloseTo(4, 6)
  })

  it('plafonne le nombre de pixels peints au budget de référence', () => {
    const budget = LARGEUR_SCENE_PX * HAUTEUR_SCENE_PX
    // Retina panel, big window: following `devicePixelRatio` would double load.
    const retina = resolutionRendu(1600, 900, 2)
    expect(retina.largeurPx * retina.hauteurPx).toBeLessThanOrEqual(budget + 1)
    // Small box: screen density is the bound, not the budget.
    const petite = resolutionRendu(400, 300, 2)
    expect(petite).toStrictEqual({ largeurPx: 800, hauteurPx: 600 })
  })

  it('rend la scène au flux vertical sous le repli, canevas en 16 / 9', () => {
    const repli = CSS.slice(CSS.indexOf('@media (max-width: 1100px)'))
    expect(repli).toMatch(/\.coque-scene > \.scene \{[^}]*display: block/)
    expect(repli).toMatch(/\.coque-scene \.planetarium \{[^}]*aspect-ratio: 16 \/ 9/)
    // Menu stays usable: content scrolls instead of lengthening the page.
    expect(repli).toMatch(/\.tiroir\[open\] > \.tiroir-contenu \{[^}]*max-height/)
  })
})

/**
 * T-0041 — alert signalled on closed drawer. Cause in closed drawer invisible: user sets
 * something, nothing moves, explanation behind an unthought click. T-0153 unmounted info
 * menu; rule still holds for vérification drawer (T-0082 flags a lost write).
 */
describe('T-0041 — un tiroir qui s’alerte ne le dit pas par la seule couleur', () => {
  const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

  it('change aussi la graisse et la bordure', () => {
    const debut = CSS.indexOf(".tiroir[data-alerte='true'] > summary {")
    expect(debut).toBeGreaterThan(-1)
    const corps = CSS.slice(debut, CSS.indexOf('}', debut))
    // Night-mode red says nothing alone.
    expect(corps).toContain('font-weight: var(--graisse-forte)')
    expect(corps).toContain('border-color: var(--alerte)')
  })
})


describe('T-0047 — la roue crantée reloge le choix brut dans le catalogue', () => {
  it('T-0325 — les réglages sont sur la page info', () => {
    expect(pageInfo(renderToStaticMarkup(<App />))).toContain('Réglages')
  })

  it('T-0128 — ne porte plus le catalogue : il a un écran à lui', () => {
    const rendu = renderToStaticMarkup(<MenuReglages {...REGLAGES_INERTES} />)
    expect(rendu).not.toContain('Chercher dans le catalogue')
    expect(rendu).not.toContain('<datalist')
  })

  it('ne porte plus de niveau d’explication : la glose est au survol pour tous', () => {
    const rendu = renderToStaticMarkup(<MenuReglages {...REGLAGES_INERTES} />)
    expect(rendu).not.toContain('Niveau')
    expect(rendu).not.toContain('<select')
  })

  it('T-0087 — porte les cinq poids C-15 et le retour aux valeurs du registre', () => {
    const rendu = renderToStaticMarkup(<MenuReglages {...REGLAGES_INERTES} />)
    // T-0169 — rails are `Curseur`, not `input[type=range]`: role counts them; assistive tech
    // reads it.
    expect(rendu.match(/role="slider"/g)).toHaveLength(5)
    expect(rendu).toContain('Revenir aux poids par défaut')
    // Effective weight displayed: what the plan uses, not raw position.
    expect(rendu).toContain('25 %')
  })

  it('T-0087 — dit que le score arbitre les conflits, sans ordonner la nuit', () => {
    const rendu = renderToStaticMarkup(<MenuReglages {...REGLAGES_INERTES} />)
    expect(rendu).toMatch(/Départage deux cibles/)
  })

  it('garde la cible de clic de §11.2 : le bouton info a l’allure d’un tiroir', () => {
    expect(renderToStaticMarkup(<App />)).toMatch(/class="bouton-info"/)
    const styles = readFileSync(
      join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'),
      'utf8',
    )
    const debut = styles.indexOf('.bouton-info,\n.tiroir > summary {')
    expect(debut).toBeGreaterThan(-1)
    expect(styles.slice(debut, styles.indexOf('}', debut))).toContain(
      'min-height: var(--cible-clic)',
    )
  })
})



/**
 * T-0184 — Vérification + Réglages merged in one drawer (two adjacent drawers answered the
 * same "off the main path" gesture). Tests what merge must not cost: T-0041 persistence
 * alert (valuable only on CLOSED drawer) and access to both contents.
 */
describe('T-0184 — un seul tiroir pour la vérification et les réglages', () => {
  /** Info button outside the app: only a forged persistence failure reveals the alert. */
  function barreSeule(echec: boolean): string {
    const persistance = {
      message: echec ? 'écriture perdue' : null,
      echec,
      surExport: () => undefined,
      surImport: () => undefined,
    }
    return renderToStaticMarkup(<BoutonInfo persistance={persistance} />)
  }

  it('T-0325 — plus aucun tiroir d’outils ni d’info : les deux contenus sont sur la page', () => {
    const html = ecran()
    expect(barreHaute(html)).not.toContain('tiroir-outils')
    expect(barreHaute(html)).not.toContain('tiroir-info')
    expect(pageInfo(html)).toContain('état du socle')
    expect(pageInfo(html)).toContain('Réglages')
  })

  it('T-0325 — le bouton info n’a que son icône, et sa bulle le nomme', () => {
    const html = ecran()
    const topbar = html.slice(html.indexOf('class="coque-nuit"'))
    const bouton = topbar.slice(topbar.indexOf('<a href="#info"'))
    const lien = bouton.slice(0, bouton.indexOf('</a>'))
    expect(lien).toContain('aria-labelledby')
    expect(lien.replace(/<[^>]+>/g, '')).toBe('info') // la ligature de l'icône, seule
    expect(topbar).toContain('Infos de l’app')
  })

  it('le bouton info se pose juste sous le mode nuit', () => {
    const html = ecran()
    const nuit = html.slice(html.indexOf('class="coque-nuit"'))
    expect(nuit.indexOf('tiroir-nuit')).toBeGreaterThan(-1)
    expect(nuit.indexOf('bouton-info')).toBeGreaterThan(nuit.indexOf('tiroir-nuit'))
  })

  it('T-0041 — un échec de persistance se signale sur le tiroir fermé, et nomme sa section', () => {
    const alerte = barreSeule(true)
    const resume = alerte.slice(alerte.indexOf('<a href="#info"'))
    expect(resume).toContain('data-alerte="true"')
    expect(resume.slice(0, resume.indexOf('</a>'))).toContain(ALERTE_VERIFICATION)
    // Mention names the section "Vérification", not just the failure.
    expect(ALERTE_VERIFICATION).toMatch(/^Vérification/)
    expect(barreSeule(false)).toContain('data-alerte="false"')
  })

  it('n’a rien retiré : les cinq poids et l’état du socle restent atteignables', () => {
    const topbar = pageInfo(ecran())
    expect(topbar.match(/role="slider"/g)?.length).toBeGreaterThanOrEqual(5)
    expect(topbar).toContain('Registre de constantes')
    expect(topbar).toContain('Matrice de dégradation hors-ligne')
    expect(topbar).toContain('Exporter mes données (JSON)')
  })
})

/**
 * T-0228 — data provenance read in one place (was next to values it covers: fiche dimensions,
 * Bortle field, detectability verdict, filter advice). Tests grouping AND its price: the two
 * mentions PRD requires at contact must not leave with the others.
 */
describe('T-0228 / T-0325 — la page « info » porte les sources', () => {
  it('T-0325 — la page info porte les sources', () => {
    expect(pageInfo(ecran())).toContain('Sources des données')
  })

  it('T-0325 — la profondeur affichée se lit sous le titre de la page, plus dans la barre', () => {
    const html = ecran()
    expect(barreHaute(html)).not.toContain('Profondeur affichée')
    const page = pageInfo(html)
    expect(page.indexOf('Profondeur affichée')).toBeLessThan(page.indexOf('<details'))
    expect(page).toMatch(/Profondeur affichée (<!-- -->)?\d+,\d(<!-- -->)? mag/)
  })

  it('T-0325 — ses huit rubriques sont des accordéons fermés à l’ouverture', () => {
    const page = pageInfo(ecran())
    expect(page.match(/<details class="accordeon"/g)).toHaveLength(8)
    // Legend opens the list.
    expect(page.indexOf('Légende')).toBeLessThan(page.indexOf('Vérification'))
    expect(page).not.toMatch(/<details class="accordeon"[^>]* open/)
    // One open at a time: the eight form a native exclusive group.
    expect(page.match(/<details class="accordeon" name="page-info"/g)).toHaveLength(8)
    // T-0386 — full chain of traced values left their tooltip for the info page.
    expect(page).toContain('<h2>Calcul</h2>')
    // T-0368 — declination thresholds left the Site card for the info page.
    expect(page).toContain('Déclinaisons du site')
  })

  it('nomme l’amont de chaque donnée affichée', () => {
    const info = pageInfo(ecran())
    for (const source of SOURCES) {
      expect(info).toContain(source.donnee)
    }
    expect(info).toContain('OpenNGC')
    expect(info).toContain('astronomy-engine')
  })

  it('n’a pas emporté les deux mentions que le PRD impose au contact', () => {
    // §6.4 — image attribution is a display condition, not a bibliography.
    ouvreCible(M31)
    expect(CREDIT_RELEVE.licence).toContain('CDS')
    // §10.2 level 3 — a CONSTANTE's source read in info page "Calcul" section (T-0386):
    // `traces-affichees.test.tsx` checks it; static render doesn't run value registration.
  })
})

/**
 * T-0128 — catalogue has ONE screen. Tests replacement: `chercheCatalogue` has its own tests,
 * filtering those of `cibles-liste`. At coque level: neither replaced path survives; a second
 * catalogue path = the defect this lot fixes.
 */
describe('T-0128 — le catalogue remplace les deux chemins vers les cibles', () => {
  it('est le contenu du panneau en Ciel profond, et le seul monté (§11.2)', () => {
    const ouvert = ecran()
    expect(ouvert).toContain('Ne montrer que les objets photographiables')
    expect(ouvert).not.toContain('Séquence de filé')
    // T-0181 — no longer behind a button: Ciel profond mode carries it.
    poseMode('PANORAMA')
    expect(ecran()).not.toContain('Ne montrer que les objets photographiables')
  })

  it('replie les filtres derrière un bouton à droite de la recherche', () => {
    const ferme = ecran()
    expect(ferme).toMatch(/<input[^>]+type="search"[^>]*\/>.*?filter_list/)
    expect(ferme).toMatch(/class="cibles-volet" data-ouvert="false" inert=""/)
  })

  it('porte la recherche et les deux filtres, que plus personne d’autre ne porte', () => {
    majCatalogue({ filtresOuverts: true })
    const ouvert = ecran()
    expect(ouvert).toMatch(/<input[^>]+type="search"/)
    expect(ouvert).toContain('cibles-types-choix')
    expect(ouvert).toContain('Magnitude max')
  })

  it('filtre par types en chips, sans chip « Tous types » : aucun retenu les garde tous', () => {
    majCatalogue({ filtresOuverts: true })
    const ouvert = ecran()
    expect(ouvert).toContain('role="group" aria-labelledby="cibles-types-libelle"')
    expect(ouvert).not.toContain('Tous types')
  })

  it('a vidé la fiche de son choix de cible : elle ne fait plus que décrire', () => {
    ouvreCible(M31)
    const fiche = ecran()
    expect(fiche).not.toContain('Cibles visibles')
    expect(fiche).not.toContain('Type listé')
  })

  it('borne le filtre de magnitude sur le domaine du registre, sans le réécrire', () => {
    majCatalogue({ filtresOuverts: true })
    const ouvert = ecran()
    expect(ouvert).toContain(`min="${DOMAINES.m_int.min}"`)
    expect(ouvert).toContain(`max="${DOMAINES.m_int.max}"`)
  })

  it('nomme le SNR sur lequel la pose est calculée : un temps sans sa cible ne se lit pas', () => {
    expect(ecran()).toMatch(/signal\/bruit de \d+/)
  })
})

describe('§11.2 — la cible de clic tient dans les panneaux comme ailleurs', () => {
  it('garde la cible de clic de §11.2 : un `input` a la hauteur d’usage ganté', () => {
    const styles = readFileSync(
      join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'),
      'utf8',
    )
    const debut = styles.indexOf('input,\nselect {')
    expect(debut).toBeGreaterThan(-1)
    expect(styles.slice(debut, styles.indexOf('}', debut))).toContain(
      'min-height: var(--cible-clic)',
    )
  })
})
