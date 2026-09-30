/**
 * §3 + §9 — un seul pointage pour les deux vues.
 *
 * Ce que ce fichier garde : le magasin de scène est bien partagé, et une visée déplacée
 * ailleurs se lit dans le grand champ. Tant que chaque vue tenait son propre état, cadrer
 * dans l'une ne cadrait pas dans l'autre.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { K } from '../src/registry/constants.ts'
import { fovMaxSelonMode } from '../src/core/projection.ts'
import { masquePlat } from '../src/core/site.ts'
import { pointZeroSysteme } from '../src/data/equipment.ts'
import { PanneauFile } from '../src/ui/PanneauFile.tsx'
import { RailVue } from '../src/ui/RailVue.tsx'
import { modeObjectif } from '../src/core/optics.ts'
import {
  afficheInstant,
  etatScene,
  instant,
  majTemps,
  majVue,
  decalageCentreScene,
  BORDURES_SCENE,
  masqueParcours,
  montreParcours,
  reinitialiseScene,
  vaA,
  type EtatScene,
  type ParcoursScene,
} from '../src/ui/scene-etat.ts'
import { epoqueAffichee } from '../src/App.tsx'
import { SITE_REFERENCE as SITE } from './fixtures.ts'


const MATERIEL = {
  site: SITE,
  focaleMm: 10,
  ouvertureN: 2.8,
  pitchUm: 5.12,
  capteurLMm: 35.9,
  capteurHMm: 23.9,
  fovLDeg: 121.7,
  fovHDeg: 100.2,
  echApx: 105.6,
  tailleRawMo: 33,
  profondeur: {
    tPoseS: 25,
    dMm: 10 / 2.8,
    zpSys: K('ZP_SYS_GENERIQUE'),
    eCielPxS: 1.68,
    readNoiseE: 1.5,
    zpEstime: true,
  },
  zeroSysteme: pointZeroSysteme(null),
  modeObjectif: 'MODE_CADRE',
} as const

/** La ligne d'état du grand champ porte la visée en ascension droite et déclinaison. */
/**
 * T-0154 — le panneau ne réécrit plus la visée : elle se lit au centre de la barre basse. Ce qui
 * atteste qu'il suit le pointage, ce sont ses nombres — pose maximale du cadre, longueur des arcs,
 * position du pôle — donc c'est le rendu entier qui se compare, pas une phrase.
 */
function cadrageAffiche(): string {
  return renderToStaticMarkup(createElement(PanneauFile, MATERIEL))
}

describe('§3 — le magasin de scène', () => {
  beforeEach(() => {
    reinitialiseScene()
  })

  it('part du pointage de référence, celui des deux vues avant fusion', () => {
    expect(etatScene().vue.azimutDeg).toBe(180)
    expect(etatScene().vue.hauteurDeg).toBe(K('SEUIL_HAUTEUR_IMAGERIE_DEG'))
    expect(etatScene().vue.rotationCadreDeg).toBe(0)
    expect(etatScene().temps.modeTemps).toBe('MAINTENANT')
  })

  it('T-0239 — s’ouvre en grand champ, sous le plafond de sa projection', () => {
    const { fovDeg, mode } = etatScene().vue
    expect(fovDeg).toBe(K('FOV_INITIAL_DEG'))
    // L'état initial ne passe pas par majVue : rien d'autre ne le borne.
    expect(fovDeg).toBeLessThanOrEqual(fovMaxSelonMode(mode))
  })

  it('retouche sans muter : l’instantané précédent reste intact', () => {
    const avant = etatScene()
    majVue({ azimutDeg: 90 })
    expect(avant.vue.azimutDeg).toBe(180)
    expect(etatScene().vue.azimutDeg).toBe(90)
    // Le temps n'est pas touché par une retouche de vue : son identité doit survivre.
    expect(etatScene().temps).toBe(avant.temps)
  })

  it('accepte une retouche calculée à partir de l’état courant', () => {
    majVue((v) => ({ azimutDeg: v.azimutDeg + 30 }))
    expect(etatScene().vue.azimutDeg).toBe(210)
  })

  it('sépare le temps du pointage', () => {
    majTemps({ modeTemps: 'FIGE', facteur: 120 })
    expect(etatScene().temps.modeTemps).toBe('FIGE')
    expect(etatScene().temps.facteur).toBe(120)
    expect(etatScene().vue.azimutDeg).toBe(180)
  })

  it('va à un instant choisi et met le temps en pause', () => {
    // §3.2 — sans la pause, `MAINTENANT` resynchroniserait sur l'horloge système à l'image
    // suivante : l'instant choisi n'aurait vécu qu'une image.
    const choisi = Date.UTC(2026, 7, 21, 20, 41, 7)
    vaA(choisi)
    expect(instant.ms).toBe(choisi)
    expect(etatScene().temps.modeTemps).toBe('FIGE')
  })
})

describe('§9 — le grand champ suit la visée de la scène', () => {
  beforeEach(() => {
    reinitialiseScene()
  })

  it('change de cadrage quand le pointage est déplacé ailleurs', () => {
    const initial = cadrageAffiche()
    expect(initial).not.toBe('')
    majVue({ azimutDeg: 90, hauteurDeg: 70 })
    expect(cadrageAffiche()).not.toBe(initial)
  })
})

describe('§5.1 — le type d’objectif pilote la projection de la scène', () => {
  beforeEach(() => {
    reinitialiseScene()
  })

  it('associe une projection à chaque type d’objectif', () => {
    expect(modeObjectif('RECTILINEAIRE')).toBe('MODE_CADRE')
    expect(modeObjectif('FISHEYE')).toBe('MODE_FISHEYE')
  })

  it('n’offre à la scène que la projection de l’objectif déclaré', () => {
    // T-0213 — le choix de projection est porté par le rail de la vue avec le reste des
    // réglages de scène ; ce qu'il propose reste dicté par l'objectif déclaré au panneau
    // matériel. Une bascule : éteinte le planétarium, allumée la projection de l'objectif.
    majVue({ mode: modeObjectif('FISHEYE') })
    const html = renderToStaticMarkup(
      createElement(RailVue, {
        modeObjectif: modeObjectif('FISHEYE'),
        gaiaCharge: false,
        epoqueAnnee: 2026.6,
        masque: masquePlat(),
      }),
    )
    expect(html).toContain('Vue comme l’appareil — équidistante')
    // Un objectif fisheye ne produit pas de projection gnomonique : elle n'est pas proposée.
    expect(html).not.toContain('gnomonique')
  })
})

describe('T-0095 — le champ ne survit pas au passage en gnomonique', () => {
  beforeEach(() => {
    reinitialiseScene()
  })

  it('ramène le champ sous le plafond de la projection choisie', () => {
    majVue({ mode: 'MODE_PLANETARIUM', fovDeg: K('FOV_MAX_DEG') })
    expect(etatScene().vue.fovDeg).toBe(K('FOV_MAX_DEG'))
    // Le geste que le ticket décrit : on regardait tout le ciel, on passe à la projection de
    // l'objectif. Sans borne, l'échelle s'annule et le ciel s'effondre sur le pixel central.
    majVue({ mode: 'MODE_CADRE' })
    expect(etatScene().vue.fovDeg).toBe(K('FOV_MAX_GNOMONIQUE_DEG'))
    // Le retour en stéréographique ne rend pas le champ perdu : la borne descend, elle ne
    // remonte pas. Rouvrir le champ est un geste de zoom, pas un effet de bord du menu.
    majVue({ mode: 'MODE_PLANETARIUM' })
    expect(etatScene().vue.fovDeg).toBe(K('FOV_MAX_GNOMONIQUE_DEG'))
  })

  it('laisse le champ maximal aux projections qui ne divergent pas', () => {
    majVue({ mode: 'MODE_FISHEYE', fovDeg: K('FOV_MAX_DEG') })
    expect(etatScene().vue.fovDeg).toBe(K('FOV_MAX_DEG'))
  })

  it('borne aussi une écriture directe du champ, pas seulement le changement de projection', () => {
    majVue({ mode: 'MODE_CADRE' })
    majVue({ fovDeg: K('FOV_MAX_DEG') })
    expect(etatScene().vue.fovDeg).toBe(K('FOV_MAX_GNOMONIQUE_DEG'))
  })
})

describe('T-0056 — s’abonner à une tranche, pas au magasin entier', () => {
  beforeEach(() => {
    reinitialiseScene()
  })

  /**
   * Dix secondes de temps qui défile, à la cadence à laquelle la boucle de rendu publie
   * l'instant (`PERIODE_PUBLICATION_MS` = 500 ms) et le facteur de défilement par défaut
   * (×60). Chaque publication change l'identité de l'état : c'est le nombre de rendus qu'un
   * abonnement complet — celui que `App` portait — impose à tout l'arbre.
   */
  function publieDixSecondes(): { readonly etats: number; readonly epoques: number } {
    const depart = etatScene().msAffiche
    const etats = new Set<EtatScene>()
    const epoques = new Set<number>()
    for (let n = 1; n <= 20; n++) {
      // ×60 : une demi-seconde de montre vaut trente secondes de ciel.
      afficheInstant(depart + n * 30_000)
      etats.add(etatScene())
      epoques.add(epoqueAffichee(etatScene()))
    }
    return { etats: etats.size, epoques: epoques.size }
  }

  it('ne réveille l’application que quand sa tranche change', () => {
    const mesure = publieDixSecondes()
    // Avant : un rendu de `App` par publication, soit deux par seconde.
    expect(mesure.etats).toBe(20)
    // Après : l'époque de précession est prise au jour près, dix minutes de ciel ne la
    // changent pas — `App` ne se rend plus du tout pendant ces dix secondes.
    expect(mesure.epoques).toBe(1)
  })

  it('T-0248 — republier le même instant ne réveille personne', () => {
    const avant = etatScene()
    afficheInstant(avant.msAffiche)
    expect(etatScene()).toBe(avant)
  })

  it('réveille quand même l’application quand le jour affiché change', () => {
    const depart = etatScene().msAffiche
    const avant = epoqueAffichee(etatScene())
    afficheInstant(depart + 2 * 86_400_000)
    expect(epoqueAffichee(etatScene())).toBeGreaterThan(avant)
  })
})

/**
 * T-0258 — le centre de la scène se calcule sur le ciel resté libre.
 *
 * Les mesures reproduisent la coque à 1440 × 900 : le rail de la vue à gauche, le panneau de
 * séance à droite, tous deux décollés du bord d'un jour de carte. Ce sont les deux seules
 * surfaces toujours ouvertes ; les cartes du matériel et le plan de nuit se replient et ne
 * comptent donc pas — une visée qui saute au repli d'une carte se juge plus mal qu'une visée
 * décalée une fois pour toutes.
 */
describe('T-0258 — le centre de la scène', () => {
  const SCENE = { left: 0, right: 1440, top: 0, bottom: 900 }
  const RAIL = { left: 12, right: 56, top: 56, bottom: 852 }
  const PANNEAU = { left: 1076, right: 1428, top: 56, bottom: 852 }
  /** Le milieu du ciel laissé libre, en pixels CSS, mesuré sans passer par la fonction testée. */
  const MILIEU_LIBRE = (RAIL.right + PANNEAU.left) / 2

  it('pose la visée au milieu de ce que le rail et le panneau laissent voir', () => {
    const decalage = decalageCentreScene(SCENE, [RAIL, PANNEAU], SCENE.right)
    expect(SCENE.right / 2 + decalage).toBeCloseTo(MILIEU_LIBRE, 9)
    // Le panneau est le plus large : la visée part vers le rail.
    expect(decalage).toBeLessThan(0)
  })

  it('s’exprime dans la définition de rendu, pas en pixels CSS', () => {
    // Le décalage sert une projection : il se compte dans les pixels que le canevas peint,
    // qui ne sont ceux de la feuille de style qu'à l'échelle 1.
    const enCss = decalageCentreScene(SCENE, [RAIL, PANNEAU], SCENE.right)
    expect(decalageCentreScene(SCENE, [RAIL, PANNEAU], SCENE.right / 2)).toBeCloseTo(enCss / 2, 9)
  })

  it('ne borne la scène que par les surfaces toujours ouvertes', () => {
    // C'est le sélecteur qui porte la décision, pas le calcul : les cartes repliables —
    // Boîtier, Optique, Plan de nuit — n'y sont pas, sinon la visée sauterait à chaque repli.
    expect([...BORDURES_SCENE]).toEqual(['.coque-rail', '.coque-lateral'])
  })

  it('ne décale rien sous le repli, où les mêmes surfaces passent dans le flux', () => {
    // Le rail devient une rangée au-dessus de la scène, le panneau une section en dessous :
    // ils ne recouvrent plus rien, et la feuille de style suffit à le dire.
    const dessus = { left: 0, right: 1440, top: -60, bottom: 0 }
    const dessous = { left: 0, right: 1440, top: 900, bottom: 1600 }
    expect(decalageCentreScene(SCENE, [dessus, dessous], SCENE.right)).toBe(0)
  })

  it('reste au milieu quand deux surfaces ne laissent aucun ciel', () => {
    const tout = { left: 0, right: 1440, top: 0, bottom: 900 }
    expect(decalageCentreScene(SCENE, [tout], SCENE.right)).toBe(0)
  })
})

/**
 * §8.4 / T-0324 — montrer un parcours fige l'horloge à l'heure du pointage. Une horloge
 * arrêtée sans qu'on sache quand ni pourquoi est un bug, pas un mode : le fermer doit rendre
 * exactement l'instant et le mode d'avant, sinon le ciel, la Lune et le crépuscule restent
 * bloqués à l'heure d'une étape qu'on ne consulte plus.
 */
describe('T-0324 — le parcours rend l’horloge qu’il a empruntée', () => {
  const PARCOURS: ParcoursScene = {
    designation: 'NGC7000',
    etapes: [{ ordre: 1, adH: 20.5, decDeg: 45, nom: 'Deneb' }],
    adCibleH: 20.99,
    decCibleDeg: 44.52,
  }
  const HEURE_ETAPE = Date.parse('2026-08-15T22:47:00Z')

  beforeEach(() => {
    reinitialiseScene()
  })

  it('va à l’heure du pointage et fige le temps', () => {
    montreParcours(PARCOURS, HEURE_ETAPE)
    expect(etatScene().rendu.parcours).toEqual(PARCOURS)
    expect(instant.ms).toBe(HEURE_ETAPE)
    expect(etatScene().temps.modeTemps).toBe('FIGE')
  })

  it('rend l’instant et le mode d’avant en se fermant', () => {
    const avantMs = instant.ms
    const avantTemps = etatScene().temps
    montreParcours(PARCOURS, HEURE_ETAPE)
    masqueParcours()
    expect(etatScene().rendu.parcours).toBeNull()
    expect(instant.ms).toBe(avantMs)
    expect(etatScene().temps).toEqual(avantTemps)
  })

  it('rend un défilement en cours, et pas seulement « maintenant »', () => {
    majTemps({ modeTemps: 'DEFILEMENT', facteur: K('FACTEUR_DEFILEMENT_NORMAL') })
    const avantTemps = etatScene().temps
    montreParcours(PARCOURS, HEURE_ETAPE)
    expect(etatScene().temps.modeTemps).toBe('FIGE')
    masqueParcours()
    expect(etatScene().temps).toEqual(avantTemps)
  })

  it('ne touche à rien quand aucun parcours n’est montré', () => {
    const avant = etatScene()
    masqueParcours()
    expect(etatScene()).toBe(avant)
  })

  it('retient l’horloge du PREMIER parcours quand on passe de l’un à l’autre', () => {
    // Deux étapes du plan peuvent avoir leur aide au pointage ouverte : passer de la première
    // à la seconde ne doit pas faire de l'heure de la première l'état « d'avant ».
    const avantMs = instant.ms
    montreParcours(PARCOURS, HEURE_ETAPE)
    montreParcours({ ...PARCOURS, designation: 'M31' }, HEURE_ETAPE + 3600_000)
    masqueParcours()
    expect(instant.ms).toBe(avantMs)
  })
})
