pnpm dev                  # 開發伺服器 (astro dev)
pnpm build                # 完整構建 (型別檢查 → astro build → pagefind 索引 → 複製到 public)
pnpm run search:index     # 首次執行或更新內容後生成搜尋索引 (完整 build + 複製 pagefind)
pnpm run preview          # 本地預覽構建產物 (build + wrangler dev)
pnpm run check            # Astro 型別檢查
pnpm run deploy           # 構建並部署到 Cloudflare (wrangler deploy)
pnpm run cf-typegen       # 生成 Cloudflare Workers 型別
pnpm run prefetch:music   # 預取音樂時長資料
pnpm run search:clean     # 清理搜尋索引
/                      首頁，文章列表分頁 ([...page].astro)
/blog/[slug]           文章詳情
/blog/archives         歸檔頁
/blog/tags / /categories / /search   標籤/分類/搜尋頁
/write                 線上寫作 (React SPA: WritePage.tsx)
/write?slug=xxx        編輯已有文章
/config                視覺化配置管理 (React SPA: ConfigPage.tsx)
/about / /about-edit   關於頁 / 線上編輯
/project / /projects-edit   專案頁 / 線上編輯
/navigation            網站導航
/anime                 追番 (TMDB + Bilibili API)
/album                 相簿
/photo-wall            照片牆
/friend                友鏈
/music                 音樂頁 (Meting 播放器)
