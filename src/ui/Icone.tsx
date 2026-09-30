/**
 * T-0122 — un glyphe de Material Symbols Sharp, désigné par sa ligature.
 *
 * Le composant n'existe pas pour factoriser trois lignes de JSX : il existe pour qu'il n'y
 * ait qu'un seul endroit à toucher le jour où le style des icônes change — l'épaisseur du
 * trait, la taille, ou le passage à une autre famille. La forme vit dans `.icone`
 * (`styles.css`), le contrat d'accessibilité vit ici.
 *
 * `aria-hidden` PAR DÉFAUT. Une ligature est du texte : sans cela, un lecteur d'écran
 * annonce « close » au milieu d'un libellé français. Le sens d'une icône appartient au
 * contrôle qui la porte — son `aria-label`, pas le glyphe. Le cas où l'icône est seule et
 * porteuse de sens passe `libelle` : elle redevient alors une image nommée.
 */

interface IconeProps {
  /** Nom de la ligature Material Symbols, en anglais — c'est l'identifiant de la police. */
  readonly nom: string
  /**
   * À ne renseigner que si l'icône porte seule l'information. Dans un bouton déjà décrit
   * par un `aria-label`, le laisser absent : deux libellés valent une double annonce.
   */
  readonly libelle?: string | undefined
  readonly classe?: string | undefined
}

export function Icone({ nom, libelle, classe }: IconeProps) {
  const classes = classe === undefined ? 'icone' : `icone ${classe}`
  return libelle === undefined ? (
    <span className={classes} aria-hidden="true">
      {nom}
    </span>
  ) : (
    <span className={classes} role="img" aria-label={libelle}>
      {nom}
    </span>
  )
}

/** Ce qu'il faut du `document` : le chargeur de polices et la classe de la racine. */
interface DocumentPolices {
  readonly documentElement: { readonly classList: { add(classe: string): unknown } }
  readonly fonts: { load(police: string): Promise<unknown> }
}

/**
 * T-0300 — `.icone` reste masquée (`styles.css`) jusqu'à ce que la racine porte
 * `icones-pretes`. `font-display: block` ne cache le texte que ~3 s ; la police d'icônes
 * arrive bien après sur un premier lancement lent, et la ligature s'affichait en clair.
 * Un échec de chargement laisse les glyphes masqués : les contrôles gardent leur
 * `aria-label`, un vide vaut mieux qu'un nom de code anglais.
 */
export async function attendsPoliceIcones(doc: DocumentPolices, famille: string): Promise<void> {
  await doc.fonts.load(`1em ${famille}`)
  doc.documentElement.classList.add('icones-pretes')
}
