import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { Providers } from './providers';
import { ToastContainer } from '@/components/ui';
import { useTheme } from '@/hooks';

export function App() {
  useTheme();

  return (
    <Providers>
      <div className="bg-decor">
        <span className="blob-1" />
        <span className="blob-2" />
        <span className="blob-3" />
      </div>
      <RouterProvider router={router} />
      <ToastContainer />
    </Providers>
  );
}
