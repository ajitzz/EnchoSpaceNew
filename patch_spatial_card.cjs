const fs = require('fs');
let code = fs.readFileSync('components/ListingCard.tsx', 'utf8');

const importReplacement = `import { HeartIcon, StarIcon } from './Icons';
import { OptimizedImage } from './OptimizedImage';
import { useCurrency } from './CurrencyContext';`;

const newImports = `import { HeartIcon, StarIcon } from './Icons';
import { OptimizedImage } from './OptimizedImage';
import { useCurrency } from './CurrencyContext';
import { useMotionValue, useTransform } from 'framer-motion';`;

if (!code.includes('useMotionValue')) {
    code = code.replace(importReplacement, newImports);
}

const functionStart = `export const ListingCard: React.FC<ListingCardProps> = ({ 
    listing, 
    onToggleFavorite, 
    isFavorite,
    onClick,
    onMouseEnter,
    onMouseLeave
}) => {
    const { formatPrice } = useCurrency();`;

const spatialLogic = `export const ListingCard: React.FC<ListingCardProps> = ({ 
    listing, 
    onToggleFavorite, 
    isFavorite,
    onClick,
    onMouseEnter,
    onMouseLeave
}) => {
    const { formatPrice } = useCurrency();
    const x = useMotionValue(0.5);
    const y = useMotionValue(0.5);
    const rotateX = useTransform(y, [0, 1], [4, -4]);
    const rotateY = useTransform(x, [0, 1], [-4, 4]);

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - rect.left) / rect.width);
        y.set((e.clientY - rect.top) / rect.height);
    };

    const handlePointerLeave = () => {
        x.set(0.5);
        y.set(0.5);
        if (onMouseLeave) onMouseLeave();
    };`;

code = code.replace(functionStart, spatialLogic);

const oldDiv = `<motion.div
        key={listing.id}
        className="flex flex-col h-full bg-white transition-all w-full select-none"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        whileTap={{ scale: 0.98 }}`;

const newDiv = `<motion.div
        key={listing.id}
        className="flex flex-col h-full bg-white transition-all w-full select-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onMouseEnter={handleMouseEnter}
        style={{ rotateX, rotateY, transformPerspective: 1000 }}
        whileHover={{ scale: 1.02, zIndex: 10 }}
        whileTap={{ scale: 0.96 }}`;

code = code.replace(oldDiv, newDiv);

// Fix the image aspect ratio div to have a subtle shadow that responds
const oldImageWrap = `<div className="aspect-[4/3] w-full relative overflow-hidden rounded-xl mb-3">`;
const newImageWrap = `<div className="aspect-[4/3] w-full relative overflow-hidden rounded-xl mb-3 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
            <motion.div 
                className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-tr from-black/5 to-white/20 mix-blend-overlay"
                style={{
                    opacity: useTransform(y, [0, 1], [0.3, 0]),
                }}
            />`;

code = code.replace(oldImageWrap, newImageWrap);

fs.writeFileSync('components/ListingCard.tsx', code);
