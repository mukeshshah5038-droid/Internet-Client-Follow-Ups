import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const generateFollowUpSuggestion = async (appointmentNotes: string, customerStatus: string) => {
  if (!apiKey) return "Please set GEMINI_API_KEY to get smart suggestions.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `As an AI assistant for an internet provider sales rep, suggest a follow-up task and a reminder message based on these appointment notes: "${appointmentNotes}" and customer status: "${customerStatus}". 
      Format the response as JSON with "task" (short action) and "message" (friendly reminder text).`,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text);
    }
  } catch (error) {
    console.error("Error generating suggestion", error);
  }
  return { task: "Quick check-in", message: "Hi, just checking if you have any further questions about our internet plans!" };
};

export const summarizeDay = async (appointments: any[]) => {
  if (!apiKey) return "No summary available.";
  
  try {
    const summaryPrompt = appointments.map(a => `- ${a.dateTime}: ${a.notes}`).join('\n');
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Summarize the following sales appointments for today and give 3 key tips for the sales rep to improve their conversion: \n${summaryPrompt}`,
    });
    return response.text;
  } catch (error) {
    console.error("Error summarizing day", error);
    return "Could not generate summary.";
  }
};

export const generateReminderMessage = async (customerName: string, dateStr: string, timeStr: string, location: string) => {
  if (!apiKey) return "Hi, just a reminder for our scheduled visit on " + dateStr + " at " + timeStr + ". See you then!";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a short, friendly professional SMS reminder (under 150 chars) for a technician visit. 
      Customer: ${customerName}
      Service: Internet/TV Installation
      Date: ${dateStr} at ${timeStr}
      Address: ${location}
      Use the provided data, no placeholders.`,
    });
    return response.text;
  } catch (error) {
    console.error("Error generating reminder", error);
    return `Hi ${customerName}, just a reminder of our visit on ${dateStr} at ${timeStr}. See you then!`;
  }
};
