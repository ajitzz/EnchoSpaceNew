const fs = require('fs');
let code = fs.readFileSync('components/Header.tsx', 'utf8');

// Hide logo on mobile
code = code.replace(
  `className="flex flex-col justify-center leading-none cursor-pointer group shrink-0 select-none md:min-w-[120px]"`,
  `className="hidden md:flex flex-col justify-center leading-none cursor-pointer group shrink-0 select-none md:min-w-[120px]"`
);

// We need to hide CurrencySelector on mobile since we have no space, or put it inside Profile sheet.
code = code.replace(
  `<CurrencySelector />`,
  `<div className="hidden md:block"><CurrencySelector /></div>`
);

fs.writeFileSync('components/Header.tsx', code);
