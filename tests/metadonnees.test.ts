/**
 * T-0392 — what a tab and a share show of Orion before load. Page description = manifest
 * description (2 drifting sentences = 2 apps). Favicon carries its own background: a stroke on
 * transparent vanishes in a tab of the stroke colour.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RACINE = join(import.meta.dirname, '..')
const HTML = readFileSync(join(RACINE, 'index.html'), 'utf8')
const CONFIG = readFileSync(join(RACINE, 'vite.config.ts'), 'utf8')
const FAVICON = readFileSync(join(RACINE, 'public', 'icones', 'favicon.svg'), 'utf8')

function meta(attribut: 'name' | 'property', cle: string): string | undefined {
  return new RegExp(`<meta ${attribut}="${cle}" content="([^"]+)"`).exec(HTML)?.[1]
}

describe('métadonnées de la page (T-0392)', () => {
  it('décrit la page comme le manifeste la décrit', () => {
    const manifeste = /description:\s*"([^"]+)"/.exec(CONFIG)?.[1]
    expect(manifeste).toBeDefined()
    expect(meta('name', 'description')).toBe(manifeste)
    expect(meta('property', 'og:description')).toBe(manifeste)
  })

  it('reprend le nom du manifeste comme titre de partage', () => {
    expect(meta('property', 'og:title')).toBe(/\bname:\s*'([^']+)'/.exec(CONFIG.slice(CONFIG.indexOf('manifest:')))?.[1])
  })

  it('la favicon pose son fond noir sous un tracé coloré', () => {
    expect(FAVICON).toMatch(/<rect[^>]*fill="#000000"/)
    expect(FAVICON).not.toMatch(/stroke="#000000"/)
  })
})
