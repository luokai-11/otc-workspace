/* ============================================
 * OTC医药销售AI工作台 - Service Worker
 * 功能：离线缓存、资源预缓存、更新检测
 * ============================================ */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `otc-workbox-${CACHE_VERSION}`;

// 预缓存资源列表 - PWA首次安装时缓存
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// ============== 安装阶段：预缓存核心资源 ==============
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 预缓存核心资源:', PRECACHE_URLS);
        // 使用 addAll 失败时回退到逐个添加，避免单个资源失败导致全部失败
        return Promise.all(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => {
              console.warn('[SW] 预缓存跳过（可忽略）:', url, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] 安装完成，强制激活新版本');
        return self.skipWaiting(); // 立即激活，不等待旧SW停止
      })
  );
});

// ============== 激活阶段：清理旧缓存 ==============
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] 清理旧缓存:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] 激活完成，接管所有客户端');
        return self.clients.claim(); // 立即接管所有页面
      })
  );
});

// ============== 请求拦截：缓存优先策略 ==============
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理同源请求，避免拦截第三方API
  if (url.origin !== self.location.origin) {
    return;
  }

  // 只处理 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  // HTML文档：网络优先，失败则回退缓存（确保用户看到最新内容）
  if (request.mode === 'navigate' ||
      request.destination === 'document' ||
      url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 成功则更新缓存
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // 离线时返回缓存中的 index.html
          return caches.match(request).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // 静态资源（JS/CSS/图片/图标/JSON）：缓存优先，后台更新
  const staticExts = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.json', '.woff', '.woff2', '.ttf'];
  const isStatic = staticExts.some(ext => url.pathname.toLowerCase().endsWith(ext)) ||
                   request.destination === 'image' ||
                   request.destination === 'style' ||
                   request.destination === 'script' ||
                   request.destination === 'font' ||
                   request.destination === 'manifest';

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // 命中缓存，同时后台更新（stale-while-revalidate）
          fetch(request).then((response) => {
            if (response && response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
          }).catch(() => {}); // 网络更新失败不影响用户
          return cached;
        }
        // 未命中缓存，从网络获取并缓存
        return fetch(request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        }).catch(() => {
          // 图标请求失败时，返回一个简单的占位SVG（避免图标缺失）
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="#2563eb" width="192" height="192" rx="32"/><text x="96" y="115" font-family="sans-serif" font-size="72" font-weight="bold" fill="white" text-anchor="middle">999</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
          return Response.error();
        });
      })
    );
    return;
  }

  // 其他请求：网络优先，失败回退缓存
  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ============== 消息处理：手动触发更新 ==============
self.addEventListener('message', (event) => {
  const { type } = event.data || {};

  if (type === 'SKIP_WAITING') {
    console.log('[SW] 收到跳过等待指令，立即激活');
    self.skipWaiting();
  }

  if (type === 'GET_VERSION') {
    event.source.postMessage({
      type: 'VERSION',
      version: CACHE_VERSION,
      cacheName: CACHE_NAME
    });
  }

  if (type === 'CLEAR_CACHE') {
    caches.keys().then(names => {
      return Promise.all(names.map(n => caches.delete(n)));
    }).then(() => {
      event.source.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
});

// ============== 推送通知（预留接口） ==============
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const title = data.title || 'OTC工作台通知';
    const options = {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: data.data || {},
      tag: data.tag || 'otc-notification',
      renotify: true
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data.url || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

console.log('[SW] Service Worker 脚本已加载 v' + CACHE_VERSION);
