// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { todayISO } from './lib/format.js'
import { calendarSheet, finishWorkoutNow, logPastWorkoutSheet, startFlow, workoutDetailSheet } from './sheets.jsx'
import HomeCalendar from './components/HomeCalendar.jsx'
import { bindUI } from './components/ui.jsx'

bindUI(useUI)

const mounted = []

function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}

describe('Calendar canonical workout days', () => {
  let original

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    original = useStore.getState().S
    useUI.setState({ sheets: [] })
    document.body.innerHTML = ''
  })

  afterEach(() => {
    act(() => { mounted.splice(0).forEach(root => root.unmount()) })
    useStore.setState({ S: original })
  })

  it('shows recovery and sport marks beside the workout on the same date', () => {
    const day = todayISO()
    const start = new Date(day + 'T08:00:00').getTime()
    useStore.setState({ S: {
      ...original,
      workouts: [{ id: 'lift', d: day, start, end: start + 1200000, name: 'Lift', entries: [] }],
      activities: { ride: { d: day, sport: 'ride', min: 30 } },
      recoverySessions: { stretch: { d: day, kind: 'stretch', min: 15 } },
    } })
    calendarSheet(day)
    const cell = renderTop().querySelector('.cal-d.today')
    expect(cell.querySelector('i.done.unspecified')).toBeTruthy()
    expect(cell.querySelector('.sport-mark.done')).toBeTruthy()
    expect(cell.querySelector('.recovery-mark.done')).toBeTruthy()
    expect(cell.getAttribute('aria-label')).toContain('Recovery logged')
  })

  it('keeps multiple legacy sessions on the heatmap fallback day clickable in Calendar', () => {
    const day = todayISO()
    const start = new Date(day + 'T09:00:00').getTime()
    useStore.setState({ S: {
      ...original,
      workouts: [
        { id: 'legacy-a', d: '', start, end: start + 15 * 60000, name: 'Legacy A', vol: 100, entries: [] },
        { id: 'legacy-b', d: 'not-a-day', start: start + 30 * 60000, end: start + 45 * 60000, name: 'Legacy B', vol: 200, entries: [] },
      ],
    } })

    calendarSheet(day)
    const host = renderTop()
    expect(host.textContent).toContain('2 workouts')
    const trainedDay = host.querySelector('button.cal-d.has')
    expect(trainedDay).toBeTruthy()

    act(() => trainedDay.click())
    const sessions = renderTop()
    expect(sessions.textContent).toContain('Legacy A')
    expect(sessions.textContent).toContain('Legacy B')
    const log = [...sessions.querySelectorAll('button')].find(b => b.textContent === 'Log a freestyle workout')
    expect(log).toBeTruthy()
    act(() => log.click())
    const form = renderTop()
    expect(form.querySelector('[data-datefield]').value).toBe(day)
    expect(form.textContent).toContain('Choose any exercises when you continue.')
  })

  const click = (host, label) => {
    const control = [...host.querySelectorAll('button')].find(button =>
      button.textContent.trim() === label || button.querySelector('.lrow-t')?.textContent === label)
    expect(control).toBeTruthy()
    act(() => control.click())
  }

  const pickLocation = (host, label) => {
    click(host, 'Workout location')
    click(renderTop(), label)
  }

  it('marks both locations in the home and streak calendars after a legacy workout is labeled', async () => {
    const day = todayISO()
    const start = new Date(day + 'T09:00:00').getTime()
    const entry = { d: day, start, end: start + 1200000, name: 'Lift', entries: [] }
    const legacy = { ...entry, start: start + 60000, gym: { id: 'equipment', name: 'Gym' } }
    useStore.setState({ S: {
      ...original, lastWorkoutLocation: null,
      workouts: [{ ...entry, id: 'gym', workoutLocation: 'gym' }, legacy],
    } })

    let detail
    await act(async () => {
      workoutDetailSheet(legacy)
      detail = renderTop()
    })
    pickLocation(detail, 'At home')
    const state = useStore.getState().S
    expect(state.workouts[1]).toMatchObject({ d: day, workoutLocation: 'home', gym: legacy.gym })
    expect(state.lastWorkoutLocation).toBeNull()

    const home = document.createElement('div')
    document.body.appendChild(home)
    const root = createRoot(home)
    mounted.push(root)
    act(() => root.render(<HomeCalendar state={state} today={day} activities={[]} onDay={() => {}} />))
    act(() => calendarSheet(day))
    const calendar = renderTop()
    for (const cell of [home.querySelector('[data-date="' + day + '"]'), calendar.querySelector('.cal-d.today')]) {
      expect(cell.querySelector('.workout-mark.gym')).toBeTruthy()
      expect(cell.querySelector('.workout-mark.home')).toBeTruthy()
      expect(cell.getAttribute('aria-label')).toContain('Gym workout, Home workout')
    }
    click(home, 'Month view')
    expect(home.querySelector('[data-date="' + day + '"] .workout-mark.home')).toBeTruthy()
  })

  it('saves a backfilled location and uses the latest selection as the next workout default', () => {
    useStore.setState({ S: { ...original, active: null, workouts: [], routines: [], lastWorkoutLocation: null, dailyForm: false, weighIn: false } })
    act(() => logPastWorkoutSheet({ iso: '2020-01-02' }))
    const form = renderTop()
    pickLocation(form, 'At home')
    click(form, 'Continue')
    expect(useStore.getState().S.active.workoutLocation).toBe('home')
    act(() => useStore.getState().update(s => {
      s.active.entries.push({ id: '0001', sets: [{ w: 10, r: 8, done: true }] })
    }))
    act(() => finishWorkoutNow())
    expect(useStore.getState().S.workouts[0]).toMatchObject({ d: '2020-01-02', workoutLocation: 'home' })

    act(() => startFlow([]))
    expect(useStore.getState().S.active.workoutLocation).toBe('home')
  })
})
