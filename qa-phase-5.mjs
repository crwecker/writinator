import puppeteer from 'puppeteer'

const URL = 'http://localhost:5174'
const SHOT = 'research/stats-iteration/screenshots/phase-5.png'
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
await page.keyboard.type('The mage steps forward and begins to chant. ')
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

// --- find the spell add input ---
console.log('\n[1] ADD SPELL — type "Fireball" and click Add')
const addInputId = await testidByPrefix('character-panel-spell-add-input-')
console.log('  add input testid:', addInputId)
check('spell add input exists', !!addInputId)
if (!addInputId) {
  console.log('Aborting — no spell add input. Spells stat may not be rendering.')
  await page.screenshot({ path: SHOT, fullPage: false })
  await browser.close()
  process.exit(1)
}
await page.click(`[data-testid="${addInputId}"]`)
await page.keyboard.type('Fireball')
await sleep(200)
const addBtnId = await testidByPrefix('character-panel-spell-add-', 'add-input')
await page.click(`[data-testid="${addBtnId}"]`)
await sleep(SETTLE)

const afterAdd = await page.evaluate(() => {
  const items = [...document.querySelectorAll('[data-testid^="character-panel-spell-cast-"]')]
  return { spellCount: items.length }
})
console.log('  spell rows after add:', afterAdd.spellCount)
check('one spell row exists', afterAdd.spellCount === 1)

// --- bump mana to 5 ---
console.log('\n[2] BUMP MANA — click mana inc 5x to set cost to 5')
const manaIncId = await testidByPrefix('character-panel-spell-mana-inc-')
console.log('  mana-inc testid:', manaIncId)
for (let i = 0; i < 5; i++) {
  await page.click(`[data-testid="${manaIncId}"]`)
  await sleep(400)
}
await sleep(SETTLE)
const rowAfterMana = await page.evaluate(() => {
  const row = document.querySelector('[data-testid^="character-panel-spell-cast-"]')?.closest('li')
  return row ? row.innerText.replace(/\s+/g, ' ').trim() : '(none)'
})
console.log('  row:', rowAfterMana)
check('row shows MP 5', /MP\s*5/.test(rowAfterMana))

// --- read MP value BEFORE cast ---
const mpBefore = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('*')].filter((e) => (e.textContent || '').trim().startsWith('MP'))
  return document.body.innerText
})
// Just snapshot the body and look for "MP <num>/<max>"
const mpBeforeMatch = mpBefore.match(/MP[^0-9]*?(\d+)\s*\/\s*(\d+)/)
console.log('  MP before cast match:', mpBeforeMatch && mpBeforeMatch[0])
const mpValBefore = mpBeforeMatch ? parseInt(mpBeforeMatch[1], 10) : null
check('MP value found before cast', mpValBefore !== null)

// --- click cast ---
console.log('\n[3] CAST — click cast, MP should drop by 5 and a stat dot should appear')
const castId = await testidByPrefix('character-panel-spell-cast-')
console.log('  cast testid:', castId)
await page.click(`[data-testid="${castId}"]`)
await sleep(SETTLE)

const afterCast = await page.evaluate(() => {
  const cm = document.querySelector('.cm-content')
  return {
    dots: cm ? cm.querySelectorAll('.cm-stat-marker-dot').length : -1,
    body: document.body.innerText,
  }
})
const mpAfterMatch = afterCast.body.match(/MP[^0-9]*?(\d+)\s*\/\s*(\d+)/)
const mpValAfter = mpAfterMatch ? parseInt(mpAfterMatch[1], 10) : null
console.log('  MP after cast:', mpAfterMatch && mpAfterMatch[0], '| dots:', afterCast.dots)
check('stat dot appeared', afterCast.dots >= 1)
check(
  'MP dropped by 5',
  mpValBefore !== null && mpValAfter !== null && mpValAfter === mpValBefore - 5,
)

// --- increment level ---
console.log('\n[4] LEVEL UP — click level inc once')
const lvlIncId = await testidByPrefix('character-panel-spell-level-inc-')
console.log('  level-inc testid:', lvlIncId)
await page.click(`[data-testid="${lvlIncId}"]`)
await sleep(SETTLE)
const rowAfterLvl = await page.evaluate(() => {
  const row = document.querySelector('[data-testid^="character-panel-spell-cast-"]')?.closest('li')
  return row ? row.innerText.replace(/\s+/g, ' ').trim() : '(none)'
})
console.log('  row:', rowAfterLvl)
check('row shows Lv 2', /Lv\s*2/.test(rowAfterLvl))

await page.screenshot({ path: SHOT, fullPage: false })
console.log('\nSCREENSHOT:', SHOT)
console.log(`\nRESULT: ${pass} passed, ${fail} failed`)

await browser.close()
process.exit(fail > 0 ? 1 : 0)
