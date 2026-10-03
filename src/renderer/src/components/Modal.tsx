import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

interface ModalProps {
  label: string
  onClose: () => void
  /** Returns to the previous window; shows a Back button top left and takes over Escape. */
  onBack?: () => void
  /** True while another modal is open on top: Escape then closes that one instead. */
  inert?: boolean
  children: ReactNode
}

/**
 * The app's one window style: centered panel over a dimmed page, Close button and outside-click to close,
 * optional Back button. Esc goes back when there is somewhere to go, otherwise closes.
 */
export function Modal({ label, onClose, onBack, inert = false, children }: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    if (inert) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (onBack ?? onClose)()
    // The mouse's side "back" button.
    const onMouse = (e: MouseEvent) => e.button === 3 && onBack?.()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [onClose, onBack, inert])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
        {onBack && (
          <button className="modal-back" onClick={onBack} title="Back (Esc)">
            <span aria-hidden>←</span> Back
          </button>
        )}
        <button ref={closeRef} className="modal-close" onClick={onClose} title={onBack ? 'Close' : 'Close (Esc)'}>
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
