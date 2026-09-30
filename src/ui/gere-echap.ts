/**
 * T-0189 — Échap congédie la surface ouverte : la bulle d'abord, le tiroir ensuite.
 *
 * WCAG 2.2, 1.4.13 « Contenu au survol ou au focus » exige d'un contenu révélé au survol
 * qu'il soit CONGÉDIABLE sans déplacer le pointeur ni le focus. La bulle (T-0147) n'a pas de
 * JavaScript : elle s'ouvre en `:hover` / `:focus-visible`. Elle ne peut donc pas porter
 * l'écoute elle-même — au survol seul, aucun de ses nœuds n'a le focus et la touche part
 * ailleurs. L'écoute est donc UNE, posée sur le document, et c'est aussi ce qui permet la
 * règle de priorité : une glose ouverte au-dessus d'un tiroir se congédie sans emporter le
 * tiroir qui la porte.
 *
 * T-0262 — le tiroir se referme aussi quand le pointeur ou le focus en SORT. Échap n'existe
 * pas au doigt, et un tiroir resté ouvert recouvre la scène que la tabulation suivante
 * atteindrait. L'objection d'origine — `tiroir-site` et ses six champs, qu'un clic dehors
 * aurait refermés en pleine saisie — est tombée avec lui : le lieu est une carte à demeure,
 * et le seul tiroir restant (mode nuit) ne porte qu'une case et un curseur.
 *
 * Le tiroir visé est celui qui CONTIENT le focus : Échap ne referme pas un tiroir resté
 * ouvert à l'autre bout de l'écran, dont le `<summary>` volerait le focus au passage.
 */

/** Ce qu'Échap ferme, décidé sans DOM — c'est la règle, et c'est elle que le test porte. */
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

/** L'ancre survolée ou tenant le focus — celle dont la bulle est à l'écran, s'il y en a une. */
function ancreOuverte(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('.bulle-ancre:hover, .bulle-ancre:has(:focus-visible)')
}

function bulleDe(ancre: HTMLElement | null): HTMLElement | null {
  const bulle = ancre?.querySelector('.bulle')
  return bulle instanceof HTMLElement ? bulle : null
}

/** Le tiroir déplié qui contient le focus, s'il y en a un. */
function tiroirFocalise(doc: Document): HTMLDetailsElement | null {
  const actif = doc.activeElement
  if (!(actif instanceof Element)) return null
  return actif.closest<HTMLDetailsElement>('details.tiroir[open]')
}

/**
 * La bulle se masque en place, sans toucher au focus ni au pointeur — et se rouvre d'elle-même
 * dès qu'on la quitte, pour que `:hover` et `:focus-visible` reprennent la main au prochain
 * passage. Les deux écoutes de retour se retirent ensemble : congédier deux fois de suite ne
 * doit pas laisser la bulle éteinte pour de bon.
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

/** Referme le tiroir et ramène le focus sur son `<summary>`, d'où il était parti. */
function fermeTiroir(tiroir: HTMLDetailsElement): void {
  tiroir.removeAttribute('open')
  const resume = tiroir.querySelector('summary')
  if (resume instanceof HTMLElement) resume.focus()
}

/**
 * T-0325 — la page info s'ouvre par son ancre (`:target`) : la refermer, c'est quitter
 * l'ancre, et le focus revient au bouton de la barre qui l'avait ouverte. Elle passe après
 * la bulle, comme un tiroir : une glose ouverte sur la page se congédie sans la fermer.
 */
function fermePageInfo(doc: Document): boolean {
  const vue = doc.defaultView
  if (vue === null || doc.querySelector('.page-info:target') === null) return false
  vue.location.hash = ''
  doc.querySelector<HTMLElement>('.bouton-info')?.focus()
  return true
}

/** Pose l'écoute unique. Rend la fonction qui la retire — c'est le nettoyage d'un `useEffect`. */
export function installeEchap(doc: Document): () => void {
  const surTouche = (evt: KeyboardEvent) => {
    const ancre = ancreOuverte(doc)
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
 * T-0262 — les tiroirs ouverts qui ne contiennent pas la cible du geste : ceux qu'un pointeur
 * posé ailleurs ou un focus parti ailleurs referme. Décidé sans DOM, comme `cibleEchap`.
 */
export function tiroirsAFermer<T>(ouverts: readonly T[], contientCible: (t: T) => boolean): T[] {
  return ouverts.filter((t) => !contientCible(t))
}

/**
 * Pose l'écoute du geste dehors. `pointerdown` couvre le toucher et le clic sur un élément
 * non focalisable (le canevas) ; `focusin` couvre la tabulation. Le focus n'est PAS ramené :
 * il est déjà là où l'utilisateur l'a envoyé.
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
