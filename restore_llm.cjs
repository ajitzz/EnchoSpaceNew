const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const brokenCode = fs.readFileSync('server.bak.ts', 'utf8');
  const compiledCode = fs.readFileSync('dist/server.js', 'utf8');

  const prompt = `I accidentally ran a sed command that deleted every line containing "});" from my TypeScript backend server file. 
This means I lost a lot of closing brackets, but also some logic lines like "res.json({ success: true });".
I need you to restore the missing lines and output the FULL FIXED TypeScript code.

Here is the compiled JavaScript version of the file (dist/server.js) which was compiled BEFORE the deletion. It contains ALL the missing logic, but it lacks TypeScript types:
\`\`\`javascript
${compiledCode}
\`\`\`

Here is the broken TypeScript file (server.bak.ts) which has the types but is missing lines:
\`\`\`typescript
${brokenCode}
\`\`\`

Please output the COMPLETE fixed TypeScript file. Do not truncate it. It must contain the exact same types as the broken file, but with the missing lines restored from the compiled version.
Only output the code, inside \`\`\`typescript and \`\`\` blocks.`;

  console.log("Calling Gemini...");
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash', // using a strong model
    contents: prompt,
    config: {
      temperature: 0,
    }
  });

  const text = response.text;
  let code = text;
  if (text.includes('```typescript')) {
    code = text.split('```typescript')[1].split('```')[0].trim();
  } else if (text.includes('```ts')) {
    code = text.split('```ts')[1].split('```')[0].trim();
  }
  
  fs.writeFileSync('server_restored.ts', code);
  console.log("Restored server.ts");
}

run().catch(console.error);
