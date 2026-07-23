import React, { useState, useRef, useEffect } from 'react';
import { useCurrency, CurrencyCode } from './CurrencyContext';
import { ChevronDown } from './Icons';
import { uiAudio } from './audio';

const SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
};

export const CurrencySelector: React.FC = () => {
    const { currency, setCurrency } = useCurrency();
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (c: CurrencyCode) => {
        uiAudio.playClick();
        setCurrency(c);
        setIsOpen(false);
    };

    return (
        <div ref={ref} className="relative hidden md:block">
            <button 
                onClick={() => { uiAudio.playClick(); setIsOpen(!isOpen); }}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-full transition-colors"
                title="Select Currency"
            >
                <span>{SYMBOLS[currency]} {currency}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-32 bg-dune rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 py-2 z-50 animate-scale-in origin-top-right">
                    {(Object.keys(SYMBOLS) as CurrencyCode[]).map(c => (
                        <button
                            key={c}
                            onClick={() => handleSelect(c)}
                            className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50 flex items-center justify-between ${currency === c ? 'text-[#0284C7] bg-blue-50/50' : 'text-gray-700'}`}
                        >
                            <span>{c}</span>
                            <span className="text-gray-400 font-normal">{SYMBOLS[c]}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
