export type MusicBand = { id: string; name: string; youtubeVideoId?: string }
export type MusicItem = { id: string; bandId: string; name: string; videoId: string }
export type MusicState = { current: MusicItem | null; pending: MusicItem[]; randomEnabled: boolean; seen: string[]; failed: string[] }
export function musicState(): MusicState
export function musicCandidates(bands: MusicBand[]): MusicItem[]
export function createMusicQueue(state?: MusicState, random?: ()=>number): {
  add(band: MusicBand): 'noVideo' | 'duplicate' | 'added'
  addAll(bands: MusicBand[]): { added: number; skipped: number }
  play(band: MusicBand): MusicItem | null
  playQueued(id:string): MusicItem | null
  next(bands: MusicBand[]): MusicItem | null
  startRandom(bands: MusicBand[]): MusicItem | null
  fail(bands: MusicBand[]): MusicItem | null
  remove(videoId: string): void
  move(videoId: string, direction: number): void
  close(): void
}

export function clampMusicSize(width:number,videoHeight:number,viewportWidth:number,viewportHeight:number,overhead?:number): {width:number;videoHeight:number}

export function clampMusicPosition(right:number,bottom:number,width:number,height:number,viewportWidth:number,viewportHeight:number): {right:number;bottom:number}
