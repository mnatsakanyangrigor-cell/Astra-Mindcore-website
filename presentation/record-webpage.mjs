import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'))
const ffmpegPath = require('ffmpeg-static')
const dir = path.dirname(fileURLToPath(import.meta.url))
const framesDir = path.join(dir, 'web-frames')
const outFile = path.join(dir, 'astra-mindcore-webpage.mp4')

const browsers = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]
const fs = require('node:fs')
const executablePath = browsers.find((p) => fs.existsSync(p))
if (!executablePath) throw new Error('Chrome or Edge was not found')

const WIDTH = 1600
const HEIGHT = 900
const DURATION = 60000

function solve(expr) {
  const m = expr.match(/(\d+)\s*([×xX+\-−])\s*(\d+)/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[3])
  const op = m[2]
  if (op === '+' ) return a + b
  if (op === '×' || op === 'x' || op === 'X') return a * b
  return a - b
}

await rm(framesDir, { recursive: true, force: true })
await mkdir(framesDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--hide-scrollbars', '--font-render-hinting=none'],
})
const page = await browser.newPage()
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 })
await page.goto('http://localhost:5173/?present=1', { waitUntil: 'networkidle0' })
await page.waitForSelector('[aria-label="Start session"]')

let frame = 0
let started = false
let wrongTiers = new Set()
let lastExpr = ''
let hardRestAt = 0
let hardSkipped = false
let frozen = false
let job = null
const t0 = Date.now()
const KEY_GAP = 520

while (Date.now() - t0 < DURATION) {
  const shotAt = Date.now()
  const elapsed = shotAt - t0
  const file = path.join(framesDir, String(frame).padStart(4, '0') + '.jpg')
  await page.screenshot({ path: file, type: 'jpeg', quality: 80 })
  frame++
  if (frame % 20 === 0) console.log(`frame ${frame} t=${elapsed}`)

  if (!frozen && elapsed >= DURATION - 10000) {
    frozen = true
    job = null
    await page.evaluate(() => {
      document.getElementById('liveDash')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.astraAnimateDashboard?.()
    })
  }

  if (!frozen && job && Date.now() >= job.at) {
    const key = job.keys.shift()
    if (key === 'Enter') await page.keyboard.press('Enter')
    else await page.keyboard.type(key)
    if (job.keys.length) job.at = Date.now() + KEY_GAP
    else job = null
  } else if (!frozen && !started && elapsed > 2200) {
    started = true
    await page.click('[aria-label="Start session"]')
  } else if (!frozen && started && !job && elapsed > 7000) {
    const state = await page.evaluate(() => {
      const expr = document.querySelector('.mc-q-expr')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      const disp = document.querySelector('.mc-display')
      const locked = !!(disp && (disp.classList.contains('ok') || disp.classList.contains('bad')))
      return { expr, locked }
    })
    if (state.expr.includes('Rest') && state.expr.includes('Hard')) {
      if (!hardRestAt) hardRestAt = Date.now()
      if (!hardSkipped && Date.now() - hardRestAt >= 2000) {
        hardSkipped = true
        await page.click('[aria-label="Skip rest"]')
      }
    } else {
      hardRestAt = 0
    }
    const answer = solve(state.expr)
    if (answer != null && !state.locked && state.expr !== lastExpr) {
      lastExpr = state.expr
      const tier = (state.expr.match(/\d+/)?.[0].length ?? 1) >= 3 ? 'hard' : (state.expr.match(/\d+/)?.[0].length ?? 1) === 2 ? 'medium' : 'easy'
      const wrong = !wrongTiers.has(tier)
      if (wrong) wrongTiers.add(tier)
      const value = String(wrong ? answer + 1 : answer)
      job = { keys: [...value, 'Enter'], at: Date.now() + 400 }
    }
  }

  const spent = Date.now() - shotAt
  const pause = Math.max(0, 140 - spent)
  if (pause) await new Promise((r) => setTimeout(r, pause))
}

await browser.close()
console.log(`captured ${frame} frames`)

const fps = (frame / (DURATION / 1000)).toFixed(3)
await new Promise((resolve, reject) => {
  const child = spawn(
    ffmpegPath,
    [
      '-y',
      '-framerate',
      fps,
      '-i',
      path.join(framesDir, '%04d.jpg'),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outFile,
    ],
    { stdio: 'inherit' },
  )
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code))))
})

await rm(framesDir, { recursive: true, force: true })
console.log('Wrote ' + outFile)
