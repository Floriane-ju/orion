/**
 * T-0339 — §3.5 : la rotation suggérée revient à l'écran, et un clic l'applique.
 *
 * Elle avait disparu avec le tiroir des lectures, sans que rien ne s'en aperçoive : ce test
 * rend le bouton de la fiche. La cible est forgée au centre de la visée — ni sa position ni sa
 * taille ne sont des valeurs du ciel, seule compte l'allure allongée qui appelle un angle.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AlignementCible } from '../src/ui/BoutonVisee.tsx'
import {
  etatScene,
  majVue,
  minuteAffichee,
  reinitialiseScene,
  MS_PAR_MINUTE,
} from '../src/ui/scene-etat.ts'
import { cielInstantane } from '../src/core/horloges.ts'
import { coordonneesHorizon } from '../src/core/cibles-liste.ts'
import { segmentsVisee } from '../src/ui/scene-lecture.ts'
import { fovDeg } from '../src/core/optics.ts'
import { BOITIER_REFERENCE, capteurEffectif } from '../src/data/equipment.ts'
import { K } from '../src/registry/constants.ts'
import type { ProfilCadre } from '../src/core/cadre.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import type { Site } from '../src/core/ephem.ts'

const SITE: Site = { latitudeDeg: 45, longitudeDeg: 6, altitudeM: 0 }
const FOCALE_MM = 120

function profil(): ProfilCadre {
  const capteur = capteurEffectif(BOITIER_REFERENCE, 'FULL_FRAME')
  return {
    libelle: 'FULL_FRAME',
    fovLDeg: fovDeg(capteur.capteurLMm, FOCALE_MM).value,
    fovHDeg: fovDeg(capteur.capteurHMm, FOCALE_MM).value,
    echApx: (K('RADIAN_EN_ARCSEC') * capteur.pitchUm) / (FOCALE_MM * 1000),
    capteurHMm: capteur.capteurHMm,
    modeObjectif: 'MODE_CADRE',
    tPoseS: 120,
  }
}

/** Un objet allongé posé exactement au centre de la visée courante. */
function objetAuCentre(posAngDeg: number | null): ObjetCielProfond {
  const matrice = cielInstantane(SITE, new Date(minuteAffichee(etatScene()) * MS_PAR_MINUTE)).matrice
  // La visée elle-même : la phrase de la barre haute en donne l'AD et la δ.
  const [ad, dec] = segmentsVisee(etatScene().vue, matrice)
  return {
    designation: 'FORGE',
    nomsCommuns: '',
    adDeg: ad!.valeurDeg,
    decDeg: dec!.valeurDeg,
    type: 'GALAXIE',
    majAxArcmin: 90,
    minAxArcmin: 30,
    posAngDeg,
    vMag: 8,
    bMag: null,
    surfBr: null,
  }
}

describe('T-0339 — la rotation suggérée se rend et s’applique', () => {
  beforeEach(() => {
    reinitialiseScene()
    majVue({ hauteurDeg: 40, azimutDeg: 180, fovDeg: 30 })
  })

  it('offre le bouton quand une cible allongée est dans le cadre', () => {
    const objet = objetAuCentre(30)
    // Le cadre vise bien l'objet : sa direction est celle de la visée.
    const { hauteurDeg } = coordonneesHorizon(
      objet,
      cielInstantane(SITE, new Date(minuteAffichee(etatScene()) * MS_PAR_MINUTE)).matrice,
    )
    expect(hauteurDeg).toBeGreaterThan(0)
    const html = renderToStaticMarkup(<AlignementCible objet={objet} site={SITE} profil={profil()} />)
    expect(html).toContain('rotate_right')
    expect(html).toMatch(/Tournez de \d+°/)
  })

  it('ne propose rien sans angle de position, ni sans matériel', () => {
    const sansAngle = renderToStaticMarkup(
      <AlignementCible objet={objetAuCentre(null)} site={SITE} profil={profil()} />,
    )
    expect(sansAngle).toBe('')
    const sansProfil = renderToStaticMarkup(
      <AlignementCible objet={objetAuCentre(30)} site={SITE} profil={undefined} />,
    )
    expect(sansProfil).toBe('')
  })
})
