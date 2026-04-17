import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { PageLoader } from '../../components/ui/Loader';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/landing" replace />;
  }

  return <Outlet />;
}
