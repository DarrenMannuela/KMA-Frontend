import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageOff, Pipette, Sun, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { supplierDocumentHooks } from '@/hooks'

// Taking a colour from a photo of the supplier's swatches. A photo's colours
// shift with the light it was taken in (warm lamps make everything yellow,
// shade makes it blue and dark), so the picker asks for a tap on something
// white in the same photo first (the paper of a swatch card, a label) and
// corrects the colour by how far that white is off: each channel is scaled,
// in linear light, until the white reads as white again (a von Kries
// correction, the same idea as a camera's white balance). Then a tap on the
// fabric takes the average of a small patch, not one pixel, so the weave
// and noise don't decide the colour.

type RGB = [number, number, number]

const isImageName = (name: string) => /\.(jpe?g|png)$/i.test(name)
const toLinear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const toSrgb = (v: number) => { const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, c)) * 255) }
const hexOf = ([r, g, b]: RGB) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
// Paper isn't a perfect white: what the reference should read as, in linear light (sRGB #f2f2f2).
const WHITE_TARGET = toLinear(242)

/** The colour after correcting for the white reference, if there is one. */
function corrected(sample: RGB, white: RGB | null): RGB {
  if (!white) return sample
  return sample.map((c, i) => {
    const gain = Math.min(4, Math.max(0.25, WHITE_TARGET / Math.max(0.01, toLinear(white[i]))))
    return toSrgb(toLinear(c) * gain)
  }) as RGB
}

/** Opens a colour picked from one of the supplier's photos (or one chosen
 *  from this device, not uploaded) and hands back its hex. */
export function PhotoColorPicker({ supplierId, colourLabel, onPick, onClose }: {
  supplierId: number
  colourLabel?: string
  onPick: (hex: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { data: docs = [] } = supplierDocumentHooks.useBySupplier(supplierId)
  const photos = useMemo(() => docs.filter(d => isImageName(d.file_name)), [docs])
  const [src, setSrc] = useState<string | null>(null)
  const [localUrl, setLocalUrl] = useState<string | null>(null)
  const [step, setStep] = useState<'white' | 'colour'>('white')
  const [white, setWhite] = useState<{ rgb: RGB; x: number; y: number } | null>(null)
  const [sample, setSample] = useState<{ rgb: RGB; x: number; y: number } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pixels = useRef<ImageData | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // The first photo opens by itself.
  useEffect(() => {
    if (!src && photos.length) setSrc(photos[0].file_path)
  }, [photos, src])
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl) }, [localUrl])

  // Draw the photo at a working size (long side up to 1600px), keep its
  // pixels for sampling, and start over on the two taps.
  useEffect(() => {
    if (!src) return
    setWhite(null); setSample(null); setStep('white'); setLoadError(false)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0, w, h)
      try { pixels.current = ctx.getImageData(0, 0, w, h) } catch { setLoadError(true) }
    }
    img.onerror = () => setLoadError(true)
    img.src = src
  }, [src])

  // The average of a small round patch around a point, in canvas pixels.
  const averageAt = (x: number, y: number): RGB | null => {
    const data = pixels.current
    if (!data) return null
    const r = Math.max(3, Math.round(Math.min(data.width, data.height) * 0.012))
    let sr = 0, sg = 0, sb = 0, n = 0
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const px = Math.round(x) + dx, py = Math.round(y) + dy
        if (px < 0 || py < 0 || px >= data.width || py >= data.height) continue
        const i = (py * data.width + px) * 4
        // Averaged in linear light, the way light actually mixes.
        sr += toLinear(data.data[i]); sg += toLinear(data.data[i + 1]); sb += toLinear(data.data[i + 2]); n++
      }
    }
    return n ? [toSrgb(sr / n), toSrgb(sg / n), toSrgb(sb / n)] : null
  }

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height
    const rgb = averageAt(x, y)
    if (!rgb) return
    if (step === 'white') {
      setWhite({ rgb, x, y })
      setStep('colour')
    } else {
      setSample({ rgb, x, y })
    }
  }

  const pickLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = URL.createObjectURL(file)
    setLocalUrl(url)
    setSrc(url)
  }

  // A "white" that's dark or strongly tinted isn't white paper; say so
  // instead of quietly applying a wild correction.
  const whiteWarning = white && (Math.max(...white.rgb) < 110 || Math.max(...white.rgb) - Math.min(...white.rgb) > 90)
  const result = sample ? corrected(sample.rgb, white?.rgb ?? null) : null
  const canvas = canvasRef.current
  const marker = (p: { x: number; y: number } | null, cls: string) => p && canvas ? (
    <span
      className={`pointer-events-none absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 shadow ${cls}`}
      style={{ left: `${(p.x / canvas.width) * 100}%`, top: `${(p.y / canvas.height) * 100}%` }}
      aria-hidden
    />
  ) : null

  return (
    <Modal title={colourLabel ? t('photoColour.titleFor', { code: colourLabel }) : t('photoColour.title')} onClose={onClose} size="lg" guard={false}>
      <div className="space-y-3">
        <p className="text-xs text-slate-600 dark:text-slate-300">{t('photoColour.why')}</p>

        {/* Which photo */}
        <div className="flex flex-wrap items-center gap-2">
          {photos.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSrc(p.file_path)}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 ${src === p.file_path ? 'border-navy-700 dark:border-navy-300' : 'border-transparent hover:border-slate-300'}`}
              title={p.file_name}
              aria-label={p.file_name}
              aria-pressed={src === p.file_path}
            >
              <img src={p.file_path} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={pickLocalFile} />
          <button type="button" className="btn-secondary btn-sm" onClick={() => fileInput.current?.click()}>
            <Upload size={14} aria-hidden /> {t('photoColour.otherPhoto')}
          </button>
        </div>

        {!src ? (
          <div className="flex flex-col items-center text-center gap-2 py-10 text-slate-500 dark:text-slate-400">
            <ImageOff size={28} className="opacity-50" aria-hidden />
            <p className="text-sm">{t('photoColour.noPhotos')}</p>
          </div>
        ) : loadError ? (
          <p className="text-sm text-red-600 py-6 text-center dark:text-red-400">{t('photoColour.loadError')}</p>
        ) : (
          <>
            {/* The two taps, in order */}
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('photoColour.steps')}>
              <button type="button" role="radio" aria-checked={step === 'white'} onClick={() => setStep('white')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border ${step === 'white' ? 'border-navy-700 bg-navy-50 text-navy-900 dark:border-navy-300 dark:bg-white/10 dark:text-slate-50' : 'border-slate-200 text-slate-600 dark:border-navy-700 dark:text-slate-300'}`}>
                <Sun size={13} aria-hidden /> {t('photoColour.stepWhite')} {white && '✓'}
              </button>
              <button type="button" role="radio" aria-checked={step === 'colour'} onClick={() => setStep('colour')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border ${step === 'colour' ? 'border-navy-700 bg-navy-50 text-navy-900 dark:border-navy-300 dark:bg-white/10 dark:text-slate-50' : 'border-slate-200 text-slate-600 dark:border-navy-700 dark:text-slate-300'}`}>
                <Pipette size={13} aria-hidden /> {t('photoColour.stepColour')} {sample && '✓'}
              </button>
              {step === 'white' && !white && (
                <button type="button" className="text-xs text-slate-500 underline dark:text-slate-400" onClick={() => setStep('colour')}>{t('photoColour.skipWhite')}</button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              {step === 'white' ? t('photoColour.tapWhite') : t('photoColour.tapColour')}
            </p>

            <div className="relative max-h-[50vh] overflow-auto rounded-lg bg-slate-100 dark:bg-navy-950">
              <div className="relative inline-block max-w-full align-top">
                <canvas ref={canvasRef} onClick={onCanvasClick} className="block max-w-full h-auto cursor-crosshair" />
                {marker(white, 'border-white ring-2 ring-navy-900/60')}
                {marker(sample, 'border-navy-900 ring-2 ring-white/80')}
              </div>
            </div>

            {whiteWarning && <p className="text-xs text-amber-700 dark:text-amber-400">{t('photoColour.whiteWarning')}</p>}

            {result && sample && (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 p-3 dark:border-navy-700">
                {white && (
                  <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-full ring-1 ring-black/10" style={{ background: hexOf(sample.rgb) }} aria-hidden />
                    <span className="text-xs">
                      <span className="block text-slate-500 dark:text-slate-400">{t('photoColour.asPhotographed')}</span>
                      <span className="font-mono">{hexOf(sample.rgb)}</span>
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-full ring-1 ring-black/10" style={{ background: hexOf(result) }} aria-hidden />
                  <span className="text-xs">
                    <span className="block text-slate-500 dark:text-slate-400">{white ? t('photoColour.corrected') : t('photoColour.uncorrected')}</span>
                    <span className="font-mono font-semibold">{hexOf(result)}</span>
                  </span>
                </div>
                <button type="button" className="btn-primary btn-sm ml-auto" onClick={() => onPick(hexOf(result))}>
                  {t('photoColour.useColour')}
                </button>
              </div>
            )}
          </>
        )}
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('photoColour.tips')}</p>
      </div>
    </Modal>
  )
}
