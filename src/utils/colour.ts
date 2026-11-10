// Colour maths shared by the photo colour picker and the catalogue colour
// reader: sRGB ⇄ linear light, and correcting a colour for the light a photo
// or scan was taken in, using something white in the same picture.

export type RGB = [number, number, number]

export const toLinear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
export const toSrgb = (v: number) => { const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, c)) * 255) }
export const hexOf = ([r, g, b]: RGB) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`

// Paper isn't a perfect white: what the reference should read as, in linear light (sRGB #f2f2f2).
const WHITE_TARGET = toLinear(242)

/** The colour after correcting for a white reference from the same picture:
 *  each channel scaled, in linear light, until that white reads as white
 *  (a von Kries correction, like a camera's white balance). Gains are
 *  capped so a bad reference can't produce a wild result. */
export function corrected(sample: RGB, white: RGB | null): RGB {
  if (!white) return sample
  return sample.map((c, i) => {
    const gain = Math.min(4, Math.max(0.25, WHITE_TARGET / Math.max(0.01, toLinear(white[i]))))
    return toSrgb(toLinear(c) * gain)
  }) as RGB
}

/** Straight-line distance between two colours, 0-441. Rough, but enough to
 *  tell "the same swatch" from "the paper around it". */
export const rgbDistance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
