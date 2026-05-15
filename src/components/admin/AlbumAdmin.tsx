'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  X, Save, Loader2, ImageIcon, Plus, Trash2, ChevronUp, ChevronDown,
  Upload, Link, Camera, Settings, Images, ArrowLeft
} from 'lucide-react'
import { useAlbumStore } from '@/stores/album-store'
import { detectVariantFromUrl } from '@/lib/photo-utils'
import type { AlbumItem, Photo } from '@/data/albums'

const VARIANT_LABELS: Record<string, string> = { '1x1': '1:1', '4x3': '4:3', '4x5': '4:5', '9x16': '9:16' }
const VARIANT_OPTIONS: Photo['variant'][] = ['1x1', '4x3', '4x5', '9x16']

type Tab = 'info' | 'photos'

export default function AlbumAdmin() {
  const {
    albums, adminAlbumEvent, isSaving, closeAdmin, saveAlbums,
    updateAlbum, addPhoto, addPhotos, updatePhoto, deletePhoto, reorderPhotos,
    deleteAlbum, addPendingPhoto,
  } = useAlbumStore()

  const [activeTab, setActiveTab] = useState<Tab>('info')
  const [isOpen, setIsOpen] = useState(false)
  const [photoTab, setPhotoTab] = useState<'add' | 'list'>('list')
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // New photo form state
  const [newPhotos, setNewPhotos] = useState<{ photo: Photo; file?: File }[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [urlDesc, setUrlDesc] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const album = albums.find((a) => a.event === adminAlbumEvent)
  const albumIndex = albums.findIndex((a) => a.event === adminAlbumEvent)
  const canEdit = albumIndex >= 0
  const photos = album?.photos || []

  // Animate in when adminAlbumEvent changes
  useEffect(() => {
    if (adminAlbumEvent) {
      setIsOpen(true)
      setActiveTab('info')
      setPhotoTab('list')
      setDeleteConfirm(false)
    } else {
      setIsOpen(false)
    }
  }, [adminAlbumEvent])

  const handleClose = () => {
    setIsOpen(false)
    setTimeout(() => closeAdmin(), 300)
  }

  // Album field updaters
  const updateField = useCallback((field: keyof AlbumItem, value: string) => {
    if (!album || !canEdit) return
    updateAlbum(album.event, { ...album, [field]: value })
  }, [album, canEdit, updateAlbum])

  // Add photo from URL
  const handleAddUrl = async () => {
    if (!urlInput.trim() || !album || !canEdit) return
    const variant = await detectVariantFromUrl(urlInput.trim())
    addPhoto(album.event, {
      src: urlInput.trim(),
      variant,
      title: urlTitle.trim() || undefined,
      description: urlDesc.trim() || undefined,
    })
    setUrlInput('')
    setUrlTitle('')
    setUrlDesc('')
  }

  // Handle file uploads (including drag & drop)
  const processFiles = async (files: FileList | File[]) => {
    if (!album || !canEdit) return
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (fileArray.length === 0) return

    const startIndex = photos.length
    const newItems: Photo[] = []

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i]
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      const variant = await detectVariantFromUrl(dataUrl)
      newItems.push({ src: dataUrl, variant, title: file.name.replace(/\.[^.]+$/, '') })

      // Track file for GitHub upload via pending photos
      const key = `${album.event}::${startIndex + i}`
      const previewUrl = URL.createObjectURL(file)
      addPendingPhoto(key, { file, previewUrl })
    }

    addPhotos(album.event, newItems)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files)
      e.target.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files)
  }

  // Delete photo
  const handleDeletePhoto = (idx: number) => {
    if (!album || !canEdit) return
    if (confirm('确定要删除这张照片吗？')) {
      deletePhoto(album.event, idx)
    }
  }

  // Delete entire album
  const handleDeleteAlbum = () => {
    if (!album || !canEdit) return
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    if (confirm(`确定要永久删除相册「${album.event}」及其所有照片吗？此操作不可撤销。`)) {
      deleteAlbum(album.event)
      handleClose()
    }
  }

  if (!album) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          {/* Slide-over panel */}
          <motion.div
            className="fixed right-0 top-0 h-full w-full max-w-lg bg-base-100 shadow-2xl z-50 flex flex-col border-l border-base-300"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-base-200 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className="btn btn-sm btn-ghost btn-circle"
                  title="关闭"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-lg font-bold">{album.event}</h2>
                  <p className="text-xs text-base-content/50">编辑相册</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeleteAlbum}
                  className={`btn btn-sm gap-1.5 ${deleteConfirm ? 'btn-error' : 'btn-ghost text-error hover:bg-error/10'}`}
                >
                  <Trash2 className="w-4 h-4" />
                  {deleteConfirm ? '确认删除' : '删除'}
                </button>
                <button
                  onClick={() => { saveAlbums(); handleClose() }}
                  disabled={isSaving}
                  className="btn btn-sm btn-primary gap-1.5 shadow-lg shadow-primary/20 font-semibold"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  保存
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-base-200 px-6 shrink-0">
              <button
                onClick={() => { setActiveTab('info'); setDeleteConfirm(false) }}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'info'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-base-content/50 hover:text-base-content'
                }`}
              >
                <Settings className="w-4 h-4 inline mr-1.5" />
                相册信息
              </button>
              <button
                onClick={() => { setActiveTab('photos'); setDeleteConfirm(false) }}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'photos'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-base-content/50 hover:text-base-content'
                }`}
              >
                <Images className="w-4 h-4 inline mr-1.5" />
                照片管理
                <span className="ml-1.5 text-xs bg-base-200 px-1.5 py-0.5 rounded-full">
                  {photos.length}
                </span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {activeTab === 'info' ? (
                /* Album Info Tab */
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-base-content/70 mb-1.5 block">
                      封面标题（事件名）
                    </label>
                    <input
                      type="text"
                      value={album.event}
                      onChange={(e) => updateField('event', e.target.value)}
                      disabled={!canEdit}
                      className="input input-bordered w-full"
                      placeholder="如：夏日旅行"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-base-content/70 mb-1.5 block">
                      子标题
                    </label>
                    <input
                      type="text"
                      value={album.title}
                      onChange={(e) => updateField('title', e.target.value)}
                      disabled={!canEdit}
                      className="input input-bordered w-full"
                      placeholder="如：青岛海滨"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-base-content/70 mb-1.5 block">
                        日期
                      </label>
                      <input
                        type="date"
                        value={album.date}
                        onChange={(e) => updateField('date', e.target.value)}
                        disabled={!canEdit}
                        className="input input-bordered w-full"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-base-content/70 mb-1.5 block">
                        图标（Emoji）
                      </label>
                      <input
                        type="text"
                        value={album.icon || ''}
                        onChange={(e) => updateField('icon', e.target.value)}
                        disabled={!canEdit}
                        className="input input-bordered w-full"
                        placeholder="🌊"
                        maxLength={4}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-base-content/70 mb-1.5 block">
                      描述
                    </label>
                    <textarea
                      value={album.description || ''}
                      onChange={(e) => updateField('description', e.target.value)}
                      disabled={!canEdit}
                      className="textarea textarea-bordered w-full"
                      rows={3}
                      placeholder="相册描述..."
                    />
                  </div>

                  {/* Preview card */}
                  <div className="mt-6 p-4 bg-base-200/50 rounded-2xl border border-base-300">
                    <p className="text-xs font-semibold text-base-content/40 mb-2 uppercase tracking-wide">
                      卡片预览
                    </p>
                    <div className="flex items-center gap-3">
                      {album.icon && (
                        <span className="text-3xl">{album.icon}</span>
                      )}
                      <div>
                        <h3 className="font-bold text-base">{album.event}</h3>
                        {album.title && (
                          <p className="text-sm text-base-content/60">{album.title}</p>
                        )}
                        <p className="text-xs text-base-content/40 mt-0.5">
                          {album.date} · {photos.length} 张照片
                        </p>
                      </div>
                    </div>
                    {album.description && (
                      <p className="text-sm text-base-content/50 mt-2 italic">
                        "{album.description}"
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* Photos Tab */
                <div className="space-y-6">
                  {/* Add photo section */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
                      dragOver
                        ? 'border-primary bg-primary/5'
                        : 'border-base-300 hover:border-primary/50 bg-base-200/30'
                    }`}
                  >
                    {dragOver ? (
                      <div className="text-primary">
                        <Upload className="w-10 h-10 mx-auto mb-2 animate-bounce" />
                        <p className="font-semibold">松开以上传图片</p>
                      </div>
                    ) : (
                      <>
                        <ImageIcon className="w-10 h-10 mx-auto mb-2 text-base-content/20" />
                        <p className="text-sm text-base-content/50 mb-3">
                          拖拽图片到此处，或通过以下方式添加
                        </p>
                      </>
                    )}

                    <div className="flex items-center justify-center gap-3 flex-wrap">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-sm btn-primary gap-1.5 shadow-lg shadow-primary/20"
                      >
                        <Upload className="w-4 h-4" />
                        上传图片
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileInput}
                        className="hidden"
                      />
                      <span className="text-sm text-base-content/30">或</span>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          placeholder="输入图片 URL..."
                          className="input input-sm input-bordered w-48"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                        />
                        <button
                          onClick={handleAddUrl}
                          disabled={!urlInput.trim()}
                          className="btn btn-sm btn-ghost border"
                        >
                          <Link className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* URL metadata */}
                    {urlInput.trim() && (
                      <div className="flex gap-2 mt-3 justify-center">
                        <input
                          type="text"
                          value={urlTitle}
                          onChange={(e) => setUrlTitle(e.target.value)}
                          placeholder="标题（可选）"
                          className="input input-xs input-bordered w-32"
                        />
                        <input
                          type="text"
                          value={urlDesc}
                          onChange={(e) => setUrlDesc(e.target.value)}
                          placeholder="描述（可选）"
                          className="input input-xs input-bordered w-40"
                        />
                      </div>
                    )}
                  </div>

                  {/* Photo list */}
                  {photos.length > 0 ? (
                    <div className="space-y-3">
                      {photos.map((photo, idx) => (
                        <div
                          key={`${photo.src}-${idx}`}
                          className="flex gap-3 bg-base-200/50 rounded-xl p-3 border border-base-200 hover:border-base-300 transition-colors group"
                        >
                          {/* Thumbnail */}
                          <div className="w-20 h-20 rounded-lg overflow-hidden bg-base-300 shrink-0">
                            <img
                              src={photo.src}
                              alt={photo.title || ''}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>

                          {/* Edit fields */}
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={photo.title || ''}
                                onChange={(e) =>
                                  canEdit && updatePhoto(album.event, idx, { ...photo, title: e.target.value })
                                }
                                placeholder="照片标题"
                                className="bg-transparent text-sm font-medium outline-none border-b border-transparent hover:border-primary/30 focus:border-primary w-full transition-colors"
                              />
                              <select
                                value={photo.variant}
                                onChange={(e) =>
                                  canEdit && updatePhoto(album.event, idx, { ...photo, variant: e.target.value as Photo['variant'] })
                                }
                                className="text-xs bg-base-300/50 rounded px-1.5 py-0.5 border-0 outline-none cursor-pointer"
                              >
                                {VARIANT_OPTIONS.map((v) => (
                                  <option key={v} value={v}>{VARIANT_LABELS[v]}</option>
                                ))}
                              </select>
                            </div>
                            <input
                              type="text"
                              value={photo.description || ''}
                              onChange={(e) =>
                                canEdit && updatePhoto(album.event, idx, { ...photo, description: e.target.value })
                              }
                              placeholder="照片描述（可选）"
                              className="bg-transparent text-xs text-base-content/50 outline-none border-b border-transparent hover:border-primary/30 focus:border-primary w-full transition-colors"
                            />

                            {/* Source URL edit */}
                            <details className="text-xs">
                              <summary className="cursor-pointer text-base-content/40 hover:text-base-content/60">
                                修改图片地址
                              </summary>
                              <div className="mt-1.5 space-y-1.5">
                                <input
                                  type="text"
                                  value={photo.src}
                                  onChange={(e) =>
                                    canEdit && updatePhoto(album.event, idx, { ...photo, src: e.target.value })
                                  }
                                  placeholder="图片 URL"
                                  className="input input-xs input-bordered w-full text-xs"
                                />
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={async (e) => {
                                    const f = e.target.files?.[0]
                                    if (!f || !canEdit) return
                                    const dataUrl = await new Promise<string>((res) => {
                                      const r = new FileReader()
                                      r.onload = () => res(r.result as string)
                                      r.readAsDataURL(f)
                                    })
                                    updatePhoto(album.event, idx, { ...photo, src: dataUrl })
                                    // Track file for GitHub upload
                                    const key = `${album.event}::${idx}`
                                    addPendingPhoto(key, { file: f, previewUrl: URL.createObjectURL(f) })
                                  }}
                                  className="text-xs"
                                />
                              </div>
                            </details>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col items-center gap-1 shrink-0">
                            <button
                              onClick={() => idx > 0 && reorderPhotos(album.event, idx, idx - 1)}
                              disabled={idx === 0}
                              className="btn btn-xs btn-ghost text-base-content/30 hover:text-base-content disabled:opacity-10"
                              title="上移"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => idx < photos.length - 1 && reorderPhotos(album.event, idx, idx + 1)}
                              disabled={idx === photos.length - 1}
                              className="btn btn-xs btn-ghost text-base-content/30 hover:text-base-content disabled:opacity-10"
                              title="下移"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePhoto(idx)}
                              className="btn btn-xs btn-ghost text-base-content/30 hover:text-error mt-1"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-16 text-base-content/20">
                      <Camera className="w-16 h-16 mx-auto mb-3 opacity-20" />
                      <p className="text-lg">暂无照片</p>
                      <p className="text-sm mt-1">拖拽图片或使用上方按钮添加</p>
                    </div>
                  )}

                  {photos.length > 0 && (
                    <p className="text-xs text-base-content/30 text-center">
                      共 {photos.length} 张照片 · 拖拽排序可通过上下箭头调整
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-base-200 shrink-0 flex gap-3">
              <button
                onClick={handleClose}
                className="btn btn-ghost flex-1 rounded-xl"
              >
                关闭（不保存）
              </button>
              <button
                onClick={() => { saveAlbums(); handleClose() }}
                disabled={isSaving}
                className="btn btn-primary flex-1 gap-2 rounded-xl font-semibold shadow-lg shadow-primary/20"
              >
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                ) : (
                  <><Save className="w-4 h-4" />保存并同步</>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
