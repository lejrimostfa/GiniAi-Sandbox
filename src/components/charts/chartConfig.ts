// --- Shared Chart Configuration ---
// Common options and color constants for all scientific charts
// Designed for dark background panels with publication-quality aesthetics

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  ScatterController,
  Filler,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'

// Register Chart.js components once
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  ScatterController,
  Filler,
  Title,
  Tooltip,
  Legend,
  zoomPlugin,
)

// --- Color constants matching the sandbox palette ---
export const CHART_COLORS = {
  worker: 'rgba(91, 143, 185, 1)',       // #5B8FB9
  workerFill: 'rgba(91, 143, 185, 0.3)',
  precarious: 'rgba(224, 122, 95, 1)',    // #E07A5F
  precariousFill: 'rgba(224, 122, 95, 0.3)',
  owner: 'rgba(61, 64, 91, 1)',           // #3D405B
  ownerFill: 'rgba(61, 64, 91, 0.4)',
  gini: 'rgba(212, 165, 116, 1)',         // #D4A574
  giniFill: 'rgba(212, 165, 116, 0.15)',
  redistribution: 'rgba(129, 178, 154, 1)', // #81B29A
  redistributionFill: 'rgba(129, 178, 154, 0.15)',
  stress: 'rgba(196, 69, 54, 1)',         // #C44536
  stressFill: 'rgba(196, 69, 54, 0.15)',
  deprivation: 'rgba(196, 69, 54, 0.7)',
  mobilityUp: 'rgba(129, 178, 154, 1)',
  mobilityDown: 'rgba(224, 122, 95, 1)',
  clusterMax: 'rgba(224, 122, 95, 1)',
  clusterMean: 'rgba(160, 160, 176, 1)',
  grid: 'rgba(100, 100, 140, 0.15)',
  text: 'rgba(160, 160, 176, 1)',
  textMuted: 'rgba(112, 112, 128, 1)',
  cursor: 'rgba(212, 165, 116, 0.4)',
}

// --- Shared chart options for dark-themed scientific charts ---
export function baseLineOptions(title: string): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
          modifierKey: undefined,
        },
        zoom: {
          wheel: { enabled: true, modifierKey: undefined },
          pinch: { enabled: true },
          drag: { enabled: false },
          mode: 'x',
        },
      },
      title: {
        display: true,
        text: title,
        color: CHART_COLORS.text,
        font: { size: 12, weight: 'bold' },
        padding: { bottom: 8 },
      },
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: CHART_COLORS.text,
          font: { size: 10 },
          boxWidth: 12,
          boxHeight: 2,
          padding: 8,
          usePointStyle: true,
          pointStyle: 'line',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(26, 26, 46, 0.95)',
        titleColor: '#E8E8E8',
        bodyColor: '#A0A0B0',
        borderColor: 'rgba(100, 100, 140, 0.3)',
        borderWidth: 1,
        titleFont: { size: 11 },
        bodyFont: { size: 10, family: 'monospace' },
        padding: 8,
        cornerRadius: 4,
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Week',
          color: CHART_COLORS.textMuted,
          font: { size: 10 },
        },
        ticks: {
          color: CHART_COLORS.textMuted,
          font: { size: 9 },
          maxTicksLimit: 12,
        },
        grid: { color: CHART_COLORS.grid },
      },
      y: {
        ticks: {
          color: CHART_COLORS.textMuted,
          font: { size: 9, family: 'monospace' },
        },
        grid: { color: CHART_COLORS.grid },
      },
    },
    elements: {
      point: { radius: 0, hoverRadius: 3 },
      line: { tension: 0.3, borderWidth: 1.5 },
    },
  }
}

// --- Shared zoom+pan options for bar / scatter charts ---
export const ZOOM_OPTIONS = {
  pan: {
    enabled: true,
    mode: 'xy' as const,
  },
  zoom: {
    wheel: { enabled: true },
    pinch: { enabled: true },
    drag: { enabled: false },
    mode: 'xy' as const,
  },
}

/** Create a vertical line annotation at the current step */
export function cursorPlugin(currentStep: number) {
  return {
    id: 'cursorLine',
    beforeDraw(chart: ChartJS) {
      const { ctx, chartArea, scales } = chart
      if (!chartArea || !scales.x) return
      const xPixel = scales.x.getPixelForValue(currentStep)
      if (xPixel < chartArea.left || xPixel > chartArea.right) return

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(xPixel, chartArea.top)
      ctx.lineTo(xPixel, chartArea.bottom)
      ctx.lineWidth = 1.5
      ctx.strokeStyle = CHART_COLORS.cursor
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.restore()
    },
  }
}
