import { useEffect, useRef } from 'react';

export function MatrixRain({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const CHAR_SIZE = 14;
    const CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ'.split('');
    let cols: { y: number; speed: number; glowLen: number; chars: string[] }[] = [];

    const init = () => {
      const W = canvas.width = canvas.offsetWidth;
      const H = canvas.height = canvas.offsetHeight;
      const colCount = Math.floor(W / CHAR_SIZE);
      cols = Array.from({ length: colCount }, () => ({
        y: Math.random() * -H,
        speed: 1.5 + Math.random() * 3,
        glowLen: 4 + Math.floor(Math.random() * 8),
        chars: Array.from({ length: Math.ceil(H / CHAR_SIZE) + 20 }, () =>
          CHARS[Math.floor(Math.random() * CHARS.length)]
        ),
      }));
    };

    init();
    const ro = new ResizeObserver(init);
    ro.observe(canvas);

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      cols.forEach((col, i) => {
        const x = i * CHAR_SIZE;
        const headRow = Math.floor(col.y / CHAR_SIZE);

        for (let j = 0; j < col.glowLen + 1; j++) {
          const row = headRow - j;
          if (row < 0) continue;
          const y = row * CHAR_SIZE;
          if (y > H) continue;
          const ch = col.chars[row % col.chars.length];

          if (j === 0) {
            ctx.fillStyle = '#ccffcc';
            ctx.shadowColor = '#00ff41';
            ctx.shadowBlur = 8;
          } else {
            const fade = 1 - j / (col.glowLen + 1);
            const alpha = fade * 0.85;
            ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
            ctx.shadowColor = `rgba(0, 255, 65, ${fade * 0.6})`;
            ctx.shadowBlur = 4;
          }

          if (Math.random() < 0.02) {
            col.chars[row % col.chars.length] = CHARS[Math.floor(Math.random() * CHARS.length)];
          }

          ctx.font = `${CHAR_SIZE}px monospace`;
          ctx.fillText(ch, x, y + CHAR_SIZE);
        }

        ctx.shadowBlur = 0;
        col.y += col.speed;
        if (col.y - col.glowLen * CHAR_SIZE > H) {
          col.y = Math.random() * -CHAR_SIZE * 10;
          col.speed = 1.5 + Math.random() * 3;
          col.glowLen = 4 + Math.floor(Math.random() * 8);
        }
      });

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [active]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="matrix-rain-canvas" />;
}
