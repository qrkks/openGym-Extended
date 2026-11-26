import { fmtClock, fmtDate, isoOf, durPart } from './format.js'
import { workoutDuration } from './history.js'
import { readingAt, timeOf } from './weigh-ins.js'

export function sessionTimestamp(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  const at = Number(value)
  return at > 0 && Number.isFinite(new Date(at).getTime()) ? at : undefined
}

export function sessionInputTime(value) {
  const at = sessionTimestamp(value)
  return at === undefined ? '' : timeOf(at)
}

export function sessionInputStart(day, time, previous) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return undefined
  if (previous?.d === day && time === sessionInputTime(previous?.at)) return previous.at
  return sessionTimestamp(readingAt(day, time))
}

export function sessionClock(value) {
  const at = sessionTimestamp(value)
  return at === undefined ? null : fmtClock(at)
}

export function sessionEndClock(start, end) {
  const clock = sessionClock(end)
  if (!clock) return null
  const day = isoOf(new Date(end))
  return isoOf(new Date(start)) === day ? clock : fmtDate(day, true) + ' ' + clock
}

export function workoutTimeParts(workout, { range = false } = {}) {
  const start = sessionTimestamp(workout.start)
  const end = sessionTimestamp(workout.end)
  const startClock = sessionClock(start)
  const clock = range && startClock && end > start ? startClock + ' \u2013 ' + sessionEndClock(start, end) : startClock
  const duration = start !== undefined && end !== undefined ? workoutDuration(workout) : 0
  return [clock, ...durPart(duration)].filter(Boolean)
}
