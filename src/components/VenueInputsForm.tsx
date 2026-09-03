import type { VenueInputs, Tier } from '@/calculator/types'
import { allowsSecurityCameras, allowsKisiDoors } from '@/calculator/gates'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { microLabel } from '@/lib/utils'
import { tierLabel, TIERS } from '@/lib/tierLabel'

/**
 * Inputs only. A "Hardware" group used to sit under them — one picker per role
 * key holding more than one active item — because the materials table's swap
 * control could only mint a manual line and so could not record a venue's
 * choice. MaterialsTable's swap() does record it now (2026-08-25), which left
 * two controls making the same statement about the same one role, and this was
 * the one nowhere near the row it changed.
 */
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
  //
  // `backupInternet` is deliberately NOT cleared with them. It never blocks a
  // calculation, so it cannot strand one, and it stays true of the site
  // whatever tier the venue ends up quoted at.
  const setTier = (tier: Tier) =>
    onChange({
      ...value,
      tier,
      securityCameras: allowsSecurityCameras(tier) ? value.securityCameras : 0,
      kisiDoors: allowsKisiDoors(tier) ? value.kisiDoors : 0,
    })

  // bg-card matches the rail, which is no longer tinted — the fields are
  // separated from it by their border alone. This <select> carries the bare
  // `border` utility (--border, 1.23:1), while the <Input>-based fields below
  // pick up shadcn's border-input (--input, 1.34:1); both are accepted
  // deviations in the spec (§4). The focus ring carries at 7.86:1.
  const selectClass = 'h-8 w-full rounded-md border bg-card px-2 py-1 text-sm'
  const lb = microLabel
  // A disabled field with no explanation reads as broken, so each one carries
  // the tier that would enable it. aria-describedby, not a title: the reason has
  // to reach a screen reader, and a disabled input never receives hover.
  const hint = 'text-[10px] leading-tight text-muted-foreground'
  const fieldClass = (on: boolean) =>
    `h-8 bg-card ${on ? '' : 'cursor-not-allowed'}`

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
        {/* Only offered on the Kisi tiers, because that is the only place it
            changes an output: it costs one of the UDM's 8 RJ45 ports, which is
            one fewer for a reader. A control that silently does nothing is
            worse than one that says when it applies. */}
        <div className="space-y-1">
          <div className="flex items-end gap-2 pb-1">
            <Checkbox id="backupWan" checked={value.backupInternet}
              disabled={!doorsOn}
              aria-describedby={doorsOn ? undefined : 'backupWanHint'}
              onCheckedChange={c => set('backupInternet', c === true)} />
            <Label htmlFor="backupWan" className="text-xs font-normal">
              Backup internet (WAN)
            </Label>
          </div>
          {!doorsOn && (
            <p id="backupWanHint" className={hint}>
              Autonomous and Autonomous+ only
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
