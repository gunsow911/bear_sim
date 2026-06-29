import { useState, type ReactNode } from 'react'
import { GLOSSARY } from '@/data/glossary'

export function GlossaryTerm({ term, children }: { term: string; children?: ReactNode }) {
  const entry = GLOSSARY[term]
  const [show, setShow] = useState(false)
  if (!entry) return <>{children ?? term}</>
  return (
    <span
      className="relative cursor-help underline decoration-dotted underline-offset-2"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children ?? term}
      {show && (
        <span className="absolute bottom-full left-0 z-50 mb-1 w-64 rounded border border-panel-border bg-panel p-2 text-xs font-normal leading-relaxed text-fg shadow-lg">
          <b className="text-risk-safe">{entry.term}</b>
          <br />
          {entry.description}
        </span>
      )}
    </span>
  )
}
