const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetLine = "const [isGeneratingAiCaption, setIsGeneratingAiCaption] = useState(false);";
const newLine = "const [isGeneratingAiCaption, setIsGeneratingAiCaption] = useState(false);\n  const [showSafeZoneOverlay, setShowSafeZoneOverlay] = useState(true);";

code = code.replace(targetLine, newLine);
fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Added safe zone state');
