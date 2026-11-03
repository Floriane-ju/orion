/**
 * §3.2 — time cursor, speed ceiling. PRD figures as-is: 0,13 px/s at real time on 1920 px
 * viewport at 60° field; ceiling under ×374 at 5° zoom (ticket criterion: cursor coupled to
 * zoom).
 */

import { describe, expect, it } from 'vitest'
import {
  etatLisibilite,
  facteurMax,
  pxParDegre,
  reglageVitesse,
  vitesseEcran,
} from '../src/core/curseur-temps.ts'
import { K } from '../src/registry/constants.ts'

const VIEWPORT = 1920

describe('vitesse écran §3.2', () => {
  it('donne 32 px/° à 60° de champ sur 1920 px', () => {
    expect(pxParDegre(VIEWPORT, 60)).toBe(32)
  })

  it('condamne le temps réel : 0,13 px/s, imperceptible', () => {
    const v = vitesseEcran(1, 32)
    expect(v.value).toBeCloseTo(0.13, 2)
    expect(etatLisibilite(v.value)).toBe('IMPERCEPTIBLE')
  })

  it('reproduit la table du PRD, du lisible au repliement', () => {
    expect(vitesseEcran(60, 32).value).toBeCloseTo(8.0, 1)
    expect(etatLisibilite(vitesseEcran(60, 32).value)).toBe('LISIBLE')
    expect(vitesseEcran(600, 32).value).toBeCloseTo(80.2, 1)
    expect(etatLisibilite(vitesseEcran(600, 32).value)).toBe('LISIBLE')
    expect(vitesseEcran(3600, 32).value).toBeCloseTo(481, 0)
    expect(etatLisibilite(vitesseEcran(3600, 32).value)).toBe('RAPIDE')
    expect(vitesseEcran(10000, 32).value).toBeCloseTo(1337, 0)
    expect(etatLisibilite(vitesseEcran(10000, 32).value)).toBe('REPLIEMENT')
  })

  it('plafonne à ×4 488 en vue large et à ×374 à 5° de champ', () => {
    expect(facteurMax(32).value).toBeCloseTo(4488, 0)
    expect(facteurMax(pxParDegre(VIEWPORT, 5)).value).toBeCloseTo(374, 0)
  })
})

describe('couplage du curseur au zoom §3.2', () => {
  it('ramène ×3600 sous ×374 quand on zoome de 60° à 5°, et le signale', () => {
    const large = reglageVitesse(3600, VIEWPORT, 60)
    expect(large.ajuste).toBe(false)
    expect(large.facteur).toBe(3600)

    const serre = reglageVitesse(3600, VIEWPORT, 5)
    expect(serre.ajuste).toBe(true)
    expect(serre.facteur).toBeLessThan(374)
    expect(serre.facteur).toBeCloseTo(serre.facteurMax.value, 6)
    expect(serre.message).toMatch(/ramené/)
    expect(serre.message).toMatch(/illisible/)
    // Adjustment brings the view back into readable range instead of letting it fold.
    expect(serre.etat).not.toBe('REPLIEMENT')
  })

  it('dit quand le mouvement ne montre rien plutôt que d’animer dans le vide', () => {
    const reel = reglageVitesse(1, VIEWPORT, 60)
    expect(reel.etat).toBe('IMPERCEPTIBLE')
    expect(reel.message).toMatch(/invisible/)
  })

  it('conserve le sens de la marche arrière', () => {
    const arriere = reglageVitesse(-3600, VIEWPORT, 5)
    expect(arriere.facteur).toBeLessThan(0)
    expect(Math.abs(arriere.facteur)).toBeCloseTo(arriere.facteurMax.value, 6)
  })

  it('ne signale rien quand le réglage est déjà lisible', () => {
    const bon = reglageVitesse(600, VIEWPORT, 60)
    expect(bon.etat).toBe('LISIBLE')
    expect(bon.message).toBeUndefined()
    expect(bon.ajuste).toBe(false)
  })
})

describe('T-0137 — deux vitesses nommées §3.2', () => {
  it('place les deux vitesses dans la plage lisible au champ de référence', () => {
    for (const rapide of [false, true]) {
      const reglage = reglageVitesse(K(rapide ? 'FACTEUR_DEFILEMENT_RAPIDE' : 'FACTEUR_DEFILEMENT_NORMAL'), VIEWPORT, 60)
      expect(reglage.etat, `rapide=${rapide}`).toBe('LISIBLE')
      expect(reglage.ajuste, `rapide=${rapide}`).toBe(false)
    }
  })

  it('écrête la vitesse rapide en champ serré, et le dit', () => {
    // Ceiling does not depend on the command: zoom lowers it (§3.2).
    const serre = reglageVitesse(K('FACTEUR_DEFILEMENT_RAPIDE'), VIEWPORT, 5)
    expect(serre.ajuste).toBe(true)
    expect(serre.facteur).toBeCloseTo(serre.facteurMax.value, 6)
    expect(serre.message).toMatch(/ramené/)
  })

  it('laisse passer la vitesse normale là où la rapide est écrêtée', () => {
    const normale = reglageVitesse(K('FACTEUR_DEFILEMENT_NORMAL'), VIEWPORT, 5)
    expect(normale.ajuste).toBe(false)
    expect(normale.facteur).toBe(K('FACTEUR_DEFILEMENT_NORMAL'))
  })
})
