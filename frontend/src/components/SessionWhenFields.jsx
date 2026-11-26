import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { sessionEndClock, sessionInputStart } from '../lib/session-time.js'
import DateField from './DateField.jsx'

export default function SessionWhenFields({ day, onDay, time, onTime, minutes, previous }) {
  const start = sessionInputStart(day, time, previous)
  const end = start && minutes >= 1 ? sessionEndClock(start, start + minutes * 60000) : null
  const timeLabel = t('Start time (optional)')
  return <>
    <div className="row bw-when">
      <label className="measure-date">
        <span>{t('Date')}</span>
        <DateField value={day} max={todayISO()} onChange={onDay} label={t('Date')} />
      </label>
      <label className="measure-date bw-time">
        <span>{timeLabel}</span>
        <input type="time" className="timef" value={time} aria-label={timeLabel}
          onChange={event => onTime(event.target.value)} />
      </label>
    </div>
    {end && <div className="small muted" style={{ marginBottom: 12 }}>{t('End time')} {'\u00b7'} {end}</div>}
  </>
}
