interface FallbackProps {
  onReload?: () => void;
}

export function ErrorBoundaryFallback({ onReload }: FallbackProps) {
  const reload = onReload ?? (() => window.location.reload());

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-semibold text-on-surface mb-2">
          页面加载出错了
        </h1>
        <p className="text-sm text-on-surface-muted mb-6">
          可能是网络波动或应用已更新，刷新页面即可恢复。
        </p>
        <button
          onClick={reload}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors btn-glow"
        >
          刷新页面
        </button>
      </div>
    </div>
  );
}
