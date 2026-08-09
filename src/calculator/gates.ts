import type { VenueInputs, Warning, Tier } from './types'

export interface GateResult {
  blocked: boolean
  warnings: Warning[]
}

// tiers-reference.md § Hardware footprint per tier — Basic+ has no rack kit;
// BBPOS terminals only. It is the lowest tier since Basic was retired.
const NO_HARDWARE_TIERS: Tier[] = ['basic_plus']

// tiers-reference.md § Tier capabilities matrix — security cameras are
// Autonomous+ only (optionally Pro+ with custom monitoring). Plain Autonomous
// has NO surveillance: its "some security features" is Kisi door/access
// monitoring, not cameras.
const SECURITY_CAMERA_TIERS: Tier[] = ['autonomous_plus', 'pro_plus']

// tiers-reference.md § Tier capabilities matrix — Kisi doors apply to
// Autonomous, Autonomous+ and Pro+.
const KISI_TIERS: Tier[] = ['autonomous', 'autonomous_plus', 'pro_plus']

// tiers-reference.md § PH market note — Kisi hardware, NVRs and security
// cameras are not stocked in PH and ship from the US/HK.
const LONG_LEAD_TIME_TIERS: Tier[] = ['pro_plus', 'autonomous', 'autonomous_plus']

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
        message:
          'Basic+ venues have no rack kit — BBPOS terminals only. Everything ' +
          'else in the tier is software. There is nothing here for this tool ' +
          'to size.',
      }],
    }
  }

  if (inputs.brand === 'pingpod') {
    return {
      blocked: true,
      warnings: [{
        code: 'BRAND_UNSUPPORTED',
        level: 'error',
        message:
          'PingPod venues are not supported. They require an audio stack, ' +
          'front-desk hardware and a port-count expansion that the sizing ' +
          'doc does not quantify.',
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
          'Security cameras apply to Autonomous+ (or Pro+ with monitoring) ' +
          'only. On other tiers they would silently upgrade the switch SKU.',
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
          'Kisi doors apply to Autonomous, Autonomous+ and Pro+ only. ' +
          'On other tiers they would silently change the gateway SKU.',
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

  if (inputs.tier === 'pro_plus') {
    warnings.push({
      code: 'TIER_NOT_CANONICAL',
      level: 'warn',
      message:
        'Pro+ has no canonical BOM — confirm scope per deal. Treat this ' +
        'output as a starting point.',
    })
  }

  // tiers-reference.md § Hardware footprint per tier — the Autonomous tiers are
  // NOT interchangeable. Autonomous is Kisi access control on the Pro stack;
  // Autonomous+ is that plus surveillance (cameras, UNVR/UNVR-Pro, 8TB HDDs).
  // Naming an NVR on plain Autonomous would reserve rack U for hardware the
  // tier never includes.
  if (inputs.tier === 'autonomous') {
    warnings.push({
      code: 'TIER_ADDITIONS_MANUAL',
      level: 'warn',
      message:
        'The Kisi kit is not sized here — add the Controller Pro 2 (one per ' +
        'four doors), one Reader Pro 2.1 per door, and a push-to-exit device ' +
        'on mag-lock doors only. This tier has no surveillance hardware.',
    })
    warnings.push({
      code: 'TIER_RACK_UNDERSIZED',
      level: 'warn',
      message:
        'Rack size is computed without the Kisi controller. Verify the ' +
        'bracket before ordering.',
    })
  }

  if (inputs.tier === 'autonomous_plus') {
    warnings.push({
      code: 'TIER_ADDITIONS_MANUAL',
      level: 'warn',
      message:
        'The Kisi kit, NVR and 8TB HDDs are not sized here — add them ' +
        'manually. NVR model follows the security-camera count: UNVR up to ' +
        '20, UNVR-Pro 21-35, two UNVRs 36-40, two UNVR-Pro 41-60. Above 60 ' +
        'cameras the source has no row — size by hand.',
    })
    warnings.push({
      code: 'TIER_RACK_UNDERSIZED',
      level: 'warn',
      message:
        'Rack size is computed without the Kisi controller, the NVR (an ' +
        'NVR-Pro is 2U) and its drives. Verify the bracket before ordering.',
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
