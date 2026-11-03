/**
 * Lot 2 verifiable deliverable: for a cible + setup, screen produces a verdict unfoldable to its
 * formula, a pose with plage utile, an intégration duration, a calibration plan (now in plan de
 * nuit). Static render suffices: nothing to click for the §6 → §7 → §10.2 chain to output.
 * T-0156 — fiche has no default cible: séance store designates one, as a scène click would.
 * Displayed instant frozen on Lune below horizon: adds nothing to fond de ciel (§8.1) → chain
 * verified under site's black sky, not the test-run day's phase. Lune position still computed.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.tsx'
import { FicheCible, LIBELLE_TYPE_OBJET } from '../src/ui/FicheCible.tsx'
import { lignesCatalogue } from '../src/core/cibles-liste.ts'
import { cielInstantane } from '../src/core/horloges.ts'
import { profilOptique } from '../src/core/optics.ts'
import {
  BOITIER_REFERENCE,
  capteurEffectif,
  isoRecommande,
  pointZeroSysteme,
} from '../src/data/equipment.ts'
import { etatScene, majVue, reinitialiseScene, vaA } from '../src/ui/scene-etat.ts'
import { BoutonChoixCible } from '../src/ui/BoutonChoixCible.tsx'
import {
  basculeChoixCible,
  reinitialiseCiblesChoisies,
} from '../src/ui/cibles-choisies.ts'
import { ouvreCible, reinitialiseSeance } from '../src/ui/seance-etat.ts'
import type { Site } from '../src/core/ephem.ts'
import type { CibleEcartee } from '../src/core/session-types.ts'
import { TYPES_OBJET, type ObjetCielProfond } from '../src/data/deepsky.ts'
import { degres } from '../src/registry/ecriture.ts'
import { GLOSSAIRE } from '../src/registry/glossaire.ts'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { fenetreUtile } from '../src/core/moon.ts'
import { masquePlat } from '../src/core/site.ts'
import type { ContexteSession } from '../src/core/session.ts'
import { nuitFiche } from '../src/ui/fiche-cible-creneau.ts'
import { heure } from '../src/ui/horaire.ts'
import { LIBELLE_LOT_CALIBRATION } from '../src/registry/libelles.ts'

/**
 * §6.3 reference chain: integrated magnitude 5.7, major axis 71’, minor 42’, position angle 23°.
 * Circumpolar from Annexe A site → culmination hauteur independent of run day.
 */
const CIBLE_REFERENCE = objetForge('CIBLE_REFERENCE', 85, {
  vMag: 5.7,
  majAxArcmin: 71,
  minAxArcmin: 42,
  posAngDeg: 23,
})

/** 12 January 2026, 1 h UTC: Lune below horizon from Annexe A site. */
const INSTANT_SANS_LUNE = Date.UTC(2026, 0, 12, 1)

/**
 * SYSTEM CLOCK FROZEN, not only scène's. `vaA` fixes the DISPLAYED instant; the PLANNED NUIT
 * starts from today (`nuitDeLInstant(new Date())`, `app-saisie.ts`). Fiche evaluates Lune at
 * cible's créneau midpoint on that nuit (T-0268), not at displayed instant: unfrozen, gêne
 * lunaire (hence contraste, pose) varied with run day → green on writing day, red 3 weeks later,
 * code intact. Only `Date` mocked: timers not involved, mocking them would await renders that
 * never come.
 */
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(INSTANT_SANS_LUNE)
afterAll(() => {
  vi.useRealTimers()
})

// T-0182 — fiche lives in right panel, replacing list. `ouvreCible` puts it there; this file
// queries it.
vaA(INSTANT_SANS_LUNE)
ouvreCible(CIBLE_REFERENCE)
const ecran = renderToStaticMarkup(<App />)

describe('fiche de cible — écran par défaut, M33 depuis le site de l’Annexe A', () => {
  it('affiche la pose unitaire retenue, et la monture qui la bride', () => {
    // Default profil has no suivi: NPF, 2.10 s caps the pose. Card announces that pose, not the
    // optimum suivi wouldn't hold.
    expect(ecran).toMatch(/Pose unitaire.*?2,1 s/s)
    expect(ecran).toMatch(/La monture limite la pose/)
  })

  it('laisse le plan de calibration au plan de nuit, sans jamais offrir d’écran de calibration', () => {
    expect(ecran).not.toContain(LIBELLE_LOT_CALIBRATION.FLATS)
    expect(ecran).not.toContain(LIBELLE_LOT_CALIBRATION.DARKS)
    expect(ecran).not.toContain(LIBELLE_LOT_CALIBRATION.OFFSETS)
    // Système point zéro stays a reading: no saisie field targets it.
    expect(ecran).not.toMatch(/<input[^>]*(zp|calibr)/i)
  })

  it('ne porte plus la carte « Pourquoi ce verdict »', () => {
    expect(ecran).not.toContain('Pourquoi ce verdict')
  })
})


// --- T-0046 / T-0048 — cible choice, and what fiche does with it ------------------------

/** Annexe A. From 44.84° N, δ = +85° never sets and δ = −85° never rises. */
const SITE: Site = { latitudeDeg: 44.84, longitudeDeg: -0.58, altitudeM: 20 }
const CAPTEUR = capteurEffectif(BOITIER_REFERENCE, 'FULL_FRAME')
const OPTIQUE = profilOptique({ focaleMm: 120, ouvertureN: 2.8, ...CAPTEUR })

function objetForge(
  designation: string,
  decDeg: number,
  partiel: Partial<ObjetCielProfond> = {},
): ObjetCielProfond {
  return {
    designation,
    nomsCommuns: '',
    adDeg: 0,
    decDeg,
    type: 'GALAXIE',
    majAxArcmin: 10,
    minAxArcmin: 6,
    posAngDeg: null,
    vMag: 6,
    bMag: null,
    surfBr: null,
    ...partiel,
  }
}

const AU_DESSUS = objetForge('CIRCUMPOLAIRE', 85)

function propsFiche(objet: ObjetCielProfond, ecarteePlan: CibleEcartee | null = null) {
  return {
    objet,
    site: SITE,
    contexteSession: null,
    optique: OPTIQUE,
    capteurHMm: CAPTEUR.capteurHMm,
    pitchUm: CAPTEUR.pitchUm,
    ouvertureN: 2.8,
    boitier: BOITIER_REFERENCE,
    zeroSysteme: pointZeroSysteme(BOITIER_REFERENCE),
    iso: isoRecommande(BOITIER_REFERENCE),
    sbCiel: 21,
    mLimOeil: 6.1,
    tMaxS: 2.1,
    bortle: 4,
    suiviActif: false,
    focaleMm: 120,
    ecarteePlan,
  }
}

function ficheDe(objet: ObjetCielProfond, ecarteePlan: CibleEcartee | null = null): string {
  return renderToStaticMarkup(<FicheCible {...propsFiche(objet, ecarteePlan)} />)
}

describe('T-0128 — la fiche décrit la cible, elle ne la choisit plus', () => {
  const rendu = ficheDe(AU_DESSUS)

  it('ne porte plus ni liste des visibles, ni filtre de type, ni bouton « Voir »', () => {
    // All 3 joined "Toutes les cibles" panel: keeping them here = catalogue reachable by two
    // paths, which T-0128 removes.
    expect(rendu).not.toContain('Cibles visibles')
    expect(rendu).not.toContain('Type listé')
    expect(rendu).not.toContain('>Voir<')
    expect(rendu).not.toMatch(/<optgroup/)
  })

  it('garde les champs qui décrivent la cible', () => {
    for (const champ of ['CIRCUMPOLAIRE', 'galaxie', 'Dimensions']) {
      expect(rendu, champ).toContain(champ)
    }
  })
})

describe('T-0158 — « À propos », et des dimensions qui ne meublent pas', () => {
  it('T-0381 — la carte magnitude et dimensions n’a pas de titre, ni de sous-titre', () => {
    const rendu = ficheDe(AU_DESSUS)
    expect(rendu).not.toContain('À propos')
    expect(rendu).not.toContain('<h3>Dimensions</h3>')
  })

  it('n’affiche pas la ligne d’une dimension absente du catalogue', () => {
    // AU_DESSUS has no position angle: one more "[DONNÉE MANQUANTE]" line teaches nothing about
    // the cible.
    const rendu = ficheDe(AU_DESSUS)
    expect(rendu).toContain('Dimensions')
    expect(rendu).not.toContain('Angle de position')
  })

  it('T-0381 — résume les dimensions en une lecture, grand axe × petit axe', () => {
    const rendu = ficheDe(AU_DESSUS)
    expect(rendu).toMatch(/Dimensions<\/span><span class="tracee-valeur">10,0’ × 6,0’</)
    const seul = ficheDe(objetForge('SANS_PETIT_AXE', 85, { minAxArcmin: null }))
    expect(seul).toMatch(/Dimensions<\/span><span class="tracee-valeur">10,0’</)
  })

  it('T-0381 — ne donne pas l’angle de position : l’inclinaison de la carte photo le porte', () => {
    const rendu = ficheDe(objetForge('ORIENTEE', 85, { posAngDeg: 35 }))
    expect(rendu).not.toContain('Angle de position')
  })

  it('T-0381 — magnitude et dimensions en deuxième carte, juste après le résumé', () => {
    const rendu = ficheDe(AU_DESSUS)
    const debut = rendu.indexOf('</section>')
    const seconde = rendu.slice(debut, rendu.indexOf('</section>', debut + 1))
    expect(seconde).toContain('Magnitude intégrée')
    expect(seconde).toContain('Dimensions')
  })

  it('T-0381 — ouvre sur le résumé : désignation, nom commun, type, créneau d’observation', () => {
    const rendu = ficheDe(objetForge('M 45', 85, { nomsCommuns: 'Pléiades', type: 'AMAS_OUVERT' }))
    const resume = rendu.slice(0, rendu.indexOf('</section>'))
    for (const attendu of ['M 45', 'Pléiades', 'amas ouvert', 'Créneau d’observation']) {
      expect(resume, attendu).toContain(attendu)
    }
    // Désignation and type said up top: next card doesn't repeat them.
    expect(rendu).not.toContain('Désignation')
    expect(rendu).not.toContain('Type d’objet')
  })

  it('T-0381 — le résumé donne l’heure de culmination, avec sa bulle', () => {
    const nuit = fenetreNocturne(SITE, new Date('2026-08-14T12:00:00Z'))
    const contexte: ContexteSession = {
      site: SITE,
      nuit,
      fenetreUtile: fenetreUtile(SITE, nuit),
      masque: masquePlat(),
      fovHDeg: 11.38,
      echApx: 8.8,
      dMm: 42.9,
      capteurHMm: 23.9,
      pitchUm: 5.12,
      ouvertureN: 2.8,
      zpSys: 20.2,
      zpEstime: true,
      readNoiseE: 1.5,
      tailleRawMo: 33,
      isoSession: 640,
      sbCielNoir: 20.95,
      mLimOeil: 6.05,
      tMaxS: 200,
      domaineCpFerme: null,
      snrCible: 10,
      typeMonture: 'TRACKER',
    }
    const cible = objetForge('ETE', 0, { adDeg: 314.75, decDeg: 44.52 })
    const attendu = nuitFiche(contexte, cible).creneau
    if (!attendu.chiffre || attendu.creneau.heureCulmination === null) {
      throw new Error('la nuit de référence doit chiffrer une culmination')
    }
    const rendu = renderToStaticMarkup(
      <FicheCible {...propsFiche(cible)} contexteSession={contexte} />,
    )
    const resume = rendu.slice(0, rendu.indexOf('</section>'))
    expect(resume).toContain('Culminant')
    expect(resume).toContain(GLOSSAIRE.culmination.glose)
    expect(resume).toContain(heure(attendu.creneau.heureCulmination))
  })

  it('T-0381 — résume la photographie en troisième carte : facilité, cadre, pose, images', () => {
    const allongee = objetForge('ALLONGEE', 85, { minAxArcmin: 3, posAngDeg: 35 })
    const rendu = renderToStaticMarkup(
      <FicheCible {...propsFiche(allongee)} facilite={{ note: 4, libelle: 'confortable', pose: null, cause: null, code: null }} />,
    )
    const sections = rendu.split('</section>')
    const photo = sections[2] ?? ''
    expect(photo).toContain('Photographie confortable')
    expect(photo).toContain('facilité 4 sur')
    for (const libelle of ['Taille dans le cadre', 'Inclinaison objet', 'Pose', 'Images']) {
      expect(photo, libelle).toContain(libelle)
    }
    expect(photo).toContain(degres(35))
    // T-0384 — "Détectabilité" region gone.
    expect(rendu).not.toContain('<h2>Détectabilité</h2>')
    // T-0381 — photo card summarizes cadrage: "Cadrage de la cible" section gone.
    expect(rendu).not.toContain('Cadrage de la cible')
  })

  it('T-0381 — sans note ni orientation, la carte photo ne meuble pas', () => {
    const rendu = ficheDe(AU_DESSUS)
    const photo = rendu.split('</section>')[2] ?? ''
    expect(photo).toContain('Photographie')
    expect(photo).not.toContain('class="facilite"')
    expect(photo).not.toContain('Inclinaison objet')
  })

  it('ne nomme qu’une fois l’absence quand les trois dimensions manquent', () => {
    const rendu = ficheDe(
      objetForge('SANS_FORME', 85, { majAxArcmin: null, minAxArcmin: null, posAngDeg: null }),
    )
    // Downstream verdicts also name what they lack: only the section is judged.
    const debut = rendu.indexOf('Magnitude intégrée')
    const aPropos = rendu.slice(debut, rendu.indexOf('</section>', debut))
    expect(aPropos).not.toContain('Dimensions')
    expect(aPropos.match(/DONNÉE MANQUANTE/g) ?? []).toHaveLength(1)
  })

  it('retire la taille dans le cadre quand le catalogue ne donne pas les dimensions', () => {
    // Without major axis §6.2 has no input: remplissage, pixel diameter, needed focale would
    // describe the substituted null size, not the cible. Rest of fiche independent of
    // dimensions, still due.
    const rendu = ficheDe(objetForge('SANS_DIMENSIONS', 85, { majAxArcmin: null, minAxArcmin: null }))
    expect(rendu).not.toContain('Taille dans le cadre')
    expect(rendu).not.toContain('focale')
    expect(ficheDe(AU_DESSUS)).toContain('Taille dans le cadre')
  })

  it('retire la pose unitaire faute de donnée source', () => {
    // §6.3 — without magnitude pose isn't chiffrable: line disappears rather than exposing setup's
    // point zéro and fond de ciel as if describing this cible.
    const rendu = ficheDe(objetForge('SANS_MAGNITUDE', 85, { vMag: null }))
    expect(rendu).not.toContain('Pose unitaire')
    expect(ficheDe(AU_DESSUS)).toContain('Pose unitaire')
  })

  it('T-0385 — fond Pose et Combien de photos dans la carte Photographie', () => {
    const rendu = ficheDe(AU_DESSUS)
    expect(rendu).not.toContain('<h2>Pose</h2>')
    expect(rendu).not.toContain('<h2>Combien de photos</h2>')
    const photo = rendu.split('</section>')[2] ?? ''
    for (const libelle of ['Pose unitaire', 'Qualité visée', 'Images', 'Intégration totale', 'Volume de stockage']) {
      expect(photo, libelle).toContain(libelle)
    }
    expect(rendu.split('</section>')[0]).toContain('Atténuation atmosphérique')
  })
})

describe('T-0046 — « Voir » amène la cible au centre, et ne touche à rien d’autre', () => {
  it('pose l’azimut et la hauteur de l’objet sans changer le champ ni la rotation', () => {
    reinitialiseScene()
    const avant = etatScene().vue

    const [ligne] = lignesCatalogue({
      catalogue: [AU_DESSUS],
      matriceCiel: cielInstantane(SITE, new Date(etatScene().msAffiche)).matrice,
      sbCiel: 21,
      mLimOeil: 6.1,
      dMm: OPTIQUE.dMm.value,
      fovHDeg: OPTIQUE.fovHDeg.value,
      echApx: OPTIQUE.echApx.value,
      capteurHMm: CAPTEUR.capteurHMm,
    })
    expect(ligne).toBeDefined()
    expect(ligne!.hauteurDeg).toBeGreaterThan(0)

    // Button gesture, as wired in the cibles panel.
    majVue({ azimutDeg: ligne!.azimutDeg, hauteurDeg: ligne!.hauteurDeg })

    const apres = etatScene().vue
    expect(apres.azimutDeg).toBeCloseTo(ligne!.azimutDeg, 1)
    expect(apres.hauteurDeg).toBeCloseTo(ligne!.hauteurDeg, 1)
    expect(apres.fovDeg).toBe(avant.fovDeg)
    expect(apres.rotationCadreDeg).toBe(avant.rotationCadreDeg)
    reinitialiseScene()
  })
})


// --- T-0156 — cible comes from catalogue, nowhere else -----------------------------------

const GLOBULAIRE = objetForge('GLOB', 85, { type: 'AMAS_GLOB', vMag: 7 })

describe('T-0049 — les types du catalogue se lisent en français', () => {
  it('traduit le type de la cible affichée', () => {
    const rendu = ficheDe(objetForge('PLANETAIRE', 85, { type: 'NEB_PLANETAIRE' }))
    expect(rendu).not.toContain('NEB_PLANETAIRE')
    expect(rendu).toContain('nébuleuse planétaire')
  })

  it('donne un libellé aux dix types du catalogue', () => {
    expect(TYPES_OBJET.filter((t) => LIBELLE_TYPE_OBJET[t].trim() === '')).toEqual([])
  })
})

describe('T-0156 — la cible ne se saisit plus du tout', () => {
  const rendu = ficheDe(GLOBULAIRE)

  it('ne porte plus ni champ de cible, ni le bouton qui rouvrait la saisie', () => {
    expect(rendu).not.toContain('Cible personnalisée')
    // Only remaining saisies are the two §7.2 and §7.5 switches.
    expect(rendu).not.toMatch(/<input(?![^>]*type="checkbox")/i)
    expect(rendu).not.toMatch(/readonly/i)
    expect(rendu).not.toMatch(/disabled/i)
  })

  it('affiche les valeurs du catalogue en lectures', () => {
    expect(rendu).toContain('GLOB')
    expect(rendu).toContain('amas globulaire')
  })

  /**
   * T-0228 — provenance no longer reread per cible: same for all, arbitrates nothing. Lives in
   * "info" tiroir, checked by `coque.test.tsx`.
   */
  it('T-0228 — ne renvoie plus à OpenNGC au contact des valeurs', () => {
    expect(rendu).not.toContain('Valeurs du catalogue OpenNGC.')
  })

  it('nomme ce que le catalogue ne porte pas plutôt que de laisser un champ vide', () => {
    // Forged object has no magnitude: §6.3 says so, nothing allows entering one.
    // T-0158 — dimensions, on the other hand, disappear rather than pad.
    expect(ficheDe(objetForge('SANS_MAG', 85, { vMag: null }))).toContain('[DONNÉE MANQUANTE]')
  })
})

describe('T-0156 — sans cible désignée, il n’y a pas de fiche', () => {
  it('n’affiche aucun verdict de démonstration', () => {
    reinitialiseSeance()
    const sansCible = renderToStaticMarkup(<App />)
    // T-0182 — panel renders the list: a fiche without designated cible no longer exists.
    expect(sansCible).toContain('Ne montrer que les objets photographiables')
    expect(sansCible).not.toContain('Taille dans le cadre')
    ouvreCible(CIBLE_REFERENCE)
  })
})

describe('§8.3 — la fiche nomme un écart d’allocation que le calcul seul ne voit pas', () => {
  it('affiche la cause quand le plan reporte la cible faute de créneau libre', () => {
    const rendu = ficheDe(AU_DESSUS, {
      designation: AU_DESSUS.designation,
      code: 'CONFLIT_CRENEAU',
      cause: 'Son créneau est entièrement pris par des cibles mieux notées.',
    })
    expect(rendu).toContain('entièrement pris par des cibles mieux notées')
  })

  it('ne montre rien quand la cible n’est pas écartée du plan', () => {
    expect(ficheDe(AU_DESSUS)).not.toContain('Cause d’exclusion')
  })
})

/**
 * §8.3 — gesture composing plan de nuit, as read. Two silent breakers only: state carried by
 * `aria-pressed` (announced, filled by font not tint alone, §11.1), and label says what click
 * WILL do, not where things stand.
 */
describe('ajouter une cible au plan de nuit §8.3', () => {
  function bouton(designation: string): string {
    return renderToStaticMarkup(<BoutonChoixCible designation={designation} />)
  }

  it('n’est pas enfoncé tant que la cible n’est pas au plan, et propose de l’y mettre', () => {
    reinitialiseCiblesChoisies()
    const rendu = bouton('M31')
    expect(rendu).toContain('aria-pressed="false"')
    expect(rendu).toContain('Photographier M31 cette nuit')
  })

  it('s’enfonce dès que la cible est choisie, et propose alors de l’enlever', () => {
    reinitialiseCiblesChoisies()
    basculeChoixCible('M31')
    const rendu = bouton('M31')
    expect(rendu).toContain('aria-pressed="true"')
    expect(rendu).toContain('Retirer M31 du plan de nuit')
    reinitialiseCiblesChoisies()
  })

  it('ne suit que sa propre cible', () => {
    reinitialiseCiblesChoisies()
    basculeChoixCible('M31')
    expect(bouton('NGC7000')).toContain('aria-pressed="false"')
    reinitialiseCiblesChoisies()
  })

  it('porte un glyphe de la police, jamais un caractère dessiné', () => {
    reinitialiseCiblesChoisies()
    expect(bouton('M31')).toContain('class="icone"')
  })

  it('n’est pas offert sur une cible dont la nuit n’annonce aucune pose', () => {
    // Default screen has no verified catalogue yet: no cible carries a pose → none photographable
    // → gesture offered nowhere.
    expect(ecran).not.toContain('aria-pressed="false"><span class="icone" aria-hidden="true">photo_camera')
  })
})
