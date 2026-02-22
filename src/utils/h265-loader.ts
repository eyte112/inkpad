// h265web.js 动态加载器 - 多源容错
const CDN_SOURCES = [
  '/h265',  // 本地优先
  'https://cdn.jsdelivr.net/gh/numberwolf/h265web.js@master/dist',
  'https://raw.githubusercontent.com/numberwolf/h265web.js/master/dist',
];
const FILES = ['missile.js', 'h265webjs-v20221106.js'];

let loadPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function tryLoadFromCDN(base: string): Promise<void> {
  for (const file of FILES) await loadScript(`${base}/${file}`);
}

export async function loadH265Player(): Promise<void> {
  if ((window as any).new265webjs) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    for (const cdn of CDN_SOURCES) {
      try {
        await tryLoadFromCDN(cdn);
        if ((window as any).new265webjs) return;
      } catch { /* try next */ }
    }
    throw new Error('所有 CDN 源加载失败');
  })();
  return loadPromise.catch(e => { loadPromise = null; throw e; });
}

// 开源版固定 token
export const H265_TOKEN = 'base64:QXV0aG9yOmNoYW5neWFubG9uZ3xudW1iZXJ3b2xmLEdpdGh1YjpodHRwczovL2dpdGh1Yi5jb20vbnVtYmVyd29sZixFbWFpbDpwb3JzY2hlZ3QyM0Bmb3htYWlsLmNvbSxRUTo1MzEzNjU4NzIsSG9tZVBhZ2U6aHR0cDovL3h2aWRlby52aWRlbyxEaXNjb3JkOm51bWJlcndvbGYjODY5NCx3ZWNoYXI6bnVtYmVyd29sZjExLEJlaWppbmcsV29ya0luOkJhaWR1';
