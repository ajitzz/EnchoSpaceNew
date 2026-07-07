import React, { useState } from 'react';
import { Blurhash } from 'react-blurhash';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  sizes?: string;
  src: string;
  alt: string;
  className?: string;
  blurClassName?: string;
  priority?: boolean;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  style?: React.CSSProperties;
}

export const getOptimizedUrl = (url: string, width?: number) => {
    const isUnsplash = url.includes('images.unsplash.com');
    if (isUnsplash) {
        try {
            const urlObj = new URL(url);
            if (!urlObj.searchParams.has('auto')) urlObj.searchParams.set('auto', 'format');
            if (!urlObj.searchParams.has('fit')) urlObj.searchParams.set('fit', 'crop');
            if (!urlObj.searchParams.has('q')) urlObj.searchParams.set('q', '75');
            if (width) urlObj.searchParams.set('w', width.toString());
            return urlObj.toString();
        } catch {
            return url;
        }
    }
    
    // Edge-Network Image Transformation (Vercel Edge CDN for production, wsrv.nl Cloudflare edge for local)
    if (url.startsWith('http') && !url.includes('images.unsplash.com')) {
        try {
            const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            
            // Production: Vercel's built-in Edge Network Image Optimization (Native Next.js level AVIF/WebP)
            if (!isLocal && typeof window !== 'undefined') {
                // Determine optimal width based on provided width, fallback to standard responsive sizes
                const targetWidth = width || 1080;
                // Find the closest supported width from vercel.json sizes: [320, 640, 768, 1024, 1536, 2048]
                const supportedSizes = [320, 640, 768, 1024, 1536, 2048];
                const optimalWidth = supportedSizes.find(s => s >= targetWidth) || 2048;
                
                return `/_vercel/image?url=${encodeURIComponent(url)}&w=${optimalWidth}&q=75`;
            }
            
            // Local Development: Use Cloudflare-backed wsrv.nl Edge proxy to simulate production CDN
            const proxyUrl = new URL('https://wsrv.nl');
            proxyUrl.searchParams.set('url', url);
            proxyUrl.searchParams.set('output', 'webp');
            proxyUrl.searchParams.set('q', '75');
            if (width) proxyUrl.searchParams.set('w', width.toString());
            return proxyUrl.toString();
        } catch {
            return url;
        }
    }
    
    return url;
};

export function OptimizedImage({ 
    src, 
    alt, 
    className = '', 
    blurClassName = '',
    priority = false,
    sizes = "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw",
    ...props 
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);

  if (src !== currentSrc) {
    setCurrentSrc(src);
    setIsLoaded(false);
    setHasError(false);
  }

  // Extract custom LQIP from URL hash fragment if present
  let lqipDataUri: string | undefined;
  let blurhashStr: string | undefined;
  let cleanSrc = src || '';
  
  if (cleanSrc.includes('#blurhash=')) {
      const parts = cleanSrc.split('#blurhash=');
      cleanSrc = parts[0];
      try {
          blurhashStr = decodeURIComponent(parts[1]);
      } catch {
          // ignore
      }
  } else if (cleanSrc.includes('#lqip=')) {
      const parts = cleanSrc.split('#lqip=');
      cleanSrc = parts[0];
      try {
          lqipDataUri = decodeURIComponent(parts[1]);
      } catch {
          // ignore
      }
  }

  const isUnsplash = cleanSrc.includes('images.unsplash.com');

  const optimizedSrc = getOptimizedUrl(cleanSrc);
  
  // Unsplash LQIP
  const unsplashLqip = isUnsplash ? getOptimizedUrl(cleanSrc, 20) + '&blur=50' : undefined;
  const placeholderSrc = lqipDataUri || unsplashLqip;
  
  // Generate responsive srcSet for all optimized images
  const srcSet = [320, 640, 768, 1024, 1536, 2048].map(w => 
      `${getOptimizedUrl(cleanSrc, w)} ${w}w`
  ).join(', ');

  // Fallback image in case of failure
  const fallbackSrc = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=800&q=75';

  return (
    <div className={`relative overflow-hidden bg-gray-100 ${className}`}>
      {/* 
         1. Progressive Blur-Up (Blurhash / LQIP)
      */}
      {blurhashStr ? (
        <div className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out ${isLoaded || hasError ? 'opacity-0 z-0' : 'opacity-100 z-10'}`}>
          <Blurhash
            hash={blurhashStr}
            width="100%"
            height="100%"
            resolutionX={32}
            resolutionY={32}
            punch={1}
          />
        </div>
      ) : placeholderSrc ? (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out scale-[1.05] blur-xl ${
              isLoaded || hasError ? 'opacity-0 z-0' : 'opacity-100 z-10'
          }`}
        />
      ) : (
        <div 
          className={`absolute inset-0 bg-gray-200 animate-pulse transition-opacity duration-700 ease-in-out ${
              isLoaded || hasError ? 'opacity-0 z-0' : 'opacity-100 z-10'
          } ${blurClassName}`} 
          aria-hidden="true" 
        />
      )}

      {/* 
         2. Native Lazy Loading & fetchPriority (LCP Optimization)
      */}
      <img
        src={hasError ? fallbackSrc : optimizedSrc}
        srcSet={hasError ? undefined : srcSet}
        sizes={sizes}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        //  - fetchPriority is standard but types might be outdated
        fetchPriority={priority ? 'high' : 'auto'}
        decoding={priority ? 'sync' : 'async'}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        className={`w-full h-full object-cover transition-all duration-700 ease-in-out ${
           isLoaded ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-[1.02] blur-md'
        } ${className.replace('w-full', '').replace('h-full', '').replace('object-cover', '').trim()}`}
        {...props}
      />
    </div>
  );
}
