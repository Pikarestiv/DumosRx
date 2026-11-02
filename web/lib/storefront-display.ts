const CONNECTOR_WORDS = new Set(["of", "and", "for", "with", "in", "the", "to", "or", "on", "at", "by"]);
const KNOWN_ACRONYMS = new Set(["ors", "hiv", "act", "bcg", "uti", "otc", "ent", "ocp", "ppi", "nsaid", "spf", "aids"]);
const SHORT_ACRONYM_MAX_LETTERS = 2;

const letterCount = (word: string) => word.replace(/[^\p{L}]/gu, "").length;
const bareWord = (word: string) => word.toLowerCase().replace(/[^\p{L}]/gu, "");

const capitalizeWord = (word: string) =>
  word.toLowerCase().replace(/(^|[-/(])(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase());

function displayWord(word: string, isFirst: boolean, sourceIsUppercase: boolean): string {
  if (/\d/.test(word)) return word;
  const lower = word.toLowerCase();
  if (!isFirst && CONNECTOR_WORDS.has(lower)) return lower;
  if (KNOWN_ACRONYMS.has(bareWord(word))) return word.toUpperCase();
  if (sourceIsUppercase && letterCount(word) <= SHORT_ACRONYM_MAX_LETTERS) return word;
  return capitalizeWord(word);
}

export function toDisplayTitle(name: string): string {
  const hasLower = /\p{Ll}/u.test(name);
  const hasUpper = /\p{Lu}/u.test(name);
  if (hasLower && hasUpper) return name;

  let seenWord = false;
  return name
    .split(/(\s+)/)
    .map((part) => {
      if (part.trim() === "") return part;
      const rendered = displayWord(part, !seenWord, hasUpper);
      seenWord = true;
      return rendered;
    })
    .join("");
}

export function storeAddressLine(store: { address?: string | null; location?: string | null }): string | null {
  const parts = [store.address, store.location]
    .map((part) => part?.trim() ?? "")
    .filter((part, index, all) => part !== "" && all.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === index);

  return parts.length > 0 ? parts.join(", ") : null;
}
