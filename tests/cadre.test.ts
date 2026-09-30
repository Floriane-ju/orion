/**
 * §3.5 — Superposition du cadre matériel.
 *
 * Le critère qui compte est géométrique : à grand champ, les bords du cadre ne sont PAS des
 * droites dans le planétarium. Un rectangle à côtés droits mentirait sur ce que l'objectif
 * capture, et le cadrage est justement ce que cette couche sert à décider.
 */

import { describe, expect, it } from 'vitest'
import {
  angleGrandAxeDansCadre,
  cibleDominante,
  contourCadreJ2000,
  rotationSuggeree,
  type Cadre,
  type ProfilCadre,
} from '../src/core/cadre.ts'
import { ficheCadrage } from '../src/core/cadrage.ts'
import { vuePlanetarium } from '../src/ui/scene-etat.ts'
import { fovDeg } from '../src/core/optics.ts'
import { BOITIER_REFERENCE, capteurEffectif } from '../src/data/equipment.ts'
import { IDENTITE, separationDeg, versSpherique, versVecteur } from '../src/core/mat3.ts'
import { projecteur, type Vue } from '../src/core/projection.ts'
import type { ObjetCielProfond } from '../src/data/deepsky.ts'
import { K } from '../src/registry/constants.ts'

const FOCALE_REFERENCE_MM = 120

function profil(mode: 'FULL_FRAME' | 'APSC_CROP'): ProfilCadre {
  const capteur = capteurEffectif(BOITIER_REFERENCE, mode)
  return {
    libelle: mode,
    fovLDeg: fovDeg(capteur.capteurLMm, FOCALE_REFERENCE_MM).value,
    fovHDeg: fovDeg(capteur.capteurHMm, FOCALE_REFERENCE_MM).value,
    echApx: (K('RADIAN_EN_ARCSEC') * capteur.pitchUm) / (FOCALE_REFERENCE_MM * 1000),
    capteurHMm: capteur.capteurHMm,
    modeObjectif: 'MODE_CADRE',
    tPoseS: 120,
  }
}

const CADRE: Cadre = {
  profil: profil('FULL_FRAME'),
  azimutDeg: 180,
  hauteurDeg: 40,
  rotationDeg: 0,
}

function vue(mode: Vue['mode'], fov: number): Vue {
  return {
    mode,
    fovDeg: fov,
    largeurPx: 1920,
    hauteurPx: 1080,
    azimutDeg: 180,
    hauteurDeg: 40,
    rotationDeg: 0,
  }
}

describe('cadre projeté §3.5', () => {
  it('donne 17,0° × 11,4° pour le profil de référence 120 mm plein format', () => {
    const reference = profil('FULL_FRAME')
    expect(reference.fovLDeg).toBeCloseTo(17.0, 1)
    expect(reference.fovHDeg).toBeCloseTo(11.4, 1)
  })

  it('rend le cadre APS-C environ 1,5 fois plus petit, à échantillonnage identique', () => {
    const plein = profil('FULL_FRAME')
    const apsc = profil('APSC_CROP')
    expect(plein.fovLDeg / apsc.fovLDeg).toBeCloseTo(1.5, 1)
    expect(plein.fovHDeg / apsc.fovHDeg).toBeCloseTo(1.5, 1)
    // Le recadrage ne change ni le pitch ni la focale : la résolution est la même (§5.1).
    expect(apsc.echApx).toBeCloseTo(plein.echApx, 9)
  })

  it('place le contour aux dimensions angulaires annoncées', () => {
    const contour = contourCadreJ2000(CADRE, IDENTITE)
    const pas = K('SUBDIVISION_CADRE')
    const centre = versVecteur(CADRE.azimutDeg, CADRE.hauteurDeg)

    // Les bords sont parcourus dans l'ordre bas, droite, haut, gauche : le milieu de
    // chacun est à la demi-dimension du champ, exactement.
    expect(separationDeg(contour[pas / 2]!, centre)).toBeCloseTo(CADRE.profil.fovHDeg / 2, 6)
    expect(separationDeg(contour[pas + pas / 2]!, centre)).toBeCloseTo(
      CADRE.profil.fovLDeg / 2,
      6,
    )
    expect(separationDeg(contour[2 * pas + pas / 2]!, centre)).toBeCloseTo(
      CADRE.profil.fovHDeg / 2,
      6,
    )

    // Les coins sont plus loin que les milieux de bord : le cadre n'est pas un disque, et
    // sa diagonale n'est pas la somme des demi-côtés.
    const diagonale = separationDeg(contour[0]!, centre)
    expect(diagonale).toBeGreaterThan(CADRE.profil.fovLDeg / 2)
    expect(diagonale).toBeLessThan(
      Math.hypot(CADRE.profil.fovLDeg, CADRE.profil.fovHDeg) / 2 + 0.1,
    )
  })

  it('courbe les bords d’un cadre de 130° de diagonale en vue stéréographique', () => {
    // Objectif de 10 mm sur plein format : c'est le cas limite du PRD.
    const grandAngle: Cadre = {
      ...CADRE,
      profil: {
        ...profil('FULL_FRAME'),
        fovLDeg: fovDeg(BOITIER_REFERENCE.capteurLMm, 10).value,
        fovHDeg: fovDeg(BOITIER_REFERENCE.capteurHMm, 10).value,
      },
    }
    const diagonale = Math.hypot(grandAngle.profil.fovLDeg, grandAngle.profil.fovHDeg)
    expect(diagonale).toBeGreaterThan(120)

    const proj = projecteur(vue('MODE_PLANETARIUM', 180), IDENTITE)
    const contour = contourCadreJ2000(grandAngle, IDENTITE)
      .map((v) => proj.projette(v))
      .filter((p) => p !== null)
    expect(contour.length).toBeGreaterThan(K('SUBDIVISION_CADRE'))

    // Un bord est une polyligne : son point médian s'écarte nettement de la corde qui
    // joindrait ses extrémités. Ce serait zéro si le bord était une droite.
    const pas = K('SUBDIVISION_CADRE')
    const debut = contour[0]!
    const fin = contour[pas]!
    const milieu = contour[Math.floor(pas / 2)]!
    const ecart = Math.hypot(
      milieu.xPx - (debut.xPx + fin.xPx) / 2,
      milieu.yPx - (debut.yPx + fin.yPx) / 2,
    )
    expect(ecart).toBeGreaterThan(10)
  })

  it('trace un bord quasi droit à petit champ : la courbure suit la projection', () => {
    const proj = projecteur(vue('MODE_PLANETARIUM', 30), IDENTITE)
    const contour = contourCadreJ2000(CADRE, IDENTITE)
      .map((v) => proj.projette(v))
      .filter((p) => p !== null)
    const pas = K('SUBDIVISION_CADRE')
    const debut = contour[0]!
    const fin = contour[pas]!
    const milieu = contour[Math.floor(pas / 2)]!
    const ecart = Math.hypot(
      milieu.xPx - (debut.xPx + fin.xPx) / 2,
      milieu.yPx - (debut.yPx + fin.yPx) / 2,
    )
    expect(ecart).toBeLessThan(20)
  })
})

describe('cible dans le cadre §3.5, §6.2', () => {
  const centre = versSpherique(
    projecteur(vue('MODE_CADRE', 17), IDENTITE).inverse(1920 / 2, 1080 / 2),
  )

  function objet(
    nom: string,
    dLonDeg: number,
    majAxArcmin: number,
    posAngDeg: number | null,
    minAxArcmin: number | null = majAxArcmin / 3,
  ): ObjetCielProfond {
    return {
      designation: nom,
      nomsCommuns: '',
      adDeg: centre.longitudeDeg + dLonDeg,
      decDeg: centre.latitudeDeg,
      type: 'GALAXIE',
      majAxArcmin,
      minAxArcmin,
      posAngDeg,
      vMag: 8,
      bMag: null,
      surfBr: null,
    }
  }

  it('retient l’objet le plus étendu du cadre, et ignore ce qui en sort', () => {
    const objets = [objet('petite', 0.5, 20, 30), objet('grande', -0.5, 90, 30), objet('dehors', 40, 200, 30)]
    const dominante = cibleDominante(objets, CADRE, IDENTITE)
    expect(dominante).not.toBeNull()
    expect(dominante!.objet.designation).toBe('grande')
    expect(dominante!.tailleDeg).toBeCloseTo(90 / 60, 6)
  })

  it('ne suggère aucun angle sans angle de position, et nomme la donnée absente', () => {
    const dominante = cibleDominante([objet('sans angle', 0, 60, null)], CADRE, IDENTITE)
    expect(dominante).not.toBeNull()
    const suggestion = rotationSuggeree(dominante!, CADRE, IDENTITE)
    expect(suggestion.angleDeg).toBeNull()
    // §6.2 — l'absence de donnée est nommée : un silence se lirait « déjà bien cadré ».
    expect(suggestion.message).toMatch(/orientation est inconnue/)
  })

  it('ne suggère aucun angle sous le seuil de rapport d’axes, et le dit', () => {
    // Rapport 1,2 : sous RAPPORT_AXES_ORIENTATION, tourner le boîtier ne change rien.
    const ronde = objet('ronde', 0, 60, 23, 50)
    const dominante = cibleDominante([ronde], CADRE, IDENTITE)
    const suggestion = rotationSuggeree(dominante!, CADRE, IDENTITE)
    expect(suggestion.angleDeg).toBeNull()
    expect(suggestion.message).toMatch(/presque ronde/)
  })

  it('nomme le petit axe manquant plutôt que de supposer la cible allongée', () => {
    const dominante = cibleDominante([objet('sans petit axe', 0, 60, 23, null)], CADRE, IDENTITE)
    const suggestion = rotationSuggeree(dominante!, CADRE, IDENTITE)
    expect(suggestion.angleDeg).toBeNull()
    expect(suggestion.message).toMatch(/Forme de .* inconnue/)
  })

  it('propose un angle borné à un demi-tour, appliqué d’un clic', () => {
    const dominante = cibleDominante([objet('allongée', 0, 60, 23)], CADRE, IDENTITE)
    const suggestion = rotationSuggeree(dominante!, CADRE, IDENTITE)
    expect(suggestion.angleDeg).not.toBeNull()
    expect(suggestion.angleDeg!).toBeGreaterThanOrEqual(0)
    expect(suggestion.angleDeg!).toBeLessThan(180)
    expect(suggestion.message).toMatch(/longueur du capteur/)
    expect(suggestion.message).toMatch(/à cette heure/)
  })

  it('amène le grand axe sur la grande dimension du capteur quand l’angle est appliqué', () => {
    const cible = cibleDominante([objet('allongée', 0, 60, 23)], CADRE, IDENTITE)!
    const suggestion = rotationSuggeree(cible, CADRE, IDENTITE)
    const applique: Cadre = { ...CADRE, rotationDeg: suggestion.angleDeg! }
    // Le critère du PRD, vérifié géométriquement : après application, le grand axe est
    // aligné sur l'axe u du capteur — à un demi-tour près, un axe n'ayant pas de sens.
    const phi = angleGrandAxeDansCadre(cible, applique, IDENTITE)!
    expect(Math.min(phi, 180 - phi)).toBeCloseTo(0, 6)
  })
})

describe('le cadre tourne, la vue non — T-0084', () => {
  it('déplace le contour projeté quand le boîtier tourne', () => {
    // La MÊME vue projette les deux contours : c'est le cadre qui change, pas le ciel.
    const proj = projecteur(vue('MODE_PLANETARIUM', 60), IDENTITE)
    const points = (rotationDeg: number) =>
      contourCadreJ2000({ ...CADRE, rotationDeg }, IDENTITE)
        .map((v) => proj.projette(v))
        .filter((p) => p !== null)

    const droit = points(0)
    const tourne = points(45)
    // Le coin bas-gauche s'est franchement déplacé : le cadre paraît tourné à l'écran.
    const deplacement = Math.hypot(
      tourne[0]!.xPx - droit[0]!.xPx,
      tourne[0]!.yPx - droit[0]!.yPx,
    )
    expect(deplacement).toBeGreaterThan(50)
    // Un demi-tour ramène le contour sur lui-même : le rectangle a cette symétrie.
    const demiTour = points(180)
    const pas = K('SUBDIVISION_CADRE')
    const oppose = demiTour[2 * pas]!
    expect(oppose.xPx).toBeCloseTo(droit[0]!.xPx, 6)
    expect(oppose.yPx).toBeCloseTo(droit[0]!.yPx, 6)
  })

  it('garde le zénith en haut : la vue de la scène ne roule jamais', () => {
    // §3.3 — le mode ne change que R(θ). Le roulis appartient au boîtier, pas à la vue :
    // sans cela, tourner le cadre ferait tourner tout le ciel et le contour resterait fixe.
    const sansRoulis = vuePlanetarium({
      azimutDeg: 180,
      hauteurDeg: 40,
      rotationCadreDeg: 137,
      fovDeg: 60,
      mode: 'MODE_PLANETARIUM',
      largeurPx: 1920,
      hauteurPx: 1080,
      decalageCentreXPx: 0,
    })
    expect(sansRoulis.rotationDeg).toBe(0)
  })
})

describe('remplissage orienté §6.2 après rotation du boîtier §3.5', () => {
  const PROFIL = profil('FULL_FRAME')
  const entree = (angleGrandAxeDeg: number | null) => ({
    fovHDeg: PROFIL.fovHDeg,
    fovLDeg: PROFIL.fovLDeg,
    echApx: PROFIL.echApx,
    capteurHMm: PROFIL.capteurHMm,
    // Cible franchement allongée : c'est le seul cas où l'orientation change le verdict.
    tailleMajArcmin: 4.5 * 60,
    tailleMinArcmin: 1.0 * 60,
    angleGrandAxeDeg,
  })

  it('retombe sur la petite dimension du champ sans orientation connue', () => {
    const fiche = ficheCadrage(entree(null))
    expect(fiche.remplissage.value).toBeCloseTo(4.5 / PROFIL.fovHDeg, 9)
    expect(fiche.remplissage.formula.id).toBe('REMPLISSAGE')
  })

  it('grand axe sur la petite dimension : identique à la forme calibrée de la table', () => {
    const fiche = ficheCadrage(entree(90))
    expect(fiche.remplissage.value).toBeCloseTo(4.5 / PROFIL.fovHDeg, 9)
    expect(fiche.remplissage.formula.id).toBe('REMPLISSAGE_ORIENTE')
  })

  it('tourner de 90° change le verdict de cadrage, pas seulement l’affichage', () => {
    const serre = ficheCadrage(entree(90))
    const large = ficheCadrage(entree(0))
    expect(large.remplissage.value).toBeLessThan(serre.remplissage.value)
    expect(serre.verdict).toBe('CADRAGE_OPTIMAL')
    expect(large.verdict).toBe('CADRAGE_LARGE')
  })

  it('laisse une cible ronde indifférente à l’orientation', () => {
    const ronde = {
      ...entree(0),
      tailleMajArcmin: 3 * 60,
      tailleMinArcmin: 3 * 60,
    }
    const droit = ficheCadrage(ronde).remplissage.value
    const tourne = ficheCadrage({ ...ronde, angleGrandAxeDeg: 45 }).remplissage.value
    expect(tourne).toBeCloseTo(droit, 9)
  })
})

describe('cadre d’un fisheye §3.5 (T-0219)', () => {
  const CAPTEUR = capteurEffectif(BOITIER_REFERENCE, 'FULL_FRAME')
  const FOCALE_FISHEYE_MM = 8
  const fisheye: Cadre = {
    profil: {
      ...profil('FULL_FRAME'),
      fovLDeg: fovDeg(CAPTEUR.capteurLMm, FOCALE_FISHEYE_MM, 'FISHEYE').value,
      fovHDeg: fovDeg(CAPTEUR.capteurHMm, FOCALE_FISHEYE_MM, 'FISHEYE').value,
      modeObjectif: 'MODE_FISHEYE',
    },
    // Visée en (1, 0, 0) : la séparation au centre se lit sans la machinerie testée.
    azimutDeg: 0,
    hauteurDeg: 0,
    rotationDeg: 0,
  }
  const CENTRE = versVecteur(0, 0)

  it('place le milieu des bords à la moitié du champ, en équidistante', () => {
    const pas = Math.round(K('SUBDIVISION_CADRE'))
    const contour = contourCadreJ2000(fisheye, IDENTITE)
    // Arête 1 : de (uMax, −vMax) à (uMax, vMax) ; son milieu est sur l'axe horizontal.
    const milieuDroit = contour[pas + pas / 2]!
    const milieuHaut = contour[2 * pas + pas / 2]!
    expect(separationDeg(CENTRE, milieuDroit)).toBeCloseTo(fisheye.profil.fovLDeg / 2, 6)
    expect(separationDeg(CENTRE, milieuHaut)).toBeCloseTo(fisheye.profil.fovHDeg / 2, 6)
  })

  it('reste fini à 180° de champ, là où la gnomonique divergeait', () => {
    expect(fisheye.profil.fovLDeg).toBe(K('CHAMP_MAX_FISHEYE_DEG'))
    const contour = contourCadreJ2000(fisheye, IDENTITE)
    for (const p of contour) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true)
    }
  })

  it('tient une cible dans le cadre jusqu’au bord de l’équidistante, pas au-delà', () => {
    const cible = (designation: string, adDeg: number): ObjetCielProfond => ({
      designation,
      nomsCommuns: '',
      adDeg,
      decDeg: 0,
      type: 'GALAXIE',
      majAxArcmin: 60,
      minAxArcmin: 20,
      posAngDeg: 0,
      vMag: 8,
      bMag: null,
      surfBr: null,
    })
    // Demi-largeur de 90° : à 85° dans la largeur la cible est cadrée, à 95° elle ne l'est pas.
    const demi = fisheye.profil.fovLDeg / 2
    expect(cibleDominante([cible('dedans', demi - 5)], fisheye, IDENTITE)).not.toBeNull()
    expect(cibleDominante([cible('dehors', demi + 5)], fisheye, IDENTITE)).toBeNull()
  })
})
