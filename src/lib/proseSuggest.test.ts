import { describe, expect, it } from 'vitest'
import { findSentenceBefore, suggestFromSentence, type ProseSuggestContext } from './proseSuggest'
import { item, makeHero, stateLookup } from '../test/characterFixtures'

const kael = makeHero('kael', { inventory: [item('Iron Sword'), item('Healing Potion', 2)] })
const mira = makeHero('mira', { color: '#60a5fa' })
const characters = [kael, mira]

const ctx: ProseSuggestContext = {
  characters,
  stateFor: stateLookup(characters),
  knownItems: ['Wolf Pelt'],
}

/** Quick-entry text suggested for `sentence`, or null. */
function suggest(sentence: string, before = '', extra: Partial<ProseSuggestContext> = {}): string | null {
  return suggestFromSentence({ sentence, before }, { ...ctx, ...extra })?.text ?? null
}

describe('suggestFromSentence — items', () => {
  it.each([
    ['Kael picked up a dagger.', 'Kael +Dagger'],
    ['Kael picks up a dagger.', 'Kael +Dagger'],
    ['Kael looted three arrows from the corpse.', 'Kael +3 Arrows'],
    ['Kael bought a lantern from the merchant.', 'Kael +Lantern'],
    ['Kael found a rusty key under the stone.', 'Kael +Rusty Key'],
    ['Kael grabbed the dagger.', 'Kael +Dagger'],
    ['Kael received a Wolf Pelt as payment.', 'Kael +Wolf Pelt'],
    ['Kael pocketed 2 gems.', 'Kael +2 Gems'],
    ['Then Kael quickly grabbed the shield.', 'Kael +Shield'],
    ['Kael picked up the dagger and the shield.', 'Kael +Dagger, +Shield'],
    ['Mira watched as Kael picked up the dagger.', 'Kael +Dagger'],
    ['Kael ducked and grabbed the dagger.', 'Kael +Dagger'],
    ['With a grunt, Kael picked up the Wolf Pelt.', 'Kael +Wolf Pelt'],
    ['Kael picked up a Potion of Healing.', 'Kael +Potion of Healing'],
    // "a sword" is a new one, not the Iron Sword he already carries
    ['Kael picked up a sword and a shield and ran.', 'Kael +Sword, +Shield'],
    ['Kael took the potion from the shelf.', 'Kael +Potion'],
    ['Kael found a gold coin.', 'Kael +1 Gold'],
  ])('%s → %s', (sentence, expected) => {
    expect(suggest(sentence)).toBe(expected)
  })

  it.each([
    ['Kael drank the healing potion.', 'Kael -Healing Potion'],
    ['Kael drank the potion.', 'Kael -Healing Potion'],
    ['Kael used a healing potion.', 'Kael -Healing Potion'],
    ['Kael dropped his sword.', 'Kael -Iron Sword'],
    ['Kael sold the Iron Sword.', 'Kael -Iron Sword'],
    ['Kael lost his dagger in the river.', 'Kael -Dagger'],
  ])('%s → %s', (sentence, expected) => {
    expect(suggest(sentence)).toBe(expected)
  })
})

describe('suggestFromSentence — stats', () => {
  it.each([
    ['Kael gained a level.', 'Kael +1 Level'],
    ['Kael leveled up.', 'Kael +1 Level'],
    ['Kael levelled up at last.', 'Kael +1 Level'],
    ['Kael reached level 4.', 'Kael Level = 4'],
    ['Kael took 15 damage.', 'Kael -15 HP'],
    ['Kael took 15 points of damage from the blast.', 'Kael -15 HP'],
    ['Kael lost 20 HP.', 'Kael -20 HP'],
    ['Kael healed 10.', 'Kael +10 HP'],
    ['Kael recovered 10 HP.', 'Kael +10 HP'],
    ['Mira healed Kael for 12.', 'Kael +12 HP'],
    ['Kael spent 5 mana.', 'Kael -5 MP'],
    ['Kael earned 50 gold.', 'Kael +50 Gold'],
    ['Kael looted 30 gold coins.', 'Kael +30 Gold'],
    ['Kael paid 7 gold for the room.', 'Kael -7 Gold'],
    ['Kael gained 120 XP.', 'Kael +120 XP'],
    ['Kael ranked up.', 'Kael rank up'],
    ['Kael took 15 damage and dropped his sword.', 'Kael -15 HP, -Iron Sword'],
    ['Kael lost 20 HP and gained a level.', 'Kael -20 HP, +1 Level'],
    ['Kael was hit for 12 damage.', 'Kael -12 HP'],
    ['The wolf dealt 12 damage to Kael.', 'Kael -12 HP'],
  ])('%s → %s', (sentence, expected) => {
    expect(suggest(sentence)).toBe(expected)
  })
})

describe('suggestFromSentence — spells, equipment, transfers', () => {
  it.each([
    ['Kael learned Fireball.', 'Kael learns Fireball'],
    ['Kael learned the spell Frost Nova.', 'Kael learns Frost Nova'],
    ['Kael equipped the Iron Sword.', 'Kael equips Iron Sword'],
    ['Kael drew the Iron Sword.', 'Kael equips Iron Sword'],
    ['Kael donned the chainmail.', 'Kael equips Chainmail'],
    ['Kael gave Mira the sword.', 'Kael gives Mira Iron Sword'],
    ['Kael gave the Iron Sword to Mira.', 'Kael gives Mira Iron Sword'],
    ['Kael handed Mira 5 gold.', 'Kael gives Mira 5 Gold'],
  ])('%s → %s', (sentence, expected) => {
    expect(suggest(sentence)).toBe(expected)
  })
})

describe('suggestFromSentence — system messages', () => {
  it.each([
    ['[+1 STR]', 'Kael struck the wolf down.', 'Kael +1 STR'],
    ['+2 DEX.', 'Kael rolled clear.', 'Kael +2 DEX'],
    ["Kael's Strength increased by 2.", '', 'Kael +2 STR'],
    ['[You have gained a level!]', 'Kael stood over the body.', 'Kael +1 Level'],
    ['[Skill learned: Shadow Step]', 'Kael blinked.', 'Kael learns Shadow Step'],
    ['System: You learned Fireball.', 'Kael read the scroll.', 'Kael learns Fireball'],
    ['[Level Up! You are now level 5.]', 'Kael grinned.', 'Kael Level = 5'],
  ])('%s (after "%s") → %s', (sentence, before, expected) => {
    expect(suggest(sentence, before)).toBe(expected)
  })

  it('reads a bracketed system message with an explicit name even inside dialogue quotes', () => {
    expect(suggest('"[Kael has gained a level!]"')).toBe('Kael +1 Level')
  })
})

describe('suggestFromSentence — pronouns', () => {
  it('resolves he/she/they to the only character named earlier in the paragraph', () => {
    expect(suggest('He picked up a dagger.', 'Kael knelt by the body.')).toBe('Kael +Dagger')
    expect(suggest('She took 4 damage.', 'Mira stumbled.')).toBe('Mira -4 HP')
    expect(suggest('They drank the healing potion.', 'Kael was hurt.')).toBe('Kael -Healing Potion')
  })

  it('resolves a pronoun to a name earlier in the same sentence', () => {
    expect(suggest("Kael didn't pick up the dagger, but he grabbed the shield.")).toBe('Kael +Shield')
  })

  it('skips ambiguous pronouns (two characters in play)', () => {
    expect(suggest('He picked up a dagger.', 'Kael nodded to Mira.')).toBeNull()
    expect(suggest('She grabbed the shield.', 'Kael and Mira knelt by the body.')).toBeNull()
  })

  it('skips a pronoun with no named character before it', () => {
    expect(suggest('He picked up a dagger.')).toBeNull()
    expect(suggest('You picked up a dagger.', 'Kael waited.')).toBeNull()
  })
})

describe('suggestFromSentence — negatives', () => {
  it.each([
    // dialogue
    ['"I picked up a dagger," Kael said.'],
    ['"You took 15 damage," Mira said.'],
    ['"Remember when Kael found the sword?" Mira asked.'],
    ['“Kael gained a level last week,” said Mira.'],
    // negation / hedging
    ["Kael didn't pick up the dagger."],
    ['Kael did not pick up the dagger.'],
    ['Kael never picked up the dagger.'],
    ['Kael almost picked up the dagger.'],
    ['Kael nearly drank the healing potion.'],
    ['Kael refused to take the gold.'],
    ['Kael tried to grab the dagger.'],
    // questions
    ['Did Kael pick up the dagger?'],
    ['Kael picked up the dagger?'],
    // the past / hypotheticals
    ['Kael had found the dagger years ago.'],
    ['Kael remembered the day he found the dagger.'],
    ['If Kael found the dagger, he would be rich.'],
    ['Kael would have taken 15 damage.'],
    // idioms
    ['Kael picked up the pace.'],
    ['Kael found his courage.'],
    ['Kael found himself alone.'],
    ['Kael drew a breath.'],
    ['Kael drew closer.'],
    ['Kael lost his temper.'],
    ['Kael lost his footing.'],
    ['Kael dropped to his knees.'],
    ['Kael dropped his guard.'],
    ["Kael grabbed Mira's arm."],
    ['Kael grabbed the door.'],
    ['Kael took a step back.'],
    ['Kael used his sword to cut the rope.'],
    ['Kael learned that the guards were corrupt.'],
    ['Kael received a message from the guild.'],
    ['Kael gave Mira a look.'],
    ["Kael wasn't able to pick up the dagger."],
    ['Kael had no gold.'],
    ['Your Strength has increased by 1.'],
    ['Kael was healed.'],
    // other characters / unknowns
    ['Bob picked up a dagger.'],
    ['The goblin took 15 damage.'],
    ['Mira watched Kael pick up the dagger.'],
    // no-op prose
    ['The rain fell on the city.'],
    [''],
  ])('%s → nothing', (sentence) => {
    expect(suggest(sentence)).toBeNull()
  })

  it('skips a sentence that already contains a stat marker', () => {
    expect(suggest('Kael picked up a dagger<!-- stat:11111111-1111-1111-1111-111111111111 -->.')).toBeNull()
  })

  it('skips muted patterns', () => {
    const first = suggestFromSentence({ sentence: 'Kael grabbed the shield.', before: '' }, ctx)
    expect(first?.keys.length).toBeGreaterThan(0)
    const muted = new Set(first?.keys)
    expect(suggest('Mira grabbed the shield.', '', { muted })).toBeNull()
    expect(suggest('Kael grabbed the dagger.', '', { muted })).toBe('Kael +Dagger')
  })

  it('drops clauses the quick-entry parser rejects (e.g. no such stat)', () => {
    const plain = { ...mira, id: 'plain', name: 'Plain', stats: mira.stats.filter((s) => s.id !== 'level') }
    const chars = [kael, plain]
    expect(suggest('Plain gained a level.', '', { characters: chars, stateFor: stateLookup(chars) })).toBeNull()
  })
})

describe('suggestFromSentence — label and keys', () => {
  it('labels the chip with the character and the change', () => {
    const s = suggestFromSentence({ sentence: 'Kael took 15 damage and dropped his sword.', before: '' }, ctx)
    expect(s?.label).toBe('Kael · -15 HP, -Iron Sword')
    expect(s?.characterIds).toEqual(['kael'])
  })
})

describe('findSentenceBefore', () => {
  it('finds the sentence ending at the caret and the paragraph text before it', () => {
    const doc = 'Kael knelt. He picked up a dagger.'
    const s = findSentenceBefore(doc, doc.length)
    expect(s).toEqual({ from: 12, to: doc.length, text: 'He picked up a dagger.', before: 'Kael knelt. ', markerAfter: false })
  })

  it('allows trailing whitespace and a closing quote after the terminator', () => {
    const doc = 'Intro.\n\n"Run," Kael said. '
    const s = findSentenceBefore(doc, doc.length)
    expect(s?.text).toBe('"Run," Kael said.')
    expect(s?.to).toBe(doc.length - 1)
    expect(s?.before).toBe('')
  })

  it('treats a closed bracket line as a sentence', () => {
    const doc = 'Kael swung.\n[+1 STR]'
    expect(findSentenceBefore(doc, doc.length)?.text).toBe('[+1 STR]')
  })

  it('returns null when the caret is mid-sentence', () => {
    expect(findSentenceBefore('Kael picked up a', 16)).toBeNull()
  })

  it('places `to` after a stat marker-free end and reports a marker right after', () => {
    const doc = 'Kael fell.<!-- stat:11111111-1111-1111-1111-111111111111 --> '
    expect(findSentenceBefore(doc, 10)?.markerAfter).toBe(true)
  })
})
