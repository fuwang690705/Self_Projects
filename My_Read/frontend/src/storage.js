const STORAGE_KEY = 'my-read-playback-state:v1'

export function loadPlaybackState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function savePlaybackState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    currentBookId: state.currentBookId || null,
    currentChapterId: state.currentChapterId || null,
    currentTime: Number.isFinite(state.currentTime) ? state.currentTime : 0,
    playbackRate: state.playbackRate || 1
  }))
}
