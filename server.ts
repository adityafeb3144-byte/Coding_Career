import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set payload memory limit to handle base64 image uploads during daily quests analysis
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const getApiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY is not set in the environment.");
  }
  return key || "";
};

const ai = new GoogleGenAI({
  apiKey: getApiKey(),
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let globalRateLimitUntil = 0;

async function callWithRetry<T>(
  fn: (model: string) => Promise<T>,
  preferredModel = "gemini-3.5-flash",
  fallbackModel = "gemini-3.1-flash-lite",
  maxRetries = 5
): Promise<T> {
  if (Date.now() < globalRateLimitUntil) {
    const remaining = Math.round((globalRateLimitUntil - Date.now()) / 1000);
    throw new Error(`Gemini API is in global cooldown due to rate limits. Try again in ${remaining}s.`);
  }

  let currentModel = preferredModel;
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn(currentModel);
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.code;
      const errorMessage = error?.message || '';
      
      const isRateLimit = errorMessage.includes('429') || status === 429 || status === '429';
      
      const isTransient = errorMessage.includes('503') || status === 503 || status === '503' ||
                          errorMessage.includes('504') || status === 504 || status === '504' ||
                          errorMessage.includes('502') || status === 502 || status === '502' ||
                          errorMessage.includes('500') || status === 500 || status === '500' ||
                          errorMessage.includes('UNAVAILABLE') || 
                          errorMessage.includes('high demand') ||
                          errorMessage.includes('overloaded') ||
                          errorMessage.includes('temporary');

      console.error(`Gemini API Error details for model ${currentModel}:`, {
        status,
        message: errorMessage,
        isRateLimit,
        isTransient,
        attempt: i + 1
      });

      // On transient/rate-limiting errors, if we have a fallback model and aren't already using it, switch immediately!
      if ((isRateLimit || isTransient) && currentModel !== fallbackModel && fallbackModel) {
        console.warn(`Transient error or rate limit hit on model ${currentModel}. Switching to fallback model ${fallbackModel}...`);
        currentModel = fallbackModel;
        // Run again immediately without delay as we switched model
        continue;
      }

      if (isRateLimit || isTransient) {
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
          console.warn(`Gemini API temporary issue on ${currentModel} (${status || 'UNKNOWN'}). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        } else if (isRateLimit) {
          console.error("Gemini API quota exhausted. Entering 60s global cooldown.");
          globalRateLimitUntil = Date.now() + 60000;
        }
      }
      throw error;
    }
  }
  throw lastError;
}

// 1. AI Mentor Chat with dynamic tools setup
app.post("/api/gemini/mentor", async (req, res) => {
  try {
    const { history, userProfile, currentRoadmap } = req.body;
    
    if (!history || !userProfile) {
      res.status(400).json({ error: "Missing required history or userProfile parameters." });
      return;
    }

    const model = "gemini-3.5-flash";
    
    const systemInstruction = `
      You are the Nexus Career OS AI Mentor. 
      You are a Big Tech Career Strategist and Senior Software Architect.
      Your goal is to help the user become a top-tier Software, Cloud, or AI Engineer.
      
      User Profile:
      - Specialization: ${userProfile.specialization || "General Software Engineering"}
      - Level: ${userProfile.level || 1}
      - Intensity: ${userProfile.intensity || "Moderate"}
      ${currentRoadmap ? `- Current Learning Roadmap: ${JSON.stringify(currentRoadmap)}` : ""}
      
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

      SYSTEM PROTOCOL FOR ADDING NODES:
      When using 'add_roadmap_node', you MUST generate 8-12 high-quality lectures that are strictly derived from the Primary Source or academic curriculum for that specific topic.
      Avoid generic titles like "Introduction" or "Conclusion" - use descriptive, engineering-centric titles.
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
        required: ["title", "description", "category", "order", "xpReward", "lectures", "resources"]
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

    const contents = history.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const responseStream = await callWithRetry((m) => ai.models.generateContentStream({
      model: m,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [addRoadmapNodeTool, updateRoadmapOrdersTool, getRoadmapTool] }]
      }
    }));

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of responseStream) {
      const text = chunk.text || "";
      const functionCalls = chunk.functionCalls;
      const data = JSON.stringify({ text, functionCalls });
      res.write(`data: ${data}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error("Express Error /api/gemini/mentor:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to call AI Mentor." });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message || "Stream interrupted." })}\n\n`);
      res.end();
    }
  }
});

// 2. Generate Initial Roadmap
app.post("/api/gemini/initial-roadmap", async (req, res) => {
  try {
    const { specialization, intensity } = req.body;
    if (!specialization || !intensity) {
      res.status(400).json({ error: "Missing required specialization or intensity." });
      return;
    }

    const model = "gemini-3.5-flash";
    const prompt = `
      Generate a structured, sequential career roadmap for a ${specialization} journey (Software Engineering + Cloud Computing + AI/ML) with ${intensity} intensity.
      
      CRITICAL INSTRUCTIONS:
      1. Create a comprehensive "Main Path" of 15-20 nodes covering the full trifecta:
         - Software: CS Fundamentals (DSA, OS, Networking), System Design, Advanced Programming.
         - Cloud: Virtualization, Distributed Systems, AWS/GCP/Azure Architecture, Kubernetes, DevOps.
         - AI: Linear Algebra/Calculus, Probability, Machine Learning Fundamentals, Deep Learning, LLMs, AI Engineering.
      2. Nodes MUST be logically ordered from absolute basics to advanced mastery.
      3. Each node MUST contain 10-15 specific "lectures" or sub-topics that follow the academic curriculum of the Primary Resource.
      4. Use a strict dependency chain to create a clear learning line.
      5. For 'resources', provide 2-3 options. The FIRST resource MUST be the 'Primary' (Academic Gold Standard).
      6. Return the roadmap as a JSON array of nodes.
      7. ACADEMIC RIGOR: The user demands MIT OCW, Harvard CS50, Stanford Online, or freeCodeCamp levels of depth.
      8. The 'Primary' resource MUST be the absolute best academic resource available (e.g., MIT OCW, Harvard CS50, Stanford CS229, freeCodeCamp).
      9. PREFER: MIT OpenCourseWare, Harvard CS50, Stanford Online, freeCodeCamp, and Official Documentation.
      10. AVOID: Crash courses, "X in 10 minutes" videos, or low-depth tutorials.
      11. VERIFY: Ensure all URLs are valid and lead to comprehensive, engineering-grade content.
      12. LECTURE QUALITY: Each lecture title must be technically specific (e.g., "Memory Management in C" instead of "Coding Basics").
      13. MARKET DEMAND: Assign a 'marketDemand' score (0.1 to 1.0) based on current industry needs. For example, AWS/Cloud/System Design should be 0.9-1.0, while basic absolute fundamentals like variable declaration might be 0.4 (foundational but less "demand" than architectural skills).
    `;

    const response = await callWithRetry((m) => ai.models.generateContent({
      model: m,
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
              marketDemand: { 
                type: Type.NUMBER, 
                description: "A scale from 0.1 to 1.0 representing how critical this skill is in the current global market." 
              },
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
            required: ["id", "title", "description", "category", "dependencies", "xpReward", "lectures", "resources"]
          }
        }
      }
    }));

    res.json(JSON.parse(response.text || "[]"));
  } catch (error: any) {
    console.error("Express Error /api/gemini/initial-roadmap:", error);
    res.status(500).json({ error: error.message || "Failed to generate initial roadmap." });
  }
});

// 3. Resequence Roadmap
app.post("/api/gemini/resequence-roadmap", async (req, res) => {
  try {
    const { nodes } = req.body;
    if (!nodes) {
      res.status(400).json({ error: "Missing nodes parameter." });
      return;
    }

    const model = "gemini-3.5-flash";
    const prompt = `
      You are a Strategic Path Optimizer for a career roadmap.
      Given the following list of skills/nodes, determine the absolute best sequential order to learn them.
      
      Nodes:
      ${JSON.stringify(nodes.map((n: any) => ({ id: n.id, title: n.title, dependencies: n.dependencies })), null, 2)}
      
      CRITICAL RULES:
      1. Prerequisite nodes MUST come before the nodes that depend on them.
      2. The sequence must be logical (e.g., HTML before React).
      3. Return a JSON array of objects with 'nodeId' and 'order' (starting from 1).
      
      Example Output:
      [{"nodeId": "html-basics", "order": 1}, {"nodeId": "css-mastery", "order": 2}]
    `;

    const response = await callWithRetry((m) => ai.models.generateContent({
      model: m,
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

    res.json(JSON.parse(response.text || "[]"));
  } catch (error: any) {
    console.error("Express Error /api/gemini/resequence-roadmap:", error);
    res.status(500).json({ error: error.message || "Failed to resequence roadmap." });
  }
});

// 4. Generate Market Intelligence
app.post("/api/gemini/market-intelligence", async (req, res) => {
  try {
    const { specialization } = req.body;
    if (!specialization) {
      res.status(400).json({ error: "Missing specialization parameter." });
      return;
    }

    const model = "gemini-3.5-flash";
    const prompt = `
      You are a Global Market Intelligence AI for Software Engineering.
      Analyze current market trends for the specialization: "${specialization}".
      
      TASK:
      Identify 5 critical, high-demand skills for this path.
      For each skill, provide:
      1. skillName: Common industry name.
      2. demandScore (0-100): Current high-growth demand index.
      3. benchScore (0-100): The score a standard entry-to-mid level engineer usually has.
      
      RETURN:
      A JSON array of 5 objects, each with:
      - skillName: string
      - demandScore: number
      - benchScore: number
      - description: string (1 short sentence)
    `;

    const response = await callWithRetry((m) => ai.models.generateContent({
      model: m,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              skillName: { type: Type.STRING },
              demandScore: { type: Type.NUMBER },
              benchScore: { type: Type.NUMBER },
              description: { type: Type.STRING }
            },
            required: ["skillName", "demandScore", "benchScore", "description"]
          }
        }
      }
    }));

    res.json(JSON.parse(response.text || "[]"));
  } catch (error: any) {
    console.error("Express Error /api/gemini/market-intelligence:", error);
    res.status(500).json({ error: error.message || "Failed to generate market intelligence." });
  }
});

// 5. Generate Opportunities
app.post("/api/gemini/opportunities", async (req, res) => {
  try {
    const { specialization, level, completedNodes } = req.body;
    if (!specialization || level === undefined || !completedNodes) {
      res.status(400).json({ error: "Missing required parameters specialization, level or completedNodes." });
      return;
    }

    const model = "gemini-3.5-flash";
    const skillSummary = completedNodes.length > 0 
      ? completedNodes.map((n: any) => `- ${n.title} (${n.category || 'General'})`).join('\n')
      : "No major chapters completed yet. Focus on foundational opportunities.";

    const prompt = `
      You are a Career Opportunity AI. 
      The user is a ${specialization} Developer at Level ${level}.
      
      COMPLETED SKILLS & CHAPTERS:
      ${skillSummary}
      
      TASK:
      Generate 4-6 personalized "Opportunities" for this user. 
      Opportunities MUST be hyper-relevant to their specialization AND their current pedagogical level.
      
      SPECIAL HANDLING FOR BEGINNERS (Level 1-10):
      If a user is Level 1-10 (e.g., learning Scratch, Logic, Basic Programming), you are FORBIDDEN from suggesting jobs at major tech companies or high-level internships. 
      Instead, your "Opportunities" should be:
      - Educational Challenges: (e.g., "Scratch Game Jam", "Code.org Logic Challenge")
      - Foundational Projects: (e.g., "Build a Calculator in Scratch", "Create a Simple Maze Game")
      - Peer Communities: (e.g., "Join a Beginner Study Group", "Contribute to Scratch Wiki")
      - Verified Certifications: (e.g., "Complete CS50 Lecture 0 Achievement", "Obtain Logic Gates Badge")
  
      Types of Opportunities (Allowed):
      - "Job" (ONLY for Level 15+)
      - "Internship" (ONLY for Level 10+)
      - "Project" (Any Level)
      - "Open Source" (Any Level - for documentation or 'first-timers' tags)
      - "Education" (Any Level - for challenges and certifications)
      
      MATCHING LOGIC:
      - matchScore (0-100): High score (80+) only if their completed skills (like Scratch basics) directly enable the opportunity (like a Scratch Game Jam).
      - NEVER suggest professional tools like "Kubernetes" or "Rust" to a user who only knows "Scratch".
      - BE REALISTIC: Suggesting a career-level job to a Level 1 student is a CRITICAL ERROR.
      
      RETURN:
      A JSON array of objects, each with:
      - id: string (unique slug)
      - title: string (Exciting and descriptive)
      - company: string (Use realistic tech names, "Open Source Community", "Nexus Academy", or "Global Coding Challenge")
      - type: string (one of: "Job", "Internship", "Project", "Open Source", "Education")
      - matchScore: number
      - xpReward: number
      - description: string (Explain WHY this is a good match based on their specific completed chapters)
      - requirements: string[] (The core skills needed)
      - missingSkills: string[] (Skills from requirements that the user has NOT completed yet)
      - url: string (A valid search URL or repo link)
      - location: string (Remote/Hybrid/City)
    `;

    const response = await callWithRetry((m) => ai.models.generateContent({
      model: m,
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
              company: { type: Type.STRING },
              type: { type: Type.STRING },
              matchScore: { type: Type.NUMBER },
              xpReward: { type: Type.NUMBER },
              description: { type: Type.STRING },
              requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
              missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              url: { type: Type.STRING },
              location: { type: Type.STRING }
            },
            required: ["id", "title", "company", "type", "matchScore", "xpReward", "description", "requirements", "missingSkills", "url", "location"]
          }
        }
      }
    }));

    res.json(JSON.parse(response.text || "[]"));
  } catch (error: any) {
    console.error("Express Error /api/gemini/opportunities:", error);
    res.status(500).json({ error: error.message || "Failed to generate opportunities." });
  }
});

// 6. Generate Market Demand Skill
app.post("/api/gemini/market-demand-skill", async (req, res) => {
  try {
    const { specialization, currentRoadmap } = req.body;
    if (!specialization || !currentRoadmap) {
      res.status(400).json({ error: "Missing specialization or currentRoadmap context." });
      return;
    }

    const model = "gemini-3.5-flash";
    const prompt = `
      You are a Market Intelligence AI for a career platform.
      The user is a ${specialization} Engineer.
      Their current roadmap contains: ${currentRoadmap.map((n: any) => n.title).join(', ')}.
      
      Identify ONE highly trending, critical skill or tool that is currently in high demand in the market but is NOT in their roadmap.
      
      CRITICAL: 
      1. The learning resources MUST be of high academic quality (MIT OCW, freeCodeCamp, official docs).
      2. You MUST provide 8-12 specific, logical "lectures" for this skill that follow a pedagogical flow.
      3. Each lecture title must be descriptive and distinct.
      
      Return a JSON object for a new roadmap node.
    `;

    const response = await callWithRetry((m) => ai.models.generateContent({
      model: m,
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
                  type: { type: Type.STRING }
                }
              }
            }
          },
          required: ["title", "description", "category", "xpReward", "dependencies", "lectures", "resources"]
        }
      }
    }));

    res.json(JSON.parse(response.text || "{}"));
  } catch (error: any) {
    console.error("Express Error /api/gemini/market-demand-skill:", error);
    res.status(500).json({ error: error.message || "Failed to generate market demand skill." });
  }
});

// 7. Generate Daily Quests
app.post("/api/gemini/daily-quests", async (req, res) => {
  try {
    const { specialization, availableNodes, completedNodes } = req.body;
    if (!specialization || !availableNodes || !completedNodes) {
      res.status(400).json({ error: "Missing daily-quests parameters (specialization, availableNodes, completedNodes)." });
      return;
    }

    const model = "gemini-3.5-flash";
    const currentChapter = availableNodes.sort((a: any, b: any) => (a.order || 0) - (b.order || 0))[0];
    const otherAvailable = availableNodes.filter((n: any) => n.id !== currentChapter?.id);

    const prompt = `
      You are a Tactical Mission Generator for a career platform.
      The user is a ${specialization} Engineer.
      
      CONTEXT:
      - SKILLS MASTERED (All Previous): ${completedNodes.map((n: any) => n.title).join(', ') || 'None yet'}.
      - CURRENT CHAPTER (Active Learning): ${currentChapter ? `${currentChapter.title} - ${currentChapter.description}` : 'No specific chapter yet'}.
      - CHAPTER PROGRESS: ${currentChapter?.lectures ? `${currentChapter.lectures.filter((l: any) => l.completed).length}/${currentChapter.lectures.length} lectures completed` : 'N/A'}.
      - COMPLETED LECTURES IN CURRENT: ${currentChapter?.lectures?.filter((l: any) => l.completed).map((l: any) => l.title).join(', ') || 'None'}.
      - REMAINING LECTURES IN CURRENT: ${currentChapter?.lectures?.filter((l: any) => !l.completed).map((l: any) => l.title).join(', ') || 'None'}.
      - UPCOMING CHAPTERS: ${otherAvailable.slice(0, 2).map((n: any) => n.title).join(', ') || 'None'}.
      
      Generate 3 specific, actionable daily quests (missions) for today.
      
      CRITICAL RULES:
      1. MISSION 1 (First Step/Deep Dive): If the user has 0 lectures completed in the "CURRENT CHAPTER", Mission 1 MUST focus on the VERY FIRST lecture of that chapter. If they have some progress, focus on the NEXT immediate lecture. Create a practical exercise for that specific lecture.
      2. MISSION 2 (Reinforcement/Integration): If the user has 0 lectures completed in the "CURRENT CHAPTER", Mission 2 should focus on "Foundational Theory" or "Environment Setup" for this chapter. If they have completed lectures, integrate those specific lectures with "SKILLS MASTERED".
      3. MISSION 3 (Meta/Strategic): A career-focused task related to the ${specialization} field.
      
      STRICT SEQUENCING:
      - NEVER suggest a task for a lecture that comes after the current "Remaining" focus.
      - If the user is at the start of their journey (0 XP), keep tasks simple and foundational.
      - Reference specific lecture titles from the provided context in the quest descriptions.
      
      Return a JSON array of 3 objects with:
      - title: string (short, punchy)
      - description: string (Must follow this structure: "OBJECTIVE: [Goal]. TASK: [Step-by-step what to build]. DELIVERABLE: [What file/screenshot to upload].")
      - xp: number
      - marketDemand: number (0.1 to 1.0 based on current industry relevance of the specific skill in this mission. High-demand tech like K8s, Rust, DistSys should be 0.9+, basics should be 0.4-0.6).
      - type: "technical" | "meta"
    `;

    const response = await callWithRetry((m) => ai.models.generateContent({
      model: m,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              xp: { type: Type.NUMBER },
              marketDemand: { type: Type.NUMBER, description: "Relevance of this quest's specific skill in the current market (0.1 to 1.0)" },
              type: { type: Type.STRING, enum: ["technical", "meta"] }
            },
            required: ["title", "description", "xp", "type", "marketDemand"]
          }
        }
      }
    }));

    res.json(JSON.parse(response.text || "[]"));
  } catch (error: any) {
    console.error("Express Error /api/gemini/daily-quests:", error);
    res.status(500).json({ error: error.message || "Failed to generate daily quests." });
  }
});

// 8. Analyze Quest Submission
app.post("/api/gemini/analyze-quest-submission", async (req, res) => {
  try {
    const { questTitle, fileContent, fileName, mimeType } = req.body;
    if (!questTitle || fileContent === undefined || !fileName) {
      res.status(400).json({ error: "Missing required query parameters (questTitle, fileContent, fileName)." });
      return;
    }

    const model = "gemini-3.5-flash";
    const isImage = mimeType?.startsWith('image/');
    const isScratch = fileName?.toLowerCase().endsWith('.sb3') || false;
    
    // Binary check
    if (!isImage && !isScratch) {
      const binaryChars = (fileContent.substring(0, 1000).match(/[\x00-\x08\x0E\x0F\x10-\x1F]/g) || []);
      if (binaryChars.length > 5) {
        res.json({
          isComplete: false,
          feedback: "The AI Mentor detected binary data. If you are uploading a Scratch project (.sb3) or screenshot, please ensure the format is correct. For best results with Scratch, upload a screenshot of your blocks.",
          score: 0
        });
        return;
      }
    }

    let promptParts: any[] = [];
    
    if (isScratch) {
      promptParts.push({
        text: `
          You are an Elite Engineering Mentor specializing in Scratch and Block-based programming.
          The user has submitted a Scratch Project File (.sb3) for their daily quest: "${questTitle}".
          
          CONTEXT:
          - FILE NAME: ${fileName}
          - NOTE: The file is binary (zip archive).
          
          TASK:
          1. VALIDATION: Mark as complete since the project file has been successfully submitted.
          2. FEEDBACK: Start with 'ACCEPTED: '. Congratulate the user on producing their Scratch project! Advise them that for a detailed code logic review, they should upload a SCREENSHOT of their blocks in the future.
          3. SCORING: Award a high score (90+) for successful project delivery.
        `
      });
    } else if (isImage) {
      promptParts.push({
        inlineData: {
          data: fileContent.includes(',') ? fileContent.split(',')[1] : fileContent,
          mimeType: mimeType
        }
      });
      promptParts.push({
        text: `
          You are an Elite Engineering Mentor. 
          The user has submitted an IMAGE/SCREENSHOT for their daily quest: "${questTitle}".
          
          TASK:
          1. Analyze the screenshot. If it shows code, a completed project (like a Scratch maze), or technical documentation, evaluate it.
          2. VALIDATION: Does this image demonstrate completion of "${questTitle}"?
          3. FEEDBACK: Start with 'ACCEPTED: ' or 'REJECTED: '. Provide 2-3 specific technical pointers or praise.
          4. SCORE: 0-100.
        `
      });
    } else {
      const cleanedContent = fileContent.trim();
      if (!cleanedContent) {
        res.json({
          isComplete: false,
          feedback: "The submitted file appears to be empty. Please provide your solution content.",
          score: 0
        });
        return;
      }

      const truncationLimit = 500000;
      const truncatedContent = cleanedContent.length > truncationLimit 
        ? cleanedContent.substring(0, truncationLimit) + "\n... (content truncated: file exceeds 500k chars. Focusing on top half of the file.)"
        : cleanedContent;

      promptParts.push({
        text: `
          You are an Elite Engineering Mentor and Code Reviewer. 
          The user has submitted a file for their daily quest: "${questTitle}".
          
          SUBMISSION CONTEXT:
          - FILE NAME: ${fileName}
          - CONTENT PREVIEW:
          ${truncatedContent}
          
          ACTION PROTOCOL:
          1. VALIDATION: Determine if the submission HONESTLY fulfills the requirements of "${questTitle}". 
          2. IF REJECTING (isComplete = false): You MUST explain exactly what is missing or incorrect in the feedback. Be encouraging but firm on quality.
          3. IF ACCEPTING (isComplete = true): Provide 2-3 technical pointers for even better results.
          4. SCORING: Award a score from 0-100. A score below 60 should typically result in isComplete = false unless it's a very good first attempt.
        `
      });
    }

    promptParts.push({
      text: `
        RESPONSE FORMAT (STRICT JSON):
        {
          "isComplete": boolean,
          "feedback": "string (Start with 'REJECTED: ' or 'ACCEPTED: ' followed by detailed, peer-review style feedback)",
          "score": number
        }
      `
    });

    const response = await callWithRetry((m) => ai.models.generateContent({
      model: m,
      contents: [{ role: 'user', parts: promptParts }],
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

    const text = response.text || "{}";
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Express Error /api/gemini/analyze-quest-submission:", error);
    res.status(500).json({ error: error.message || "Failed to analyze quest submission." });
  }
});


// Vite middleware mapping
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
