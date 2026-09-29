/** Wrap canvas text without losing Chinese titles or overflowing long Latin words. */
export function wrapCoverTitle(text: string, measure: (text: string) => number, width: number, maxLines = 5): string[] {
  const tokens = Array.from(new Intl.Segmenter('zh', { granularity: 'word' }).segment(text.trim()), (part) => part.segment);
  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    const pieces = measure(token) > width ? Array.from(token) : [token];
    for (const piece of pieces) {
      const next = line + piece;
      if (line && measure(next.trimEnd()) > width) {
        lines.push(line.trimEnd());
        line = piece.trimStart();
      } else line = next.trimStart();
    }
  }
  if (line) lines.push(line.trimEnd());
  if (lines.length <= maxLines) return lines;
  const result = lines.slice(0, maxLines);
  let last = result[maxLines - 1];
  while (last && measure(last + '…') > width) last = Array.from(last).slice(0, -1).join('');
  result[maxLines - 1] = last.trimEnd() + '…';
  return result;
}
