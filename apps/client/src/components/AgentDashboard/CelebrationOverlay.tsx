const SPARK_EMOJIS = ['✨', '⭐', '💫', '🌟', '✨', '💥', '⭐', '✨'];

function sparkEmoji(i: number): string {
  return SPARK_EMOJIS[(i - 1) % SPARK_EMOJIS.length];
}

function sparkStyle(i: number): React.CSSProperties {
  return {
    ['--angle' as string]: `${((i - 1) / 22) * 360}deg`,
    ['--dist' as string]: `${55 + ((i - 1) % 4) * 22}px`,
    ['--size' as string]: `${11 + ((i - 1) % 3) * 5}px`,
    animationDelay: `${((i - 1) % 6) * 0.08}s`,
    ['--dur' as string]: `${1.4 + ((i - 1) % 3) * 0.25}s`,
  };
}

export function CelebrationOverlay() {
  return (
    <div className="celebrate-overlay">
      {Array.from({ length: 22 }, (_, i) => i + 1).map(i => (
        <span key={i} className="spark" style={sparkStyle(i)}>
          {sparkEmoji(i)}
        </span>
      ))}
      <div className="burst-ring ring-1" />
      <div className="burst-ring ring-2" />
      <div className="burst-ring ring-3" />
    </div>
  );
}
