/** A fixed spatial delay: the breeze passes from left to right in tree space. */
export function windPhaseAt(position: Readonly<{ x: number; y: number; z: number }>) {
  const phase = .3 + position.x * .065 + position.y * .01 + position.z * .018;
  return ((phase % 1) + 1) % 1;
}

/** Strength only: preserve each layer's direction, local phase and amplitude cap. */
export function windEnvelope(seconds: number, phase: number) {
  return .85 + .15 * Math.cos(2 * Math.PI * (seconds / 8 - phase));
}

// Both leaf and twig hooks include this header. The guard keeps the shared fields
// declared once, before either layer calls the function, including depth passes.
export const windEnvelopeShader = `
  #ifndef GARDEN_WIND_ENVELOPE
  #define GARDEN_WIND_ENVELOPE
  uniform float windTravel;
  attribute vec2 windPhase;
  float gardenWindEnvelopeAt(float seconds, float phase) {
    float strength = 0.85 + 0.15 * cos(6.28318530718 * (seconds * 0.125 - phase));
    return mix(1.0, strength, windTravel);
  }
  float gardenWindEnvelope(float seconds) { return gardenWindEnvelopeAt(seconds, windPhase.x); }
  #endif
`;
