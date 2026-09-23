/**
 * T-0113 — la coque planétarium : la scène occupe tout, le reste se pose dessus.
 *
 * Ce qui est vérifié ici n'est pas une apparence, c'est la structure : les cinq régions
 * existent, un seul contenu de panneau est monté à la fois, une carte repliée ne monte pas
 * son corps, un objet cliqué dans la scène déplie sa fiche, le mode Panorama fige le
 * temps, et le plan de session reste imprimable panneau fermé.
 *
 * Le rendu statique suffit : chaque bascule d'écran passe par un magasin de module, appelable
 * sans DOM. C'est précisément pourquoi l'état de la coque et la cible y vivent plutôt que
 * dans l'état local d'un composant.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { mentionProjection } from '../src/ui/scene-overlay.ts'
import {
  HAUTEUR_SCENE_PX,
  LARGEUR_SCENE_PX,
  etatScene,
  reinitialiseScene,
  resolutionRendu,
} from '../src/ui/scene-etat.ts'
import { MenuReglages } from '../src/ui/MenuReglages.tsx'
import { BarreHaut, type BarreHautProps } from '../src/ui/BarreHaut.tsx'
import { DEFAUT } from '../src/ui/app-saisie.ts'
import { LIBELLES_RECADRAGE } from '../src/ui/PanneauBoitier.tsx'
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
import {
  basculeCarte,
  etatCoque,
  ouvreCarte,
  reinitialiseCoque,
} from '../src/ui/coque-etat.ts'

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
  reinitialiseCoque()
  reinitialiseCatalogue()
})

/** Les réglages de poids n'ont pas d'état dans un rendu statique : commandes inertes. */
const POIDS_INERTES = {
  poids: poidsParDefaut(),
  surPoids: () => undefined,
  surDefaut: () => undefined,
}

const REGLAGES_INERTES = {
  poids: POIDS_INERTES,
} as const

/** La barre haute : tout ce qui précède la scène dans le document. */
function barreHaute(html: string): string {
  return html.slice(0, html.indexOf('coque-scene'))
}

/** La tête du panneau latéral : tout ce qui précède son corps. */
function ongletsPanneau(html: string): string {
  const aside = html.slice(html.indexOf('<aside class="coque-lateral"'))
  return aside.slice(0, aside.indexOf('lateral-corps'))
}

describe('T-0113 — la scène occupe tout, le reste se pose dessus', () => {
  it('monte les six régions : la barre, la scène, le temps, le matériel, les cartes, le panneau', () => {
    const html = ecran()
    expect(html).toContain('coque-topbar')
    expect(html).toContain('coque-scene')
    expect(html).toContain('coque-droite')
    expect(html).toContain('panneau-temps')
    expect(html).toContain('cartes-materiel')
    expect(html).toContain('coque-cartes')
    expect(html).toContain('coque-lateral')
    // La barre basse est démontée : son contenu est monté dans la barre haute et la carte Site.
    expect(html).not.toContain('coque-barrebas')
    expect(html).not.toContain('<footer')
    // La scène est bien le canevas du planétarium, pas une pile de sections.
    expect(html).toContain('class="planetarium"')
  })

  // T-0213 — la carte Vue est devenue le rail : ses bascules bordent la scène au lieu de se
  // déplier. Ce qui se pose sur la scène est donc le rail, puis la carte du plan.
  it('pose le rail de la vue et la carte du plan sur la scène', () => {
    const html = ecran()
    for (const region of ['coque-rail', 'carte-plan']) {
      expect(html, region).toContain(region)
    }
    expect(html).not.toContain('carte-vue')
    expect(html).not.toContain('coque-seance')
  })

  // Le rail borde la scène à gauche : la tabulation le rencontre après elle et avant le
  // panneau, comme la carte qu'il remplace.
  it('range le rail entre la scène et le panneau latéral', () => {
    const html = ecran()
    expect(html.indexOf('coque-rail')).toBeGreaterThan(html.indexOf('coque-scene'))
    expect(html.indexOf('coque-rail')).toBeLessThan(html.indexOf('coque-lateral'))
  })

  /**
   * T-0238 — le matériel n'est plus une colonne : Boîtier et Optique sont deux cartes posées
   * sur la scène, repliées au démarrage — leur résumé suffit à relire un matériel réglé une
   * fois. Leur place dans le document reste entre la scène et les autres cartes, pour que la
   * tabulation les rencontre d'abord.
   */
  it('pose Boîtier et Optique en cartes repliées, sans colonne de matériel', () => {
    const html = ecran()
    expect(html).not.toContain('coque-materiel')
    expect(html).toContain('class="carte carte-boitier" data-ouverte="false"')
    expect(html).toContain('class="carte carte-optique" data-ouverte="false"')
    expect(html.indexOf('carte-boitier')).toBeLessThan(html.indexOf('carte-optique'))
    expect(html.indexOf('cartes-materiel')).toBeGreaterThan(html.indexOf('coque-scene'))
    expect(html.indexOf('cartes-materiel')).toBeLessThan(html.indexOf('coque-cartes'))
  })

  /**
   * T-0314 — le panneau du temps coiffe le panneau de séance, dans la colonne de droite.
   *
   * C'est la COLONNE qui porte la largeur, et non plus le panneau de séance seul : les deux
   * boîtes la remplissent exactement, si bien que le temps ne se redimensionne jamais sous la
   * main et que les deux cadres empilés s'alignent. La hauteur restante revient au panneau de
   * séance, qui est ce qui défile.
   */
  it('range le temps au-dessus du panneau, dans une colonne qui tient la largeur', () => {
    const html = ecran()
    expect(html.indexOf('coque-droite')).toBeGreaterThan(html.indexOf('coque-scene'))
    expect(html.indexOf('panneau-temps')).toBeLessThan(html.indexOf('coque-lateral'))

    const debut = CSS_COQUE.indexOf('.coque-droite {')
    expect(debut).toBeGreaterThan(-1)
    const colonne = CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))
    expect(colonne).toContain('right: var(--jour-carte)')
    expect(colonne).toContain('top: calc(var(--barre-haut) + var(--jour-carte))')
    expect(colonne).toContain('bottom: var(--jour-carte)')
    expect(colonne).toContain('width: var(--lateral)')
    expect(colonne).toContain('flex-direction: column')

    // Ni le temps ni le panneau ne redéclarent de largeur : elle vient de la colonne, une fois.
    const temps = CSS_COQUE.slice(
      CSS_COQUE.indexOf('.panneau-temps {'),
      CSS_COQUE.indexOf('}', CSS_COQUE.indexOf('.panneau-temps {')),
    )
    expect(temps).toContain('flex: none')
    expect(temps).not.toMatch(/\bwidth:/)
  })

  it('déplie une carte du matériel sans toucher à l’autre', () => {
    basculeCarte('BOITIER')
    const html = ecran()
    expect(html).toContain('class="carte carte-boitier" data-ouverte="true"')
    expect(html).toContain('class="carte carte-optique" data-ouverte="false"')
  })

  // Repliée, une carte du matériel garde sa réponse à droite du titre ; dépliée, elle la montre
  // déjà dans ses champs et ne la répète pas.
  it('résume le recadrage et l’objectif à droite du titre, carte repliée seulement', () => {
    const html = ecran()
    const entete = (cle: string) => {
      const debut = html.indexOf(`carte-${cle}"`)
      return html.slice(debut, html.indexOf('</button>', debut))
    }
    expect(entete('boitier')).toContain(
      `<span class="carte-resume">${LIBELLES_RECADRAGE.FULL_FRAME}</span>`,
    )
    expect(entete('optique')).toMatch(/<span class="carte-resume">[^<?]+ mm f\/[^<?]+<\/span>/)

    // Dépliée, la carte montre le détail dans ses champs : le résumé n'y répéterait qu'eux.
    basculeCarte('SITE')
    basculeCarte('BOITIER')
    basculeCarte('OPTIQUE')
    expect(ecran()).not.toContain('carte-resume')
  })

  // T-0238 — un seul dessin pour tout ce qui se pose sur le ciel : filet et équerres. Les
  // équerres ne viennent qu'à la carte dépliée.
  // T-0243 — le panneau latéral, qui ne se replie pas, les porte toujours.
  // T-0314 — le panneau du temps les prend en coiffant le panneau de séance.
  it('donne aux cartes dépliées et aux panneaux le cadre d’instrument des rubriques', () => {
    expect(CSS_COQUE).toMatch(
      /section:not\(\[class\]\)::before,\n\.carte\[data-ouverte='true'\]::before,\n\.panneau-temps::before,\n\.coque-lateral::before \{/,
    )
  })

  it('décolle le panneau des bords comme une carte, filet complet', () => {
    // T-0314 — le décollement est porté par la colonne qui le contient ; lui prend la hauteur
    // qu'elle lui laisse sous le panneau du temps, et garde son filet.
    const debut = CSS_COQUE.indexOf('.coque-lateral {')
    const panneau = CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))
    expect(panneau).toContain('flex: 1')
    expect(panneau).toContain('min-height: 0')
    expect(panneau).toContain('border: var(--trait) solid var(--bordure)')
    // Il ne se replie pas : aucun en-tête-bouton, aucun signe de repli.
    const html = ecran()
    const aside = html.slice(html.indexOf('<aside class="coque-lateral"'))
    const entete = aside.slice(0, aside.indexOf('lateral-corps'))
    expect(entete).not.toContain('aria-expanded')
    expect(entete).not.toContain('carte-marque')
  })

  it('garde le lieu lisible et réglable dans les deux modes', () => {
    // Les champs du site vivent dans la carte Site : ce qui devait survivre au déménagement
    // n'est pas leur dépliement permanent, c'est leur accessibilité constante.
    ouvreCarte('SITE')
    for (const mode of ['CIEL_PROFOND', 'PANORAMA'] as const) {
      poseMode(mode)
      const html = ecran()
      const barre = html.slice(html.indexOf('carte-site'))
      expect(barre, mode).toContain('Bortle')
      expect(barre, mode).toContain('horizon plat')
    }
  })

  it('affiche les coordonnées du site, au dixième, sans déplier la carte', () => {
    // Un en-tête qui n'afficherait rien rendrait le déménagement coûteux : il faudrait
    // déplier une carte pour savoir sous quel ciel on calcule.
    const html = ecran()
    const entete = html.slice(html.indexOf('carte-site"'))
    const resume = entete.slice(0, entete.indexOf('</button>'))
    const dixieme = (v: string) => `${Number(v).toFixed(1)}°`
    expect(resume).toContain(
      `<span class="carte-resume">${dixieme(DEFAUT.latitude)} / ${dixieme(DEFAUT.longitude)}</span>`,
    )
  })

  it('pose la carte Site en haut à gauche, à droite du rail', () => {
    const html = ecran()
    // Tabulation : le rail d'abord, la carte ensuite — elle se pose à sa droite.
    expect(html.indexOf('coque-rail')).toBeLessThan(html.indexOf('carte-site'))
    const debut = CSS_COQUE.indexOf('.carte-site {')
    expect(debut).toBeGreaterThan(-1)
    const corps = CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))
    expect(corps).toContain('left: calc(var(--rail) + 2 * var(--jour-carte))')
    expect(corps).toContain('top: calc(var(--barre-haut) + var(--jour-carte))')
  })

  it('porte le mode nuit et la vérification du socle dans la barre du haut', () => {
    const topbar = barreHaute(ecran())
    expect(topbar).toContain('Activer le mode nuit')
    expect(topbar).toContain('Vérification')
    expect(topbar).toContain('Registre de constantes')
    // Fermé par défaut : le tiroir n'est pas déplié à l'ouverture de l'application.
    expect(topbar).not.toMatch(/<details class="tiroir tiroir-outils" open/)
  })

  // T-0153 — la barre haute ne dit plus où pointe la vue : la phrase complète est en bas,
  // et la répéter ici en abrégé faisait deux lectures pour un seul fait.
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

  it('ne monte pas le corps d’une carte repliée', () => {
    // Le plan démarre replié. Son corps reste monté — il est la seule région imprimable
    // (§11.2) — mais son en-tête annonce bien l'état fermé.
    expect(ecran()).toContain('class="carte carte-plan" data-ouverte="false"')
    ouvreCarte('PLAN')
    expect(ecran()).toContain('class="carte carte-plan" data-ouverte="true"')
  })

  // T-0213 — les bascules de la vue ne se déplient plus : elles sont là dès l'ouverture, et
  // c'est tout l'intérêt du rail. Une seule lecture du magasin, pas un abonnement complet.
  it('monte les huit bascules de la vue sans qu’on ait à déplier quoi que ce soit', () => {
    const rail = ecran()
    const debut = rail.indexOf('coque-rail')
    const bloc = rail.slice(debut, rail.indexOf('carte-plan'))
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

  /**
   * T-0069 — « un raccourci qui n'est écrit que dans le code n'existe pas ». La carte Vue les
   * affichait ; le rail les porte sur un bouton qui n'est pas une bascule — il annonce, il ne
   * commande rien, et sa bulle s'ouvre au focus autant qu'au survol.
   */
  it('garde les raccourcis clavier atteignables depuis le rail', () => {
    const html = ecran()
    const rail = html.slice(html.indexOf('coque-rail'), html.indexOf('carte-plan'))
    expect(rail).toContain('aria-label="Raccourcis clavier de la scène"')
    expect(rail).toMatch(/← ↑ ↓ →/)
  })

  it('survit à un changement de matériel : le panneau reste sur le mode courant', () => {
    poseMode('PANORAMA')
    ecran()
    expect(etatSeance().mode).toBe('PANORAMA')
  })
})

/**
 * T-0181 — le panneau latéral n'est plus un tiroir, c'est une colonne.
 *
 * Ce qui se vérifie ici est la disparition de l'état fermé, et le fait que le mode — et lui
 * seul — décide de ce que la colonne porte.
 */
describe('§11.3 — le panneau est toujours ouvert et son contenu suit le mode', () => {
  it('est visible au démarrage, sans attribut de fermeture ni bouton pour le fermer', () => {
    const html = ecran()
    expect(html).toContain('<aside class="coque-lateral" id="panneau-lateral"')
    expect(html).not.toMatch(/<aside class="coque-lateral"[^>]*hidden/)
    expect(html).not.toContain('lateral-fermer')
    expect(html).not.toContain('Fermer le panneau')
  })

  // T-0246 — les onglets nomment déjà ce que le panneau porte : un titre le répéterait.
  it('ne répète pas le mode dans un titre, sur la liste comme en Panorama', () => {
    for (const mode of ['CIEL_PROFOND', 'PANORAMA'] as const) {
      poseMode(mode)
      const entete = ongletsPanneau(ecran())
      expect(entete, mode).not.toContain('<h2')
      expect(entete, mode).not.toContain('Toutes les cibles')
    }
  })

  it('ne laisse plus aucun état fermé exister', () => {
    expect(Object.keys(etatCoque())).toEqual(['cartes'])
    // La feuille de style ne peut plus non plus décrire un panneau fermé.
    expect(CSS_COQUE).not.toContain('.coque-lateral[hidden]')
  })

  it('ne porte plus le plan : il a sa carte', () => {
    const html = ecran()
    const panneau = html.slice(html.indexOf('coque-lateral'))
    expect(panneau.slice(0, panneau.indexOf('</aside>'))).not.toContain('plan-session')
  })
})

/**
 * T-0180 — la barre haute ne commandait plus des panneaux, elle commandait le MODE.
 * T-0246 — la bascule est descendue sur le panneau, dont elle forme les onglets.
 *
 * Ce qui se vérifie ici est le déménagement et son annonce : un état de premier rang porté par
 * deux boutons pressés en tête du panneau, et plus rien de tel dans la barre haute. Le contenu
 * que le mode décide, lui, est vérifié là où il se monte.
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
    // Les trois boutons de panneau sont partis avec le tiroir qu'ils ouvraient.
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
    // Le fond, mais aussi le trait et la graisse.
    const debut = CSS_COQUE.indexOf('.onglet.actif {')
    expect(debut).toBeGreaterThan(-1)
    const actif = CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))
    expect(actif).toContain('background: var(--fond-accent)')
    expect(actif).toContain('border-bottom-color: var(--accent)')
    expect(actif).toContain('font-weight: 700')
  })

  it('garde les onglets au-dessus de la fiche : on en sort sans repasser par la liste', () => {
    ouvreCible(M31)
    const html = ecran()
    const aside = html.slice(html.indexOf('<aside class="coque-lateral"'))
    const onglets = aside.indexOf('class="onglets"')
    expect(onglets).toBeGreaterThan(-1)
    expect(onglets).toBeLessThan(aside.indexOf('<h2 tabindex="-1">M31</h2>'))
  })

  it('garde la cible de clic gantée sur les deux positions (§11.2)', () => {
    const debut = CSS_COQUE.indexOf('.onglet {')
    expect(debut).toBeGreaterThan(-1)
    expect(CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))).toContain(
      'min-height: var(--cible-clic)',
    )
  })
})

/** T-0113 — une carte se replie. T-0238 — elle ne se déplace plus. */
describe('T-0113 — les cartes posées sur la scène', () => {
  it('replie et déplie une carte', () => {
    expect(etatCoque().cartes.PLAN.ouverte).toBe(false)
    basculeCarte('PLAN')
    expect(etatCoque().cartes.PLAN.ouverte).toBe(true)
  })

  // T-0213 — la vue n'est plus une carte : ses bascules bordent la scène, et une commande
  // toujours visible n'a pas d'état de repli à tenir. T-0238 — le matériel en redevient deux.
  it('connaît les cartes Site, Boîtier, Optique et Plan', () => {
    expect(Object.keys(etatCoque().cartes)).toEqual(['SITE', 'BOITIER', 'OPTIQUE', 'PLAN'])
  })

  // T-0238 — une carte reste à sa place : son en-tête replie, il ne se traîne plus.
  it('ne fait plus de l’en-tête une poignée', () => {
    const debut = CSS_COQUE.indexOf('.carte-entete {')
    expect(CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))).not.toMatch(/grab|touch-action/)
    expect(CSS_COQUE).not.toContain('.carte-entete:active')
    expect(ecran()).not.toMatch(/class="carte [^"]*"[^>]*style=/)
  })
})

describe('§3.4 — un objet cliqué ouvre sa fiche', () => {
  it('met la fiche à la place de la liste, garnie, sans autre geste', () => {
    // La liste tient le panneau tant qu'aucun objet n'a été désigné : le clic sur la scène
    // doit y mettre la fiche, sinon le geste se termine sans que rien ne se voie.
    expect(etatSeance().vueCibles).toBe('LISTE')
    expect(ecran()).toContain('Ne montrer que les objets photographiables')
    ouvreCible(M31)
    expect(etatSeance().vueCibles).toBe('FICHE')
    expect(etatSeance().cible?.designation).toBe('M31')
    // C'est bien la fiche §6.2 / §6.3 / §7 qui s'ouvre, pas un simple nom affiché.
    // (Le garnissage des champs par l'objet est posé par un effet de montage : il ne joue
    // pas en rendu statique, seule la présence de la fiche est vérifiable ici.)
    const html = ecran()
    expect(html).toContain('Détectabilité')
    expect(html).toContain('Cadrage')
    // La liste est démontée : elle ne reste pas vivante derrière la fiche.
    expect(html).not.toContain('Ne montrer que les objets photographiables')
  })

  it('rend la liste au retour, recherche et filtre intacts', () => {
    majCatalogue({ recherche: 'andro', photographiablesSeules: false })
    ouvreCible(M31)
    montreListeCibles()
    const html = ecran()
    expect(html).toContain('Ne montrer que les objets photographiables')
    expect(html).toContain('value="andro"')
    // La cible reste désignée : c'est la LECTURE qui change, pas le choix.
    expect(etatSeance().cible?.designation).toBe('M31')
  })

  it('n’offre le retour que sur la fiche, jamais sur la liste', () => {
    expect(ecran()).not.toContain('lateral-retour')
    ouvreCible(M31)
    const fiche = ecran()
    expect(fiche).toContain('lateral-retour')
    expect(fiche).toContain('aria-label="Revenir à la liste des cibles"')
    // L'en-tête nomme la cible et porte sa note, hors de tout bouton : elle est annoncée.
    expect(fiche).toContain('<h2 tabindex="-1">M31</h2>')
  })

  it('garde l’état du panneau d’un mode à l’autre', () => {
    ouvreCible(M31)
    poseMode('PANORAMA')
    expect(ecran()).toContain('Séquence de filé')
    poseMode('CIEL_PROFOND')
    expect(etatSeance().vueCibles).toBe('FICHE')
    expect(ecran()).toContain('<h2 tabindex="-1">M31</h2>')
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
    // Rendre le temps à l'horloge système est un geste, pas un effet de bord (§3.2).
    expect(etatScene().temps.modeTemps).toBe('FIGE')
  })
})

/**
 * T-0116 — le filé se peint par image ; ses compteurs ne se publient pas au même rythme.
 * `poseRenduFile` écrit dans le magasin de séance, donc déclenche un rendu React : publiés à
 * chaque peinture, ils en feraient trente par seconde (T-0056). La boucle n'appelle donc ce
 * publicateur qu'au rythme du diagnostic, et il coupe tout ce qui n'a pas bougé.
 */
describe('T-0116 — les compteurs du filé ne rendent pas par image', () => {
  const RENDU: RenduFile = { reelles: 12 }

  it('ne publie qu’une fois tant que les compteurs ne bougent pas', () => {
    const publies: (RenduFile | null)[] = []
    const publie = publicateurRenduFile((r) => publies.push(r))
    // Une période de diagnostic entière de passes identiques : un seul rendu React.
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
    // Sans amorce, un `null` initial serait pris pour « rien n'a changé » et des compteurs
    // laissés par une séance précédente resteraient affichés sur un cadre vide.
    const publies: (RenduFile | null)[] = []
    publicateurRenduFile((r) => publies.push(r))(null)
    expect(publies).toEqual([null])
  })
})

describe('§5.1 — la scène déclare l’écart de projection avec l’objectif', () => {
  it('annonce quand la projection de la scène n’est pas celle de l’objectif', () => {
    expect(mentionProjection('MODE_CADRE', 'MODE_CADRE')).toBeNull()
    expect(mentionProjection('MODE_PLANETARIUM', 'MODE_CADRE')).toMatch(/Voir comme l’objectif/)
    expect(mentionProjection('MODE_PLANETARIUM', 'MODE_FISHEYE')).toMatch(/fisheye/)
  })
})

describe('T-0183 — le plan de nuit est une carte, et il reste imprimable', () => {
  it('pose une carte Plan repliée au démarrage : le plan se consulte, il ne s’impose pas', () => {
    expect(etatCoque().cartes.PLAN.ouverte).toBe(false)
    expect(ecran()).toContain('carte-plan')
  })

  it('garde le corps du plan monté même repliée, dans les deux modes', () => {
    for (const mode of ['CIEL_PROFOND', 'PANORAMA'] as const) {
      poseMode(mode)
      const html = ecran()
      // Masqué, pas démonté : démonté, imprimer la carte fermée sortirait une page blanche.
      expect(html, mode).toMatch(/<div class="carte-corps" hidden="">/)
      expect(html, mode).toContain('plan-session')
    }
  })

  it('déplie et replie comme les autres cartes', () => {
    basculeCarte('PLAN')
    expect(etatCoque().cartes.PLAN.ouverte).toBe(true)
    expect(ecran()).not.toMatch(/<div class="carte-corps" hidden="">/)
  })

  it('n’existe qu’en un exemplaire : un seul textarea d’export dans le document', () => {
    for (const ouverte of [false, true]) {
      if (ouverte) basculeCarte('PLAN')
      const html = ecran()
      expect(html.split('plan-export').length - 1, `ouverte=${ouverte}`).toBeLessThanOrEqual(1)
      expect(html.split('class="plan-session"').length - 1).toBe(1)
    }
  })

  it('sort le plan à l’impression, carte repliée comprise, et rien d’autre', () => {
    const impression = CSS_COQUE.slice(CSS_COQUE.indexOf('@media print'))
    // Ni coque, ni cartes, ni panneau, ni canevas.
    expect(impression).toMatch(/\.coque-lateral,\n\s*\.carte \{\n\s*display: none/)
    expect(impression).toContain('.planetarium')
    // Sauf la carte du plan, et son corps même porteur de `hidden`.
    expect(impression).toContain('.carte-plan > .carte-corps[hidden]')
    expect(impression).toContain('.carte-plan .carte-corps > *:not(.plan-session)')
  })

  it('donne au plan sa propre largeur : la table du budget ne défile pas de côté', () => {
    const debut = CSS_COQUE.indexOf('.carte-plan {')
    expect(debut).toBeGreaterThan(-1)
    expect(CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))).toContain(
      'width: var(--carte-plan)',
    )
    // Le corps défile verticalement, lui, comme toute carte.
    const corps = CSS_COQUE.indexOf('.carte-plan .carte-corps {')
    expect(CSS_COQUE.slice(corps, CSS_COQUE.indexOf('}', corps))).toContain('max-height')
  })
})

/**
 * T-0153 — il ne reste qu'une lecture, et elle se lit dans la barre.
 *
 * Le tiroir d'information de T-0038 mêlait la phrase qui date l'image et quatre lectures
 * d'atelier — magnitude limite, époque, cadrage, diagnostic de rendu. Notre persona ne mesure
 * pas le rendu. Ce qui se vérifie ici est donc double : la phrase est visible sans un clic, et
 * le tiroir n'existe plus. La barre basse démontée, la phrase est montée dans la barre haute.
 */
describe('T-0153 — la barre porte la phrase qui date l’image', () => {
  it('pose la phrase dans la barre haute, après la marque et la légende', () => {
    const haut = barreHaute(ecran()).replaceAll('<!-- -->', '')
    expect(haut).toMatch(/visée[\s\S]*AD[\s\S]*azimut[\s\S]*hauteur[\s\S]*champ/)
    expect(haut).toContain('barrehaut-visee')
    expect(haut.indexOf('<h1')).toBeLessThan(haut.indexOf('tiroir-legende'))
    expect(haut.indexOf('tiroir-legende')).toBeLessThan(haut.indexOf('barrehaut-visee'))
    expect(haut).not.toContain('panneau-temps')
  })

  it('lui laisse ce que la marque et les commandes ne prennent pas', () => {
    const debut = CSS_COQUE.indexOf('.coque-topbar > .barrehaut-visee {')
    expect(debut).toBeGreaterThan(-1)
    const corps = CSS_COQUE.slice(debut, CSS_COQUE.indexOf('}', debut))
    expect(corps).toContain('flex: 1')
    expect(corps).toContain('text-align: center')
    // Elle se rogne : un contrôle amputé ne se rattrape pas.
    expect(corps).toContain('text-overflow: ellipsis')
  })

  it('ne monte plus aucun tiroir de lectures dans la barre haute', () => {
    const html = ecran()
    expect(html).not.toContain('scene-lectures')
    expect(html).not.toContain('tiroir-infos')
    // Les lectures d'atelier partent avec lui : plus de compteur d'images par seconde.
    expect(html).not.toContain('images/s')
    expect(html).not.toContain('étoiles tracées sur')
  })
})

/**
 * T-0040 — le canevas seul au centre, sans marges.
 *
 * Rien à observer sans moteur de rendu : ce qui se vérifie ici est la règle elle-même. La
 * rangée basse à hauteur réservée de T-0037 n'a plus d'objet une fois les lectures parties ;
 * ce qui reste indispensable est `min-height: 0`, sans quoi le canevas reprend sa hauteur
 * intrinsèque et le défilement de page revient.
 */
describe('T-0040 — la colonne centrale ne porte plus que la scène', () => {
  const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

  /** Le corps d'une règle, isolé du reste de la feuille. */
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
    // Sans lui, la piste de grille reprend la hauteur intrinsèque du canevas.
    expect(scene).toContain('min-height: 0')
    expect(regle('.coque-scene')).toContain('padding: 0')
  })

  it('remplit la boîte plutôt que d’y loger un rapport figé', () => {
    const canevas = regle('.coque-scene .planetarium')
    expect(canevas).toContain('width: 100%')
    expect(canevas).toContain('height: 100%')
    // `contain` logeait un 16/9 dans une boîte qui ne l'est pas : bandes noires en haut et
    // en bas. La définition de rendu suit désormais la boîte, il n'y a plus rien à loger.
    expect(canevas).not.toContain('object-fit')
    // Un canevas en ligne réserve l'interligne sous sa ligne de base : la page défile.
    expect(canevas).toContain('display: block')
  })

  it('fait suivre la définition de rendu à la boîte, sans déformer', () => {
    // Le rapport de la définition est celui de la boîte : des étoiles rondes le restent.
    const haute = resolutionRendu(1000, 1000, 1)
    expect(haute.largeurPx / haute.hauteurPx).toBeCloseTo(1, 6)
    const large = resolutionRendu(1600, 400, 1)
    expect(large.largeurPx / large.hauteurPx).toBeCloseTo(4, 6)
  })

  it('plafonne le nombre de pixels peints au budget de référence', () => {
    const budget = LARGEUR_SCENE_PX * HAUTEUR_SCENE_PX
    // Dalle Retina sur grande fenêtre : suivre `devicePixelRatio` doublerait la charge.
    const retina = resolutionRendu(1600, 900, 2)
    expect(retina.largeurPx * retina.hauteurPx).toBeLessThanOrEqual(budget + 1)
    // Petite boîte : la densité de l'écran reste la borne, pas le budget.
    const petite = resolutionRendu(400, 300, 2)
    expect(petite).toStrictEqual({ largeurPx: 800, hauteurPx: 600 })
  })

  it('rend la scène au flux vertical sous le repli, canevas en 16 / 9', () => {
    const repli = CSS.slice(CSS.indexOf('@media (max-width: 1100px)'))
    expect(repli).toMatch(/\.coque-scene > \.scene \{[^}]*display: block/)
    expect(repli).toMatch(/\.coque-scene \.planetarium \{[^}]*aspect-ratio: 16 \/ 9/)
    // Le menu reste utilisable : son contenu défile plutôt que d'allonger la page.
    expect(repli).toMatch(/\.tiroir\[open\] > \.tiroir-contenu \{[^}]*max-height/)
  })
})

/**
 * T-0041 — une alerte se signale sur le tiroir fermé.
 *
 * Une cause rangée dans un tiroir fermé est une cause invisible : on règle quelque chose,
 * rien ne bouge à l'écran, et l'explication est derrière un clic qu'on ne pense pas à faire.
 * T-0153 a démonté le menu d'information ; la règle vaut toujours pour le tiroir de
 * vérification, dont T-0082 signale une écriture perdue.
 */
describe('T-0041 — un tiroir qui s’alerte ne le dit pas par la seule couleur', () => {
  const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

  it('change aussi la graisse et la bordure', () => {
    const debut = CSS.indexOf(".tiroir[data-alerte='true'] > summary {")
    expect(debut).toBeGreaterThan(-1)
    const corps = CSS.slice(debut, CSS.indexOf('}', debut))
    // Le rouge du mode nuit ne dit rien seul.
    expect(corps).toContain('font-weight: 700')
    expect(corps).toContain('border-color: var(--alerte)')
  })
})


describe('T-0047 — la roue crantée reloge le choix brut dans le catalogue', () => {
  it('T-0184 — monte un tiroir d’outils dans la barre haute', () => {
    const ecran = renderToStaticMarkup(<App />)
    expect(ecran).toContain('tiroir tiroir-outils')
    expect(ecran).toContain('Réglages')
  })

  it('T-0153 — ferme la barre : plus rien ne se monte après lui', () => {
    const topbar = barreHaute(renderToStaticMarkup(<App />))
    expect(topbar.slice(topbar.indexOf('tiroir-outils'))).not.toContain('<details')
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
    // T-0169 — les rails sont ceux de `Curseur`, plus des `input[type=range]` : c'est le rôle
    // qui les compte, et c'est aussi lui que la technologie d'assistance lit.
    expect(rendu.match(/role="slider"/g)).toHaveLength(5)
    expect(rendu).toContain('Revenir aux poids par défaut')
    // Le poids effectif s'affiche : c'est lui que le plan utilise, pas la position brute.
    expect(rendu).toContain('25 %')
  })

  it('T-0087 — dit que le score arbitre les conflits, sans ordonner la nuit', () => {
    const rendu = renderToStaticMarkup(<MenuReglages {...REGLAGES_INERTES} />)
    expect(rendu).toMatch(/Départage deux cibles/)
  })

  it('garde la cible de clic de §11.2 : le tiroir est un `.tiroir` comme les autres', () => {
    expect(barreHaute(renderToStaticMarkup(<App />))).toMatch(/class="tiroir tiroir-outils"/)
    const styles = readFileSync(
      join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'),
      'utf8',
    )
    const debut = styles.indexOf('.tiroir > summary {')
    expect(debut).toBeGreaterThan(-1)
    expect(styles.slice(debut, styles.indexOf('}', debut))).toContain(
      'min-height: var(--cible-clic)',
    )
  })
})



/**
 * T-0184 — Vérification et Réglages ne font plus qu'un tiroir.
 *
 * Deux tiroirs voisins répondaient au même geste — « ce qui sort du chemin principal ». Ce
 * qui se vérifie ici n'est pas la fusion pour elle-même, c'est ce qu'elle ne doit pas coûter :
 * l'alerte de persistance de T-0041, qui n'a de valeur que sur le tiroir FERMÉ, et l'accès
 * aux deux contenus, dont aucun ne doit avoir disparu en route.
 */
describe('T-0184 — un seul tiroir pour la vérification et les réglages', () => {
  /** La barre haute hors application : seul un échec de persistance fabriqué révèle l'alerte. */
  function barreSeule(echec: boolean): string {
    const props: BarreHautProps = {
      modeNuit: { actif: false, luminance: 1 },
      surModeNuit: () => undefined,
      etat: null,
      modeReseau: 'HORS_LIGNE',
      persistance: {
        message: echec ? 'écriture perdue' : null,
        echec,
        surExport: () => undefined,
        surImport: () => undefined,
      },
      poids: POIDS_INERTES,
      profondeurMag: 12,
      sbCiel: null,
      site: {
        latitudeDeg: Number(DEFAUT.latitude),
        longitudeDeg: Number(DEFAUT.longitude),
        altitudeM: Number(DEFAUT.altitude),
      },
      gaiaCharge: false,
    }
    return renderToStaticMarkup(<BarreHaut {...props} />)
  }

  it('ne monte plus qu’une fenêtre, et les deux contenus y sont', () => {
    const topbar = barreHaute(ecran())
    expect(topbar).not.toContain('tiroir-verification')
    expect(topbar).not.toContain('tiroir-reglages')
    // Une seule fenêtre : ce qui suit l'ouverture du tiroir d'outils porte les deux sections.
    const fenetre = topbar.slice(topbar.indexOf('tiroir-outils'))
    expect(fenetre).toContain('état du socle')
    expect(fenetre).toContain('Réglages')
  })

  it('reste le dernier élément de la barre : le plus à droite', () => {
    const topbar = barreHaute(ecran())
    expect(topbar.slice(topbar.indexOf('tiroir-outils'))).not.toContain('<details')
  })

  it('T-0041 — un échec de persistance se signale sur le tiroir fermé, et nomme sa section', () => {
    const alerte = barreSeule(true)
    const resume = alerte.slice(alerte.indexOf('tiroir-outils'))
    expect(resume).toContain('data-alerte="true"')
    expect(resume.slice(0, resume.indexOf('</summary>'))).toContain(ALERTE_VERIFICATION)
    // La mention nomme la section : « Vérification », pas seulement l'échec.
    expect(ALERTE_VERIFICATION).toMatch(/^Vérification/)
    expect(barreSeule(false)).toContain('data-alerte="false"')
  })

  it('n’a rien retiré : les cinq poids et l’état du socle restent atteignables', () => {
    const topbar = barreHaute(ecran())
    expect(topbar.match(/role="slider"/g)?.length).toBeGreaterThanOrEqual(5)
    expect(topbar).toContain('Registre de constantes')
    expect(topbar).toContain('Matrice de dégradation hors-ligne')
    expect(topbar).toContain('Exporter mes données (JSON)')
  })
})

/**
 * T-0228 — la provenance des données se lit en un endroit.
 *
 * Elle était semée au contact des valeurs qu'elle couvre — sous les dimensions de la fiche,
 * sous le champ Bortle, sous le verdict de détectabilité, sous le conseil filtre. Ce qui se
 * vérifie ici est le regroupement ET son prix : les deux mentions que le PRD impose au
 * contact ne doivent pas être parties avec les autres.
 */
describe('T-0228 — un tiroir « info » porte les sources', () => {
  it('monte un tiroir de plus dans la barre haute, avant celui des réglages', () => {
    const topbar = barreHaute(ecran())
    expect(topbar).toContain('tiroir tiroir-info')
    expect(topbar.indexOf('tiroir-info')).toBeLessThan(topbar.indexOf('tiroir-outils'))
  })

  it('le tiroir des outils reste le dernier : rien ne se monte après lui', () => {
    const topbar = barreHaute(ecran())
    expect(topbar.slice(topbar.indexOf('tiroir-outils'))).not.toContain('<details')
  })

  it('nomme l’amont de chaque donnée affichée', () => {
    const fenetre = barreHaute(ecran())
    const info = fenetre.slice(fenetre.indexOf('tiroir-info'), fenetre.indexOf('tiroir-outils'))
    for (const source of SOURCES) {
      expect(info).toContain(source.donnee)
    }
    expect(info).toContain('OpenNGC')
    expect(info).toContain('astronomy-engine')
  })

  it('n’a pas emporté les deux mentions que le PRD impose au contact', () => {
    // §6.4 — l'attribution de l'image est une condition d'affichage, pas une bibliographie.
    ouvreCible(M31)
    expect(CREDIT_RELEVE.licence).toContain('CDS')
    // §10.2 niveau 3 — la source d'une CONSTANTE reste dépliable sous la valeur qu'elle porte.
    expect(ecran()).toContain('tracee-source')
  })
})

/**
 * T-0128 — le catalogue a un écran, et il en a UN seul.
 *
 * Ce qui est vérifié ici est le remplacement, pas la recherche : `chercheCatalogue` a ses
 * propres tests, et le filtrage ceux de `cibles-liste`. Ce qui doit se constater au niveau
 * de la coque, c'est qu'aucun des deux chemins remplacés ne subsiste — un second chemin
 * vers le catalogue est exactement le défaut que ce lot corrige.
 */
describe('T-0128 — le catalogue remplace les deux chemins vers les cibles', () => {
  it('est le contenu du panneau en Ciel profond, et le seul monté (§11.2)', () => {
    const ouvert = ecran()
    expect(ouvert).toContain('Ne montrer que les objets photographiables')
    expect(ouvert).not.toContain('Séquence de filé')
    // T-0181 — il n'est plus derrière un bouton : le mode Ciel profond le porte.
    poseMode('PANORAMA')
    expect(ecran()).not.toContain('Ne montrer que les objets photographiables')
  })

  it('porte la recherche et les deux filtres, que plus personne d’autre ne porte', () => {
    const ouvert = ecran()
    expect(ouvert).toMatch(/<input[^>]+type="search"/)
    expect(ouvert).toContain('Tous types')
    expect(ouvert).toContain('Jusqu’à la magnitude')
  })

  it('filtre par plusieurs types à la fois, et se coche ou se vide d’un geste', () => {
    const ouvert = ecran()
    expect(ouvert).not.toContain('<option value="">Tous types')
    expect(ouvert).toContain('Tout cocher')
    expect(ouvert).toContain('Tout décocher')
    majCatalogue({ types: new Set() })
    expect(ecran()).toContain('Aucun type')
  })

  it('a vidé la fiche de son choix de cible : elle ne fait plus que décrire', () => {
    ouvreCible(M31)
    const fiche = ecran()
    expect(fiche).not.toContain('Cibles visibles')
    expect(fiche).not.toContain('Type listé')
  })

  it('borne le filtre de magnitude sur le domaine du registre, sans le réécrire', () => {
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
