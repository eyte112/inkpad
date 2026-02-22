import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Loading } from '@/components/ui';
import { AuthGuard } from '@/components/auth';
import { ErrorBoundaryFallback } from '@/components/ErrorBoundary';

// 判断是否为动态导入 chunk 加载失败
function isChunkLoadError(err: unknown): boolean {
  if (err instanceof TypeError && /dynamically imported module|Failed to fetch|Loading chunk/.test(err.message)) {
    return true;
  }
  return err instanceof Error && err.name === 'ChunkLoadError';
}

// 动态导入失败时自动刷新页面加载最新版本（仅针对 chunk 加载错误）
function lazyWithRetry<T extends React.ComponentType>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory().catch((err) => {
      if (!isChunkLoadError(err)) throw err;

      const lastRetry = sessionStorage.getItem('chunk_last_retry');
      // 10 秒内已刷新过则不再重复刷新，防止循环
      if (lastRetry && Date.now() - Number(lastRetry) < 10000) {
        sessionStorage.removeItem('chunk_last_retry');
        throw err;
      }
      sessionStorage.setItem('chunk_last_retry', String(Date.now()));
      window.location.reload();
      return new Promise<never>(() => {});
    })
  );
}

// 懒加载页面组件
const HomePage = lazyWithRetry(() => import('@/pages/HomePage').then(m => ({ default: m.HomePage })));
const EditorPage = lazyWithRetry(() => import('@/pages/EditorPage').then(m => ({ default: m.EditorPage })));
const SharePage = lazyWithRetry(() => import('@/pages/SharePage').then(m => ({ default: m.SharePage })));
const LoginPage = lazyWithRetry(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })));
const SetupPage = lazyWithRetry(() => import('@/pages/SetupPage').then(m => ({ default: m.SetupPage })));
const ImagesPage = lazyWithRetry(() => import('@/pages/ImagesPage').then(m => ({ default: m.ImagesPage })));

// 加载中组件
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loading />
    </div>
  );
}

// 懒加载包装器
function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

// 需要认证的页面包装器
function ProtectedPage({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <LazyPage>{children}</LazyPage>
    </AuthGuard>
  );
}

export const router = createBrowserRouter([
  {
    errorElement: <ErrorBoundaryFallback />,
    children: [
      // 公开路由
      {
        path: '/login',
        element: <LazyPage><LoginPage /></LazyPage>,
      },
      {
        path: '/setup',
        element: <LazyPage><SetupPage /></LazyPage>,
      },
      {
        path: '/s/:slug',
        element: <LazyPage><SharePage /></LazyPage>,
      },
      // 需要认证的路由
      {
        path: '/',
        element: <ProtectedPage><HomePage /></ProtectedPage>,
      },
      {
        path: '/note/new',
        element: <ProtectedPage><EditorPage /></ProtectedPage>,
      },
      {
        path: '/note/:id',
        element: <ProtectedPage><EditorPage /></ProtectedPage>,
      },
      {
        path: '/images',
        element: <ProtectedPage><ImagesPage /></ProtectedPage>,
      },
    ],
  },
]);
