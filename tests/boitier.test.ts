/**
 * §5.1 — aucun boîtier ne se choisit dans une liste : type de capteur et résolution décrivent
 * le matériel, et le pitch s'en déduit.
 *
 * Le cas limite du PRD est celui qui compte : un profil sans bruit de lecture renseigné doit
 * produire une pose calculée avec le repli du registre, affichée, et marquée [ESTIMÉ] —
 * jamais un résultat qui passe pour une mesure (§2.3, §7.1).
 */

import { describe, expect, it } from 'vitest'
import {
  BOITIER_REFERENCE,
  capteurEffectif,
  isoRecommande,
  libelleZpSource,
  pointZeroSysteme,
  notesEstimation,
  resoutBoitier,
  type SaisieBoitier,
} from '../src/data/equipment.ts'
import { ligneFormatCapteur, pitchDepuisFormat } from '../src/registry/capteur-formats.ts'
import { fluxCiel, poseUnitaire } from '../src/core/exposure.ts'
import { DOMAINES, SaisieRefuseeError } from '../src/registry/domains.ts'
import { K } from '../src/registry/constants.ts'
import { LIBELLE_ZP_SOURCE } from '../src/registry/libelles.ts'

/** Un boîtier saisi dont seuls le format de capteur et la résolution sont renseignés. */
function saisie(partiel: Partial<SaisieBoitier> = {}): SaisieBoitier {
  return {
    formatCapteur: 'APSC_NIKON',
    resolutionMpx: '24',
    readNoiseE: '',
    seuilDoubleGainIso: '',
    zpSys: '',
    tailleRawMo: '',
    ...partiel,
  }
}

describe('§5.1 — le boîtier saisi à la main', () => {
  it('reprend le format et la résolution saisis, jamais les grandeurs d’un autre appareil', () => {
    const boitier = resoutBoitier(saisie())
    const format = ligneFormatCapteur('APSC_NIKON')
    expect(boitier.id).toBe('saisi')
    expect(boitier.capteurLMm).toBe(format.capteurLMm)
    expect(boitier.capteurHMm).toBe(format.capteurHMm)
    expect(boitier.pitchUm).toBeCloseTo(pitchDepuisFormat(format, 24), 6)
    expect(boitier.pitchUm).not.toBe(BOITIER_REFERENCE.pitchUm)
  })

  it('refuse une grandeur manquante ou hors domaine en nommant le champ fautif', () => {
    expect(() => resoutBoitier(saisie({ resolutionMpx: '' }))).toThrow(SaisieRefuseeError)
    expect(() => resoutBoitier(saisie({ resolutionMpx: '' }))).toThrow(DOMAINES.resolution_mpx.champ)
    expect(() =>
      resoutBoitier(saisie({ resolutionMpx: String(DOMAINES.resolution_mpx.max + 1) })),
    ).toThrow(/hors de la plage/)
    // Résolution dans son propre domaine mais physiquement incohérente avec le format choisi :
    // le pitch dérivé est refusé, pas la résolution elle-même.
    expect(() =>
      resoutBoitier(saisie({ formatCapteur: 'PLEIN_FORMAT', resolutionMpx: '1' })),
    ).toThrow(DOMAINES.pitch_um.champ)
    expect(() => resoutBoitier(saisie({ zpSys: String(DOMAINES.zp_sys.min - 1) }))).toThrow(
      DOMAINES.zp_sys.champ,
    )
  })

  it('garde le recadrage APS-C dans le boîtier : il change les dimensions, jamais le pitch', () => {
    const boitier = resoutBoitier(saisie({ formatCapteur: 'PLEIN_FORMAT', resolutionMpx: '33' }))
    const entier = capteurEffectif(boitier, 'FULL_FRAME')
    const recadre = capteurEffectif(boitier, 'APSC_CROP')
    expect(recadre.pitchUm).toBe(entier.pitchUm)
    expect(recadre.capteurLMm).toBeLessThan(entier.capteurLMm)
    expect(recadre.noteRecadrage).toMatch(/pas grossissement/)
  })
})

describe('§5.1 cas limite — profil sans bruit de lecture renseigné', () => {
  const boitier = resoutBoitier(saisie())
  const notes = notesEstimation(saisie())
  const iso = isoRecommande(boitier)
  const zeroSysteme = pointZeroSysteme(boitier)

  it('applique le bruit de lecture de repli du registre, et l’affiche', () => {
    expect(iso.readNoiseE).toBeNull()
    const pose = poseUnitaire({
      eCiel: fluxCiel({
        sbMagArcsec2: 20.95,
        zpSys: zeroSysteme.valeur,
        pitchUm: boitier.pitchUm,
        ouvertureN: 2.8,
        zpEstime: zeroSysteme.estime,
      }).value,
      readNoiseE: iso.readNoiseE,
      tMaxS: null,
      zpEstime: zeroSysteme.estime,
    })
    expect(pose.readNoiseUtiliseE).toBe(K('READ_NOISE_DEFAUT_E'))
    expect(pose.readNoiseEstime).toBe(true)
    expect(pose.tOptS.flags).toContain('ESTIME')
    expect(notes.readNoiseE).toContain(String(K('READ_NOISE_DEFAUT_E')))
  })

  // T-0275 — §7.1 exige que la SOURCE du point zéro soit affichée, pas que le nom du champ
  // le soit : la phrase dit désormais « source : valeur générique », et l'exigence tient.
  it('applique le point zéro générique et le dit dans la source affichée (§7.1)', () => {
    expect(zeroSysteme.source).toBe('GENERIQUE')
    expect(zeroSysteme.estime).toBe(true)
    expect(zeroSysteme.valeur).toBe(K('ZP_SYS_GENERIQUE'))
    expect(libelleZpSource(zeroSysteme)).toContain(LIBELLE_ZP_SOURCE.GENERIQUE)
    expect(libelleZpSource(zeroSysteme)).toContain('[ESTIMÉ]')
    // Le point zéro saisi, lui, n'est plus le générique : la mention [ESTIMÉ] disparaît.
    const declare = pointZeroSysteme(resoutBoitier(saisie({ zpSys: '20.5' })))
    expect(declare.source).toBe('BASE_MATERIEL')
    expect(libelleZpSource(declare)).toContain(LIBELLE_ZP_SOURCE.BASE_MATERIEL)
    expect(libelleZpSource(declare)).not.toContain('[ESTIMÉ]')
  })

  it('remplace la taille de RAW par le générique du registre, jamais par celle d’un autre', () => {
    expect(boitier.tailleRawMo).toBe(K('TAILLE_RAW_MO_GENERIQUE'))
    expect(notes.tailleRawMo).toContain(String(K('TAILLE_RAW_MO_GENERIQUE')))
    const renseigne = resoutBoitier(saisie({ tailleRawMo: '20' }))
    expect(renseigne.tailleRawMo).toBe(20)
  })
})

describe('§7.2 — l’ISO retenu se voit, se justifie et se change', () => {
  it('rattache le bruit de lecture saisi au seuil de double gain déclaré', () => {
    const boitier = resoutBoitier(saisie({ readNoiseE: '2.4', seuilDoubleGainIso: '800' }))
    const iso = isoRecommande(boitier)
    expect(iso.iso).toBe(800)
    expect(iso.readNoiseE).toBe(2.4)
    expect(iso.message).toMatch(/double gain/)
  })

  it('n’invente aucun bruit de lecture à un ISO choisi hors de la courbe', () => {
    const iso = isoRecommande(BOITIER_REFERENCE, 200)
    expect(iso.iso).toBe(200)
    expect(iso.readNoiseE).toBeNull()
    expect(iso.choisiParUtilisateur).toBe(true)
    expect(iso.message).toContain(String(BOITIER_REFERENCE.seuilDoubleGainIso))
    expect(iso.message).toMatch(/\[ESTIMÉ\]/)
  })

  it('ne prétend à aucun palier quand le seuil de double gain n’est pas renseigné', () => {
    const boitier = resoutBoitier(saisie({ readNoiseE: '2.4' }))
    const iso = isoRecommande(boitier)
    expect(iso.isoRecommandeParSeuil).toBeNull()
    expect(iso.readNoiseE).toBeNull()
    expect(iso.message).toMatch(/pas renseigné/)
  })
})

/**
 * T-0199 — la note d'une grandeur absente appartient à SON champ. Ce qui se vérifie ici n'est
 * pas le texte mais l'indexation : une note posée sur le mauvais champ afficherait l'alerte
 * loin de la saisie qui l'éteint, ce que le bloc d'encadrés faisait déjà.
 */
describe('§5.1 — les notes d’estimation, champ par champ', () => {
  it('ne note que les grandeurs vides, et sous leur propre clé', () => {
    expect(Object.keys(notesEstimation(saisie())).sort()).toEqual(
      ['readNoiseE', 'seuilDoubleGainIso', 'tailleRawMo', 'zpSys'].sort(),
    )
    const complet = saisie({
      readNoiseE: '2.4',
      seuilDoubleGainIso: '800',
      zpSys: '20.5',
      tailleRawMo: '30',
    })
    expect(notesEstimation(complet)).toEqual({})
  })

  it('dit au seuil de double gain qu’il rend inutilisable le bruit de lecture saisi', () => {
    // §7.2 — un bruit de lecture sans ISO auquel le rattacher ne sert à rien : c'est le seuil
    // qui manque, et c'est donc lui qui doit porter l'alerte.
    const notes = notesEstimation(saisie({ readNoiseE: '2.4' }))
    expect(notes.readNoiseE).toBeUndefined()
    expect(notes.seuilDoubleGainIso).toContain('bruit de lecture')
  })

  it('reste disponible quand la saisie est refusée, là où aucun boîtier ne se résout', () => {
    const sansResolution = saisie({ resolutionMpx: '' })
    expect(() => resoutBoitier(sansResolution)).toThrow(SaisieRefuseeError)
    expect(notesEstimation(sansResolution).readNoiseE).toContain(String(K('READ_NOISE_DEFAUT_E')))
  })
})
