const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Fix Gap 4 in /subscribe
const targetSub = `        const reply = response?.text?.trim();
        if (reply) {
          const parsed = JSON.parse(reply);
          gatekeeperScore = parsed.score;
          gatekeeperFeedback = parsed.feedback;
        }
      } catch (geminiError) {
        console.warn("Gatekeeper AI failed, defaulting to 10:", geminiError);
      }`;
const replaceSub = `        const reply = response?.text?.trim();
        if (reply) {
          const parsed = JSON.parse(reply);
          gatekeeperScore = parsed.score;
          gatekeeperFeedback = parsed.feedback;
        }
      } catch (geminiError) {
        // Gap 4: AI Rate Limiting & Fallback
        console.warn("Gatekeeper AI failed, defaulting to 'Pending Human Admin Review' (score 8.0):", geminiError);
        gatekeeperScore = 8.0;
        gatekeeperFeedback = "[AI Fallback] Engine timeout or failure. Campaign requires human Admin review.";
      }`;
if(code.includes(targetSub)) { code = code.replace(targetSub, replaceSub); console.log('Gap 4 fixed in subscribe.'); } else { console.log('Gap 4 targetSub not found.'); }

// Fix Gap 4 in /ai-check
const targetCheck = `      } catch (geminiError) {
        console.warn("Gemini AI pre-check failed, falling back to static scoring:", geminiError);
      }`;
const replaceCheck = `      } catch (geminiError) {
        // Gap 4: AI Rate Limiting & Fallback
        console.warn("Gemini AI pre-check failed, defaulting to Human Admin Review:", geminiError);
        aiResults.score = 8.0;
        aiResults.suggestions = "[AI Fallback] Engine timeout or failure. Campaign requires human Admin review.";
      }`;
if(code.includes(targetCheck)) { code = code.replace(targetCheck, replaceCheck); console.log('Gap 4 fixed in ai-check.'); } else { console.log('Gap 4 targetCheck not found.'); }

fs.writeFileSync('server.ts', code);
