const capitalizeWord = (word: string) =>
  /\d/.test(word)
    ? word
    : word.toLowerCase().replace(/(^|[-/(])(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase());

export function toDisplayTitle(name: string): string {
  return name.split(/(\s+)/).map(capitalizeWord).join("");
}

export function storeAddressLine(store: { address?: string | null; location?: string | null }): string | null {
  const parts = [store.address, store.location]
    .map((part) => part?.trim() ?? "")
    .filter((part, index, all) => part !== "" && all.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === index);

  return parts.length > 0 ? parts.join(", ") : null;
}
