import React, { useState } from 'react';

export type ButtonState = 'idle' | 'loading' | 'success' | 'error' | 'disabled';

interface LinearButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  state?: ButtonState;
  onOptimisticAction?: () => Promise<void>;
  tooltipWhenDisabled?: string;
}

export const LinearButton: React.FC<LinearButtonProps> = ({
  children,
  variant = 'primary',
  state = 'idle',
  onOptimisticAction,
  tooltipWhenDisabled,
  onClick,
  ...props
}) => {
  const [internalState, setInternalState] = useState<ButtonState>(state);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (internalState === 'disabled' || internalState === 'loading') return;
    if (onOptimisticAction) {
      setInternalState('loading');
      try {
        await onOptimisticAction();
        setInternalState('success');
        setTimeout(() => setInternalState('idle'), 1200);
      } catch {
        setInternalState('error');
        setTimeout(() => setInternalState('idle'), 2000);
      }
    } else if (onClick) {
      onClick(e);
    }
  };

  const baseStyles = "relative inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]";
  
  const variantStyles = {
    primary: "bg-[oklch(0.62_0.22_265)] text-white hover:bg-[oklch(0.58_0.22_265)] focus-visible:ring-[oklch(0.62_0.22_265)] shadow-sm",
    secondary: "bg-[oklch(0.20_0.02_265)] text-[oklch(0.95_0.01_265)] hover:bg-[oklch(0.25_0.02_265)] border border-[oklch(0.30_0.02_265)]",
    danger: "bg-[oklch(0.60_0.22_25)] text-white hover:bg-[oklch(0.55_0.22_25)] focus-visible:ring-[oklch(0.60_0.22_25)]"
  };

  const isBtnDisabled = internalState === 'disabled' || internalState === 'loading';

  return (
    <div className="relative inline-block group">
      <button
        type="button"
        disabled={isBtnDisabled}
        onClick={handleClick}
        className={`${baseStyles} ${variantStyles[variant]} ${isBtnDisabled ? 'opacity-50 cursor-not-allowed active:scale-100' : ''}`}
        {...props}
      >
        {internalState === 'loading' && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {internalState === 'success' && <span className="mr-1.5 text-emerald-400">✓</span>}
        {internalState === 'error' && <span className="mr-1.5 text-rose-400">✕</span>}
        <span>{children}</span>
      </button>
      {internalState === 'disabled' && tooltipWhenDisabled && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block px-2 py-1 text-xs text-white bg-[oklch(0.12_0.02_265)] rounded border border-[oklch(0.25_0.02_265)] whitespace-nowrap shadow-md pointer-events-none z-50">
          {tooltipWhenDisabled}
        </div>
      )}
    </div>
  );
};
