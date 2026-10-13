/**
 * T-0408 — sous un zoom, la fiche s'ouvre à la focale optimale de la cible, la dit, et lit
 * son cadrage à cette focale. Hors zoom, rien ne change.
 *
 * La focale est un état LOCAL de la fiche : aucune saisie du matériel n'est reçue, il n'y a
 * donc rien qu'elle puisse modifier — c'est la construction qui le garantit, pas un clic.
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
import { zoomSur } from '../src/ui/zoom-calcul.ts'
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

function aFocale(focaleMm: number, ouvertureN: number) {
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

const BASE = aFocale(ZOOM.focaleMinMm, N)

function rendu(objectif: Objectif | null): string {
  const zoom = zoomSur({
    objectif,
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
      objectif: ZOOM,
      base: BASE.contexte,
      focaleMm: ZOOM.focaleMinMm,
      ouvertureN: N,
      evalue: aFocale,
    })!
    const optimale = zoom.focaleDe(CIBLE)!
    expect(optimale).toBeGreaterThan(ZOOM.focaleMinMm)
    expect(optimale).toBeLessThan(ZOOM.focaleMaxMm)

    const html = rendu(ZOOM)
    expect(html).toContain(`aria-valuenow="${optimale}"`)
    const optique = zoom.aFocale(optimale)!.fiche.optique
    const attendu = ficheCadrage({
      fovHDeg: optique.fovHDeg.value,
      echApx: optique.echApx.value,
      capteurHMm: CAPTEUR.capteurHMm,
      tailleMajArcmin: CIBLE.majAxArcmin!,
      tailleMinArcmin: CIBLE.minAxArcmin,
      posAngDeg: CIBLE.posAngDeg,
    }).remplissage.value
    expect(html).toContain(pourcentage(attendu))
  })

  it('n’existe pas hors zoom', () => {
    expect(rendu(null)).not.toContain('Zoom</h2>')
    expect(rendu({ ...ZOOM, focaleMaxMm: ZOOM.focaleMinMm })).not.toContain('Zoom</h2>')
  })
})
