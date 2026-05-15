'use client'

import { useRef } from 'react'
import { useAlbumStore } from '@/stores/album-store'
import { useAuthStore } from '@/components/write/hooks/use-auth'
import { readFileAsText } from '@/lib/file-utils'
import { toast } from 'sonner'

interface Props {
  event: string
}

export default function PhotoWallToolbar({ event }: Props) {
  const {
    isEditMode,
    isSaving,
    toggleEditMode,
    saveAlbums,
    openAdmin,
  } = useAlbumStore()

  const { isAuth, setPrivateKey } = useAuthStore()
  const keyInputRef = useRef<HTMLInputElement>(null)

  const onChoosePrivateKey = async (file: File) => {
    const pem = await readFileAsText(file)
    setPrivateKey(pem)
    toast.success('密钥导入成功')
  }

  const handleSave = async () => {
    if (!isAuth) {
      toast.error('请先导入密钥后再保存')
      keyInputRef.current?.click()
      return
    }
    await saveAlbums()
  }

  if (!isEditMode) {
    return (
      <button
        onClick={toggleEditMode}
        className="btn btn-sm btn-primary gap-2 rounded-xl font-semibold shadow-lg shadow-primary/20 shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
        编辑照片墙
      </button>
    )
  }

  return (
    <>
      {/* Hidden .pem file input */}
      <input
        ref={keyInputRef}
        type="file"
        accept=".pem"
        className="hidden"
        onChange={async e => {
          const f = e.target.files?.[0]
          if (f) await onChoosePrivateKey(f)
          if (e.currentTarget) e.currentTarget.value = ''
        }}
      />

      <div className="flex gap-3 shrink-0">
        <button
          onClick={toggleEditMode}
          className="btn btn-sm btn-ghost rounded-xl border bg-base-100/60 font-semibold"
        >
          取消
        </button>
        <button
          onClick={() => keyInputRef.current?.click()}
          disabled={isAuth}
          className={`btn btn-sm rounded-xl font-semibold ${
            isAuth ? 'btn-ghost text-success' : 'btn-outline'
          }`}
        >
          {isAuth ? '已导入' : '导入密钥'}
        </button>
        {event && (
          <button
            onClick={() => openAdmin(event)}
            className="btn btn-sm btn-outline gap-1 rounded-xl font-semibold"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            管理
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn btn-sm btn-primary px-6 shadow-lg shadow-primary/20 font-semibold"
        >
          {isSaving ? '提交中...' : '保存'}
        </button>
      </div>
    </>
  )
}
