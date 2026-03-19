import type { HTMLAttributes } from 'react';
import { mercury } from '../../tokens/mercury.js';

type AppBackdropProps = HTMLAttributes<HTMLDivElement> & {
  backgroundImageUrl?: string;
};

export function AppBackdrop({ className = '', backgroundImageUrl, ...props }: AppBackdropProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`.trim()} {...props}>
      {backgroundImageUrl ? (
        <>
          <div className="absolute inset-0" style={{ background: mercury.canvas.base }} />
          <img src={backgroundImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-white/18" />
        </>
      ) : (
        <>
          <div className="absolute inset-0" style={{ background: mercury.canvas.base }} />
          <div className="absolute inset-x-0 top-0 h-40" style={{ background: `linear-gradient(to bottom, ${mercury.canvas.topGlow}, transparent)` }} />
          <div className="absolute -left-24 top-[-10%] h-[38rem] w-[38rem] rounded-full blur-[120px]" style={{ background: mercury.canvas.roseGlow }} />
          <div className="absolute right-[-12%] top-[8%] h-[34rem] w-[34rem] rounded-full blur-[120px]" style={{ background: mercury.canvas.skyGlow }} />
          <div className="absolute bottom-[-22%] left-[22%] h-[30rem] w-[30rem] rounded-full blur-[110px]" style={{ background: mercury.canvas.violetGlow }} />
        </>
      )}
    </div>
  );
}
