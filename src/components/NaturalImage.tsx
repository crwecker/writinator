import { useState } from 'react'
import Image from 'next/image'

interface NaturalImageProps {
  src: string
  height: number | string
}

export const NaturalImage = ({ src, height }: NaturalImageProps) => {
  const [ratio, setRatio] = useState(16 / 9)
  return (
    <div className="relative" style={{ height }}>
      <Image
        src={src}
        alt=""
        sizes="(max-width: 768px) 100vw, 50vw"
        width={1920}
        height={1080}
        className="object-cover w-full h-full"
      />
    </div>
  )
} 