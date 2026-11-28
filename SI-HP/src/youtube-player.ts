export type YouTubePlayer = {
  loadVideoById(id: string): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  destroy(): void
  getVideoUrl(): string
}
type PlayerEvent = { target: YouTubePlayer; data: number }
export type YouTubeAPI = { Player: new (element: HTMLElement, options: {
  width: string; height: string; host: string
  playerVars: Record<string, string | number>
  events: { onReady(event: PlayerEvent): void; onStateChange(event: PlayerEvent): void; onError(event: PlayerEvent): void; onAutoplayBlocked(): void }
}) => YouTubePlayer }

type YouTubeWindow = Window & { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: ()=>void }
let loading: Promise<YouTubeAPI> | undefined

export function loadYouTubeAPI(): Promise<YouTubeAPI> {
  const target = window as YouTubeWindow
  if (target.YT?.Player) return Promise.resolve(target.YT)
  if (loading) return loading
  loading = new Promise<YouTubeAPI>((resolve, reject) => {
    const previous = target.onYouTubeIframeAPIReady
    const script = document.createElement('script')
    let timer: ReturnType<typeof setTimeout>
    function finish(error?: Error) {
      clearTimeout(timer)
      target.onYouTubeIframeAPIReady = previous
      if (error) { script.remove(); loading = undefined; reject(error) }
      else if (target.YT?.Player) resolve(target.YT)
      else { loading = undefined; reject(Error('YouTube APIを読み込めませんでした。')) }
    }
    target.onYouTubeIframeAPIReady = () => { try { previous?.() } finally { finish() } }
    script.src = 'https://www.youtube.com/iframe_api'
    script.onerror = () => finish(Error('YouTubeへ接続できません。通信設定を確認してください。'))
    timer = setTimeout(() => finish(Error('YouTubeへの接続がタイムアウトしました。')), 20000)
    document.head.append(script)
  })
  return loading
}
