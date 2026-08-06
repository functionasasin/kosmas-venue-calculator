import type { VenueInputs, Tier, Brand } from '@/calculator/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

const TIERS: Tier[] = [
  'basic', 'basic_plus', 'pro', 'pro_plus', 'autonomous', 'autonomous_plus',
]
const BRANDS: Brand[] = ['podplay', 'pickleball_kingdom', 'pingpod']

interface Props {
  value: VenueInputs
  onChange: (v: VenueInputs) => void
}

export function VenueInputsForm({ value, onChange }: Props) {
  const set = <K extends keyof VenueInputs>(k: K, v: VenueInputs[K]) =>
    onChange({ ...value, [k]: v })

  const selectClass = 'w-full rounded-md border bg-background p-2 text-sm'

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-1">
      <div className="space-y-2">
        <Label htmlFor="courts">Courts</Label>
        <Input id="courts" type="number" min="1" value={value.courts}
          onChange={e => set('courts', Number(e.target.value))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tier">Tier</Label>
        <select id="tier" className={selectClass} value={value.tier}
          onChange={e => set('tier', e.target.value as Tier)}>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="brand">Brand</Label>
        <select id="brand" className={selectClass} value={value.brand}
          onChange={e => set('brand', e.target.value as Brand)}>
          {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="secCams">Security cameras</Label>
        <Input id="secCams" type="number" min="0" value={value.securityCameras}
          onChange={e => set('securityCameras', Number(e.target.value))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="kisi">Kisi doors</Label>
        <Input id="kisi" type="number" min="0" value={value.kisiDoors}
          onChange={e => set('kisiDoors', Number(e.target.value))} />
      </div>
      <div className="flex items-end gap-2 pb-2">
        <Checkbox id="retention" checked={value.extendedRetention}
          onCheckedChange={c => set('extendedRetention', c === true)} />
        <Label htmlFor="retention">Extended replay retention</Label>
      </div>
    </div>
  )
}
