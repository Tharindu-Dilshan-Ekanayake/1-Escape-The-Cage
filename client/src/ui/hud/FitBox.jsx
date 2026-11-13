import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Shows its children at their own size, shrunk (never grown past `maxScale`) to fit in
 * `maxWidth` x `maxHeight` CSS pixels, about `origin`. It measures what's actually there
 * - every label, every price - so whatever the content, it never runs past its room.
 * `className` and `style` place the box itself.
 */
export function FitBox({ maxWidth = Infinity, maxHeight = Infinity, maxScale = 1, origin = 'top left', className = '', style, children }) {
  const innerRef = useRef(null)
  const [size, setSize] = useState(null)

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return undefined
    const measure = () => setSize((prev) => (prev && prev.w === el.offsetWidth && prev.h === el.offsetHeight ? prev : { w: el.offsetWidth, h: el.offsetHeight }))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const scale = size ? Math.max(0.3, Math.min(maxScale, size.w > 0 ? maxWidth / size.w : maxScale, size.h > 0 ? maxHeight / size.h : maxScale)) : maxScale
  return (
    <div className={className} style={{ ...style, transform: `scale(${scale})`, transformOrigin: origin }}>
      <div ref={innerRef} className="inline-flex flex-col">
        {children}
      </div>
    </div>
  )
}

export default FitBox
