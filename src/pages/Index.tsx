
import React, { Suspense, lazy } from 'react';
import { AppProvider } from '@/contexts/AppContext';

const LeanDashboard = lazy(() => import('@/components/LeanDashboard').then(module => ({ default: module.LeanDashboard })));

const Index: React.FC = () => {
  return (
    <AppProvider>
      <Suspense fallback={<div className="min-h-screen w-full bg-background" />}>
        <LeanDashboard />
      </Suspense>
    </AppProvider>
  );
};

export default Index;
