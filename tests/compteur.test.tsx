/**
 * T-0162 / T-0163 — les compteurs de la barre basse : un nombre se règle en le tirant.
 *
 * Ce qui se vérifie ici n'est pas un pixel de curseur mais trois promesses chiffrables : la
 * loi du glisser (impaire, accélérée, muette sous le premier cran), l'arithmétique des dates
 * quand un mois n'a pas le jour visé, et la RÉCIPROQUE de la visée — repointer la vue sur une
 * direction J2000 puis la relire doit rendre cette direction. Cette dernière est la seule qui
 * touche au ciel, et elle se teste par aller-retour : aucune coordonnée n'est recopiée, la
 * matrice est calculée à l'exécution pour le site et l'instant de l'Annexe A.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import type { Site } from '../src/core/ephem.ts'
import { cielInstantane } from '../src/core/horloges.ts'
import { cransGlisse } from '../src/ui/compteur-glisse.ts'
import { dateAvec, partiesHeure, partiesJour } from '../src/ui/horaire.ts'
import { HAUTEUR_MAX_DEG, HAUTEUR_MIN_DEG, tourBorne } from '../src/ui/planetarium-gestes.ts'
import { etatScene, majVue, reinitialiseScene } from '../src/ui/scene-etat.ts'
import { ligneVisee, segmentsVisee, viseeJ2000, viseeVersVue } from '../src/ui/scene-lecture.ts'
import { reinitialiseSeance } from '../src/ui/seance-etat.ts'
import { reinitialiseCoque } from '../src/ui/coque-etat.ts'

/** Annexe A : Bordeaux, 45° N. */
const SITE: Site = { latitudeDeg: 44.84, longitudeDeg: -0.58, altitudeM: 20 }
const INSTANT = new Date('2026-08-18T22:00:00Z')
const MATRICE = cielInstantane(SITE, INSTANT).matrice

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

function ecran(): string {
  return renderToStaticMarkup(<App />)
}

/** Le fragment d'un compteur, de son ouverture à sa fermeture — de quoi lire ce qu'il annonce. */
function compteur(html: string, libelle: string): string {
  const ancre = html.indexOf(`aria-label="${libelle}"`)
  expect(ancre, libelle).toBeGreaterThan(-1)
  return html.slice(html.lastIndexOf('<span', ancre), html.indexOf('</span>', ancre))
}

afterEach(() => {
  reinitialiseSeance()
  reinitialiseScene()
  reinitialiseCoque()
})

describe('T-0162 — la loi du glisser latéral', () => {
  it('ne compte rien tant que le premier cran n’est pas franchi', () => {
    // C'est ce silence qui laisse exister le clic : sans lui, aucun geste ne serait un clic.
    expect(cransGlisse(0)).toBe(0)
    expect(cransGlisse(1)).toBe(0)
    expect(cransGlisse(-1)).toBe(0)
  })

  it('ajoute vers la droite, retire vers la gauche, du même compte', () => {
    for (const dx of [8, 30, 120, 400]) {
      expect(cransGlisse(dx), `${dx} px`).toBeGreaterThan(0)
      expect(cransGlisse(-dx), `${-dx} px`).toBe(-cransGlisse(dx))
    }
  })

  it('accélère : deux fois plus loin fait PLUS de deux fois plus de crans', () => {
    // La différence avec un rail : un curseur `range` mappe une course finie sur une plage
    // finie, un compteur n'a pas de course — c'est l'éloignement qui la fournit.
    for (const dx of [12, 40, 100]) {
      expect(cransGlisse(2 * dx), `${dx} px`).toBeGreaterThan(2 * cransGlisse(dx))
    }
  })

  it('ne recule jamais quand le pointeur avance', () => {
    let precedent = 0
    for (let dx = 0; dx <= 300; dx += 3) {
      const crans = cransGlisse(dx)
      expect(crans, `${dx} px`).toBeGreaterThanOrEqual(precedent)
      precedent = crans
    }
  })

  it('annonce le geste au survol, avant tout clic', () => {
    // Rien ne distingue une valeur réglable d'une lecture sinon le curseur qui la survole.
    const debut = CSS.indexOf('.compteur {')
    expect(debut).toBeGreaterThan(-1)
    expect(CSS.slice(debut, CSS.indexOf('}', debut))).toContain('cursor: ew-resize')
  })
})

describe('T-0162 — un champ de l’instant réécrit', () => {
  const nuit = new Date(2026, 2, 31, 22, 41, 7)

  it('ramène le jour au dernier du mois visé plutôt que de déborder', () => {
    // 31 mars → février : le geste règle un MOIS. Sans le rabattement, `new Date` glisserait
    // au 3 mars et le compteur sauterait le mois qu'on visait.
    const fevrier = dateAvec(nuit, 'mois', 2)
    expect(fevrier.getMonth()).toBe(1)
    expect(fevrier.getDate()).toBe(new Date(2026, 2, 0).getDate())
    expect(fevrier.getHours()).toBe(nuit.getHours())
  })

  it('laisse déborder les heures : un instant qu’on promène change de jour', () => {
    const lendemain = dateAvec(nuit, 'heure', 25)
    expect(lendemain.getMonth()).toBe(nuit.getMonth() + 1)
    expect(lendemain.getDate()).toBe(1)
    expect(lendemain.getHours()).toBe(1)
  })

  it('laisse déborder les mois sur l’année suivante', () => {
    const janvier = dateAvec(new Date(2026, 2, 15, 22, 0, 0), 'mois', 13)
    expect(janvier.getFullYear()).toBe(2027)
    expect(janvier.getMonth()).toBe(0)
  })

  it('découpe l’instant sans en changer le format', () => {
    const recompose = (parties: readonly Intl.DateTimeFormatPart[]) =>
      parties.map((p) => p.value).join('')
    // T-0314 — jour de semaine et mois abrégé : le découpage suit la locale, il ne la réécrit
    // pas, et c'est justement ce que cette recomposition vérifie.
    expect(recompose(partiesJour(nuit))).toBe(nuit.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }))
    expect(recompose(partiesHeure(nuit))).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it('pose un compteur nommé et réglable au clavier sur chacun des six champs', () => {
    const html = ecran()
    for (const libelle of ['Jour', 'Mois', 'Année', 'Heure', 'Minute', 'Seconde']) {
      const balise = compteur(html, libelle)
      expect(balise, libelle).toContain('role="spinbutton"')
      expect(balise, libelle).toContain('tabindex="0"')
      expect(balise, libelle).toMatch(/aria-valuenow="-?\d+"/)
    }
  })
})

describe('T-0163 — la visée se règle par sa réciproque', () => {
  it('repointe la vue sur la direction J2000 qu’on lui redonne', () => {
    const vue = { ...etatScene().vue, azimutDeg: 123, hauteurDeg: 34 }
    const visee = viseeJ2000(vue, MATRICE)
    const retour = viseeVersVue(visee.longitudeDeg, visee.latitudeDeg, MATRICE)
    expect(retour.azimutDeg).toBeCloseTo(vue.azimutDeg, 6)
    expect(retour.hauteurDeg).toBeCloseTo(vue.hauteurDeg, 6)
  })

  it('rend la direction demandée quand on relit la visée après l’avoir posée', () => {
    // Le sens qui compte pour le geste : on tire l'AD, la scène se repointe, la lecture doit
    // afficher l'AD demandée — pas celle d'à côté.
    const demande = { longitudeDeg: 210.5, latitudeDeg: 53.25 }
    const pointage = viseeVersVue(demande.longitudeDeg, demande.latitudeDeg, MATRICE)
    const relu = viseeJ2000({ ...etatScene().vue, ...pointage }, MATRICE)
    expect(relu.longitudeDeg).toBeCloseTo(demande.longitudeDeg, 2)
    expect(relu.latitudeDeg).toBeCloseTo(demande.latitudeDeg, 2)
  })

  it('tient aux pôles, où l’azimut n’est plus qu’un roulis', () => {
    for (const hauteurDeg of [HAUTEUR_MIN_DEG, HAUTEUR_MAX_DEG]) {
      const visee = viseeJ2000({ ...etatScene().vue, hauteurDeg }, MATRICE)
      const retour = viseeVersVue(visee.longitudeDeg, visee.latitudeDeg, MATRICE)
      expect(retour.hauteurDeg, `${hauteurDeg}°`).toBeCloseTo(hauteurDeg, 6)
    }
  })

  it('referme l’azimut sur le tour plutôt que de l’arrêter au nord', () => {
    expect(tourBorne(-10)).toBeCloseTo(350, 9)
    expect(tourBorne(370)).toBeCloseTo(10, 9)
  })

  it('compose la phrase à partir des segments, sans la réécrire', () => {
    // T-0068 tient à ce que le nom accessible du canevas et la barre basse citent le MÊME
    // texte : la phrase reste la concaténation de ce que la barre affiche en compteurs.
    majVue({ azimutDeg: 42 })
    const vue = etatScene().vue
    const assemblee = segmentsVisee(vue, MATRICE).reduce((p, s) => p + s.avant + s.texte, '')
    const phrase = ligneVisee(vue, MATRICE, INSTANT)
    expect(phrase.startsWith(INSTANT.toLocaleString('fr-FR'))).toBe(true)
    expect(phrase.endsWith(assemblee)).toBe(true)
  })

  it('laisse l’instant au transport : la barre ne le date plus deux fois', () => {
    // Deux horloges côte à côte se contredisent à la seconde près, et celle de gauche n'était
    // pas réglable. La phrase commence donc à la visée.
    const bas = ecran()
    const debut = bas.indexOf('>', bas.indexOf('barrehaut-visee')) + 1
    const texte = bas
      .slice(debut, bas.indexOf('</p>', debut))
      .replaceAll('<!-- -->', '')
      .replace(/<[^>]*>/g, '')
    expect(texte.trimStart().startsWith('visée')).toBe(true)
    expect(texte).not.toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it('pose un compteur sur chacun des cinq nombres de la barre basse', () => {
    const bas = ecran()
    const bornes: Record<string, string | null> = {
      'Ascension droite visée': null,
      'Déclinaison visée': `aria-valuemin="${HAUTEUR_MIN_DEG}"`,
      Azimut: null,
      Hauteur: `aria-valuemax="${HAUTEUR_MAX_DEG}"`,
      'Champ de vision': 'aria-valuemin=',
    }
    for (const [libelle, borne] of Object.entries(bornes)) {
      const balise = compteur(bas, libelle)
      expect(balise, libelle).toContain('role="spinbutton"')
      if (borne === null) {
        // L'AD et l'azimut se referment sur eux-mêmes : les borner arrêterait le geste.
        expect(balise, libelle).not.toContain('aria-valuemin=')
      } else {
        expect(balise, libelle).toContain(borne)
      }
    }
  })
})
