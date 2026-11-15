import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";

const conversationMemory: { [key: string]: any[] } = {};
const MAX_MEMORY = 10;

// Primary API (TechWiz Portal)
const TECHWIZARD_API_KEY = process.env.TECHWIZARD_API_KEY || "sk-6e13bbb968861da27993f1b3765ee684";
const ENDPOINTS = [
    "https://techwizgpt.lovable.app/api/public/v1/chat/completions",
    "https://techwizgpt.techwiz.app/api/public/v1/chat/completions",
    "https://techwizgpt.lovable.app/api/v1/chat/completions"
];

// Fallback Google AI
const getGeminiModel = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    const genAI = new GoogleGenerativeAI(key);
    return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
};

export const SHENG_CHATBOT_PROMPT =
    'You are TechWizard, a witty, street-smart Kenyan WhatsApp chatbot. ALWAYS reply in natural Kenyan Sheng (authentic Nairobi slang mixing Kiswahili, English, and Sheng such as "Niaje msee", "Fiti sana", "Buda", "Mambo iko shwari", "Usijali", "Cheki", "Sawa bazenga", "Maze", "Ngori", "Poa sana", "Aje"). Keep your replies natural, conversational, helpful, and concise in Sheng. Never switch to stiff formal English.';

export async function getAIReply(chatId: string, text: string, imageBuffer?: Buffer, customSystemPrompt?: string) {
    const history = conversationMemory[chatId] || [];
    const systemPrompt = customSystemPrompt || "You are TechWizard, a smart and friendly WhatsApp assistant. Be helpful, concise, and energetic.";
    
    // Try TechWiz Endpoints in parallel for maximum speed
    const techWizPromises = ENDPOINTS.map(endpoint => {
        return (async () => {
            let content: any = text;
            if (imageBuffer) {
                content = [
                    { type: "text", text: text || "Analyze this image" },
                    { type: "image_url", image_url: { url: `data:image/png;base64,${imageBuffer.toString("base64")}` } }
                ];
            }

            const messages = [
                { role: "system", content: systemPrompt },
                ...history.map(h => ({ role: h.role === 'model' ? 'assistant' : h.role, content: h.content })),
                { role: "user", content: content }
            ];

            const res = await axios.post(endpoint, {
                model: "google/gemini-3-flash-preview",
                messages: messages,
            }, {
                headers: {
                    "Authorization": `Bearer ${TECHWIZARD_API_KEY}`,
                    "Content-Type": "application/json"
                },
                timeout: 5000 
            });

            const reply = res.data.choices?.[0]?.message?.content;
            if (reply) return reply;
            throw new Error("Empty response");
        })();
    });

    try {
        const fastestReply = await Promise.any(techWizPromises);
        if (fastestReply) {
            if (!imageBuffer) {
                history.push({ role: "user", content: text });
                history.push({ role: "model", content: fastestReply });
                conversationMemory[chatId] = history.slice(-MAX_MEMORY);
            }
            return fastestReply;
        }
    } catch (e: any) {
        console.warn("All TechWiz endpoints failed or timed out.");
    }

    // 2. Fallback to Official Gemini API
    try {
        const model = getGeminiModel();
        if (model) {
            const promptParts: any[] = [];
            if (imageBuffer) {
                promptParts.push({ text: text || "Analyze this image" });
                promptParts.push({
                    inlineData: {
                        data: imageBuffer.toString("base64"),
                        mimeType: "image/png"
                    }
                });
            } else {
                promptParts.push({ text: text || (history.length === 0 ? "Hello, suggest what you can do" : "Continue") });
            }

            const historyForGemini = history.map(h => ({
                role: h.role === 'model' ? 'model' : 'user',
                parts: [{ text: h.content }]
            }));

            const result = await model.generateContent({
                contents: [
                    { role: 'user', parts: [{ text: systemPrompt }] },
                    { role: 'model', parts: [{ text: customSystemPrompt ? "Sawa msee! Niko rada, niambie chenye unataka." : "Understood! I'm ready to help. 🧙‍♂️" }] },
                    ...historyForGemini,
                    { role: 'user', parts: promptParts }
                ],
            });

            const reply = result.response.text();
            if (reply) {
                if (!imageBuffer) {
                    history.push({ role: "user", content: text });
                    history.push({ role: "model", content: reply });
                    conversationMemory[chatId] = history.slice(-MAX_MEMORY);
                }
                return reply;
            }
        }
    } catch (err: any) {
        console.error("Gemini Fallback Error:", err.message);
    }

    // 3. Last Resort - Nice User Message
    return customSystemPrompt
        ? "🧙‍♂️ _Maze nimetulia kidogo tu buda, rudi baada ya sekunde chache!_"
        : "🧙‍♂️ _The wizard is briefly resting. I'll be back to help you in just a moment!_";
}

export function resetAI(chatId: string) {
    conversationMemory[chatId] = [];
}

export async function translate(text: string, targetLang: string) {
    const prompt = `Translate to ${targetLang}. Only return the translation: "${text}"`;
    
    // Try TechWiz Endpoints in parallel
    const translatePromises = ENDPOINTS.map(endpoint => {
        return (async () => {
            const res = await axios.post(endpoint, {
                model: "google/gemini-3-flash-preview",
                messages: [{ role: "user", content: prompt }]
            }, {
                headers: {
                    "Authorization": `Bearer ${TECHWIZARD_API_KEY}`,
                    "Content-Type": "application/json"
                },
                timeout: 5000
            });
            const reply = res.data.choices?.[0]?.message?.content;
            if (reply) return reply;
            throw new Error("Empty response");
        })();
    });

    try {
        const fastestTranslation = await Promise.any(translatePromises);
        if (fastestTranslation) return fastestTranslation;
    } catch {}

    // Fallback Gemini
    try {
        const model = getGeminiModel();
        if (model) {
            const result = await model.generateContent(prompt);
            return result.response.text();
        }
    } catch {}

    return text;
}
