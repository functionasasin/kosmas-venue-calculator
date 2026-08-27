import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listVenues, saveVenue, deleteVenue } from '@/data/venueStore'
import type { Venue } from '@/data/venues'
import { useRole } from '@/auth/useRole'
import { tierLabel } from '@/lib/tierLabel'
import { useAuth } from '@/auth/AuthProvider'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BrandBlock } from '@/components/BrandBlock'
import { toast } from 'sonner'

export function Venues() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [courts, setCourts] = useState('8')
  // Holds the venue awaiting confirmation. Deleting cascades to its materials
  // list and cannot be undone, so it never fires straight off the row button.
  const [deleting, setDeleting] = useState<Venue | null>(null)
  const [busy, setBusy] = useState(false)
  const role = useRole()
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const userId = session?.user.id ?? null

  useEffect(() => {
    // A STABLE SCALAR, never the session object: onAuthStateChange hands back a
    // new object on every TOKEN_REFRESHED, so keying on the session itself
    // refetches this list on an hourly timer for no reason. Inert while
    // App.tsx still gates the tree on a session; live the moment Plan 3
    // removes that gate.
    listVenues(!!userId)
      // `r.unreadable` is dropped on purpose. Local blobs that will not parse
      // are surfaced and never auto-deleted — each is the user's only copy —
      // but rendering them is Plan 3's "This browser" work, and a banner here
      // would be the one user-visible change this plan is not allowed to make.
      .then(r => setVenues(r.venues))
      .catch(e => toast.error(e.message))
  }, [userId])

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteVenue(deleting.id)
      // Drop it locally rather than refetching: the list is the only thing that
      // changed, and a refetch would blank the table for a frame.
      setVenues(vs => vs.filter(v => v.id !== deleting.id))
      toast.success(`Deleted “${deleting.name}”`)
      setDeleting(null)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const v = await saveVenue({ name, courts: Number(courts), tier: 'pro' }, !!userId)
      navigate(`/venues/${v.id}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    // Same shell as the venue page: full-bleed white surface, sticky bar, and a
    // table whose gutter lives on its cells so the rules reach the window edge.
    // No rail — this screen has no inputs, and an empty 232px column would be a
    // worse match for the venue page than no column at all.
    <div className="flex min-h-svh flex-col bg-card">
      {/* Left gutter, not centred: this band is full-width, so the lockup lines
          up with the screen title and the table below it. The login card and
          the venue rail centre theirs because they are narrow. Deliberately not
          sticky — the brand scrolls away and the bar under it does not, so a
          long list never puts New venue out of reach. */}
      <BrandBlock />
      <div className="sticky top-0 z-10 flex h-13 shrink-0 flex-wrap items-center
                      justify-between gap-3 border-b bg-card px-4">
        <h1 className="text-lg font-semibold tracking-tight">Venues</h1>
        <div className="flex gap-1.5">
          {/* Leads the action cluster on every screen — same slot in Catalog and
              VenueDetail. It looks further from the window edge where more
              buttons trail it; that is the trailing count, not a different rule. */}
          <ThemeToggle />
          {role === 'admin' && (
            // A link wearing button styling, not a Button rendering a link.
            // Base UI's Button insists on button semantics either way: left
            // alone it stamps type="button" on the anchor, and nativeButton
            // ={false} replaces that with an explicit role="button", which
            // overrides the native link role instead of restoring it. Applying
            // the variants directly keeps the anchor a plain anchor.
            <Link to="/catalog"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }),
                'h-auto bg-card px-[.55rem] py-[.25rem] text-[11px]')}>
              Catalog
            </Link>
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

      <div className="min-w-0 flex-1 py-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 pl-4 text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                Name
              </TableHead>
              <TableHead className="h-7 w-28 text-right text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                Courts
              </TableHead>
              <TableHead className="h-7 w-48 text-[10px] font-medium uppercase tracking-[.04em] text-muted-foreground">
                Tier
              </TableHead>
              <TableHead className="h-7 w-24 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {venues.map(v => (
              <TableRow
                key={v.id}
                className="group/row cursor-pointer hover:bg-muted/30"
                onClick={() => navigate(`/venues/${v.id}`)}
              >
                <TableCell className="py-1.5 pl-4 font-medium group-hover/row:shadow-[inset_2px_0_0_var(--brand)]">
                  {v.name}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{v.courts}</TableCell>
                <TableCell className="py-1.5">{tierLabel(v.tier)}</TableCell>
                <TableCell className="py-1.5 pr-4 text-right">
                  {/* The row navigates on click, so the button has to stop the
                      event or opening the confirm dialog also leaves the page. */}
                  <Button
                    size="sm" variant="ghost"
                    aria-label={`Delete ${v.name}`}
                    onClick={e => { e.stopPropagation(); setDeleting(v) }}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {venues.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  No venues yet. Click “New venue” to create one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={deleting !== null} onOpenChange={o => !o && setDeleting(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Delete “{deleting?.name}”?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This also deletes its materials list, including any lines edited by
            hand. It cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" disabled={busy} onClick={confirmDelete}>
              {busy ? 'Deleting…' : 'Delete venue'}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
