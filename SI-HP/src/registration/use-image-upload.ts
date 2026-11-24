import { ref, type ComputedRef, type Ref } from 'vue'
import type { Draft, Me, PortalRequest, Message } from './types'

type ImageLimit = Me['limits'][string]
type CropUpload = { file: File; key: string; draft: Draft; limit: ImageLimit }
type UploadContext = {
  current: ComputedRef<Draft | undefined>
  admin: Ref<boolean>
  busy: Ref<boolean>
  limits: Ref<Me['limits']>
  api: PortalRequest
  message: Message
  closeDraftMenu: () => void
}

async function imageHash(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(Error('画像を読み込めません。'))
    reader.readAsDataURL(file)
  })
}

async function validateImage(file: File, limit: ImageLimit) {
  if (file.type !== 'image/png' || file.size < 1 || file.size > limit.bytes) {
    throw Error('PNG画像の種類・容量を確認してください。')
  }
  const bitmap = await createImageBitmap(file)
  const valid = bitmap.width <= limit.width && bitmap.height <= limit.height
  bitmap.close()
  if (!valid) throw Error('画像の寸法が上限を超えています。')
}

export function useImageUpload({ current, admin, busy, limits, api, message, closeDraftMenu }: UploadContext) {
  const cropUpload = ref<CropUpload>()
  // The same draft/image keeps its upload ID when a network failure is retried.
  const uploadKeys = new WeakMap<object, Record<string, { id: string; hash: string }>>()

  function cancelCrop() {
    cropUpload.value = undefined
    busy.value = false
  }

  async function upload(key: string, event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    const draft = current.value
    input.value = ''
    if (!file || !draft || busy.value) return
    const limit = limits.value[key]
    if (!limit || file.type !== 'image/png' || file.size < 1) {
      message('PNG画像を選択してください。', true)
      return
    }
    busy.value = true
    closeDraftMenu()
    cropUpload.value = { file, key, draft, limit }
  }

  async function uploadCropped(file: File) {
    const target = cropUpload.value
    if (!target) return
    const { key, draft, limit } = target
    cropUpload.value = undefined
    try {
      await validateImage(file, limit)
      message('画像を保存しています…')
      const hash = await imageHash(file)
      const pending = uploadKeys.get(draft) || {}
      uploadKeys.set(draft, pending)
      if (pending[key]?.hash !== hash) pending[key] = { id: crypto.randomUUID(), hash }
      const { ticket } = await api('/api/upload-ticket', {
        mode: admin.value ? 'admin' : 'user', field: key,
        bytes: file.size, sha256: hash, uploadId: pending[key]!.id,
      })
      const saved = await api('/api/upload', { uploadTicket: ticket, dataBase64: await readBase64(file) })
      draft.band[key] = saved.url
      delete pending[key]
      message('画像のURLを反映しました。バンド情報も保存してください。')
    } catch (cause) {
      message((cause as Error).message, true)
    } finally {
      busy.value = false
    }
  }

  return { cropUpload, cancelCrop, upload, uploadCropped }
}
