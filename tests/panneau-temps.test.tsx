/**
 * §3.2 / T-0411 — l'horloge et la frise de la nuit ne font qu'un réglage, dans la barre haute.
 *
 * Ce qui est vérifié n'est pas une apparence mais un câblage : six compteurs règlent l'instant,
 * la frise se pose entre l'horloge et le retour au présent, et le transport (lecture, pause,
 * chevrons) n'existe plus. Le rendu statique suffit — l'état du temps vit dans le magasin de
 * scène, réglable sans DOM.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App.tsx'
import { jourLocalIso } from '../src/core/nuit-datee.ts'
import { PanneauTemps } from '../src/ui/PanneauTemps.tsx'
import { etatScene, instant, reinitialiseScene, reprend, vaA } from '../src/ui/scene-etat.ts'

function barre(): string {
  return renderToStaticMarkup(
    <PanneauTemps surNuitIso={() => undefined} frise={<span className="frise-temoin" />} />,
  )
}

/**
 * L'emplacement du libellé d'un contrôle. T-0147 — un bouton à glyphe seul n'écrit plus son
 * nom dans un `aria-label` : il le tient de la bulle qui le suit, via `aria-labelledby`.
 */
function place(html: string, libelle: string): number {
  const bulle = html.indexOf(`role="tooltip" data-place="haut">${libelle}</span>`)
  return bulle > -1 ? bulle : html.indexOf(`aria-label="${libelle}"`)
}

afterEach(() => {
  reinitialiseScene()
})

describe('T-0411 — l’horloge et la frise règlent le même instant', () => {
  it('porte cinq compteurs et le retour au présent, sans transport', () => {
    const html = barre()
    for (const libelle of ['Jour', 'Mois', 'Année', 'Heure', 'Minute']) {
      expect(place(html, libelle), libelle).toBeGreaterThan(-1)
    }
    for (const retire of ['Reculer', 'Avancer', 'Mettre le temps en pause']) {
      expect(place(html, retire), retire).toBe(-1)
    }
    expect(html).not.toContain('play_arrow')
    expect(html).not.toContain('panneau-temps-transport')
  })

  it('pose l’heure, la date, le retour au présent, l’astre, puis la frise', () => {
    // L'ordre de la maquette : l'instant, sa destination « maintenant », l'astre de cet
    // instant, et le ciel qui défile sous lui.
    const html = renderToStaticMarkup(
      <PanneauTemps
        surNuitIso={() => undefined}
        frise={<span className="frise-temoin" />}
        lecture={<p className="lecture-temoin" />}
      />,
    )
    const ordre = [
      'panneau-temps-heure',
      'panneau-temps-jour',
      'panneau-temps-maintenant',
      'lecture-temoin',
      'frise-temoin',
    ].map((c) => html.indexOf(c))
    expect(ordre.every((p) => p > -1)).toBe(true)
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre)
  })

  it('offre un retour à l’instant présent, en un bouton', () => {
    // Le défaut que ça corrige : retrouver ce soir depuis une date choisie demandait de tirer
    // six compteurs jusqu'à l'heure qu'il est. Le glyphe passe par la police d'icônes.
    const html = barre()
    expect(html).toContain('panneau-temps-maintenant')
    expect(html).toContain('Revenir à maintenant')
    expect(html).toContain('history')
  })

  // T-0413 — le temps a quitté la barre haute pour le bas de la scène.
  it('pose le temps et la frise en bas de la scène, hors de la barre haute', () => {
    const ecran = renderToStaticMarkup(<App />)
    const debut = ecran.indexOf('coque-topbar')
    const haut = ecran.slice(debut, ecran.indexOf('</header>', debut))
    expect(haut).not.toContain('panneau-temps')
    const bas = ecran.slice(ecran.indexOf('coque-temps'))
    expect(bas).toContain('panneau-temps')
    expect(bas).toContain('panneau-nuit')
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

  it('date l’instant à la minute, en chiffres, sans jour de semaine', () => {
    // T-0162 — chaque champ est un compteur : c'est le texte rendu, balises retirées, qui
    // porte encore la date et l'heure. T-0327 — plus de jour de semaine. Le format reste celui
    // de la locale, il n'est pas réécrit ici.
    const texte = barre().replaceAll('<!-- -->', '').replace(/<[^>]*>/g, '')
    const attendu = new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(etatScene().msAffiche))
    expect(texte).toContain(attendu)
    expect(texte).toMatch(/\d{2}:\d{2}/)
    expect(texte).not.toMatch(/\d{2}:\d{2}:\d{2}/)
    const semaine = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(
      new Date(etatScene().msAffiche),
    )
    expect(texte).not.toContain(semaine)
  })

  it('remplace le tiroir de réglages et le champ de date de la barre', () => {
    const ecran = renderToStaticMarkup(<App />)
    expect(ecran).not.toContain('tiroir-temps')
    expect(ecran).not.toContain('type="date"')
    expect(ecran).not.toContain('Pas astronomiques')
    expect(ecran).toContain('panneau-temps')
  })
})

describe('T-0138 — la date-heure se choisit sans confondre les fuseaux', () => {
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
