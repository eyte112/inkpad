import { ReactNode, useState } from 'react';
import { cn } from '@/utils/helpers';
import { Menu, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/hooks';

export interface LayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
}

export function Layout({ children, sidebar }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {sidebar && (
        <aside
          className={cn(
            'fixed lg:sticky top-0 left-0 z-50 lg:z-0',
            'w-64 h-screen',
            'bg-surface-menu backdrop-blur-xl',
            'border-r border-border',
            'transform transition-transform duration-300',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          )}
        >
          {sidebar}
        </aside>
      )}

      {/* Main content */}
      <main className="flex-1 min-h-screen">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 lg:hidden h-14 px-4 flex items-center gap-4 bg-surface-header backdrop-blur-xl border-b border-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-xl hover:bg-surface-card transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-on-surface flex-1">
            InkPad
          </span>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl hover:bg-surface-card transition-colors cursor-pointer"
            title={theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'}
          >
            <ThemeIcon className="w-5 h-5" />
          </button>
        </header>

        {children}
      </main>
    </div>
  );
}
