/**
 * T-0400 — la Lune voile le filé : profondeur d'une trace sous une séquence empilée, et gêne
 * lunaire étoile par étoile. Les attendus se construisent avec les fonctions du modèle, jamais
 * avec une valeur recopiée.
 */
import { describe, expect, it } from 'vitest'
import {
  magnitudeLimitePrevisu,
  opaciteEtoile,
  tableProfondeurParPixel,
  profondeurPourZ,
  type EntreeProfondeur,
} from '../src/core/galactique.ts'
import { poseParPixelS } from '../src/core/file-etoiles.ts'
import { npf, tacheNpfArcsec } from '../src/core/suivi.ts'
import { brillanceLuneNl, nanolamberts } from '../src/core/moon.ts'
import {
  fondLune,
  luneFile,
  opaciteSousLune,
  profondeurSousLune,
  rapportFondLune,
  type LuneFile,
} from '../src/core/fond-lune-file.ts'
import { instantsTrajetLune, trajetLune, cacheTrajetLune } from '../src/core/trajet-lune.ts'
import { cielInstantane } from '../src/core/horloges.ts'
import { applique, transpose, versVecteur, DEG, type Vec3 } from '../src/core/mat3.ts'
import { K } from '../src/registry/constants.ts'
import { MS_PAR_MINUTE } from '../src/core/unites.ts'
import { SITE_REFERENCE } from './fixtures.ts'

const SB_SITE = 21
const PROFONDEUR: EntreeProfondeur = {
  tPoseS: 25,
  dMm: 7,
  zpSys: K('ZP_SYS_GENERIQUE'),
  eCielPxS: 4,
  readNoiseE: 1.5,
}
const TACHE_ARCSEC = 30

describe('§9.3 — profondeur d’une séquence empilée', () => {
  it('le fond accumulé plus longtemps que le signal rend la pose moins profonde', () => {
    const sans = magnitudeLimitePrevisu(PROFONDEUR).value
    const avec = magnitudeLimitePrevisu({ ...PROFONDEUR, tPoseS: 2, tFondS: PROFONDEUR.tPoseS }).value
    expect(avec).toBeLessThan(magnitudeLimitePrevisu({ ...PROFONDEUR, tPoseS: 2 }).value)
    expect(avec).toBeLessThan(sans)
  })

  it('sans tFondS, le fond s’accumule sur la pose : rien ne change', () => {
    expect(magnitudeLimitePrevisu({ ...PROFONDEUR, tFondS: PROFONDEUR.tPoseS }).value).toBe(
      magnitudeLimitePrevisu(PROFONDEUR).value,
    )
  })

  const table = tableProfondeurParPixel({ profondeur: PROFONDEUR, tacheArcsec: TACHE_ARCSEC, suiviActif: false })

  it('près du pôle, une trace ne reçoit pas plus qu’une pose unitaire', () => {
    // Un empilement en éclaircir garde le maximum des poses, il n'additionne pas le signal :
    // une étoile qui ne quitte pas son pixel y reçoit une pose unitaire, pas la séance.
    const grossier = tableProfondeurParPixel({
      profondeur: PROFONDEUR,
      tacheArcsec: TACHE_ARCSEC * 1e3,
      suiviActif: false,
    })
    expect(profondeurPourZ(grossier, 1)).toBeCloseTo(magnitudeLimitePrevisu(PROFONDEUR).value, 6)
  })

  it('à l’équateur, signal sur la traversée d’un pixel, fond sur toute la pose unitaire', () => {
    const tPix = poseParPixelS(PROFONDEUR.tPoseS, TACHE_ARCSEC, 0)
    expect(profondeurPourZ(table, 0)).toBeCloseTo(
      magnitudeLimitePrevisu({ ...PROFONDEUR, tPoseS: tPix, tFondS: PROFONDEUR.tPoseS }).value,
      1,
    )
  })

  it('une pose unitaire plus longue éteint les traces faibles', () => {
    const longue = tableProfondeurParPixel({
      profondeur: { ...PROFONDEUR, tPoseS: 4 * PROFONDEUR.tPoseS },
      tacheArcsec: TACHE_ARCSEC,
      suiviActif: false,
    })
    expect(profondeurPourZ(longue, 0)).toBeLessThan(profondeurPourZ(table, 0))
  })
})

/** Une Lune posée à la main, dans un repère où J2000 et horizontal coïncident. */
function luneA(altLuneDeg: number, anglePhaseDeg: number): LuneFile {
  return {
    direction: versVecteur(180, altLuneDeg),
    verticale: { x: 0, y: 0, z: 1 },
    anglePhaseDeg,
    altitudeDeg: altLuneDeg,
    sbSiteMag: SB_SITE,
  }
}

describe('T-0400 — gêne lunaire par étoile', () => {
  const lune = luneA(40, 30)

  it('le fond relatif est celui de KS91 : 1 + B_lune / B_site', () => {
    const etoile = versVecteur(150, 50)
    const sepDeg = Math.acos(etoile.x * lune.direction.x + etoile.y * lune.direction.y + etoile.z * lune.direction.z) / DEG
    const attendu =
      1 +
      brillanceLuneNl({
        altitudeLuneDeg: 40,
        altitudeCibleDeg: 50,
        separationDeg: sepDeg,
        anglePhaseDeg: 30,
      }) /
        nanolamberts(SB_SITE)
    expect(rapportFondLune(lune, etoile)).toBeCloseTo(attendu, 9)
  })

  it('sous l’horizon, l’étoile ne reçoit rien de la Lune', () => {
    expect(rapportFondLune(lune, versVecteur(0, -10))).toBe(1)
  })

  it('effet phare : plus près de la Lune, moins profond', () => {
    const fond = fondLune(lune, { profondeur: PROFONDEUR, tacheArcsec: TACHE_ARCSEC, suiviActif: false })
    const pres = versVecteur(185, 42)
    const loin = versVecteur(0, 42)
    expect(profondeurSousLune(fond, pres)).toBeLessThan(profondeurSousLune(fond, loin))
  })

  it('jamais plus profond que sans Lune', () => {
    const fond = fondLune(lune, { profondeur: PROFONDEUR, tacheArcsec: TACHE_ARCSEC, suiviActif: false })
    const table = tableProfondeurParPixel({ profondeur: PROFONDEUR, tacheArcsec: TACHE_ARCSEC, suiviActif: false })
    for (const v of [versVecteur(0, 10), versVecteur(90, 60), versVecteur(180, 41)]) {
      expect(profondeurSousLune(fond, v)).toBeLessThanOrEqual(profondeurPourZ(table, v.z) + 1e-9)
    }
  })

  it('une Lune plus pleine éteint plus d’étoiles', () => {
    const v = versVecteur(170, 45)
    const entree = { profondeur: PROFONDEUR, tacheArcsec: TACHE_ARCSEC, suiviActif: false }
    expect(profondeurSousLune(fondLune(luneA(40, 10), entree), v)).toBeLessThan(
      profondeurSousLune(fondLune(luneA(40, 120), entree), v),
    )
  })
})

describe('T-0400 — la Lune retenue pour la séance', () => {
  const debutMs = Date.parse('2026-10-08T21:00:00Z')
  const dureeMs = 6 * 60 * MS_PAR_MINUTE

  it('celle du moment où elle est la plus haute, en J2000 de cet instant', () => {
    const trajet = trajetLune(SITE_REFERENCE, debutMs, dureeMs, cacheTrajetLune())
    const instants = instantsTrajetLune(debutMs, dureeMs)
    const lune = luneFile(SITE_REFERENCE, instants, trajet, 30, SB_SITE)
    const plusHaute = trajet.reduce((m, p, i) => (p.hauteurDeg > trajet[m]!.hauteurDeg ? i : m), 0)
    if (trajet[plusHaute]!.hauteurDeg <= 0) {
      expect(lune).toBeNull()
      return
    }
    const versJ2000 = transpose(cielInstantane(SITE_REFERENCE, new Date(instants[plusHaute]!)).matrice)
    const p = trajet[plusHaute]!
    const attendue: Vec3 = applique(versJ2000, versVecteur(p.azimutDeg, p.hauteurDeg))
    expect(lune!.altitudeDeg).toBe(p.hauteurDeg)
    expect(lune!.direction.x).toBeCloseTo(attendue.x, 12)
    expect(lune!.direction.z).toBeCloseTo(attendue.z, 12)
  })

  it('couchée toute la séance : aucune gêne', () => {
    const trajet = [{ corps: 'Moon', adH: 0, decDeg: 0, azimutDeg: 0, hauteurDeg: -5 }] as const
    expect(luneFile(SITE_REFERENCE, [debutMs], trajet as never, 0, SB_SITE)).toBeNull()
  })
})

describe('T-0400 — tables de la passe', () => {
  it('restent à moins d’un dixième de magnitude du calcul exact', () => {
    const lune = luneA(35, 40)
    const entree = { profondeur: PROFONDEUR, tacheArcsec: TACHE_ARCSEC, suiviActif: false }
    const fond = fondLune(lune, entree)
    for (const [az, h] of [[180, 36], [170, 20], [90, 60], [0, 5], [200, 80]] as const) {
      const v = versVecteur(az, h)
      const decDeg = Math.asin(v.z) / DEG
      const exact = magnitudeLimitePrevisu({
        ...PROFONDEUR,
        tPoseS: poseParPixelS(PROFONDEUR.tPoseS, TACHE_ARCSEC, decDeg),
        tFondS: PROFONDEUR.tPoseS,
        eCielPxS: PROFONDEUR.eCielPxS * rapportFondLune(lune, v),
      }).value
      expect(Math.abs(profondeurSousLune(fond, v) - exact)).toBeLessThan(0.1)
    }
  })
})

describe('T-0400 — opacité selon le contraste au fond lunaire', () => {
  const entree = { profondeur: PROFONDEUR, tacheArcsec: TACHE_ARCSEC, suiviActif: false }
  const fond = fondLune(luneA(40, 10), entree)
  const pres = versVecteur(182, 41)
  const loin = versVecteur(0, 41)

  it('une trace faible pâlit plus près de la Lune', () => {
    expect(opaciteSousLune(fond, 7, pres)).toBeLessThan(opaciteSousLune(fond, 7, loin))
  })

  it('pâlit au-delà de la seule marge de détection', () => {
    const detection = opaciteEtoile(7, profondeurSousLune(fond, pres))
    expect(opaciteSousLune(fond, 7, pres)).toBeLessThan(detection)
  })

  it('une étoile très brillante garde son éclat : elle domine le fond', () => {
    expect(opaciteSousLune(fond, -1, pres)).toBeCloseTo(opaciteEtoile(-1, profondeurSousLune(fond, pres)), 1)
  })

  it('sous l’horizon de la Lune, le contraste est celui du site', () => {
    const v = versVecteur(0, -5)
    expect(opaciteSousLune(fond, 7, v)).toBeCloseTo(opaciteEtoile(7, profondeurSousLune(fond, v)), 12)
  })
})

/**
 * Une étoile s'étale sur sa tache, pas sur un pixel : tant qu'elle n'en sort pas — la NPF le dit —
 * elle reçoit toute la pose. Compter la traversée d'un pixel assombrissait une pose de 25 s par
 * rapport à une de 6 s, alors que les deux donnent des étoiles ponctuelles.
 */
describe('§9.3 — une étoile ponctuelle ne pâlit pas en allongeant la pose', () => {
  const OPTIQUE = { focaleMm: 10, ouvertureN: 2.8, pitchUm: 5.12 }
  const tacheArcsec = tacheNpfArcsec(OPTIQUE)
  const tNpfS = npf({ ...OPTIQUE, decDeg: 0 }).value!
  const profondeurA = (tPoseS: number): Float64Array =>
    tableProfondeurParPixel({ profondeur: { ...PROFONDEUR, tPoseS }, tacheArcsec, suiviActif: false })

  it('reçoit toute la pose jusqu’à la pose NPF, à l’équateur céleste', () => {
    expect(poseParPixelS(tNpfS, tacheArcsec, 0)).toBeCloseTo(tNpfS, 9)
  })

  it('va plus profond à la pose NPF qu’à une pose quatre fois plus courte, partout', () => {
    const courte = profondeurA(tNpfS / 4)
    const npfPose = profondeurA(tNpfS)
    courte.forEach((m, i) => expect(npfPose[i]!).toBeGreaterThan(m))
  })

  it('pâlit au-delà : la trace étale son flux, le fond continue de monter', () => {
    const iEquateur = Math.floor(K('CASES_TABLE_PROFONDEUR_TRACE') / 2)
    expect(profondeurA(4 * tNpfS)[iEquateur]!).toBeLessThan(profondeurA(tNpfS)[iEquateur]!)
  })
})
