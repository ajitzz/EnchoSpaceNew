const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const oldVariants = `const pageVariants = {
    initial: { opacity: 0, y: 20 },
    in: { opacity: 1, y: 0 },
    out: { opacity: 0, y: -20 }
  };

  const pageTransition = {
    type: 'tween',
    ease: 'anticipate',
    duration: 0.3
  };`;

const newVariants = `const pageVariants = {
    initial: { opacity: 0, y: 15, scale: 0.99 },
    in: { opacity: 1, y: 0, scale: 1 },
    out: { opacity: 0, y: -10, scale: 0.99 }
  };

  const pageTransition = {
    type: "spring",
    stiffness: 350,
    damping: 35,
    mass: 0.8
  };`;

code = code.replace(oldVariants, newVariants);
fs.writeFileSync('App.tsx', code);
