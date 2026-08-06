const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

code = code.replace(
  "import React, { useState, useEffect } from 'react';", 
  "import React, { useState, useEffect } from 'react';\nimport { Grid } from 'lucide-react';"
);

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Fixed imports');
