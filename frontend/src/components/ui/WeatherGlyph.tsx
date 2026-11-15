import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Sun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { WeatherIconKey } from '@/types/weather'

const ICONS: Record<WeatherIconKey, LucideIcon> = {
  sun: Sun,
  'partly-cloudy': CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  'heavy-rain': CloudRainWind,
  snow: CloudSnow,
  storm: CloudLightning,
}

interface WeatherGlyphProps {
  icon: WeatherIconKey
  className?: string
  strokeWidth?: number
}

export function WeatherGlyph({
  icon,
  className,
  strokeWidth = 1.6,
}: WeatherGlyphProps) {
  const Icon = ICONS[icon]
  return (
    <Icon
      className={className}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  )
}
