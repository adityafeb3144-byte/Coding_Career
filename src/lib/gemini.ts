import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

const getApiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY is not set in the environment.");
  }
  return key || "";
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let globalRateLimitUntil = 0;

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  if (Date.now() < globalRateLimitUntil) {
    const remaining = Math.round((globalRateLimitUntil - Date.now()) / 1000);
    throw new Error(`Gemini API is in global cooldown due to rate limits. Try again in ${remaining}s.`);
  }

  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRateLimit = error?.message?.includes('429') || error?.status === 429 || error?.code === 429;
      
      if (isRateLimit) {
        if (i < maxRetries - 1) {
          // Exponential backoff: 2s, 4s, 8s, 16s... + jitter
          const delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
          console.warn(`Gemini API rate limited. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        } else {
          // Exhausted retries, set a global cooldown for 60 seconds
          console.error("Gemini API quota exhausted. Entering 60s global cooldown.");
          globalRateLimitUntil = Date.now() + 60000;
        }
      }
      throw error;
    }
  }
  throw lastError;
}

export const getMentorResponse = async (history: { role: string, content: string }[], userProfile: any) => {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    You are the Nexus Career OS AI Mentor. 
    You are a Big Tech Career Strategist and Senior Software Architect.
    Your goal is to help the user become a top-tier Software, Cloud, or AI Engineer.
    
    User Profile:
    - Specialization: ${userProfile.specialization}
    - Level: ${userProfile.level}
    - Intensity: ${userProfile.intensity}
    
    Guidelines:
    - Be encouraging but rigorous.
    - Provide actionable advice.
    - Use technical terminology correctly.
    - Focus on high-impact skills and projects.
    - If asked for code review, be thorough.

    MARKET INTELLIGENCE CAPABILITY:
    You have access to real-time market data (simulated). If you identify a skill or course that is ABSOLUTELY CRITICAL for the user's goal based on current trends (e.g., Rust for systems, LLM Agents for AI), you MUST use the 'add_roadmap_node' tool to add it to their skill tree.
    You must decide the 'order' number for the new node based on where it fits in their current learning path.
    Explain to the user WHY you are adding this node and where it fits in their sequence.

    RE-SEQUENCING CAPABILITY:
    If you notice the user's roadmap has missing or incorrect 'order' numbers, you MUST use the 'update_roadmap_orders' tool to fix them.
    You can use the 'get_roadmap' tool to see the current nodes and their orders.
  `;

  const getRoadmapTool: FunctionDeclaration = {
    name: "get_roadmap",
    description: "Retrieves the user's current roadmap nodes and their status/order.",
    parameters: { type: Type.OBJECT, properties: {} }
  };

  const addRoadmapNodeTool: FunctionDeclaration = {
    name: "add_roadmap_node",
    description: "Adds a new skill or course node to the user's roadmap/skill tree.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Title of the skill or course" },
        description: { type: Type.STRING, description: "Brief explanation of the skill" },
        category: { type: Type.STRING, description: "Category of the skill (SWE, Cloud, AI)" },
        order: { type: Type.NUMBER, description: "The sequential step number for this skill (e.g., 1, 2, 3)" },
        dependencies: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "IDs of prerequisite nodes that must be completed first."
        },
        xpReward: { type: Type.NUMBER, description: "XP reward for completion (usually 100-500)" },
        lectures: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              completed: { type: Type.BOOLEAN },
              xpReward: { type: Type.NUMBER }
            },
            required: ["id", "title", "completed", "xpReward"]
          },
          description: "A list of 8-12 specific lectures or sub-topics within this skill."
        },
        resources: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              url: { type: Type.STRING },
              type: { type: Type.STRING, description: "Type: video or article" }
            }
          }
        }
      },
      required: ["title", "description", "category", "order", "xpReward", "resources"]
    }
  };

  const updateRoadmapOrdersTool: FunctionDeclaration = {
    name: "update_roadmap_orders",
    description: "Updates the sequential order numbers for multiple roadmap nodes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        updates: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              nodeId: { type: Type.STRING, description: "The ID of the node to update" },
              order: { type: Type.NUMBER, description: "The new sequential order number" }
            },
            required: ["nodeId", "order"]
          }
        }
      },
      required: ["updates"]
    }
  };

  const contents = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));

  try {
    const response = await callWithRetry(() => ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [addRoadmapNodeTool, updateRoadmapOrdersTool, getRoadmapTool] }]
      }
    }));

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      return {
        text: response.text || "",
        functionCalls: functionCalls
      };
    }

    return { text: response.text || "I'm sorry, I couldn't generate a response at this time." };
  } catch (error) {
    console.error("Gemini API Error (getMentorResponse):", error);
    throw error;
  }
};

export const generateInitialRoadmap = async (specialization: string, intensity: string) => {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Generate a structured, sequential career roadmap for a ${specialization} journey (Software Engineering + Cloud Computing + AI/ML) with ${intensity} intensity.
    
    CRITICAL INSTRUCTIONS:
    1. Create a comprehensive "Main Path" of 15-20 nodes covering the full trifecta:
       - Software: CS Fundamentals (DSA, OS, Networking), System Design, Advanced Programming.
       - Cloud: Virtualization, Distributed Systems, AWS/GCP/Azure Architecture, Kubernetes, DevOps.
       - AI: Linear Algebra/Calculus, Probability, Machine Learning Fundamentals, Deep Learning, LLMs, AI Engineering.
    2. Nodes MUST be logically ordered from absolute basics to advanced mastery.
    3. Each node MUST contain 10-15 specific "lectures" or sub-topics.
    4. Use a strict dependency chain to create a clear learning line.
    5. For 'resources', provide 2-3 options. The FIRST resource MUST be the 'Primary' (Academic Gold Standard).
    6. Return the roadmap as a JSON array of nodes.
    7. ACADEMIC RIGOR: The user demands MIT OCW, Harvard CS50, Stanford Online, or freeCodeCamp levels of depth.
    8. The 'Primary' resource MUST be the absolute best academic resource available (e.g., MIT OCW, Harvard CS50, Stanford CS229, freeCodeCamp).
    9. PREFER: MIT OpenCourseWare, Harvard CS50, Stanford Online, freeCodeCamp, and Official Documentation.
    10. AVOID: Crash courses, "X in 10 minutes" videos, or low-depth tutorials.
    11. VERIFY: Ensure all URLs are valid and lead to comprehensive, engineering-grade content.
  `;

  try {
    const response = await callWithRetry(() => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              category: { type: Type.STRING, enum: ["SWE", "Cloud", "AI"] },
              order: { type: Type.NUMBER, description: "The sequential step number for this skill" },
              dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
              xpReward: { type: Type.NUMBER },
              lectures: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    completed: { type: Type.BOOLEAN },
                    xpReward: { type: Type.NUMBER }
                  },
                  required: ["id", "title", "completed", "xpReward"]
                }
              },
              resources: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    url: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ["video", "article"] },
                    isPrimary: { type: Type.BOOLEAN, description: "Set to true for the first/best resource" }
                  },
                  required: ["title", "url", "type"]
                }
              }
            },
            required: ["id", "title", "description", "category", "dependencies", "xpReward", "resources"]
          }
        }
      }
    }));

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Gemini API Error (generateInitialRoadmap):", error);
    return [];
  }
};

export const resequenceRoadmap = async (nodes: any[]) => {
  const model = "gemini-3-flash-preview";
  const prompt = `
    You are a Strategic Path Optimizer for a career roadmap.
    Given the following list of skills/nodes, determine the absolute best sequential order to learn them.
    
    Nodes:
    ${JSON.stringify(nodes.map(n => ({ id: n.id, title: n.title, dependencies: n.dependencies })), null, 2)}
    
    CRITICAL RULES:
    1. Prerequisite nodes MUST come before the nodes that depend on them.
    2. The sequence must be logical (e.g., HTML before React).
    3. Return a JSON array of objects with 'nodeId' and 'order' (starting from 1).
    
    Example Output:
    [{"nodeId": "html-basics", "order": 1}, {"nodeId": "css-mastery", "order": 2}]
  `;

  try {
    const response = await callWithRetry(() => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              nodeId: { type: Type.STRING },
              order: { type: Type.NUMBER }
            },
            required: ["nodeId", "order"]
          }
        }
      }
    }));

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Gemini API Error (resequenceRoadmap):", error);
    return [];
  }
};

export const generateMarketDemandSkill = async (specialization: string, currentRoadmap: any[]) => {
  const model = "gemini-3-flash-preview";
  const prompt = `
    You are a Market Intelligence AI for a career platform.
    The user is a ${specialization} Engineer.
    Their current roadmap contains: ${currentRoadmap.map(n => n.title).join(', ')}.
    
    Identify ONE highly trending, critical skill or tool that is currently in high demand in the market but is NOT in their roadmap.
    
    CRITICAL: The learning resources MUST be of high academic quality (MIT OCW, freeCodeCamp, official docs).
    
    Return a JSON object for a new roadmap node.
  `;

  try {
    const response = await callWithRetry(() => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
            xpReward: { type: Type.NUMBER },
            dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
            resources: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  url: { type: Type.STRING },
                  type: { type: Type.STRING }
                }
              }
            }
          },
          required: ["title", "description", "category", "xpReward", "dependencies", "resources"]
        }
      }
    }));

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error (generateMarketDemandSkill):", error);
    return null;
  }
};

export const generateDailyQuests = async (specialization: string, availableNodes: any[], completedNodes: any[]) => {
  const model = "gemini-3-flash-preview";
  
  // Find the node with the lowest 'order' in availableNodes - this is the "Current Chapter"
  const currentChapter = availableNodes.sort((a, b) => (a.order || 0) - (b.order || 0))[0];
  const otherAvailable = availableNodes.filter(n => n.id !== currentChapter?.id);

  const prompt = `
    You are a Tactical Mission Generator for a career platform.
    The user is a ${specialization} Engineer.
    
    CONTEXT:
    - SKILLS MASTERED (All Previous): ${completedNodes.map(n => n.title).join(', ') || 'None yet'}.
    - CURRENT CHAPTER (Active Learning): ${currentChapter ? `${currentChapter.title} - ${currentChapter.description}` : 'No specific chapter yet'}.
    - CHAPTER PROGRESS: ${currentChapter?.lectures ? `${currentChapter.lectures.filter((l: any) => l.completed).length}/${currentChapter.lectures.length} lectures completed` : 'N/A'}.
    - COMPLETED LECTURES IN CURRENT: ${currentChapter?.lectures?.filter((l: any) => l.completed).map((l: any) => l.title).join(', ') || 'None'}.
    - REMAINING LECTURES IN CURRENT: ${currentChapter?.lectures?.filter((l: any) => !l.completed).map((l: any) => l.title).join(', ') || 'None'}.
    - UPCOMING CHAPTERS: ${otherAvailable.slice(0, 2).map(n => n.title).join(', ') || 'None'}.
    
    Generate 3 specific, actionable daily quests (missions) for today.
    
    CRITICAL RULES:
    1. MISSION 1 (First Step/Deep Dive): If the user has 0 lectures completed in the "CURRENT CHAPTER", Mission 1 MUST focus on the VERY FIRST lecture of that chapter. If they have some progress, focus on the NEXT immediate lecture. Create a practical exercise for that specific lecture.
    2. MISSION 2 (Reinforcement/Integration): If the user has 0 lectures completed in the "CURRENT CHAPTER", Mission 2 should focus on "Foundational Theory" or "Environment Setup" for this chapter. If they have completed lectures, integrate those specific lectures with "SKILLS MASTERED".
    3. MISSION 3 (Meta/Strategic): A career-focused task related to the ${specialization} field.
    
    STRICT SEQUENCING:
    - NEVER suggest a task for a lecture that comes after the current "Remaining" focus.
    - If the user is at the start of their journey (0 XP), keep tasks simple and foundational.
    - Reference specific lecture titles from the provided context in the quest descriptions.
    
    Return a JSON array of 3 objects.
  `;

  try {
    const response = await callWithRetry(() => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              xp: { type: Type.NUMBER },
              type: { type: Type.STRING, enum: ["technical", "meta"] }
            },
            required: ["title", "xp", "type"]
          }
        }
      }
    }));

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Gemini API Error (generateDailyQuests):", error);
    return [];
  }
};

export const analyzeQuestSubmission = async (questTitle: string, fileContent: string, fileName: string) => {
  const model = "gemini-3-flash-preview";
  const prompt = `
    You are an Elite Engineering Mentor. 
    The user has submitted a file for their daily quest: "${questTitle}".
    
    FILE NAME: ${fileName}
    FILE CONTENT:
    ${fileContent}
    
    TASK:
    1. Analyze if the content of the file reasonably demonstrates completion of the quest.
    2. If it's a technical quest, look for code, logic, or documentation that matches the title.
    3. If it's a meta quest, look for reflection, planning, or research.
    
    RETURN:
    A JSON object with:
    - isComplete: boolean (true if the quest is satisfied)
    - feedback: string (2-3 bullet points for improvement or praise)
    - score: number (0-100 based on quality)
  `;

  try {
    const response = await callWithRetry(() => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isComplete: { type: Type.BOOLEAN },
            feedback: { type: Type.STRING },
            score: { type: Type.NUMBER }
          },
          required: ["isComplete", "feedback", "score"]
        }
      }
    }));

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error (analyzeQuestSubmission):", error);
    return { isComplete: false, feedback: "Analysis failed. Please try again.", score: 0 };
  }
};
