export function sanitizeText(value: string, singleLine = false): string {
  const text = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 && character !== "\n" && character !== "\t"
      ? ""
      : character;
  })
    .join("")
    .normalize("NFC")
    .trim();

  return singleLine ? text.replace(/[^\S\n]*\n[\s]*/gu, " ") : text;
}
