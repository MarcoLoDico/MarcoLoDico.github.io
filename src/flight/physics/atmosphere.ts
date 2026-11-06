/** International Standard Atmosphere, troposphere only (a 172 tops out around 14,000 ft). */

export const SEA_LEVEL_DENSITY = 1.225;
const SEA_LEVEL_TEMPERATURE = 288.15;
const SEA_LEVEL_PRESSURE = 101_325;
const LAPSE_RATE = 0.0065;
const GAS_CONSTANT = 287.05;

export function airDensity(altitudeMeters: number): number {
  const h = Math.max(-500, Math.min(11_000, altitudeMeters));
  const temperature = SEA_LEVEL_TEMPERATURE - LAPSE_RATE * h;
  const pressure = SEA_LEVEL_PRESSURE * (temperature / SEA_LEVEL_TEMPERATURE) ** 5.2559;
  return pressure / (GAS_CONSTANT * temperature);
}
