/**
 * T-0189 — Échap dismisses the open surface: bulle first, tiroir next.
 * WCAG 2.2, 1.4.13 « Contenu au survol ou au focus »: hover-revealed content must be DISMISSIBLE
 * without moving pointer or focus. Bulle (T-0147) has no JavaScript: opens on `:hover` /
 * `:focus-visible`, so can't carry the listener — on hover alone no node has focus and the key
 * goes elsewhere. Hence ONE listener on document, enabling the priority rule: a gloss opened above
 * a tiroir dismisses without taking its tiroir.
 * T-0262 — tiroir also closes when pointer or focus LEAVES it. Échap doesn't exist on touch, and
 * an open tiroir covers the scène the next Tab would reach. Original objection (`tiroir-site`, six
 * fields, outside click closing mid-entry) went with it: lieu is a permanent card, the only
 * remaining tiroir (mode nuit) holds a checkbox and a slider.
 * Opening a tiroir is a gesture outside the open one: never two at once, no extra rule.
 * Targeted tiroir = the one CONTAINING focus: Échap doesn't close a tiroir left open elsewhere,
 * whose `<summary>` would steal focus.
 */

/** What Échap closes, decided without DOM — the rule, and what the test carries. */
export type CibleEchap = 'BULLE' | 'TIROIR' | 'RIEN'

export function cibleEchap(
  touche: string,
  bulleVisible: boolean,
  tiroirOuvert: boolean,
): CibleEchap {
  if (touche !== 'Escape') return 'RIEN'
  if (bulleVisible) return 'BULLE'
  return tiroirOuvert ? 'TIROIR' : 'RIEN'
}

/**
 * Anchor hovered or holding focus — the one whose bulle is on screen, if any. Page info open: only
 * its bulles count (opening button keeps focus and its bulle, hidden under the veil, absorbed the
 * first Échap).
 */
function ancreOuverte(portee: ParentNode): HTMLElement | null {
  return portee.querySelector<HTMLElement>('.bulle-ancre:hover, .bulle-ancre:has(:focus-visible)')
}

function bulleDe(ancre: HTMLElement | null): HTMLElement | null {
  const bulle = ancre?.querySelector('.bulle')
  return bulle instanceof HTMLElement ? bulle : null
}

/** Open tiroir containing focus, if any. */
function tiroirFocalise(doc: Document): HTMLDetailsElement | null {
  const actif = doc.activeElement
  if (!(actif instanceof Element)) return null
  return actif.closest<HTMLDetailsElement>('details.tiroir[open]')
}

/**
 * Bulle hides in place, touching neither focus nor pointer, and reopens itself on leaving so
 * `:hover` / `:focus-visible` resume at next pass. Both return listeners removed together:
 * dismissing twice in a row mustn't leave the bulle off for good.
 */
function congedieBulle(ancre: HTMLElement, bulle: HTMLElement): void {
  bulle.style.display = 'none'
  const rend = () => {
    bulle.style.removeProperty('display')
    ancre.removeEventListener('mouseleave', rend)
    ancre.removeEventListener('focusout', rend)
  }
  ancre.addEventListener('mouseleave', rend)
  ancre.addEventListener('focusout', rend)
}

/** Closes tiroir and returns focus to its `<summary>`, where it came from. */
function fermeTiroir(tiroir: HTMLDetailsElement): void {
  tiroir.removeAttribute('open')
  const resume = tiroir.querySelector('summary')
  if (resume instanceof HTMLElement) resume.focus()
}

/**
 * T-0325 — page info opens via its anchor (`:target`): closing = leaving the anchor, focus returns
 * to the barre button that opened it. After bulle, like a tiroir: a gloss open on the page
 * dismisses without closing it.
 */
function fermePageInfo(doc: Document): boolean {
  const vue = doc.defaultView
  if (vue === null || doc.querySelector('.page-info:target') === null) return false
  vue.location.hash = ''
  doc.querySelector<HTMLElement>('.bouton-info')?.focus()
  return true
}

/** Sets the single listener. Returns its remover — a `useEffect` cleanup. */
export function installeEchap(doc: Document): () => void {
  const surTouche = (evt: KeyboardEvent) => {
    const ancre = ancreOuverte(doc.querySelector('.page-info:target') ?? doc)
    const bulle = bulleDe(ancre)
    const tiroir = tiroirFocalise(doc)
    const cible = cibleEchap(
      evt.key,
      bulle !== null && bulle.style.display !== 'none',
      tiroir !== null,
    )
    if (cible === 'BULLE' && ancre !== null && bulle !== null) {
      evt.preventDefault()
      congedieBulle(ancre, bulle)
    }
    if (cible === 'TIROIR' && tiroir !== null) {
      evt.preventDefault()
      fermeTiroir(tiroir)
    }
    if (cible === 'RIEN' && evt.key === 'Escape' && fermePageInfo(doc)) evt.preventDefault()
  }

  doc.addEventListener('keydown', surTouche)
  return () => doc.removeEventListener('keydown', surTouche)
}

/**
 * T-0262 — open tiroirs not containing the gesture target: those a pointer set elsewhere or focus
 * gone elsewhere closes. Decided without DOM, like `cibleEchap`.
 */
export function tiroirsAFermer<T>(ouverts: readonly T[], contientCible: (t: T) => boolean): T[] {
  return ouverts.filter((t) => !contientCible(t))
}

/**
 * Sets the outside-gesture listener. `pointerdown` covers touch and click on a non-focusable
 * element (canvas); `focusin` covers Tab. Focus NOT returned: already where user sent it.
 */
export function installeFermetureDehors(doc: Document): () => void {
  const surGeste = (evt: Event) => {
    const cible = evt.target
    if (!(cible instanceof Node)) return
    const ouverts = [...doc.querySelectorAll<HTMLDetailsElement>('details.tiroir[open]')]
    for (const t of tiroirsAFermer(ouverts, (o) => o.contains(cible))) t.removeAttribute('open')
  }
  doc.addEventListener('pointerdown', surGeste)
  doc.addEventListener('focusin', surGeste)
  return () => {
    doc.removeEventListener('pointerdown', surGeste)
    doc.removeEventListener('focusin', surGeste)
  }
}
