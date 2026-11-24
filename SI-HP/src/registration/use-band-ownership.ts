import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { Draft, PortalUser, PortalRequest, Message } from './types'

type OwnershipContext = {
  current: ComputedRef<Draft | undefined>
  admin: Ref<boolean>
  busy: Ref<boolean>
  dirty: Ref<boolean>
  local: boolean
  api: PortalRequest
  message: Message
}
type TransferRequest = { ownerId: string; version: number; requestId: string }

export function useBandOwnership({ current, admin, busy, dirty, local, api, message }: OwnershipContext) {
  const ownerInput = ref('')
  const ownerSearch = ref('')
  const registeredUsers = ref<PortalUser[]>([])
  const ownershipRequests = new WeakMap<object, TransferRequest>()
  const validOwner = computed(() => ownerInput.value === 'admin' || /^\d{10,25}$/.test(ownerInput.value.trim()))
  const matchingUsers = computed(() => {
    const query = ownerSearch.value.trim().toLocaleLowerCase()
    return registeredUsers.value
      .filter(user => !query || [user.displayName, user.username, user.id].some(value => value.toLocaleLowerCase().includes(query)))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'))
  })

  function ownerLabel(id: string) {
    if (id === 'admin') return '運営'
    const user = registeredUsers.value.find(user => user.id === id)
    return user ? `${user.displayName} (@${user.username}) · ${id}` : id
  }

  async function transferOwnership() {
    const draft = current.value
    const ownerId = ownerInput.value.trim()
    if (!admin.value || busy.value || !draft?.id || !validOwner.value) return
    if (dirty.value) {
      message('未保存の入力があります。先に保存してから所有者を移譲してください。', true)
      return
    }
    const oldOwner = (draft.ownerUserIds || []).map(ownerLabel).join('、')
      || (draft.ownershipType === 'admin' || draft.registrationSource === 'admin' ? '運営' : '未設定')
    if (!confirm(`「${draft.band['活動名']}」の所有者を移譲しますか？\n現在：${oldOwner}\n移譲先Discord ID：${ownerLabel(ownerId)}\n現在の所有者を置き換え、移譲先が個人用画面から編集できるようになります。`)) return

    const version = draft.ownershipVersion || 0
    let pending = ownershipRequests.get(draft)
    if (!pending || pending.ownerId !== ownerId || pending.version !== version) {
      pending = { ownerId, version, requestId: crypto.randomUUID() }
      ownershipRequests.set(draft, pending)
    }
    busy.value = true
    message('所有者を移譲しています…')
    try {
      const result = await api('/api/assign-owner', {
        mode: 'admin', registrationId: draft.id, revision: draft.revision,
        ownerId, ownershipVersion: version, requestId: pending.requestId,
      })
      draft.ownerUserIds = result.ownerUserIds
      draft.ownershipVersion = result.ownershipVersion
      draft.ownershipAudit = result.ownershipAudit
      draft.registrationSource = result.registrationSource
      draft.ownershipType = result.ownershipType
      ownershipRequests.delete(draft)
      ownerInput.value = ''
      message(local
        ? 'ブラウザ内のテストデータの所有者を変更しました。'
        : '所有者を移譲しました。移譲先の方は個人用画面を再読み込みしてください。')
    } catch (cause) {
      message((cause as Error).message, true)
    } finally {
      busy.value = false
    }
  }

  return { ownerInput, ownerSearch, registeredUsers, matchingUsers, validOwner, ownerLabel, transferOwnership }
}
