import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'ENT'] as const
const SESSION_SECS = 0.2 * 60
const CONNECT_MS = 3000
const CONNECTED_MS = 3000

type BootPhase = 'idle' | 'connecting' | 'connected'


/** Key face bounds measured from device-front-cutout.png (631×872). */
const COLS = [
  { left: 25.04, width: 15.53 },
  { left: 42.95, width: 15.37 },
  { left: 60.7, width: 15.53 },
] as const

const ROWS = [
  { top: 40.48, height: 7.34 },
  { top: 49.2, height: 7.45 },
  { top: 58.14, height: 7.34 },
  { top: 66.86, height: 7.45 },
] as const

type PadKey = (typeof KEYS)[number]
type Question = { a: number; b: number; op: '×' | '+' | '−'; answer: number }
type Bio = { hr: number; spo2: number; gsr: number }

function makeQuestion(): Question {
  const ops = ['×', '+', '−'] as const
  const op = ops[Math.floor(Math.random() * ops.length)]!
  const a = 2 + Math.floor(Math.random() * 9)
  const b = 2 + Math.floor(Math.random() * 9)
  if (op === '×') return { a, b, op, answer: a * b }
  if (op === '+') return { a, b, op, answer: a + b }
  const [x, y] = a >= b ? [a, b] : [b, a]
  return { a: x, b: y, op, answer: x - y }
}

function makeBio(): Bio {
  return {
    hr: 60 + Math.floor(Math.random() * 41),
    spo2: 95 + Math.floor(Math.random() * 6),
    gsr: Math.round((1 + Math.random() * 9) * 10) / 10,
  }
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function mapKeyboardEvent(e: KeyboardEvent): PadKey | null {
  if (e.key >= '0' && e.key <= '9') return e.key as PadKey
  if (e.code.startsWith('Numpad') && e.key >= '0' && e.key <= '9') return e.key as PadKey
  if (e.key === 'Enter') return 'ENT'
  if (e.key === 'Backspace' || e.key === 'Delete') return 'CLR'
  if (e.key === 'c' || e.key === 'C') return 'CLR'
  return null
}

export function Calculator() {
  const [question, setQuestion] = useState(makeQuestion)
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<'ok' | 'bad' | null>(null)
  const [correct, setCorrect] = useState(0)
  const [incorrect, setIncorrect] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECS)
  const [running, setRunning] = useState(false)
  const [bootPhase, setBootPhase] = useState<BootPhase>('idle')
  const [connectedLeft, setConnectedLeft] = useState(3)
  const [bio, setBio] = useState<Bio>(() => ({ hr: 0, spo2: 0, gsr: 0 }))
  const [showResults, setShowResults] = useState(false)
  const [pressed, setPressed] = useState<PadKey | null>(null)
  const nextTimer = useRef<number | null>(null)
  const pressTimer = useRef<number | null>(null)
  const connectTimer = useRef<number | null>(null)

  const clearNextTimer = useCallback(() => {
    if (nextTimer.current !== null) {
      window.clearTimeout(nextTimer.current)
      nextTimer.current = null
    }
  }, [])

  const clearConnectTimer = useCallback(() => {
    if (connectTimer.current !== null) {
      window.clearTimeout(connectTimer.current)
      connectTimer.current = null
    }
  }, [])

  const flashKey = useCallback((label: PadKey) => {
    setPressed(label)
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => setPressed(null), 120)
  }, [])

  const next = useCallback(() => {
    setQuestion(makeQuestion())
    setInput('')
    setFeedback(null)
  }, [])

  const beginRunning = useCallback(() => {
    setQuestion(makeQuestion())
    setInput('')
    setFeedback(null)
    setBootPhase('idle')
    setConnectedLeft(3)
    setRunning(true)
  }, [])

  const showConnected = useCallback(() => {
    setBootPhase('connected')
    setConnectedLeft(3)
    setBio(makeBio())
    connectTimer.current = window.setTimeout(beginRunning, CONNECTED_MS)
  }, [beginRunning])

  const startSession = useCallback(() => {
    clearNextTimer()
    clearConnectTimer()
    setQuestion(makeQuestion())
    setInput('')
    setFeedback(null)
    setCorrect(0)
    setIncorrect(0)
    setSecondsLeft(SESSION_SECS)
    setRunning(false)
    setBootPhase('connecting')
    setConnectedLeft(3)
    setBio({ hr: 0, spo2: 0, gsr: 0 })
    setShowResults(false)
    setPressed(null)
    connectTimer.current = window.setTimeout(showConnected, CONNECT_MS)
  }, [clearNextTimer, clearConnectTimer, showConnected])

  const resetSession = useCallback(() => {
    clearNextTimer()
    clearConnectTimer()
    setQuestion(makeQuestion())
    setInput('')
    setFeedback(null)
    setCorrect(0)
    setIncorrect(0)
    setSecondsLeft(SESSION_SECS)
    setRunning(false)
    setBootPhase('idle')
    setConnectedLeft(3)
    setBio({ hr: 0, spo2: 0, gsr: 0 })
    setShowResults(false)
    setPressed(null)
  }, [clearNextTimer, clearConnectTimer])

  const playAgain = startSession
  const booting = bootPhase !== 'idle'
  const canReset =
    running || booting || correct > 0 || incorrect > 0 || secondsLeft !== SESSION_SECS || showResults

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setRunning(false)
          setShowResults(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    if (bootPhase !== 'connected' && !running) return
    const id = window.setInterval(() => setBio(makeBio()), 2000)
    return () => window.clearInterval(id)
  }, [bootPhase, running])

  useEffect(() => {
    if (bootPhase !== 'connected') return
    const id = window.setInterval(() => {
      setConnectedLeft((n) => (n > 1 ? n - 1 : 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [bootPhase])

  useEffect(
    () => () => {
      clearNextTimer()
      clearConnectTimer()
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
    },
    [clearNextTimer, clearConnectTimer],
  )

  const onKey = useCallback(
    (label: PadKey) => {
      if (!running) return
      flashKey(label)

      if (label === 'CLR') {
        setInput('')
        setFeedback(null)
        return
      }

      if (label === 'ENT') {
        if (!input) return
        const ok = Number(input) === question.answer
        if (ok) setCorrect((c) => c + 1)
        else setIncorrect((c) => c + 1)
        setFeedback(ok ? 'ok' : 'bad')
        clearNextTimer()
        nextTimer.current = window.setTimeout(next, 200)
        return
      }

      if (feedback) setFeedback(null)
      if (input.length >= 6) return
      setInput((v) => v + label)
    },
    [running, input, question.answer, feedback, flashKey, clearNextTimer, next],
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showResults) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setShowResults(false)
        }
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const label = mapKeyboardEvent(e)
      if (!label) return
      e.preventDefault()
      onKey(label)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKey, showResults])

  const displayClass =
    feedback === 'ok' ? 'mc-display ok' : feedback === 'bad' ? 'mc-display bad' : 'mc-display'

  const showTimer = running || bootPhase === 'connected'
  const showBio = bootPhase === 'connected' || running
  const isReady = !running && !booting && !showResults && secondsLeft !== 0

  return (
    <div
      className="mc"
      aria-label="ASTRA MINDCORE device, front view showing the mental math assessment screen"
    >
      <div className="mc-screen">
        {(showTimer || showBio) && (
          <div className="mc-top">
            <div className="mc-stats" aria-live="polite">
              <span className="mc-timer">{formatTime(secondsLeft)}</span>
            </div>
            <div className="mc-bio" aria-label="Biometrics">
              <span className="mc-bio-item hr">
                <span className="mc-bio-k">HR</span>
                <span className="mc-bio-val">
                  <span className="mc-bio-num">{bio.hr}</span>
                  <span className="mc-bio-unit">bpm</span>
                </span>
              </span>
              <span className="mc-bio-item spo2">
                <span className="mc-bio-k">
                  SpO<sub>2</sub>
                </span>
                <span className="mc-bio-val">
                  <span className="mc-bio-num">{bio.spo2}</span>
                  <span className="mc-bio-unit">%</span>
                </span>
              </span>
              <span className="mc-bio-item gsr">
                <span className="mc-bio-k">GSR</span>
                <span className="mc-bio-val">
                  <span className="mc-bio-num">{bio.gsr.toFixed(1)}</span>
                  <span className="mc-bio-unit">µS</span>
                </span>
              </span>
            </div>
          </div>
        )}

        <div className="mc-q">
          <span className={`mc-q-expr${booting ? ' mc-q-status' : ''}`}>
            {bootPhase === 'connecting' ? (
              <>
                Connecting to smart watch
                <span className="mc-dots" aria-hidden="true" />
              </>
            ) : bootPhase === 'connected' ? (
              'Connected'
            ) : running ? (
              `${question.a} ${question.op} ${question.b}`
            ) : showResults || secondsLeft === 0 ? (
              'TIME UP'
            ) : (
              'Ready'
            )}
          </span>
        </div>
        {!isReady && bootPhase !== 'connecting' && (
          <div className={displayClass} aria-live="polite">
            {bootPhase === 'connected' ? connectedLeft : running ? input || '\u00a0' : '\u00a0'}
          </div>
        )}
      </div>

      <button
        type="button"
        className="mc-start"
        onClick={startSession}
        disabled={running || booting}
        aria-label="Start session"
      >
        <svg className="mc-start-svg" viewBox="0 0 118 140" aria-hidden="true">
          <defs>
            <path
              id="mc-start-curve"
              d="M 28 6 C 2 32 -6 68 6 98 C 22 128 70 148 130 140"
              fill="none"
            />
          </defs>
          <text className="mc-start-text">
            <textPath href="#mc-start-curve" startOffset="0%">
              START
            </textPath>
          </text>
        </svg>
      </button>

      <button
        type="button"
        className="mc-reset"
        onClick={resetSession}
        disabled={!canReset}
        aria-label="Reset session"
      >
        <svg className="mc-start-svg" viewBox="0 0 118 140" aria-hidden="true">
          <defs>
            <path
              id="mc-reset-curve"
              d="M 90 6 C 116 32 124 68 112 98 C 96 128 48 148 -12 140"
              fill="none"
            />
          </defs>
          <text className="mc-start-text">
            <textPath href="#mc-reset-curve" startOffset="0%">
              RESET
            </textPath>
          </text>
        </svg>
      </button>

      <div className="mc-pad" role="group" aria-label="Device keypad">
        {KEYS.map((label, i) => {
          const col = COLS[i % 3]!
          const row = ROWS[Math.floor(i / 3)]!
          const isPressed = pressed === label
          return (
            <button
              key={label}
              type="button"
              className={`mc-key${isPressed ? ' mc-key-pressed' : ''}`}
              data-key={label}
              aria-label={label}
              disabled={!running}
              style={{
                left: `${col.left}%`,
                top: `${row.top}%`,
                width: `${col.width}%`,
                height: `${row.height}%`,
              }}
              onClick={() => onKey(label)}
            />
          )
        })}
      </div>

      {showResults &&
        createPortal(
          <div
            className="mc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mc-results-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowResults(false)
            }}
          >
            <div className="mc-modal-card">
              <h3 id="mc-results-title">Session complete</h3>
              <p className="mc-modal-ok">Correct: {correct}</p>
              <p className="mc-modal-bad">Incorrect: {incorrect}</p>
              <p className="mc-modal-total">Total answered: {correct + incorrect}</p>
              <div className="mc-modal-actions">
                <button type="button" className="btn btn-primary" onClick={playAgain}>
                  Play again
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowResults(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
