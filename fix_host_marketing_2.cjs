const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const startTag = "const [copilotData, setCopilotData] = useState<any>(null);";
const endTag = "addToast(`Applied AI fix to ${field}`, 'success');\n  };";

const startIndex = code.indexOf(startTag);
const endIndex = code.indexOf(endTag) + endTag.length;

if (startIndex > -1) {
  const extracted = code.slice(startIndex, endIndex);
  code = code.slice(0, startIndex) + code.slice(endIndex);
  
  const insertPoint = code.indexOf("const [previewPlatform, setPreviewPlatform] = useState");
  const endOfInsert = code.indexOf(";", insertPoint) + 1;
  
  code = code.slice(0, endOfInsert) + "\n\n  " + extracted + "\n" + code.slice(endOfInsert);
  fs.writeFileSync('components/HostMarketing.tsx', code);
  console.log("Fixed state definition order successfully.");
}
