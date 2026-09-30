import { describe, expect, it } from 'vitest'
import { CSP_DEVELOPPEMENT, CSP_PRODUCTION, politiqueDeSecurite } from '../vite.config.ts'
import { ORIGINES_TIERS } from '../src/registry/origines.ts'

/** Les valeurs d'une directive, la directive elle-même exclue. */
function directive(politique: string, nom: string): readonly string[] {
  const trouvee = politique.split('; ').find((d) => d.startsWith(`${nom} `))
  expect(trouvee, `directive ${nom} absente`).toBeDefined()
  return trouvee!.split(' ').slice(1)
}

// La politique est injectée à la construction : le risque réel n'est pas qu'elle soit fausse,
// c'est qu'un assouplissement de développement parte en production (§13.3).
function metaInjectee(serveur: unknown): Record<string, string | boolean | undefined> {
  const plugin = politiqueDeSecurite()
  const hook = plugin.transformIndexHtml
  if (typeof hook !== 'object' || typeof hook.handler !== 'function') {
    throw new Error('transformIndexHtml doit exposer un handler')
  }
  const balises = hook.handler.call(undefined as never, '', { server: serveur } as never)
  if (!Array.isArray(balises) || balises[0] === undefined) throw new Error('aucune balise injectée')
  return balises[0].attrs ?? {}
}

/**
 * §4.1, §6.4, §13.1 — les origines tierces : imagerie d'objet et relief du terrain.
 *
 * La liste du registre est la garantie de confidentialité de §13.1 : elle énumère les tiers
 * joints et ce qui leur est transmis. Si la politique et la liste divergent, l'une des deux
 * ment — soit le document promet un confinement que le navigateur n'applique pas, soit une
 * origine est joignable sans avoir été déclarée. Ces tests refusent la divergence dans les
 * deux sens.
 */
describe('origines tierces (§4.1, §6.4, §13.1)', () => {
  it('ouvre connect-src à exactement les origines du registre, et à rien d’autre', () => {
    const autorisees = directive(CSP_PRODUCTION, 'connect-src')
    const declarees = ORIGINES_TIERS.map((o) => o.origine)
    expect([...autorisees].sort()).toStrictEqual([...declarees, "'self'"].sort())
  })

  it('refuse une origine déclarée au registre mais absente de la politique', () => {
    // Le sens qui compte : une origine ajoutée au registre sans l'être ici serait une
    // requête que le code émet et que la politique bloque, sans que rien ne le dise.
    for (const { origine } of ORIGINES_TIERS) {
      expect(CSP_PRODUCTION, origine).toContain(origine)
      expect(CSP_DEVELOPPEMENT, origine).toContain(origine)
    }
  })

  it('n’ouvre aucun hôte tiers à img-src : les vignettes passent par blob:', () => {
    const images = directive(CSP_PRODUCTION, 'img-src')
    expect(images).toStrictEqual(["'self'", 'blob:'])
    for (const { origine } of ORIGINES_TIERS) {
      expect(images, origine).not.toContain(origine)
    }
  })

  it('n’autorise que des origines chiffrées et sans joker', () => {
    for (const { origine } of ORIGINES_TIERS) {
      expect(origine, origine).toMatch(/^https:\/\/[a-z0-9.-]+$/)
    }
  })

  it('nomme, pour chaque origine, ce qui lui est transmis', () => {
    // Sans cette phrase, §13.1 énumère des hôtes sans dire ce qui en sort : la liste ne
    // vaudrait plus comme garantie.
    for (const { origine, transmis } of ORIGINES_TIERS) {
      expect(transmis, origine).not.toBe('')
    }
    expect(Object.isFrozen(ORIGINES_TIERS)).toBe(true)
  })
})

describe('politique de sécurité du contenu (§13.1, §13.3)', () => {
  it('interdit toute requête hors origine en production', () => {
    expect(CSP_PRODUCTION).toContain("connect-src 'self'")
    expect(CSP_PRODUCTION).toContain("default-src 'self'")
    expect(CSP_PRODUCTION).toContain("img-src 'self' blob:")
    expect(CSP_PRODUCTION).toContain("object-src 'none'")
    expect(CSP_PRODUCTION).toContain("base-uri 'self'")
  })

  it('ne laisse aucun assouplissement de développement passer en production', () => {
    expect(CSP_PRODUCTION).not.toContain('ws:')
    expect(CSP_PRODUCTION).not.toContain('*')
    expect(CSP_PRODUCTION.split('; ')).toContain("script-src 'self'")
    expect(CSP_DEVELOPPEMENT).toContain('ws:')
  })

  it('pose la politique en tête du head, distincte selon le mode', () => {
    const plugin = politiqueDeSecurite()
    const hook = plugin.transformIndexHtml
    expect(typeof hook === 'object' && hook.order).toBe('pre')
    expect(metaInjectee(undefined)['content']).toBe(CSP_PRODUCTION)
    expect(metaInjectee({})['content']).toBe(CSP_DEVELOPPEMENT)
    expect(metaInjectee(undefined)['http-equiv']).toBe('Content-Security-Policy')
  })
})
