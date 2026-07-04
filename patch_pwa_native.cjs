const fs = require('fs');
let code = fs.readFileSync('index.css', 'utf8');

if (!code.includes('pt-safe')) {
code += `\n
@supports (padding-top: env(safe-area-inset-top)) {
  .pt-safe {
    padding-top: env(safe-area-inset-top);
  }
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom);
  }
  .pl-safe {
    padding-left: env(safe-area-inset-left);
  }
  .pr-safe {
    padding-right: env(safe-area-inset-right);
  }
  .min-h-screen-safe {
    min-height: calc(100vh + env(safe-area-inset-top) + env(safe-area-inset-bottom));
  }
}

body {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  overscroll-behavior-y: none;
  background-color: #000; /* Prevent white flash on overscroll */
}

#root {
  background-color: #ffffff;
  min-height: 100vh;
  min-height: 100dvh;
}

input, textarea, [contenteditable="true"] {
  -webkit-user-select: auto;
  user-select: auto;
}

/* Hide scrollbar completely for native feel */
::-webkit-scrollbar {
    display: none;
}
* {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
`;
}
fs.writeFileSync('index.css', code);
