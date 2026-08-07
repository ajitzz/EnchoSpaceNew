const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

// I will extract my injected state block and move it down.
// Let's just find it by a unique string
const startTag = "const [copilotData, setCopilotData] = useState<any>(null);";
const endTag = "addToast(`Applied AI fix to ${field}`, 'success');\n  };";

const startIndex = code.indexOf(startTag);
const endIndex = code.indexOf(endTag) + endTag.length;

if (startIndex > -1) {
  const extracted = code.slice(startIndex, endIndex);
  code = code.slice(0, startIndex) + code.slice(endIndex);
  
  // Now place it after formData is declared.
  // We look for "const [formData, setFormData] = useState({"
  const insertPoint = code.indexOf("const [formData, setFormData] = useState(");
  // We need to skip to the end of the formData state definition, or just put it after a known line.
  // Actually, we can put it right before `const saveCampaign = async () => {`
  const saveIndex = code.indexOf("const saveCampaign =");
  if (saveIndex > -1) {
    code = code.slice(0, saveIndex) + extracted + "\n\n  " + code.slice(saveIndex);
    fs.writeFileSync('components/HostMarketing.tsx', code);
    console.log("Fixed state definition order.");
  } else {
    // If not found, let's put it right after `const [formData, ...` closes
    const closeIndex = code.indexOf("google_conversion_label: '',", insertPoint) + 30; // rough guess
    // Or just after useEffect
    console.log("Could not find saveCampaign");
  }
}
