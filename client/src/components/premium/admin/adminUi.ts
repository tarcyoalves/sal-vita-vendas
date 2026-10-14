/** Classes compartilhadas do admin: azul-marinho (#0b1d3a) e dourado (#c9a227) da loja. */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227] focus-visible:ring-offset-2';

const BTN = `inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;

export const btn = {
  primary: `${BTN} bg-[#0b1d3a] hover:bg-[#12306a] text-white`,
  success: `${BTN} bg-emerald-700 hover:bg-emerald-800 text-white`,
  secondary: `${BTN} bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200`,
  danger: `${BTN} bg-rose-700 hover:bg-rose-800 text-white`,
  icon: `inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer ${FOCUS}`,
};

export const INPUT = `w-full min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:border-[#0b1d3a] ${FOCUS}`;
