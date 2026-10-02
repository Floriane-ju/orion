/**
 * T-0204 — ce que le choix d'un boîtier fait disparaître, et ce qu'il laisse.
 *
 * Le rendu est statique : on vérifie la structure produite, pas une interaction. Ce qui compte
 * ici est qu'un boîtier connu ne pose plus AUCUNE question sur le capteur — un champ resté là,
 * rempli par autre chose que l'utilisateur, vaut une question à laquelle il croira devoir
 * répondre.
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

/** Le matériel par défaut, tout en rappels muets : seuls le boîtier et l'ISO varient ici. */
const MATERIEL_VIDE: SaisieMateriel = {
  boitierId: '',
  surBoitierId: rien,
  boitier: SAISIE,
  surBoitier: rien,
  iso: '',
  surIso: rien,
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

/** Un boîtier de la base dont le seuil de double gain est connu : il y a un ISO à afficher. */
const AVEC_SEUIL = BASE_BOITIERS.find(
  (b) => boitierDeBase(b).seuilDoubleGainIso !== undefined,
)!

/**
 * T-0205 — choisir un boîtier de la base préremplit le poids d'une image dans la saisie
 * (`app-saisie.ts`) au lieu de le retirer. Le rendu se teste dans cet état, sinon on vérifierait
 * un écran que l'application ne produit jamais.
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
        // T-0206 — comme `evalueMateriel` : sous un boîtier de la base, l'ISO de la saisie ne
        // compte plus. Le passer ici rendrait un écran que l'application ne produit pas.
        ligne !== undefined || iso === '' ? null : Number(iso),
      )}
    />,
  )
}

/** L'ISO est le seul champ en `inputmode="numeric"` du panneau : le poids est en `decimal`. */
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
  /** Une ligne qui porte sa courbe de bruit de lecture ne se fait rien reprocher. */
  it('ne reproche rien à une ligne dont la courbe est là', () => {
    for (const b of BASE_BOITIERS) {
      if (Object.keys(b.readNoiseE).length === 0) continue
      expect(rendu(b.id), b.id).not.toContain('Base incomplète')
    }
  })

  /**
   * T-0205 — une colonne « Poids RAW » vide ne rend plus la ligne incomplète : la grandeur a son
   * champ, et c'est l'alerte du champ — le contrat T-0199 — qui dit ce que le registre y met.
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
 * T-0206 — l'écran affiche le palier du seuil ; le moteur doit calculer avec lui.
 *
 * Sans cette vérification, un ISO tapé avant le choix du boîtier — ou relu d'un profil
 * enregistré — piloterait la pose en douce derrière un affichage qui dit autre chose.
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
