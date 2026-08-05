import type { VenueInputs, Warning, Tier } from './types'

export interface GateResult {
  blocked: boolean
  warnings: Warning[]
}

// tiers-reference.md § Hardware footprint per tier — Basic and Basic+ have no
// rack kit; BBPOS terminals only.
const NO_HARDWARE_TIERS: Tier[] = ['basic', 'basic_plus']

// tiers-reference.md § Tier capabilities matrix — security cameras are
// Autonomous+ only (optionally Pro+ with custom monitoring).
const SECURITY_CAMERA_TIERS: Tier[] = ['autonomous_plus', 'pro_plus']

// tiers-reference.md § Tier capabilities matrix — Kisi doors apply to
// Autonomous, Autonomous+ and Pro+.
const KISI_TIERS: Tier[] = ['autonomous', 'autonomous_plus', 'pro_plus']

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
          'Basic and Basic+ venues have no rack kit or court hardware — ' +
          'BBPOS terminals only. There is nothing for this tool to size.',
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

  if (inputs.tier === 'autonomous' || inputs.tier === 'autonomous_plus') {
    warnings.push({
      code: 'TIER_ADDITIONS_MANUAL',
      level: 'warn',
      message:
        'Kisi kit, NVR and 8TB HDDs are not sized here — add them manually.',
    })
    warnings.push({
      code: 'TIER_RACK_UNDERSIZED',
      level: 'warn',
      message:
        'Rack size is computed without the NVR (2U) and HDDs. Verify the ' +
        'bracket before ordering.',
    })
  }

  return { blocked: false, warnings }
}
