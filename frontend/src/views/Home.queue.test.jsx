// @vitest-environment happy-dom
// A coach week (S.queue) runs in order and the progress row sits below the calendar.
// Covered here: one chip per session in slot order with its state word, a tap on
// an undone chip starting that routine alone, a done chip staying inert, the status line's
// states, the today row still answering through the same helper, and a session pinned to a day
// (S.dayPlan[iso] = queue routine id) wearing its day on the chip and yielding the light.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { dayOverrideSheet, plannedActivityOptionsSheet, startFlow } from '../sheets.jsx'
import { todayISO, isoOf, fmtClock, fmtDate, fmtDur } from '../lib/format.js'
import Home from './Home.jsx'
import { setLang } from '../lib/i18n.js'

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), plannedActivityOptionsSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '',
}))

const routines = [
  { id: 'd1', name: 'US W1 D1', emoji: null, ex: [{ id: '0025' }] },
  { id: 'd2', name: 'US W1 D2', emoji: null, ex: [{ id: '0025' }] },
  { id: 'd3', name: 'US W1 D3', emoji: null, ex: [{ id: '0025' }] },
  { id: 'own', name: 'Core', emoji: null, ex: [{ id: '0025' }] },
]
// Home reads the clock, so the queue is pinned relative to the real today: applied three days
// ago, active since the day before yesterday, its logged session on a day that is not today.
const SINCE = Date.now() - 3 * 86400000
const daysFromToday = n => { const d = new Date(todayISO() + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const queue = (over = {}) => ({ ids: ['d1', 'd2', 'd3'], since: SINCE, startsOn: daysFromToday(-2), label: 'US W1', ...over })
const logged = id => {
  const start = SINCE + 3600000
  return { id: 'w-' + id, d: isoOf(new Date(start)), start, end: start + 3600000, routineIds: [id], routineId: id, name: routines.find(r => r.id === id).name, entries: [] }
}

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  startFlow.mockClear()
  dayOverrideSheet.mockClear()
  localStorage.removeItem('gym_home_calendar_view')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const setS = (over = {}) => useStore.setState(s => ({
  S: { ...s.S, routines, week: {}, dayPlan: {}, workouts: [], activities: {}, recoverySessions: {},
    datedActivityPlan: {}, sportPlan: {}, active: null, queue: queue(), rotation: null, scheduleMode: null, ...over }, user: null,
}))
const mount = () => act(() => root.render(<Home />))
const chips = () => [...host.querySelectorAll('.queue .chip')]
const chipTexts = () => chips().map(c => c.textContent)
const status = () => host.querySelector('.queue .queue-status')?.textContent
const todayTitle = () => host.querySelector('.today-row .ttl')?.textContent
const card = () => [...host.querySelectorAll('.card .card-head-sub')].map(e => e.textContent).find(x => x.includes('this week'))

describe('Home — coach week progress row', () => {
  it('keeps the calendar above ordered queue chips and lights the first session', () => {
    setS()
    mount()
    expect(host.querySelectorAll('.week .wday')).toHaveLength(7)
    expect(host.querySelector('.queue .row .small').textContent).toBe('US W1')
    expect(chipTexts()).toEqual(['US W1 D1Up next', 'US W1 D2Later', 'US W1 D3Later'])
    expect(chips()[0].className).toBe('chip on')
    expect(status()).toBe('Next: US W1 D1, today')
    expect(todayTitle()).toBe('US W1 D1')
  })

  it('switches the day list before opening its menu and remembers the calendar view', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 25, 12))
    const since = new Date(2026, 10, 24, 8).getTime()
    setS({
      weekStart: 0,
      rotation: { id: 'rot', sequence: ['d1', 'd2', 'd3'] },
      queue: queue({ since, startsOn: '2026-11-24', rotationId: 'rot' }),
      dayPlan: { '2026-11-27': 'd1' },
      workouts: [{ ...logged('own'), d: '2026-11-23', start: since - 86400000, end: since - 82800000 }],
      activities: { ride: { d: '2026-11-23', sport: 'ride', min: 30, at: since - 86400000 } },
      recoverySessions: { stretch: { d: '2026-11-23', kind: 'stretch', min: 20 } },
      datedActivityPlan: {
        '2026-11-27:sport:ride': { on: true },
        '2026-11-27:recovery:stretch': { on: true },
        '2026-11-25:recovery:sauna': { on: true },
      },
    })
    mount()
    const press = text => {
      const control = host.querySelector(`button[aria-label="${text}"]`)
        || [...host.querySelectorAll('button')].find(b => b.textContent === text)
      act(() => control.click())
    }
    press('Month view')
    expect(host.querySelector('.home-calendar-label').textContent).toBe('November 2026')
    expect(host.querySelectorAll('.home-month .wday')).toHaveLength(30)
    expect(host.querySelector('.home-month .cal-h').textContent).toBe('Su')
    expect(host.querySelector('[data-date="2026-11-23"] .dot.done')).toBeTruthy()
    expect(host.querySelector('[data-date="2026-11-23"] .sport-mark.done')).toBeTruthy()
    expect(host.querySelector('[data-date="2026-11-23"] .recovery-mark.done')).toBeTruthy()
    expect(host.querySelector('[data-date="2026-11-27"] .sport-mark.planned')).toBeTruthy()
    expect(host.querySelector('[data-date="2026-11-27"] .recovery-mark.planned')).toBeTruthy()
    expect(host.querySelector('.home-recovery-rows').textContent).toContain('SaunaPlanned recovery')
    expect(host.querySelector('[data-date="2026-11-27"] .dot.ovr')).toBeTruthy()
    expect(host.querySelector('[data-date="2026-11-26"] .dot.plan')).toBeNull()
    expect(chips()).toHaveLength(3)
    const list = host.querySelector('#home-day-list')
    act(() => host.querySelector('[data-date="2026-11-23"]').click())
    expect(dayOverrideSheet).not.toHaveBeenCalled()
    expect(host.querySelector('.home-month [aria-pressed="true"].wday').dataset.date).toBe('2026-11-23')
    expect(list.dataset.selectedDate).toBe('2026-11-23')
    expect(list.querySelector('.home-day-rows').textContent).toContain('Core')
    const startTime = fmtClock(since - 86400000)
    expect(list.querySelector('.home-day-rows .lrow-s').textContent).toContain(startTime)
    expect(list.querySelector('.home-day-rows .lrow-s').textContent).toContain(fmtDur(3600000))
    expect(list.querySelector('.home-sport-rows .lrow-s').textContent).toContain(startTime)
    expect(list.querySelector('.home-sport-rows .lrow-s').textContent).toContain('30 min')
    expect(list.querySelector('.home-recovery-rows .lrow-s').textContent).toBe('20 min')
    expect(list.textContent).not.toContain('Sauna')
    act(() => list.querySelector('.home-day-rows button').click())
    expect(dayOverrideSheet).toHaveBeenCalledWith('2026-11-23')

    act(() => host.querySelector('[data-date="2026-11-27"]').click())
    expect(dayOverrideSheet).toHaveBeenCalledTimes(1)
    expect(list.dataset.selectedDate).toBe('2026-11-27')
    expect(list.textContent).toContain('US W1 D1')
    expect(list.textContent).toContain('Planned sport')
    expect(list.textContent).toContain('Planned recovery')
    act(() => list.querySelector('.home-recovery-rows button').click())
    expect(plannedActivityOptionsSheet).toHaveBeenCalledWith('2026-11-27', 'recovery', 'stretch')
    act(() => list.querySelector('.home-day-heading').click())
    expect(dayOverrideSheet).toHaveBeenLastCalledWith('2026-11-27')

    press('Next month')
    expect(host.querySelector('.home-calendar-label').textContent).toBe('December 2026')
    expect(host.querySelectorAll('.home-month .wday')).toHaveLength(31)
    press('Previous month')
    expect(host.querySelector('.home-calendar-label').textContent).toBe('November 2026')
    press('Previous month')
    expect(host.querySelector('.home-calendar-label').textContent).toBe('October 2026')
    press('October 2026 · Back to today')
    expect(host.querySelector('.home-month [aria-current="date"]').getAttribute('aria-pressed')).toBe('true')
    expect(list.dataset.selectedDate).toBe('2026-11-25')
    expect(list.querySelector('.home-recovery-rows').textContent).toContain('Sauna')
    act(() => root.render(null))
    mount()
    expect(host.querySelectorAll('.home-month .wday')).toHaveLength(30)
    press('Week view')
    expect(host.querySelector('.home-month')).toBeNull()
    expect(host.querySelectorAll('.week .wday')).toHaveLength(7)
    expect(host.querySelector('[data-date="2026-11-23"] .recovery-mark.done')).toBeTruthy()
    expect(chips()).toHaveLength(3)
    act(() => host.querySelector('[data-date="2026-11-23"]').click())
    expect(host.querySelector('#home-day-list').dataset.selectedDate).toBe('2026-11-23')
    expect(dayOverrideSheet).toHaveBeenCalledTimes(2)
    press('Next week')
    expect(host.querySelector('.week [aria-current="date"]')).toBeNull()
    act(() => host.querySelector('button.home-calendar-label').click())
    expect(host.querySelector('.home-calendar-label').textContent).toBe('This week')
    expect(host.querySelector('.week [aria-current="date"]').getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('#home-day-list').dataset.selectedDate).toBe('2026-11-25')
  })

  it('keeps "Up next" in sentence case, as Plan says it, though .chip capitalizes names', async () => {
    setS()
    mount()
    expect(chips()[0].querySelector('.qstate').textContent).toBe('Up next')
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(`${process.cwd()}/src/index.css`, 'utf8')
    expect(css).toMatch(/\.chip \.qstate\{text-transform:none\}/)
  })

  it('a finished workout on a routine marks its chip done and moves the light on', () => {
    setS({ workouts: [logged('d1')] })
    mount()
    expect(chipTexts()).toEqual(['US W1 D1Done', 'US W1 D2Up next', 'US W1 D3Later'])
    expect(chips()[0].disabled).toBe(true)
    expect(chips()[1].className).toBe('chip on')
    expect(host.querySelectorAll('.queue .row .small')[1].textContent).toBe('1 / 3')
    expect(status()).toBe('Next: US W1 D2, today')
    expect(todayTitle()).toBe('US W1 D2')
  })

  it('tapping an undone chip starts that routine alone, in any order; a done chip does nothing', () => {
    setS({ workouts: [logged('d1')] })
    mount()
    act(() => { chips()[2].click() })
    expect(startFlow).toHaveBeenCalledTimes(1)
    expect(startFlow).toHaveBeenCalledWith(['d3'])
    act(() => { chips()[0].click() })
    expect(startFlow).toHaveBeenCalledTimes(1)
  })

  it('a session in progress wins over a chip tap, as on the today row', () => {
    setS({ active: { id: 'a', name: 'US W1 D1', start: Date.now(), cur: 0, entries: [], routineIds: ['d1'] } })
    mount()
    act(() => { chips()[1].click() })
    expect(startFlow).not.toHaveBeenCalled()
  })

  it('before startsOn it says when the week starts, and the today row points at that day', () => {
    const startsOn = daysFromToday(2)
    setS({ queue: queue({ startsOn }) })
    mount()
    expect(status()).toBe('Next week starts ' + fmtDate(startsOn, true))
    expect(chipTexts()[0]).toBe('US W1 D1Up next')
    expect(todayTitle()).toBe('Rest day')
    expect(host.querySelector('.today-row .ss').textContent).toMatch(/^Next session: \w+, US W1 D1$/)
  })

  it('a rotation-managed queue never names a weekday on its empty gap — the row above already says what is next', () => {
    const startsOn = daysFromToday(2)
    setS({ queue: queue({ startsOn, rotationId: 'r1' }) })
    mount()
    expect(status()).toBe('Next week starts ' + fmtDate(startsOn, true))
    expect(todayTitle()).toBe('Rest day')
    expect(host.querySelector('.today-row .ss')).toBeNull()
  })

  it('keeps the calendar and offers to set up an empty rotation', () => {
    setS({ queue: null, rotation: null, scheduleMode: 'rotation', week: {} })
    mount()
    expect(host.querySelectorAll('.week .wday')).toHaveLength(7)
    expect(host.querySelector('.queue')).toBeNull()
    expect(host.textContent).toContain('No rotation yet')
    expect(todayTitle()).toBe('Rest day')
    expect(host.querySelector('.today-row .ss')).toBeNull()
  })

  it('a complete week says so, every chip is inert, and the day goes back to the weekday plan', () => {
    setS({ workouts: [logged('d1'), logged('d2'), logged('d3')], week: { [new Date().getDay()]: ['own'] } })
    mount()
    expect(status()).toBe('Week complete, ask the coach')
    expect(chips().every(c => c.disabled)).toBe(true)
    expect(host.querySelectorAll('.queue .row .small')[1].textContent).toBe('3 / 3')
    expect(todayTitle()).toBe('Core')
  })

  it('a pass this app manages gets its own copy, not the coach-week wording', () => {
    setS({
      queue: queue({ rotationId: 'r1' }),
      rotation: { id: 'r1', sequence: ['d1', 'd2', 'd3'], label: 'US W1' },
      workouts: [logged('d1'), logged('d2'), logged('d3')],
    })
    mount()
    expect(status()).toBe('Round complete')
    // your own loop counts in rounds, like Plan; a coach week keeps the bare count (above)
    expect(host.querySelectorAll('.queue .row .small')[1].textContent).toBe('3 of 3 done this round.')
  })

  it('a managed pass waiting on its startsOn says so without naming a coach week', () => {
    const startsOn = daysFromToday(2)
    setS({
      queue: queue({ startsOn, rotationId: 'r1' }),
      rotation: { id: 'r1', sequence: ['d1', 'd2', 'd3'], label: 'US W1' },
    })
    mount()
    expect(status()).toBe('Next round starts ' + fmtDate(startsOn, true) + '.')
  })

  it('own routines on the weekday ride along beside the queue session', () => {
    setS({ week: { [new Date().getDay()]: ['own'] } })
    mount()
    expect(todayTitle()).toBe('US W1 D1 + Core')
    expect(chipTexts().length).toBe(3)
  })

  it('a rest override for today wins on the today row, and the status line stops saying "today"', () => {
    setS({ dayPlan: { [todayISO()]: 'rest' } })
    mount()
    expect(todayTitle()).toBe('Rest day')
    expect(status()).toBe('Next: US W1 D1')
    expect(chips()[0].className).toContain('on')
  })

  it('a malformed queue from another client shows the weekday dots, never an empty card', () => {
    setS({ queue: { ids: 'd1' }, week: { [new Date().getDay()]: ['own'] } })
    mount()
    expect(host.querySelector('.queue')).toBeNull()
    expect(host.querySelectorAll('.week .wday').length).toBe(7)
    expect(todayTitle()).toBe('Core')
  })

  it('the streak card counts the coach sessions done, wherever in the calendar they fell', () => {
    // Ran long: the queue applied ten days ago and D1 logged the day after — never in this
    // calendar week, whichever weekday today is, so a calendar-week count would show 0 / 3.
    const since = Date.now() - 10 * 86400000, start = since + 3600000
    setS({ queue: queue({ since, startsOn: daysFromToday(-9) }), workouts: [{ ...logged('d1'), d: isoOf(new Date(start)), start, end: start + 3600000 }] })
    mount()
    expect(card()).toMatch(/^1 \/ 3 this week · 1 workout total$/)
  })

  it('the streak card counts your own day beside the coach week, planned and done', () => {
    const now = Date.now()
    const core = { id: 'w-own', d: todayISO(), start: now - 3600000, end: now, routineIds: ['own'], routineId: 'own', name: 'Core', entries: [] }
    setS({ week: { [new Date().getDay()]: ['own'] }, workouts: [logged('d1'), core] })
    mount()
    expect(card()).toMatch(/^2 \/ 4 this week · 2 workouts total$/)
    expect(host.querySelectorAll('.queue .row .small')[1].textContent).toBe('1 / 3')
  })

  it('a managed pass counts your own day beside it exactly as an external one does — ownership plays no part in the tally', () => {
    const now = Date.now()
    const core = { id: 'w-own', d: todayISO(), start: now - 3600000, end: now, routineIds: ['own'], routineId: 'own', name: 'Core', entries: [] }
    setS({
      queue: queue({ rotationId: 'r1' }),
      rotation: { id: 'r1', sequence: ['d1', 'd2', 'd3'], label: 'US W1' },
      week: { [new Date().getDay()]: ['own'] }, workouts: [logged('d1'), core],
    })
    mount()
    expect(card()).toMatch(/^2 \/ 4 this week · 2 workouts total$/)
    expect(host.querySelectorAll('.queue .row .small')[1].textContent).toBe('1 of 3 done this round.')
  })

  it('without a queue the weekday dots are back', () => {
    setS({ queue: null })
    mount()
    expect(host.querySelector('.queue')).toBeNull()
    expect(host.querySelectorAll('.wday').length).toBe(7)
  })
})

describe('Home — a session pinned to a day', () => {
  it('a fulfilled pin — pinned to today, done on an earlier day — reads as no override on the today row', () => {
    setS({ dayPlan: { [todayISO()]: 'd1' }, workouts: [logged('d1')] })
    mount()
    expect(chipTexts()).toEqual(['US W1 D1Done', 'US W1 D2Up next', 'US W1 D3Later'])
    expect(status()).toBe('Next: US W1 D2, today')
    expect(todayTitle()).toBe('US W1 D2')
  })

  it('a session pinned ahead wears its day, is not lit, and the light moves to the next floating one', () => {
    const on = daysFromToday(2)
    setS({ dayPlan: { [on]: 'd1' } })
    mount()
    expect(chipTexts()).toEqual(['US W1 D1' + fmtDate(on, true), 'US W1 D2Up next', 'US W1 D3Later'])
    expect(chips()[0].className).toBe('chip')
    // the date keeps .chip's capitals ("Seg." in Portuguese); only the state words opt out
    expect(chips()[0].querySelector('.qstate')).toBeNull()
    expect(chips()[1].querySelector('.qstate').textContent).toBe('Up next')
    expect(chips()[0].disabled).toBe(false)
    expect(chips()[1].className).toBe('chip on')
    expect(status()).toBe('Next: US W1 D2, today')
    expect(todayTitle()).toBe('US W1 D2')
  })

  it('a session pinned to today is the day\'s session, ahead of the floating order', () => {
    setS({ dayPlan: { [todayISO()]: 'd3' } })
    mount()
    expect(chipTexts()).toEqual(['US W1 D1Later', 'US W1 D2Later', 'US W1 D3Up next'])
    expect(chips()[2].className).toBe('chip on')
    expect(status()).toBe('Next: US W1 D3, today')
    // Home reads any per-date override on today as a reschedule — a pin is one.
    expect(todayTitle()).toBe('US W1 D3 · rescheduled')
  })

  it('every session pinned ahead: no chip is lit, the line names the soonest with its day, today rests', () => {
    const d1 = daysFromToday(1), d2 = daysFromToday(3), d3 = daysFromToday(2)
    setS({ dayPlan: { [d1]: 'd1', [d2]: 'd2', [d3]: 'd3' } })
    mount()
    expect(chipTexts()).toEqual(['US W1 D1' + fmtDate(d1, true), 'US W1 D2' + fmtDate(d2, true), 'US W1 D3' + fmtDate(d3, true)])
    expect(chips().some(c => c.className.includes('on'))).toBe(false)
    expect(chips().every(c => !c.disabled)).toBe(true)
    expect(status()).toBe('Next: US W1 D1 · ' + fmtDate(d1, true))
    expect(todayTitle()).toBe('Rest day')
    // Soonest by date, not first in slot order.
    act(() => setS({ dayPlan: { [daysFromToday(3)]: 'd1', [daysFromToday(1)]: 'd2', [daysFromToday(2)]: 'd3' } }))
    expect(status()).toBe('Next: US W1 D2 · ' + fmtDate(daysFromToday(1), true))
  })

  it('tapping a pinned chip starts that routine alone, today', () => {
    setS({ dayPlan: { [daysFromToday(2)]: 'd1' } })
    mount()
    act(() => { chips()[0].click() })
    expect(startFlow).toHaveBeenCalledTimes(1)
    expect(startFlow).toHaveBeenCalledWith(['d1'])
  })
})

// Android QA (1.3.10 rc): the today row reported the last finished session ("Full Body A, Done")
// while the progress row and Start already named the next one for today.
describe('Home — the today row follows today\'s plan, not just the last session', () => {
  const today = todayISO()
  const at = (id, start, name) => ({ id: 'w-' + id + start, d: today, start, end: start + 1000, routineIds: id ? [id] : [], routineId: id, name: name || routines.find(r => r.id === id).name, entries: [] })
  const tag = () => host.querySelector('.today-row .tag')?.textContent

  it('a queue session done today: the row offers the next one, like the progress row', () => {
    setS({ workouts: [at('d1', Date.now() - 3600000)] })
    mount()
    expect(status()).toBe('Next: US W1 D2, today')
    expect(todayTitle()).toBe('US W1 D2')
    expect(tag()).toBe('Start')
  })

  it('a freestyle session on a planned day leaves the plan offered', () => {
    const wd = new Date(today + 'T12:00:00').getDay()
    setS({ queue: null, week: { [wd]: ['own'] }, workouts: [at(null, Date.now() - 3600000, 'Freestyle')] })
    mount()
    expect(todayTitle()).toBe('Core')
    expect(tag()).toBe('Start')
  })

  it('the planned routine done today still reads as done', () => {
    const wd = new Date(today + 'T12:00:00').getDay()
    setS({ queue: null, week: { [wd]: ['own'] }, workouts: [at('own', Date.now() - 3600000)] })
    mount()
    expect(todayTitle()).toBe('Core (done)')
    expect(tag()).toBe('Done')
  })

  it('Start new pass after a session today: the pass runs today, from its first session', () => {
    const now = Date.now()
    setS({
      rotation: { id: 'rot', sequence: ['d1', 'd2', 'd3'], label: 'Rotation' },
      queue: { ids: ['d1', 'd2', 'd3'], since: now - 1000, startsOn: today, label: 'Rotation', rotationId: 'rot', strict: true },
      workouts: [at('d1', now - 3600000)],
    })
    mount()
    expect(chipTexts()).toEqual(['US W1 D1Up next', 'US W1 D2Later', 'US W1 D3Later'])
    expect(status()).toBe('Next: US W1 D1, today')
    expect(todayTitle()).toBe('US W1 D1')
    expect(tag()).toBe('Start')
  })
})

describe('Home: your own loop', () => {
  // QA round 2 (2026-10-06): the loop's name was saved as text in the language it was made in, so
  // a loop made in English still read "Rotation" after switching to Arabic.
  it('is called Rotation in the language on screen, whatever an older save kept as its name', async () => {
    const rot = { id: 'rot', sequence: ['d1', 'd2'], label: 'Rotation' }
    try {
      await setLang('ar')
      setS({ rotation: rot, scheduleMode: 'rotation', queue: queue({ ids: ['d1', 'd2'], label: 'Rotation', rotationId: 'rot' }) })
      mount()
      expect(host.querySelector('.queue .row .small').textContent).toBe('التناوب')
      setS({ rotation: { ...rot, label: '' }, scheduleMode: 'rotation', queue: queue({ ids: ['d1', 'd2'], label: '', rotationId: 'rot' }) })
      mount()
      expect(host.querySelector('.queue .row .small').textContent).toBe('التناوب')
    } finally { await act(() => setLang('en')) }
    // A coach's week keeps the name its planner gave it.
    setS()
    mount()
    expect(host.querySelector('.queue .row .small').textContent).toBe('US W1')
  })
})
