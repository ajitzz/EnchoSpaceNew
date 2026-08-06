const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetLinkRouter = `    const destinationUrl = \`https://encho-space-chi.vercel.app/listings/\${campaign.listing_id || ''}\`;
    const adHeadline = campaign.title || campaign.listing_title || 'Exclusive Resort Stay';
    const adMessage = campaign.description || campaign.listing_desc || 'Book your luxury getaway stay with Encho Space.';
    const feedDescription = campaign.feed_description || \`Experience high-end luxury living at \${adHeadline}.\`;`;

const newLinkRouter = `    // Milestone 9.2: Walled-Garden Sanitizer & CRM Link Router
    const rawDescription = campaign.description || campaign.listing_desc || 'Book your luxury getaway stay with Encho Space.';
    
    // Aggressive Regex to strip out any host-inserted external links, emails, or phone numbers.
    const contactLeakRegex = /(\\+?\\d[\\d\\s-]{8,})|([\\w.-]+@[\\w.-]+\\.\\w+)|(wa\\.me)|(whatsapp)|(t\\.me)|(instagram\\.com)|(facebook\\.com)|(call me)|(contact at)|(http[s]?:\\/\\/[^\\s]+)/gi;
    const sanitizedDescription = rawDescription.replace(contactLeakRegex, '[REDACTED: Please use Encho Inbox to communicate]');
    
    // The ONLY destination URL allowed is the deep-linked CRM lead capture form.
    // By routing the lead into the CRM deep link, we prevent Walled-Garden Leaks.
    const destinationUrl = \`https://encho-space-chi.vercel.app/crm/lead-capture/\${campaign.listing_id || ''}?campaign_id=\${campaign.id}\`;
    const adHeadline = campaign.title || campaign.listing_title || 'Exclusive Resort Stay';
    const adMessage = sanitizedDescription;
    const feedDescription = campaign.feed_description || \`Experience high-end luxury living at \${adHeadline}.\`;`;

code = code.replace(targetLinkRouter, newLinkRouter);
fs.writeFileSync('server.ts', code);
console.log('Updated server.ts for Walled-Garden Sanitizer');
