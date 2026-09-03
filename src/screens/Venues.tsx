import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listVenues, saveVenue, deleteVenue, isLocalVenueId } from '@/data/venueStore'
import { storageAvailable, type UnreadableVenue } from '@/data/localVenues'
import type { Venue } from '@/data/venues'
import type { Tier } from '@/calculator/types'
import { useRole } from '@/auth/useRole'
import { tierLabel, TIERS } from '@/lib/tierLabel'
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
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export function Venues() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [courts, setCourts] = useState('8')
  // Pro, because nearly every PH deployment is one — and because 'pro' is what
  // this dialog wrote as a literal before the picker existed, so leaving the
  // field alone creates the venue it always created.
  const [tier, setTier] = useState<Tier>('pro')
  // Holds the venue awaiting confirmation. Deleting cascades to its materials
  // list and cannot be undone, so it never fires straight off the row button.
  const [deleting, setDeleting] = useState<Venue | null>(null)
  const [busy, setBusy] = useState(false)
  // Starts true: the first paint of this screen is always mid-fetch.
  const [loadingVenues, setLoadingVenues] = useState(true)
  const [unreadable, setUnreadable] = useState<UnreadableVenue[]>([])
  // Once per mount, not per render: the probe writes.
  const [storageOk] = useState(storageAvailable)
  const role = useRole()
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const userId = session?.user.id ?? null
  // Only a visitor with no database to fall back on is actually blocked.
  const blocked = !storageOk && !userId

  useEffect(() => {
    // A STABLE SCALAR, never the session object: onAuthStateChange hands back a
    // new object on every TOKEN_REFRESHED, so keying on the session itself
    // refetches this list on an hourly timer for no reason.
    //
    // Re-set on every run, not only at mount — the effect re-fires when the
    // signed-in user changes, and a stale `false` would show the empty state
    // over the previous account's list while the new one loads.
    setLoadingVenues(true)
    listVenues(!!userId)
      // Both halves. Local blobs that will not parse are surfaced and never
      // auto-deleted — each is the user's only copy — so carrying them out of
      // the data layer only pays off if something renders them, which is the
      // notice below.
      .then(r => { setVenues(r.venues); setUnreadable(r.unreadable) })
      .catch(e => toast.error(e.message))
      .finally(() => setLoadingVenues(false))
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
      const v = await saveVenue({ name, courts: Number(courts), tier }, !!userId)
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
      {blocked && (
        // Persistent, above everything, and not a toast: a toast for a
        // condition that does not go away is a condition the user meets again
        // on every action.
        <div className="border-b bg-decide px-4 py-2 text-[11px] font-medium text-attention-foreground">
          {/* No "sign in to save to the database instead" here. `blocked` is
              `!storageOk && !userId`, so this banner reaches ONLY visitors with
              no session — the one audience for whom that is the wrong advice.
              The database is for Kosmas employees; the venues RLS policies are
              `to authenticated` and nothing in the UI points at /login. State
              the consequence, offer no door. */}
          This browser cannot save venues — it is blocking site storage, which is
          usually private/incognito mode. Sizing still works, but nothing will be
          kept.
        </div>
      )}
      {unreadable.length > 0 && (
        <div className="border-b bg-decide px-4 py-2 text-[11px] text-attention-foreground">
          {unreadable.some(u => u.reason === 'newer_schema')
            ? `${unreadable.length} venue(s) saved in this browser were written by a newer version of this tool and cannot be opened here. They have not been deleted.`
            : `${unreadable.length} venue(s) saved in this browser could not be read. They have not been deleted.`}
        </div>
      )}
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
              className={cn(buttonVariants({ variant: 'outline', size: 'toolbar' }), 'bg-card')}>
              Catalog
            </Link>
          )}
          <Button size="toolbar"
            disabled={blocked}
            title={blocked ? 'This browser is blocking site storage' : undefined}
            onClick={() => setCreating(true)}>
            New venue
          </Button>
          {/* Sign out or NOTHING. This slot was "never both and never neither",
              a Sign out paired with a Sign in link — which was right while every
              account holder was the only kind of visitor there was.

              On a public tool it is not. /login is an employee door: one account
              exists, and the anonymous path deliberately cannot reach the
              database (the venues policies are `to authenticated`). Advertising
              it beside New venue invited a prospect to make an account that does
              not exist. The route is still there and still works when typed —
              anon-venue.mjs checks that, since nothing links to it any more.

              Sign out cannot go the same way: without it a signed-in admin has
              no way out, and this toolbar is the only place it has ever lived —
              VenueDetail and Catalog have no session control, and an admin on
              either navigates back here. */}
          {session && (
            <Button variant="ghost" size="toolbar"
              onClick={signOut}>
              Sign out
            </Button>
          )}
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
                  {/* Same pattern as the Catalog's inactive/default badges.
                      What it discloses is not cosmetic: this venue has no audit
                      stamp, is not on another device, is invisible to a
                      colleague, and goes with the browser's site data. */}
                  {isLocalVenueId(v.id) && (
                    <Badge variant="outline" className="ml-2">This browser</Badge>
                  )}
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
            {loadingVenues && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  Loading venues…
                </TableCell>
              </TableRow>
            )}
            {/* Only once the fetch has actually finished. This copy is an
                instruction to create something, and shown mid-fetch to a
                signed-in admin it invites a duplicate of a venue they already
                have. */}
            {!loadingVenues && venues.length === 0 && (
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
        <DialogContent>
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
        <DialogContent>
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
            {/* The same five tiers the venue rail offers, from the one shared
                list — including the two that block the calculation. The tier is
                chosen and never inferred, so a Basic venue has to be recordable
                as one; what it gets on the next screen is the block message,
                which is the right answer rather than a dead end.

                Cameras and doors are deliberately NOT asked for here. They
                default to 0 on create, so no tier picked in this dialog can
                trip a gate, and they belong beside the counts they interact
                with in the rail. Sized to ItemForm's role-key <select>, not the
                rail's — this is a dialog form, and it sits level with the two
                Inputs above it. */}
            <div className="space-y-2">
              <Label htmlFor="venueTier">Tier</Label>
              <select id="venueTier"
                className="w-full rounded-md border bg-card p-2 text-sm"
                value={tier}
                onChange={e => setTier(e.target.value as Tier)}>
                {TIERS.map(t => (
                  <option key={t} value={t}>{tierLabel(t)}</option>
                ))}
              </select>
            </div>
            <Button type="submit">Create</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
