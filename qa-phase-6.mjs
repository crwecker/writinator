import puppeteer from 'puppeteer'

const URL = 'http://localhost:5175'
const SHOT = 'research/stats-iteration/screenshots/phase-6.png'
const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: 1400, height: 1100 },
})
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
await page.keyboard.type('The adept reviews their grimoire and prepares. ')
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

// --- [1] SKILL: add "Lockpicking", level +1 ---
console.log('\n[1] SKILL — add "Lockpicking", level +1')
const skillAddInputId = await testidByPrefix('character-panel-skill-add-input-')
console.log('  skill add input:', skillAddInputId)
check('skill add input exists (skillList rendered)', !!skillAddInputId)
if (skillAddInputId) {
  await page.click(`[data-testid="${skillAddInputId}"]`)
  await page.keyboard.type('Lockpicking')
  await sleep(200)
  const skillAddBtnId = await testidByPrefix('character-panel-skill-add-', 'add-input')
  await page.click(`[data-testid="${skillAddBtnId}"]`)
  await sleep(SETTLE)

  const skillLvlIncId = await testidByPrefix('character-panel-skill-level-inc-')
  console.log('  skill level-inc:', skillLvlIncId)
  await page.click(`[data-testid="${skillLvlIncId}"]`)
  await sleep(SETTLE)

  const skillRowText = await page.evaluate(() => {
    const row = document
      .querySelector('[data-testid^="character-panel-skill-level-inc-"]')
      ?.closest('li')
    return row ? row.innerText.replace(/\s+/g, ' ').trim() : '(none)'
  })
  console.log('  skill row:', skillRowText)
  check('skill row shows Lockpicking · Lv 2', /Lockpicking/.test(skillRowText) && /Lv\s*2/.test(skillRowText))
}

// --- [2] PLAIN LIST (Status Effects): add "Poisoned", verify, remove ---
console.log('\n[2] PLAIN LIST (Status Effects) — add "Poisoned", then remove')
const listAddInputId = await testidByPrefix('character-panel-list-add-input-')
console.log('  list add input:', listAddInputId)
check('plain-list add input exists', !!listAddInputId)
if (listAddInputId) {
  await page.click(`[data-testid="${listAddInputId}"]`)
  await page.keyboard.type('Poisoned')
  await sleep(200)
  const listAddBtnId = await testidByPrefix('character-panel-list-add-', 'add-input')
  await page.click(`[data-testid="${listAddBtnId}"]`)
  await sleep(SETTLE)

  const hasPoisoned = await page.evaluate(() =>
    document.body.innerText.includes('Poisoned'),
  )
  check('Poisoned appears in panel', hasPoisoned)
}

// --- [3] INVENTORY + SPELL (sanity — make sure prior phases still work) ---
console.log('\n[3] INVENTORY + SPELL — sanity, prior phases still work')
const invAddInputId = await testidByPrefix('character-panel-item-add-input-')
await page.click(`[data-testid="${invAddInputId}"]`)
await page.keyboard.type('Mana Potion')
await sleep(200)
const invAddBtnId = await testidByPrefix('character-panel-item-add-', 'add-input')
await page.click(`[data-testid="${invAddBtnId}"]`)
await sleep(SETTLE)
const invIncId = await testidByPrefix('character-panel-item-inc-')
await page.click(`[data-testid="${invIncId}"]`)
await sleep(SETTLE)

const spellAddInputId = await testidByPrefix('character-panel-spell-add-input-')
await page.click(`[data-testid="${spellAddInputId}"]`)
await page.keyboard.type('Magic Missile')
await sleep(200)
const spellAddBtnId = await testidByPrefix('character-panel-spell-add-', 'add-input')
await page.click(`[data-testid="${spellAddBtnId}"]`)
await sleep(SETTLE)
const spellLvlIncId = await testidByPrefix('character-panel-spell-level-inc-')
await page.click(`[data-testid="${spellLvlIncId}"]`)
await sleep(SETTLE)

const panelText = await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="character-panel"]') || document.body
  return panel.innerText
})
check('inventory shows Mana Potion ×2', /Mana Potion.*×\s*2|×\s*2.*Mana Potion/.test(panelText))
check('spells shows Magic Missile Lv 2', /Magic Missile.*Lv\s*2/.test(panelText))

// --- [4] Stat dots produced (one per delta sequence — merge depends) ---
const dotCount = await page.evaluate(() => {
  const cm = document.querySelector('.cm-content')
  return cm ? cm.querySelectorAll('.cm-stat-marker-dot').length : -1
})
console.log('  dot count:', dotCount)
check('at least one stat dot appeared in the doc', dotCount >= 1)

// --- [5] Now remove Poisoned (after some other deltas — verify removal still works) ---
console.log('\n[4] REMOVE plain-list item (Poisoned)')
const listRemoveId = await testidByPrefix('character-panel-list-remove-')
console.log('  list remove testid:', listRemoveId)
if (listRemoveId) {
  await page.click(`[data-testid="${listRemoveId}"]`)
  await sleep(SETTLE)
  const stillHasPoisoned = await page.evaluate(() =>
    document.body.innerText.includes('Poisoned'),
  )
  check('Poisoned removed from panel', !stillHasPoisoned)
}

// --- [6] Make sure all six groups render coherently in one panel ---
console.log('\n[5] ALL GROUPS RENDERED')
const groupCheck = await page.evaluate(() => {
  const text = (document.querySelector('[data-testid="character-panel"]') || document.body).innerText
  return {
    hasHP: /HP[\s\S]*?\d+\s*\/\s*\d+/.test(text),
    hasMP: /MP[\s\S]*?\d+\s*\/\s*\d+/.test(text),
    hasLevel: /LEVEL/i.test(text),
    hasClass: /CLASS/i.test(text),
    hasAttrs: /ATTRIBUTES/i.test(text),
    hasInventory: /INVENTORY/i.test(text),
    hasSpells: /SPELLS/i.test(text),
    hasSkills: /SKILLS/i.test(text),
    hasStatusEffects: /STATUS EFFECTS/i.test(text),
  }
})
console.log('  groups:', JSON.stringify(groupCheck))
check('HP/MP visible', groupCheck.hasHP && groupCheck.hasMP)
check('Level visible', groupCheck.hasLevel)
check('Class visible', groupCheck.hasClass)
check('Attributes visible', groupCheck.hasAttrs)
check('Inventory visible', groupCheck.hasInventory)
check('Spells visible', groupCheck.hasSpells)
check('Skills visible (Phase 6 fix)', groupCheck.hasSkills)
check('Status Effects visible', groupCheck.hasStatusEffects)

await page.screenshot({ path: SHOT, fullPage: false })
console.log('\nSCREENSHOT:', SHOT)
console.log(`\nRESULT: ${pass} passed, ${fail} failed`)

await browser.close()
process.exit(fail > 0 ? 1 : 0)
