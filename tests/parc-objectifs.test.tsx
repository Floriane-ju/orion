/**
 * T-0404 — §5.1 parc d'objectifs, côté saisie : le réglage borné par l'objectif monté, le
 * plancher d'ouverture qui suit la focale, la saisie d'un objectif, la carte Optique, et la
 * phrase §6.1 qui nomme l'objectif du parc.
 *
 * Les plafonds attendus se relisent dans le moteur (`plagesReglage`) au lieu d'être recopiés.
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Objectif } from '../src/core/objectif.ts'
import { nombreSaisi } from '../src/ui/saisie-bornee.ts'
import { reglageOptique } from '../src/ui/objectif-saisie.ts'
import { caracteristiques, objectifDeSaisie, parcAvec, parcDeDepart, saisieDe } from '../src/ui/parc-saisie.ts'
import { PanneauMateriel, resumeOptique } from '../src/ui/PanneauMateriel.tsx'
import { phraseFocale } from '../src/ui/CibleImpossible.tsx'
import { DEFAUT, type SaisieMateriel } from '../src/ui/app-saisie.ts'
import { evalueMateriel, grandeursMateriel } from '../src/ui/app-calcul.ts'
import { ouvreCarte } from '../src/ui/coque-etat.ts'

const rien = () => undefined

const ZOOM: Objectif = {
  id: 'zoom',
  nom: '18–55 mm f/3,5–5,6',
  focaleMinMm: 18,
  focaleMaxMm: 55,
  ouvertureGrandAngleN: 3.5,
  ouvertureTeleN: 5.6,
  typeObjectif: 'RECTILINEAIRE',
}

const FIXE: Objectif = {
  id: 'fixe',
  nom: '135 mm f/2',
  focaleMinMm: 135,
  focaleMaxMm: 135,
  ouvertureGrandAngleN: 2,
  ouvertureTeleN: 2,
  typeObjectif: 'RECTILINEAIRE',
}

describe('T-0404 — le réglage sous l’objectif monté', () => {
  it('sans objectif, la saisie n’est bornée que par le domaine', () => {
    const r = reglageOptique(null, '300', '1.4')
    expect(r.focale).toEqual(nombreSaisi('focale_mm', '300'))
    expect(r.ouverture).toEqual(nombreSaisi('ouverture_N', '1.4'))
    expect(r.plages).toBeUndefined()
  })

  it('ramène focale et ouverture dans ce que l’objectif permet, et le dit', () => {
    const r = reglageOptique(ZOOM, '200', '2.8')
    expect(r.focale.valeur).toBe(ZOOM.focaleMaxMm)
    expect(r.focale.refus).toMatch(/Hors de l’objectif/)
    expect(r.ouverture.valeur).toBe(ZOOM.ouvertureTeleN)
    expect(r.ouverture.refus).toMatch(/l’ouverture/)
  })

  it('laisse passer un réglage déjà permis', () => {
    const r = reglageOptique(ZOOM, '35', '8')
    expect(r.focale.refus).toBeNull()
    expect(r.ouverture.refus).toBeNull()
  })
})

describe('T-0404 — la saisie d’un objectif du parc', () => {
  it('une focale fixe ne demande qu’une focale et une ouverture', () => {
    const o = objectifDeSaisie(
      { focaleMin: '135', focaleMax: '', ouvertureGrandAngle: '2', ouvertureTele: '' },
      FIXE.id,
      'RECTILINEAIRE',
    )
    expect(o).toEqual(FIXE)
    expect(caracteristiques(o)).toBe('135 mm f/2')
  })

  it('se réédite à l’identique', () => {
    expect(objectifDeSaisie(saisieDe(ZOOM), ZOOM.id, 'RECTILINEAIRE')).toEqual(ZOOM)
    expect(caracteristiques(ZOOM)).toBe('18–55 mm f/3,5–5,6')
  })

  it('un objectif incomplet est refusé en nommant le champ', () => {
    expect(() => objectifDeSaisie({ ...saisieDe(ZOOM), focaleMin: '' }, ZOOM.id, 'RECTILINEAIRE')).toThrow(/focale/)
  })

  it('remplace un objectif à sa place, ajoute un nouveau au bout', () => {
    const renomme = { ...ZOOM, nom: 'Kit' }
    expect(parcAvec([ZOOM, FIXE], renomme)).toEqual([renomme, FIXE])
    expect(parcAvec([ZOOM], FIXE)).toEqual([ZOOM, FIXE])
  })
})

function materiel(champs: Partial<SaisieMateriel>): SaisieMateriel {
  return {
    boitierId: '',
    surBoitierId: rien,
    boitier: {
      formatCapteur: 'PLEIN_FORMAT',
      resolutionMpx: DEFAUT.resolutionMpx,
      readNoiseE: '',
      seuilDoubleGainIso: '',
      zpSys: '',
      tailleRawMo: '',
    },
    surBoitier: rien,
    iso: '',
    surIso: rien,
    objectifs: [ZOOM, FIXE],
    surObjectifs: rien,
    objectifId: '',
    surObjectifId: rien,
    focale: DEFAUT.focale,
    surFocale: rien,
    ouverture: DEFAUT.ouverture,
    surOuverture: rien,
    capteurMode: 'FULL_FRAME',
    surCapteurMode: rien,
    typeObjectif: 'RECTILINEAIRE',
    surTypeObjectif: rien,
    suiviActif: false,
    surSuiviActif: rien,
    qualiteMes: 'INCONNUE',
    surQualiteMes: rien,
    typeMonture: 'TRACKER',
    surTypeMonture: rien,
    ...champs,
  }
}

function rendu(champs: Partial<SaisieMateriel>): string {
  ouvreCarte('OPTIQUE')
  const saisie = materiel(champs)
  const calcul = evalueMateriel(saisie, grandeursMateriel(saisie))
  return renderToStaticMarkup(<PanneauMateriel {...saisie} {...(calcul.ok ? { lectures: calcul } : {})} />)
}

describe('T-0404 — la carte Optique', () => {
  it('une ligne par objectif, l’objectif utilisé coché, ni nom ni lectures de champ', () => {
    const html = rendu({ objectifId: ZOOM.id, focale: '35', ouverture: '8' })
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    const radio = html.match(/<input type="radio"[^>]*aria-label="Utiliser 18–55[^>]*>/)?.[0] ?? ''
    expect(radio).toContain('checked=""')
    expect(html).not.toContain('Objectif libre')
    expect(html).not.toContain('Champ')
    expect(html).not.toContain('Pose maximale sans suivi')
    expect(resumeOptique('35', '8')).toBe('35 mm f/8')
  })

  it('chaque ligne a sa case fisheye ; ni ouverture ni fisheye ne se règlent sous le parc', () => {
    const html = rendu({ objectifId: ZOOM.id, focale: '35', ouverture: '8' })
    expect(html.match(/type="checkbox"[^>]*aria-label="Fisheye — /g)).toHaveLength(2)
    expect(html).not.toContain('Objectif fisheye')
    expect(html).not.toMatch(/placeholder="[\d,]+ à 32"/)
  })

  it('chaque objectif se retire, sauf le dernier qui reste', () => {
    expect(rendu({ objectifId: ZOOM.id, focale: '35', ouverture: '8' }).match(/Retirer /g)).toHaveLength(2)
    const seul = rendu({ objectifs: [ZOOM], objectifId: ZOOM.id, focale: '35', ouverture: '8' })
    expect(seul).not.toContain('Retirer ')
  })

  it('sous un zoom, la focale annonce la plage de l’objectif', () => {
    const html = rendu({ objectifId: ZOOM.id, focale: '35', ouverture: '8' })
    expect(html).toContain('placeholder="18 à 55"')
  })

  it('sous une focale fixe, la focale ne se saisit plus', () => {
    const html = rendu({ objectifId: FIXE.id, focale: '135', ouverture: '2' })
    expect(html).not.toContain('placeholder="135 à 135"')
    // Le fisheye reste réglable : il s'écrit dans l'objectif coché.
  })

  it('le calcul reçoit le réglage borné, pas la frappe', () => {
    const saisie = materiel({ objectifId: ZOOM.id, focale: '300', ouverture: '1.4' })
    const g = grandeursMateriel(saisie)
    expect(g.focaleMm).toBe(ZOOM.focaleMaxMm)
    expect(g.ouvertureN).toBe(ZOOM.ouvertureTeleN)
  })
})

describe('T-0404 — §6.1 : la cible écartée nomme l’objectif du parc', () => {
  const TELE: Objectif = { ...ZOOM, id: 'tele', nom: '70-200', focaleMinMm: 70, focaleMaxMm: 200 }

  it('ajoute l’objectif et sa focale au levier', () => {
    expect(phraseFocale({ sens: 'AU_MOINS', focaleMm: 134.2 }, [TELE])).toBe(
      'Focale min 135 mm — 70-200 à 135 mm',
    )
  })

  it('sans objectif qui convienne, le levier seul', () => {
    expect(phraseFocale({ sens: 'AU_MOINS', focaleMm: 400 }, [TELE])).toBe('Focale min 400 mm')
    expect(phraseFocale({ sens: 'AU_PLUS', focaleMm: 50.7 })).toBe('Focale max 50 mm')
  })
})

describe('T-0404 — relecture : la plage de l’objectif borne même hors domaine', () => {
  it('5 000 mm sur un 18-55 donne 55, pas le maximum du domaine', () => {
    expect(reglageOptique(ZOOM, '5000', '8').focale.valeur).toBe(ZOOM.focaleMaxMm)
    expect(reglageOptique(ZOOM, '18', '0.5').ouverture.valeur).toBe(ZOOM.ouvertureGrandAngleN)
  })
})

describe('T-0404 — l’optique de départ est un objectif du parc', () => {
  it('le réglage d’avant le parc devient son premier objectif, monté, éditable et retirable', () => {
    const { objectifs, objectifId } = parcDeDepart({ focale: '120', ouverture: '2.8', fisheye: false }, 'depart')
    expect(objectifs).toHaveLength(1)
    expect(objectifId).toBe('depart')
    const [o] = objectifs
    expect(o?.focaleMinMm).toBe(o?.focaleMaxMm)
    expect(o?.nom).toBe(o === undefined ? '' : caracteristiques(o))
    // Rééditable en zoom : la saisie qui en sort se complète d'une focale max.
    const zoom = o === undefined ? null : objectifDeSaisie({ ...saisieDe(o), focaleMax: '200' }, o.id, o.typeObjectif)
    expect(zoom?.focaleMaxMm).toBe(200)
  })

  it('le fisheye d’avant reste un fisheye', () => {
    expect(parcDeDepart({ focale: '15', ouverture: '2.8', fisheye: true }, 'fe').objectifs[0]?.typeObjectif).toBe('FISHEYE')
  })

  it('un parc enregistré vide se reconstruit depuis le réglage', () => {
    const { objectifs, objectifId } = parcDeDepart({ objectifs: [], focale: '180', ouverture: '2.8', fisheye: false }, 'x')
    expect(objectifs.map((o) => [o.focaleMinMm, o.ouvertureGrandAngleN])).toEqual([[180, 2.8]])
    expect(objectifId).toBe('x')
  })

  it('un objectif monté disparu cède la place au premier du parc', () => {
    expect(parcDeDepart({ objectifs: [ZOOM, FIXE], objectifId: 'perdu', focale: '35', ouverture: '8', fisheye: false }, 'x').objectifId).toBe(ZOOM.id)
  })

  it('une optique de départ illisible ne fait pas d’objectif', () => {
    expect(parcDeDepart({ focale: '', ouverture: '2.8', fisheye: false }, 'x').objectifs).toEqual([])
  })
})
