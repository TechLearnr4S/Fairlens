import React, { Component } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './features/auth/AuthContext';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { AuthLayout } from './components/layout/AuthLayout';
import { DashboardLayout } from './components/layout/DashboardLayout';

import Landing from './pages/public/Landing';
import Login from './pages/public/Login';
import Signup from './pages/public/Signup';
import ForgotPassword from './pages/public/ForgotPassword';

import Dashboard from './pages/private/Dashboard';
import NewAudit from './pages/NewAudit';
import Teams from './pages/private/Teams';
import Passports from './pages/private/Passports';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: any) {
    console.error("App Crash:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-950 min-h-screen text-white relative z-50">
          <h1 className="text-3xl font-bold mb-4">React Fatal Error</h1>
          <pre className="text-red-300 font-mono text-sm whitespace-pre-wrap break-all p-4 bg-black/50 rounded-lg">
            {this.state.error?.toString()}
            {'\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
            </Route>
            <Route path="/landing" element={<Landing />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<DashboardLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/new-audit" element={<NewAudit />} />
                <Route path="/teams" element={<Teams />} />
                <Route path="/passports" element={<Passports />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
