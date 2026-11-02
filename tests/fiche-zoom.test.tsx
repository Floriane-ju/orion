/**
 * T-0408 — sous un zoom, la fiche s'ouvre à la focale optimale de la cible, la dit, et lit
 * son cadrage à cette focale. Hors zoom, rien ne change.
 *
 * La focale est un ESSAI de la fiche : aucune saisie du matériel n'est reçue, il n'y a donc
 * rien qu'elle puisse modifier — c'est la construction qui le garantit, pas un clic. Seul le
 * cadre de la cible, dans la scène, la suit.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import { profilOptique } from '../src/core/optics.ts'
import type { Objectif } from '../src/core/objectif.ts'
import type { ContexteSession } from '../src/core/session-types.ts'
import {
  BOITIER_REFERENCE,
  capteurEffectif,
  isoRecommande,
  pointZeroSysteme,
} from '../src/data/equipment.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { ficheCadrage } from '../src/core/cadrage.ts'
import { pourcentage } from '../src/registry/ecriture.ts'
import type { ContexteFiche } from '../src/ui/fiche-cible-calcul.ts'
import { FicheSousZoom } from '../src/ui/FicheZoom.tsx'
import { profilCible, profilsScene, zoomSur } from '../src/ui/zoom-calcul.ts'
import type { ProfilCadre } from '../src/core/cadre.ts'
import { SITE_REFERENCE as SITE } from './fixtures.ts'

const CAPTEUR = capteurEffectif(BOITIER_REFERENCE, 'FULL_FRAME')
const ZERO = pointZeroSysteme(BOITIER_REFERENCE)
const ISO = isoRecommande(BOITIER_REFERENCE)
const N = 5.6
const NUIT = fenetreNocturne(SITE, new Date('2026-08-14T12:00:00Z'))

const ZOOM: Objectif = {
  id: 'zoom',
  nom: '100-400',
  focaleMinMm: 100,
  focaleMaxMm: 400,
  ouvertureGrandAngleN: N,
  ouvertureTeleN: N,
  typeObjectif: 'RECTILINEAIRE',
}

const CIBLE: ObjetCielProfond = {
  designation: 'CIBLE',
  nomsCommuns: '',
  adDeg: 314.75,
  decDeg: 44.52,
  type: 'EMISSION',
  // Cadrée à 80 % quelque part au milieu de la plage du 100-400 sur plein format.
  majAxArcmin: 400,
  minAxArcmin: 300,
  posAngDeg: null,
  vMag: 4,
  bMag: null,
  surfBr: null,
}

function aFocale(_objectif: Objectif, focaleMm: number, ouvertureN: number) {
  const optique = profilOptique({ focaleMm, ouvertureN, ...CAPTEUR })
  const tMaxS = 200
  const fiche: ContexteFiche = {
    optique,
    capteurHMm: CAPTEUR.capteurHMm,
    pitchUm: CAPTEUR.pitchUm,
    ouvertureN,
    boitier: BOITIER_REFERENCE,
    zeroSysteme: ZERO,
    iso: ISO,
    sbCiel: 20.95,
    mLimOeil: 6.05,
    tMaxS,
    bortle: 4,
    suiviActif: true,
    focaleMm,
  }
  const contexte: ContexteSession = {
    site: SITE,
    nuit: NUIT,
    fenetreUtile: fenetreUtile(SITE, NUIT),
    masque: masquePlat(),
    focaleMm,
    fovHDeg: optique.fovHDeg.value,
    echApx: optique.echApx.value,
    dMm: optique.dMm.value,
    capteurHMm: CAPTEUR.capteurHMm,
    pitchUm: CAPTEUR.pitchUm,
    ouvertureN,
    zpSys: ZERO.valeur,
    zpEstime: ZERO.estime,
    readNoiseE: ISO.readNoiseE,
    tailleRawMo: BOITIER_REFERENCE.tailleRawMo,
    isoSession: ISO.iso,
    sbCielNoir: 20.95,
    mLimOeil: 6.05,
    tMaxS,
    domaineCpFerme: null,
    snrCible: 10,
    typeMonture: 'TRACKER',
  }
  return { fiche, contexte }
}

const BASE = aFocale(ZOOM, ZOOM.focaleMinMm, N)

function rendu(objectif: Objectif | null, parc: readonly Objectif[] = objectif === null ? [] : [objectif]): string {
  const zoom = zoomSur({
    monte: objectif,
    parc,
    base: BASE.contexte,
    focaleMm: ZOOM.focaleMinMm,
    ouvertureN: N,
    evalue: aFocale,
  })
  return renderToStaticMarkup(
    <FicheSousZoom
      zoom={zoom}
      {...BASE.fiche}
      objet={CIBLE}
      site={SITE}
      contexteSession={BASE.contexte}
    />,
  )
}

describe('T-0408 — la bague de zoom de la fiche', () => {
  it('s’ouvre sur la focale optimale et y lit le cadrage', () => {
    const zoom = zoomSur({
      monte: ZOOM,
      parc: [ZOOM],
      base: BASE.contexte,
      focaleMm: ZOOM.focaleMinMm,
      ouvertureN: N,
      evalue: aFocale,
    })!
    const optimale = zoom.choixDe(CIBLE)!.focaleMm
    expect(optimale).toBeGreaterThan(ZOOM.focaleMinMm)
    expect(optimale).toBeLessThan(ZOOM.focaleMaxMm)

    const html = rendu(ZOOM)
    expect(html).toContain(`aria-valuenow="${optimale}"`)
    const optique = zoom.aFocale(ZOOM, optimale)!.fiche.optique
    const attendu = ficheCadrage({
      fovHDeg: optique.fovHDeg.value,
      echApx: optique.echApx.value,
      capteurHMm: CAPTEUR.capteurHMm,
      tailleMajArcmin: CIBLE.majAxArcmin!,
      tailleMinArcmin: CIBLE.minAxArcmin,
      posAngDeg: CIBLE.posAngDeg,
    }).remplissage.value
    expect(html).toContain(`${optimale} mm`)
    expect(html).toContain(`${pourcentage(attendu)} du cadre`)
    expect(html).toContain('optimale')
    expect(html).not.toContain('Revenir')
  })

  it('n’existe pas hors zoom', () => {
    expect(rendu(null)).not.toContain('Zoom</h2>')
    expect(rendu({ ...ZOOM, focaleMaxMm: ZOOM.focaleMinMm })).not.toContain('Zoom</h2>')
  })
})

describe('sous un zoom, les cadres de la scène', () => {
  const zoom = zoomSur({
    monte: ZOOM,
    parc: [ZOOM],
    base: BASE.contexte,
    focaleMm: ZOOM.focaleMinMm,
    ouvertureN: N,
    evalue: aFocale,
  })!
  const MODELE: ProfilCadre = {
    libelle: 'réglage',
    fovLDeg: BASE.fiche.optique.fovLDeg.value,
    fovHDeg: BASE.fiche.optique.fovHDeg.value,
    modeObjectif: 'MODE_CADRE',
    echApx: BASE.fiche.optique.echApx.value,
    capteurHMm: CAPTEUR.capteurHMm,
    tPoseS: BASE.fiche.tMaxS,
  }
  const champA = (f: number) => zoom.aFocale(ZOOM, f)!.fiche.optique.fovHDeg.value

  it('sont le réglage, puis les deux bouts de la bague, grand-angle d’abord', () => {
    expect(profilsScene(zoom, [MODELE]).map((p) => p.fovHDeg)).toEqual([
      MODELE.fovHDeg,
      champA(ZOOM.focaleMinMm),
      champA(ZOOM.focaleMaxMm),
    ])
    expect(profilsScene(null, [MODELE])).toEqual([MODELE])
  })

  it('posent celui de la cible à sa focale optimale, ou à celle essayée sur SA fiche', () => {
    const optimale = zoom.choixDe(CIBLE)!.focaleMm
    expect(profilCible(zoom, CIBLE, null, [MODELE])?.fovHDeg).toBe(champA(optimale))
    const essai = { designation: CIBLE.designation, objectifId: ZOOM.id, focaleMm: ZOOM.focaleMaxMm }
    expect(profilCible(zoom, CIBLE, essai, [MODELE])?.fovHDeg).toBe(champA(ZOOM.focaleMaxMm))
    const ailleurs = { designation: 'AUTRE', objectifId: ZOOM.id, focaleMm: ZOOM.focaleMaxMm }
    expect(profilCible(zoom, CIBLE, ailleurs, [MODELE])?.fovHDeg).toBe(champA(optimale))
    expect(profilCible(null, CIBLE, null, [MODELE])).toBeNull()
  })
})

describe('T-0436 — la fiche choisit l’objectif du parc', () => {
  // Un fixe court et un fixe long : la cible (400′) se cadre au long, aucun zoom au parc.
  const COURT: Objectif = { ...ZOOM, id: 'court', nom: '50', focaleMinMm: 50, focaleMaxMm: 50 }
  const LONG: Objectif = { ...ZOOM, id: 'long', nom: '200', focaleMinMm: 200, focaleMaxMm: 200 }
  const zoom = zoomSur({
    monte: COURT,
    parc: [COURT, LONG],
    base: BASE.contexte,
    focaleMm: COURT.focaleMinMm,
    ouvertureN: N,
    evalue: aFocale,
  })!

  it('deux fixes au parc suffisent à choisir, un seul non', () => {
    expect(zoom).not.toBeNull()
    expect(zoomSur({ monte: COURT, parc: [COURT], base: BASE.contexte, focaleMm: 50, ouvertureN: N, evalue: aFocale })).toBeNull()
  })

  it('s’ouvre sur l’objectif optimal, le nomme, sans bague sur un fixe', () => {
    expect(zoom.choixDe(CIBLE)).toEqual({ objectif: LONG, focaleMm: LONG.focaleMinMm })
    const html = rendu(COURT, [COURT, LONG])
    expect(html).toContain('Optique</h2>')
    expect(html).toMatch(/<option value="long" selected="">200 \(optimal\)<\/option>/)
    expect(html).not.toContain('aria-valuenow')
  })

  it('un essai sur un autre objectif ne vaut que pour SA cible, et rien ne touche le monté', () => {
    const MODELE: ProfilCadre = {
      libelle: 'réglage',
      fovLDeg: BASE.fiche.optique.fovLDeg.value,
      fovHDeg: BASE.fiche.optique.fovHDeg.value,
      modeObjectif: 'MODE_CADRE',
      echApx: BASE.fiche.optique.echApx.value,
      capteurHMm: CAPTEUR.capteurHMm,
      tPoseS: BASE.fiche.tMaxS,
    }
    const champ = (o: Objectif) => zoom.aFocale(o, o.focaleMinMm)!.fiche.optique.fovHDeg.value
    const essai = { designation: CIBLE.designation, objectifId: COURT.id, focaleMm: COURT.focaleMinMm }
    expect(profilCible(zoom, CIBLE, essai, [MODELE])?.fovHDeg).toBe(champ(COURT))
    expect(profilCible(zoom, CIBLE, null, [MODELE])?.fovHDeg).toBe(champ(LONG))
    // Le monté est un fixe : la scène ne peint que le réglage.
    expect(profilsScene(zoom, [MODELE])).toEqual([MODELE])
    expect(zoom.monte).toBe(COURT)
  })
})
