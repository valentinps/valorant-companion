import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

interface ModalProps {
  label: string
  onClose: () => void
  /** True while another modal is open on top: Escape then closes that one instead. */
  inert?: boolean
  children: ReactNode
}

/** The app's one window style: centered panel over a dimmed page, Close button, Esc and outside-click to close. */
export function Modal({ label, onClose, inert = false, children }: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    if (inert) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, inert])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
        <button ref={closeRef} className="modal-close" onClick={onClose} title="Close (Esc)">
          <span aria-hidden>×</span> Close
        </button>
        {children}
      </div>
    </div>
  )
}

/** Banner at the top of a modal: background image fading into the panel, title left, aside right. */
export function ModalHero({ image, children, aside }: { image: string | null; children: ReactNode; aside?: ReactNode }) {
  const style: CSSProperties | undefined = image ? { backgroundImage: `url(${image})` } : undefined
  return (
    <header className="modal-hero" style={style}>
      <div className="modal-hero-text">{children}</div>
      {aside}
    </header>
  )
}
