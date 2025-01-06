export function replaceLast(text: string, match: string, replacement = '') {
  const index = text.lastIndexOf(match)
  if (index < 0) {
    return text
  }
  return text.substring(0, index) + replacement + text.substring(index + match.length)
}
