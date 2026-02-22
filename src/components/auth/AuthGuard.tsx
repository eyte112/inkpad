import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loading } from '@/components/ui';
import { authApi } from '@/services/auth';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const location = useLocation();
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated' | 'no-setup'>('loading');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const [setupResult, verifyResult] = await Promise.all([
        authApi.checkSetup(),
        authApi.verify().catch(() => ({ valid: false })),
      ]);
      if (!setupResult.hasSetup) {
        setStatus('no-setup');
        return;
      }
      setStatus(verifyResult.valid ? 'authenticated' : 'unauthenticated');
    } catch {
      setStatus('unauthenticated');
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (status === 'no-setup') {
    return <Navigate to="/setup" state={{ from: location }} replace />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
