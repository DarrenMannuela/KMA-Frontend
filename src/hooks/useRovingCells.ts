import { useCallback, useEffect } from 'react'

/** One Tab stop for a whole grid of cells instead of one per cell. Render
 *  every cell with tabIndex -1 and put the returned handler on the grid's
 *  container as onFocus. Whichever cell takes focus (click, arrow key, coming
 *  back from an edit) becomes the one Tab returns to, so Tab enters the grid
 *  where you left it and the next Tab leaves it; arrow keys still move
 *  between cells. Focus on anything else in the container (a row checkbox, a
 *  button) leaves the grid's stop where it was. */
export function useRovingCells(cells: React.MutableRefObject<Map<string, HTMLElement>>) {
  // After every render, make sure one rendered cell is reachable: the stop
  // may have been in a row that was just filtered out or collapsed.
  useEffect(() => {
    let first: HTMLElement | null = null
    for (const c of cells.current.values()) {
      if (c.tabIndex === 0) return
      first ??= c
    }
    if (first) first.tabIndex = 0
  })

  return useCallback((e: React.FocusEvent) => {
    const el = e.target as HTMLElement
    const all = [...cells.current.values()]
    if (!all.includes(el)) return
    for (const c of all) if (c !== el && c.tabIndex === 0) c.tabIndex = -1
    el.tabIndex = 0
  }, [cells])
}
