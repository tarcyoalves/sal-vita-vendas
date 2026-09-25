import { Info } from 'lucide-react';
import { RADAR_SEGMENTS, type RadarSegmentKey } from '../../../../shared/radar';

/** Chips de segmento (CNAE) para marcar quais tipos de empresa entram na busca. */
export function SegmentChips({
  selected,
  onChange,
  disabled,
}: {
  selected: RadarSegmentKey[];
  onChange: (segments: RadarSegmentKey[]) => void;
  disabled?: boolean;
}) {
  const toggle = (key: RadarSegmentKey) => {
    onChange(selected.includes(key) ? selected.filter((s) => s !== key) : [...selected, key]);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {RADAR_SEGMENTS.map((seg) => {
          const on = selected.includes(seg.key);
          const isPetHint = seg.key === 'racao_varejo';
          return (
            <button
              key={seg.key}
              type="button"
              disabled={disabled}
              onClick={() => toggle(seg.key)}
              title={isPetHint ? 'Costuma trazer pet shop' : undefined}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                on
                  ? 'bg-blue-900 text-white border-blue-900'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {seg.label}
              {isPetHint && <Info size={12} className={on ? 'text-blue-200' : 'text-slate-400'} />}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 flex items-center gap-1">
        <Info size={11} className="shrink-0" />
        "Varejo de rações / pet" costuma trazer pet shop, não só distribuidor de sal.
      </p>
    </div>
  );
}
