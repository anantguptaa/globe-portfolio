/**
 * Coordinates helpers. Run at build time only.
 */

/** 53.52, -113.53 → "53.52°N 113.53°W" (negative latitude = south, negative longitude = west). */
export function formatCoords(lat: number, lon: number): string {
  const ns = lat < 0 ? 'S' : 'N';
  const ew = lon < 0 ? 'W' : 'E';
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}
