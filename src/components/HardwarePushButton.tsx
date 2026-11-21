import React from 'react';

interface HardwarePushButtonProps {
  label?: string;
  subLabel?: string;
  active?: boolean;
  ledColor?: 'amber' | 'red' | 'cyan' | 'none';
  onClick?: () => void;
  size?: 'xs' | 'sm' | 'md';
  title?: string;
  className?: string;
}

export const HardwarePushButton: React.FC<HardwarePushButtonProps> = ({
  label,
  subLabel,
  active = false,
  ledColor = 'amber',
  onClick,
  size = 'sm',
  title,
  className = '',
}) => {
  const dim =
    size === 'xs'
      ? 'w-6 h-5 text-[8.5px]'
      : size === 'md'
      ? 'w-9 h-7 text-[10px]'
      : 'w-7 h-6 text-[9px]';

  const ledStyle =
    ledColor === 'none'
      ? ''
      : active
      ? ledColor === 'red'
        ? 'bg-rose-500 shadow-[0_0_7px_rgba(244,63,94,0.95)]'
        : ledColor === 'cyan'
        ? 'bg-sky-400 shadow-[0_0_7px_rgba(56,189,248,0.95)]'
        : 'bg-amber-400 shadow-[0_0_7px_rgba(251,191,36,0.95)]'
      : 'bg-[#2a1d19] border border-black/60';

  return (
    <div className={`flex flex-col items-center gap-0.5 select-none ${className}`}>
      {ledColor !== 'none' && (
        <span className={`w-2 h-2 rounded-full transition-all duration-150 ${ledStyle}`} />
      )}
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`audity-key-button ${active ? 'pressed border-sky-400/70' : 'border-black/80'} ${dim} border rounded-[3px] flex items-center justify-center font-mono-tabular font-semibold text-slate-100 hover:brightness-125 focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer transition-all`}
      >
        {label}
      </button>
      {subLabel && (
        <span className="text-[8px] font-semibold tracking-wider text-white/90 uppercase whitespace-nowrap leading-none">
          {subLabel}
        </span>
      )}
    </div>
  );
};
