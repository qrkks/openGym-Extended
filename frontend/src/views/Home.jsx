import TrainerNotice from '../components/TrainerNotice.jsx'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutines, nextTrainingDay, lastBW } from '../lib/history.js'
import { streakInfo } from '../lib/streak.js'
import { StreakFlame, StreakMeta, StreakParty } from '../components/Streak.jsx'
import { StreakRuleWelcome } from '../components/StreakRule.jsx'
import { fmtNum, fmtDate, todayISO, weekStartOf, exCount, DAYN } from '../lib/format.js'
import { t, tn, dateLocale } from '../lib/i18n.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, starterPlanSheet, bwDeltaColor, weighInsSheet, startScheduledWorkout, plannedActivityOptionsSheet } from '../sheets.jsx'
import { startOrPreview, startPickerSheet } from '../components/StartSheets.jsx'
import { daySessionsStatus } from '../lib/day-sessions.js'
import { deriveSessionName } from '../lib/session-merge.js'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import QueueRow from '../components/QueueRow.jsx'
import HomeCalendar from '../components/HomeCalendar.jsx'
import MiniBodyMap from '../components/MiniBodyMap.jsx'
import { queueOf, queueView, weekTally, pinState } from '../lib/queue.js'
import { workoutsLeft } from '../lib/week-left.js'
import { WeeklySetsHomeLine } from '../components/WeeklySets.jsx'
import { RecapHomeCard } from '../components/Recap.jsx'
import { scheduleModeOf } from '../lib/rotation.js'
import { useConnectionTrouble } from '../components/SyncBanner.jsx'
import { Button, Row } from '../components/ui.jsx'
import { activitiesOf, activityName, activityTotals, SPORT_ICON, SPORT_LABEL } from '../lib/activities.js'
import { datedActivitiesOn, plannedSportsOn } from '../lib/dated-activity-plan.js'
import { recoveryOn, RECOVERY_ICON, RECOVERY_LABEL } from '../lib/recovery-sessions.js'
import { sportProgress } from '../lib/sport-statistics.js'
import { scheduledWorkoutOf, completedScheduledWorkout } from '../lib/scheduled-workouts.js'
import { workoutsOn } from '../lib/backfill.js'
import { sessionClock, workoutTimeParts } from '../lib/session-time.js'
import { dayNoteLine, dayNoteOf } from '../lib/day-notes.js'
import { WORKOUT_LOCATION_LABELS, workoutLocationOf } from '../lib/workout-location.js'
import { glyphOf } from '../lib/glyphs.js'
import { weighInAt } from '../lib/bodyweight.js'
import WeightRate from '../components/WeightRate.jsx'
import { programmeChip } from '../lib/programmes.js'
import { SeasonDeco } from '../components/Seasonal.jsx'
import { WrappedHomeCard } from '../components/WrappedEntry.jsx'
import { DeloadCard } from '../components/DeloadCard.jsx'
import RecoveryHint from '../components/RecoveryHint.jsx'
import { FastingLine } from '../components/SisterApps.jsx'
import { ChallengesCard } from '../components/Challenges.jsx'
import { isOn } from '../lib/modules.js'

function HomeWorkoutRow({ onOpen, action, tour, className = '', children }) {
  return <div className={'today-row tap-host' + (className ? ' ' + className : '')}>
    <button type="button" className="row tap-main home-workout-main" data-tour={tour}
      aria-haspopup="dialog" onClick={onOpen}>{children}</button>
    {action}
  </div>
}

// Home = what to do now + a quick glance. Deep charts & history live in Stats.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  // The banner switched off and the sync stuck: a dot on the gear (Settings → Show connection status).
  const trouble = useConnectionTrouble()

  const today = new Date()
  const todayKey = todayISO()
  const [pickedDay, setPickedDay] = useState(null)
  const selectedDay = pickedDay ?? todayKey
  const selectedIsToday = selectedDay === todayKey
  const dayLabel = selectedIsToday ? t('Today') : fmtDate(selectedDay, true, true)
  const openDayMenu = () => dayOverrideSheet(selectedDay)
  const selectDay = day => setPickedDay(day === todayKey ? null : day)
  const dayWorkouts = workoutsOn(S, selectedDay)
  const dayNote = dayNoteOf(S, selectedDay)
  const scheduled = scheduledWorkoutOf(S, selectedDay)
  const scheduledDone = completedScheduledWorkout(S, scheduled)
  const activities = useMemo(() => activitiesOf({ activities: S.activities }), [S.activities])
  const dayActivities = activities.filter(a => a.d === selectedDay)
  const pendingSports = plannedSportsOn(S, selectedDay).filter(sport => !dayActivities.some(a => a.sport === sport))
  const hasSport = pendingSports.length > 0 || dayActivities.length > 0
  const dayRecovery = useMemo(() => recoveryOn({ recoverySessions: S.recoverySessions }, selectedDay), [S.recoverySessions, selectedDay])
  const pendingRecovery = datedActivitiesOn(S, selectedDay, 'recovery').filter(kind => !dayRecovery.some(r => r.kind === kind))
  const hasRecovery = pendingRecovery.length > 0 || dayRecovery.length > 0
  // A weekday can hold several routines. `todayRoutines` is the whole day; `routine` is the
  // first, kept for the one-routine glyph. The derived session name joins them (§9).
  const todayRoutines = effectiveRoutines(S, todayKey)
  const routine = todayRoutines[0] || null
  const todayName = todayRoutines.map(r => r.name).join(' + ')
  // A fulfilled pin (a coach session pinned to today and since done) reads as no override.
  const todayOvr = S.dayPlan[todayKey] !== undefined && pinState(S, S.dayPlan[todayKey]) !== 'done'
  // An open editor on a saved workout (lib/session-edit.js) holds S.active too, but it is not a
  // session in progress: the row takes you back to it as an edit, the way the tab bar does.
  const editingSaved = !!S.active?.editingWorkoutId
  const bw = lastBW(S)
  const prevBW = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
  const delta = bw && prevBW ? bw.w - prevBW.w : null

  const ws = weekStartOf(S)
  const sport = useMemo(() => sportProgress(activities, todayKey, ws), [activities, todayKey, ws])
  const sportsByCount = useMemo(() => activityTotals(
    { activities: S.activities }, activities.at(-1)?.d ?? todayKey, todayKey,
  ).sports.sort((a, b) => b.n - a.n), [S.activities, activities, todayKey])
  // The last session logged for today, if any — what the row below reports instead of asking
  // you to start the one you already did. Last wins, so a second session names itself. Only once
  // today's plan is covered, though: a freestyle session on a planned day, or the rotation's
  // first session done when its next one is today's too, leaves the row offering what is still
  // to do, as Start and the progress row already do. A queue session is never "covered" by an
  // earlier workout: the queue only names one it does not count as done yet.
  const loggedToday = selectedIsToday ? dayWorkouts.filter(w => !scheduled || w.scheduledWorkoutId !== scheduled.id) : []
  const queueIds = queueOf(S)?.ids || []
  const coveredToday = id => !queueIds.includes(id) && loggedToday.some(w => (Array.isArray(w.routineIds) ? w.routineIds : [w.routineId]).includes(id))
  const doneToday = (todayRoutines.every(r => coveredToday(r.id)) && loggedToday.at(-1)) || null
  const queue = queueView(S, todayKey)
  const rotating = scheduleModeOf(S) === 'rotation'
  // A planner-written queue (no rotationId) still names its weekday when it hasn't started yet —
  // that copy predates rotation and stays as it is. Our own rotation has no weekday of its own
  // (lib/rotation.js): naming one here — including on the pass's own one-day empty gap (THE
  // ONE-DAY BOUNDARY, rotation.js) or before a first routine is even added — would be the
  // fixed-week model leaking into a schedule that was never weekday-based.
  const liveQ = queueOf(S)
  const plannerQueue = !!queue && !liveQ?.rotationId
  // Ownership, not mere presence of a rotationId: a stale id left over from a rebuilt rotation
  // would otherwise still read as "this app manages it" (lib/rotation.js).
  const managedQueue = !!liveQ && !!S.rotation && liveQ.rotationId === S.rotation.id
  // On a rest day, saying when you train next beats leaving the row as a full stop.
  const next = !S.active && !todayRoutines.length && !(rotating && !plannerQueue) ? nextTrainingDay(S, todayISO()) : null
  // The streak card's fraction: this calendar week's workouts over the weekdays with a plan, or,
  // in a coach week, the queue's sessions and your own days together (lib/queue.js weekTally).
  const tally = weekTally(S, todayISO())
  const { done: doneThisWeek, planned: plannedPerWeek } = tally
  const left = workoutsLeft(S, todayISO())
  // The streak with its best run and freezes (lib/streak.js), read back from the workouts.
  const streak = useMemo(() => streakInfo(S, todayKey), [S.workouts, S.weekStart, S.streakRule, S.recoverySessions, S.recoveryStreak, S.activities, S.activityStreak, todayKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // Settings → Modules (lib/modules.js): what a module switched off hides here.
  const on = id => isOn(S, id)
  const bwPoints = S.bodyweight.slice(-30).map(b => ({ t: weighInAt(b), y: b.w, d: b.d }))

  const startToday = () => startOrPreview(todayRoutines.map(r => r.id))
  // A chip on the coach week's progress row starts that one routine, in any order. A session
  // already in progress wins, as on the today row — starting another would overwrite it.
  const progChip = programmeChip(S)
  const onQueueStart = id => { if (S.active) nav('/workout'); else startOrPreview([id]) }
  // A weekday trained separately (#908): each of its sessions gets a row of its own below, with
  // its own Start and its own Done. Only while nothing runs; a running one is the row above.
  const apartSessions = selectedIsToday && !S.active ? daySessionsStatus(S, todayKey).filter(x => x.routines.length) : []
  const splitDay = apartSessions.length > 1
  const showRegularRow = S.active || routine || doneToday || !scheduled
  const datedSessions = !selectedIsToday && !dayWorkouts.length ? daySessionsStatus(S, selectedDay).filter(x => x.routines.length) : []
  const displayedWorkouts = new Set([scheduledDone])
  if (splitDay) apartSessions.forEach(session => displayedWorkouts.add(session.done))
  else if (selectedIsToday && !S.active) displayedWorkouts.add(doneToday)
  const otherWorkouts = dayWorkouts.filter(w => !displayedWorkouts.has(w))

  return <div className="narrow">
    <div className="hdr">
      <SeasonDeco spot="header-bats" />
      <div><h1>{user ? t('Hi {0}', user.name) : 'openGym'}</h1><div className="sub">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <button className="iconbtn" data-tour="settings-gear" onClick={() => nav('/settings')} aria-label={trouble ? t('Settings') + ', ' + t('Connection problem') : t('Settings')}><Icon name="gear" />{trouble && <span className="tab-dot" aria-hidden="true" />}</button>
    </div>
    <TrainerNotice />

    <div className="card">
      {/* A running programme (lib/programmes.js) wrote this week's plan: where it stands, one tap from its screen. */}
      {progChip && <button type="button" className="chip ichip prog-chip" onClick={() => nav('/plan/programmes')}><Icon name="calendar" /><span>{progChip}</span></button>}
      <HomeCalendar state={S} today={todayKey} selectedDay={selectedDay} activities={activities} onDay={selectDay} />
      <section id="home-day-list" data-selected-date={selectedDay}>
        <button type="button" className="home-day-heading row between" aria-haspopup="dialog"
          aria-label={[dayLabel, t('Day options')].join(', ')} onClick={openDayMenu}>
          <span aria-live="polite">{dayLabel}</span><Icon name="more" />
        </button>
        {selectedIsToday && (splitDay ? apartSessions.map((x, i) => {
          const name = deriveSessionName(x.routines.map(r => r.name))
          return <HomeWorkoutRow key={x.ids.join('+')} className="today-split" tour={i ? undefined : 'today'} onOpen={openDayMenu}
            action={x.done ? <span className="tag home-day-done">{t('Done')}</span>
              : <span className="row home-day-start"><MiniBodyMap routines={x.routines} body={S.body} />
                <button type="button" className="tag acc home-day-action" aria-label={t('Start {0}', name)} onClick={() => startOrPreview(x.ids)}>{t('Start')}</button>
              </span>}>
            <span className="lrow-i" style={{ background: x.done ? 'var(--surface-3)' : 'var(--acc)' }}>
              <Icon name={x.done ? 'checkCircle' : glyphOf(x.routines[0].emoji)} style={x.done ? { color: 'var(--green)' } : undefined} />
            </span>
            <span className="grow">
              <span className="lbl2">{t('{0} of {1}', String(i + 1), String(apartSessions.length))}</span>
              <span className="ttl">{x.done ? t('{0} (done)', name) : name}</span>
              {x.done && <span className="ss">{workoutTimeParts(x.done).join(' · ')}</span>}
            </span>
          </HomeWorkoutRow>
        }) : showRegularRow && <HomeWorkoutRow tour="today" onOpen={openDayMenu}
          action={S.active ? <button type="button" className="tag home-day-action home-day-resume" onClick={() => nav('/workout')}>{editingSaved ? t('Edit') : t('Resume')}</button>
            : doneToday ? <span className="tag home-day-done">{t('Done')}</span>
            : routine ? <span className="row home-day-start"><MiniBodyMap routines={todayRoutines} body={S.body} />
              <button type="button" className="tag acc home-day-action" onClick={startToday}>{t('Start')}</button>
            </span> : <Icon name="plus" className="chev" />}>
          <span className="lrow-i" style={{ background: S.active ? 'var(--orange)' : routine && !doneToday ? 'var(--acc)' : 'var(--surface-3)',
            ...(!S.active && !doneToday && !routine ? { color: 'var(--label-2)' } : {}) }}>
            <Icon name={S.active ? (editingSaved ? 'pencil' : 'play') : doneToday ? 'checkCircle' : routine ? glyphOf(routine.emoji) : 'moon'}
              style={doneToday && !S.active ? { color: 'var(--green)' } : undefined} />
          </span>
          <span className="grow">
            <span className="ttl">{S.active ? (editingSaved ? S.active.name : t('{0} (in progress)', S.active.name))
              : doneToday ? (doneToday.name ? t('{0} (done)', doneToday.name) : t('Workout done'))
              : routine ? todayName : t(hasSport || hasRecovery ? 'No strength training' : 'Rest day')}
              {todayOvr && routine && !doneToday ? ' · ' + t('rescheduled') : ''}</span>
            {!S.active && doneToday && <span className="ss">{workoutTimeParts(doneToday).join(' · ')}</span>}
            {next && !doneToday && <span className="ss">{t('Next session: {0}, {1}', t(DAYN[next.weekday]), next.routine.name)}</span>}
          </span>
        </HomeWorkoutRow>)}
        {(otherWorkouts.length > 0 || datedSessions.length > 0) && <div className="home-day-rows">
          {otherWorkouts.map(w => <Row key={w.id ?? w.start}
            icon="dumbbell" title={w.name || t('Workout done')} subtitle={[...workoutTimeParts(w), t(WORKOUT_LOCATION_LABELS[workoutLocationOf(w)])].join(' · ')}
            value={t('Done')} onClick={openDayMenu} />)}
          {datedSessions.map(session => <Row key={session.ids.join('+')} icon={glyphOf(session.routines[0].emoji)}
            title={deriveSessionName(session.routines.map(r => r.name))} value={t('Planned')} onClick={openDayMenu} />)}
        </div>}
        {scheduled && (!selectedIsToday || S.active?.scheduledWorkoutId !== scheduled.id) &&
          <div className="home-scheduled-workout">
            {selectedIsToday && !scheduledDone ? <HomeWorkoutRow className="home-one-off" onOpen={openDayMenu}
              action={<button type="button" className="tag acc home-day-action" onClick={() => {
                if (S.active) nav('/workout')
                else startScheduledWorkout(todayKey)
              }}>{t('Start')}</button>}>
              <span className="lrow-i"><Icon name="dumbbell" /></span>
              <span className="grow"><span className="ttl">{scheduled.name}</span><span className="ss">{exCount(scheduled.ex.length)}</span></span>
            </HomeWorkoutRow> : <Row icon={scheduledDone ? 'checkCircle' : 'dumbbell'} title={scheduled.name}
              subtitle={scheduledDone ? [...workoutTimeParts(scheduledDone), exCount(scheduled.ex.length)].join(' · ') : exCount(scheduled.ex.length)}
              value={t(scheduledDone ? 'Done' : 'Planned')} onClick={openDayMenu} />}
          </div>}
        {dayNote && <div className="home-day-rows"><Row icon="note" title={t('Day note')}
          subtitle={dayNoteLine(dayNote, t)} onClick={openDayMenu} /></div>}
        {hasSport && <div className="home-sport-rows">
          {pendingSports.map(sport => <Row key={sport} icon={SPORT_ICON[sport]} title={t(SPORT_LABEL[sport])}
            subtitle={t(selectedDay >= todayKey ? 'Planned sport' : 'Record completion')} accessory="chevron"
            onClick={selectedDay >= todayKey ? () => plannedActivityOptionsSheet(selectedDay, 'sport', sport) : openDayMenu} />)}
          {dayActivities.map(a => <Row key={a.id} icon={SPORT_ICON[a.sport]} title={activityName(a, t)}
            subtitle={[sessionClock(a.at), t('{0} min', a.min)].filter(Boolean).join(' · ')} value={t('Done')} onClick={openDayMenu} />)}
        </div>}
        {hasRecovery && <div className="home-recovery-rows">
          {pendingRecovery.map(kind => <Row key={kind} icon={RECOVERY_ICON[kind]} title={t(RECOVERY_LABEL[kind])}
            subtitle={t(selectedDay >= todayKey ? 'Planned recovery' : 'Record completion')} accessory="chevron"
            onClick={selectedDay >= todayKey ? () => plannedActivityOptionsSheet(selectedDay, 'recovery', kind) : openDayMenu} />)}
          {dayRecovery.map(r => <Row key={r.id} icon={RECOVERY_ICON[r.kind]} title={t(RECOVERY_LABEL[r.kind])}
            subtitle={[sessionClock(r.at), t('{0} min', r.min)].filter(Boolean).join(' · ')} value={t('Done')} onClick={openDayMenu} />)}
        </div>}
        {!selectedIsToday && !dayWorkouts.length && !datedSessions.length && !scheduled && !dayNote && !hasSport && !hasRecovery &&
          <div className="home-day-rows"><Row icon="moon" title={t('Rest day')} accessory="chevron" onClick={openDayMenu} /></div>}
      </section>
      {rotating && <div className="home-rotation">
        {queue ? <QueueRow S={S} today={todayKey} onStart={onQueueStart} managed={managedQueue} /> : <div className="empty">
          {t('No rotation yet. Add routines to it in Plan.')}
          <div style={{ marginTop: 10 }}><Button size="sm" variant="tinted" onClick={() => nav('/plan')}>{t('Set up in Plan')}</Button></div>
        </div>}
      </div>}
      {/* The week's plan as a countdown (#753, lib/week-left.js): "2 of 4 left this week". */}
      {left && <div className={'small dim wkleft' + (left.left > 0 ? '' : ' done')}>
        {left.left > 0 ? tn('{0} of {1} left this week', '{0} of {1} left this week', left.left, left.of) : t('All done this week. Nice.')}
      </div>}
      {/* openNutrition's fasting window (lib/sister-nutrition.js), when this device is linked. */}
      <FastingLine />
      {/* The start picker offers freestyle and other routines alongside today's quick Start. */}
      {selectedIsToday && !S.active && <div className="home-quick-actions">
        <Button size="sm" variant="ghost" className="dim" icon="swap" onClick={startPickerSheet}>
          {t('Choose a different workout')}
        </Button>
      </div>}
      <SeasonDeco spot="home-hero" />
    </div>

    {/* Monday: Your week; the 1st: Your month (lib/recap.js). Off in Settings → Look & Home. */}
    <RecapHomeCard S={S} />

    {/* Christmas (lib/seasonal.js): the advent calendar's card, 1 to 24 December, from the theme's chunk. */}
    <SeasonDeco spot="home-advent" />

    {/* December and January: the year in openGym is ready (lib/wrapped.js homeCardYear). */}
    {on('motivation') && <WrappedHomeCard S={S} />}

    {/* What has rested and what is still recovering, kindly (lib/recovery-hint.js). */}
    {on('health') && <RecoveryHint S={S} />}

    {/* A deload week now or next, or a lighter week suggested (lib/deload-cycle.js). */}
    <DeloadCard S={S} />

    {/* This month's three challenges and how far you are (lib/challenges.js). */}
    <ChallengesCard S={S} />

    {/* Jump to the gym check-in cards (QR membership codes). Shown here as a quick tap on
        arrival at the gym; folds away per user via the "Gym check-in" switch in Settings. */}
    {on('checkin') && (
      <div className="card tap-host checkin-card">
        <CardHead icon="qr" tint="var(--blue)" eyebrow={t('At the gym')} title={t('Check in')} open={{ onClick: () => nav('/checkin') }}
          action={<Icon name="chevronRight" className="chev" />} />
      </div>
    )}

    {!S.routines.length && !S.active && (
      <div className="card">
        <CardHead icon="calendar" title={t('Welcome!')} sub={t('Set up your weekly routine to get going, or grab a ready-made starter plan.')} />
        <Button variant="primary" icon="clipboard" onClick={starterPlanSheet}>{t('Load starter plan')}</Button>
        <div style={{ height: 8 }} /><Button onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
      </div>
    )}

    {/* A new profile picks how forgiving its streak is, once, right under the plan it starts with
        (components/StreakRule.jsx). */}
    {on('motivation') && S.streakRuleAsk === true && !S.streakRule && <StreakRuleWelcome />}

    {on('body') && S.showWeightCard !== false && <div className="card">
      {/* one trailing action, Log; the goal lives with the goal line and the weigh-ins below (P2) */}
      <CardHead icon="scale" tint="var(--teal)" title={t('Body weight')} className="bw-head"
        action={<Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>} />
      {bw ? <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <div className="big">{fmtNum(bw.w)} <span className="muted" style={{ fontSize: 'var(--fs-callout)' }}>{S.unit}</span></div>
          {/* only when it actually moved — an unchanged weight used to read as "− 0" */}
          {!!delta && (
            <span className="small row" style={{ gap: 2, fontWeight: 500, color: bwDeltaColor(delta, bw.w) }}>
              <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 'var(--fs-caption)' }} />
              {fmtNum(Math.abs(delta))}
            </span>
          )}
          <span className="dim small" style={{ marginInlineStart: 'auto' }}>{fmtDate(bw.d, true)}</span>
        </div>
        {S.targetW && (
          <div className="small row" style={{ color: 'var(--gold-ink)', marginTop: 4, gap: 5 }}>
            <Icon name="target" style={{ fontSize: 'var(--fs-footnote)' }} />
            <span>{t('Goal')} {fmtNum(S.targetW)} {S.unit} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached!') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtNum(Math.abs(S.targetW - bw.w)) + ' ' + S.unit)}</span>
          </div>
        )}
        <div className="chart" style={{ marginTop: 8 }}><LineChart points={bwPoints} h={130} unit={S.unit} goal={S.targetW} /></div>
        {/* the weekly rate and, with one set, how it sits in its corridor (#759) */}
        <WeightRate S={S} />
        {/* every weigh-in, week by week with its average (Discord 'Weight') */}
        <div className="row between" style={{ marginTop: 4 }}>
          <Button size="sm" variant="ghost" icon="target" className="bw-goal" style={S.targetW ? { color: 'var(--gold-ink)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
          <Button size="sm" variant="ghost" trailingIcon="chevronRight" data-tour="home-weighins" onClick={weighInsSheet}>{t('All weigh-ins')}</Button>
        </div>
      </> : <>
        <div className="muted small">{S.weighIn === false
          ? t('No weigh-ins yet. Log your weight to start the curve.')
          : t("No weigh-ins yet. Log your weight to start the curve (we also ask before every workout).")}</div>
        <Button size="sm" variant="ghost" icon="target" className="bw-goal" style={{ marginTop: 6, ...(S.targetW ? { color: 'var(--gold-ink)' } : {}) }} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
      </>}
    </div>}

    {/* The streak opens its calendar from its text (CardHead open); the weekly-sets line and the
        party banner are buttons of their own beside it, not inside a card that is a button. */}
    {on('motivation') ? <div className="card tap-host streak-card">
      <SeasonDeco spot="home-streak" />
      {/* in season, a Santa hat on the flame (components/Seasonal.jsx) */}
      <CardHead className="streak-head" glyph={<span className="streak-flame-wrap"><StreakFlame lit={streak.current > 0} /><SeasonDeco spot="streak-flame" /></span>}
        title={t('{0} week streak', streak.current)} open={{ onClick: () => calendarSheet(), haspopup: 'dialog' }}
        sub={<>{doneThisWeek}{plannedPerWeek ? ' / ' + plannedPerWeek : ''} {t('this week')} · {tn('{0} workout total', '{0} workouts total', S.workouts.length)}</>}
        action={<Icon name="calendar" className="chev" style={{ fontSize: 'var(--fs-title3)' }} />} />
      {(streak.best > 0 || streak.freezes > 0) && <div className="muted small card-head-indent streak-meta-line"><StreakMeta info={streak} /></div>}
      <StreakParty S={S} info={streak} tally={tally} />
      {/* Settings → Look & Home → Weekly sets on Home (lib/muscle-targets.js): the muscle with
          the most room this week, one tap from the Stats card. */}
      {/* Straight to Stats → Lifts, where the card is, not to the top of Overview (P5 deep link). */}
      {S.homeMuscleSets === true && <WeeklySetsHomeLine S={S} onOpen={() => nav('/stats?section=lifts')} />}
    </div>
      // Motivation off: no streak card, but the weekly sets line it carried keeps a card of its own.
      : S.homeMuscleSets === true && <div className="card wsets-solo"><WeeklySetsHomeLine S={S} onOpen={() => nav('/stats?section=lifts')} /></div>}
    <div className="card tap-host">
      <CardHead icon="figureRun" title={t('Sport')}
        sub={<>{tn('{0} sport session this week', '{0} sport sessions this week', sport.weekly)}{' · '}{tn('{0} sport session total', '{0} sport sessions total', sport.total)}</>}
        open={{ onClick: () => nav('/stats?focus=sport-statistics') }}
        action={<Icon name="chevronRight" className="chev" />} />
      {sportsByCount.length > 0 && <dl className="home-sport-counts card-head-indent">
        {sportsByCount.map(({ sport, n }) => <div key={sport}>
          <dt>{t(SPORT_LABEL[sport])}</dt><dd>{fmtNum(n)}</dd>
        </div>)}
      </dl>}
      {on('motivation') && <div className="small muted card-head-indent">
        {tn('Sport streak: {0} week', 'Sport streak: {0} weeks', sport.current)}
      </div>}
    </div>
  </div>
}
