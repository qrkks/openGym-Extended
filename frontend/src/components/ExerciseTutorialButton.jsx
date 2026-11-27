import { nameIn } from '../lib/a11y-name.js'
import { exerciseNameFor, t } from '../lib/i18n.js'
import { youtubeSearchUrl } from '../lib/youtube.js'
import { exerciseTutorialSheet } from '../sheets.jsx'
import { Button } from './ui.jsx'

export default function ExerciseTutorialButton({ ex }) {
  if (!youtubeSearchUrl(ex)) return null
  const label = t('Video tutorials')
  return <Button type="button" size="xs" variant="ghost" className="exercise-tutorial-button" icon="play"
    aria-label={nameIn(exerciseNameFor(ex), label)} aria-haspopup="dialog"
    onClick={() => exerciseTutorialSheet(ex)}>{label}</Button>
}
