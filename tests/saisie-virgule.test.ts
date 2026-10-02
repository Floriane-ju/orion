/**
 * T-0274 — §4.1 et §5.1 : la virgule décimale est une écriture, pas une faute.
 *
 * La table est DÉRIVÉE de `DOMAINES` : aucune valeur n'est recopiée, et un domaine ajouté
 * demain est couvert sans qu'on y pense. Le seul littéral du fichier est « 2,8 » — la saisie
 * même que le ticket a mesurée refusée, et dont l'acceptation est le critère.
 */

import { describe, expect, it } from 'vitest'
import { DOMAINES, nombreDeTexte, type DomaineId, type DomaineSaisie } from '../src/registry/domains.ts'
import { nombreSaisi } from '../src/ui/saisie-bornee.ts'
import { resoutBoitier, type SaisieBoitier } from '../src/data/equipment.ts'

const TOUS = Object.keys(DOMAINES) as readonly DomaineId[]

/** Une valeur du domaine qui porte une décimale : sans elle, le séparateur ne prouverait rien. */
function valeurDecimale(d: DomaineSaisie): number {
  const milieu = (d.min + d.max) / 2
  return Number.isInteger(milieu) ? milieu + 0.5 : milieu
}

function ecritureFrancaise(valeur: number): string {
  return String(valeur).replace('.', ',')
}

describe('nombreDeTexte() — la virgule vaut le point', () => {
  it.each(TOUS)('%s : la même valeur, écrite à la française, traverse sans refus', (champ) => {
    const attendue = valeurDecimale(DOMAINES[champ])
    const r = nombreSaisi(champ, ecritureFrancaise(attendue))
    expect(r.valeur).toBe(attendue)
    expect(r.refus).toBeNull()
  })

  it.each(TOUS)('%s : le point reste accepté — rien n’est retiré', (champ) => {
    const attendue = valeurDecimale(DOMAINES[champ])
    expect(nombreSaisi(champ, String(attendue))).toEqual({ valeur: attendue, refus: null })
  })

  it('« 2,8 » dans Ouverture donne f/2.8, la saisie que le ticket a mesurée refusée', () => {
    expect(nombreSaisi('ouverture_N', '2,8')).toEqual({ valeur: 2.8, refus: null })
  })

  it('un champ vide reste vide : la virgule ne fait pas apparaître un zéro', () => {
    expect(nombreDeTexte('')).toBeNaN()
    expect(nombreDeTexte(' ')).toBeNaN()
    expect(nombreDeTexte(',')).toBeNaN()
  })

  it.each(TOUS)('%s : un texte illisible est refusé en nommant le format attendu', (champ) => {
    const refus = nombreSaisi(champ, 'deux virgule huit').refus
    expect(refus).toContain(DOMAINES[champ].champ)
    expect(refus).toContain('virgule décimale')
  })
})

describe('§5.1 — le boîtier saisi lit aussi la virgule', () => {
  function saisie(partiel: Partial<SaisieBoitier> = {}): SaisieBoitier {
    return {
      formatCapteur: 'APSC_NIKON',
      resolutionMpx: ecritureFrancaise(valeurDecimale(DOMAINES.resolution_mpx)),
      readNoiseE: '',
      seuilDoubleGainIso: '',
      zpSys: '',
      tailleRawMo: '',
      ...partiel,
    }
  }

  it('résolution et poids d’image écrits à la française donnent le même boîtier', () => {
    const attenduRaw = valeurDecimale(DOMAINES.taille_raw_mo)
    const virgule = resoutBoitier(saisie({ tailleRawMo: ecritureFrancaise(attenduRaw) }))
    const point = resoutBoitier(
      saisie({
        resolutionMpx: String(valeurDecimale(DOMAINES.resolution_mpx)),
        tailleRawMo: String(attenduRaw),
      }),
    )
    expect(virgule.tailleRawMo).toBe(attenduRaw)
    expect(virgule).toEqual(point)
  })
})
