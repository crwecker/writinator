import { act } from 'react'

/** Set a React-controlled input's value the way typing does (fires `input`). */
export function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    // Number inputs have no selection.
    if (input.type === 'text' || input.type === '') input.setSelectionRange(value.length, value.length)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

export function keyDown(target: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })
}

/** Choose an option of a React-controlled select (fires `change`). */
export function selectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  act(() => {
    setter?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
