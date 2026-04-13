import React, { useEffect, useRef } from 'react';

interface ChartPoint {
  time: number;
  price: number;
}

interface PriceChartProps {
  data: ChartPoint[];
  pair: string;
  height?: number;
  showGrid?: boolean;
}

export const PriceChart: React.FC<PriceChartProps> = ({ data, pair, height = 200, showGrid = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Clear
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, w, h);

    const prices = data.map(d => d.price);
    const minPrice = Math.min(...prices) * 0.9995;
    const maxPrice = Math.max(...prices) * 1.0005;
    const priceRange = maxPrice - minPrice;

    // Grid
    if (showGrid) {
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();

        const price = maxPrice - (priceRange * i) / 4;
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`$${price.toFixed(2)}`, w - padding.right + 5, y + 3);
      }
    }

    // Price line
    const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    gradient.addColorStop(0, 'rgba(0, 240, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 240, 255, 0)');

    ctx.beginPath();
    data.forEach((point, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartW;
      const y = padding.top + ((maxPrice - point.price) / priceRange) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    // Fill area
    ctx.lineTo(padding.left + chartW, h - padding.bottom);
    ctx.lineTo(padding.left, h - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    data.forEach((point, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartW;
      const y = padding.top + ((maxPrice - point.price) / priceRange) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Current price dot
    const lastPoint = data[data.length - 1];
    const lastX = padding.left + chartW;
    const lastY = padding.top + ((maxPrice - lastPoint.price) / priceRange) * chartH;
    
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00F0FF';
    ctx.fill();

    // Pair label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(pair, padding.left, 14);

  }, [data, pair, height, showGrid]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${height}px` }}
      className="rounded-lg"
    />
  );
};
