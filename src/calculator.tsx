import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'ENT'] as const
const STAGE_SECS = 30
const REST_SECS = 10
const CONNECT_MS = 3000
const CONNECTED_MS = 3000

type Phase = 'idle' | 'connecting' | 'connected' | 'playing' | 'rest' | 'done'
type Difficulty = 'easy' | 'medium' | 'hard'
type StageScores = Record<Difficulty, number>

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const DIFF_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}
const DIFF_DIGITS: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
}

const emptyScores = (): StageScores => ({ easy: 0, medium: 0, hard: 0 })

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

function randDigits(digits: number): number {
  const min = digits === 1 ? 1 : 10 ** (digits - 1)
  const max = 10 ** digits - 1
  return min + Math.floor(Math.random() * (max - min + 1))
}

function makeQuestion(diff: Difficulty): Question {
  const digits = DIFF_DIGITS[diff]
  const ops = ['×', '+', '−'] as const
  const op = ops[Math.floor(Math.random() * ops.length)]!
  const a = randDigits(digits)
  const b = randDigits(digits)
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

function publishPerformance(correct: StageScores, attempted: StageScores, animate = true) {
  for (const diff of DIFFICULTIES) {
    const ok = correct[diff]
    const total = attempted[diff]
    const okPct = total > 0 ? Math.round((ok / total) * 100) : 0
    const badPct = total > 0 ? 100 - okPct : 0

    const totalEl = document.getElementById(`perf-${diff}-total`)
    const okBar = document.getElementById(`perf-${diff}-ok`) as HTMLElement | null
    const badBar = document.getElementById(`perf-${diff}-bad`) as HTMLElement | null
    const okPctEl = document.getElementById(`perf-${diff}-ok-pct`)
    const badPctEl = document.getElementById(`perf-${diff}-bad-pct`)

    if (totalEl) totalEl.textContent = String(total)
    if (okPctEl) okPctEl.textContent = `${okPct}% correct`
    if (badPctEl) badPctEl.textContent = `${badPct}% incorrect`

    if (okBar && badBar) {
      if (animate) {
        okBar.style.width = '0%'
        badBar.style.width = '0%'
        // Force layout so the width transition runs once.
        void okBar.offsetWidth
      }
      okBar.style.width = `${okPct}%`
      badBar.style.width = `${badPct}%`
    }
  }

  const dash = document.getElementById('liveDash')
  if (dash) dash.dataset.sessionDone = '1'
  window.dispatchEvent(new CustomEvent('astra:session-done'))
}

export function Calculator() {
  const [question, setQuestion] = useState(() => makeQuestion('easy'))
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<'ok' | 'bad' | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(STAGE_SECS)
  const [phase, setPhase] = useState<Phase>('idle')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [connectedLeft, setConnectedLeft] = useState(3)
  const [bio, setBio] = useState<Bio>(() => ({ hr: 0, spo2: 0, gsr: 0 }))
  const [pressed, setPressed] = useState<PadKey | null>(null)
  const [qEnter, setQEnter] = useState(false)
  const nextTimer = useRef<number | null>(null)
  const pressTimer = useRef<number | null>(null)
  const connectTimer = useRef<number | null>(null)
  const qEnterTimer = useRef<number | null>(null)
  const difficultyRef = useRef<Difficulty>('easy')
  const stageCorrectRef = useRef<StageScores>(emptyScores())
  const stageAttemptedRef = useRef<StageScores>(emptyScores())
  const inputRef = useRef('')
  const questionRef = useRef(question)

  difficultyRef.current = difficulty
  questionRef.current = question

  const setInputValue = useCallback((value: string) => {
    inputRef.current = value
    setInput(value)
  }, [])

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

  const triggerQEnter = useCallback(() => {
    setQEnter(true)
    if (qEnterTimer.current !== null) window.clearTimeout(qEnterTimer.current)
    qEnterTimer.current = window.setTimeout(() => setQEnter(false), 350)
  }, [])

  const next = useCallback(() => {
    setQuestion(makeQuestion(difficultyRef.current))
    setInputValue('')
    setFeedback(null)
    triggerQEnter()
  }, [triggerQEnter, setInputValue])

  const startStage = useCallback(
    (diff: Difficulty) => {
      clearNextTimer()
      difficultyRef.current = diff
      setDifficulty(diff)
      setQuestion(makeQuestion(diff))
      setInputValue('')
      setFeedback(null)
      setSecondsLeft(STAGE_SECS)
      setPhase('playing')
      triggerQEnter()
    },
    [clearNextTimer, triggerQEnter, setInputValue],
  )

  const startRest = useCallback(
    (nextDiff: Difficulty) => {
      clearNextTimer()
      difficultyRef.current = nextDiff
      setDifficulty(nextDiff)
      setInputValue('')
      setFeedback(null)
      setSecondsLeft(REST_SECS)
      setPhase('rest')
      triggerQEnter()
    },
    [clearNextTimer, triggerQEnter, setInputValue],
  )

  const finishSession = useCallback(() => {
    clearNextTimer()
    setPhase('done')
    setInputValue('')
    setFeedback(null)
    publishPerformance(stageCorrectRef.current, stageAttemptedRef.current, true)
  }, [clearNextTimer, setInputValue])

  const beginRunning = useCallback(() => {
    startStage('easy')
    setConnectedLeft(3)
  }, [startStage])

  const showConnected = useCallback(() => {
    setPhase('connected')
    setConnectedLeft(3)
    setBio(makeBio())
    connectTimer.current = window.setTimeout(beginRunning, CONNECTED_MS)
  }, [beginRunning])

  const startSession = useCallback(() => {
    clearNextTimer()
    clearConnectTimer()
    stageCorrectRef.current = emptyScores()
    stageAttemptedRef.current = emptyScores()
    const dash = document.getElementById('liveDash')
    if (dash) delete dash.dataset.sessionDone
    publishPerformance(emptyScores(), emptyScores(), false)
    setQuestion(makeQuestion('easy'))
    setInputValue('')
    setFeedback(null)
    setSecondsLeft(STAGE_SECS)
    setDifficulty('easy')
    difficultyRef.current = 'easy'
    setPhase('connecting')
    setConnectedLeft(3)
    setBio({ hr: 0, spo2: 0, gsr: 0 })
    setPressed(null)
    setQEnter(false)
    connectTimer.current = window.setTimeout(showConnected, CONNECT_MS)
  }, [clearNextTimer, clearConnectTimer, showConnected, setInputValue])

  const skip = useCallback(() => {
    if (phase === 'rest') {
      startStage(difficulty)
      return
    }
    if (phase !== 'playing' || feedback) return
    clearNextTimer()
    next()
  }, [phase, difficulty, feedback, clearNextTimer, next, startStage])

  const booting = phase === 'connecting' || phase === 'connected'
  const playing = phase === 'playing'
  const resting = phase === 'rest'
  const canSkip = (playing && !feedback) || resting
  const sessionActive = playing || resting || booting

  useEffect(() => {
    if (phase !== 'playing' && phase !== 'rest') return
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s > 1 ? s - 1 : 0))
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (secondsLeft !== 0) return
    if (phase === 'playing') {
      const idx = DIFFICULTIES.indexOf(difficulty)
      if (idx >= 0 && idx < DIFFICULTIES.length - 1) {
        startRest(DIFFICULTIES[idx + 1]!)
      } else {
        finishSession()
      }
      return
    }
    if (phase === 'rest') {
      startStage(difficulty)
    }
  }, [secondsLeft, phase, difficulty, startRest, startStage, finishSession])

  useEffect(() => {
    if (phase !== 'done') return
    const target =
      document.getElementById('biometrics') ?? document.getElementById('liveDash')
    if (!target) return
    const id = window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    return () => window.clearTimeout(id)
  }, [phase])

  useEffect(() => {
    if (phase !== 'connected' && phase !== 'playing' && phase !== 'rest') return
    const id = window.setInterval(() => setBio(makeBio()), 2000)
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase !== 'connected') return
    const id = window.setInterval(() => {
      setConnectedLeft((n) => (n > 1 ? n - 1 : 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(
    () => () => {
      clearNextTimer()
      clearConnectTimer()
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
      if (qEnterTimer.current !== null) window.clearTimeout(qEnterTimer.current)
    },
    [clearNextTimer, clearConnectTimer],
  )

  const onKey = useCallback(
    (label: PadKey) => {
      if (!playing) return
      if (feedback) return
      flashKey(label)

      if (label === 'CLR') {
        setInputValue('')
        return
      }

      if (label === 'ENT') {
        const value = inputRef.current
        if (!value) return
        const diff = difficultyRef.current
        const ok = Number(value) === questionRef.current.answer
        stageAttemptedRef.current = {
          ...stageAttemptedRef.current,
          [diff]: stageAttemptedRef.current[diff] + 1,
        }
        if (ok) {
          stageCorrectRef.current = {
            ...stageCorrectRef.current,
            [diff]: stageCorrectRef.current[diff] + 1,
          }
        }
        setFeedback(ok ? 'ok' : 'bad')
        clearNextTimer()
        nextTimer.current = window.setTimeout(next, ok ? 200 : 2000)
        return
      }

      if (inputRef.current.length >= 7) return
      setInputValue(inputRef.current + label)
    },
    [playing, feedback, flashKey, clearNextTimer, next, setInputValue],
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
  }, [onKey])

  const displayClass =
    feedback === 'ok' ? 'mc-display ok' : feedback === 'bad' ? 'mc-display bad' : 'mc-display'

  const showTimer = playing || resting || phase === 'connected'
  const showBio = phase === 'connected' || playing || resting
  const isReady = phase === 'idle'

  let screenLabel: ReactNode
  if (phase === 'connecting') {
    screenLabel = (
      <>
        Connecting to smart watch
        <span className="mc-dots" aria-hidden="true" />
      </>
    )
  } else if (phase === 'connected') {
    screenLabel = 'Connected'
  } else if (playing) {
    screenLabel = `${question.a} ${question.op} ${question.b}`
  } else if (resting) {
    screenLabel = `Rest · ${DIFF_LABEL[difficulty]}`
  } else if (phase === 'done') {
    screenLabel = 'TIME UP'
  } else {
    screenLabel = 'Ready'
  }

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
          <span
            className={`mc-q-expr${booting || resting ? ' mc-q-status' : ''}${qEnter ? ' mc-q-enter' : ''}`}
          >
            {screenLabel}
          </span>
        </div>
        {!isReady && phase !== 'connecting' && (
          <div className={displayClass} aria-live="polite">
            {phase === 'connected'
              ? connectedLeft
              : resting
                ? secondsLeft
                : playing
                  ? input || '\u00a0'
                  : '\u00a0'}
          </div>
        )}
      </div>

      <button
        type="button"
        className="mc-start"
        onClick={startSession}
        disabled={sessionActive}
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
        onClick={skip}
        disabled={!canSkip}
        aria-label={resting ? 'Skip rest' : 'Skip question'}
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
              SKIP
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
              disabled={!playing}
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
    </div>
  )
}
