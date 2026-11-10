import type { Word } from "./api";

const CONTENT_TAGS = new Set(["NOUN", "PROPN", "VERB", "ADJ", "ADV"]);

export type TagShare = { tag: string; count: number; percent: number };

export type SpeechStats = {
  wordCount: number;
  uniqueWords: number;
  wordsPerMinute: number | null;
  /** Share of content words (nouns, verbs, adjectives, adverbs), 0-100. */
  lexicalDensity: number;
  /** Mean tagger confidence, 0-100. */
  meanConfidence: number | null;
  nouns: number;
  verbs: number;
  /** Ranked largest first. Excludes punctuation so shares describe spoken words only. */
  shares: TagShare[];
};

export function computeStats(words: Word[]): SpeechStats {
  const spoken = words.filter((w) => !w.is_punct);
  const counts = new Map<string, number>();
  let content = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const word of spoken) {
    counts.set(word.tag, (counts.get(word.tag) ?? 0) + 1);
    if (CONTENT_TAGS.has(word.tag)) content += 1;
    if (word.confidence !== null) {
      confidenceSum += word.confidence;
      confidenceCount += 1;
    }
  }

  const total = spoken.length;
  const speechSeconds = total ? spoken[total - 1].end - spoken[0].start : 0;

  return {
    wordCount: total,
    uniqueWords: new Set(spoken.map((w) => w.text.toLowerCase())).size,
    wordsPerMinute: speechSeconds > 0 ? (total / speechSeconds) * 60 : null,
    lexicalDensity: total ? (content / total) * 100 : 0,
    meanConfidence: confidenceCount ? (confidenceSum / confidenceCount) * 100 : null,
    nouns: (counts.get("NOUN") ?? 0) + (counts.get("PROPN") ?? 0),
    verbs: (counts.get("VERB") ?? 0) + (counts.get("AUX") ?? 0),
    shares: [...counts.entries()]
      .map(([tag, count]) => ({ tag, count, percent: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count),
  };
}

/** The index in `words` being spoken at time t, or -1. Holds each word until the next begins. */
export function activeWordAt(words: Word[], timedIndexes: number[], t: number): number {
  if (!timedIndexes.length) return -1;
  const last = words[timedIndexes[timedIndexes.length - 1]];
  if (t > last.end + 0.3) return -1;

  let low = 0;
  let high = timedIndexes.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (words[timedIndexes[middle]].start <= t) {
      found = timedIndexes[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}
