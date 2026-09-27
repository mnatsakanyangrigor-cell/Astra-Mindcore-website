import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'))
const ffmpegPath = require('ffmpeg-static')
const dir = path.dirname(fileURLToPath(import.meta.url))
const framesDir = path.join(dir, 'frames')
const outFile = path.join(dir, 'astra-mindcore-calculator.mp4')
const htmlPath = path.join(dir, 'calculator-demo.html')

const browsers = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

const FPS = 12
const DURATION = 30
const WIDTH = 1280
const HEIGHT = 720

const executablePath = browsers.find((p) => {
  try {
    return require('node:fs').existsSync(p)
  } catch {
    return false
  }
})
if (!executablePath) throw new Error('Chrome or Edge was not found')
if (!ffmpegPath) throw new Error('ffmpeg-static binary was not found')

await rm(framesDir, { recursive: true, force: true })
await mkdir(framesDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--font-render-hinting=none', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 })
await page.goto('file:///' + htmlPath.replaceAll('\\', '/'), { waitUntil: 'networkidle0' })
await page.evaluate(() => document.fonts.ready)

const total = FPS * DURATION
for (let i = 0; i < total; i++) {
  const ms = Math.round((i / FPS) * 1000)
  await page.evaluate((t) => window.renderAt(t), ms)
  const file = path.join(framesDir, String(i).padStart(4, '0') + '.jpg')
  await page.screenshot({ path: file, type: 'jpeg', quality: 86 })
  if (i % FPS === 0) console.log(`frame ${i}/${total}`)
}
await browser.close()

await new Promise((resolve, reject) => {
  const child = spawn(
    ffmpegPath,
    [
      '-y',
      '-framerate',
      String(FPS),
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
