'use client'

import { useState } from 'react'
import { Trash2, Camera, ImageOff } from 'lucide-react'
import { useAlbumStore } from '@/stores/album-store'
import type { AlbumItem, Photo } from '@/data/albums'

interface Props {
  initialAlbum: AlbumItem | null
  event?: string
}

const VARIANT_LABELS: Record<string, string> = { '1x1': '1:1', '4x3': '4:3', '4x5': '4:5', '9x16': '9:16' }

const VARIANT_RATIO: Record<string, string> = {
  '1x1': '1 / 1',
  '4x3': '4 / 3',
  '4x5': '4 / 5',
  '9x16': '9 / 16',
}

/** Track which images failed to load so we can show a fallback */
function PhotoImage({ photo, idx, albumEvent }: { photo: Photo; idx: number; albumEvent: string }) {
  const [error, setError] = useState(false)
  const { updatePhoto } = useAlbumStore()

  const handleError = () => setError(true)

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-base-200 text-base-content/20 p-4">
        <ImageOff className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-xs text-center opacity-40">图片加载失败</p>
        <p className="text-[10px] text-center opacity-20 mt-1 truncate max-w-full px-2">
          {photo.src}
        </p>
      </div>
    )
  }

  return (
    <img
      src={photo.src}
      alt={photo.title || ''}
      className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500 ease-out"
      loading="lazy"
      onError={handleError}
    />
  )
}

export default function PhotoWallGrid({ initialAlbum, event }: Props) {
  const {
    albums, isEditMode,
    updatePhoto, deletePhoto, reorderPhotos,
  } = useAlbumStore()

  // View mode: use server-provided data (source of truth)
  // Edit mode: use store data (working copy), falling back to server data
  const storeEvent = event || initialAlbum?.event || ''
  const storeAlbum = albums.find((a) => a.event === storeEvent)
  const displayAlbum = isEditMode ? (storeAlbum || initialAlbum) : initialAlbum

  const photos = displayAlbum?.photos || []
  const albumEvent = displayAlbum?.event || storeEvent

  const handleDeletePhoto = (idx: number) => {
    if (confirm('确定要删除这张照片吗？')) {
      deletePhoto(albumEvent, idx)
    }
  }

  return (
    <div>
      {/* Content */}
      {photos.length === 0 ? (
        <div className="text-center py-16">
          <Camera className="w-16 h-16 mx-auto mb-3 text-base-content/20" />
          <p className="text-lg text-base-content/30">暂无照片</p>
          {isEditMode && (
            <p className="text-sm text-base-content/30 mt-1">
              点击上方「管理相册」进入编辑面板添加照片
            </p>
          )}
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
          {photos.map((photo, idx) => (
            <div
              key={`${photo.src}-${idx}`}
              className="break-inside-avoid bg-base-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-base-200 group"
            >
              {/* Image */}
              <div
                className="relative overflow-hidden bg-base-200"
                style={{ aspectRatio: VARIANT_RATIO[photo.variant] || '1 / 1' }}
              >
                <PhotoImage photo={photo} idx={idx} albumEvent={albumEvent} />

                {/* Delete overlay — only in edit mode */}
                {isEditMode && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 z-10">
                    <button
                      onClick={() => handleDeletePhoto(idx)}
                      className="btn btn-sm btn-error gap-1 shadow-xl"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 删除照片
                    </button>
                  </div>
                )}
              </div>

              {/* Info section */}
              <div className="p-5">
                {isEditMode ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={photo.title || ''}
                        onChange={(e) => updatePhoto(albumEvent, idx, { ...photo, title: e.target.value })}
                        placeholder="照片标题"
                        className="bg-transparent font-bold text-sm outline-none border-b border-transparent hover:border-primary/30 focus:border-primary flex-1 transition-colors"
                      />
                      <span className="text-xs opacity-30 bg-base-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                        {VARIANT_LABELS[photo.variant] || photo.variant}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={photo.description || ''}
                      onChange={(e) => updatePhoto(albumEvent, idx, { ...photo, description: e.target.value })}
                      placeholder="照片描述"
                      className="bg-transparent text-xs opacity-60 outline-none border-b border-transparent hover:border-primary/30 focus:border-primary w-full transition-colors"
                    />

                    <details className="text-xs opacity-40">
                      <summary className="cursor-pointer hover:opacity-80">修改图片</summary>
                      <div className="mt-1 space-y-1">
                        <input
                          type="text"
                          value={photo.src}
                          onChange={(e) => updatePhoto(albumEvent, idx, { ...photo, src: e.target.value })}
                          placeholder="图片 URL"
                          className="input input-xs input-bordered w-full text-xs"
                        />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            const dataUrl = await new Promise<string>((res) => {
                              const r = new FileReader()
                              r.onload = () => res(r.result as string)
                              r.readAsDataURL(f)
                            })
                            updatePhoto(albumEvent, idx, { ...photo, src: dataUrl }, f)
                          }}
                          className="text-xs"
                        />
                      </div>
                    </details>

                    <div className="flex items-center gap-1 pt-1">
                      <button
                        onClick={() => idx > 0 && reorderPhotos(albumEvent, idx, idx - 1)}
                        disabled={idx === 0}
                        className="btn btn-xs btn-ghost text-primary/50 hover:text-primary hover:bg-primary/10 rounded-lg px-1 disabled:opacity-20"
                      >
                        ← 前移
                      </button>
                      <button
                        onClick={() => idx < photos.length - 1 && reorderPhotos(albumEvent, idx, idx + 1)}
                        disabled={idx === photos.length - 1}
                        className="btn btn-xs btn-ghost text-primary/50 hover:text-primary hover:bg-primary/10 rounded-lg px-1 disabled:opacity-20"
                      >
                        后移 →
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl font-bold mb-2">{photo.title}</h3>
                    {photo.description && (
                      <p className="text-base-content/70 text-sm">{photo.description}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
