import React, { createContext, useContext, useState, useEffect } from 'react';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR';

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  formatPrice: (amountInUSD: number, fromCurrency?: string) => string;
}

const EXCHANGE_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.93,
  GBP: 0.79,
  INR: 83.50,
};

const SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
};

const CurrencyContext = createContext<CurrencyContextType>({
  currency: 'INR',
  setCurrency: () => {},
  formatPrice: (amount) => `₹${amount}`
});

export const CurrencyProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => {
    try {
      const saved = localStorage.getItem('user_currency') as CurrencyCode;
      if (saved && EXCHANGE_RATES[saved]) {
        return saved;
      }
    } catch (e) {
      console.error('Error reading currency from localStorage:', e);
    }
    return 'INR';
  });

  const setCurrency = (c: CurrencyCode) => {
    setCurrencyState(c);
    localStorage.setItem('user_currency', c);
  };

  const formatPrice = (amount: number, fromCurrency: string = 'USD') => {
    // Convert from the base/from currency to USD first
    const rateToUSD = fromCurrency && EXCHANGE_RATES[fromCurrency] ? (1 / EXCHANGE_RATES[fromCurrency]) : 1;
    const amountInUSD = amount * rateToUSD;
    
    // Convert from USD to target currency
    const rate = EXCHANGE_RATES[currency] || 1;
    const converted = amountInUSD * rate;
    const symbol = SYMBOLS[currency] || '$';
    
    return `${symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => useContext(CurrencyContext);
