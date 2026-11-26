// @vitest-environment happy-dom
// #930: Start can pick which workout, today's first; #976: a planned session can open on a preview
// with Start at its foot. Neither starts anything on its own.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { bindUI } from './ui.jsx'
import { todayISO } from '../lib/format.js'

const started = vi.hoisted(() => [])
const menus = vi.hoisted(() => [])
vi.mock('../sheets.jsx', () => ({ startFlow: (ids, opts) => started.push(opts?.lead ? { ids, lead: opts.lead.ex.map(x => x.id) } : ids), menuSheet: m => menus.push(m) }))
import { startPickerSheet, startOrPreview, previewSheet } from './StartSheets.jsx'
import TabBar, { START_HOLD_MS } from './TabBar.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {}, useLocation: () => ({ pathname: '/home' }) }))

bindUI(useUI)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
const wd = new Date(todayISO() + 'T12:00:00').getDay()
beforeEach(() => {
  started.length = 0
  menus.length = 0
  localStorage.removeItem('og_plan_folders')
  const S = structuredClone(DEF)
  S.routines = [
    { id: 'push', name: 'Push', emoji: null, ex: [{ id: '0025', sets: 3, reps: 8, w: 60 }] },
    { id: 'pull', name: 'Pull', emoji: null, ex: [{ id: '0027', sets: 3, reps: 10 }] },
    { id: 'mob', name: 'Morning mobility', emoji: null, ex: [{ id: '1162', sets: 2, reps: 12 }] },
  ]
  S.week = { [wd]: ['push'], [(wd + 1) % 7]: ['pull'] }
  S.weighIn = false
  useStore.setState({ S, user: { id: 1, name: 'x' } })
  useUI.setState({ sheets: [], toastMsg: '' })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const renderTop = () => { const sh = useUI.getState().sheets.at(-1); act(() => root.render(sh.render(() => useUI.getState().closeSheet(sh.id)))) }
const rowTitles = sel => [...host.querySelectorAll(sel + ' .lrow-t')].map(e => e.textContent)
const click = text => act(() => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text || b.querySelector('.lrow-t')?.textContent === text).click())

describe('the start picker (#930)', () => {
  it('has today first, then drop-in options and every other routine', () => {
    startPickerSheet(); renderTop()
    expect(rowTitles('.start-today')).toEqual(['Push'])
    const all = rowTitles('.menu-list')
    expect(all).toEqual(['Push', 'Freestyle workout (pick as you go)', 'Log an activity', 'Log recovery', 'Pull', 'Morning mobility'])
    click('Morning mobility')
    expect(started).toEqual([['mob']])
    expect(useUI.getState().sheets).toHaveLength(0)
  })
  it('places favourites and loose routines before folders and starts from a folder', () => {
    useStore.getState().update(s => {
      s.routines[0].folder = 'Full Body'
      s.routines[1].folder = 'Full Body'
      s.routines.push(
        { id: 'fav', name: 'Favourite routine', folder: 'Full Body', fav: true, ex: [] },
        { id: 'old', name: 'Archived routine', folder: 'Archive', ex: [] }
      )
    })
    startPickerSheet(); renderTop()
    expect(rowTitles('.start-today')).toEqual(['Push'])
    expect(rowTitles('.menu-list').slice(-3)).toEqual(['Favourite routine', 'Morning mobility', 'Pull'])
    const [folder, archive] = [...host.querySelectorAll('button.plan-folder')]
    expect(folder.textContent).toBe('Full Body1')
    expect(folder.getAttribute('aria-expanded')).toBe('true')
    expect(archive.getAttribute('aria-expanded')).toBe('false')
    act(() => folder.click())
    expect(rowTitles('.menu-list')).not.toContain('Pull')
    act(() => folder.click())
    click('Pull')
    expect(started).toEqual([['pull']])
  })

  it('opens planned sport and recovery with the right kind selected', () => {
    const day = todayISO()
    useStore.getState().update(s => {
      s.datedActivityPlan = {
        [day + ':sport:fight']: { on: true },
        [day + ':sport:ride']: { on: true },
        [day + ':recovery:stretch']: { on: true },
      }
      s.activities = { ride: { d: day, sport: 'ride', min: 30 } }
    })
    startPickerSheet(); renderTop()
    expect(rowTitles('.start-today')).toEqual(['Push', 'Boxing & martial arts', 'Mobility'])
    const rowIcon = title => [...host.querySelectorAll('.menu-list .lrow')]
      .find(row => row.querySelector('.lrow-t').textContent === title).querySelector('.lrow-i')
    for (const title of ['Boxing & martial arts', 'Log an activity']) expect(rowIcon(title).classList.contains('act-i')).toBe(true)
    for (const title of ['Mobility', 'Log recovery']) expect(rowIcon(title).classList.contains('rec-i')).toBe(true)
    click('Boxing & martial arts'); renderTop()
    expect(host.querySelector('h3').textContent).toBe('Log an activity')
    expect(host.querySelector('[role="radio"][aria-checked="true"]').textContent).toBe('Boxing & martial arts')
    useUI.getState().closeAll()
    startPickerSheet(); renderTop()
    click('Mobility'); renderTop()
    expect(host.querySelector('h3').textContent).toBe('Log recovery')
    expect(host.querySelector('[role="radio"][aria-checked="true"]').textContent).toBe('Mobility')
    expect(started).toEqual([])
  })

  it('opens the picker on a normal tap when there is no strength plan to start', () => {
    const onStart = vi.fn(), onPick = vi.fn()
    useStore.getState().update(s => { s.week = {} })
    act(() => root.render(<TabBar onStart={onStart} onPick={onPick} />))
    act(() => host.querySelector('[data-tour="start"]').click())
    expect(onPick).toHaveBeenCalledOnce()
    expect(onStart).not.toHaveBeenCalled()
  })

  it('starts the dated extra workout after the regular workout is done', () => {
    const day = todayISO()
    const onStart = vi.fn()
    const onStartScheduled = vi.fn()
    act(() => useStore.getState().update(s => {
      s.scheduledWorkouts = { [day]: { id: 'extra', name: 'Extra', ex: [{ id: '0025' }] } }
    }))
    act(() => root.render(<TabBar onStart={onStart} onStartScheduled={onStartScheduled} />))
    const btn = host.querySelector('[data-tour="start"]')
    act(() => btn.click())
    expect(onStart).toHaveBeenCalledWith(['push'])
    expect(onStartScheduled).not.toHaveBeenCalled()
    act(() => useStore.getState().update(s => {
      s.workouts.push({ d: day, id: 'w', routineIds: ['push'], entries: [] })
    }))
    act(() => btn.click())
    expect(onStartScheduled).toHaveBeenCalledWith(day)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('the Start tab: a tap starts today, a long press opens the picker, "Let me pick" asks every time', () => {
    vi.useFakeTimers()
    try {
      const onStart = vi.fn(), onPick = vi.fn()
      const btn = () => host.querySelector('[data-tour="start"]')
      act(() => root.render(<TabBar onStart={onStart} onPick={onPick} />))
      act(() => btn().click())
      expect(onStart).toHaveBeenCalledWith(['push'])
      act(() => btn().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
      act(() => vi.advanceTimersByTime(START_HOLD_MS + 10))
      expect(onPick).toHaveBeenCalledTimes(1)
      act(() => btn().dispatchEvent(new PointerEvent('pointerup', { bubbles: true })))
      act(() => btn().click())   // the release of the hold starts nothing
      expect(onStart).toHaveBeenCalledTimes(1)
      act(() => useStore.getState().update(s => { s.startPick = 'ask' }))
      act(() => btn().click())
      expect(onPick).toHaveBeenCalledTimes(2)
      expect(onStart).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})

describe('the preview (#976)', () => {
  it('starts at once with the setting off, and previews with it on', () => {
    startOrPreview(['push'])
    expect(started).toEqual([['push']])
    act(() => useStore.getState().update(s => { s.previewStart = true }))
    startOrPreview(['push'])
    expect(started).toHaveLength(1)
    renderTop()
    expect(host.querySelector('h3').textContent).toBe('Push')
    const items = [...host.querySelectorAll('.preview-list li')]
    expect(items).toHaveLength(1)
    expect(items[0].querySelector('.lrow-s').textContent).toMatch(/^3 sets · /)
    click('Start Push')
    expect(started).toEqual([['push'], ['push']])
  })
  it('can swap to another workout from the preview', () => {
    previewSheet(['pull']); renderTop()
    click('Choose a different workout')
    renderTop()
    expect(host.querySelector('h3').textContent).toBe('Start')
  })
})

describe('the exercises you didn’t get to (#985)', () => {
  const yesterday = () => { const d = new Date(todayISO() + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) }
  const leftPull = () => useStore.setState(st => ({ S: { ...st.S,
    routines: st.S.routines.map(r => (r.id === 'pull' ? { ...r, ex: [{ id: '0027' }, { id: '0029' }, { id: '0031' }] } : r)),
    workouts: [{ id: 'w9', d: yesterday(), start: 1, routineIds: ['pull'], entries: [{ id: '0027', rid: 'pull', sets: [{ w: 40, r: 10, done: true }] }] }] } }))

  it('Start asks once: with them first, then today; the answer is remembered', () => {
    leftPull()
    startOrPreview(['push'])
    expect(started).toEqual([])
    const m = menus.at(-1)
    expect(m.title).toBe('You didn’t get to 2 exercises last time')
    expect(m.items[0].label).toBe('Start with the 2 exercises you didn’t get to')
    m.items[0].onClick()
    expect(started).toEqual([{ ids: ['push'], lead: ['0029', '0031'] }])
    expect(useStore.getState().S.leftoverSeen).toBe('w9')
    startOrPreview(['push'])
    expect(started.at(-1)).toEqual(['push'])                 // no second ask
    expect(menus).toHaveLength(1)
  })

  it('"Just today’s plan" lets them go, and today’s own routine is never offered twice', () => {
    leftPull()
    startOrPreview(['pull'])                                    // the same routine again: it has them anyway
    expect(menus).toHaveLength(0)
    expect(started).toEqual([['pull']])
    startOrPreview(['push'])
    menus.at(-1).items[1].onClick()
    expect(started.at(-1)).toEqual(['push'])
    expect(useStore.getState().S.leftoverSeen).toBe('w9')
  })

  it('the picker offers them on top, then today', () => {
    leftPull()
    startPickerSheet(); renderTop()
    expect(host.textContent).toContain('Start with the 2 exercises you didn’t get to')
    expect(host.textContent).toContain('then Push')
    click('Start with the 2 exercises you didn’t get to')
    expect(started).toEqual([{ ids: ['push'], lead: ['0029', '0031'] }])
  })
})
