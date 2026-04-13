import React, { useRef, useEffect } from 'react';
import { GasHistory } from '@/lib/web3/gasOptimizer';

interface Props {
  history: GasHistory;
  height?: number;
}

export const GasHistoryChart: React.FC<Props> = ({ history, height = 180 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const h = canvas.height;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = h - padding * 2;

    ctx.clearRect(0, 0, width, h);

    const prices = history.prices.slice(-144); // Last 12 hours (5-min intervals)
    if (prices.length === 0) return;

    const maxFee = Math.max(...prices.map(p => p.baseFee)) * 1.1;
    const minFee = Math.min(...prices.map(p => p.baseFee)) * 0.9;

    // Draw grid
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      
      const fee = maxFee - ((maxFee - minFee) / 4) * i;
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '10px sans-serif';
      ctx.fillText(fee.toFixed(1), 5, y + 4);
    }

    // Draw area fill
    const gradient = ctx.createLinearGradient(0, padding, 0, h - padding);
    gradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(padding, h - padding);
    prices.forEach((p, i) => {
      const x = padding + (chartWidth / (prices.length - 1)) * i;
      const y = padding + chartHeight - ((p.baseFee - minFee) / (maxFee - minFee)) * chartHeight;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(padding + chartWidth, h - padding);
    ctx.closePath();
    ctx.fill();

    // Draw line
    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    prices.forEach((p, i) => {
      const x = padding + (chartWidth / (prices.length - 1)) * i;
      const y = padding + chartHeight - ((p.baseFee - minFee) / (maxFee - minFee)) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw average line
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    const avgY = padding + chartHeight - ((history.avgBaseFee - minFee) / (maxFee - minFee)) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding, avgY);
    ctx.lineTo(width - padding, avgY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = '#F59E0B';
    ctx.font = '10px sans-serif';
    ctx.fillText(`Avg: ${history.avgBaseFee.toFixed(1)}`, width - padding - 50, avgY - 5);
  }, [history]);

  return (
    <canvas
      ref={canvasRef}
      width={500}
      height={height}
      className="w-full"
      style={{ maxHeight: height }}
    />
  );
};
