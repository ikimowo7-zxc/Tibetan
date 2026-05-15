'use client'

import {
  readTextFileFromRepo,
  toBase64Utf8,
  createBlob,
  createTree,
  createCommit,
  updateRef,
  getRef,
  getCommit,
  type TreeItem
} from '@/lib/github-client'
import { fileToBase64NoPrefix } from '@/lib/file-utils'
import { getAuthToken } from '@/lib/auth'
import { GITHUB_CONFIG } from '@/consts'
import { toast } from 'sonner'
import type { AlbumItem } from '@/data/albums'

const ALBUMS_FILE_PATH = 'src/data/albums.json'
const IMAGES_DIR = 'public/image/albums'

export async function loadAlbumsFromGitHub(): Promise<AlbumItem[]> {
  let token: string | undefined
  try {
    token = await getAuthToken()
  } catch {
    // try public access
  }
  const content = await readTextFileFromRepo(
    token,
    GITHUB_CONFIG.OWNER,
    GITHUB_CONFIG.REPO,
    ALBUMS_FILE_PATH,
    GITHUB_CONFIG.BRANCH
  )
  if (!content) return []
  try {
    const data = JSON.parse(content)
    if (Array.isArray(data)) return data as AlbumItem[]
    return []
  } catch {
    return []
  }
}

/**
 * Save albums data to GitHub.
 * Handles pending photo file uploads (newly added local files).
 * Photos with regular paths or external URLs are left unchanged.
 */
export async function saveAlbumsToGitHub(
  albums: AlbumItem[],
  pendingPhotos?: Record<string, { file: File; previewUrl: string }>
): Promise<AlbumItem[]> {
  const token = await getAuthToken()
  const toastId = toast.loading('🚀 正在保存相册数据...')

  try {
    const treeItems: TreeItem[] = []

    // Deep clone so we can mutate photo srcs
    const albumsToSave: AlbumItem[] = JSON.parse(JSON.stringify(albums))

    // Handle pending photo uploads first
    if (pendingPhotos && Object.keys(pendingPhotos).length > 0) {
      let uploadCount = 0
      for (const [key, { file }] of Object.entries(pendingPhotos)) {
        // Key format: "albumEvent-photoIndex"
        const [albumEvent, photoIdxStr] = key.split('::')
        const photoIdx = parseInt(photoIdxStr)
        const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
        const timestamp = Date.now()
        const fileName = `${albumEvent}-${photoIdx}-${timestamp}.${ext}`
        const imagePath = `${IMAGES_DIR}/${fileName}`

        uploadCount++
        toast.loading(`正在上传照片 ${uploadCount}...`, { id: toastId })

        const base64Content = await fileToBase64NoPrefix(file)
        const { sha: blobSha } = await createBlob(
          token,
          GITHUB_CONFIG.OWNER,
          GITHUB_CONFIG.REPO,
          base64Content,
          'base64'
        )

        treeItems.push({
          path: imagePath,
          mode: '100644',
          type: 'blob',
          sha: blobSha
        })

        // Update the photo src in the save copy
        const album = albumsToSave.find((a) => a.event === albumEvent)
        if (album?.photos && album.photos[photoIdx]) {
          album.photos[photoIdx].src = `/image/albums/${fileName}`
        }
      }
    }

    // Also handle any remaining data-URL photos not tracked in pendingPhotos
    for (const album of albumsToSave) {
      if (!album.photos) continue
      for (let i = 0; i < album.photos.length; i++) {
        const photo = album.photos[i]
        if (!photo.src.startsWith('data:')) continue

        const match = photo.src.match(/^data:image\/(\w+);base64,(.+)$/)
        if (!match) continue

        const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
        const fileName = `${album.event}-${i}-${Date.now()}.${ext}`
        const imagePath = `${IMAGES_DIR}/${fileName}`

        toast.loading('正在上传照片...', { id: toastId })

        const { sha: blobSha } = await createBlob(
          token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO,
          match[2], 'base64'
        )

        treeItems.push({ path: imagePath, mode: '100644', type: 'blob', sha: blobSha })
        photo.src = `/image/albums/${fileName}`
      }
    }

    // Serialize albums to JSON and create blob
    const jsonContent = JSON.stringify(albumsToSave, null, 2)
    const base64Content = toBase64Utf8(jsonContent)

    toast.loading('正在创建文件 Blob...', { id: toastId })
    const { sha: jsonBlobSha } = await createBlob(
      token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO,
      base64Content, 'base64'
    )

    treeItems.push({
      path: ALBUMS_FILE_PATH,
      mode: '100644',
      type: 'blob',
      sha: jsonBlobSha
    })

    toast.loading('正在获取分支信息...', { id: toastId })
    const refName = `heads/${GITHUB_CONFIG.BRANCH}`
    const ref = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, refName)
    const currentCommitSha = ref.sha

    const commit = await getCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, currentCommitSha)
    const baseTreeSha = commit.tree.sha

    toast.loading('🌳 正在构建文件树...', { id: toastId })
    const { sha: newTreeSha } = await createTree(
      token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO,
      treeItems, baseTreeSha
    )

    toast.loading('💾 正在提交更改...', { id: toastId })
    const { sha: newCommitSha } = await createCommit(
      token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO,
      'chore(albums): update albums data',
      newTreeSha,
      [currentCommitSha]
    )

    toast.loading('🔄 正在同步远程分支...', { id: toastId })
    await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, refName, newCommitSha)

    toast.success('🎉 相册数据更新成功！', {
      id: toastId,
      description: '更改已推送到仓库，重新部署后即可生效。'
    })

    return albumsToSave
  } catch (error: any) {
    console.error(error)
    toast.error('❌ 保存失败', {
      id: toastId,
      description: error.message || '发生了未知错误，请重试'
    })
    throw error
  }
}
