/**
 * §3.2 / T-0137 / T-0314 — le temps se pilote depuis un panneau posé en haut à droite, comme
 * un lecteur.
 *
 * Ce qui est vérifié n'est pas une apparence mais un câblage : quatre chevrons portent les
 * deux vitesses du registre dans les deux sens, la lecture et la pause se lisent sur leur
 * bouton, et l'écrêtage par la lisibilité s'affiche en clair. Le rendu statique suffit —
 * l'état du transport vit dans le magasin de scène, réglable sans DOM.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { facteurDefilement } from '../src/core/curseur-temps.ts'
import { K } from '../src/registry/constants.ts'
import { jourLocalIso } from '../src/core/nuit-datee.ts'
import { pourChampDateHeure } from '../src/ui/horaire.ts'
import { PanneauTemps, transportActif } from '../src/ui/PanneauTemps.tsx'
import {
  etatScene,
  instant,
  majTemps,
  majVue,
  reinitialiseScene,
  reprend,
  vaA,
  type TempsScene,
} from '../src/ui/scene-etat.ts'

function barre(): string {
  return renderToStaticMarkup(<PanneauTemps surNuitIso={() => undefined} />)
}

/**
 * L'emplacement du libellé d'un contrôle. T-0147 — un bouton à glyphe seul n'écrit plus son
 * nom dans un `aria-label` : il le tient de la bulle qui le suit, via `aria-labelledby`.
 */
function place(html: string, libelle: string): number {
  const bulle = html.indexOf(`role="tooltip" data-place="haut">${libelle}</span>`)
  return bulle > -1 ? bulle : html.indexOf(`aria-label="${libelle}"`)
}

/** Le fragment d'un contrôle, de son ouverture à son libellé : de quoi lire son état pressé. */
function controle(html: string, libelle: string): string {
  const fin = place(html, libelle)
  expect(fin, libelle).toBeGreaterThan(-1)
  return html.slice(html.lastIndexOf('<button', fin), fin)
}

afterEach(() => {
  reinitialiseScene()
})

describe('T-0137 — le panneau du temps pilote le ciel', () => {
  it('porte les quatre chevrons, le cadran et la lecture', () => {
    const html = barre()
    for (const libelle of ['Reculer vite', 'Reculer', 'Avancer', 'Avancer vite']) {
      expect(place(html, libelle), libelle).toBeGreaterThan(-1)
    }
    // T-0162 — le cadran n'est plus un bouton unique : six compteurs, un par champ réglable.
    for (const libelle of ['Jour', 'Mois', 'Année', 'Heure', 'Minute', 'Seconde']) {
      expect(place(html, libelle), libelle).toBeGreaterThan(-1)
    }
    expect(html).toContain('Mettre le temps en pause')
  })

  it('encadre la LECTURE : les reculs à sa gauche, les avances à sa droite', () => {
    // L'ordre EST l'information : deux chevrons posés du même côté ne diraient plus dans quel
    // sens ils emmènent le ciel. T-0314 — c'est la lecture qui tient le milieu du transport,
    // et non plus le cadran.
    const html = barre()
    const ou = (libelle: string) => place(html, libelle)
    expect(ou('Reculer vite')).toBeLessThan(ou('Reculer'))
    expect(ou('Reculer')).toBeLessThan(ou('Mettre le temps en pause'))
    expect(ou('Mettre le temps en pause')).toBeLessThan(ou('Avancer'))
    expect(ou('Avancer')).toBeLessThan(ou('Avancer vite'))
  })

  it('pose l’heure à droite de la date, et le retour au présent après le transport', () => {
    const html = barre()
    expect(html.indexOf('panneau-temps-jour')).toBeLessThan(html.indexOf('panneau-temps-heure'))
    expect(html.indexOf('panneau-temps-heure')).toBeLessThan(
      html.indexOf('panneau-temps-transport'),
    )
    expect(place(html, 'Avancer vite')).toBeLessThan(html.indexOf('panneau-temps-maintenant'))
  })

  it('offre un retour à l’instant présent, en un bouton', () => {
    // Le défaut que ça corrige : retrouver ce soir depuis une date choisie demandait de tirer
    // six compteurs jusqu'à l'heure qu'il est. Le glyphe passe par la police d'icônes, comme
    // tout le reste du panneau.
    const html = barre()
    expect(html).toContain('panneau-temps-maintenant')
    expect(html).toContain('Revenir à maintenant')
    expect(html).toContain('update')
  })

  it('dessine ses commandes avec des glyphes de la police d’icônes, pas des caractères', () => {
    const html = barre()
    for (const ligature of [
      'keyboard_double_arrow_left',
      'chevron_left',
      'chevron_right',
      'keyboard_double_arrow_right',
      'pause',
    ]) {
      expect(html, ligature).toContain(ligature)
    }
    expect(html).not.toMatch(/[‹›»«▶⏸]/)
  })

  it('marque le chevron actif, et lui seul — la lecture comprise', () => {
    // T-0314 — le groupe est EXCLUSIF. Avant, la lecture restait allumée pendant un défilement :
    // deux commandes enfoncées, et rien pour dire laquelle tenait la vitesse.
    majTemps({ modeTemps: 'DEFILEMENT', facteur: -facteurDefilement(true) })
    const html = barre()
    expect(controle(html, 'Reculer vite')).toContain('aria-pressed="true"')
    for (const inactif of ['Reculer', 'Avancer', 'Avancer vite']) {
      expect(controle(html, inactif), inactif).toContain('aria-pressed="false"')
    }
    expect(controle(html, 'Revenir au temps réel')).toContain('aria-pressed="false"')
    expect(html).toContain('play_arrow')
  })

  it('tire ses deux vitesses du registre', () => {
    expect(facteurDefilement(false)).toBe(K('FACTEUR_DEFILEMENT_NORMAL'))
    expect(facteurDefilement(true)).toBe(K('FACTEUR_DEFILEMENT_RAPIDE'))
  })

  it('bascule le bouton de lecture selon l’état du temps', () => {
    expect(place(barre(), 'Mettre le temps en pause')).toBeGreaterThan(-1)
    majTemps({ modeTemps: 'FIGE' })
    const enPause = barre()
    expect(place(enPause, 'Reprendre l’écoulement du temps')).toBeGreaterThan(-1)
    expect(enPause).toContain('play_arrow')

    // T-0314 — depuis un défilement, la commande ne reprend rien et ne met rien en pause : elle
    // ramène au temps réel, et elle le dit.
    majTemps({ modeTemps: 'DEFILEMENT', facteur: facteurDefilement(false) })
    expect(place(barre(), 'Revenir au temps réel')).toBeGreaterThan(-1)
  })

  it('reprend la lecture DEPUIS l’instant choisi, sans sauter à l’heure du jour', () => {
    // Le défaut que ça corrige : `MAINTENANT` resynchronisait sur `Date.now()` à chaque image,
    // donc appuyer sur lecture effaçait la date qu'on venait de choisir.
    const choisi = Date.UTC(2026, 7, 21, 20, 41, 7)
    vaA(choisi)
    reprend()
    expect(etatScene().temps.modeTemps).toBe('MAINTENANT')
    expect(instant.ms).toBe(choisi)
    // C'est l'expression même de la boucle de rendu : l'horloge système donne la cadence,
    // le décalage donne l'ancrage. La tolérance couvre le temps passé dans le test.
    expect(Date.now() + etatScene().temps.decalageMs).toBeCloseTo(choisi, -3)
  })

  it('ouvre sur l’instant présent : aucun décalage tant qu’on n’a rien choisi', () => {
    expect(etatScene().temps.decalageMs).toBe(0)
  })

  /**
   * T-0314 — le panneau ne dit ni la vitesse appliquée ni son écrêtage.
   *
   * Le plafond de lisibilité de §3.2 s'applique toujours — il vit dans `Planetarium`, qui
   * dessine — mais l'annoncer demandait au panneau une largeur variable : « ×1500 » puis rien,
   * une phrase de trois lignes puis rien, alors qu'il coiffe le panneau de séance et doit
   * garder exactement sa largeur. Ce qui se vérifie ici est donc une ABSENCE, dans les deux
   * régimes : vitesse écrêtée, et vitesse qui tient.
   */
  it('ne montre ni facteur ni écrêtage, quelle que soit la vitesse', () => {
    // §3.2 — à 5° de champ sur 1920 px, le plafond tombe à ×374 : c'est le cas qui produisait
    // les deux lectures.
    majVue({ fovDeg: 5, largeurPx: 1920 })
    majTemps({ modeTemps: 'DEFILEMENT', facteur: facteurDefilement(true) })
    const ecrete = barre()
    expect(ecrete).not.toMatch(/×\d/)
    expect(ecrete).not.toMatch(/ramené/)

    majTemps({ modeTemps: 'DEFILEMENT', facteur: facteurDefilement(false) })
    expect(barre()).not.toMatch(new RegExp(`×${K('FACTEUR_DEFILEMENT_NORMAL')}`))
  })

  it('date l’instant à la seconde, jour de semaine compris', () => {
    // T-0162 — chaque champ est un compteur : c'est le texte rendu, balises retirées, qui
    // porte encore la date et l'heure à la seconde. T-0314 — le jour de semaine et le mois
    // abrégé ouvrent la date ; le format reste celui de la locale, il n'est pas réécrit ici.
    const texte = barre().replaceAll('<!-- -->', '').replace(/<[^>]*>/g, '')
    const attendu = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(etatScene().msAffiche))
    expect(texte).toContain(attendu)
    expect(texte).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it('remplace le tiroir de réglages et le champ de date de la barre', () => {
    const ecran = renderToStaticMarkup(<App />)
    expect(ecran).not.toContain('tiroir-temps')
    expect(ecran).not.toContain('type="date"')
    expect(ecran).not.toContain('Pas astronomiques')
    expect(ecran).toContain('panneau-temps')
  })
})

/**
 * T-0314 — les cinq commandes du transport sont UN groupe exclusif.
 *
 * Le rendu statique dit ce qui s'ALLUME ; la règle qui décide, elle, est une fonction, et c'est
 * elle qu'on vérifie ici — le clic n'existe pas dans un rendu serveur. Deux promesses : une
 * seule commande allumée quel que soit l'état, et la commande allumée est celle dont le clic
 * suivant fige le temps.
 */
describe('T-0314 — le transport est un groupe exclusif', () => {
  const NORMAL = facteurDefilement(false)
  const RAPIDE = facteurDefilement(true)
  /** Les cinq commandes, dans l'ordre du transport. `null` est la lecture. */
  const COMMANDES: readonly (number | null)[] = [-RAPIDE, -NORMAL, null, NORMAL, RAPIDE]

  /** Ce qui est allumé pour un état donné du temps : au plus une commande. */
  function allumees(temps: TempsScene): readonly (number | null)[] {
    return COMMANDES.filter((facteur) => transportActif(temps, facteur))
  }

  it('n’allume que le temps réel quand le temps s’écoule à la vitesse du ciel', () => {
    majTemps({ modeTemps: 'MAINTENANT' })
    expect(allumees(etatScene().temps)).toEqual([null])
  })

  it('éteint la lecture dès qu’une vitesse prend la main', () => {
    // Le défaut que ça corrige : la lecture s'allumait pour tout temps qui s'écoule, défilement
    // compris — deux commandes enfoncées, et aucune qui dise laquelle tenait la vitesse.
    for (const facteur of [NORMAL, RAPIDE, -NORMAL, -RAPIDE]) {
      majTemps({ modeTemps: 'DEFILEMENT', facteur })
      expect(allumees(etatScene().temps), `×${facteur}`).toEqual([facteur])
    }
  })

  it('n’allume rien en pause : c’est l’état qu’un second clic rend', () => {
    majTemps({ modeTemps: 'FIGE' })
    expect(allumees(etatScene().temps)).toEqual([])
  })

  it('ne confond pas les deux sens d’une même vitesse', () => {
    // Le facteur porte le sens : sans ce signe, reculer vite allumerait le chevron d'avance.
    majTemps({ modeTemps: 'DEFILEMENT', facteur: -RAPIDE })
    expect(transportActif(etatScene().temps, -RAPIDE)).toBe(true)
    expect(transportActif(etatScene().temps, RAPIDE)).toBe(false)
  })
})

describe('T-0138 — la date-heure se choisit sans confondre les fuseaux', () => {
  it('donne au champ natif une heure locale, seconde comprise', () => {
    const instant = new Date(2026, 7, 21, 22, 41, 7)
    expect(pourChampDateHeure(instant)).toBe('2026-08-21T22:41:07')
  })

  it('donne le jour du calendrier LOCAL, pas la tranche UTC', () => {
    // Piège A1 — après minuit local en été, `toISOString()` désigne encore la veille à
    // l'ouest de Greenwich, le lendemain à l'est.
    const apresMinuit = new Date(2026, 6, 15, 1, 30, 0)
    expect(jourLocalIso(apresMinuit)).toBe(apresMinuit.toLocaleDateString('sv-SE'))
    if (apresMinuit.getTimezoneOffset() !== 0) {
      expect(apresMinuit.toISOString().slice(0, 10)).not.toBe(jourLocalIso(apresMinuit))
    }
  })
})
