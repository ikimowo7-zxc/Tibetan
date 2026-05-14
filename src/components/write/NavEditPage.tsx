'use client'

import { useState, useRef, useMemo } from 'react'
import { toast, Toaster } from 'sonner'
import { useAuthStore } from './hooks/use-auth'
import { readFileAsText } from '@/lib/file-utils'
import { saveNavigationToGitHub } from './services/navigation-service'
import type { NavCategory, NavItem } from '@/data/navData'

type Props = { initialNavData?: NavCategory[] }

type PendingAvatar = { catIndex: number; itemIndex: number; file: File; previewUrl: string }
type FlatItem = NavItem & { _catIndex: number; _itemIndex: number; _itemCategory: string }

const NEW_ITEM_DEFAULT: Partial<NavItem> = {
  name: '', avatar: '', url: '', category: '', description: '',
  badge: '', badgeIcon: 'lucide:award', badgeColor: 'primary',
}

export default function NavEditPage({ initialNavData = [] }: Props) {
  const [navData, setNavData] = useState<NavCategory[]>(initialNavData)
  const [originalNavData, setOriginalNavData] = useState<NavCategory[]>(JSON.parse(JSON.stringify(initialNavData)))
  const [globalEditMode, setGlobalEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingAvatars, setPendingAvatars] = useState<Record<string, PendingAvatar>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const { isAuth, setPrivateKey } = useAuthStore()
  const keyInputRef = useRef<HTMLInputElement>(null)

  // === Add page ===
  const [showAddPage, setShowAddPage] = useState(false)
  const [addItem, setAddItem] = useState<Partial<NavItem>>({ ...NEW_ITEM_DEFAULT })
  const [addAvatarFile, setAddAvatarFile] = useState<File | null>(null)
  const [addAvatarPreview, setAddAvatarPreview] = useState('')
  const addAvatarRef = useRef<HTMLInputElement>(null)
  const [addCategoryMode, setAddCategoryMode] = useState<'select' | 'custom'>('select')
  const [addCategoryCustom, setAddCategoryCustom] = useState('')

  // === Edit page ===
  const [showEditPage, setShowEditPage] = useState(false)
  const [editCatIndex, setEditCatIndex] = useState(0)
  const [editItemIndex, setEditItemIndex] = useState(0)
  const [editItem, setEditItem] = useState<Partial<NavItem>>({ ...NEW_ITEM_DEFAULT })
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null)
  const [editAvatarPreview, setEditAvatarPreview] = useState('')
  const editAvatarRef = useRef<HTMLInputElement>(null)
  const [editCategoryMode, setEditCategoryMode] = useState<'select' | 'custom'>('select')
  const [editCategoryCustom, setEditCategoryCustom] = useState('')
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)

  // === Icon search ===
  const [iconSearchQuery, setIconSearchQuery] = useState('')
  const [iconSearchResults, setIconSearchResults] = useState<string[]>([])
  const [iconSearching, setIconSearching] = useState(false)
  const [iconSearchTarget, setIconSearchTarget] = useState<'badge' | 'cover'>('badge')
  const iconSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)


  // === Derived data ===
  const flatItems: FlatItem[] = useMemo(
    () => navData.flatMap((cat, ci) =>
      cat.items.map((item, ii) => ({ ...item, _catIndex: ci, _itemIndex: ii, _itemCategory: item.category || '' }))
    ), [navData]
  )

  const filterCategories = useMemo(() => {
    const cats = new Set<string>()
    navData.forEach(cat => cat.items.forEach(item => { if (item.category) cats.add(item.category) }))
    return Array.from(cats)
  }, [navData])

  const filteredFlatItems = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return flatItems.filter(item => {
      const ms = !q || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
      const mf = activeFilter === 'all' || item._itemCategory === activeFilter
      return ms && mf
    })
  }, [flatItems, searchQuery, activeFilter])

  const hasChanges = () => JSON.stringify(navData) !== JSON.stringify(originalNavData) || Object.keys(pendingAvatars).length > 0

  // === Global Edit ===
  const handleEnterEditMode = () => { setGlobalEditMode(true) }

  const handleCancelGlobal = () => {
    if (hasChanges() && !window.confirm('你有未保存的更改，确定要取消吗？所有修改将丢失。')) return
    Object.values(pendingAvatars).forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl))
    setPendingAvatars({})
    setNavData(JSON.parse(JSON.stringify(originalNavData)))
    setGlobalEditMode(false)
  }

  const handleSaveAll = async () => {
    if (!isAuth) { toast.error('请先导入密钥后再保存'); handleImportKey(); return }
    try {
      setSaving(true)
      const pendingList = Object.values(pendingAvatars).map(p => ({ catIndex: p.catIndex, itemIndex: p.itemIndex, file: p.file, previewUrl: p.previewUrl }))
      await saveNavigationToGitHub(JSON.parse(JSON.stringify(navData)), pendingList)
      Object.values(pendingAvatars).forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl))
      setPendingAvatars({})
      setOriginalNavData(JSON.parse(JSON.stringify(navData)))
      setGlobalEditMode(false)
    } catch { } finally { setSaving(false) }
  }

  const handleImportKey = () => keyInputRef.current?.click()

  const onChoosePrivateKey = async (file: File) => {
    const pem = await readFileAsText(file)
    setPrivateKey(pem)
    toast.success('密钥导入成功')
  }

  // === Item Operations ===
  const addItemToNav = (item: NavItem) => {
    if (navData.length === 0) {
      setNavData([{ title: '默认分类', icon: 'lucide:folder', items: [item] }])
    } else {
      setNavData(prev => prev.map((c, i) => i === 0 ? { ...c, items: [...c.items, item] } : c))
    }
  }

  const removeItem = (catIndex: number, itemIndex: number) => {
    const name = navData[catIndex].items[itemIndex].name || '(未命名)'
    if (!window.confirm(`确定要删除 "${name}" 吗？`)) return
    setNavData(prev => prev.map((c, i) => i === catIndex ? { ...c, items: c.items.filter((_, ii) => ii !== itemIndex) } : c))
    const key = `${catIndex}-${itemIndex}`
    if (pendingAvatars[key]) { URL.revokeObjectURL(pendingAvatars[key].previewUrl); setPendingAvatars(prev => { const n = { ...prev }; delete n[key]; return n }) }
  }

  const moveItemUp = (catIndex: number, itemIndex: number) => {
    if (itemIndex <= 0) return
    setNavData(prev => prev.map((c, i) => i === catIndex ? { ...c, items: c.items.map((it, ii) => {
      if (ii === itemIndex - 1) return c.items[itemIndex]
      if (ii === itemIndex) return c.items[itemIndex - 1]
      return it
    })} : c))
  }

  const moveItemDown = (catIndex: number, itemIndex: number) => {
    setNavData(prev => {
      const len = prev[catIndex]?.items.length || 0
      if (itemIndex >= len - 1) return prev
      return prev.map((c, i) => i === catIndex ? { ...c, items: c.items.map((it, ii) => {
        if (ii === itemIndex) return c.items[itemIndex + 1]
        if (ii === itemIndex + 1) return c.items[itemIndex]
        return it
      })} : c)
    })
  }

  // === Add Page ===
  const openAddPage = () => {
    setAddItem({ ...NEW_ITEM_DEFAULT, category: activeFilter === 'all' ? '' : activeFilter })
    setAddAvatarFile(null); setAddAvatarPreview('')
    setAddCategoryMode('select'); setAddCategoryCustom('')
    setIconSearchQuery(''); setIconSearchResults([]); setIconSearchTarget('badge')
    setCategoryDropdownOpen(false)
    setShowAddPage(true)
  }

  const closeAddPage = () => {
    if (addAvatarPreview) URL.revokeObjectURL(addAvatarPreview)
    setShowAddPage(false); setAddAvatarFile(null); setAddAvatarPreview('')
  }

  const handleAddAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return }
    if (addAvatarPreview) URL.revokeObjectURL(addAvatarPreview)
    setAddAvatarFile(file); setAddAvatarPreview(URL.createObjectURL(file))
    if (e.currentTarget) e.currentTarget.value = ''
  }

  const getAddCategoryValue = () => addCategoryMode === 'custom' ? addCategoryCustom : (addItem.category || '')

  const submitAddPage = () => {
    if (!addItem.name?.trim()) { toast.error('名称不能为空'); return }
    if (!addItem.url?.trim()) { toast.error('请输入URL'); return }
    const finalCategory = getAddCategoryValue()
    const item = { ...addItem, name: addItem.name.trim(), url: addItem.url.trim(), category: finalCategory } as NavItem
    addItemToNav(item)
    if (addAvatarFile) {
      const ci = 0; const ii = navData.length > 0 ? navData[0].items.length : 0
      setPendingAvatars(prev => ({ ...prev, [`${ci}-${ii}`]: { catIndex: ci, itemIndex: ii, file: addAvatarFile, previewUrl: addAvatarPreview } }))
    }
    setShowAddPage(false); setAddAvatarFile(null); setAddAvatarPreview('')
    toast.success('添加成功')
  }

  // === Edit Page ===
  const openEditPage = (catIndex: number, itemIndex: number) => {
    const item = navData[catIndex]?.items[itemIndex]
    if (!item) return
    setEditCatIndex(catIndex); setEditItemIndex(itemIndex)
    setEditItem({ ...item })
    setEditAvatarFile(null); setEditAvatarPreview('')
    setEditCategoryMode('select'); setEditCategoryCustom(item.category || '')
    setIconSearchQuery(''); setIconSearchResults([]); setIconSearchTarget('badge')
    setCategoryDropdownOpen(false)
    setShowEditPage(true)
  }

  const closeEditPage = () => {
    if (editAvatarPreview) URL.revokeObjectURL(editAvatarPreview)
    setShowEditPage(false); setEditAvatarFile(null); setEditAvatarPreview('')
  }

  const handleEditAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return }
    if (editAvatarPreview) URL.revokeObjectURL(editAvatarPreview)
    setEditAvatarFile(file); setEditAvatarPreview(URL.createObjectURL(file))
    if (e.currentTarget) e.currentTarget.value = ''
  }

  const getEditCategoryValue = () => editCategoryMode === 'custom' ? editCategoryCustom : (editItem.category || '')

  const submitEditPage = () => {
    if (!editItem.name?.trim()) { toast.error('名称不能为空'); return }
    if (!editItem.url?.trim()) { toast.error('请输入URL'); return }
    const finalCategory = getEditCategoryValue()
    const item = { ...editItem, name: editItem.name.trim(), url: editItem.url.trim(), category: finalCategory } as NavItem

    // Update all fields at once
    setNavData(prev => prev.map((c, ci) => ci === editCatIndex ? { ...c, items: c.items.map((it, ii) => ii === editItemIndex ? item : it) } : c))

    if (editAvatarFile) {
      const key = `${editCatIndex}-${editItemIndex}`
      if (pendingAvatars[key]) URL.revokeObjectURL(pendingAvatars[key].previewUrl)
      setPendingAvatars(prev => ({ ...prev, [key]: { catIndex: editCatIndex, itemIndex: editItemIndex, file: editAvatarFile, previewUrl: editAvatarPreview } }))
    }
    setShowEditPage(false); setEditAvatarFile(null); setEditAvatarPreview('')
    toast.success('修改已保存')
  }

  // === Display helpers ===
  const getDisplayAvatar = (item: NavItem, catIndex: number, itemIndex: number) => pendingAvatars[`${catIndex}-${itemIndex}`]?.previewUrl || item.avatar
  const getHostname = (url: string) => { try { return new URL(url).hostname } catch { return url } }

  const COLOR_MAP: Record<string, string> = {
    rose: '#f43f5e', amber: '#f59e0b', sky: '#0ea5e9', primary: '#6366f1',
    emerald: '#10b981', violet: '#8b5cf6', pink: '#ec4899', blue: '#3b82f6',
    green: '#22c55e', red: '#ef4444', orange: '#f97316', yellow: '#eab308',
    teal: '#14b8a6', cyan: '#06b6d4', indigo: '#6366f1', purple: '#a855f7',
  }

  const resolveBadgeHex = (color?: string) => {
    if (!color) return '#6366f1'
    if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color
    return COLOR_MAP[color] || '#6366f1'
  }

  const getIconifySvgUrl = (iconName?: string, color?: string) => {
    if (!iconName) return ''
    const ci = iconName.indexOf(':')
    if (ci === -1) return ''
    const p = iconName.slice(0, ci)
    const n = iconName.slice(ci + 1)
    let url = `https://api.iconify.design/${p}/${n}.svg`
    if (color) url += `?color=${encodeURIComponent(color)}`
    return url
  }

  const searchIconify = async (query: string) => {
    if (!query.trim()) { setIconSearchResults([]); return }
    setIconSearching(true)
    try {
      const res = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=20`)
      if (!res.ok) throw new Error('search failed')
      const data = await res.json()
      setIconSearchResults((data.icons || []) as string[])
    } catch { setIconSearchResults([]) }
    finally { setIconSearching(false) }
  }

  const handleIconSearchInput = (val: string, target: 'badge' | 'cover') => {
    setIconSearchTarget(target)
    setIconSearchQuery(val)
    if (iconSearchTimer.current) clearTimeout(iconSearchTimer.current)
    iconSearchTimer.current = setTimeout(() => searchIconify(val), 350)
  }

  const selectSearchIcon = (iconName: string, setItem: (updater: (prev: Partial<NavItem>) => Partial<NavItem>) => void) => {
    if (iconSearchTarget === 'cover') {
      const ci = iconName.indexOf(':')
      const p = ci > -1 ? iconName.slice(0, ci) : 'lucide'
      const n = ci > -1 ? iconName.slice(ci + 1) : iconName
      setItem(prev => ({ ...prev, avatar: `https://api.iconify.design/${p}/${n}.svg` }))
    } else {
      setItem(prev => ({ ...prev, badgeIcon: iconName }))
    }
    setIconSearchResults([])
    setIconSearchQuery('')
  }

  const inputCls = 'input input-sm input-bordered w-full bg-base-100 focus:border-primary text-sm'

  const svg = {
    search: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-base-content/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
    edit: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>,
    trash: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
    plus: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    globe: <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    arrowLeft: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>,
    externalLink: <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
    chevronDown: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="m6 9 6 6 6-6"/></svg>,
    image: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
    arrowUp: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>,
    arrowDown: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  }

  // === Card rendering (view-only; edit goes to full page) ===
  const renderCard = (item: FlatItem) => {
    const { _catIndex: ci, _itemIndex: ii } = item
    const displayAvatar = getDisplayAvatar(item, ci, ii)

    const cardContent = (
      <div className="p-6 flex flex-col h-full">
        {globalEditMode && (
          <div className="flex justify-end gap-2 mb-3">
            {ii > 0 && (
              <button onClick={(e) => { e.stopPropagation(); moveItemUp(ci, ii); }} className="btn btn-sm btn-ghost text-primary/50 hover:text-primary hover:bg-primary/10 rounded-lg px-2" title="上移">{svg.arrowUp}</button>
            )}
            {ii < navData[ci].items.length - 1 && (
              <button onClick={(e) => { e.stopPropagation(); moveItemDown(ci, ii); }} className="btn btn-sm btn-ghost text-primary/50 hover:text-primary hover:bg-primary/10 rounded-lg px-2" title="下移">{svg.arrowDown}</button>
            )}
            <button onClick={(e) => { e.stopPropagation(); openEditPage(ci, ii); }} className="btn btn-sm btn-ghost text-primary hover:bg-primary/10 rounded-lg px-2" title="编辑">{svg.edit}</button>
            <button onClick={(e) => { e.stopPropagation(); removeItem(ci, ii); }} className="btn btn-sm btn-ghost text-error hover:bg-error/10 rounded-lg px-2" title="删除">{svg.trash}</button>
          </div>
        )}

        <div className="flex items-start gap-4 mb-4">
          <div className="relative shrink-0 w-12 h-12 rounded-2xl overflow-hidden bg-base-100 shadow-sm ring-1 ring-base-200">
            {displayAvatar ? <img src={displayAvatar} alt={item.name} className="w-full h-full object-cover rounded-xl" /> : <div className="flex items-center justify-center w-full h-full bg-base-200 text-base-content/40 text-lg font-bold">{item.name ? item.name.charAt(0) : '?'}</div>}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg text-base-content truncate">{item.name}</h3>
            <div className="text-xs text-base-content/40 truncate font-mono mt-0.5">{getHostname(item.url)}</div>
          </div>
        </div>

        {item.badge && (() => {
          const hex = resolveBadgeHex(item.badgeColor)
          const iconUrl = getIconifySvgUrl(item.badgeIcon, hex)
          return (
            <div className="flex items-center gap-3 mb-3">
              <span
                className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg border"
                style={{ backgroundColor: `${hex}18`, borderColor: `${hex}30`, color: hex }}
              >
                {iconUrl && (
                  <object data={iconUrl} type="image/svg+xml" className="w-3.5 h-3.5 pointer-events-none" aria-label={item.badgeIcon}>
                    <span className="w-3.5 h-3.5" />
                  </object>
                )}
                {item.badge}
              </span>
            </div>
          )
        })()}

        <p className="text-sm text-base-content/70 leading-relaxed line-clamp-3 flex-grow">{item.description}</p>
      </div>
    )

    return (
      <div key={`${ci}-${ii}`} className="relative h-full">
        {globalEditMode ? (
          <div className="h-full bg-base-100 rounded-[2rem] overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-base-200 hover:border-primary/20">
            {cardContent}
          </div>
        ) : (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="group block h-full">
            <div className="h-full bg-base-100 rounded-[2rem] overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-base-200 hover:border-primary/20">
              {cardContent}
            </div>
          </a>
        )}
      </div>
    )
  }

  // ======================== RENDER ========================

  const renderFormFields = (
    item: Partial<NavItem>,
    setItem: (updater: (prev: Partial<NavItem>) => Partial<NavItem>) => void,
    avatarPreview: string,
    avatarRef: React.RefObject<HTMLInputElement | null>,
    categoryMode: 'select' | 'custom',
    setCategoryMode: (m: 'select' | 'custom') => void,
    categoryCustom: string,
    setCategoryCustom: (v: string) => void,
    categories: string[],
    categoryDropdownOpen: boolean,
    setCategoryDropdownOpen: (v: boolean) => void,
  ) => (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-semibold text-base-content mb-1 block">名称 <span className="text-error">*</span></label>
        <input className="input input-bordered w-full bg-base-100 text-base" value={item.name || ''} onChange={e => setItem(prev => ({ ...prev, name: e.target.value }))} placeholder="项目名称" />
      </div>
      <div>
        <label className="text-sm font-semibold text-base-content mb-1 block">网址 URL <span className="text-error">*</span></label>
        <input className="input input-bordered w-full bg-base-100 text-base" value={item.url || ''} onChange={e => setItem(prev => ({ ...prev, url: e.target.value }))} placeholder="https://..." type="url" />
      </div>
      <div>
        <label className="text-sm font-semibold text-base-content mb-1 block">封面图片</label>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-base-200 ring-1 ring-base-300 shrink-0">
            {avatarPreview ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
              : item.avatar ? <img src={item.avatar} alt="" className="w-full h-full object-cover" />
              : <div className="flex items-center justify-center w-full h-full text-base-content/30">{svg.image}</div>}
          </div>
          <div className="flex-1 space-y-2">
            <input className={`${inputCls} text-xs`} value={item.avatar || ''} onChange={e => setItem(prev => ({ ...prev, avatar: e.target.value }))} placeholder="封面 URL" />
            <div className="flex gap-2">
              <button type="button" onClick={() => avatarRef.current?.click()} className="btn btn-xs btn-ghost rounded-lg text-primary">上传图片</button>
              <button type="button" onClick={() => { setIconSearchTarget('cover'); setIconSearchQuery(''); setIconSearchResults([]) }} className="btn btn-xs btn-ghost rounded-lg text-primary">使用图标</button>
            </div>
          </div>
        </div>
        {/* Cover icon search */}
        {iconSearchTarget === 'cover' && (
          <div className="mt-3">
            <div className="relative mb-2">
              <input
                className="input input-bordered w-full bg-base-100 text-sm pr-8"
                value={iconSearchQuery}
                onChange={e => handleIconSearchInput(e.target.value, 'cover')}
                placeholder="搜索图标作为封面..."
              />
              {iconSearching && <span className="absolute right-3 top-1/2 -translate-y-1/2 loading loading-spinner loading-xs text-primary" />}
            </div>
            {iconSearchResults.length > 0 && (
              <div className="grid grid-cols-5 gap-2 max-h-36 overflow-y-auto p-1">
                {iconSearchResults.map((ic: string) => {
                  const colonIdx = ic.indexOf(':')
                  const prefix = ic.slice(0, colonIdx)
                  const name = ic.slice(colonIdx + 1)
                  const svgUrl = `https://api.iconify.design/${prefix}/${name}.svg?width=24&height=24`
                  return (
                    <button type="button" key={ic} onClick={() => selectSearchIcon(ic, setItem)}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl border bg-base-100 border-base-200 hover:border-primary/30 hover:bg-primary/5 transition-colors">
                      <object data={svgUrl} type="image/svg+xml" className="w-6 h-6 pointer-events-none" aria-label={ic}>
                        <div className="w-6 h-6 bg-base-200 rounded flex items-center justify-center text-[8px] text-base-content/30">{name.slice(0, 3)}</div>
                      </object>
                      <span className="text-[10px] text-base-content/50 truncate w-full text-center leading-tight">{name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div>
        <label className="text-sm font-semibold text-base-content mb-1 block">分类</label>
        {categories.length > 0 ? (
          <>
            <div className="flex gap-2 mb-2">
              <button onClick={() => { setCategoryMode('select'); setCategoryCustom('') }} className={`text-xs px-3 py-1 rounded-lg ${categoryMode === 'select' ? 'bg-primary/15 text-primary font-semibold' : 'bg-base-200 text-base-content/60'}`}>选择已有分类</button>
              <button onClick={() => { setCategoryMode('custom'); setCategoryCustom(item.category || '') }} className={`text-xs px-3 py-1 rounded-lg ${categoryMode === 'custom' ? 'bg-primary/15 text-primary font-semibold' : 'bg-base-200 text-base-content/60'}`}>新建分类</button>
            </div>
            {categoryMode === 'select' ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                  className="input input-bordered w-full bg-base-100 text-base text-left flex items-center justify-between focus:border-primary hover:border-primary hover:bg-primary/5 cursor-pointer"
                >
                  <span className={item.category ? 'text-base-content' : 'text-base-content/40'}>
                    {item.category || '-- 选择分类 --'}
                  </span>
                  <span className={`transition-transform duration-200 ${categoryDropdownOpen ? 'rotate-180' : ''}`}>{svg.chevronDown}</span>
                </button>
                {categoryDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setCategoryDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-base-100 border border-base-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => { setItem(prev => ({ ...prev, category: '' })); setCategoryDropdownOpen(false) }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-primary/10 hover:text-primary transition-colors ${!item.category ? 'bg-primary/5 text-primary font-semibold' : 'text-base-content/60'}`}
                      >
                        -- 选择分类 --
                      </button>
                      {categories.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => { setItem(prev => ({ ...prev, category: c })); setCategoryDropdownOpen(false) }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-primary/10 hover:text-primary transition-colors ${item.category === c ? 'bg-primary/5 text-primary font-semibold' : 'text-base-content'}`}
                        >
                          {c}
                        </button>
                      ))}
                      {item.category && !categories.includes(item.category) && (
                        <button
                          type="button"
                          onClick={() => setCategoryDropdownOpen(false)}
                          className="w-full text-left px-4 py-2.5 text-sm bg-primary/5 text-primary font-semibold hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          {item.category} (当前)
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <input className="input input-bordered w-full bg-base-100 text-base" value={categoryCustom} onChange={e => { setCategoryCustom(e.target.value); setItem(prev => ({ ...prev, category: e.target.value })) }} placeholder="输入新分类名称" />
            )}
          </>
        ) : (
          <input className="input input-bordered w-full bg-base-100 text-base" value={item.category || ''} onChange={e => setItem(prev => ({ ...prev, category: e.target.value }))} placeholder="输入分类名称" />
        )}
      </div>
      <div>
        <label className="text-sm font-semibold text-base-content mb-1 block">描述</label>
        <textarea className="textarea textarea-bordered w-full bg-base-100 text-base leading-relaxed" rows={2} value={item.description || ''} onChange={e => setItem(prev => ({ ...prev, description: e.target.value }))} placeholder="简短描述" />
      </div>
      <div>
        <label className="text-sm font-semibold text-base-content mb-1 block">徽章文字</label>
        <input className="input input-bordered w-full bg-base-100 text-base" value={item.badge || ''} onChange={e => setItem(prev => ({ ...prev, badge: e.target.value }))} placeholder="可选徽章文字" />
      </div>
      <div>
        <label className="text-sm font-semibold text-base-content mb-1 block">徽章图标</label>
        {/* Online icon search */}
        <div className="relative mb-2">
          <input
            className="input input-bordered w-full bg-base-100 text-base pr-8"
            value={iconSearchQuery}
            onChange={e => handleIconSearchInput(e.target.value, 'badge')}
            placeholder="在线搜索图标 (如 home, star, heart)..."
          />
          {iconSearching && <span className="absolute right-3 top-1/2 -translate-y-1/2 loading loading-spinner loading-xs text-primary" />}
        </div>
        {iconSearchResults.length > 0 && (
          <div className="grid grid-cols-5 gap-2 mb-2 max-h-44 overflow-y-auto p-1">
            {iconSearchResults.map(ic => {
              const colonIdx = ic.indexOf(':')
              const prefix = ic.slice(0, colonIdx)
              const name = ic.slice(colonIdx + 1)
              const svgUrl = `https://api.iconify.design/${prefix}/${name}.svg?width=24&height=24`
              const isSelected = item.badgeIcon === ic
              return (
                <button key={ic} onClick={() => selectSearchIcon(ic, setItem)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-colors ${isSelected ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/30' : 'bg-base-100 border-base-200 hover:border-primary/30 hover:bg-primary/5'}`}>
                  <object data={svgUrl} type="image/svg+xml" className="w-6 h-6 pointer-events-none" aria-label={ic}>
                    <div className="w-6 h-6 bg-base-200 rounded flex items-center justify-center text-[8px] text-base-content/30">{name.slice(0, 3)}</div>
                  </object>
                  <span className="text-[10px] text-base-content/50 truncate w-full text-center leading-tight">{name}</span>
                </button>
              )
            })}
          </div>
        )}
        {/* Icon preview + manual input */}
        <div className="flex items-center gap-2 mb-2">
          {item.badgeIcon && (() => {
            const ci = item.badgeIcon.indexOf(':')
            const p = ci > -1 ? item.badgeIcon.slice(0, ci) : 'lucide'
            const n = ci > -1 ? item.badgeIcon.slice(ci + 1) : item.badgeIcon
            return (
              <div className="shrink-0 w-10 h-10 rounded-lg border border-base-200 bg-base-100 flex items-center justify-center p-1.5">
                <object data={`https://api.iconify.design/${p}/${n}.svg`} type="image/svg+xml" className="w-full h-full pointer-events-none" aria-label={item.badgeIcon}>
                  <div className="w-full h-full bg-base-200 rounded flex items-center justify-center text-[8px] text-base-content/30">icon</div>
                </object>
              </div>
            )
          })()}
          <input className="input input-bordered flex-1 bg-base-100 text-base" value={item.badgeIcon || ''} onChange={e => setItem(prev => ({ ...prev, badgeIcon: e.target.value }))} placeholder="图标 (如 lucide:award)" />
        </div>
      </div>
      <div>
        <label className="text-sm font-semibold text-base-content mb-1 block">徽章颜色</label>
        <div className="flex items-center gap-2">
          <input type="color" value={/^#[0-9a-fA-F]{3,8}$/.test(item.badgeColor || '') ? item.badgeColor! : '#6366f1'} onChange={e => setItem(prev => ({ ...prev, badgeColor: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer border p-0 bg-transparent" title="选择颜色" />
          <input className="input input-bordered flex-1 bg-base-100 text-base" value={item.badgeColor || ''} onChange={e => setItem(prev => ({ ...prev, badgeColor: e.target.value }))} placeholder="颜色值 (如 #6366f1 或 primary)" />
        </div>
      </div>
    </div>
  )

  // ============ ADD PAGE ============
  if (showAddPage) {
    return (
      <>
        <Toaster richColors position="top-center" toastOptions={{ className: 'shadow-xl rounded-2xl border-2 border-primary/20 backdrop-blur-sm', style: { fontSize: '1rem', padding: '14px 20px', borderRadius: '12px' }, duration: 5000 }} />
        <input ref={addAvatarRef} type="file" accept="image/*" className="hidden" onChange={handleAddAvatarFile} />
        <div className="min-h-screen bg-base-200/30 -mt-8 pt-8 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl mx-auto">
            <button onClick={closeAddPage} className="btn btn-ghost btn-sm gap-2 rounded-xl mb-6">{svg.arrowLeft} 返回导航列表</button>
            <div className="bg-base-100 rounded-3xl p-6 md:p-10 shadow-lg border border-base-200">
              <h2 className="text-2xl font-bold mb-8 flex items-center gap-2 text-primary">{svg.plus}<span>添加导航项目</span></h2>
              {renderFormFields(addItem, fn => setAddItem(fn), addAvatarPreview, addAvatarRef, addCategoryMode, setAddCategoryMode, addCategoryCustom, setAddCategoryCustom, filterCategories, categoryDropdownOpen, setCategoryDropdownOpen)}
              <div className="flex gap-3 mt-8">
                <button onClick={closeAddPage} className="btn btn-ghost flex-1 rounded-xl">取消</button>
                <button onClick={submitAddPage} className="btn btn-primary flex-1 rounded-xl shadow-lg shadow-primary/20 font-semibold text-base">添加</button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ============ EDIT PAGE ============
  if (showEditPage) {
    return (
      <>
        <Toaster richColors position="top-center" toastOptions={{ className: 'shadow-xl rounded-2xl border-2 border-primary/20 backdrop-blur-sm', style: { fontSize: '1rem', padding: '14px 20px', borderRadius: '12px' }, duration: 5000 }} />
        <input ref={editAvatarRef} type="file" accept="image/*" className="hidden" onChange={handleEditAvatarFile} />
        <div className="min-h-screen bg-base-200/30 -mt-8 pt-8 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl mx-auto">
            <button onClick={closeEditPage} className="btn btn-ghost btn-sm gap-2 rounded-xl mb-6">{svg.arrowLeft} 返回导航列表</button>
            <div className="bg-base-100 rounded-3xl p-6 md:p-10 shadow-lg border border-base-200">
              <h2 className="text-2xl font-bold mb-8 flex items-center gap-2 text-primary">{svg.edit}<span>编辑导航项目</span></h2>
              {renderFormFields(editItem, fn => setEditItem(fn), editAvatarPreview, editAvatarRef, editCategoryMode, setEditCategoryMode, editCategoryCustom, setEditCategoryCustom, filterCategories, categoryDropdownOpen, setCategoryDropdownOpen)}
              <div className="flex gap-3 mt-8">
                <button onClick={closeEditPage} className="btn btn-ghost flex-1 rounded-xl">取消</button>
                <button onClick={submitEditPage} className="btn btn-primary flex-1 rounded-xl shadow-lg shadow-primary/20 font-semibold text-base">保存修改</button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ============ MAIN GRID ============
  return (
    <>
      <Toaster richColors position="top-center" toastOptions={{ className: 'shadow-xl rounded-2xl border-2 border-primary/20 backdrop-blur-sm', style: { fontSize: '1rem', padding: '14px 20px', borderRadius: '12px' }, duration: 5000 }} />
      <input ref={keyInputRef} type="file" accept=".pem" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) await onChoosePrivateKey(f); if (e.currentTarget) e.currentTarget.value = '' }} />

      <div className="nav-container min-h-screen bg-base-200/30 -mt-8 pt-8 pb-20 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
        <div className="max-w-7xl mx-auto space-y-8">

          <div className="flex items-center justify-between animate-fade-in-up">
            <div />
            {globalEditMode && (
              <div className="flex gap-3 shrink-0">
                <button onClick={handleCancelGlobal} className="btn btn-sm btn-ghost rounded-xl border bg-base-100/60 font-semibold">取消</button>
                <button onClick={handleImportKey} disabled={isAuth} className={`btn btn-sm rounded-xl font-semibold ${isAuth ? 'btn-ghost text-success' : 'btn-outline'}`}>{isAuth ? '已导入' : '导入密钥'}</button>
                <button onClick={openAddPage} className="btn btn-sm btn-outline gap-1 rounded-xl font-semibold">{svg.plus} 添加</button>
                <button onClick={handleSaveAll} disabled={saving} className="btn btn-sm btn-primary px-6 shadow-lg shadow-primary/20 font-semibold">{saving ? '保存中...' : '保存'}</button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-2xl">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">{svg.search}</div>
              <input type="text" className="block w-full pl-11 pr-4 py-3 bg-base-100 border-none rounded-3xl text-base-content placeholder-base-content/40 focus:ring-2 focus:ring-primary/50 focus:bg-base-100 shadow-sm transition-all duration-300" placeholder="搜索资源..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            {!globalEditMode && (
              <button onClick={handleEnterEditMode} className="btn btn-sm btn-primary gap-2 rounded-xl font-semibold shadow-lg shadow-primary/20 shrink-0">{svg.edit} 编辑</button>
            )}
          </div>

          <div className="flex gap-3 flex-wrap justify-center" id="category-filters">
            <button onClick={() => setActiveFilter('all')} className={`rounded-full duration-300 transition-all hover:-translate-y-0.5 px-5 py-2 text-sm font-semibold hover:shadow-md ${activeFilter === 'all' ? 'bg-primary text-primary-content font-bold shadow-md' : 'text-base-content/60 font-medium bg-base-100 hover:bg-primary/10 hover:text-primary'}`}>全部</button>
            {filterCategories.map(cat => (
              <button key={cat} onClick={() => setActiveFilter(cat)} className={`rounded-full duration-300 transition-all hover:-translate-y-0.5 px-5 py-2 text-sm hover:shadow-md ${activeFilter === cat ? 'bg-primary text-primary-content font-bold shadow-md' : 'text-base-content/60 font-medium bg-base-100 hover:bg-primary/10 hover:text-primary'}`}>{cat}</button>
            ))}
          </div>

          {filteredFlatItems.length === 0 && (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-base-200 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-base-content/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <h3 className="text-lg font-medium text-base-content">未找到相关资源</h3>
              <p className="mt-2 text-base-content/50">请尝试更换关键词或分类</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
            {filteredFlatItems.map(renderCard)}
          </div>

          {navData.length === 0 && !globalEditMode && (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
              <p className="text-base-content/50">还没有导航数据，点击"编辑"开始添加</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
