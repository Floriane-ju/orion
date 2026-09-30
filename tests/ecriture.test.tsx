/**
 * T-0276 — nombres, unités et symboles s'écrivent à la française, partout pareil.
 *
 * La règle tient par un seul formateur : ce fichier vérifie ce qu'il écrit, et qu'aucun
 * `toFixed` ne rende de texte hors de lui. Un `toFixed` ne reste permis que là où une
 * machine relit la valeur — une propriété CSS, une couleur.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { degres, dureeLisible, dureeMinLisible, nombre, nombreLibre } from '../src/registry/ecriture.ts'
import { MIN_PAR_H, S_PAR_MIN } from '../src/core/unites.ts'
import { Etiquette } from '../src/ui/Terme.tsx'

const SRC = join(import.meta.dirname, '..', 'src')

/** Les seuls `toFixed` admis : ils écrivent une valeur CSS ou une couleur, pas un texte lu. */
const TOFIXED_MACHINE = new Set([
  'ui/CarteNuit.tsx',
  'ui/carte-nuit-calcul.ts',
  'ui/couleurs.ts',
])

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? fichiers(join(dossier, e.name))
      : /\.tsx?$/.test(e.name)
        ? [join(dossier, e.name)]
        : [],
  )
}

describe('T-0276 — le formateur', () => {
  it('écrit la virgule décimale, jamais le point', () => {
    expect(nombre(17.012, 2)).toBe('17,01')
    expect(nombreLibre(20.2)).toBe('20,2')
  })

  it('n’écrit pas de zéro négatif', () => {
    expect(nombre(-0.001, 2)).toBe('0,00')
  })

  it('ne groupe les milliers qu’à partir de cinq chiffres', () => {
    expect(nombreLibre(6000)).toBe('6000')
    expect(nombreLibre(250000)).not.toContain('250000')
  })

  it('colle le degré au nombre', () => {
    expect(degres(39.5, 1)).toBe('39,5°')
  })

  it('écrit une durée en heures et minutes, jamais en heures décimales', () => {
    expect(dureeMinLisible(8 * MIN_PAR_H + 8)).toBe('8 h 08')
    expect(dureeMinLisible(MIN_PAR_H - 1)).toBe('59 min')
    // Arrondie sur le total : 59 min 40 s ne donne pas « 0 h 60 ».
    expect(dureeLisible((MIN_PAR_H - 1) * S_PAR_MIN + 40)).toBe('1 h 00')
  })
})

describe('T-0276 — aucun toFixed ne rend de texte', () => {
  it('ne reste que dans les fichiers qui écrivent du CSS ou une couleur', () => {
    const fautifs = fichiers(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('.toFixed('))
      .map((f) => relative(SRC, f))
      .filter((f) => !TOFIXED_MACHINE.has(f))
    expect(fautifs).toEqual([])
  })
})

describe('T-0276 — la casse des symboles', () => {
  it('soustrait δ aux capitales du libellé', () => {
    const html = renderToStaticMarkup(<Etiquette cle="seuil_imagerie" />)
    expect(html).toContain('<span class="casse-exacte">δ</span>')
  })
})
