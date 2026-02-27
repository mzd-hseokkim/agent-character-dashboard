import type { ChartDataPoint, ChartConfig } from '../types';
import type { IconGroup } from './canvasIcons';
import { drawIconGroupsLabel } from './canvasIcons';

export interface ChartDimensions {
  width: number;
  height: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export class ChartRenderer {
  private ctx: CanvasRenderingContext2D;
  private dimensions: ChartDimensions;
  private config: ChartConfig;
  private animationId: number | null = null;
  
  constructor(
    canvas: HTMLCanvasElement,
    dimensions: ChartDimensions,
    config: ChartConfig
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    
    this.ctx = ctx;
    this.dimensions = dimensions;
    this.config = config;
    this.setupCanvas(canvas);
  }
  
  private setupCanvas(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = this.dimensions.width * dpr;
    canvas.height = this.dimensions.height * dpr;
    canvas.style.width = `${this.dimensions.width}px`;
    canvas.style.height = `${this.dimensions.height}px`;
    this.ctx.scale(dpr, dpr);
  }
  
  private getChartArea() {
    const { width, height, padding } = this.dimensions;
    return {
      x: padding.left,
      y: padding.top,
      width: width - padding.left - padding.right,
      height: height - padding.top - padding.bottom
    };
  }
  
  clear() {
    this.ctx.clearRect(0, 0, this.dimensions.width, this.dimensions.height);
  }
  
  drawBackground() {
    const chartArea = this.getChartArea();
    
    // Create subtle gradient background
    const gradient = this.ctx.createLinearGradient(
      chartArea.x,
      chartArea.y,
      chartArea.x,
      chartArea.y + chartArea.height
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.02)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
    
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(
      chartArea.x,
      chartArea.y,
      chartArea.width,
      chartArea.height
    );
  }
  
  drawAxes() {
    const chartArea = this.getChartArea();
    this.ctx.strokeStyle = this.config.colors.axis;
    this.ctx.lineWidth = 1;
    
    // X-axis
    this.ctx.beginPath();
    this.ctx.moveTo(chartArea.x, chartArea.y + chartArea.height);
    this.ctx.lineTo(chartArea.x + chartArea.width, chartArea.y + chartArea.height);
    this.ctx.stroke();
    
    // Y-axis
    this.ctx.beginPath();
    this.ctx.moveTo(chartArea.x, chartArea.y);
    this.ctx.lineTo(chartArea.x, chartArea.y + chartArea.height);
    this.ctx.stroke();
  }
  
  drawTimeLabels(timeRange: string) {
    const chartArea = this.getChartArea();
    this.ctx.fillStyle = this.config.colors.text;
    this.ctx.font = '11px system-ui, -apple-system, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    
    const labels = this.getTimeLabels(timeRange);
    const spacing = chartArea.width / (labels.length - 1);
    
    labels.forEach((label, index) => {
      const x = chartArea.x + (index * spacing);
      const y = chartArea.y + chartArea.height + 5;
      this.ctx.fillText(label, x, y);
    });
  }
  
  private getTimeLabels(timeRange: string): string[] {
    switch (timeRange) {
      case '1m':
        return ['60s', '45s', '30s', '15s', 'now'];
      case '3m':
        return ['3m', '2m', '1m', 'now'];
      case '5m':
        return ['5m', '4m', '3m', '2m', '1m', 'now'];
      case '10m':
        return ['10m', '8m', '6m', '4m', '2m', 'now'];
      default:
        return [];
    }
  }
  
  drawBars(
    dataPoints: ChartDataPoint[],
    maxValue: number,
    progress: number = 1,
    getIconGroups?: (eventTypes: Record<string, number>, toolEvents?: Record<string, number>) => IconGroup[],
    getSessionColor?: (sessionId: string) => string
  ) {
    const chartArea = this.getChartArea();
    const barCount = this.config.maxDataPoints;
    const totalBarWidth = chartArea.width / barCount;
    const barWidth = this.config.barWidth;
    
    dataPoints.forEach((point, index) => {
      if (point.count === 0) return;
      
      const x = chartArea.x + (index * totalBarWidth) + (totalBarWidth - barWidth) / 2;
      const barHeight = (point.count / maxValue) * chartArea.height * progress;
      const y = chartArea.y + chartArea.height - barHeight;
      
      // Get the dominant session color for this bar
      let barColor = this.config.colors.primary;
      if (getSessionColor && point.sessions && Object.keys(point.sessions).length > 0) {
        // Get the session with the most events in this time bucket
        const dominantSession = Object.entries(point.sessions)
          .sort((a, b) => b[1] - a[1])[0][0];
        barColor = getSessionColor(dominantSession);
      }
      
      // Draw glow effect with session color
      this.drawBarGlow(x, y, barWidth, barHeight, point.count / maxValue, barColor);
      
      // Draw bar with rounded top
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(x, y + 2);
      this.ctx.lineTo(x, y + barHeight);
      this.ctx.lineTo(x + barWidth, y + barHeight);
      this.ctx.lineTo(x + barWidth, y + 2);
      this.ctx.arcTo(x + barWidth, y, x + barWidth / 2, y, 2);
      this.ctx.arcTo(x, y, x, y + 2, 2);
      this.ctx.closePath();
      
      // Enhanced gradient with session color
      const gradient = this.ctx.createLinearGradient(x, y, x, y + barHeight);
      gradient.addColorStop(0, this.adjustColorOpacity(barColor, 0.9));
      gradient.addColorStop(0.5, barColor);
      gradient.addColorStop(1, this.adjustColorOpacity(barColor, 0.7));
      
      this.ctx.fillStyle = gradient;
      this.ctx.fill();
      this.ctx.restore();
      
      // Draw icon labels (lucide icons via Path2D)
      if (getIconGroups && point.eventTypes && Object.keys(point.eventTypes).length > 0 && barHeight > 10) {
        const groups = getIconGroups(point.eventTypes, point.toolEvents);
        if (groups.length > 0) {
          const labelX = x + barWidth / 2;
          const labelY = y + barHeight / 2;
          drawIconGroupsLabel(this.ctx, groups, labelX, labelY, '#1e3020');
        }
      }
    });
  }
  
  private drawBarGlow(x: number, y: number, width: number, height: number, intensity: number, color?: string) {
    const glowRadius = 10 + (intensity * 20);
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    const glowColor = color || this.config.colors.glow;
    const gradient = this.ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, glowRadius
    );
    gradient.addColorStop(0, this.adjustColorOpacity(glowColor, 0.3 * intensity));
    gradient.addColorStop(1, 'transparent');
    
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(
      centerX - glowRadius,
      centerY - glowRadius,
      glowRadius * 2,
      glowRadius * 2
    );
  }
  
  private adjustColorOpacity(color: string, opacity: number): string {
    // Simple opacity adjustment - assumes hex color
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return color;
  }
  
  drawPulseEffect(x: number, y: number, radius: number, opacity: number) {
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, this.adjustColorOpacity(this.config.colors.primary, opacity));
    gradient.addColorStop(0.5, this.adjustColorOpacity(this.config.colors.primary, opacity * 0.5));
    gradient.addColorStop(1, 'transparent');
    
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  animate(renderCallback: (progress: number) => void) {
    const startTime = performance.now();
    
    const frame = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / this.config.animationDuration, 1);
      
      renderCallback(this.easeOut(progress));
      
      if (progress < 1) {
        this.animationId = requestAnimationFrame(frame);
      } else {
        this.animationId = null;
      }
    };
    
    this.animationId = requestAnimationFrame(frame);
  }
  
  private easeOut(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
  
  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  
  resize(dimensions: ChartDimensions) {
    this.dimensions = dimensions;
    this.setupCanvas(this.ctx.canvas as HTMLCanvasElement);
  }
}

export function createChartRenderer(
  canvas: HTMLCanvasElement,
  dimensions: ChartDimensions,
  config: ChartConfig
): ChartRenderer {
  return new ChartRenderer(canvas, dimensions, config);
}