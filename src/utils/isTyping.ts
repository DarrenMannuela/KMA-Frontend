/** Whether a key press is going into a text field (so page shortcuts stay out of it). */
export const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['TEXTAREA', 'SELECT'].includes(el.tagName) ||
    (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(el.type)))
