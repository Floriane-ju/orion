/**
 * T-0204 — what choosing a boîtier removes, and leaves.
 * Static render: structure, not interaction. Known boîtier must ask NO capteur question: a
 * leftover field, filled by something other than the user, looks like a question to answer.
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PanneauBoitier } from '../src/ui/PanneauBoitier.tsx'
import { BASE_BOITIERS, boitierDeBase, ligneBoitier } from '../src/data/boitiers.ts'
import { isoRecommande, type SaisieBoitier } from '../src/data/equipment.ts'
import { K } from '../src/registry/constants.ts'
import { GLOSSAIRE } from '../src/registry/glossaire.ts'
import { evalueMateriel, grandeursMateriel } from '../src/ui/app-calcul.ts'
import { DEFAUT, type SaisieMateriel } from '../src/ui/app-saisie.ts'

const rien = () => undefined

const SAISIE: SaisieBoitier = {
  formatCapteur: 'PLEIN_FORMAT',
  resolutionMpx: '24',
  readNoiseE: '',
  seuilDoubleGainIso: '',
  zpSys: '',
  tailleRawMo: '',
}

/** Default matériel, silent callbacks: only boîtier + ISO vary. */
const MATERIEL_VIDE: SaisieMateriel = {
  boitierId: '',
  surBoitierId: rien,
  boitier: SAISIE,
  surBoitier: rien,
  iso: '',
  surIso: rien,
  objectifs: [],
  surObjectifs: rien,
  objectifId: '',
  surObjectifId: rien,
  focale: DEFAUT.focale,
  surFocale: rien,
  ouverture: DEFAUT.ouverture,
  surOuverture: rien,
  capteurMode: 'FULL_FRAME',
  surCapteurMode: rien,
  typeObjectif: 'RECTILINEAIRE',
  surTypeObjectif: rien,
  suiviActif: false,
  surSuiviActif: rien,
  qualiteMes: 'INCONNUE',
  surQualiteMes: rien,
  typeMonture: 'TRACKER',
  surTypeMonture: rien,
}

/** Database boîtier with known double-gain threshold: there is an ISO to display. */
const AVEC_SEUIL = BASE_BOITIERS.find(
  (b) => boitierDeBase(b).seuilDoubleGainIso !== undefined,
)!

/**
 * T-0205 — choosing a database boîtier prefills image weight (`app-saisie.ts`), not removes it.
 * Rendered in that state, else it checks a screen the app never produces.
 */
function rendu(boitierId: string, iso = '') {
  const ligne = BASE_BOITIERS.find((b) => b.id === boitierId)
  const saisie: SaisieBoitier =
    ligne === undefined ? SAISIE : { ...SAISIE, tailleRawMo: ligne.saisie.tailleRawMo }
  return renderToStaticMarkup(
    <PanneauBoitier
      boitierId={boitierId}
      surBoitierId={rien}
      boitier={saisie}
      surBoitier={rien}
      iso={iso}
      surIso={rien}
      capteurMode="FULL_FRAME"
      surCapteurMode={rien}
      lectureIso={isoRecommande(
        ligne === undefined ? null : boitierDeBase(ligne, saisie.tailleRawMo),
        // T-0206 — as `evalueMateriel`: under a database boîtier, input ISO no longer counts;
        // passing it would render a screen the app doesn't produce.
        ligne !== undefined || iso === '' ? null : Number(iso),
      )}
    />,
  )
}

/** ISO = panel's only `inputmode="numeric"` field (weight: `decimal`). */
const CHAMP_ISO = /inputmode="numeric"/iu

describe('panneau boîtier', () => {
  it('propose toujours le mode personnalisé et chaque ligne de la base', () => {
    const html = rendu('')
    expect(html).toContain('Personnalisé')
    for (const b of BASE_BOITIERS) expect(html, b.id).toContain(`value="${b.id}"`)
  })

  it('mode personnalisé : les champs du capteur sont là', () => {
    const html = rendu('')
    expect(html).toContain(GLOSSAIRE.resolution_capteur.libelle)
    expect(html).toContain(GLOSSAIRE.poids_image.libelle)
    expect(html).toContain(GLOSSAIRE.format_capteur.libelle)
    expect(html).toContain('Pitch calculé')
    expect(html).toContain('mode avancé')
  })

  it('boîtier connu : plus rien à décrire du capteur', () => {
    const html = rendu(AVEC_SEUIL.id)
    expect(html).not.toContain(GLOSSAIRE.resolution_capteur.libelle)
    expect(html).not.toContain(GLOSSAIRE.format_capteur.libelle)
    expect(html).not.toContain('Pitch calculé')
    expect(html).not.toContain('mode avancé')
  })

  it('boîtier connu : le poids d’une image reste un champ, prérempli par la ligne', () => {
    const avecRaw = BASE_BOITIERS.find((b) => b.saisie.tailleRawMo.trim() !== '')!
    const html = rendu(avecRaw.id)
    expect(html).toContain(GLOSSAIRE.poids_image.libelle)
    expect(html).toContain(`value="${avecRaw.saisie.tailleRawMo}"`)
  })

  it('boîtier connu : l’ISO est un énoncé en lecture seule, tiré du seuil de double gain', () => {
    const html = rendu(AVEC_SEUIL.id)
    expect(html).not.toMatch(CHAMP_ISO)
    expect(html).toContain(String(boitierDeBase(AVEC_SEUIL).seuilDoubleGainIso))
    expect(html).not.toContain('Modifier')
  })

  it('un ISO traîné d’avant ne rouvre pas le champ : le seuil garde la main', () => {
    const html = rendu(AVEC_SEUIL.id, '100')
    expect(html).not.toMatch(CHAMP_ISO)
    expect(html).toContain(`: ${isoRecommande(boitierDeBase(AVEC_SEUIL)).iso}`)
    expect(html).not.toContain('choisi à la main')
  })

  it('mode personnalisé : l’ISO se saisit comme avant', () => {
    expect(rendu('')).toMatch(CHAMP_ISO)
  })

  it('un identifiant absent de la base retombe sur le mode personnalisé', () => {
    expect(rendu('boitier-qui-n-existe-pas')).toContain(GLOSSAIRE.resolution_capteur.libelle)
  })
})

describe('T-0204 — une ligne incomplète le dit, une ligne complète se tait', () => {
  /** Row carrying its read-noise curve: no complaint. */
  it('ne reproche rien à une ligne dont la courbe est là', () => {
    for (const b of BASE_BOITIERS) {
      if (Object.keys(b.readNoiseE).length === 0) continue
      expect(rendu(b.id), b.id).not.toContain('Base incomplète')
    }
  })

  /**
   * T-0205 — empty "Poids RAW" column no longer makes the row incomplete: the quantity has its
   * field, and the field alert (T-0199) says what registry puts there.
   */
  it('une ligne sans poids RAW n’est pas une base incomplète', () => {
    const sansRaw = BASE_BOITIERS.find((b) => b.saisie.tailleRawMo.trim() === '')
    if (sansRaw === undefined) return
    const html = rendu(sansRaw.id)
    expect(html).not.toContain('Base incomplète')
    expect(html).toContain(String(K('TAILLE_RAW_MO_GENERIQUE')))
  })
})

/**
 * T-0206 — screen shows the threshold step; engine must compute with it. Else an ISO typed
 * before choosing the boîtier (or re-read from saved profile) silently drives pose behind a
 * contradicting display.
 */
describe('T-0206 — un ISO forcé ne survit pas au choix d’un boîtier', () => {
  function materiel(boitierId: string, iso: string): SaisieMateriel {
    return {
      ...MATERIEL_VIDE,
      boitierId,
      iso,
      boitier: { ...SAISIE, tailleRawMo: ligneBoitier(boitierId)?.saisie.tailleRawMo ?? '' },
    }
  }

  it('le moteur retient le palier du seuil, pas l’ISO resté dans la saisie', () => {
    const attendu = isoRecommande(boitierDeBase(AVEC_SEUIL)).iso
    const saisie = materiel(AVEC_SEUIL.id, '100')
    const calcul = evalueMateriel(saisie, grandeursMateriel(saisie))
    expect(calcul.ok).toBe(true)
    if (!calcul.ok) return
    expect(calcul.iso.iso).toBe(attendu)
    expect(calcul.iso.choisiParUtilisateur).toBe(false)
  })

  it('en mode personnalisé, le même ISO est bien retenu : c’est le boîtier qui le neutralise', () => {
    const saisie = materiel('', '100')
    const calcul = evalueMateriel(saisie, grandeursMateriel(saisie))
    expect(calcul.ok).toBe(true)
    if (!calcul.ok) return
    expect(calcul.iso.iso).toBe(100)
  })
})
