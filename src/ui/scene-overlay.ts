/**
 * §9.2, §9.3 et §9.5 — ce que la scène doit DIRE de l'aperçu qu'elle porte.
 *
 * Depuis T-0116 la passe de filé ne passe plus par ici : elle se dessine à même le canevas du
 * planétarium, dans la boucle, par `dessineChamp`. Ne restent que les mentions que le panneau
 * doit afficher, parce qu'elles portent sur un écart entre ce que la scène montre et ce que le
 * capteur enregistrerait — un écart qui se déclare, il ne se corrige pas en douce.
 */

/**
 * §9.3 — T-0118 : le plafond du filé est déclaré, jamais silencieux. Sans cette phrase, un ciel
 * plafonné se lit comme un ciel pauvre, donc comme un bug de rendu.
 *
 * T-0119 — la phrase perd son nombre. Le plafond n'est plus un effectif fixe : il se déduit du
 * champ et de la durée, donc il varie d'une scène à l'autre. Un nombre gravé dans le texte
 * mentirait sur toutes les scènes sauf une ; la mention énonce donc la règle, et les compteurs du
 * panneau disent l'effectif — ils le disent déjà.
 */
/**
 * §9.2 — T-0119 : l'aperçu de champ est plafonné lui aussi, mais pour une autre raison, et la
 * phrase ne peut donc pas être la même. Ses étoiles sont des points : rien ne se recouvre, la
 * lisibilité n'est pas en jeu. Ce qui coûtait était de LIRE le catalogue à pleine profondeur —
 * cent quatre-vingt mille étoiles par image au plein ciel. Un écran de profondeur qui rogne la
 * profondeur doit le dire, sinon il annonce un capteur moins bon qu'il n'est.
 */
export const MENTION_PLAFOND_CHAMP =
  'La photo montrera plus d’étoiles que l’aperçu. Zoomez pour en voir davantage.'

export const MENTION_PLAFOND_FILE = 'La photo montrera plus de traînées que l’aperçu.'
