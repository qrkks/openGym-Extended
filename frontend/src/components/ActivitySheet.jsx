import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum, todayISO, uid } from '../lib/format.js'
import { NOTE_MAX } from '../lib/history.js'
import { tappable, useSheetKeyboard } from '../lib/use-sheet-keyboard.js'
import { SPORTS, SPORT_LABEL, SPORT_ICON, SPORT_PRESETS, ACTIVITY_MIN_MAX, readActivity, withActivity, activityName } from '../lib/activities.js'
import { sessionClock, sessionInputStart, sessionInputTime } from '../lib/session-time.js'
import SessionWhenFields from './SessionWhenFields.jsx'
import Icon from './Icon.jsx'
import { Button, Stepper } from './ui.jsx'

// Activities (lib/activities.js): a run, a ride, a padel match. Most arrive by themselves from
// Apple Health or Health Connect, or from an import; this sheet logs one by hand (web, no watch)
// and opens an existing one to fix or remove. Opened from History and a day in the calendar.

const SOURCE_LINE = {
  hc: 'From Health Connect',
  ah: 'From Apple Health',
  import: 'From an import',
  or: 'From openRunning',
}

// Distances in the profile's unit: km, or miles next to lb.
const MI = 1.609344
export const distText = (S, km) => (S?.unit === 'lb' ? t('{0} mi', fmtNum(Math.round(km / MI * 10) / 10)) : t('{0} km', fmtNum(Math.round(km * 10) / 10)))

// A weekly plan and a one-off on the same day already share one slot in the calendar.
// Saving that slot from either device should likewise address the same activity.
const plannedRecordId = (day, sport) => `sport-plan:${day}:${sport}`

function ActivityLog({ id = null, day = null, initialSport = null, planned = false, close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const existingId = id || (planned ? plannedRecordId(day, initialSport) : null)
  const had = existingId ? readActivity(S.activities?.[existingId]) : null
  const [manualId] = useState(() => 'm' + uid())
  const [sport, setSport] = useState(had?.sport || initialSport || 'run')
  const [min, setMin] = useState(had?.min || SPORT_PRESETS[1])
  const [d, setD] = useState(had?.d || day || todayISO())
  const [time, setTime] = useState(() => sessionInputTime(had?.at))
  const [note, setNote] = useState(had?.note || '')
  const noteRef = useRef(null)
  const onNoteFocus = useSheetKeyboard(noteRef)
  const save = () => {
    if (!(min >= 1) || d > todayISO()) return
    const isPlanned = planned || (had && existingId === plannedRecordId(had.d, had.sport))
    const differentSlot = isPlanned && existingId !== plannedRecordId(d, sport)
    const recordId = differentSlot ? manualId : existingId || manualId
    const activity = { ...had, d, sport, min, at: sessionInputStart(d, time, had), note: note.trim().slice(0, NOTE_MAX), src: had?.src || 'manual' }
    update(s => {
      // An edited completion can move off its slot, leaving the original plan available again.
      if (differentSlot && had) s.activities = withActivity(s.activities, existingId, null)
      s.activities = withActivity(s.activities, recordId, activity)
    })
    close()
    toast(t('Saved'))
  }
  const remove = () => {
    update(s => { s.activities = withActivity(s.activities, existingId, null) })
    close()
    toast(t('Activity removed'))
  }
  return <>
    <h3>{had ? t('Edit activity') : t('Log an activity')}</h3>
    {had && SOURCE_LINE[had.src] && <div className="muted small" style={{ marginBottom: 12 }}>{t(SOURCE_LINE[had.src])}</div>}
    <div className="chips rec-kinds" role="radiogroup" aria-label={t('Sport')} style={{ margin: '0 0 12px', flexWrap: 'wrap' }}>
      {SPORTS.map(k => <button key={k} type="button" role="radio" aria-checked={sport === k}
        className={'chip nocap ichip' + (sport === k ? ' on' : '')} onClick={() => setSport(k)}>
        <Icon name={SPORT_ICON[k]} />{t(SPORT_LABEL[k])}</button>)}
    </div>
    <div className="small muted" style={{ marginBottom: 6 }}>{t('How long')}</div>
    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      {SPORT_PRESETS.map(m => <button key={m} type="button" className={'chip nocap' + (min === m ? ' on' : '')}
        aria-pressed={min === m} onClick={() => setMin(m)}>{t('{0} min', m)}</button>)}
      <Stepper value={min} min={1} max={ACTIVITY_MIN_MAX} step={5} decimal={false} onChange={setMin} unit={t('min')} ariaLabel={t('Minutes')} />
    </div>
    <SessionWhenFields day={d} onDay={setD} time={time} onTime={setTime} minutes={min} previous={had} />
    <textarea ref={noteRef} className="input" rows={2} maxLength={NOTE_MAX} value={note}
      placeholder={t('How was it? (optional)')} onFocus={onNoteFocus} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 16 }} />
    <Button variant="primary" icon="check" onClick={save} disabled={!(min >= 1)}>{t('Save')}</Button>
    {had && <><div style={{ height: 8 }} /><Button variant="ghost" icon="trash" onClick={remove}>{t('Remove')}</Button></>}
  </>
}

/** Log a new activity, complete a scheduled sport, or open an existing record. */
export const activitySheet = ({ id = null, day = null, sport = null, planned = false } = {}) =>
  useUI.getState().openSheet(close => <ActivityLog id={id} day={day} initialSport={sport} planned={planned} close={close} />)

/** One activity as a list row, the way History lists a workout. */
export function ActivityRow({ a, showDate = true }) {
  const S = useStore(s => s.S)
  return <div className="item act-row" data-activity={a.id} {...tappable(() => activitySheet({ id: a.id }))}>
    <span className="lrow-i act-i" aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 8, fontSize: 19 }}><Icon name={SPORT_ICON[a.sport] || 'flag'} /></span>
    <div className="grow"><div className="tt">{activityName(a, t)}</div>
      <div className="ss">{[showDate ? fmtDate(a.d, true) : null, sessionClock(a.at), t('{0} min', a.min), a.km ? distText(S, a.km) : null, a.note].filter(Boolean).join(' · ')}</div></div>
    <Icon name="chevronRight" className="chev" />
  </div>
}
