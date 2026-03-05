import { useState } from 'react';
import { BootPage } from './pages/BootPage';
import { HomePage } from './pages/HomePage';
import { Orb } from './components/Orb';

export function App() {
  const [booted, setBooted] = useState(false);

  if (!booted) {
    return <BootPage onReady={() => setBooted(true)} />;
  }

  return (
    <div className="w-full h-full relative">
      <HomePage />
      <Orb />
    </div>
  );
}
