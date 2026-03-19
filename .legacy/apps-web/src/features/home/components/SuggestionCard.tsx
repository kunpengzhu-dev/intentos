import { motion } from 'framer-motion';

export type SuggestionMock =
  | {
      kind: 'morning';
      title: string;
      message: string;
    }
  | {
      kind: 'focus';
      title: string;
      message: string;
      imageUrl: string;
    }
  | {
      kind: 'note';
      title: string;
      message: string;
    }
  | {
      kind: 'game';
      title: string;
      message: string;
      imageUrl: string;
    }
  | {
      kind: 'meeting';
      title: string;
      message: string;
    }
  | {
      kind: 'show';
      title: string;
      message: string;
      imageUrl: string;
    };

type SuggestionCardProps = {
  mock: SuggestionMock;
  onClick: () => void;
};

const layoutClassName: Record<SuggestionMock['kind'], string> = {
  morning: 'md:col-span-2 bg-linear-to-br from-white/60 to-white/30',
  focus: 'bg-black',
  note: 'bg-[#FDFCF8]',
  game: 'bg-indigo-900',
  meeting: 'bg-white',
  show: 'md:col-span-2 bg-zinc-900',
};

export function SuggestionCard({ mock, onClick }: SuggestionCardProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.01, y: -3 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[2rem] border border-white/70 text-left shadow-[0_20px_40px_rgba(148,163,184,0.14)] transition-all duration-300 ${layoutClassName[mock.kind]}`}
    >
      {mock.kind === 'morning' && (
        <div className="flex h-full flex-col justify-between bg-linear-to-br from-white/65 to-white/35 p-8 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-3xl font-light text-slate-800">Good Morning, Jason</h3>
              <p className="mt-2 text-sm font-medium text-slate-500">You have 3 meetings before 1 PM.</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 text-2xl text-yellow-600">☀</div>
          </div>
          <div className="mt-4 flex gap-3">
            <div className="rounded-full bg-white/55 px-4 py-2 text-xs font-semibold text-slate-600">10% Rain</div>
            <div className="rounded-full bg-white/55 px-4 py-2 text-xs font-semibold text-slate-600">First meeting in 35m</div>
          </div>
        </div>
      )}

      {mock.kind === 'focus' && (
        <>
          <img src={mock.imageUrl} alt={mock.title} className="absolute inset-0 h-full w-full object-cover opacity-65 transition duration-500 group-hover:opacity-50" />
          <div className="absolute inset-0 bg-black/18" />
          <div className="relative flex h-full flex-col justify-between p-6">
            <div className="flex items-start justify-between">
              <span className="rounded bg-white/20 px-2 py-1 text-[10px] font-bold tracking-wider text-white backdrop-blur-md">SPOTIFY</span>
              <span className="text-lg text-emerald-400">◔</span>
            </div>
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-base text-black shadow-lg transition group-hover:scale-110">▶</div>
              <h3 className="text-lg font-medium text-white">{mock.title}</h3>
              <p className="mt-1 text-xs text-white/70">Ambient • 2hr</p>
            </div>
          </div>
        </>
      )}

      {mock.kind === 'note' && (
        <div className="flex h-full flex-col bg-[#FDFCF8] p-6 transition-colors group-hover:bg-[#fff9c4]">
          <div className="mb-auto flex items-start justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">✎</div>
            <span className="text-lg text-slate-300 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-slate-500">↗</span>
          </div>
          <div>
            <h3 className="text-lg font-medium text-slate-800">{mock.title}</h3>
            <p className="mt-1 text-xs text-slate-400">Capture thoughts...</p>
          </div>
          <div className="mt-4 space-y-2 opacity-35">
            <div className="h-1 w-full rounded-full bg-slate-300" />
            <div className="h-1 w-2/3 rounded-full bg-slate-300" />
          </div>
        </div>
      )}

      {mock.kind === 'game' && (
        <>
          <div className="absolute inset-0 bg-indigo-950" />
          <div className="absolute inset-0 bg-linear-to-br from-purple-500/25 to-blue-600/25 mix-blend-overlay" />
          <img src={mock.imageUrl} alt={mock.title} className="absolute inset-0 h-full w-full object-cover opacity-60 transition duration-700 group-hover:scale-110" />
          <div className="relative flex h-full flex-col justify-between p-6">
            <div className="flex items-start justify-between">
              <span className="rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-bold tracking-wider text-white backdrop-blur-md">STEAM</span>
              <span className="text-lg text-white/80">🎮</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{mock.title}</h3>
              <p className="mt-1 text-xs text-white/65">125h played</p>
            </div>
          </div>
        </>
      )}

      {mock.kind === 'meeting' && (
        <div className="flex h-full flex-col border-l-4 border-l-rose-400 bg-white p-6">
          <div className="mb-auto flex items-start justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-500">▣</div>
            <span className="text-lg text-slate-300">⋯</span>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-rose-500">In 30 min</div>
            <h3 className="text-lg font-medium leading-tight text-slate-800">{mock.title}</h3>
          </div>
          <div className="mt-4 flex -space-x-2">
            <div className="h-6 w-6 rounded-full border border-white bg-slate-100" />
            <div className="h-6 w-6 rounded-full border border-white bg-slate-200" />
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white bg-slate-300 text-[8px] font-medium text-slate-600">+2</div>
          </div>
        </div>
      )}

      {mock.kind === 'show' && (
        <>
          <div className="absolute inset-0 bg-zinc-900" />
          <img src={mock.imageUrl} alt={mock.title} className="absolute inset-0 h-full w-full object-cover opacity-60 transition duration-500 group-hover:opacity-40" />
          <div className="relative flex h-full flex-col justify-between p-8">
            <div className="flex items-start justify-between">
              <span className="rounded border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-bold tracking-wider text-white backdrop-blur-md">PRIME</span>
              <span className="text-lg text-white/70">◫</span>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-300">New Season</span>
                </div>
                <h3 className="text-3xl leading-none font-serif italic text-white">{mock.title}</h3>
                <p className="mt-1 text-sm text-white/65">Season 2</p>
              </div>
              <div className="rounded-full bg-white px-6 py-2 text-sm font-medium text-black transition group-hover:bg-slate-200">Resume</div>
            </div>
          </div>
        </>
      )}
    </motion.button>
  );
}
