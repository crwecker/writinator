import puppeteer from 'puppeteer'

const URL = 'http://localhost:5174'
const SHOT = 'research/stats-iteration/screenshots/phase-4-followup.png'
const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1400, height: 900 } })
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console error]', m.text())
})
page.on('dialog', async (d) => {
  await d.accept('QA Book')
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SETTLE = 2000
let pass = 0
let fail = 0
function check(label, cond) {
  if (cond) {
    pass++
    console.log('  PASS', label)
  } else {
    fail++
    console.log('  FAIL', label)
  }
}

await page.evaluateOnNewDocument(() => {
  delete window.showSaveFilePicker
  delete window.showOpenFilePicker
})
async function clickByText(sel, text) {
  const h = await page.evaluateHandle(
    (s, t) => [...document.querySelectorAll(s)].find((e) => (e.textContent || '').trim() === t),
    sel,
    text,
  )
  const el = h.asElement()
  if (!el) throw new Error(`not found: ${sel} "${text}"`)
  await el.click()
}
async function testidByPrefix(prefix, exclude) {
  return page.evaluate(
    (p, ex) => {
      const el = [...document.querySelectorAll('[data-testid]')].find((e) => {
        const t = e.getAttribute('data-testid') || ''
        return t.startsWith(p) && (!ex || !t.includes(ex))
      })
      return el ? el.getAttribute('data-testid') : null
    },
    prefix,
    exclude,
  )
}

// --- setup: book, text, character ---
await page.goto(URL, { waitUntil: 'networkidle2' })
await sleep(1000)
await clickByText('button', 'Create New Book')
await sleep(2500)
await page.click('.cm-content')
await page.keyboard.type('The hero descends into the dungeon. ')
await sleep(600)
await page.click('[data-testid="character-panel-button"]')
await sleep(800)
await clickByText('button', 'Open Character Sheet')
await sleep(800)
await page.click('[data-testid="new-character"]')
await sleep(1000)
await clickByText('button', 'Close')
await sleep(600)
await page.click('[data-testid="character-panel-button"]')
await sleep(1000)

// --- add inventory item, then +,+,- on qty ---
const addInputId = await testidByPrefix('character-panel-item-add-input-')
await page.click(`[data-testid="${addInputId}"]`)
await page.keyboard.type('Health Potion')
await sleep(200)
const addBtnId = await testidByPrefix('character-panel-item-add-', 'add-input')
await page.click(`[data-testid="${addBtnId}"]`)
await sleep(SETTLE)
const incId = await testidByPrefix('character-panel-item-inc-')
const decId = incId.replace('-inc-', '-dec-')
await page.click(`[data-testid="${incId}"]`)
await sleep(SETTLE)
await page.click(`[data-testid="${incId}"]`)
await sleep(SETTLE)
await page.click(`[data-testid="${decId}"]`)
await sleep(SETTLE)

console.log('\n[1] MERGE FIX — +,+,- on qty should produce ONE stat block')
const merge = await page.evaluate(() => {
  const itemRow = document.querySelector('[data-testid^="character-panel-item-inc-"]')?.closest('li')
  const cm = document.querySelector('.cm-content')
  return {
    itemRowText: itemRow ? itemRow.innerText.replace(/\s+/g, ' ').trim() : '(none)',
    statDots: cm ? cm.querySelectorAll('.cm-stat-marker-dot').length : -1,
  }
})
console.log('  itemRow:', merge.itemRowText, '| dots:', merge.statDots)
check('exactly 1 stat dot (was 4 before fix)', merge.statDots === 1)
check('qty is x2', merge.itemRowText.includes('×2'))

// --- open the Edit Stat Change dialog by clicking the dot ---
console.log('\n[2] REORDER — move a delta in the Edit Stat Change dialog')
await page.click('[data-marker-id]')
await sleep(800)
const before = await page.evaluate(() => {
  const modal = document.querySelector('[data-testid="delta-editor-modal"]')
  const kinds = [...document.querySelectorAll('[data-testid="delta-op-kind"]')].map((s) => s.value)
  return { modalOpen: !!modal, kinds }
})
console.log('  modal open:', before.modalOpen, '| delta order:', before.kinds.join(', '))
check('modal opened in edit mode', before.modalOpen)
check('marker holds 2 deltas (itemAdd + itemFieldAdjust)', before.kinds.length === 2)

await page.click('[data-testid="delta-move-down-0"]')
await sleep(400)
const after = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid="delta-op-kind"]')].map((s) => s.value),
)
console.log('  after move-down-0:', after.join(', '))
check(
  'delta order swapped',
  after.length === 2 && after[0] === before.kinds[1] && after[1] === before.kinds[0],
)

// --- drag the dialog by its header ---
console.log('\n[3] DRAGGABLE — drag the dialog header')
const box1 = await page.evaluate(() => {
  const m = document.querySelector('[data-testid="delta-editor-modal"]')
  const r = m.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width }
})
// grab a point in the header, away from the Close button
const grabX = box1.x + 120
const grabY = box1.y + 18
await page.mouse.move(grabX, grabY)
await page.mouse.down()
await page.mouse.move(grabX + 220, grabY + 160, { steps: 10 })
await page.mouse.up()
await sleep(400)
const box2 = await page.evaluate(() => {
  const m = document.querySelector('[data-testid="delta-editor-modal"]')
  const r = m.getBoundingClientRect()
  return { x: r.x, y: r.y }
})
console.log('  moved from', `(${Math.round(box1.x)},${Math.round(box1.y)})`, 'to', `(${Math.round(box2.x)},${Math.round(box2.y)})`)
check('dialog moved right ~220px', Math.abs(box2.x - box1.x - 220) < 12)
check('dialog moved down ~160px', Math.abs(box2.y - box1.y - 160) < 12)

await page.screenshot({ path: SHOT, fullPage: false })
console.log('\nSCREENSHOT:', SHOT)
console.log(`\nRESULT: ${pass} passed, ${fail} failed`)

await browser.close()
process.exit(fail > 0 ? 1 : 0)
