import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listVenues, saveVenue, type Venue } from '@/data/venues'
import { useRole } from '@/auth/useRole'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

export function Venues() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [courts, setCourts] = useState('8')
  const role = useRole()
  const { signOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    listVenues().then(setVenues).catch(e => toast.error(e.message))
  }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const v = await saveVenue({ name, courts: Number(courts), tier: 'pro' })
      navigate(`/venues/${v.id}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Venues</h1>
        <div className="flex gap-1.5">
          {role === 'admin' && (
            // Base UI composes via `render`, not Radix's `asChild`.
            <Button variant="outline" size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]"
              render={<Link to="/catalog" />}>
              Catalog
            </Button>
          )}
          <Button size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]"
            onClick={() => setCreating(true)}>
            New venue
          </Button>
          <Button variant="ghost" size="sm" className="h-auto px-[.55rem] py-[.25rem] text-[11px]"
            onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                Name
              </TableHead>
              <TableHead className="h-7 text-right text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                Courts
              </TableHead>
              <TableHead className="h-7 text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                Tier
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {venues.map(v => (
              <TableRow
                key={v.id}
                className="cursor-pointer"
                onClick={() => navigate(`/venues/${v.id}`)}
              >
                <TableCell className="py-1.5 font-medium">{v.name}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{v.courts}</TableCell>
                <TableCell className="py-1.5">{v.tier}</TableCell>
              </TableRow>
            ))}
            {venues.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  No venues yet. Click “New venue” to create one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New venue</DialogTitle></DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="venueName">Name</Label>
              <Input id="venueName" value={name} required
                onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venueCourts">Courts</Label>
              <Input id="venueCourts" type="number" min="1" value={courts}
                onChange={e => setCourts(e.target.value)} />
            </div>
            <Button type="submit">Create</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
