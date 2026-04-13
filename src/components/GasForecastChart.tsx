import React, { useRef, useEffect } from 'react';
import { BaseFeePredict } from '@/lib/web3/gasForecastService';

interface Props {
  forecast: BaseFeePredict;
  height?: number;
}

export const GasForecastChart: React.FC<Props> = ({ forecast, height = 200 }) => {
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

    // Get data points including current
    const points = [
      { time: new Date(), baseFee: forecast.currentBaseFee, confidence: 1 },
      ...forecast.predictions,
    ];

    const maxFee = Math.max(...points.map(p => p.baseFee)) * 1.1;
    const minFee = Math.min(...points.map(p => p.baseFee)) * 0.9;

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

    // Draw confidence band
    ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padding + (chartWidth / (points.length - 1)) * i;
      const yBase = padding + chartHeight - ((p.baseFee - minFee) / (maxFee - minFee)) * chartHeight;
      const band = (1 - p.confidence) * 30;
      if (i === 0) ctx.moveTo(x, yBase - band);
      else ctx.lineTo(x, yBase - band);
    });
    [...points].reverse().forEach((p, i) => {
      const x = padding + (chartWidth / (points.length - 1)) * (points.length - 1 - i);
      const yBase = padding + chartHeight - ((p.baseFee - minFee) / (maxFee - minFee)) * chartHeight;
      const band = (1 - p.confidence) * 30;
      ctx.lineTo(x, yBase + band);
    });
    ctx.closePath();
    ctx.fill();

    // Draw forecast line
    const gradient = ctx.createLinearGradient(padding, 0, width - padding, 0);
    gradient.addColorStop(0, '#00F0FF');
    gradient.addColorStop(1, '#8B5CF6');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padding + (chartWidth / (points.length - 1)) * i;
      const y = padding + chartHeight - ((p.baseFee - minFee) / (maxFee - minFee)) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw time labels
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '10px sans-serif';
    points.forEach((p, i) => {
      if (i % 2 === 0) {
        const x = padding + (chartWidth / (points.length - 1)) * i;
        const label = p.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        ctx.fillText(label, x - 15, h - 10);
      }
    });
  }, [forecast]);

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
