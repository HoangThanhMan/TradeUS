'use client';

import React, { useEffect, useRef } from 'react';

export default function CryptoGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 400;
    canvas.width = size;
    canvas.height = size;

    let rotation = 0;

    // Crypto coin symbols
    const cryptoCoins = ['₿', 'Ξ', '◊', '₮', '◈'];

    // Blockchain blocks data with golden color
    const blocks = Array.from({ length: 8 }, (_, i) => ({
      angle: (i * Math.PI * 2) / 8,
      height: Math.random() * 0.5 + 0.5,
      color: `hsl(45, 95%, ${50 + i * 3}%)`,
    }));

    function drawGlobe() {
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 140;

      // Draw outer glow (golden/teal theme matching TradeX)
      const glowGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        radius * 0.8,
        centerX,
        centerY,
        radius * 1.5,
      );
      glowGradient.addColorStop(0, 'rgba(234, 179, 8, 0.15)');
      glowGradient.addColorStop(0.5, 'rgba(234, 179, 8, 0.08)');
      glowGradient.addColorStop(1, 'rgba(234, 179, 8, 0)');

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = glowGradient;
      ctx.fill();

      // Draw main globe sphere with dark blue gradient matching design
      const gradient = ctx.createRadialGradient(
        centerX - radius * 0.3,
        centerY - radius * 0.3,
        radius * 0.1,
        centerX,
        centerY,
        radius,
      );
      gradient.addColorStop(0, '#1e3a5f');
      gradient.addColorStop(0.5, '#152840');
      gradient.addColorStop(1, '#0a1929');

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw blockchain network lines (teal/cyan grid)
      ctx.strokeStyle = 'rgba(20, 184, 166, 0.25)';
      ctx.lineWidth = 1.5;

      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI) / 6 + rotation;

        ctx.beginPath();
        for (let j = 0; j <= 50; j++) {
          const t = (j / 50) * Math.PI;
          const x = centerX + radius * Math.sin(t) * Math.cos(angle);
          const y = centerY + radius * Math.cos(t);
          const z = radius * Math.sin(t) * Math.sin(angle);

          if (z > -radius * 0.3) {
            const alpha = (z + radius) / (2 * radius);
            ctx.strokeStyle = `rgba(20, 184, 166, ${alpha * 0.35})`;

            if (j === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      }

      // Draw latitude lines (teal grid lines)
      ctx.strokeStyle = 'rgba(20, 184, 166, 0.2)';
      ctx.lineWidth = 1;

      for (let i = -2; i <= 2; i++) {
        const y = centerY + (i * radius) / 3;
        const latRadius = Math.sqrt(
          Math.max(0, radius * radius - Math.pow((i * radius) / 3, 2)),
        );

        ctx.beginPath();
        ctx.ellipse(centerX, y, latRadius, latRadius * 0.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const time = Date.now() / 1000;

      // Draw blockchain blocks around the globe
      blocks.forEach((block, i) => {
        const angle = block.angle + rotation * 0.5;
        const elevation = Math.sin(time * 0.5 + i) * 0.3;

        const x = centerX + (radius + 25) * Math.cos(angle);
        const y = centerY + (radius + 25) * Math.sin(angle) + elevation * 20;
        const z = Math.sin(angle + rotation) * radius * 0.5;

        if (z > -radius * 0.3) {
          const alpha = (z + radius) / (2 * radius);
          const blockSize = 12 * block.height * alpha;

          // Draw block shadow
          ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.3})`;
          ctx.fillRect(
            x - blockSize / 2 + 2,
            y - blockSize / 2 + 2,
            blockSize,
            blockSize,
          );

          // Draw block
          ctx.fillStyle = block.color.replace('60%', `${60 * alpha}%`);
          ctx.fillRect(
            x - blockSize / 2,
            y - blockSize / 2,
            blockSize,
            blockSize,
          );

          // Draw block border
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(
            x - blockSize / 2,
            y - blockSize / 2,
            blockSize,
            blockSize,
          );

          // Draw connecting line to globe
          ctx.beginPath();
          ctx.strokeStyle = `rgba(234, 179, 8, ${alpha * 0.25})`;
          ctx.lineWidth = 1;
          const globeX = centerX + radius * Math.cos(angle);
          const globeY = centerY + radius * Math.sin(angle);
          ctx.moveTo(globeX, globeY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      });

      // Draw crypto coins as trading nodes
      const numCoins = 15;
      for (let i = 0; i < numCoins; i++) {
        const angle1 = (i * Math.PI * 2) / numCoins + rotation * 1.5;
        const angle2 = Math.sin(time * 0.8 + i * 0.5) * 0.6;

        const x = centerX + radius * 0.98 * Math.cos(angle2) * Math.cos(angle1);
        const y = centerY + radius * 0.98 * Math.cos(angle2) * Math.sin(angle1);
        const z = radius * 0.98 * Math.sin(angle2);

        if (z > -radius * 0.4) {
          const alpha = (z + radius) / (2 * radius);
          const coinSize = 8 + alpha * 6;
          const pulse = 0.6 + 0.4 * Math.sin(time * 3 + i);

          // Draw coin circle with golden gradient
          ctx.beginPath();
          ctx.arc(x, y, coinSize, 0, Math.PI * 2);
          const coinGradient = ctx.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            coinSize,
          );
          coinGradient.addColorStop(0, `rgba(234, 179, 8, ${alpha * pulse})`);
          coinGradient.addColorStop(
            1,
            `rgba(202, 138, 4, ${alpha * pulse * 0.6})`,
          );
          ctx.fillStyle = coinGradient;
          ctx.fill();

          // Add coin border
          ctx.strokeStyle = `rgba(250, 204, 21, ${alpha * 0.8})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Draw coin symbol
          ctx.fillStyle = `rgba(15, 23, 42, ${alpha * 0.9})`;
          ctx.font = `bold ${coinSize * 1.2}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cryptoCoins[i % cryptoCoins.length], x, y);

          // Draw glow
          const glowRadius = coinSize * 2.5;
          const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
          glow.addColorStop(0, `rgba(234, 179, 8, ${alpha * pulse * 0.4})`);
          glow.addColorStop(1, 'rgba(234, 179, 8, 0)');

          ctx.beginPath();
          ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }
      }

      // Draw mini trading charts
      const numCharts = 6;
      for (let i = 0; i < numCharts; i++) {
        const chartAngle = (i * Math.PI * 2) / numCharts + rotation * 0.3;
        const chartDist = radius * 1.35;
        const chartX = centerX + chartDist * Math.cos(chartAngle);
        const chartY = centerY + chartDist * Math.sin(chartAngle);
        const z = Math.sin(chartAngle + rotation) * radius;

        if (z > -radius * 0.2) {
          const alpha = (z + radius) / (2 * radius);
          const chartWidth = 30 * alpha;
          const chartHeight = 20 * alpha;

          // Draw chart background with dark blue
          ctx.fillStyle = `rgba(15, 23, 42, ${alpha * 0.9})`;
          ctx.fillRect(
            chartX - chartWidth / 2,
            chartY - chartHeight / 2,
            chartWidth,
            chartHeight,
          );

          // Draw chart border with teal/golden
          ctx.strokeStyle = `rgba(20, 184, 166, ${alpha * 0.5})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(
            chartX - chartWidth / 2,
            chartY - chartHeight / 2,
            chartWidth,
            chartHeight,
          );

          // Draw simple line chart
          ctx.beginPath();
          ctx.strokeStyle =
            i % 2 === 0
              ? `rgba(34, 197, 94, ${alpha})` // Green for uptrend
              : `rgba(239, 68, 68, ${alpha})`; // Red for downtrend
          ctx.lineWidth = 1.5;

          const points = 8;
          for (let j = 0; j < points; j++) {
            const px =
              chartX - chartWidth / 2 + (j / (points - 1)) * chartWidth;
            const variation =
              Math.sin(time * 2 + i + j * 0.5) * 0.3 +
              Math.sin(time * 0.5 + i) * 0.2;
            const py = chartY + variation * chartHeight;

            if (j === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.stroke();
        }
      }

      // Draw connection lines between coins (trading pairs)
      ctx.lineWidth = 1;
      for (let i = 0; i < numCoins; i++) {
        if (i % 4 !== 0) continue;

        const angle1a = (i * Math.PI * 2) / numCoins + rotation * 1.5;
        const angle2a = Math.sin(time * 0.8 + i * 0.5) * 0.6;
        const xa =
          centerX + radius * 0.98 * Math.cos(angle2a) * Math.cos(angle1a);
        const ya =
          centerY + radius * 0.98 * Math.cos(angle2a) * Math.sin(angle1a);
        const za = radius * 0.98 * Math.sin(angle2a);

        const j = (i + 4) % numCoins;
        const angle1b = (j * Math.PI * 2) / numCoins + rotation * 1.5;
        const angle2b = Math.sin(time * 0.8 + j * 0.5) * 0.6;
        const xb =
          centerX + radius * 0.98 * Math.cos(angle2b) * Math.cos(angle1b);
        const yb =
          centerY + radius * 0.98 * Math.cos(angle2b) * Math.sin(angle1b);
        const zb = radius * 0.98 * Math.sin(angle2b);

        if (za > -radius * 0.4 && zb > -radius * 0.4) {
          const pulse = 0.3 + 0.7 * Math.sin(time * 2 + i);
          ctx.strokeStyle = `rgba(20, 184, 166, ${pulse * 0.25})`;
          ctx.beginPath();
          ctx.moveTo(xa, ya);
          ctx.lineTo(xb, yb);
          ctx.stroke();
        }
      }

      rotation += 0.004;
      requestAnimationFrame(drawGlobe);
    }

    drawGlobe();
  }, []);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full"
        style={{
          filter: 'drop-shadow(0 0 50px rgba(234, 179, 8, 0.15))',
        }}
      />
    </div>
  );
}
