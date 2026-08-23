/**
 * AI Multilingual Geotargeted Ad Copy Localizer
 * Milestone 15: Gemini 2.5 Flash Localization Engine with Heuristic Fallback
 * ENCHO Space Master Marketing Engine
 */

import { GoogleGenAI } from '@google/genai';

export interface LocalizedAdCopy {
  localizedHeadline: string;
  localizedBody: string;
  targetLanguage: string;
  isAiGenerated: boolean;
  confidence: number;
}

export const REGIONAL_FALLBACK_DICTIONARY: Record<string, { prefix: string; luxuryTag: string; bookPrompt: string }> = {
  hi: {
    prefix: 'शानदार प्रवास',
    luxuryTag: 'विशेष लक्जरी विला और निजी दृश्य',
    bookPrompt: 'आज ही बुक करें'
  },
  es: {
    prefix: 'Estancia de Lujo',
    luxuryTag: 'Vistas escénicas y privacidad total',
    bookPrompt: 'Reserva hoy con Encho Space'
  },
  fr: {
    prefix: 'Séjour de Luxe',
    luxuryTag: 'Villas exclusives et vues panoramiques',
    bookPrompt: 'Réservez dès aujourd hui'
  },
  de: {
    prefix: 'Luxusaufenthalt',
    luxuryTag: 'Exklusive Villen mit privater Aussicht',
    bookPrompt: 'Jetzt exklusiv buchen'
  },
  ar: {
    prefix: 'إقامة فاخرة',
    luxuryTag: 'فيلات حصرية وإطلالات بانورامية خلابة',
    bookPrompt: 'احجز الآن مع إنشو'
  }
};

export function detectLanguageFromGeotarget(targetLocation: string): string {
  const loc = targetLocation.toLowerCase();
  if (loc.includes('india') || loc.includes('mumbai') || loc.includes('delhi') || loc.includes('bangalore') || loc.includes('kerala')) {
    return 'hi';
  }
  if (loc.includes('spain') || loc.includes('madrid') || loc.includes('barcelona') || loc.includes('mexico') || loc.includes('colombia')) {
    return 'es';
  }
  if (loc.includes('france') || loc.includes('paris') || loc.includes('cannes') || loc.includes('nice')) {
    return 'fr';
  }
  if (loc.includes('germany') || loc.includes('berlin') || loc.includes('munich') || loc.includes('frankfurt')) {
    return 'de';
  }
  if (loc.includes('dubai') || loc.includes('uae') || loc.includes('saudi') || loc.includes('qatar')) {
    return 'ar';
  }
  return 'en';
}

export async function localizeAdCopyForFeederMarkets(
  originalHeadline: string,
  originalBody: string,
  targetLocation: string
): Promise<LocalizedAdCopy> {
  const targetLanguage = detectLanguageFromGeotarget(targetLocation);

  if (targetLanguage === 'en') {
    return {
      localizedHeadline: originalHeadline.slice(0, 30),
      localizedBody: originalBody.slice(0, 125),
      targetLanguage: 'en',
      isAiGenerated: false,
      confidence: 1.0
    };
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'encho-ai-localizer-v1' } }
      });

      const prompt = "Translate this luxury hospitality ad for guests from " + targetLocation + " into language " + targetLanguage + ". Respond in strict JSON format with keys localizedHeadline (under 30 characters) and localizedBody (under 125 characters). Headline: " + originalHeadline + ". Body: " + originalBody;

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      const text = response.text || '';
      const cleanJson = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      if (parsed.localizedHeadline && parsed.localizedBody) {
        return {
          localizedHeadline: String(parsed.localizedHeadline).slice(0, 30),
          localizedBody: String(parsed.localizedBody).slice(0, 125),
          targetLanguage,
          isAiGenerated: true,
          confidence: 0.96
        };
      }
    } catch (err) {
      console.warn('[AI LOCALIZER] Generative translation fallback:', err.message);
    }
  }

  const fallback = REGIONAL_FALLBACK_DICTIONARY[targetLanguage];
  if (fallback) {
    return {
      localizedHeadline: (fallback.prefix + ': ' + originalHeadline.slice(0, 15)).slice(0, 30),
      localizedBody: (fallback.luxuryTag + '. ' + fallback.bookPrompt + '.').slice(0, 125),
      targetLanguage,
      isAiGenerated: false,
      confidence: 0.85
    };
  }

  return {
    localizedHeadline: originalHeadline.slice(0, 30),
    localizedBody: originalBody.slice(0, 125),
    targetLanguage: 'en',
    isAiGenerated: false,
    confidence: 0.80
  };
}
