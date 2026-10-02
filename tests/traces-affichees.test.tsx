/**
 * T-0386 — §10.1, §10.2 : la bulle d'une valeur tracée ne garde que la glose et ce que le
 * glossaire y ajoute ; la chaîne complète (N3) se lit dans la rubrique « Calcul » de la page
 * info, alimentée par les valeurs affichées.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { trace } from '../src/core/traced.ts'
import { GLOSSAIRE } from '../src/registry/glossaire.ts'
import { REGISTRE } from '../src/registry/constants.ts'
import { CalculsAffiches } from '../src/ui/CalculsAffiches.tsx'
import { Etiquette } from '../src/ui/Terme.tsx'
import { TracedValue } from '../src/ui/TracedValue.tsx'
import { inscritTrace, retireTrace } from '../src/ui/traces-affichees.ts'

const VOLUME = trace({
  value: 2,
  formula: 'VOLUME_STOCKAGE',
  inputs: { n_poses: 40, taille_raw_mo: 50 },
  constants: ['MO_PAR_GO'],
})

const ID = 'essai'

afterEach(() => retireTrace(ID))

describe('bulle d’une valeur tracée — T-0386', () => {
  it('ne porte plus formule, entrées ni constantes', () => {
    const html = renderToStaticMarkup(<TracedValue terme="volume_stockage" trace={VOLUME} />)
    expect(html).toContain('role="tooltip"')
    expect(html).not.toContain(VOLUME.formula.expression)
    expect(html).not.toContain('— source : ')
    expect(html).not.toContain('Votre valeur')
  })

  it('ajoute l’explication que le glossaire garde, valeur de l’entrée insérée', () => {
    const html = renderToStaticMarkup(<TracedValue terme="volume_stockage" trace={VOLUME} />)
    expect(GLOSSAIRE.volume_stockage.explication).toContain('{taille_raw_mo}')
    expect(html).toContain(`Taille d’une image : ${VOLUME.inputs.taille_raw_mo} Mo`)
    expect(html).not.toContain(GLOSSAIRE.volume_stockage.consequence)
  })

  it('s’en tient à la glose quand le glossaire n’y ajoute rien', () => {
    const entree = GLOSSAIRE.npf
    expect(entree.bulle).toBeUndefined()
    const html = renderToStaticMarkup(<TracedValue terme="npf" trace={VOLUME} />)
    expect(html).toContain(entree.glose)
    expect(html).not.toContain(entree.explication)
  })
})

describe('bulle d’un terme — T-0386', () => {
  it('porte glose, explication et conséquence', () => {
    const entree = GLOSSAIRE.sqm
    const html = renderToStaticMarkup(<Etiquette cle="sqm" />)
    expect(html).toContain(entree.glose)
    expect(html).toContain(entree.explication)
    expect(html).toContain(entree.consequence)
  })
  it('ajoute une précision calculée sans masquer la glose', () => {
    const precision = 'Précision propre à ce contexte.'
    const html = renderToStaticMarkup(<Etiquette cle="type_monture" precision={precision} />)
    expect(html).toContain(GLOSSAIRE.type_monture.glose)
    expect(html).toContain(precision)
  })

  it('n’ouvre aucune bulle sur un terme sans texte', () => {
    expect(renderToStaticMarkup(<Etiquette cle="cause_exclusion" />)).not.toContain('role="tooltip"')
  })
})

describe('rubrique « Calcul » — T-0386', () => {
  it('dit qu’il n’y a rien à montrer tant qu’aucune valeur n’est affichée', () => {
    expect(renderToStaticMarkup(<CalculsAffiches />)).toContain('Aucune valeur calculée')
  })

  it('rend la chaîne complète d’une valeur affichée, source des constantes comprise', () => {
    inscritTrace(ID, { terme: 'volume_stockage', suffixe: undefined, trace: VOLUME, valeur: '2 Go' })
    const html = renderToStaticMarkup(<CalculsAffiches />)
    expect(html).toContain(GLOSSAIRE.volume_stockage.libelle)
    expect(html).toContain('Votre valeur : 2 Go')
    expect(html).toContain(GLOSSAIRE.volume_stockage.consequence)
    expect(html).toContain(VOLUME.formula.expression)
    expect(html).toContain(`— source : ${REGISTRE.MO_PAR_GO.source}`)
  })

  it('oublie une valeur retirée de l’écran', () => {
    inscritTrace(ID, { terme: 'volume_stockage', suffixe: undefined, trace: VOLUME, valeur: '2 Go' })
    retireTrace(ID)
    expect(renderToStaticMarkup(<CalculsAffiches />)).toContain('Aucune valeur calculée')
  })
})
