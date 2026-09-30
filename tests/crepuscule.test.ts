/**
 * T-0099 — le crépuscule éclaircit le fond du ciel.
 *
 * Trois choses se vérifient ici :
 *
 *   1. la TABLE — le domaine de Patat 2006 est respecté aux deux bords, et le polynôme n'est
 *      jamais prolongé : son sommet est à 18,3° de dépression, puis il redescend ;
 *   2. le RACCORD — la contribution tombe à zéro d'elle-même avant la nuit astronomique, sans
 *      saut, et reste nulle quelle que soit la profondeur de la nuit ;
 *   3. ce que L'UTILISATEUR voit — la magnitude limite suit le fond effectif, la teinte ne
 *      vire pas, et une nuit d'été à haute latitude est rendue au lieu d'être noire.
 */

import { describe, expect, it } from 'vitest'
import { Body } from 'astronomy-engine'
import { positionCorps, type Site } from '../src/core/ephem.ts'
import { fenetreNocturne } from '../src/core/nuit.ts'
import { nanolamberts } from '../src/core/moon.ts'
import {
  brillanceCrepusculeNl,
  adaptationEcran,
  composantesFond,
  sbEffectifRendu,
  sbZenithAvecCrepuscule,
} from '../src/core/fond-ciel-rendu.ts'
import { magnitudeRendue } from '../src/core/projection.ts'
import {
  CREPUSCULE_V,
  DEPRESSION_FIN_CREPUSCULE_DEG,
  DEPRESSION_MIN_TABLE_DEG,
  SB_NUIT_SITE_REFERENCE_MAG,
  SOURCE_CREPUSCULE,
  sbCrepusculeZenith,
} from '../src/registry/crepuscule.ts'
import { interpoleBortle, M_LIM_OEIL_PLANCHER } from '../src/registry/bortle.ts'
import { K } from '../src/registry/constants.ts'

const ZENITH_DEG = 90
const HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG = -K('HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG')
const SB_B1 = interpoleBortle(1).sb
const SB_B8 = interpoleBortle(8).sb
const FOV_DEG = 60

describe('la table du crépuscule', () => {
  it('cite sa source et ses bornes, et interdit l’extrapolation', () => {
    expect(SOURCE_CREPUSCULE).toContain('Patat')
    expect(SOURCE_CREPUSCULE).toContain('2006')
    expect(SOURCE_CREPUSCULE).toContain('extrapolation interdite')
    expect(DEPRESSION_MIN_TABLE_DEG).toBe(CREPUSCULE_V.zetaMinDeg - ZENITH_DEG)
  })

  /**
   * Le raccord n'est pas posé sur le bord de la table : c'est la racine de
   * μ(ζ) = fond nocturne de Paranal. L'article annonce par ailleurs que le niveau du ciel
   * nocturne est atteint vers ζ = 105°-106°, soit 15° à 16° de dépression — la racine doit
   * tomber dedans, sinon l'un des deux chiffres est mal lu.
   */
  it('finit là où la source dit que la nuit commence, entre 15° et 16°', () => {
    expect(DEPRESSION_FIN_CREPUSCULE_DEG).toBeGreaterThan(15)
    expect(DEPRESSION_FIN_CREPUSCULE_DEG).toBeLessThan(16)
    const fin = sbCrepusculeZenith(DEPRESSION_FIN_CREPUSCULE_DEG - 1e-9)
    expect(fin?.value).toBeCloseTo(SB_NUIT_SITE_REFERENCE_MAG, 6)
  })

  it('plafonne au bord bas de la table et le déclare, au lieu de prolonger', () => {
    const bord = sbCrepusculeZenith(DEPRESSION_MIN_TABLE_DEG)
    expect(bord).not.toBeNull()
    expect(bord?.value).toBeCloseTo(CREPUSCULE_V.a0, 10)
    expect(bord?.borne).toBe('AUCUNE')
    // Crépuscule civil, et Soleil encore au-dessus de l'horizon : même valeur, borne déclarée.
    for (const depression of [DEPRESSION_MIN_TABLE_DEG - 1e-9, 0, -5]) {
      const sous = sbCrepusculeZenith(depression)
      expect(sous?.value).toBeCloseTo(CREPUSCULE_V.a0, 10)
      expect(sous?.borne).toBe('CIEL_PLUS_CLAIR')
    }
  })

  it('refuse de répondre au-delà du crépuscule, et pour une entrée non finie', () => {
    expect(sbCrepusculeZenith(DEPRESSION_FIN_CREPUSCULE_DEG)).toBeNull()
    expect(sbCrepusculeZenith(Number.NaN)).toBeNull()
  })
})

describe('la contribution du crépuscule', () => {
  it('est exactement nulle dès la nuit astronomique, et le reste', () => {
    expect(HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG).toBeGreaterThan(DEPRESSION_FIN_CREPUSCULE_DEG)
    for (const depression of [HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG, 20, 40, 90]) {
      expect(brillanceCrepusculeNl(depression)).toBe(0)
    }
    // Le fond redevient celui du site au pixel près : la valeur, pas un arrondi voisin.
    expect(
      sbEffectifRendu({
        sbSiteMag: SB_B1,
        hauteurDeg: ZENITH_DEG,
        depressionSolaireDeg: HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG,
      }),
    ).toBe(sbEffectifRendu({ sbSiteMag: SB_B1, hauteurDeg: ZENITH_DEG }))
  })

  /**
   * Le polynôme a son sommet à 18,3° de dépression puis REDESCEND : prolongé, il rendrait un
   * ciel de crépuscule en pleine nuit. Ce test est là pour que personne ne « corrige » le
   * garde-fou en croyant élargir le domaine.
   */
  it('ne réapparaît pas au-delà du sommet du polynôme', () => {
    const { a1, a2 } = CREPUSCULE_V
    const sommet = DEPRESSION_MIN_TABLE_DEG + -a1 / (2 * a2)
    expect(sommet).toBeGreaterThan(DEPRESSION_FIN_CREPUSCULE_DEG)
    expect(brillanceCrepusculeNl(sommet + 5)).toBe(0)
  })

  it('croît quand le Soleil remonte, sans saut au raccord', () => {
    const pas = 0.1
    let precedent = 0
    for (let depression = DEPRESSION_FIN_CREPUSCULE_DEG; depression >= 0; depression -= pas) {
      const b = brillanceCrepusculeNl(depression)
      expect(b).toBeGreaterThanOrEqual(precedent)
      precedent = b
    }
    // Continuité au raccord : de part et d'autre, l'écart au fond du site le plus sombre de la
    // table reste sous le centième de magnitude — donc invisible au glissement du curseur.
    const juste = sbZenithAvecCrepuscule(SB_B1, DEPRESSION_FIN_CREPUSCULE_DEG - 1e-2)
    expect(SB_B1 - juste).toBeLessThan(0.01)
    expect(SB_B1 - juste).toBeGreaterThan(0)
  })

  /**
   * Le crépuscule est une lueur ATMOSPHÉRIQUE : elle s'ajoute à celle du site, elle ne la
   * remplace pas. Un ciel de ville reste plus clair qu'un col de montagne à la même dépression.
   */
  it('s’ajoute au site en nanolamberts, sans jamais l’assombrir', () => {
    for (const depression of [6, 10, 14]) {
      const bCrepuscule = brillanceCrepusculeNl(depression)
      expect(bCrepuscule).toBeGreaterThan(0)
      expect(nanolamberts(sbZenithAvecCrepuscule(SB_B1, depression))).toBeCloseTo(
        nanolamberts(SB_B1) + bCrepuscule,
        6,
      )
      expect(sbZenithAvecCrepuscule(SB_B8, depression)).toBeLessThan(
        sbZenithAvecCrepuscule(SB_B1, depression),
      )
    }
  })
})

describe('ce que l’utilisateur voit', () => {
  /**
   * Le critère du ticket : à Soleil −6°, la vue réaliste ne montre qu'une poignée d'étoiles.
   * Le fond effectif sort alors par le bas de la table Bortle — T-0357 : la magnitude limite
   * suit le seuil de Schaefer, SOUS le bord de table, et le DIT (précédent T-0100).
   */
  it('à Soleil −6°, plafonne la magnitude limite sous le bord de table et le déclare', () => {
    const sb = sbZenithAvecCrepuscule(SB_B1, 6)
    expect(sb).toBeLessThan(interpoleBortle(9).sb)
    const rendue = magnitudeRendue(FOV_DEG, sb, true)
    expect(rendue.value).toBeLessThan(M_LIM_OEIL_PLANCHER)
    expect(rendue.flags).toContain('HORS_DOMAINE')
    expect(rendue.note).toContain('plus clair que Bortle 9')
    // Et en pleine nuit sur le même site, la scène montre bien plus d'étoiles.
    expect(magnitudeRendue(FOV_DEG, SB_B1, true).value).toBeGreaterThan(rendue.value)
  })

  it('ne fait pas virer la teinte du fond tant que l’œil n’a pas à s’adapter', () => {
    const chroma = [
      K('CHROMA_FOND_CIEL_R'),
      K('CHROMA_FOND_CIEL_V'),
      K('CHROMA_FOND_CIEL_B'),
    ] as const
    for (const depression of [12, 20]) {
      const sb = sbZenithAvecCrepuscule(SB_B1, depression)
      expect(adaptationEcran(sb)).toBe(1)
      const composantes = composantesFond(sb)
      const facteur = composantes[1] / chroma[1]
      for (let i = 0; i < 3; i++) expect(composantes[i]).toBeCloseTo(facteur * chroma[i]!, 12)
    }
  })

  it('au crépuscule civil, le zénith plafonne à la luminance adaptée et bleuit', () => {
    const sb = sbZenithAvecCrepuscule(SB_B1, 6)
    expect(adaptationEcran(sb)).toBeLessThan(1)
    const [r, v, b] = composantesFond(sb)
    expect(b).toBeCloseTo(K('LUMINANCE_ECRAN_ZENITH_ADAPTE'), 12)
    // Plus bleu que la nuit : le rouge perd sur le bleu.
    expect(r / b).toBeLessThan(K('CHROMA_FOND_CIEL_R'))
    expect(v / b).toBeLessThan(K('CHROMA_FOND_CIEL_V'))
  })

  /**
   * Le cas dégradé du ticket : nuit d'été à haute latitude. À 50°, le Soleil descend à 16,6°
   * sous l'horizon au milieu de nuit — la nuit ASTRONOMIQUE est nulle, mais la dépression a
   * déjà dépassé la fin du crépuscule mesuré : la contribution est nulle, et le fond est celui
   * du site. Ni noir, ni absent. À 58°, le crépuscule NAUTIQUE est permanent et la
   * contribution ne s'annule jamais : le fond y reste plus clair toute la nuit.
   */
  it('rend la nuit d’été à haute latitude sans fond noir ni valeur absente', () => {
    const solstice = new Date('2026-06-21T12:00:00Z')
    const depressionAuMilieuDeNuit = (latitudeDeg: number): number => {
      const site: Site = { latitudeDeg, longitudeDeg: 0, altitudeM: 100 }
      const nuit = fenetreNocturne(site, solstice)
      expect(nuit.etat).toBe('PAS_DE_NUIT_ASTRONOMIQUE')
      const milieu = nuit.milieuNuitVrai
      expect(milieu).not.toBeNull()
      return -positionCorps(Body.Sun, milieu!, site).hauteurDeg
    }

    const a50 = depressionAuMilieuDeNuit(50)
    expect(a50).toBeLessThan(HAUTEUR_CREPUSCULE_ASTRONOMIQUE_DEG)
    const sb50 = sbZenithAvecCrepuscule(SB_B1, a50)
    expect(Number.isFinite(sb50)).toBe(true)
    expect(composantesFond(sb50)[1]).toBeGreaterThan(0)

    const a58 = depressionAuMilieuDeNuit(58)
    expect(a58).toBeLessThan(DEPRESSION_FIN_CREPUSCULE_DEG)
    expect(brillanceCrepusculeNl(a58)).toBeGreaterThan(0)
    expect(sbZenithAvecCrepuscule(SB_B1, a58)).toBeLessThan(SB_B1)
  })
})
