const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const bodyStart = `<body>`;
const splashHtml = `<body>
    <style>
      #native-splash {
        position: fixed;
        inset: 0;
        background-color: #ffffff;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
      }
      #native-splash.hidden {
        opacity: 0;
        transform: scale(1.05);
      }
      .splash-logo {
        width: 72px;
        height: 72px;
        animation: splash-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        filter: drop-shadow(0 10px 20px rgba(2, 132, 199, 0.2));
      }
      @keyframes splash-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(0.95); opacity: 0.8; }
      }
      @media (prefers-color-scheme: dark) {
        #native-splash { background-color: #000000; }
      }
    </style>
    <div id="native-splash">
       <img src="/logo.svg" class="splash-logo" alt="Logo" />
    </div>`;

if (!code.includes('native-splash')) {
    code = code.replace(bodyStart, splashHtml);
    fs.writeFileSync('index.html', code);
}
