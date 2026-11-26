// @vitest-environment happy-dom
// The Start button in the tab bar (components/TabBar.jsx) and Home's today row both go straight
// into today's planned session the moment there is one, and only fall through to the Start
// screen when nothing is planned. So on any day with a routine, a freestyle session and the
// "Other routines" list are unreachable — the only other way in, "Choose a different workout"
// on the weigh-in sheet, does not exist with the weigh-in switched off. Home carries that door.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { todayISO } from '../lib/format.js'
import { dayOverrideSheet, plannedActivityOptionsSheet, startFlow } from '../sheets.jsx'
import { startOrPreview, startPickerSheet } from '../components/StartSheets.jsx'
import Home from './Home.jsx'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), plannedActivityOptionsSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))

vi.mock('../components/StartSheets.jsx', () => ({ startPickerSheet: vi.fn(), startOrPreview: vi.fn() }))

const routines = [{ id: 'r1', name: 'Push', emoji: null, ex: [{ id: '0025' }] }]

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  nav.mockClear(); startFlow.mockClear(); startOrPreview.mockClear()
  dayOverrideSheet.mockClear(); plannedActivityOptionsSheet.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

// Every weekday points at a routine and the weigh-in is off: today is always planned, and the
// weigh-in sheet's own way through to the Start screen never opens.
const setS = (over = {}) => useStore.setState(s => ({
  S: {
    ...s.S, routines, dayPlan: {}, workouts: [], active: null, weighIn: false,
    week: { 0: ['r1'], 1: ['r1'], 2: ['r1'], 3: ['r1'], 4: ['r1'], 5: ['r1'], 6: ['r1'] }, ...over,
  },
  user: null,
}))
const mount = () => act(() => root.render(<Home />))
const door = () => [...host.querySelectorAll('button')].find(b => b.textContent.includes('Choose a different workout'))

describe('sports on Home', () => {
  it('breaks down all saved sessions by sport, excluding future or cleared records', () => {
    const today = todayISO()
    setS({
      activities: {
        ride: { d: today, sport: 'ride', min: 30 },
        boxing: { d: today, sport: 'fight', min: 25 },
        sparring: { d: '2020-01-01', sport: 'fight', min: 40, title: 'Sparring' },
        swim: { d: '2099-12-31', sport: 'swim', min: 15 },
        removed: { _ts: 1 },
      },
    })
    mount()
    const rows = [...host.querySelectorAll('.home-sport-counts div')]
    expect(rows.map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]))
      .toEqual([['Boxing & martial arts', '2'], ['Ride', '1']])
    expect(host.textContent).toContain('3 sport sessions total')
  })

  it('opens options from a planned sport and shows the count after recording it', () => {
    const today = todayISO()
    const key = new Date().getDay() + ':fight'
    const sportPlan = { [key]: { on: true, _ts: 1 } }
    setS({ sportPlan, activities: {} })
    mount()
    expect(host.querySelector('.today-row').textContent).toContain('Push')
    const scheduled = host.querySelector('.home-sport-rows button')
    expect(scheduled.textContent).toContain('Boxing & martial arts')
    expect(scheduled.textContent).toContain('Planned sport')
    act(() => scheduled.click())
    expect(plannedActivityOptionsSheet).toHaveBeenCalledWith(today, 'sport', 'fight')
    expect(host.textContent).toContain('0 sport sessions total')
    expect(host.querySelector('.home-sport-counts')).toBeNull()

    act(() => setS({ sportPlan, activities: { boxing: { d: today, sport: 'fight', min: 45 } } }))
    const done = host.querySelector('.home-sport-rows button')
    expect(done.textContent).toContain('Done')
    expect(host.textContent).toContain('1 sport session total')
    expect(host.querySelector('.home-sport-counts').textContent).toBe('Boxing & martial arts1')
    expect(host.textContent).toContain('Sport streak: 1 week')
    act(() => done.click())
    expect(dayOverrideSheet).toHaveBeenLastCalledWith(today)
  })
})

describe('Home — the way to the Start screen when a plan already owns today', () => {
  it('opens day options from the workout row and starts from its Start button', () => {
    setS(); mount()
    const row = host.querySelector('.today-row')
    act(() => row.querySelector('.home-workout-main').click())
    expect(dayOverrideSheet).toHaveBeenCalledWith(todayISO())
    expect(startOrPreview).not.toHaveBeenCalled()
    act(() => row.querySelector('.home-day-action').click())
    expect(startOrPreview).toHaveBeenCalledWith(['r1'])
    expect(dayOverrideSheet).toHaveBeenCalledTimes(1)
  })

  it('only offers the workout picker in today’s calendar shortcuts', () => {
    setS(); mount()
    const buttons = [...host.querySelectorAll('.home-quick-actions button')]
    expect(buttons.map(button => button.textContent)).toEqual(['Choose a different workout'])
  })

  it('opens the start picker (#930) without starting anything', () => {
    setS(); mount()
    act(() => { door().dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(startPickerSheet).toHaveBeenCalled()
    expect(startFlow).not.toHaveBeenCalled()
  })

  it('is still there on a rest day, where freestyle is the only thing left to start', () => {
    setS({ week: {} }); mount()
    expect(door()).toBeTruthy()
  })

  it('goes away once a session is running — that screen resumes it, it does not choose', () => {
    setS({ active: { id: 'a', name: 'Push', start: Date.now(), cur: 0, entries: [] } })
    mount()
    expect(door()).toBeFalsy()
  })

  it('reads an open editor on a saved workout as an edit, not as a session in progress', () => {
    setS({ active: { id: 'w', name: 'Push', start: 1000, cur: 0, entries: [], editingWorkoutId: 'w' } })
    mount()
    const row = host.querySelector('.today-row')
    expect(row.querySelector('.ttl').textContent).toBe('Push')
    expect(row.querySelector('.tag').textContent).toBe('Edit')
    act(() => row.querySelector('.home-workout-main').click())
    expect(dayOverrideSheet).toHaveBeenCalledWith(todayISO())
    act(() => row.querySelector('.home-day-action').click())
    expect(nav).toHaveBeenCalledWith('/workout')
  })

  it('still reads a running session as in progress', () => {
    setS({ active: { id: 'a', name: 'Push', start: Date.now(), cur: 0, entries: [] } })
    mount()
    const row = host.querySelector('.today-row')
    expect(row.querySelector('.ttl').textContent).toBe('Push (in progress)')
    expect(row.querySelector('.tag').textContent).toBe('Resume')
  })
})
