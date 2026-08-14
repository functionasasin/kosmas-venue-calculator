import type { VenueInputs, Warning, Tier } from './types'

export interface GateResult {
  blocked: boolean
  warnings: Warning[]
}

// tiers-reference.md § Hardware footprint per tier — neither of the two lowest
// tiers has a rack kit. They differ only in software: Basic is the booking
// website alone, and Basic+ adds the venue its own booking app on iOS and
// Android. That is why they share a gate but not a message.
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

  if (inputs.courts < 1) {
    return {
      blocked: true,
      warnings: [{
        code: 'INPUT_INCONSISTENT',
        level: 'error',
        message: 'Court count must be at least 1.',
      }],
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
          : 'Basic+ venues have no rack kit — BBPOS terminals only. ' +
            'Everything else is software: the tier gives the venue its own ' +
            'booking app on iOS and Android, which is what separates it from ' +
            'Basic\'s website. There is nothing here for this tool to size.',
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

  // tiers-reference.md § PH market note
  if (LONG_LEAD_TIME_TIERS.includes(inputs.tier)) {
    warnings.push({
      code: 'TIER_LEAD_TIME',
      level: 'warn',
      message:
        'Kisi hardware, NVRs and security cameras are not stocked in PH and ' +
        'ship from the US/HK. Allow extra procurement lead time.',
    })
  }

  return { blocked: false, warnings }
}
