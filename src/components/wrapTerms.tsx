import { GlossaryTerm } from './GlossaryTerm'

/** 説明文中の現実用語を GlossaryTerm でラップする。各用語の最初の出現のみ対象。 */
export function wrapTerms(text: string, terms: string[]) {
  const parts: (string | JSX.Element)[] = [text]
  terms.forEach((term, ti) => {
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      if (typeof seg !== 'string') continue
      const idx = seg.indexOf(term)
      if (idx === -1) continue
      parts.splice(
        i,
        1,
        seg.slice(0, idx),
        <GlossaryTerm key={`${ti}-${i}`} term={term} />,
        seg.slice(idx + term.length),
      )
      break
    }
  })
  return parts
}
