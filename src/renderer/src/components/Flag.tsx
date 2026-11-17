import { countryName, flagUrl } from '@/lib/flags'

export function Flag({ cc, size = 18, className = '' }: { cc: string | null | undefined; size?: number; className?: string }) {
  const url = flagUrl(cc)
  if (!url || !cc) return null
  return <img className={`flag ${className}`} src={url} width={size} height={Math.round((size * 3) / 4)} alt={cc} title={countryName(cc)} draggable={false} />
}
