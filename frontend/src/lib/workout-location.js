import { workoutDay } from './history.js'

export const WORKOUT_LOCATION_LABELS = {
  gym: 'Gym workout',
  home: 'Home workout',
  unspecified: 'Location not set',
}

export const isKnownWorkoutLocation = value => value === 'gym' || value === 'home'
export const normalizeWorkoutLocation = value => isKnownWorkoutLocation(value) ? value : 'unspecified'
export const workoutLocationOf = workout => normalizeWorkoutLocation(workout?.workoutLocation)

export function plannedWorkoutLocation(state, routineIds, scheduledWorkout) {
  if (scheduledWorkout) return isKnownWorkoutLocation(scheduledWorkout.workoutLocation) ? scheduledWorkout.workoutLocation : null
  const ids = new Set([].concat(routineIds ?? []))
  const locations = new Set((state.routines || [])
    .filter(routine => ids.has(routine.id))
    .map(routine => routine.workoutLocation)
    .filter(isKnownWorkoutLocation))
  if (locations.size > 1) return 'unspecified'
  return locations.values().next().value ?? null
}

export function setActiveWorkoutLocation(state, location, remember = true) {
  if (!state.active || (!isKnownWorkoutLocation(location) && location !== 'unspecified')) return
  state.active.workoutLocation = location
  if (remember) state.lastWorkoutLocation = isKnownWorkoutLocation(location) ? location : null
}

export function workoutLocationsByDay(workouts) {
  const byDay = new Map()
  for (const workout of workouts) {
    const day = workoutDay(workout)
    if (!day) continue
    if (!byDay.has(day)) byDay.set(day, new Set())
    byDay.get(day).add(workoutLocationOf(workout))
  }
  for (const [day, locations] of byDay) {
    const known = ['gym', 'home'].filter(location => locations.has(location))
    byDay.set(day, known.length ? known : ['unspecified'])
  }
  return byDay
}
