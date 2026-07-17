const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `  await pool.query(\`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS accumulated_clicks INT DEFAULT 0;\`);`;
const replacement1 = `  await pool.query(\`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS accumulated_clicks INT DEFAULT 0;\`);
  await pool.query(\`ALTER TABLE host_marketing_campaigns ADD COLUMN IF NOT EXISTS encho_absorbed_overspend DECIMAL DEFAULT 0;\`);`;

code = code.replace(target1, replacement1);

const target2 = `  let actualBurn = rawBurn;
  let reachesLimit = false;

  if (rawBurn >= remainingBudget) {
    actualBurn = remainingBudget;
    reachesLimit = true;
  }`;

const replacement2 = `  let actualBurn = rawBurn;
  let reachesLimit = false;
  let enchoOverspend = 0;

  if (rawBurn >= remainingBudget) {
    // Gap 13: Meta Over-Spend Liability (Double-Entry Ledger)
    // Simulate Meta overspending occasionally (e.g. up to 2% over budget)
    const overspendAllowance = budgetLimit * 0.02;
    const totalPotentialSpend = currentSpent + rawBurn;
    
    if (totalPotentialSpend > budgetLimit) {
        if (totalPotentialSpend <= budgetLimit + overspendAllowance) {
            actualBurn = rawBurn; // Allowed slight overspend!
            enchoOverspend = totalPotentialSpend - budgetLimit;
        } else {
            actualBurn = (budgetLimit + overspendAllowance) - currentSpent;
            enchoOverspend = overspendAllowance;
        }
    } else {
        actualBurn = rawBurn;
    }
    
    // We only reach limit logically for the host if they exhausted the base budget
    if (currentSpent + actualBurn >= budgetLimit) {
       reachesLimit = true;
    }
  }`;

code = code.replace(target2, replacement2);

const target3 = `  await pool.query(\`
    UPDATE host_marketing_campaigns
    SET accumulated_spent = $1,
        accumulated_impressions = $2,
        accumulated_clicks = $3,
        accumulated_conversions = $4,
        last_pacing_calc_at = NOW()
    WHERE id = $5
  \`, [
    newSpentTotal,
    newImpressionsTotal,
    newClicksTotal,
    newConversionsTotal,
    row.id
  ]);`;

const replacement3 = `  await pool.query(\`
    UPDATE host_marketing_campaigns
    SET accumulated_spent = $1,
        accumulated_impressions = $2,
        accumulated_clicks = $3,
        accumulated_conversions = $4,
        encho_absorbed_overspend = encho_absorbed_overspend + $5,
        last_pacing_calc_at = NOW()
    WHERE id = $6
  \`, [
    newSpentTotal,
    newImpressionsTotal,
    newClicksTotal,
    newConversionsTotal,
    enchoOverspend,
    row.id
  ]);
  
  if (enchoOverspend > 0) {
      console.log(\`[DOUBLE-ENTRY LEDGER] Meta overspent by \${enchoOverspend.toFixed(2)}. Encho absorbed the liability for Campaign #\${row.id}.\`);
  }`;

code = code.replace(target3, replacement3);

fs.writeFileSync('server.ts', code);
console.log('Overspend ledger added');
