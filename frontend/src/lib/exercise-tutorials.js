export function chineseTutorialQuery(ex, names) {
  const name = String(names?.[ex.id] || ex.n).replace(/\s+/g, ' ').trim().slice(0, 100)
  return name + ' 动作教学'
}

export function tutorialWebUrl(provider, query) {
  const keyword = encodeURIComponent(query)
  if (provider === 'bilibili') return 'https://search.bilibili.com/all?keyword=' + keyword
  if (provider === 'douyin') return 'https://www.douyin.com/search/' + keyword
  return null
}

export async function openAndroidTutorialSearch(provider, query) {
  try {
    const { registerPlugin } = await import('@capacitor/core')
    const result = await registerPlugin('ExerciseTutorialSearch').open({ provider, query })
    return result?.opened === true
  } catch {
    return false
  }
}
