import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { ImageSize, ChatMessage } from "../types";

// Initialize the client
// The API key must be obtained exclusively from the environment variable process.env.API_KEY.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateItemImage = async (
  prompt: string,
  size: ImageSize
): Promise<string | null> => {
  try {
    // Using gemini-3-pro-image-preview as requested for high quality generation
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: size 
        }
      }
    });

    // Check for inline data (base64)
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

export const createChatSession = (): Chat => {
  return ai.chats.create({
    model: 'gemini-3-pro-preview', // Using gemini-3-pro-preview as requested for the chatbot
    config: {
      systemInstruction: "Você é um assistente útil e amigável do aplicativo 'EntregaFast AI'. Ajude usuários (clientes e entregadores) com dúvidas sobre pedidos, rastreamento e uso do app. Responda em português de forma concisa.",
    },
  });
};

export const sendMessageToChat = async (chat: Chat, message: string): Promise<string> => {
  try {
    const result: GenerateContentResponse = await chat.sendMessage({ message });
    return result.text || "Desculpe, não consegui processar sua resposta.";
  } catch (error) {
    console.error("Chat error:", error);
    return "Ocorreu um erro ao conectar com o assistente.";
  }
};