const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const newVariants = `const pageVariants = {
    initial: { opacity: 0, x: 50 },
    in: { opacity: 1, x: 0 },
    out: { opacity: 0, x: -50 }
  };

  const pageTransition = {
    type: 'spring',
    damping: 28,
    stiffness: 280,
    mass: 0.9,
    restDelta: 0.001
  };`;

// We'll replace the existing variants.
const existingVariantsRegex = /const pageVariants = \{[\s\S]*?const pageTransition = \{[\s\S]*?\};\n/g;
if (code.match(existingVariantsRegex)) {
    code = code.replace(existingVariantsRegex, newVariants + '\n');
}

// Add touch action none to body in index.css is already done.
// Let's also add pull-to-refresh to other screens? Maybe later.

fs.writeFileSync('App.tsx', code);
