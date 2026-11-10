/** Universal POS tags in display order: content words first, then function words. */
export const POS_TAGS: Record<string, { label: string; color: string }> = {
  NOUN: { label: "Noun", color: "#b5e6ab" },
  VERB: { label: "Verb", color: "#b3d3fb" },
  ADJ: { label: "Adjective", color: "#fbe27a" },
  ADV: { label: "Adverb", color: "#f8c6a2" },
  PROPN: { label: "Proper noun", color: "#9be0cc" },
  PRON: { label: "Pronoun", color: "#e3c7f7" },
  AUX: { label: "Auxiliary", color: "#c5d2ee" },
  DET: { label: "Determiner", color: "#e8dac2" },
  ADP: { label: "Adposition", color: "#f5c4d6" },
  CCONJ: { label: "Coordinating conj.", color: "#d6d2f6" },
  SCONJ: { label: "Subordinating conj.", color: "#e6d3ea" },
  PART: { label: "Particle", color: "#d6e4bd" },
  NUM: { label: "Numeral", color: "#f5d6a0" },
  INTJ: { label: "Interjection", color: "#f6b8ae" },
  PUNCT: { label: "Punctuation", color: "#dcd9d0" },
  SYM: { label: "Symbol", color: "#d3d0c6" },
  X: { label: "Other", color: "#e2dfd6" },
};

export const POS_ORDER = Object.keys(POS_TAGS);
export const DEFAULT_ENABLED_TAGS = ["NOUN", "VERB", "ADJ"];

const FALLBACK = POS_TAGS.X;

export function posInfo(tag: string) {
  return POS_TAGS[tag] ?? { ...FALLBACK, label: tag };
}
