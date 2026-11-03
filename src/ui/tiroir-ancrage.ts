/**
 * T-0121 — tiroir window opens UNDER its button, shifts to stay on screen. CSS can't do both:
 * anchored to button (`right: 0`), a 52 rem window opened mid-bar exits left; flush to screen
 * edge, it no longer says which button opened it. CSS anchoring (`position-area`) can FLIP a
 * window edge to edge, not SLIDE it — slide needed (window wider than button-to-edge distance).
 * Shift measured at open, screen coords (window `position: fixed`). Only horizontal computed;
 * vertical stays in CSS, anchored to the bar, which doesn't move.
 */

function cale(tiroir: HTMLDetailsElement): void {
  const contenu = tiroir.querySelector<HTMLElement>('.tiroir-contenu')
  const bouton = tiroir.querySelector('summary')
  if (!contenu || !bouton) return

  // Window closed, or repli <1100 px where it returns to the flow: nothing to shift; hardcoded
  // `left` would offset bar content.
  if (getComputedStyle(contenu).position !== 'fixed') {
    contenu.style.removeProperty('left')
    contenu.style.removeProperty('right')
    return
  }

  // Margin = the one stylesheet sets in repli (`right: var(--jour-carte)`): read, not copied →
  // window never closer to edge than coque.
  contenu.style.removeProperty('right')
  const marge = parseFloat(getComputedStyle(contenu).right)
  const gauche = bouton.getBoundingClientRect().left
  const debord = window.innerWidth - contenu.offsetWidth - marge
  contenu.style.left = `${Math.round(Math.max(marge, Math.min(gauche, debord)))}px`
  contenu.style.right = 'auto'
}

/** Realigns all open windows (resize moved their edge). */
function caleTout(): void {
  for (const t of document.querySelectorAll<HTMLDetailsElement>('details.tiroir')) cale(t)
}

/**
 * Listens to tiroir openings, returns removal fn. `toggle` doesn't bubble: CAPTURE phase on
 * document covers the 6 tiroirs of both bars, no registration.
 */
export function ancreTiroirs(): () => void {
  const surBascule = (evt: Event) => {
    const cible = evt.target
    if (cible instanceof HTMLDetailsElement && cible.classList.contains('tiroir')) cale(cible)
  }
  document.addEventListener('toggle', surBascule, true)
  window.addEventListener('resize', caleTout)
  return () => {
    document.removeEventListener('toggle', surBascule, true)
    window.removeEventListener('resize', caleTout)
  }
}
