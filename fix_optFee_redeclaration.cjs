const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetWalletSection = `      // Deduct wallet balance in USD base
      const usdDeduction = finalAmount > currentBalanceUSD ? Math.round((finalAmount / 83.5) * 100) / 100 : finalAmount;
      await pool.query('UPDATE host_wallets SET balance = balance - $1 WHERE id = $2', [usdDeduction, wallet.id]);

      const optFee = Math.round((finalAmount * 0.15) * 100) / 100;
      const netAdSpend = Math.round((finalAmount * 0.85) * 100) / 100;`;

const newWalletSection = `      // Deduct wallet balance in USD base
      const usdDeduction = finalAmount > currentBalanceUSD ? Math.round((finalAmount / 83.5) * 100) / 100 : finalAmount;
      await pool.query('UPDATE host_wallets SET balance = balance - $1 WHERE id = $2', [usdDeduction, wallet.id]);

      // Using optimizationFee and adSpendPool from Geo-Router`;

code = code.replace(targetWalletSection, newWalletSection);

code = code.replace("optFee, netAdSpend, campaign.id", "optimizationFee, adSpendPool, campaign.id");
code = code.replace("₹${netAdSpend} ad spend + ₹${optFee} 15% Encho fee", "₹${adSpendPool} ad spend + ₹${optimizationFee} 15% Encho fee");

fs.writeFileSync('server.ts', code);
console.log('Fixed redeclaration in server.ts');
