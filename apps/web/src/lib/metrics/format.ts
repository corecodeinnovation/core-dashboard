// Formateadores puros para las gráficas de métricas (JetBrains Mono en la UI).

// CPU: la serie viene en cores usados (rate de cpu_usage_seconds).
export function formatCores(value: number): string {
  return `${(value * 100).toFixed(value >= 1 ? 0 : 1)}%`;
}

// Bytes absolutos (RAM).
export function formatBytes(value: number): string {
  if (value >= 1_073_741_824) return `${(value / 1_073_741_824).toFixed(1)} GiB`;
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MiB`;
  if (value >= 1_024) return `${(value / 1_024).toFixed(1)} KiB`;
  return `${Math.round(value)} B`;
}

// Bytes por segundo (red).
export function formatRate(value: number): string {
  return `${formatBytes(value)}/s`;
}

// Ticks del eje X según el rango: hora para vivo/24h, día+hora para 7d.
export function formatTick(t: number, rangeHours: number): string {
  const date = new Date(t);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (rangeHours <= 24) return `${hh}:${mm}`;
  return `${date.getDate()}/${date.getMonth() + 1} ${hh}h`;
}
