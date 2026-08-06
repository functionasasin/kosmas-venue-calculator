import { useState } from 'react'
import type { Item } from '@/calculator/types'
import { ROLE_KEYS } from '@/calculator/roleKeys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  item?: Item
  onSave: (item: Partial<Item> & { name: string }) => Promise<void>
  onCancel: () => void
}

export function ItemForm({ item, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    category: item?.category ?? '',
    roleKey: item?.roleKey ?? '',
    supplier: item?.supplier ?? '',
    poeWatts: item?.poeWatts?.toString() ?? '',
    rackU: item?.rackU?.toString() ?? '',
    unitPrice: item?.unitPrice?.toString() ?? '',
    notes: item?.notes ?? '',
    printNote: item?.printNote ?? '',
  })
  const [busy, setBusy] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await onSave({
      id: item?.id,
      name: form.name,
      category: form.category || 'uncategorised',
      roleKey: (form.roleKey || null) as Item['roleKey'],
      supplier: form.supplier || null,
      poeWatts: form.poeWatts ? Number(form.poeWatts) : null,
      rackU: form.rackU ? Number(form.rackU) : null,
      unitPrice: form.unitPrice ? Number(form.unitPrice) : null,
      notes: form.notes || null,
      printNote: form.printNote || null,
      isActive: item?.isActive ?? true,
    })
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={form.name} onChange={set('name')} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Input id="category" value={form.category} onChange={set('category')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="roleKey">Role key</Label>
        <select
          id="roleKey"
          className="w-full rounded-md border bg-background p-2 text-sm"
          value={form.roleKey}
          onChange={e => setForm(f => ({ ...f, roleKey: e.target.value }))}
        >
          <option value="">— none —</option>
          {ROLE_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">
          Wires this item into the formulas. Only one active item per role.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="supplier">Supplier</Label>
        <Input id="supplier" value={form.supplier} onChange={set('supplier')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="poeWatts">PoE watts (maximum)</Label>
          <Input id="poeWatts" type="number" step="0.1"
            value={form.poeWatts} onChange={set('poeWatts')} />
          <p className="text-xs text-muted-foreground">
            Max draw, not typical — the budget check depends on it.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rackU">Rack U</Label>
          <Input id="rackU" type="number" step="0.5"
            value={form.rackU} onChange={set('rackU')} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="unitPrice">Unit price (optional)</Label>
        <Input id="unitPrice" type="number" step="0.01"
          value={form.unitPrice} onChange={set('unitPrice')} />
        <p className="text-xs text-muted-foreground">
          Stored only. Never shown on venues or in the exported PDF.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Internal notes</Label>
        <Input id="notes" value={form.notes} onChange={set('notes')} />
        <p className="text-xs text-muted-foreground">
          Working notes. Never printed on the materials list.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="printNote">Print note</Label>
        <Input id="printNote" value={form.printNote} onChange={set('printNote')} />
        <p className="text-xs text-muted-foreground">
          Constraints the buyer must see — rack depth, voltage rating, required
          model variant. Printed beneath this item on the PDF.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>Save</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
