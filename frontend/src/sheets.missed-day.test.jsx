// @vitest-environment happy-dom
// #284: "I forgot to check in, so it appears later in the history as a missed day." A planned day
// in the past with nothing logged offers to log it, from the week strip and the calendar (both
// open the day sheet), and what gets logged is built like any session of that plan.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { dayAssignSheet, dayOverrideSheet, logPastWorkoutSheet, finishWorkout, plannedActivityOptionsSheet, startFlow } from './sheets.jsx'
import { sportsOnWeekday } from './lib/sport-plan.js'
import { datedActivitiesOn, plannedSportsOn } from './lib/dated-activity-plan.js'
import { scheduledWorkoutOf, completedScheduledWorkout } from './lib/scheduled-workouts.js'
import { effectiveRoutineIds } from './lib/history.js'
import { markAllSetsDone } from './lib/backfill.js'
import { EXDB } from './lib/exercises-data.js'
import { fmtClock, fmtDate } from './lib/format.js'
import { activitySheet } from './components/ActivitySheet.jsx'
import { recoverySheet } from './components/RecoverySheet.jsx'

bindUI(useUI)

const BENCH = '0025'
const ROW = EXDB.find(e => e.id !== BENCH && e.bp === 'back' && e.eq === 'barbell').id
const clone = v => JSON.parse(JSON.stringify(v))
const S = () => useStore.getState().S
const mounted = []

function mountTopSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
function tapMenuAction(host, label) {
  const item = [...host.querySelectorAll('.menu-item')].find(row => row.querySelector('.tt')?.textContent === label)
  expect(item, label).toBeTruthy()
  act(() => item.click())
}

function typeStartTime(host, value) {
  const input = host.querySelector('input[type="time"]')
  act(() => {
    Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
// Mounted before the click's own act(): a render nested inside it lands only once it is over.
function tapInTopSheet(text) {
  const target = button(mountTopSheet(), text)
  expect(target, text).toBeTruthy()
  act(() => { target.click() })
}

function install(extra = {}) {
  const st = clone(DEF)
  Object.assign(st, {
    routines: [
      { id: 'A', name: 'Push', emoji: 'dumbbell', ex: [{ id: BENCH, sets: 2, reps: 10, weight: 50, mode: 'reps' }] },
      { id: 'B', name: 'Pull', emoji: 'dumbbell', ex: [{ id: ROW, sets: 3, reps: 8, weight: 40, mode: 'reps' }] },
    ],
    // Monday trains both routines as one session, Friday just the first.
    week: { 1: ['A', 'B'], 5: ['A'] }, dayPlan: {}, active: null, workouts: [], weighIn: false,
  }, extra)
  useStore.setState({ S: st, user: null })
}

beforeEach(() => {
  // Wednesday 16 September 2026, midday.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-16T12:00:00'))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useUI.setState({ sheets: [], toasts: [] })
  document.body.innerHTML = ''
  install()
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach(root => root.unmount()) })
  vi.useRealTimers()
})

describe('one-off workouts on the calendar', () => {
  it('adds more than one exercise, only on the chosen Friday, and starts beside the weekly routine', () => {
    const friday = '2026-09-18'
    dayOverrideSheet(friday)
    tapInTopSheet('Schedule a one-off workout')
    const form = mountTopSheet()
    expect(button(form, 'Save').disabled).toBe(true)
    expect(form.textContent).toContain('Location not set')
    act(() => button(form, 'Workout locationLocation not set').click())
    tapInTopSheet('At home')
    act(() => button(form, 'Add exercise').click())
    const picker = mountTopSheet()
    const quickPicks = picker.querySelectorAll('.item.tap-host button.chev')
    expect(quickPicks.length).toBeGreaterThan(1)
    act(() => { quickPicks[0].click(); quickPicks[1].click() })
    act(() => useUI.getState().closeSheet(useUI.getState().sheets.at(-1).id))
    expect(form.querySelectorAll('.list .lrow').length).toBe(2)
    act(() => button(form, 'Save').click())

    const planned = scheduledWorkoutOf(S(), friday)
    expect(planned.ex).toHaveLength(2)
    expect(planned.workoutLocation).toBe('home')
    expect(scheduledWorkoutOf(S(), '2026-09-25')).toBeNull()
    expect(effectiveRoutineIds(S(), friday)).toEqual(['A'])
    expect(S().routines.map(r => r.id)).toEqual(['A', 'B'])
    expect(S().workouts).toEqual([])

    act(() => useStore.getState().update(s => { s.lastWorkoutLocation = 'gym' }))
    vi.setSystemTime(new Date(friday + 'T12:00:00'))
    dayOverrideSheet(friday)
    tapInTopSheet('Start workout')
    expect(S().active).toMatchObject({ d: friday, routineIds: [], scheduledWorkoutId: planned.id, workoutLocation: 'home' })
    expect(S().active.entries.map(e => e.id)).toEqual(planned.ex.map(c => c.id))
    act(() => useStore.getState().update(s => { s.active.entries = markAllSetsDone(s.active.entries) }))
    act(() => finishWorkout())
    expect(completedScheduledWorkout(S(), planned)).toMatchObject({ d: friday, scheduledWorkoutId: planned.id, workoutLocation: 'home' })
    dayOverrideSheet(friday)
    expect(button(mountTopSheet(), 'Start workout')).toBeUndefined()
    expect(effectiveRoutineIds(S(), friday)).toEqual(['A'])
  })

  it('starts at the configured weights and reps even if the profile prefers last session', () => {
    const day = '2026-09-16'
    install({
      startFrom: 'last',
      scheduledWorkouts: { [day]: { id: 'extra', name: 'Extra bench', ex: [{ id: BENCH, sets: 2, reps: 7, weight: 45, mode: 'reps' }] } },
      workouts: [{ d: '2026-09-13', id: 'last', start: 1, end: 2, entries: [{ id: BENCH, sets: [{ w: 70, r: 12, done: true }] }] }],
    })
    dayOverrideSheet(day)
    tapInTopSheet('Start workout')
    expect(S().active.entries[0]).toMatchObject({
      id: BENCH, sets: [{ w: 45, r: 7, done: false }, { w: 45, r: 7, done: false }],
    })
  })
})

describe('workout locations in routine plans', () => {
  it('prefills weigh-in from the plan and accepts a different location for this workout', () => {
    install({ weighIn: true, lastWorkoutLocation: 'gym' })
    useStore.getState().update(s => { s.routines[0].workoutLocation = 'home' })
    act(() => startFlow(['A']))
    const weighIn = mountTopSheet()
    const location = button(weighIn, 'Workout locationAt home')
    expect(location).toBeTruthy()
    act(() => location.click())
    tapInTopSheet('Gym')
    act(() => button(weighIn, 'Start without weighing in').click())
    expect(S().active.workoutLocation).toBe('gym')
    expect(S().routines[0].workoutLocation).toBe('home')
  })

  it('leaves the location open for a session that combines routines at different places', () => {
    install({ lastWorkoutLocation: 'home' })
    useStore.getState().update(s => {
      s.routines[0].workoutLocation = 'home'
      s.routines[1].workoutLocation = 'gym'
    })
    act(() => startFlow(['A', 'B']))
    expect(S().active.workoutLocation).toBe('unspecified')
    expect(S().lastWorkoutLocation).toBe('home')
  })
})

describe('dated sports and recovery', () => {
  it('opens the recording form for today and cancels a future arrangement with undo', () => {
    const today = '2026-09-16'
    const friday = '2026-09-18'
    install({
      datedActivityPlan: {
        [today + ':sport:fight']: { on: true },
        [friday + ':recovery:stretch']: { on: true },
        [friday + ':recovery:sauna']: { on: true },
      },
    })
    act(() => plannedActivityOptionsSheet(today, 'sport', 'fight'))
    const sport = mountTopSheet()
    expect(sport.querySelector('h3').textContent).toBe('Boxing & martial arts')
    expect(sport.textContent).toContain('Cancel this arrangement')
    tapMenuAction(sport, 'Record completion')
    expect(mountTopSheet().querySelector('[data-datefield]').value).toBe(today)
    act(() => useUI.getState().closeAll())

    act(() => dayOverrideSheet(friday))
    tapInTopSheet('MobilityPlanned recovery')
    const recovery = mountTopSheet()
    expect(recovery.textContent).not.toContain('Record completion')
    tapMenuAction(recovery, 'Cancel this arrangement')
    expect(datedActivitiesOn(S(), friday, 'recovery')).toEqual(['sauna'])
    expect(datedActivitiesOn(S(), today, 'sport')).toEqual(['fight'])
    const undo = useUI.getState().toastAction
    expect(undo.label).toBe('Undo')
    act(() => undo.run())
    expect(datedActivitiesOn(S(), friday, 'recovery')).toEqual(['sauna', 'stretch'])
  })

  it('shows the weekly editor for recurring sports on the selected weekday', () => {
    const friday = '2026-09-18'
    install({ sportPlan: { '5:fight': { on: true } } })
    act(() => plannedActivityOptionsSheet(friday, 'sport', 'fight'))
    const menu = mountTopSheet()
    expect(menu.textContent).toContain('Every Friday')
    expect(menu.textContent).not.toContain('Cancel this arrangement')
    tapMenuAction(menu, 'Edit fixed days')
    const editor = mountTopSheet()
    expect(button(editor, 'Boxing & martial arts').getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps optional times through save and clears them when the field is emptied', () => {
    const day = '2026-09-15'
    const start = new Date(day + 'T23:50:00').getTime()
    for (const [open, key, row] of [
      [activitySheet, 'activities', '.act-row .ss'],
      [recoverySheet, 'recoverySessions', '.rec-row .ss'],
    ]) {
      act(() => open({ day }))
      let form = mountTopSheet()
      expect(form.querySelector('input[type="time"]').value).toBe('')
      expect(form.textContent).not.toContain('End time')
      typeStartTime(form, '23:50')
      expect(form.textContent).toContain('End time')
      expect(form.textContent).toContain(fmtDate('2026-09-16', true))
      act(() => button(form, 'Save').click())
      const [id, saved] = Object.entries(S()[key])[0]
      expect(saved.at).toBe(start)

      act(() => dayOverrideSheet(day))
      expect(mountTopSheet().querySelector(row).textContent).toContain(fmtClock(start))
      act(() => open({ id }))
      form = mountTopSheet()
      expect(form.querySelector('input[type="time"]').value).toBe('23:50')
      typeStartTime(form, '')
      act(() => button(form, 'Save').click())
      expect(S()[key][id].at).toBeUndefined()
      act(() => dayOverrideSheet(day))
      const line = mountTopSheet().querySelector(row).textContent
      expect(line).toContain('min')
      expect(line).not.toContain(fmtClock(start))
    }
  })

  it('schedules both categories for one date and opens the matching record forms', () => {
    const friday = '2026-09-18'
    dayOverrideSheet(friday)
    const day = mountTopSheet()

    act(() => button(day, 'Schedule sport').click())
    let picker = mountTopSheet()
    act(() => button(picker, 'Boxing & martial arts').click())
    act(() => button(picker, 'Save').click())

    act(() => button(day, 'Schedule recovery').click())
    picker = mountTopSheet()
    act(() => {
      button(picker, 'Mobility').click()
      button(picker, 'Sauna').click()
    })
    act(() => button(picker, 'Save').click())

    expect(day.textContent).toContain('Boxing & martial artsPlanned sport')
    expect(day.textContent).toContain('MobilityPlanned recovery')
    expect(day.textContent).toContain('SaunaPlanned recovery')
    expect(plannedSportsOn(S(), '2026-09-25')).toEqual([])
    expect(datedActivitiesOn(S(), '2026-09-25', 'recovery')).toEqual([])
    expect(Object.values(S().activities || {})).toEqual([])
    expect(Object.values(S().recoverySessions || {})).toEqual([])

    act(() => button(day, 'Schedule recovery').click())
    picker = mountTopSheet()
    expect(button(picker, 'Sauna').getAttribute('aria-pressed')).toBe('true')
    act(() => button(picker, 'Sauna').click())
    act(() => button(picker, 'Save').click())
    expect(day.textContent).not.toContain('SaunaPlanned recovery')

    vi.setSystemTime(new Date(friday + 'T12:00:00'))
    dayOverrideSheet(friday)
    tapInTopSheet('MobilityRecord completion')
    let log = mountTopSheet()
    expect(log.querySelector('[role="radio"][aria-checked="true"]').textContent).toBe('Mobility')
    expect(log.querySelector('[data-datefield]').value).toBe(friday)
    act(() => button(log, 'Save').click())
    expect(Object.values(S().recoverySessions)).toMatchObject([{ d: friday, kind: 'stretch', min: 20 }])

    dayOverrideSheet(friday)
    tapInTopSheet('Boxing & martial artsRecord completion')
    log = mountTopSheet()
    expect(log.querySelector('[role="radio"][aria-checked="true"]').textContent).toBe('Boxing & martial arts')
    expect(log.querySelector('[data-datefield]').value).toBe(friday)
    act(() => button(log, 'Save').click())
    expect(Object.values(S().activities)).toMatchObject([{ d: friday, sport: 'fight' }])

    dayOverrideSheet(friday)
    expect(mountTopSheet().textContent).not.toContain('Record completion')
    expect(effectiveRoutineIds(S(), friday)).toEqual(['A'])
  })
})

describe('planning and recording a sport', () => {
  it('schedules boxing without changing the routine, then logs it once on that weekday', () => {
    dayAssignSheet(1)
    const picker = mountTopSheet()
    const boxing = button(picker, 'Boxing & martial arts')
    act(() => boxing.click())
    expect(boxing.getAttribute('aria-pressed')).toBe('true')
    expect(S().week[1]).toEqual(['A', 'B'])
    expect(sportsOnWeekday(S(), 1)).toEqual(['fight'])
    expect(S().activities ?? {}).toEqual({})
    act(() => button(picker, 'Done').click())

    dayOverrideSheet('2026-09-14')
    tapInTopSheet('Boxing & martial artsRecord completion')
    const log = mountTopSheet()
    expect(log.querySelector('[role="radio"][aria-checked="true"]').textContent).toBe('Boxing & martial arts')
    expect(log.querySelector('[data-datefield]').value).toBe('2026-09-14')
    act(() => button(log, 'Save').click())
    expect(Object.values(S().activities)).toMatchObject([{ sport: 'fight', d: '2026-09-14' }])
    expect(S().workouts).toEqual([])

    dayOverrideSheet('2026-09-14')
    expect(mountTopSheet().textContent).not.toContain('Record completion')
    useUI.setState({ sheets: [] })
    dayAssignSheet(1)
    tapInTopSheet('Boxing & martial arts')
    expect(sportsOnWeekday(S(), 1)).toEqual([])
    expect(Object.values(S().activities)).toHaveLength(1)
  })
})

describe('logging a freestyle workout from a date', () => {
  it('opens the selected rest day with an empty workout and leaves the weekday plan in place', () => {
    dayOverrideSheet('2026-09-15')
    tapInTopSheet('Log a freestyle workout')
    const form = mountTopSheet()
    expect(form.querySelector('[data-datefield]').value).toBe('2026-09-15')
    expect(button(form, 'Freestyle').getAttribute('aria-pressed')).toBe('true')
    act(() => button(form, 'Continue').click())
    expect(S().active).toMatchObject({ d: '2026-09-15', routineIds: [], entries: [],
      backfill: { durationMin: 60, replaceId: null } })
    expect(S().week).toEqual({ 1: ['A', 'B'], 5: ['A'] })
  })

  it('offers freestyle from a missed routine and hides workout logging on future dates', () => {
    dayOverrideSheet('2026-09-14')
    const plannedDay = mountTopSheet()
    expect(button(plannedDay, 'Log this workout')).toBeTruthy()
    expect(button(plannedDay, 'Log a freestyle workout')).toBeTruthy()
    act(() => button(plannedDay, 'Log a freestyle workout').click())
    expect(button(mountTopSheet(), 'Freestyle').getAttribute('aria-pressed')).toBe('true')

    dayOverrideSheet('2026-09-18')
    expect(button(mountTopSheet(), 'Log a freestyle workout')).toBeUndefined()
  })
})

describe('logging a missed planned day', () => {
  it('is offered on a past planned day with nothing logged, and nowhere else', () => {
    const offered = iso => {
      useUI.setState({ sheets: [] })
      dayOverrideSheet(iso)
      return !!button(mountTopSheet(), 'Log this workout')
    }
    expect(offered('2026-09-14')).toBe(true)                 // Monday, missed
    expect(offered('2026-09-15')).toBe(false)                // Tuesday, a rest day
    expect(offered('2026-09-16')).toBe(false)                // today: that is still a Start
    expect(offered('2026-09-18')).toBe(false)                // Friday, still to come
    install({ workouts: [{ id: 'w', d: '2026-09-11', start: 1, end: 2, name: 'Push', entries: [], prs: [] }] })
    expect(offered('2026-09-11')).toBe(false)                // last Friday, logged
    install({ dayPlan: { '2026-09-14': 'rest' } })
    expect(offered('2026-09-14')).toBe(false)                // Monday moved to rest
  })

  it('opens "Log a past workout" on that day with the day\'s routines, as one session', () => {
    dayOverrideSheet('2026-09-14')
    tapInTopSheet('Log this workout')
    // the day sheet made way for the log sheet
    expect(useUI.getState().sheets).toHaveLength(1)
    const host = mountTopSheet()
    expect(host.querySelector('h3').textContent).toBe('Log a past workout')
    expect(host.querySelector('[data-datefield]').value).toBe('2026-09-14')
    expect(host.textContent).toContain('Push + Pull')
    act(() => { button(host, 'Continue').click() })

    const A = S().active
    expect(A).toMatchObject({ d: '2026-09-14', name: 'Push + Pull', routineIds: ['A', 'B'], backfill: { durationMin: 60, replaceId: null } })
    // built the way a live session of that plan is: each entry stamped with its routine and plan
    expect(A.entries.map(e => [e.id, e.rid, e.planned?.sets, e.planned?.reps])).toEqual([[BENCH, 'A', 2, 10], [ROW, 'B', 3, 8]])
  })

  it('can switch a missed planned day to a blank freestyle workout', () => {
    dayOverrideSheet('2026-09-14')
    tapInTopSheet('Log this workout')
    const host = mountTopSheet()
    act(() => button(host, 'Freestyle').click())
    expect(host.textContent).toContain('Choose any exercises when you continue.')
    act(() => button(host, 'Continue').click())
    expect(S().active).toMatchObject({ d: '2026-09-14', name: 'Freestyle', routineIds: [], entries: [],
      backfill: { durationMin: 60, replaceId: null } })
  })

  it('offers a single planned routine as the routine itself', () => {
    dayOverrideSheet('2026-09-11')
    tapInTopSheet('Log this workout')
    tapInTopSheet('Continue')
    expect(S().active).toMatchObject({ d: '2026-09-11', name: 'Push', routineIds: ['A'] })
  })

  it('files a completed workout on that date once its sets are marked done', () => {
    dayOverrideSheet('2026-09-14')
    tapInTopSheet('Log this workout')
    tapInTopSheet('Continue')
    act(() => { useStore.getState().update(s => { s.active.entries = markAllSetsDone(s.active.entries) }) })
    act(() => finishWorkout())
    expect(S().active).toBeNull()
    const [w] = S().workouts
    expect(w).toMatchObject({ d: '2026-09-14', routineIds: ['A', 'B'] })
    // Nothing logged before it: every loaded lift in it leads, and gets its badge the way Save in
    // the editor would give it one (QA 1.3.9 — a backfilled finish used to award none).
    expect(w.prs).toEqual(w.entries.filter(e => e.sets.some(x => x.w > 0)).map(e => e.id))
    expect(new Date(w.start).getHours()).toBe(18)
    expect(w.entries.map(e => [e.rid, e.sets.every(s => s.done)])).toEqual([['A', true], ['B', true]])
    expect(w.entries[0].planned).toMatchObject({ sets: 2, reps: 10 })
  })

  // Review of #284: Monday missed, the routine trained again on Tuesday, Monday logged on
  // Wednesday. Built from the whole log, Monday opened at the weight Tuesday had progressed to and
  // was saved with it, filed ahead of Tuesday: a spike on the chart and a best set dated a day early.
  it('builds a missed day from the sessions before it, not from one logged after it', () => {
    const pushed = (id, d, w) => ({
      id, d, start: new Date(d + 'T18:00:00').getTime(), end: new Date(d + 'T19:00:00').getTime(), name: 'Push',
      routineIds: ['A'], prs: [], entries: [{ id: BENCH, rid: 'A', target: { sets: 2, reps: 10, weight: w, mode: 'reps' },
        planned: { sets: 2, reps: 10, weight: 50 }, sets: [{ w, r: 10, done: true }, { w, r: 10, done: true }] }],
    })
    install({ workouts: [pushed('fri', '2026-09-11', 50), pushed('tue', '2026-09-15', 52.5)] })
    dayOverrideSheet('2026-09-14')
    tapInTopSheet('Log this workout')
    tapInTopSheet('Continue')
    const bench = S().active.entries.find(e => e.id === BENCH)
    expect(bench.sets.filter(s => s.phase !== 'warmup').map(s => s.w)).toEqual([52.5, 52.5])
    expect(bench.target.weight).toBe(52.5)
  })

  it('still refuses while a workout is running', () => {
    const toast = vi.fn()
    useUI.setState({ toast })
    install({ active: { id: 'live', entries: [] } })
    dayOverrideSheet('2026-09-14')
    tapInTopSheet('Log this workout')
    expect(toast).toHaveBeenCalledWith('Finish the current workout first.')
    expect(useUI.getState().sheets).toHaveLength(0)
  })

  it('treats a click event from the History button as no day at all', () => {
    logPastWorkoutSheet({ type: 'click', target: null })
    const host = mountTopSheet()
    expect(host.querySelector('[data-datefield]').value).toBe('2026-09-15')
    expect(host.textContent).toContain('Freestyle')
  })
})

// QA 1.3.9: a past workout finished with no badges, while the same sets saved from the editor
// earned them. Both now go through rebuildPrHistory: the logged day gains the badge it leads with
// against what came before it, and a later session it outdoes loses its own.
describe('badges on a workout logged into the past', () => {
  const pushed = (id, d, w, prs = []) => ({
    id, d, start: new Date(d + 'T18:00:00').getTime(), end: new Date(d + 'T19:00:00').getTime(), name: 'Push',
    routineIds: ['A'], prs, entries: [{ id: BENCH, rid: 'A', target: { sets: 1, reps: 10, weight: w, mode: 'reps' },
      sets: [{ w, r: 10, done: true }] }],
  })
  it('awards what the day leads with and takes the badge from a later session it outdoes', () => {
    install({ workouts: [pushed('fri', '2026-09-11', 50, [BENCH]), pushed('tue', '2026-09-15', 52.5, [BENCH])] })
    dayOverrideSheet('2026-09-14')
    tapInTopSheet('Log this workout')
    tapInTopSheet('Continue')
    act(() => { useStore.getState().update(s => {
      s.active.entries = markAllSetsDone(s.active.entries).map(e => e.id === BENCH
        ? { ...e, sets: e.sets.map(x => (x.phase === 'warmup' ? x : { ...x, w: 60 })) }
        : e)
    }) })
    act(() => finishWorkout())
    const byDay = Object.fromEntries(S().workouts.map(w => [w.d, w.prs]))
    expect(byDay['2026-09-14']).toContain(BENCH)
    expect(byDay['2026-09-15']).not.toContain(BENCH)   // 52.5 no longer leads what came before it
    expect(byDay['2026-09-11']).toContain(BENCH)
    // The summary names it.
    expect(mountTopSheet().textContent).toContain('New PR:')
  })
})
