const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Find the ad-network block and extract it
const adNetworkStart = `    // Gap 2: Asynchronous Webhook Engine (Ad Network Sync)
app.post('/api/webhooks/ad-network', async (req, res) => {`;
const adNetworkEnd = `setInterval(processAsyncWebhookQueue, 60 * 1000); // Check every 60 seconds`;

let startIndex = code.indexOf(adNetworkStart);
let endIndex = code.indexOf(adNetworkEnd) + adNetworkEnd.length;

if (startIndex !== -1 && endIndex !== -1) {
  let adNetworkBlock = code.substring(startIndex, endIndex);
  
  // Remove it from the current position
  code = code.substring(0, startIndex) + code.substring(endIndex);
  
  // Find where app.post('/api/payments/webhook' ends.
  // We know it ends with:
  //     res.status(500).json({ error: 'Internal server error processing webhook' });
  //   }
  // });
  
  const webhookEndSearch = `    res.status(500).json({ error: 'Internal server error processing webhook' });
  }
});`;
  
  code = code.replace(webhookEndSearch, webhookEndSearch + "\n\n" + adNetworkBlock.replace(/^    \/\//gm, '//'));
  
  fs.writeFileSync('server.ts', code);
  console.log('Fixed route nesting for ad-network webhook');
} else {
  console.log('Could not find ad-network block');
}
