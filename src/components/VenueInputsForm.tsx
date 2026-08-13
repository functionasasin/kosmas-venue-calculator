import type { VenueInputs, Tier } from '@/calculator/types'
import { allowsSecurityCameras, allowsKisiDoors } from '@/calculator/gates'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { tierLabel } from '@/lib/tierLabel'

const TIERS: Tier[] = [
  'basic', 'basic_plus', 'pro', 'autonomous', 'autonomous_plus',
]

interface Props {
  value: VenueInputs
  onChange: (v: VenueInputs) => void
}

export function VenueInputsForm({ value, onChange }: Props) {
  const set = <K extends keyof VenueInputs>(k: K, v: VenueInputs[K]) =>
    onChange({ ...value, [k]: v })

  const camerasOn = allowsSecurityCameras(value.tier)
  const doorsOn = allowsKisiDoors(value.tier)

  // Counts the new tier cannot carry are cleared in the same update as the tier
  // itself. Leaving them would strand a value behind a disabled control: the
  // calculation blocks on securityCameras > 0, and there is no longer any input
  // able to bring it back to zero.
  const setTier = (tier: Tier) =>
    onChange({
      ...value,
      tier,
      securityCameras: allowsSecurityCameras(tier) ? value.securityCameras : 0,
      kisiDoors: allowsKisiDoors(tier) ? value.kisiDoors : 0,
    })

  // bg-card matches the rail, which is no longer tinted — the fields are
  // separated from it by their border alone. That border is 1.34:1, recorded
  // as an accepted deviation in the spec (§4); the focus ring carries at 7.86:1.
  const selectClass = 'h-8 w-full rounded-md border bg-card px-2 py-1 text-sm'
  const lb = 'text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground'
  // A disabled field with no explanation reads as broken, so each one carries
  // the tier that would enable it. aria-describedby, not a title: the reason has
  // to reach a screen reader, and a disabled input never receives hover.
  const hint = 'text-[10px] leading-tight text-muted-foreground'
  const fieldClass = (on: boolean) =>
    `h-8 bg-card ${on ? '' : 'cursor-not-allowed opacity-50'}`

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
            onChange={e => setTier(e.target.value as Tier)}>
            {TIERS.map(t => (
              <option key={t} value={t}>{tierLabel(t)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="secCams" className={lb}>Security cameras</Label>
          <Input id="secCams" type="number" min="0" value={value.securityCameras}
            disabled={!camerasOn}
            aria-describedby={camerasOn ? undefined : 'secCamsHint'}
            className={fieldClass(camerasOn)}
            onChange={e => set('securityCameras', Number(e.target.value))} />
          {!camerasOn && (
            <p id="secCamsHint" className={hint}>Autonomous+ only</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="kisi" className={lb}>Kisi doors</Label>
          <Input id="kisi" type="number" min="0" value={value.kisiDoors}
            disabled={!doorsOn}
            aria-describedby={doorsOn ? undefined : 'kisiHint'}
            className={fieldClass(doorsOn)}
            onChange={e => set('kisiDoors', Number(e.target.value))} />
          {!doorsOn && (
            <p id="kisiHint" className={hint}>Autonomous and Autonomous+ only</p>
          )}
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
