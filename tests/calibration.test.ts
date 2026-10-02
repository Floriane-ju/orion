/**
 * §7.4 — plan de calibration et dithering.
 *
 * Et le contrôle négatif de §2.3 et §7.1 : AUCUN écran de calibration n'existe nulle part.
 * Les poses de calibration prescrites ici sont des images prises sur le terrain ; elles
 * n'ont rien à voir avec un réglage du point zéro système, qui n'existe pas.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planCalibration } from '../src/core/calibration.ts'
import { S_PAR_MIN } from '../src/core/unites.ts'

const SESSION = { tPosesS: [13], iso: 640, nPoses: 252 }

describe('plan de calibration §7.4', () => {
  const plan = planCalibration(SESSION)

  it('prescrit 30 darks, 25 flats et 50 offsets pour la session de référence', () => {
    const nombres = Object.fromEntries(plan.lots.map((l) => [l.type, l.nombre]))
    expect(nombres).toEqual({ DARKS: 30, FLATS: 25, OFFSETS: 50 })
  })

  it('ajoute environ 7 min au budget de session pour les darks', () => {
    expect(plan.surcoutTempsMin.value).toBeCloseTo(6.5, 1)
    expect(Math.round(plan.surcoutTempsMin.value)).toBe(7)
    expect(plan.surcoutTempsMin.formula.id).toBe('TEMPS_DARKS')
  })

  it('affiche l’ordre d’importance flats, darks, offsets', () => {
    expect(plan.lots.map((l) => l.type)).toEqual(['FLATS', 'DARKS', 'OFFSETS'])
  })

  it('rappelle de ne pas toucher la mise au point avant les flats', () => {
    expect(plan.avertissements.join(' ')).toMatch(/bague de mise au point/)
  })

  it('recommande le dithering à chaque pose sans autoguidage, et dit ce qu’il supprime', () => {
    expect(plan.dithering).toMatch(/à chaque pose/)
    expect(plan.dithering).toMatch(/dérive naturelle/)
  })

  it('prescrit un lot de darks par durée de pose distincte du plan, flats et offsets une fois', () => {
    const nuit = planCalibration({ ...SESSION, tPosesS: [13, 30, 13] })
    expect(nuit.lots.map((l) => [l.type, l.tPoseS])).toEqual([
      ['FLATS', undefined],
      ['DARKS', 30],
      ['DARKS', 13],
      ['OFFSETS', undefined],
    ])
    const nDarks = plan.lots.find((l) => l.type === 'DARKS')!.nombre
    expect(nuit.surcoutTempsMin.value).toBeCloseTo((nDarks * (13 + 30)) / S_PAR_MIN, 6)
  })

  it('invalide les flats au changement de focale ou d’orientation', () => {
    const suivante = planCalibration({ ...SESSION, changementFocaleOuOrientation: true })
    expect(suivante.avertissements.join(' ')).toMatch(/refaites des flats/)
  })
})

describe('aucune bibliothèque de darks réutilisable §7.4', () => {
  const plan = planCalibration(SESSION)

  it('prescrit un lot de darks à chaque séance, sans jamais le déclarer réutilisable', () => {
    expect(plan.lots.map((l) => l.type)).toContain('DARKS')
    expect(JSON.stringify(plan)).not.toMatch(/bibliothèque/i)
  })

  it('dit quand les prendre plutôt que de comparer une température', () => {
    expect(plan.surcoutTempsMin.note).toMatch(/fin de séance, capteur encore froid/)
    expect(JSON.stringify(plan)).not.toMatch(/°C/)
  })
})

describe('aucun écran de calibration — §2.3, §7.1', () => {
  function sources(dossier: string): string[] {
    return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
      const chemin = join(dossier, entree.name)
      if (entree.isDirectory()) return sources(chemin)
      return /\.tsx?$/.test(entree.name) ? [readFileSync(chemin, 'utf8')] : []
    })
  }

  const code = sources(join(import.meta.dirname, '..', 'src')).join('\n')

  it('n’expose aucune fonction de calibration du point zéro système', () => {
    expect(code).not.toMatch(/function\s+calibre/i)
    expect(code).not.toMatch(/export function\s+\w*[Cc]alibration\w*\s*\([^)]*\)\s*:\s*void/)
    // Le point zéro se lit, il ne s'écrit pas : aucun modificateur nulle part.
    expect(code).not.toMatch(/setZpSys|ecritZpSys|majZpSys/)
  })

  it('n’ouvre aucun import de fichier RAW', () => {
    // Le seul champ fichier de l'application est l'import JSON des données utilisateur (§12.3).
    const accepts = [...code.matchAll(/accept="([^"]+)"/g)].map((m) => m[1])
    expect(accepts).toEqual(['application/json'])
  })

  it('n’offre aucun champ éditable pour le point zéro système', () => {
    expect(code).not.toMatch(/<input[^>]*zp/i)
  })
})
