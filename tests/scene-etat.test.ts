/**
 * §3 + §9 — one pointage for both views: scene store really shared; aim moved elsewhere reads in
 * grand champ. Per-view state didn't carry framing across.
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
  recaleSuivi,
  reinitialiseScene,
  suisCible,
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

/** Grand champ status line: aim in right ascension + declination. */
/**
 * T-0154 — panel no longer rewrites aim: read at bottom bar centre. Numbers prove it follows
 * pointage (frame pose max, arc length, pole position): whole render compared.
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
    // Initial state skips majVue: nothing else bounds it.
    expect(fovDeg).toBeLessThanOrEqual(fovMaxSelonMode(mode))
  })

  it('retouche sans muter : l’instantané précédent reste intact', () => {
    const avant = etatScene()
    majVue({ azimutDeg: 90 })
    expect(avant.vue.azimutDeg).toBe(180)
    expect(etatScene().vue.azimutDeg).toBe(90)
    // Time untouched by view tweak: identity must survive.
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
    // §3.2 — without pause, `MAINTENANT` resyncs to system clock next frame: chosen instant lives
    // one frame.
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
    // T-0213 — projection choice on view rail with other scene settings; what it offers stays
    // dictated by lens declared in matériel panel. Toggle: off = planetarium, on = lens projection.
    majVue({ mode: modeObjectif('FISHEYE') })
    const html = renderToStaticMarkup(
      createElement(RailVue, {
        modeObjectif: modeObjectif('FISHEYE'),
        gaiaCharge: false,
        epoqueAnnee: 2026.6,
        masque: masquePlat(),
        reglages: null,
      }),
    )
    expect(html).toContain('Vue comme l’appareil — équidistante')
    // Fisheye lens: no gnomonic projection offered.
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
    // Ticket gesture: looking at whole sky, switch to lens projection. Without a bound, scale
    // vanishes, sky collapses onto central pixel.
    majVue({ mode: 'MODE_CADRE' })
    expect(etatScene().vue.fovDeg).toBe(K('FOV_MAX_GNOMONIQUE_DEG'))
    // Back to stereographic doesn't restore lost field: bound goes down, not up. Reopening = zoom
    // gesture, not a menu side effect.
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
   * Ten seconds of scrolling at render-loop publish rate (`PERIODE_PUBLICATION_MS` = 500 ms),
   * default scroll ×60. Each publish changes state identity: renders a full subscription (what
   * `App` held) imposes on whole tree.
   */
  function publieDixSecondes(): { readonly etats: number; readonly epoques: number } {
    const depart = etatScene().msAffiche
    const etats = new Set<EtatScene>()
    const epoques = new Set<number>()
    for (let n = 1; n <= 20; n++) {
      // ×60: half a watch-second = thirty sky-seconds.
      afficheInstant(depart + n * 30_000)
      etats.add(etatScene())
      epoques.add(epoqueAffichee(etatScene()))
    }
    return { etats: etats.size, epoques: epoques.size }
  }

  it('ne réveille l’application que quand sa tranche change', () => {
    const mesure = publieDixSecondes()
    // Before: one `App` render per publish = two per second.
    expect(mesure.etats).toBe(20)
    // After: precession epoch taken to the day, ten sky-minutes don't change it → no `App` render
    // in these ten seconds.
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
 * T-0258 — scene centre computed on sky left free.
 * Reproduces shell at 1440 × 900: view rail left, session panel right, both a map-gap off edge.
 * Only two always-open surfaces; matériel cards + night plan fold → not counted (aim jumping on
 * fold is worse than one fixed offset).
 */
describe('T-0258 — le centre de la scène', () => {
  const SCENE = { left: 0, right: 1440, top: 0, bottom: 900 }
  const RAIL = { left: 12, right: 56, top: 56, bottom: 852 }
  const PANNEAU = { left: 1076, right: 1428, top: 56, bottom: 852 }
  /** Middle of free sky in CSS px, measured without the tested function. */
  const MILIEU_LIBRE = (RAIL.right + PANNEAU.left) / 2

  it('pose la visée au milieu de ce que le rail et le panneau laissent voir', () => {
    const decalage = decalageCentreScene(SCENE, [RAIL, PANNEAU], SCENE.right)
    expect(SCENE.right / 2 + decalage).toBeCloseTo(MILIEU_LIBRE, 9)
    // Panel is widest: aim moves toward rail.
    expect(decalage).toBeLessThan(0)
  })

  it('s’exprime dans la définition de rendu, pas en pixels CSS', () => {
    // Offset serves a projection: painted canvas px, = stylesheet px only at scale 1.
    const enCss = decalageCentreScene(SCENE, [RAIL, PANNEAU], SCENE.right)
    expect(decalageCentreScene(SCENE, [RAIL, PANNEAU], SCENE.right / 2)).toBeCloseTo(enCss / 2, 9)
  })

  it('ne borne la scène que par les surfaces toujours ouvertes', () => {
    // Selector carries the decision, not the calculation: foldable cards (Boîtier, Optique, Plan de
    // nuit) excluded, else aim jumps at each fold.
    expect([...BORDURES_SCENE]).toEqual(['.coque-rail', '.coque-lateral'])
  })

  it('ne décale rien sous le repli, où les mêmes surfaces passent dans le flux', () => {
    // Rail = row above scene, panel = section below: they cover nothing, stylesheet suffices.
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
 * §8.4 / T-0324 — showing a parcours freezes the clock at pointage time. Clock stopped without
 * known when/why = bug: closing restores exact prior instant + mode, else sky, Moon, crépuscule
 * stay stuck at a step no longer consulted.
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
    // Two plan steps may have aide au pointage open: first → second must not make first's time the
    // "before" state.
    const avantMs = instant.ms
    montreParcours(PARCOURS, HEURE_ETAPE)
    montreParcours({ ...PARCOURS, designation: 'M31' }, HEURE_ETAPE + 3600_000)
    masqueParcours()
    expect(instant.ms).toBe(avantMs)
  })
})

describe('T-0292 — une écriture qui ne change rien ne notifie pas', () => {
  beforeEach(() => reinitialiseScene())

  it('majTemps sur un temps déjà figé rend le même état', () => {
    majTemps({ modeTemps: 'FIGE' })
    const avant = etatScene()
    majTemps({ modeTemps: 'FIGE' })
    expect(etatScene()).toBe(avant)
  })

  it('majVue sans changement rend le même état', () => {
    const avant = etatScene()
    majVue({ fovDeg: avant.vue.fovDeg })
    expect(etatScene()).toBe(avant)
  })

  it('vaA répété au même instant ne réécrit rien', () => {
    vaA(instant.ms)
    const avant = etatScene()
    vaA(avant.msAffiche)
    expect(etatScene()).toBe(avant)
  })

  it('une écriture qui change quelque chose rend un état neuf', () => {
    const avant = etatScene()
    majVue({ fovDeg: avant.vue.fovDeg / 2 })
    expect(etatScene()).not.toBe(avant)
  })
})

describe('« Cadrer » suit la cible jusqu’au premier geste de pointage', () => {
  beforeEach(() => reinitialiseScene())

  // Store doesn't read coordinates: render loop projects them.
  const suivi = { designation: 'M 31', adDeg: 0, decDeg: 0 }

  it('le recalage de la boucle garde le suivi', () => {
    suisCible(suivi, { azimutDeg: 90, hauteurDeg: 30 })
    recaleSuivi(91, 31)
    expect(etatScene().suivi).toBe(suivi)
    expect(etatScene().vue.azimutDeg).toBe(91)
  })

  it('zoomer ou tourner le boîtier ne rompt pas le suivi', () => {
    suisCible(suivi, { azimutDeg: 90, hauteurDeg: 30 })
    majVue((v) => ({ fovDeg: v.fovDeg / 2, rotationCadreDeg: v.rotationCadreDeg + 10 }))
    expect(etatScene().suivi).toBe(suivi)
  })

  it('déplacer la visée rompt le suivi, et un recalage ne la reprend plus', () => {
    suisCible(suivi, { azimutDeg: 90, hauteurDeg: 30 })
    majVue((v) => ({ azimutDeg: v.azimutDeg + 1 }))
    expect(etatScene().suivi).toBeNull()
    const azimut = etatScene().vue.azimutDeg
    recaleSuivi(0, 0)
    expect(etatScene().vue.azimutDeg).toBe(azimut)
  })
})
