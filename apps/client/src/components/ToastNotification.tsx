import { useState, useEffect } from 'react';

interface Props {
  agentName: string;
  agentColor: string;
  index: number;
  duration?: number;
  onDismiss: () => void;
}

export function ToastNotification({ agentName, agentColor, index, duration = 4000, onDismiss }: Props) {
  const [isVisible, setIsVisible] = useState(false);

  const dismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300);
  };

  useEffect(() => {
    // Show toast with slight delay for animation
    requestAnimationFrame(() => setIsVisible(true));
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed left-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-primary-light)] text-white rounded-lg border-2 font-semibold drop-shadow-2xl"
      style={{
        top: `${16 + index * 68}px`,
        transform: `translateX(-50%) translateY(${isVisible ? '0' : '-20px'})`,
        opacity: isVisible ? 1 : 0,
        transition: 'all 0.3s ease-out',
        borderColor: agentColor,
        boxShadow: `0 10px 40px -10px rgba(0, 0, 0, 0.5), 0 20px 50px -15px rgba(0, 0, 0, 0.3), 0 0 0 3px ${agentColor}33`,
      }}
    >
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: agentColor }} />
      <span className="text-sm">
        New Agent <span className="font-bold px-1.5 py-0.5 bg-white/20 rounded">"{agentName}"</span> Joined
      </span>
      <button
        onClick={dismiss}
        className="ml-2 text-white hover:text-white/80 transition-colors duration-200 font-bold text-lg leading-none"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
