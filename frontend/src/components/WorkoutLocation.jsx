import { t } from '../lib/i18n.js'
import { WORKOUT_LOCATION_LABELS } from '../lib/workout-location.js'
import Icon from './Icon.jsx'
import { SelectRow, openSelectSheet } from './ui.jsx'

const options = () => [
  { value: 'gym', label: t('Gym') },
  { value: 'home', label: t('At home') },
  { value: 'unspecified', label: t('Location not set') },
]

export function WorkoutLocationField({ value, onChange }) {
  return <SelectRow icon="mapPin" title={t('Workout location')} value={value} options={options()} onChange={onChange} />
}

export function WorkoutLocationButton({ value, onChange }) {
  const title = t('Workout location')
  const choices = options()
  const label = choices.find(option => option.value === value).label
  return <button type="button" className="whdr-gym whdr-location" aria-haspopup="dialog"
    aria-label={[title, label].join(', ')} onClick={() => openSelectSheet({ title, value, options: choices, onChange })}>
    <Icon name="mapPin" />{value === 'unspecified' ? title : label}
  </button>
}

export function WorkoutLocationLegend({ showUnspecified }) {
  return Object.entries(WORKOUT_LOCATION_LABELS).map(([location, label]) =>
    (location !== 'unspecified' || showUnspecified) && <span key={location}>
      <span className={'workout-mark ' + location} aria-hidden="true" />{t(label)}
    </span>)
}
