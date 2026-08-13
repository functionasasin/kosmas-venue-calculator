import type { Warning } from '@/calculator/types'

const STYLES: Record<Warning['level'], string> = {
  info: 'border-l-muted-foreground/40 bg-muted/40',
  warn: 'border-l-attention bg-attention/10',
  critical: 'border-l-critical bg-critical/10',
  error: 'border-l-destructive bg-destructive/10',
}

export function WarningsPanel({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="space-y-2">
      <h2 className="text-[10px] tracking-[.06em] text-muted-foreground uppercase">
        Checks
      </h2>
      {warnings.map((w, i) => (
        <div key={`${w.code}-${i}`}
          className={`rounded-r-md border-l-[3px] px-[.55rem] py-[.35rem] text-[11px] break-words ${STYLES[w.level]}`}>
          {w.message}
        </div>
      ))}
    </div>
  )
}
