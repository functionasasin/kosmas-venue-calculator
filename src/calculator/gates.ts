import type { VenueInputs, Warning, Tier } from './types'

export interface GateResult {
  blocked: boolean
  warnings: Warning[]
}

// tiers-reference.md § Hardware footprint per tier — neither of the two lowest
// tiers has ANY hardware. They differ only in software: Basic is the booking
// website alone, and Basic+ adds the venue its own booking app on iOS and
// Android. That is why they share a gate but not a message.
//
// Basic+ was recorded as carrying BBPOS payment terminals until 2026-08-14.
// That was never sourced: the original tiers doc put terminals on both lowest
// tiers, and when Basic was edited down to "no hardware at all" the line
// survived on Basic+ alone — inventing a boundary rather than recording one.
// Don't reintroduce it; card readers, if PodPlay supplies them at all, are a
// payment-integration question that starts at Basic.
const NO_HARDWARE_TIERS: Tier[] = ['basic', 'basic_plus']

// tiers-reference.md § Tier capabilities matrix — security cameras are
// Autonomous+ only. Plain Autonomous has NO surveillance: its "some security
// features" is Kisi door/access monitoring, not cameras. Pro has none either —
// the matrix gives it Remote Monitoring "No".
const SECURITY_CAMERA_TIERS: Tier[] = ['autonomous_plus']

// tiers-reference.md § Tier capabilities matrix — Kisi doors start at
// Autonomous. Pro is Door Access "No", and this gate is what enforces it.
//
// These two lists are not bookkeeping: they are what the tiers mean. No sizing
// module reads `inputs.tier` — pickGateway keys off kisiDoors, planSwitches off
// the camera/door/court counts — so these gates are the only thing standing
// between a tier and hardware that tier does not include. Deleting them does
// not merge two labels; it lets a Pro venue be specced with the very door
// access that defines it as not-Pro. Tried on 2026-08-10, reverted same day.
const KISI_TIERS: Tier[] = ['autonomous', 'autonomous_plus']

// tiers-reference.md § PH market note — Kisi hardware, NVRs and security
// cameras are not stocked in PH and ship from the US/HK.
const LONG_LEAD_TIME_TIERS: Tier[] = ['autonomous', 'autonomous_plus']

// Exported for VenueInputsForm, which disables the matching input rather than
// letting someone enter a count the calculation will only reject afterwards.
// The form asks rather than deciding: a second copy of these lists is how the
// picker and the gate drift apart.
export const allowsSecurityCameras = (tier: Tier): boolean =>
  SECURITY_CAMERA_TIERS.includes(tier)

export const allowsKisiDoors = (tier: Tier): boolean =>
  KISI_TIERS.includes(tier)

export function evaluateGates(inputs: VenueInputs): GateResult {
  const warnings: Warning[] = []

  // `<input type="number" min="1">` binds the steppers, not typing or pasting,
  // so a fractional or negative count arrives here intact — and every gate
  // below tests `> 0`, which a negative one passes.
  //
  // Blocked, never rounded. Every per-court line is `= courts`, so 2.5 courts
  // sizes 2.5 iPads, 2.5 Apple TVs and 9.5 cables onto a list someone orders
  // from, while portPlan.ts floors its own quantities — the drawing would then
  // disagree with the list printed in front of it. Flooring here would invent a
  // court count nobody entered, which is the one thing this codebase does not
  // do with a number it was not given.
  //
  // A negative count is the quieter half: it emits no line, so nothing on
  // screen looks wrong, but `totalPorts` is courts + cameras and shrinks with
  // it — and that term picks the switch.
  //
  // `venues` already enforces all of this in Postgres (0001_schema.sql: integer
  // columns, `check (courts >= 1)`), so no database venue can hold one. What is
  // left is the live session and localStorage venues — the majority audience
  // since the app went public — plus an admin, for whom save_venue's
  // `(p_venue ->> 'courts')::int` otherwise fails with a raw
  // `invalid input syntax for type integer` and no readable cause.
  //
  // Checked ahead of the tier rules on purpose: a count that will not work at
  // ANY tier must not be reported as a tier mismatch, which would send someone
  // to change the tier when the number is the fault.
  const counts = [
    { label: 'Court count', value: inputs.courts, min: 1 },
    { label: 'Security camera count', value: inputs.securityCameras, min: 0 },
    { label: 'Kisi door count', value: inputs.kisiDoors, min: 0 },
  ]
  for (const c of counts) {
    // Number.isInteger is false for NaN and Infinity too, so one predicate
    // covers every value that cannot be a quantity. Neither reaches here from
    // the form — a number input yields '' for anything unparseable and
    // Number('') is 0 — but a local venue is plain JSON.
    if (!Number.isInteger(c.value) || c.value < c.min) {
      return {
        blocked: true,
        warnings: [{
          code: 'INPUT_INCONSISTENT',
          level: 'error',
          message:
            `${c.label} must be a whole number, ` +
            `${c.min === 1 ? 'at least 1' : '0 or more'}. A fractional or ` +
            'negative count would put quantities on the materials list that ' +
            'cannot be ordered.',
        }],
      }
    }
  }

  if (NO_HARDWARE_TIERS.includes(inputs.tier)) {
    return {
      blocked: true,
      warnings: [{
        code: 'TIER_NO_HARDWARE',
        level: 'error',
        message: inputs.tier === 'basic'
          ? 'Basic venues have no hardware at all — the booking website is ' +
            'the entire deliverable, with no app. There is nothing here for ' +
            'this tool to size.'
          : 'Basic+ venues have no hardware at all — the tier adds the ' +
            'venue its own booking app on iOS and Android, and nothing ' +
            'physical. That is the customer-facing booking app, not the ' +
            'court-side software on iPads and Apple TVs, which starts at ' +
            'Pro. There is nothing here for this tool to size.',
      }],
    }
  }

  if (inputs.securityCameras > 0 && !SECURITY_CAMERA_TIERS.includes(inputs.tier)) {
    return {
      blocked: true,
      warnings: [{
        code: 'INPUT_INCONSISTENT',
        level: 'error',
        message:
          'Security cameras apply to Autonomous+ only. On other tiers they ' +
          'would silently upgrade the switch SKU.',
      }],
    }
  }

  if (inputs.kisiDoors > 0 && !KISI_TIERS.includes(inputs.tier)) {
    return {
      blocked: true,
      warnings: [{
        code: 'INPUT_INCONSISTENT',
        level: 'error',
        message:
          'Kisi doors apply to Autonomous and Autonomous+ only — door access ' +
          'is all-or-nothing, with no partial tier beneath it. On other tiers ' +
          'they would silently change the gateway SKU.',
      }],
    }
  }

  // tiers-reference.md § Hardware footprint per tier — Autonomous tiers always
  // include Kisi by definition, which is what routes them to the UDM-SE. Zero
  // doors would silently pick the UDM-Pro.
  if (
    (inputs.tier === 'autonomous' || inputs.tier === 'autonomous_plus') &&
    inputs.kisiDoors < 1
  ) {
    return {
      blocked: true,
      warnings: [{
        code: 'INPUT_INCONSISTENT',
        level: 'error',
        message:
          'Autonomous tiers always include Kisi access control — enter at ' +
          'least one door. Zero doors would select the wrong gateway.',
      }],
    }
  }

  // tiers-reference.md § Hardware footprint per tier — the Autonomous tiers are
  // NOT interchangeable. Autonomous is Kisi access control on the Pro stack;
  // Autonomous+ is that plus surveillance (cameras, UNVR/UNVR-Pro, 8TB HDDs).
  // Naming an NVR on plain Autonomous would reserve rack U for hardware the
  // tier never includes.
  // The Controller Pro 2 and Reader Pro 2.1 are sized on the materials list.
  // The push-to-exit device is not, and cannot be: it applies to mag-lock
  // doors only, this tool has no input for door style, and `Cost Analysis` has
  // no REX row at all — only a `Customer P&L!B47` cost line.
  const REX_MANUAL =
    'Push-to-exit devices are not sized here — fit one per mag-lock door ' +
    '(panic-bar doors with electric strikes need none). No quantity for them ' +
    'exists anywhere in the source; size it by hand from door style.'

  if (inputs.tier === 'autonomous') {
    warnings.push({
      code: 'TIER_ADDITIONS_MANUAL',
      level: 'warn',
      message: `${REX_MANUAL} This tier has no surveillance hardware.`,
    })
    warnings.push({
      code: 'TIER_RACK_UNDERSIZED',
      level: 'warn',
      message:
        'The Kisi controller is on the list but the source records no rack U ' +
        'for it, so it adds nothing to the rack total. Verify the bracket ' +
        'before ordering.',
    })
  }

  if (inputs.tier === 'autonomous_plus') {
    warnings.push({
      code: 'TIER_ADDITIONS_MANUAL',
      level: 'warn',
      message:
        `${REX_MANUAL} The NVR and 8TB HDDs are not sized here either — add ` +
        'them manually. NVR model follows the security-camera count: UNVR up ' +
        'to 20, UNVR-Pro 21-35, two UNVRs 36-40, two UNVR-Pro 41-60. Above 60 ' +
        'cameras the source has no row — size by hand.',
    })
    warnings.push({
      code: 'TIER_RACK_UNDERSIZED',
      level: 'warn',
      message:
        'Rack size is computed without the NVR (an NVR-Pro is 2U) and its ' +
        'drives, and the source records no rack U for the Kisi controller. ' +
        'Verify the bracket before ordering.',
    })
  }

  // tiers-reference.md § PH market note.
  //
  // The tier decides WHETHER this is worth saying; the venue's own counts
  // decide WHAT it names. It used to say "Kisi hardware, NVRs and security
  // cameras" for both tiers, which is wrong at both ends: plain Autonomous is
  // access control by definition and has no surveillance to wait for, and
  // Autonomous+ permits cameras without requiring them, so a venue sitting at
  // zero was told to allow shipping time for cameras nobody ordered. A
  // procurement note naming hardware that is not on the list is how someone
  // ends up holding a build for a shipment that was never coming.
  //
  // Derived from the inputs rather than from a stocked/not-stocked column on
  // `items`. Three catalog rows carry "Not stocked in PH — ships from US/HK"
  // in their notes, but that is free text, and a real column would drag in an
  // upsertItem spread, an ItemForm field and a Catalog column to be readable —
  // for an answer the inputs already give exactly. The limitation to accept:
  // if a FOURTH item ever becomes long-lead, this will not know about it.
  //
  // LONG_LEAD_TIME_TIERS stays as the trigger rather than collapsing into
  // `kisiDoors > 0 || securityCameras > 0`. It is not a hardware gate, so it
  // is not load-bearing the way KISI_TIERS is, but removing tier lists from
  // this file has gone wrong before (2026-08-10) and there is nothing to win.
  if (LONG_LEAD_TIME_TIERS.includes(inputs.tier)) {
    // Two shapes, so two strings — a list formatter for a binary choice would
    // be more machinery than the sentence it builds. The NVR rides with the
    // cameras because it is bought for them, and it is added by hand, so the
    // note is the only thing that will mention its lead time at all.
    const longLead = inputs.securityCameras > 0
      ? 'Kisi controllers and readers, the security cameras, and the NVR and ' +
        'drives added by hand'
      : 'Kisi controllers and readers'
    warnings.push({
      code: 'TIER_LEAD_TIME',
      level: 'warn',
      message:
        `${longLead} are not stocked in PH and ship from the US/HK. Allow ` +
        'extra procurement lead time.',
    })
  }

  return { blocked: false, warnings }
}
