export interface Lecture {
  id: string;
  title: string;
  completed: boolean;
  xpReward: number;
}

export interface Resource {
  title: string;
  url: string;
  type: "video" | "article";
  isPrimary?: boolean;
}

export interface RoadmapNode {
  id: string;
  title: string;
  description: string;
  category: "SWE" | "Cloud" | "AI";
  order: number;
  dependencies: string[];
  xpReward: number;
  marketDemand: number;
  lectures: Lecture[];
  resources: Resource[];
}

export function getFallbackRoadmap(specialization: string, intensity: string): RoadmapNode[] {
  const levelMult = intensity === "High" ? 1.5 : intensity === "Low" ? 0.75 : 1.0;

  return [
    {
      id: "cs50-introduction",
      title: "CS50: Introduction to Computer Science",
      description: "Understand the core foundational principles of computing, low-level memory management, and algorithm complexity.",
      category: "SWE",
      order: 1,
      dependencies: [],
      xpReward: Math.round(500 * levelMult),
      marketDemand: 0.8,
      resources: [
        { title: "Harvard CS50 Official Course", url: "https://cs50.harvard.edu/x/", type: "video", isPrimary: true },
        { title: "freeCodeCamp Computer Science Principles", url: "https://www.freecodecamp.org/", type: "video" }
      ],
      lectures: [
        { id: "cs50-l1", title: "Binary, Representation, and Low-Level Bits", completed: false, xpReward: 50 },
        { id: "cs50-l2", title: "C Programming & Compilation Lifecycle", completed: false, xpReward: 50 },
        { id: "cs50-l3", title: "Pointers, Memory Addresses, and Heap Allocation", completed: false, xpReward: 50 },
        { id: "cs50-l4", title: "Efficient Sorting and Search Algorithms", completed: false, xpReward: 50 },
        { id: "cs50-l5", title: "Data Structures: Linked Lists & Hash Tables", completed: false, xpReward: 50 }
      ]
    },
    {
      id: "dsa-basics",
      title: "MIT level Algorithms and Data Structures",
      description: "Dive deep into asymptotic notation, Graph algorithms, dynamic programming, and balanced search trees.",
      category: "SWE",
      order: 2,
      dependencies: ["cs50-introduction"],
      xpReward: Math.round(600 * levelMult),
      marketDemand: 0.9,
      resources: [
        { title: "MIT 6.006: Introduction to Algorithms", url: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/", type: "video", isPrimary: true },
        { title: "Visualgo Algorithm Graph Database", url: "https://visualgo.net/", type: "article" }
      ],
      lectures: [
        { id: "dsa-l1", title: "Algorithmic Analysis & Big-O Formals", completed: false, xpReward: 60 },
        { id: "dsa-l2", title: "Breadth-First & Depth-First Search on Graphs", completed: false, xpReward: 60 },
        { id: "dsa-l3", title: "Dijkstra's Algorithm & Shortest Path Solver", completed: false, xpReward: 60 },
        { id: "dsa-l4", title: "Dynamic Programming & Memoization Patterns", completed: false, xpReward: 60 },
        { id: "dsa-l5", title: "Heaps and Priority Queue Implementation", completed: false, xpReward: 60 }
      ]
    },
    {
      id: "database-systems",
      title: "Relational & Non-Relational Database Engineering",
      description: "Master database index design, ACID transaction isolation levels, indexing architecture, and NoSQL mechanics.",
      category: "SWE",
      order: 3,
      dependencies: ["cs50-introduction"],
      xpReward: Math.round(500 * levelMult),
      marketDemand: 0.85,
      resources: [
        { title: "CMU Database Systems (Intro to SQL)", url: "https://db.cs.cmu.edu/", type: "video", isPrimary: true },
        { title: "PostgreSQL Official Internals Documentation", url: "https://www.postgresql.org/docs/", type: "article" }
      ],
      lectures: [
        { id: "db-l1", title: "Database Normalization (1NF, 2NF, 3NF)", completed: false, xpReward: 50 },
        { id: "db-l2", title: "B-Tree Indexes & Query Execution Plans", completed: false, xpReward: 50 },
        { id: "db-l3", title: "ACID Requirements and Write-Ahead Logging", completed: false, xpReward: 50 },
        { id: "db-l4", title: "Concurrency Control & Isolation Levels", completed: false, xpReward: 50 },
        { id: "db-l5", title: "Sharding and Distributed Replication Models", completed: false, xpReward: 50 }
      ]
    },
    {
      id: "system-design",
      title: "System Design & Distributed Scalability",
      description: "Scale applications from thousands of concurrent users to millions using microservices, load balancing, and load caches.",
      category: "SWE",
      order: 4,
      dependencies: ["dsa-basics", "database-systems"],
      xpReward: Math.round(700 * levelMult),
      marketDemand: 0.95,
      resources: [
        { title: "The System Design Primer (Interactive)", url: "https://github.com/donnemartin/system-design-primer", type: "article", isPrimary: true },
        { title: "MIT 6.824 Distributed Systems Syllabus", url: "https://ocw.mit.edu/courses/6-824-distributed-computer-systems-engineering-spring-2006/", type: "video" }
      ],
      lectures: [
        { id: "sd-l1", title: "Load Balancing, Reverse Proxies & CDN Ingress", completed: false, xpReward: 70 },
        { id: "sd-l2", title: "Caching Strategies (Eviction, Write-Through)", completed: false, xpReward: 70 },
        { id: "sd-l3", title: "Message Brokers & Event-Driven Pub/Sub Systems", completed: false, xpReward: 70 },
        { id: "sd-l4", title: "Consistent Hashing & CAP Theorem Analysis", completed: false, xpReward: 70 },
        { id: "sd-l5", title: "Highly Available Database Replication Models", completed: false, xpReward: 70 }
      ]
    },
    {
      id: "linux-fundamentals",
      title: "Linux OS Kernels & Systems Programming",
      description: "Learn terminal controls, file systems, IPC, processes, threading and memory virtualization.",
      category: "Cloud",
      order: 5,
      dependencies: ["cs50-introduction"],
      xpReward: Math.round(500 * levelMult),
      marketDemand: 0.85,
      resources: [
        { title: "Linux Journey Interactive Guide", url: "https://linuxjourney.com/", type: "article", isPrimary: true },
        { title: "Introduction to Linux (freeCodeCamp Course)", url: "https://www.freecodecamp.org/", type: "video" }
      ],
      lectures: [
        { id: "nix-l1", title: "Linux File System Hierarchy & Inodes", completed: false, xpReward: 50 },
        { id: "nix-l2", title: "Process Life Cycles, Signals, and Forking", completed: false, xpReward: 50 },
        { id: "nix-l3", title: "Bash Scripting & Stream Redirection (STDIN/OUT)", completed: false, xpReward: 50 },
        { id: "nix-l4", title: "Memory Allocation & Page Fault Internals", completed: false, xpReward: 50 },
        { id: "nix-l5", title: "Inter-Process Communication (Sockets & Pipes)", completed: false, xpReward: 50 }
      ]
    },
    {
      id: "computer-networking",
      title: "Computer Networks & Layer Protocols",
      description: "Investigate TCP handshake, IP addressing, DNS resolution, and HTTP layers.",
      category: "Cloud",
      order: 6,
      dependencies: ["linux-fundamentals"],
      xpReward: Math.round(500 * levelMult),
      marketDemand: 0.8,
      resources: [
        { title: "Computer Networking Course - freeCodeCamp", url: "https://www.freecodecamp.org/", type: "video", isPrimary: true },
        { title: "RFC 793 - Transmission Control Protocol Specifics", url: "https://datatracker.ietf.org/doc/html/rfc793", type: "article" }
      ],
      lectures: [
        { id: "net-l1", title: "The OSI Model 7-Layer Protocol Suite", completed: false, xpReward: 50 },
        { id: "net-l2", title: "TCP IP Handshake, Sliding Windows & Retransmissions", completed: false, xpReward: 50 },
        { id: "net-l3", title: "Subnetting, IP Addressing & CIDR Calculations", completed: false, xpReward: 50 },
        { id: "net-l4", title: "DNS Infrastructure: Root Servers to Resolvers", completed: false, xpReward: 50 },
        { id: "net-l5", title: "HTTP 1.1 vs HTTP/2 vs HTTP/3 Multiplexing", completed: false, xpReward: 50 }
      ]
    },
    {
      id: "cloud-fundamentals",
      title: "Cloud Infrastructure Architecture",
      description: "Design fault-tolerant setups, multi-region failovers, storage tiers, and VPCs in major cloud services.",
      category: "Cloud",
      order: 7,
      dependencies: ["linux-fundamentals", "computer-networking"],
      xpReward: Math.round(600 * levelMult),
      marketDemand: 0.9,
      resources: [
        { title: "AWS Certified Solutions Architect Course - freeCodeCamp", url: "https://www.freecodecamp.org/", type: "video", isPrimary: true },
        { title: "Google Cloud Architecture Framework Docs", url: "https://cloud.google.com/architecture/framework", type: "article" }
      ],
      lectures: [
        { id: "cld-l1", title: "Virtual Machines vs Hypervisor Virtualization", completed: false, xpReward: 60 },
        { id: "cld-l2", title: "VPC Networks, Subnets and Routing Tables", completed: false, xpReward: 60 },
        { id: "cld-l3", title: "Storage Architectures: Object, Block, and File Store", completed: false, xpReward: 60 },
        { id: "cld-l4", title: "Auto Scaling Groups & Multi-AZ High Availability", completed: false, xpReward: 60 },
        { id: "cld-l5", title: "Identity & Access Management (IAM) Roles", completed: false, xpReward: 60 }
      ]
    },
    {
      id: "docker-containers",
      title: "Containerization with Docker",
      description: "Build slim container images, optimize file layers, configure custom networking, and setup compose files.",
      category: "Cloud",
      order: 8,
      dependencies: ["cloud-fundamentals"],
      xpReward: Math.round(550 * levelMult),
      marketDemand: 0.92,
      resources: [
        { title: "Docker Official Getting Started Lab", url: "https://docs.docker.com/get-started/", type: "article", isPrimary: true },
        { title: "Master Containerization - freeCodeCamp", url: "https://www.freecodecamp.org/", type: "video" }
      ],
      lectures: [
        { id: "dkr-l1", title: "OS Namespaces and Control Groups (cgroups)", completed: false, xpReward: 55 },
        { id: "dkr-l2", title: "Dockerfile Layer Optimization & Multi-Stage Builds", completed: false, xpReward: 55 },
        { id: "dkr-l3", title: "Docker Networking: Bridge, Host, and Overlay networks", completed: false, xpReward: 55 },
        { id: "dkr-l4", title: "Volume Mounting & Persistent Storage Management", completed: false, xpReward: 55 },
        { id: "dkr-l5", title: "Multi-Service Orchestration with Docker Compose", completed: false, xpReward: 55 }
      ]
    },
    {
      id: "kubernetes-orchestration",
      title: "Production Infrastructure with Kubernetes",
      description: "Deploy large distributed clusters, manage scale, configure self-healing services, and configure ingress controllers.",
      category: "Cloud",
      order: 9,
      dependencies: ["docker-containers"],
      xpReward: Math.round(700 * levelMult),
      marketDemand: 0.98,
      resources: [
        { title: "Kubernetes Interactive Training Basics", url: "https://kubernetes.io/docs/tutorials/", type: "article", isPrimary: true },
        { title: "Kubernetes Course for Architects - freeCodeCamp", url: "https://www.freecodecamp.org/", type: "video" }
      ],
      lectures: [
        { id: "k8s-l1", title: "K8s Control Plane Architecture & Node Systems", completed: false, xpReward: 70 },
        { id: "k8s-l2", title: "Pods, Deployments, and ReplicaSets Configs", completed: false, xpReward: 70 },
        { id: "k8s-l3", title: "Service Resolution and Internal Kube-Proxy Networking", completed: false, xpReward: 70 },
        { id: "k8s-l4", title: "Ingress Controllers, SSL Termination & Endpoints", completed: false, xpReward: 70 },
        { id: "k8s-l5", title: "ConfigMaps, Secrets, & PersistentVolume Claims", completed: false, xpReward: 70 }
      ]
    },
    {
      id: "mathematics-for-ml",
      title: "Linear Algebra & Mathematics for Machine Learning",
      description: "Revisit vectors, matrices, eigenvalues, gradients, optimization, and multidimensional calculus.",
      category: "AI",
      order: 10,
      dependencies: ["cs50-introduction"],
      xpReward: Math.round(500 * levelMult),
      marketDemand: 0.85,
      resources: [
        { title: "MIT 18.06: Linear Algebra Full Course", url: "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/", type: "video", isPrimary: true },
        { title: "Stanford Math Foundations of Data Science", url: "https://online.stanford.edu/", type: "article" }
      ],
      lectures: [
        { id: "mth-l1", title: "Vector Spaces, Linear Combinations & Span", completed: false, xpReward: 50 },
        { id: "mth-l2", title: "Matrix Transformations, Ranks and Determinants", completed: false, xpReward: 50 },
        { id: "mth-l3", title: "Eigenvalues, Eigenvectors, and Diagonalization", completed: false, xpReward: 50 },
        { id: "mth-l4", title: "Partial Derivatives & Gradient Vector Descent", completed: false, xpReward: 50 },
        { id: "mth-l5", title: "Jacobian matrices, Taylor Series, and Convexity", completed: false, xpReward: 50 }
      ]
    },
    {
      id: "machine-learning-foundations",
      title: "Classical Machine Learning Algorithms",
      description: "Learn regression, classification, support vector machines, random forests, and validation techniques.",
      category: "AI",
      order: 11,
      dependencies: ["mathematics-for-ml"],
      xpReward: Math.round(600 * levelMult),
      marketDemand: 0.9,
      resources: [
        { title: "Stanford CS229: Machine Learning Course", url: "https://cs229.stanford.edu/", type: "video", isPrimary: true },
        { title: "Scikit-Learn Machine Learning Pipeline Guide", url: "https://scikit-learn.org/stable/", type: "article" }
      ],
      lectures: [
        { id: "ml-l1", title: "Linear and Logistic Regression Mathematics", completed: false, xpReward: 60 },
        { id: "ml-l2", title: "Decision Trees & Ensemble Models (Random Forests)", completed: false, xpReward: 60 },
        { id: "ml-l3", title: "Support Vector Machines (SVM) & Kernel Tricks", completed: false, xpReward: 60 },
        { id: "ml-l4", title: "Bias-Variance Tradeoff & Regularization (L1/L2)", completed: false, xpReward: 60 },
        { id: "ml-l5", title: "Hyperparameter Tunning & Cross-Validation Methods", completed: false, xpReward: 60 }
      ]
    },
    {
      id: "deep-learning-pytorch",
      title: "Deep Learning & Neural Networks with PyTorch",
      description: "Build neural network architectures, backprop equations, activation functions, and optimize training with CUDA.",
      category: "AI",
      order: 12,
      dependencies: ["machine-learning-foundations"],
      xpReward: Math.round(650 * levelMult),
      marketDemand: 0.95,
      resources: [
        { title: "Deep Learning Specialization - Andrew Ng", url: "https://www.deeplearning.ai/", type: "video", isPrimary: true },
        { title: "PyTorch Official Learning Tutorials", url: "https://pytorch.org/tutorials/", type: "article" }
      ],
      lectures: [
        { id: "dl-l1", title: "Artificial Neurons, Feedforward Layers, Activations", completed: false, xpReward: 65 },
        { id: "dl-l2", title: "Backpropagation Equations and Computational Graphs", completed: false, xpReward: 65 },
        { id: "dl-l3", title: "Stochastic Gradient Descent, Adam, & Optimizers", completed: false, xpReward: 65 },
        { id: "dl-l4", title: "Convolutional Neural Networks (CNNs) for Vision", completed: false, xpReward: 65 },
        { id: "dl-l5", title: "Recurrent Neural Networks (RNN) and LSTM Mechanics", completed: false, xpReward: 65 }
      ]
    },
    {
      id: "natural-language-processing",
      title: "Transformer Architectures & NLP Models",
      description: "Master multi-head self-attention, encoding-decoding blocks, position embeddings, and GPT sequence predictors.",
      category: "AI",
      order: 13,
      dependencies: ["deep-learning-pytorch"],
      xpReward: Math.round(700 * levelMult),
      marketDemand: 0.97,
      resources: [
        { title: "Stanford CS224N: Natural Language Processing", url: "https://web.stanford.edu/class/cs224n/", type: "video", isPrimary: true },
        { title: "Hugging Face Interactive NLP Platform", url: "https://huggingface.co/learn/nlp-course", type: "article" }
      ],
      lectures: [
        { id: "nlp-l1", title: "Sequence-to-Sequence Modeling & Classical attention", completed: false, xpReward: 70 },
        { id: "nlp-l2", title: "The Self-Attention Formula and Query Key Values", completed: false, xpReward: 70 },
        { id: "nlp-l3", title: "Transformer Encoder Block & BERT Prefiltering", completed: false, xpReward: 70 },
        { id: "nlp-l4", title: "Transformer Decoder Block & GPT Autoregressions", completed: false, xpReward: 70 },
        { id: "nlp-l5", title: "Positional Encoding & BPE Tokenizer Algorithms", completed: false, xpReward: 70 }
      ]
    },
    {
      id: "large-language-models",
      title: "Generative AI Systems & LLM Engineering",
      description: "Build production RAG pipelines, manage vectorized search databases, optimize prompt graphs, and configure Guardrails.",
      category: "AI",
      order: 14,
      dependencies: ["natural-language-processing"],
      xpReward: Math.round(750 * levelMult),
      marketDemand: 1.0,
      resources: [
        { title: "CS25: Transformers United (Stanford)", url: "https://web.stanford.edu/class/cs25/", type: "video", isPrimary: true },
        { title: "LangChain & LlamaIndex Official Guides", url: "https://js.langchain.com/", type: "article" }
      ],
      lectures: [
        { id: "llm-l1", title: "Retrieval-Augmented Generation (RAG) Architectures", completed: false, xpReward: 75 },
        { id: "llm-l2", title: "Vector Databases & Fast Cosine Indexing (Pinecone/Chroma)", completed: false, xpReward: 75 },
        { id: "llm-l3", title: "LangChain Agents & Function-Calling Tool Loops", completed: false, xpReward: 75 },
        { id: "llm-l4", title: "Reinforcement Learning from Human Feedback (RLHF)", completed: false, xpReward: 75 },
        { id: "llm-l5", title: "Quantization, LLM Fine-Tuning, LoRA & PEFT Systems", completed: false, xpReward: 75 }
      ]
    }
  ];
}

export function getFallbackMarketIntelligence(specialization: string): any[] {
  const isAI = specialization.toLowerCase().includes("ai") || specialization.toLowerCase().includes("ml");
  const isCloud = specialization.toLowerCase().includes("cloud") || specialization.toLowerCase().includes("system") || specialization.toLowerCase().includes("devops");

  if (isAI) {
    return [
      { skillName: "Generative AI & LLM Finetuning", demandScore: 98, benchScore: 22, description: "Managing parameter-efficient adapters like LoRA, system templates, and context windows is highly prioritized." },
      { skillName: "Vector Databases & Semantic Search", demandScore: 94, benchScore: 35, description: "Setting up dense embedded indices using pgvector, Pinecone, or ChromaDB for high-speed search." },
      { skillName: "Deep PyTorch Model Architectures", demandScore: 88, benchScore: 40, description: "Writing multi-dimensional custom layers, tracking weights, and training neural nodes." },
      { skillName: "FastAPI Backend & API Grounding", demandScore: 82, benchScore: 55, description: "Serving machine learning model endpoints securely with high-concurrency event loops." },
      { skillName: "LLM Orchestration frameworks", demandScore: 95, benchScore: 28, description: "Creating responsive autonomous agent loops, memory nodes, and execution systems." }
    ];
  } else if (isCloud) {
    return [
      { skillName: "Kubernetes Orchestration & Helm Plots", demandScore: 96, benchScore: 30, description: "Scaling multi-pod deployments, configure health probes, and orchestrating nodes." },
      { skillName: "Infrastructure as Code (Terraform)", demandScore: 92, benchScore: 38, description: "Writing structured declarative configuration templates to provision global multi-cloud setups." },
      { skillName: "Istio Service Mesh Systems", demandScore: 84, benchScore: 18, description: "Securing internal pod-to-pod mutual TLS, packet routing, and distributed tracing telemetry." },
      { skillName: "CI/CD Deployment Pipelines", demandScore: 89, benchScore: 48, description: "Automating unit test runtimes, static linting checks, and secure image deployment." },
      { skillName: "Prometheus Monitoring & Grafana Plots", demandScore: 86, benchScore: 42, description: "Tracking cluster alerts, custom query metrics, and memory utilization lines." }
    ];
  } else {
    return [
      { skillName: "Advanced System Design & Scalability", demandScore: 95, benchScore: 25, description: "Splitting monolith architectures into microservice layers using consistent routing tables." },
      { skillName: "PostgreSQL Database Engine & Query Optimizations", demandScore: 91, benchScore: 45, description: "Profiling explain plans, designing multi-column indexes, and avoiding table locks." },
      { skillName: "Docker Containerization Standard", demandScore: 88, benchScore: 60, description: "Writing multi-stage build files to generate minimal image files securely." },
      { skillName: "Redis In-Memory Key Caching", demandScore: 85, benchScore: 40, description: "Caching high-frequency queries to reduce direct pressure on relational storage layers." },
      { skillName: "TypeScript Full Stack Development", demandScore: 93, benchScore: 50, description: "Writing robust typed interfaces of backends and responsive frameworks." }
    ];
  }
}

export function getFallbackOpportunities(specialization: string, level: number, completedNodes: any[]): any[] {
  const completedCount = completedNodes.length;

  if (level <= 5) {
    return [
      {
        id: "cs50-lecture-zero",
        title: "Harvard CS50 Level 0 Challenge",
        company: "Nexus Academy Challenge Group",
        type: "Education",
        matchScore: 100,
        xpReward: 150,
        description: "A fun starter milestone to help build your core CS logical foundation in scratch blocks.",
        requirements: ["Logical blocks input"],
        missingSkills: [],
        url: "https://cs50.harvard.edu/x/",
        location: "Remote Web"
      },
      {
        id: "markdown-portfolio",
        title: "Markdown Software Developer Profile",
        company: "Github Open-Source Community",
        type: "Project",
        matchScore: 95,
        xpReward: 200,
        description: "Draft a beautifully styled README documentation sharing your curriculum and developer targets.",
        requirements: ["Technical README layouts", "GitHub usage Basics"],
        missingSkills: [],
        url: "https://github.com/",
        location: "Remote Web"
      },
      {
        id: "scratch-maze-game",
        title: "Algorithmic Maze Game Builder",
        company: "Nexus Academy Gamers Studio",
        type: "Project",
        matchScore: 90,
        xpReward: 250,
        description: "Create an interactive maze algorithm using variable positions and conditional sensors.",
        requirements: ["Scratch or Python Basics"],
        missingSkills: [],
        url: "https://scratch.mit.edu/",
        location: "Remote"
      }
    ];
  }

  // Intermediate-Advanced user
  return [
    {
      id: "postgres-indexes-project",
      title: "Enterprise Relational Database Profiler",
      company: "CMU Database Study Labs",
      type: "Project",
      matchScore: 95,
      xpReward: 350,
      description: "Analyze, optimize, and benchmark SQL queries under dynamic load test operations.",
      requirements: ["PostgreSQL and Schema Tuning"],
      missingSkills: completedCount > 2 ? [] : ["Database Performance tuning"],
      url: "https://db.cs.cmu.edu/",
      location: "Remote Space"
    },
    {
      id: "k8s-multi-stage-setup",
      title: "Kubernetes Helm Deployment Operator",
      company: "Cloud Native Software Hub",
      type: "Open Source",
      matchScore: 88,
      xpReward: 400,
      description: "Contribute to building active YAML charts supporting self-healing high-availability containers.",
      requirements: ["Docker", "Kubernetes"],
      missingSkills: completedCount > 5 ? [] : ["Kubernetes clusters"],
      url: "https://kubernetes.io/",
      location: "Hybrid Node"
    },
    {
      id: "rag-llm-agent-builder",
      title: "Autonomous Semantic RAG Document Agent",
      company: "Nexus Intelligent Systems",
      type: "Project",
      matchScore: 92,
      xpReward: 450,
      description: "Build an active TypeScript server integrating Vector search models and dynamic tool retrieval.",
      requirements: ["TypeScript Backends", "Large Language Models"],
      missingSkills: completedCount > 8 ? [] : ["Vector Search engines"],
      url: "https://js.langchain.com/",
      location: "Remote Hybrid"
    }
  ];
}

export function getFallbackMarketDemandSkill(specialization: string, currentRoadmap: any[]): any {
  return {
    title: "Rust for Systems Engineering & WebAssembly",
    description: "Memory-safe systems language with ultra-high raw speed, critical for cloud infrastructure and modern high-concurrency environments.",
    category: "SWE",
    dependencies: ["cs50-introduction"],
    xpReward: 600,
    marketDemand: 0.95,
    lectures: [
      { id: "rust-fall-l1", title: "Ownership, Borrowing Rules, and Lifetimes", completed: false, xpReward: 60 },
      { id: "rust-fall-l2", title: "Strict Static Concurrency without Data Races", completed: false, xpReward: 60 },
      { id: "rust-fall-l3", title: "Smart Pointers (Box, Rc, Arc, RefCell)", completed: false, xpReward: 60 },
      { id: "rust-fall-l4", title: "WebAssembly Compiler Pipeline Setup", completed: false, xpReward: 60 },
      { id: "rust-fall-l5", title: "High-performance Distributed Cloud Servers", completed: false, xpReward: 60 }
    ],
    resources: [
      { title: "The Rust Programming Language Book", url: "https://doc.rust-lang.org/book/", type: "article", isPrimary: true },
      { title: "Rustlings Interactive Exercises Trainer", url: "https://github.com/rust-lang/rustlings", type: "article" }
    ]
  };
}

export function fallbackResequence(nodes: any[]): { nodeId: string, order: number }[] {
  const result: any[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(nodeId: string) {
    if (visiting.has(nodeId)) {
      return; // Avoid circular loops
    }
    if (!visited.has(nodeId)) {
      visiting.add(nodeId);
      const node = nodes.find(n => n.id === nodeId);
      if (node && node.dependencies) {
        for (const dep of node.dependencies) {
          visit(dep);
        }
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
      result.push(nodeId);
    }
  }

  for (const node of nodes) {
    visit(node.id);
  }

  return result.map((id, index) => ({
    nodeId: id,
    order: index + 1
  }));
}

export function getFallbackDailyQuests(specialization: string, availableNodes: any[]): any[] {
  const currentChapter = availableNodes && availableNodes.length > 0
    ? [...availableNodes].sort((a: any, b: any) => (a.order || 0) - (b.order || 0))[0]
    : null;
  const nextLectureName = currentChapter?.lectures?.find((l: any) => !l.completed)?.title || "Foundational Concepts";

  return [
    {
      title: `Deep-Dive: ${nextLectureName}`,
      description: `OBJECTIVE: Master the concepts of ${nextLectureName}. TASK: Write a detailed summary and create a mini practical implementation illustrating this concept in your scratchpad. DELIVERABLE: Write-up of the core mechanism and a screenshot or code sample of your implementation.`,
      xp: 150,
      marketDemand: currentChapter?.marketDemand || 0.8,
      type: "technical"
    },
    {
      title: "Interactive Integration Lab",
      description: `OBJECTIVE: Synthesize your completed work inside the ${currentChapter?.title || "active"} chapter. TASK: Write a unit test suite or detailed design document modeling the data objects or services in this block. DELIVERABLE: Upload your test script or architectural diagram image.`,
      xp: 200,
      marketDemand: currentChapter?.marketDemand ? Math.min(1, currentChapter.marketDemand + 0.05) : 0.85,
      type: "technical"
    },
    {
      title: `${specialization} Industry Audit`,
      description: "OBJECTIVE: Establish top-tier market orientation. TASK: Select a primary open-source repository or project architecture related to your system stack, and document its scaling bottlenecks and optimization pathways. DELIVERABLE: An engineering proposal analyzing performance metrics.",
      xp: 250,
      marketDemand: 0.9,
      type: "meta"
    }
  ];
}
