/**
 * T-0162 / T-0163 — bottom-bar counters: number set by dragging. Three promises: drag law
 * (odd, accelerated, mute under first notch); date arithmetic when month lacks target day;
 * aim RECIPROCAL — re-aim view on a J2000 direction, re-read must return it. Only the
 * sky-touching one: round-trip, no copied coordinate, matrix computed at runtime for Annexe A
 * site/instant.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import type { Site } from '../src/core/ephem.ts'
import { cielInstantane } from '../src/core/horloges.ts'
import { cransGlisse, texteGlisse } from '../src/ui/compteur-glisse.ts'
import { DOMAINES } from '../src/registry/domains.ts'
import { nombre } from '../src/registry/ecriture.ts'
import { lisSaisie, nombreDuTexte } from '../src/ui/Compteur.tsx'
import {
  LARGEURS_INSTANT,
  dateAvec,
  dateHeure,
  partiesHeure,
  partiesJour,
} from '../src/ui/horaire.ts'
import { HAUTEUR_MAX_DEG, HAUTEUR_MIN_DEG } from '../src/ui/planetarium-gestes.ts'
import { TOUR_DEG, ramene } from '../src/core/unites.ts'
import { etatScene, majVue, reinitialiseScene } from '../src/ui/scene-etat.ts'
import {
  courtVisee,
  ligneVisee,
  segmentsVisee,
  viseeJ2000,
  viseeVersVue,
} from '../src/ui/scene-lecture.ts'
import { reinitialiseSeance } from '../src/ui/seance-etat.ts'

/** Annexe A: Bordeaux, 45° N. */
const SITE: Site = { latitudeDeg: 44.84, longitudeDeg: -0.58, altitudeM: 20 }
const INSTANT = new Date('2026-08-18T22:00:00Z')
const MATRICE = cielInstantane(SITE, INSTANT).matrice

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'styles.css'), 'utf8')

function ecran(): string {
  return renderToStaticMarkup(<App />)
}

/** Fragment of a counter, opening to closing: what it announces. */
function compteur(html: string, libelle: string): string {
  const ancre = html.indexOf(`aria-label="${libelle}"`)
  expect(ancre, libelle).toBeGreaterThan(-1)
  return html.slice(html.lastIndexOf('<span', ancre), html.indexOf('</span>', ancre))
}

afterEach(() => {
  reinitialiseSeance()
  reinitialiseScene()
})

describe('T-0327 — le compteur se tape aussi', () => {
  it('propose en saisie le nombre qu’on lit, unité retirée', () => {
    expect(nombreDuTexte('221.02°', 221.0234)).toBe('221.02')
    expect(nombreDuTexte('-13.57°', -13.5712)).toBe('-13.57')
    // Month spelled out has no number to read: type its rank.
    expect(nombreDuTexte('sept.', 9)).toBe('9')
  })

  it('lit la virgule française, et refuse ce qui n’est pas un nombre', () => {
    expect(lisSaisie('44,5')).toBe(44.5)
    expect(lisSaisie(' 390 ')).toBe(390)
    expect(lisSaisie('')).toBeNull()
    expect(lisSaisie('abc')).toBeNull()
  })
})

describe('T-0327 — un champ ne change pas de taille avec sa valeur', () => {
  it('donne au mois la largeur du plus long des douze', () => {
    const mois = Array.from({ length: 12 }, (_, m) =>
      partiesJour(new Date(2026, m, 1)).find((p) => p.type === 'month')!.value.length,
    )
    expect(LARGEURS_INSTANT.month).toBe(Math.max(...mois))
    expect(LARGEURS_INSTANT.hour).toBe(2)
    expect(LARGEURS_INSTANT.minute).toBe(2)
  })

  it('pose sur chaque champ de la visée la largeur de sa valeur extrême', () => {
    const html = ecran()
    for (const [libelle, extreme] of [
      ['Ascension droite visée', courtVisee('AD', 360)],
      ['Déclinaison visée', courtVisee('DEC', -90)],
      ['Azimut', courtVisee('AZIMUT', 360)],
      ['Hauteur', courtVisee('HAUTEUR', -90)],
    ] as const) {
      const debut = html.indexOf(`aria-label="${libelle}"`)
      const champ = html.slice(debut, html.indexOf('</span></span>', debut))
      expect(champ, libelle).toContain(`--compteur-largeur:${extreme.length}`)
    }
  })
})

describe('T-0162 — la loi du glisser latéral', () => {
  it('ne compte rien tant que le premier cran n’est pas franchi', () => {
    // Silence lets the click exist: without it no gesture is a click.
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
    // Unlike a rail (`range` maps finite travel), a counter has no travel: distance supplies it.
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
    // Only the hovering cursor tells settable value from reading.
    const debut = CSS.indexOf('.compteur {')
    expect(debut).toBeGreaterThan(-1)
    expect(CSS.slice(debut, CSS.indexOf('}', debut))).toContain('cursor: ew-resize')
  })

  it('T-0351 — dès l’appui et en saisie, son pointillé passe à l’accent sans changer de taille', () => {
    const debut = CSS.indexOf('.compteur.appuye,')
    expect(debut).toBeGreaterThan(-1)
    const regle = CSS.slice(debut, CSS.indexOf('}', debut))
    expect(regle).toContain('--compteur-trait: var(--accent)')
    // Only hue changes: border or padding would push neighbours.
    expect(regle).not.toMatch(/border|padding/)
  })

  it('souligne la valeur d’un pointillé, sans cadre', () => {
    const debut = CSS.indexOf('.compteur {')
    const regle = CSS.slice(debut, CSS.indexOf('}', debut))
    expect(regle).toContain('var(--compteur-trait)')
    expect(regle).toContain('repeat-x')
    expect(regle).not.toMatch(/border:/)
  })
})

describe('T-0162 — un champ de l’instant réécrit', () => {
  const nuit = new Date(2026, 2, 31, 22, 41, 7)

  it('ramène le jour au dernier du mois visé plutôt que de déborder', () => {
    // 31 March → February: gesture sets a MONTH. Unclamped, `new Date` slides to 3 March,
    // skipping the target month.
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
    // Split follows locale, never rewrites it; recomposition checks that. Day in digits, time
    // to minute.
    expect(recompose(partiesJour(nuit))).toBe(nuit.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }))
    expect(recompose(partiesHeure(nuit))).toMatch(/^\d{2}:\d{2}$/)
  })

  it('pose un compteur nommé et réglable au clavier sur chacun des cinq champs', () => {
    const html = ecran()
    for (const libelle of ['Jour', 'Mois', 'Année', 'Heure', 'Minute']) {
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
    // Direction matters: drag AD, scene re-aims, reading must show requested AD, not a neighbour's.
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
    expect(ramene(-10, TOUR_DEG)).toBeCloseTo(350, 9)
    expect(ramene(370, TOUR_DEG)).toBeCloseTo(10, 9)
  })

  it('compose la phrase à partir des segments, sans la réécrire', () => {
    // T-0068: canvas accessible name and bottom bar quote the SAME text = bar counters joined.
    majVue({ azimutDeg: 42 })
    const vue = etatScene().vue
    const assemblee = segmentsVisee(vue, MATRICE).reduce((p, s) => p + s.avant + s.texte, '')
    const phrase = ligneVisee(vue, MATRICE, INSTANT)
    expect(phrase.startsWith(dateHeure(INSTANT))).toBe(true)
    expect(phrase.endsWith(assemblee)).toBe(true)
  })

  it('laisse l’instant à l’horloge : la visée ne le date pas deux fois', () => {
    // Two clocks side by side contradict within a second; left one not settable. Fields start
    // at aim.
    const bas = ecran()
    const debut = bas.indexOf('>', bas.indexOf('coque-visee')) + 1
    const texte = bas
      .slice(debut, bas.indexOf('</div>', debut))
      .replaceAll('<!-- -->', '')
      .replace(/<[^>]*>/g, '')
    // Fields open on aim: AD, prefix first.
    expect(texte.trimStart().startsWith('AD')).toBe(true)
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
        // AD and azimuth wrap on themselves: bounding would stop the gesture.
        expect(balise, libelle).not.toContain('aria-valuemin=')
      } else {
        expect(balise, libelle).toContain(borne)
      }
    }
  })
})

describe('texteGlisse — un champ du lieu tiré au pas de son domaine', () => {
  const lat = { min: DOMAINES.latitude_deg.min, max: DOMAINES.latitude_deg.max, pas: DOMAINES.latitude_deg.pas }

  it('sous le premier cran, rend la valeur de départ écrite au pas', () => {
    expect(texteGlisse(45, 1, lat)).toBe(nombre(45, 2))
  })

  it('avance d’autant de pas que de crans, sans bruit flottant', () => {
    const dx = 60
    const attendu = 0.1 + cransGlisse(dx) * lat.pas
    expect(texteGlisse(0.1, dx, lat)).toBe(nombre(attendu, 2))
    expect(texteGlisse(0.1, dx, lat)).not.toMatch(/\d{3,}$/)
  })

  it('bute sur les bornes du domaine', () => {
    expect(texteGlisse(lat.max, 1000, lat)).toBe(nombre(lat.max, 2))
    expect(texteGlisse(lat.min, -1000, lat)).toBe(nombre(lat.min, 2))
  })

  it('un indice entier reste entier', () => {
    const b = DOMAINES.bortle_declare
    expect(texteGlisse(b.min, 12, b)).toMatch(/^\d$/)
  })
})
