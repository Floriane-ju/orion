/**
 * §6.4 — l'ordre de la liste quand la case « photographiables » est décochée : d'abord ce qui
 * se photographie ce soir, puis les écartées de la plus vite rattrapable à la moins — la Lune
 * (quelques nuits), la saison (quelques mois), la position (jamais d'ici), la focale (un autre
 * objectif), le capteur (aucun objectif du domaine).
 *
 * Aucune taille en dur : les bornes viennent de `bornesTailleCadre`, comme dans le moteur.
 */

import { describe, expect, it } from 'vitest'
import { trieParPhotographiabilite } from '../src/core/cible-ecartee.ts'
import { bornesTailleCadre } from '../src/core/session-candidates.ts'
import type { CauseEcart } from '../src/core/session-types.ts'
import type { EtatCible } from '../src/core/cibles-liste.ts'
import { objetGalaxie } from './fixtures.ts'

const CADRE = { fovHDeg: 10, capteurHMm: 24 }
const { minArcmin, maxArcmin } = bornesTailleCadre(CADRE.fovHDeg)
const DANS_LE_CADRE = (minArcmin + maxArcmin) / 2

function ecartee(code: CauseEcart): EtatCible {
  return { note: 0, libelle: 'hors de portée', pose: null, cause: code, code }
}

const RETENUE: EtatCible = {
  note: 3,
  libelle: 'accessible',
  pose: { tRequisS: 1, nPoses: 1, tPoseS: 1, dureeCreneauMin: 1, nNuits: 1 },
  cause: null,
  code: null,
}

/** Trop petite d'un cheveu : une focale du domaine la rattrape. */
const FOCALE = objetGalaxie({ designation: 'FOCALE', majAxArcmin: minArcmin * 0.9 })
/** Si petite qu'aucune focale du domaine ne la cadre sur ce capteur. */
const CAPTEUR = objetGalaxie({ designation: 'CAPTEUR', majAxArcmin: minArcmin * 1e-6 })

const lignes = [
  { objet: CAPTEUR, etat: ecartee('CADRAGE') },
  { objet: FOCALE, etat: ecartee('CADRAGE') },
  { objet: objetGalaxie({ designation: 'POSITION', majAxArcmin: DANS_LE_CADRE }), etat: ecartee('HAUTEUR') },
  { objet: objetGalaxie({ designation: 'RELIEF', majAxArcmin: DANS_LE_CADRE }), etat: ecartee('RELIEF') },
  { objet: objetGalaxie({ designation: 'SAISON', majAxArcmin: DANS_LE_CADRE }), etat: ecartee('FENETRE') },
  { objet: objetGalaxie({ designation: 'LUNE', majAxArcmin: DANS_LE_CADRE }), etat: ecartee('LUNE') },
  { objet: objetGalaxie({ designation: 'RETENUE', majAxArcmin: DANS_LE_CADRE }), etat: RETENUE },
]
const etats = new Map(lignes.map((l) => [l.objet.designation, l.etat]))

describe('trieParPhotographiabilite', () => {
  it('range photographiables, Lune, saison, position, focale, capteur', () => {
    const ordre = trieParPhotographiabilite(lignes, etats, CADRE).map((l) => l.objet.designation)
    expect(ordre).toEqual(['RETENUE', 'LUNE', 'SAISON', 'POSITION', 'RELIEF', 'FOCALE', 'CAPTEUR'])
  })

  it('garde l’ordre reçu à l’intérieur d’un groupe : la magnitude reste le second critère', () => {
    const a = { objet: objetGalaxie({ designation: 'A' }), etat: ecartee('LUNE') }
    const b = { objet: objetGalaxie({ designation: 'B' }), etat: ecartee('LUNE') }
    const m = new Map([['A', a.etat], ['B', b.etat]])
    expect(trieParPhotographiabilite([a, b], m, CADRE).map((l) => l.objet.designation)).toEqual([
      'A',
      'B',
    ])
  })

  it('met en fin une cible que le moteur n’a pas évaluée', () => {
    const inconnue = { objet: objetGalaxie({ designation: 'INCONNUE' }) }
    const ordre = trieParPhotographiabilite([inconnue, ...lignes], etats, CADRE)
    expect(ordre.at(-1)?.objet.designation).toBe('INCONNUE')
  })
})
