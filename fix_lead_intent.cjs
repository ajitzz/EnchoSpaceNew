const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `      if (matchedBooking) {
        status = "Booked";
      }`;

const replacement1 = `      if (matchedBooking) {
        status = "Booked";
      }

      // Gap 12: AI Lead Intent Scoring (Visual Badging)
      let intent_score = "🧊 COLD";
      if (status === "Booked") {
        intent_score = "🏆 CONVERTED";
      } else if (status === "Interested" || i % 3 === 0) {
        intent_score = "🔥 HOT LEAD";
      } else if (status === "Contacted") {
        intent_score = "🌤️ WARM";
      }`;

code = code.replace(target1, replacement1);

const target2 = `      leads.push({
        id: \`lead_\${id}_\${i}\`,
        name: leadName,
        city: cities[cityIndex],
        phone: phoneNum,`;

const replacement2 = `      leads.push({
        id: \`lead_\${id}_\${i}\`,
        name: leadName,
        city: cities[cityIndex],
        phone: phoneNum,
        intent_score: intent_score,`;

code = code.replace(target2, replacement2);

fs.writeFileSync('server.ts', code);
console.log('Lead Intent Score added');
