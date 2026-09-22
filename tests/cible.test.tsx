/**
 * Livrable vérifiable du Lot 2 : pour une cible et un setup, l'écran produit un verdict
 * dépliable jusqu'à sa formule, une pose avec sa plage utile, une durée d'intégration et un
 * plan de calibration.
 *
 * Le rendu statique suffit : rien n'est à cliquer pour que la chaîne §6 → §7 → §10.2
 * produise ses sorties. T-0156 — la fiche n'a plus de cible par défaut : c'est le magasin de
 * séance qui en désigne une, comme le ferait un clic sur la scène.
 *
 * L'instant affiché est figé sur une Lune sous l'horizon : elle n'ajoute alors rien au fond
 * de ciel (§8.1), et la chaîne se vérifie sous le ciel noir du site plutôt que sous la phase
 * du jour où les tests tournent. La position de la Lune, elle, reste calculée.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
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
import { ouvreCible, reinitialiseSeance } from '../src/ui/seance-etat.ts'
import type { Site } from '../src/core/ephem.ts'
import type { CibleEcartee } from '../src/core/session-types.ts'
import { TYPES_OBJET, type ObjetCielProfond } from '../src/data/deepsky.ts'
import {
  LIBELLE_LOT_CALIBRATION,
  LIBELLE_REGIME_POSE,
  LIBELLE_VERDICT_DETECTABILITE,
  libelleEntree,
} from '../src/registry/libelles.ts'

/**
 * La chaîne de référence de §6.3 : magnitude intégrée 5,7, grand axe 71’, petit axe 42’,
 * angle de position 23°. Circumpolaire depuis le site de l'Annexe A, pour que sa hauteur de
 * culmination ne dépende pas du jour où la suite tourne.
 */
const CIBLE_REFERENCE = objetForge('CIBLE_REFERENCE', 85, {
  vMag: 5.7,
  majAxArcmin: 71,
  minAxArcmin: 42,
  posAngDeg: 23,
})

/** 12 janvier 2026, 1 h UTC : la Lune est sous l'horizon depuis le site de l'Annexe A. */
const INSTANT_SANS_LUNE = Date.UTC(2026, 0, 12, 1)

// T-0182 — la fiche vit dans le panneau de droite, à la place de la liste. `ouvreCible` l'y
// met : c'est elle que ce fichier interroge.
vaA(INSTANT_SANS_LUNE)
ouvreCible(CIBLE_REFERENCE)
const ecran = renderToStaticMarkup(<App />)

describe('fiche de cible — écran par défaut, M33 depuis le site de l’Annexe A', () => {
  it('produit le verdict de détectabilité de M33 avec sa brillance et son contraste', () => {
    // 23,0148 mag/arcsec² et −2,0648 : le PRD écrit 23,02 et −2,07, arrondis obtenus avec
    // le facteur 8,63 plutôt qu’avec π/4 × 3600 calculé.
    expect(ecran).toContain('23.01')
    expect(ecran).toContain('-2.06')
    expect(ecran).toContain(LIBELLE_VERDICT_DETECTABILITE.PHOTO_SEULE)
  })

  it('ne présente jamais photo seulement comme un refus, mais comme une durée', () => {
    expect(ecran).toMatch(/une longue pose le fera apparaître/)
    expect(ecran).toMatch(/d’intégration/)
  })

  it('affiche la pose avec sa plage utile, présentée comme équivalente', () => {
    // Le profil par défaut est sans suivi : c'est la NPF, 2,10 s, qui plafonne la pose, et
    // le régime bascule en LIMITE_SUIVI avec sa cause. La plage reste [t/2 ; t×2].
    expect(ecran).toMatch(/poser 2 s — de 1 à 4 s, même résultat/)
    expect(ecran).toContain(LIBELLE_REGIME_POSE.LIMITE_SUIVI)
    expect(ecran).toMatch(/La monture limite la pose/)
  })

  it('déplie chaque nombre jusqu’à sa formule et sa constante source', () => {
    expect(ecran).toContain('SB_obj = m_int + 2,5 × log10( aire_arcsec2 )')
    expect(ecran).toContain('t_opt = C × RN² / E_ciel')
    expect(ecran).toContain('T_requis = SNR_cible² × ( E_obj + E_ciel + RN² / t_pose ) / E_obj²')
    expect(ecran).toContain('C-03')
  })

  it('nomme le facteur dominant et propose un levier gratuit avant tout achat', () => {
    expect(ecran).toContain(libelleEntree('sb_obj'))
    expect(ecran).toMatch(/Premier levier : se déplacer vers un site plus sombre/)
  })

  it('prescrit un plan de calibration, sans jamais offrir d’écran de calibration', () => {
    expect(ecran).toContain(LIBELLE_LOT_CALIBRATION.FLATS)
    expect(ecran).toContain(LIBELLE_LOT_CALIBRATION.DARKS)
    expect(ecran).toContain(LIBELLE_LOT_CALIBRATION.OFFSETS)
    expect(ecran).toMatch(/bague de mise au point/)
    // Le point zéro système reste une lecture : aucun champ de saisie ne le vise.
    expect(ecran).not.toMatch(/<input[^>]*(zp|calibr)/i)
  })

  it('affiche le budget de stockage et la loi en racine du temps', () => {
    expect(ecran).toMatch(/Go de carte/)
    expect(ecran).toMatch(/quatre fois plus de temps/)
  })
})


// --- T-0046 / T-0048 — le choix de la cible, et ce que la fiche en fait ------------------

/** Annexe A. Depuis 44,84° N, δ = +85° ne se couche jamais et δ = −85° ne se lève jamais. */
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

function ficheDe(objet: ObjetCielProfond, ecarteePlan: CibleEcartee | null = null): string {
  return renderToStaticMarkup(
    <FicheCible
      objet={objet}
      site={SITE}
      contexteSession={null}
      optique={OPTIQUE}
      capteurHMm={CAPTEUR.capteurHMm}
      pitchUm={CAPTEUR.pitchUm}
      ouvertureN={2.8}
      boitier={BOITIER_REFERENCE}
      zeroSysteme={pointZeroSysteme(BOITIER_REFERENCE)}
      iso={isoRecommande(BOITIER_REFERENCE)}
      sbCiel={21}
      mLimOeil={6.1}
      tMaxS={2.1}
      bortle={4}
      suiviActif={false}
      focaleMm={120}
      ecarteePlan={ecarteePlan}
    />,
  )
}

describe('T-0128 — la fiche décrit la cible, elle ne la choisit plus', () => {
  const rendu = ficheDe(AU_DESSUS)

  it('ne porte plus ni liste des visibles, ni filtre de type, ni bouton « Voir »', () => {
    // Les trois ont rejoint le panneau « Toutes les cibles » : les garder ici rendrait le
    // catalogue accessible par deux chemins, ce que T-0128 supprime.
    expect(rendu).not.toContain('Cibles visibles')
    expect(rendu).not.toContain('Type listé')
    expect(rendu).not.toContain('>Voir<')
    expect(rendu).not.toMatch(/<optgroup/)
  })

  it('garde les champs qui décrivent la cible', () => {
    for (const champ of ['Désignation', 'Type d’objet', 'Dimension grand axe', 'Dimension petit axe']) {
      expect(rendu, champ).toContain(champ)
    }
  })
})

describe('T-0158 — « À propos », et des dimensions qui ne meublent pas', () => {
  it('titre la section « À propos » et groupe les dimensions sans sous-titre', () => {
    const rendu = ficheDe(AU_DESSUS)
    expect(rendu).toContain('<h2>À propos</h2>')
    expect(rendu).not.toContain('<h3>Dimensions</h3>')
  })

  it('n’affiche pas la ligne d’une dimension absente du catalogue', () => {
    // AU_DESSUS n'a pas d'angle de position : une ligne « [DONNÉE MANQUANTE] » de plus
    // n'apprendrait rien de la cible.
    const rendu = ficheDe(AU_DESSUS)
    expect(rendu).toContain('Dimension grand axe')
    expect(rendu).not.toContain('Angle de position')
  })

  it('ne nomme qu’une fois l’absence quand les trois dimensions manquent', () => {
    const rendu = ficheDe(
      objetForge('SANS_FORME', 85, { majAxArcmin: null, minAxArcmin: null, posAngDeg: null }),
    )
    // Les verdicts en aval nomment aussi ce qui leur manque : on ne juge que la section.
    const aPropos = rendu.slice(0, rendu.indexOf('</section>'))
    expect(aPropos).not.toContain('Dimension grand axe')
    expect(aPropos).not.toContain('Dimension petit axe')
    expect(aPropos.match(/DONNÉE MANQUANTE/g) ?? []).toHaveLength(1)
  })

  it('retire la région « Cadrage de la cible » quand le catalogue ne donne pas les dimensions', () => {
    // Sans grand axe, §6.2 n'a aucune entrée : remplissage, diamètre en pixels et focale
    // nécessaire décriraient la taille nulle qu'on aurait substituée, pas la cible. Le reste
    // de la fiche, lui, ne dépend pas des dimensions et reste dû.
    const rendu = ficheDe(objetForge('SANS_DIMENSIONS', 85, { majAxArcmin: null, minAxArcmin: null }))
    expect(rendu).not.toContain('Cadrage de la cible')
    expect(rendu).not.toContain('focale')
    expect(ficheDe(AU_DESSUS)).toContain('Cadrage de la cible')
  })

  it('réduit « Détectabilité » à une seule absence et retire « Pose » faute de donnée source', () => {
    // §6.3 — sans magnitude ni dimensions, brillance de surface, contraste et magnitude
    // limite portent tous la même absence : elle se nomme une fois. La pose qui en découlait
    // disparaît avec elle, plutôt que d'exposer le point zéro et le fond de ciel du setup
    // comme s'ils décrivaient cette cible.
    const rendu = ficheDe(objetForge('SANS_MAGNITUDE', 85, { vMag: null }))
    const detectabilite = rendu.slice(rendu.indexOf('<h2>Détectabilité</h2>'))
    expect(detectabilite.match(/DONNÉE MANQUANTE/g) ?? []).toHaveLength(1)
    expect(detectabilite).not.toContain('Brillance de surface')
    expect(rendu).not.toContain('<h2>Pose</h2>')

    // La même fiche, magnitude au catalogue : les deux régions sont dues.
    const complet = ficheDe(AU_DESSUS)
    expect(complet).toContain('Brillance de surface')
    expect(complet).toContain('<h2>Pose</h2>')
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

    // Le geste du bouton, tel qu'il est câblé dans le panneau des cibles.
    majVue({ azimutDeg: ligne!.azimutDeg, hauteurDeg: ligne!.hauteurDeg })

    const apres = etatScene().vue
    expect(apres.azimutDeg).toBeCloseTo(ligne!.azimutDeg, 1)
    expect(apres.hauteurDeg).toBeCloseTo(ligne!.hauteurDeg, 1)
    expect(apres.fovDeg).toBe(avant.fovDeg)
    expect(apres.rotationCadreDeg).toBe(avant.rotationCadreDeg)
    reinitialiseScene()
  })
})


// --- T-0156 — la cible vient du catalogue, et de nulle part ailleurs -------------------

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
    // Les seules saisies qui subsistent sont les deux interrupteurs de §7.2 et §7.5.
    expect(rendu).not.toMatch(/<input(?![^>]*type="checkbox")/i)
    expect(rendu).not.toMatch(/readonly/i)
    expect(rendu).not.toMatch(/disabled/i)
  })

  it('affiche les valeurs du catalogue en lectures', () => {
    expect(rendu).toContain('GLOB')
    expect(rendu).toContain('amas globulaire')
  })

  /**
   * T-0228 — la provenance ne se relit plus à chaque cible : elle est la même pour toutes, et
   * n'arbitre rien. Elle vit dans le tiroir « info », que `coque.test.tsx` vérifie.
   */
  it('T-0228 — ne renvoie plus à OpenNGC au contact des valeurs', () => {
    expect(rendu).not.toContain('Valeurs du catalogue OpenNGC.')
  })

  it('nomme ce que le catalogue ne porte pas plutôt que de laisser un champ vide', () => {
    // L'objet forgé n'a pas de magnitude : §6.3 le dit, et rien ne permet de le saisir.
    // T-0158 — les dimensions, elles, s'effacent au lieu de meubler.
    expect(ficheDe(objetForge('SANS_MAG', 85, { vMag: null }))).toContain('[DONNÉE MANQUANTE]')
  })
})

describe('T-0156 — sans cible désignée, il n’y a pas de fiche', () => {
  it('n’affiche aucun verdict de démonstration', () => {
    reinitialiseSeance()
    const sansCible = renderToStaticMarkup(<App />)
    // T-0182 — le panneau rend la liste : une fiche sans cible désignée n'existe plus.
    expect(sansCible).toContain('Ne montrer que les objets photographiables')
    expect(sansCible).not.toContain('Cadrage de la cible')
    ouvreCible(CIBLE_REFERENCE)
  })
})

describe('§8.3 — la fiche nomme un écart d’allocation que le calcul seul ne voit pas', () => {
  it('affiche la cause quand le plan écarte la cible pour conflit de créneau ou budget', () => {
    const rendu = ficheDe(AU_DESSUS, {
      designation: AU_DESSUS.designation,
      code: 'BUDGET',
      cause: 'Nuit trop courte de 12 min : cette cible, la moins bien notée, est retirée.',
    })
    expect(rendu).toContain('Nuit trop courte de 12 min')
  })

  it('ne montre rien quand la cible n’est pas écartée du plan', () => {
    expect(ficheDe(AU_DESSUS)).not.toContain('Cause d’exclusion')
  })
})
