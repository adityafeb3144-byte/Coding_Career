// src/lib/gemini.ts
// Proxy calls to the server-side API to keep API keys secure and guarantee CORS/execution compliance.

export const getMentorResponse = async (
  history: { role: string; content: string }[],
  userProfile: any,
  currentRoadmap?: any[],
  onChunk?: (text: string) => void
) => {
  const response = await fetch("/api/gemini/mentor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history, userProfile, currentRoadmap }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Failed to call AI Mentor." }));
    throw new Error(err.error || "Failed to call AI Mentor.");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No readable stream in response body.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  const allFunctionCalls: any[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const dataStr = line.slice(6).trim();
        if (dataStr === "[DONE]") {
          break;
        }
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.text) {
            fullText += parsed.text;
            if (onChunk) {
              onChunk(fullText);
            }
          }
          if (parsed.functionCalls) {
            allFunctionCalls.push(...parsed.functionCalls);
          }
        } catch (e) {
          console.error("Error parsing stream chunk:", e);
        }
      }
    }
  }

  return { text: fullText, functionCalls: allFunctionCalls };
};

export const generateInitialRoadmap = async (specialization: string, intensity: string) => {
  const response = await fetch("/api/gemini/initial-roadmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ specialization, intensity }),
  });
  if (!response.ok) {
    console.error("Initial Roadmap generation failed.");
    return [];
  }
  return response.json();
};

export const resequenceRoadmap = async (nodes: any[]) => {
  const response = await fetch("/api/gemini/resequence-roadmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodes }),
  });
  if (!response.ok) {
    console.error("Resequencing failed.");
    return [];
  }
  return response.json();
};

export const generateMarketIntelligence = async (specialization: string) => {
  const response = await fetch("/api/gemini/market-intelligence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ specialization }),
  });
  if (!response.ok) {
    console.error("Market Intelligence failed.");
    return [
      { skillName: "System Architecture", demandScore: 95, benchScore: 40, description: "Highly critical for scaling distributed services." },
      { skillName: "Memory Safety (Rust)", demandScore: 88, benchScore: 15, description: "Rapidly replacing C++ in performance-critical pods." },
      { skillName: "AI/LLM Integration", demandScore: 98, benchScore: 25, description: "Unprecedented demand for LLM-native application logic." },
      { skillName: "Cloud Infrastructure", demandScore: 85, benchScore: 50, description: "Standard requirement for all modern deployment cycles." },
      { skillName: "Security Engineering", demandScore: 92, benchScore: 30, description: "Increasingly vital as automated threats evolve." }
    ];
  }
  return response.json();
};

export const generateOpportunities = async (specialization: string, level: number, completedNodes: any[]) => {
  const response = await fetch("/api/gemini/opportunities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ specialization, level, completedNodes }),
  });
  if (!response.ok) {
    console.error("Opportunities generation failed.");
    return [];
  }
  return response.json();
};

export const generateMarketDemandSkill = async (specialization: string, currentRoadmap: any[]) => {
  const response = await fetch("/api/gemini/market-demand-skill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ specialization, currentRoadmap }),
  });
  if (!response.ok) {
    console.error("Market Demand Skill generation failed.");
    return null;
  }
  return response.json();
};

export const generateDailyQuests = async (specialization: string, availableNodes: any[], completedNodes: any[]) => {
  const response = await fetch("/api/gemini/daily-quests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ specialization, availableNodes, completedNodes }),
  });
  if (!response.ok) {
    console.error("Daily Quests generation failed.");
    return [];
  }
  return response.json();
};

export const analyzeQuestSubmission = async (questTitle: string, fileContent: string, fileName: string, mimeType?: string) => {
  const response = await fetch("/api/gemini/analyze-quest-submission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questTitle, fileContent, fileName, mimeType }),
  });
  if (!response.ok) {
    console.error("Quest submission analysis failed.");
    return { isComplete: false, feedback: "Analysis failed. Mentor is currently unreachable.", score: 0 };
  }
  return response.json();
};
