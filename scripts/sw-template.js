/* ===== 离线 Service Worker 模板（构建期由 vite 插件注入预缓存清单）=====
 * 规则：
 * 1. install 只预缓存核心资源（含带 hash 的 JS/CSS，不含音乐等大文件），任何情况下都不 skipWaiting；
 * 2. 只有收到页面 SKIP_WAITING 消息（玩家点了“保存并更新”）才允许 skipWaiting；
 * 3. 只有收到新页面 CORE_READY 消息（核心资源加载成功）才允许删除旧缓存；
 * 4. activate 里 clients.claim()；
 * 5. fetch 缓存优先，断网时导航请求兜底到缓存的 index.html。
 */
const CACHE_NAME = '__CACHE_NAME__';
const CORE_ASSETS = __CORE_ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch((err) => {
        console.error('[SW] 预缓存失败：', err);
      })
  );
  // 任何情况下都不调用 self.skipWaiting()
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  // 旧缓存删除不在此处进行：只允许在收到 CORE_READY 后删除
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    // 玩家点了“保存并更新”→ 才允许新 SW 接管
    self.skipWaiting();
  } else if (data.type === 'CORE_READY') {
    // 新页面核心资源加载成功 → 才允许删除旧缓存
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // 导航请求：缓存优先；断网时兜底到缓存的 index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
            return res;
          })
          .catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // 其余 GET：缓存优先，未命中才走网络，并把可用资源顺手缓存
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (!res || !res.ok) return res;
          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          if (contentType.startsWith('audio/') || contentType.startsWith('video/')) {
            return res; // 大媒体文件不参与缓存，避免撑爆离线缓存
          }
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => {
          if (request.destination === 'document') return caches.match('./index.html');
          return undefined;
        });
    })
  );
});
