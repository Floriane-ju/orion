/**
 * §1.5 — PRD refs = traceability, not UI text. Registry cites its section (`§8.3 — …`) so
 * values are verifiable; stripped at render. Patterns follow the 3 registry forms (leading
 * ref + dash, parenthesised, "voir"-introduced) so the sentence stays grammatical.
 */

const RENVOIS: readonly (readonly [RegExp, string])[] = Object.freeze([
  // "(§2.4)" and "(§9.2 et §9.3)": whole parenthesis goes with its ref.
  [/\s*\(§[\d.]+(?:\s*(?:,|et|à)\s*§?[\d.]+)*\)/g, ''],
  // "(§2.1, dernier critère)": only ref goes, precision stays.
  [/\(§[\d.]+\s*,\s*/g, '('],
  // "§8.3 — …" and "§8.3 et §8.4 — …" leading a source.
  [/^§[\d.]+(?:\s*(?:et|,)\s*§[\d.]+)*\s*[—–-]\s*/, ''],
  [/,?\s*voir\s+§[\d.]+/g, ''],
  [/\s*[—–]\s*§[\d.]+(?:\s*(?:et|,)\s*§[\d.]+)*/g, ''],
  [/\s*§[\d.]+/g, ''],
  [/\s{2,}/g, ' '],
] as const)

export function sansSection(texte: string): string {
  return RENVOIS.reduce((t, [motif, remplacement]) => t.replace(motif, remplacement), texte).trim()
}
