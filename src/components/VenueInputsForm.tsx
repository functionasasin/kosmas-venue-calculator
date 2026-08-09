import type { VenueInputs, Tier, Brand } from '@/calculator/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

const TIERS: Tier[] = [
  'basic_plus', 'pro', 'autonomous', 'autonomous_plus',
]
const BRANDS: Brand[] = ['podplay', 'pickleball_kingdom', 'pingpod']

interface Props {
  value: VenueInputs
  onChange: (v: VenueInputs) => void
}

export function VenueInputsForm({ value, onChange }: Props) {
  const set = <K extends keyof VenueInputs>(k: K, v: VenueInputs[K]) =>
    onChange({ ...value, [k]: v })

  // bg-card, not bg-background: the rail is a tinted surface now, and a
  // transparent control would pick the tint up instead of reading as a field.
  const selectClass = 'h-8 w-full rounded-md border bg-card px-2 py-1 text-sm'
  const lb = 'text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground'

  return (
    <div className="space-y-3">
      <div className="text-[10px] tracking-[.06em] text-muted-foreground uppercase">
        Inputs
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1">
        <div className="space-y-1">
          <Label htmlFor="courts" className={lb}>Courts</Label>
          <Input id="courts" type="number" min="1" value={value.courts}
            className="h-8 bg-card"
            onChange={e => set('courts', Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tier" className={lb}>Tier</Label>
          <select id="tier" className={selectClass} value={value.tier}
            onChange={e => set('tier', e.target.value as Tier)}>
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="brand" className={lb}>Brand</Label>
          <select id="brand" className={selectClass} value={value.brand}
            onChange={e => set('brand', e.target.value as Brand)}>
            {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="secCams" className={lb}>Security cameras</Label>
          <Input id="secCams" type="number" min="0" value={value.securityCameras}
            className="h-8 bg-card"
            onChange={e => set('securityCameras', Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kisi" className={lb}>Kisi doors</Label>
          <Input id="kisi" type="number" min="0" value={value.kisiDoors}
            className="h-8 bg-card"
            onChange={e => set('kisiDoors', Number(e.target.value))} />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Checkbox id="retention" checked={value.extendedRetention}
            onCheckedChange={c => set('extendedRetention', c === true)} />
          <Label htmlFor="retention" className="text-xs font-normal">
            Extended replay retention
          </Label>
        </div>
      </div>
    </div>
  )
}
