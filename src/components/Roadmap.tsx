import { useState, useEffect, useCallback } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  Node, 
  Edge, 
  Connection, 
  addEdge,
  Handle,
  Position,
  NodeProps,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { collection, onSnapshot, doc, updateDoc, increment, writeBatch, getDocs, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, calculateStreak } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, CheckCircle2, Play, ExternalLink, ZoomIn, ZoomOut, Maximize, RefreshCw, Sparkles, Zap, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateInitialRoadmap } from '../lib/gemini';

const nodeWidth = 250;
const nodeHeight = 100;

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  if (nodes.length === 0) return { nodes, edges };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  dagreGraph.setGraph({ 
    rankdir: 'TB', 
    nodesep: 150,
    ranksep: 180,
    marginx: 100,
    marginy: 100
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (nodeWithPosition) {
      node.position = {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      };
    }
  });

  return { nodes, edges };
};

// Custom Node Component
const SkillNode = ({ data }: NodeProps) => {
  const isLocked = data.status === 'locked';
  const isCompleted = data.status === 'completed';

  return (
    <div className={cn(
      "px-5 py-4 rounded-2xl border-2 shadow-2xl w-[260px] transition-all duration-500",
      isLocked ? "bg-zinc-900/50 border-zinc-800 opacity-40 grayscale" : 
      isCompleted ? "bg-emerald-950/30 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]" :
      "bg-zinc-900 border-white shadow-[0_0_30px_rgba(255,255,255,0.05)]"
    )}>
      <Handle type="target" position={Position.Top} className="w-4 h-4 bg-zinc-800 border-2 border-zinc-700 -top-2" />
      
      <div className="flex items-center justify-between mb-2">
        <Badge variant="outline" className={cn(
          "text-[10px] px-1 py-0 border-zinc-700",
          data.category === 'SWE' ? "text-blue-400" : 
          data.category === 'Cloud' ? "text-emerald-400" : "text-purple-400"
        )}>
          {data.category}
        </Badge>
        {isLocked && <Lock className="h-3 w-3 text-zinc-600" />}
        {isCompleted && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
      </div>
      
      <div className="font-bold text-sm tracking-tight mb-1 truncate flex items-center gap-2">
        {data.order && (
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white text-black flex items-center justify-center text-[11px] font-black shadow-[0_0_10px_rgba(255,255,255,0.3)]">
            {data.order}
          </span>
        )}
        <span className="truncate">{data.title}</span>
      </div>
      <div className="text-[10px] text-zinc-500 font-mono">+{data.xpReward} XP</div>

      {data.lectures && data.lectures.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-[8px] font-mono text-zinc-500 uppercase tracking-widest">
            <span>Progress</span>
            <span>{data.lectures.filter((l: any) => l.completed).length}/{data.lectures.length}</span>
          </div>
          <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 transition-all duration-500" 
              style={{ width: `${(data.lectures.filter((l: any) => l.completed).length / data.lectures.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="w-4 h-4 bg-zinc-800 border-2 border-zinc-700 -bottom-2" />
    </div>
  );
};

const nodeTypes = {
  skill: SkillNode,
};

export function Roadmap() {
  return (
    <ReactFlowProvider>
      <RoadmapContent />
    </ReactFlowProvider>
  );
}

function RoadmapContent() {
  const { profile, setActiveTab } = useStore();
  const { fitView, zoomIn, zoomOut, getViewport } = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isRebuildModalOpen, setIsRebuildModalOpen] = useState(false);
  const [xpGain, setXpGain] = useState<{ amount: number, id: string } | null>(null);

  const handleRebuild = async (resetXP = false) => {
    if (!profile || isRebuilding) return;
    
    console.log("Starting roadmap rebuild from Skill Tree...");
    setIsRebuilding(true);
    setIsRebuildModalOpen(false);
    try {
      if (resetXP) {
        console.log("Master Reset: Resetting XP and Specialization...");
        const profileRef = doc(db, 'public_profiles', profile.uid);
        const userRef = doc(db, 'users', profile.uid);
        const batch = writeBatch(db);
        batch.update(profileRef, { xp: 0, level: 1, specialization: 'Software + Cloud + AI' });
        batch.update(userRef, { xp: 0, level: 1, specialization: 'Software + Cloud + AI' });
        await batch.commit();
      }

      const roadmapSnap = await getDocs(collection(db, 'users', profile.uid, 'roadmap'));
      console.log(`Found ${roadmapSnap.size} existing nodes to clear.`);
      
      if (roadmapSnap.size > 0) {
        const deleteBatch = writeBatch(db);
        roadmapSnap.docs.forEach(d => deleteBatch.delete(d.ref));
        await deleteBatch.commit();
        console.log("Existing roadmap cleared.");
      }

      const specToUse = resetXP ? 'Software + Cloud + AI' : (profile.specialization || 'Software + Cloud + AI');
      const newNodes = await generateInitialRoadmap(specToUse, profile.intensity);
      console.log(`Generated ${newNodes.length} new nodes.`);
      
      if (newNodes.length > 0) {
        const saveBatch = writeBatch(db);
        let remainingXp = resetXP ? 0 : profile.xp;
        console.log(`Smart Restore: Attempting to restore progress using ${remainingXp} XP.`);

        const sortedNodes = [...newNodes].sort((a, b) => (a.order || 0) - (b.order || 0));

        for (const node of sortedNodes) {
          const nodeRef = doc(db, 'users', profile.uid, 'roadmap', node.id);
          
          const nodeTotalXp = node.lectures.reduce((sum: number, l: any) => sum + (l.xpReward || 50), 0);
          
          let status = 'locked';
          let updatedLectures = node.lectures.map((l: any) => ({ ...l, completed: false }));

          if (remainingXp >= nodeTotalXp) {
            status = 'completed';
            updatedLectures = node.lectures.map((l: any) => ({ ...l, completed: true }));
            remainingXp -= nodeTotalXp;
            console.log(`Smart Restore: Auto-completed node "${node.title}"`);
          } else if (remainingXp > 0) {
            status = 'available';
            updatedLectures = node.lectures.map((l: any) => {
              if (remainingXp >= (l.xpReward || 50)) {
                remainingXp -= (l.xpReward || 50);
                return { ...l, completed: true };
              }
              return l;
            });
            console.log(`Smart Restore: Partially completed node "${node.title}"`);
          } else if (node.dependencies.length === 0 || sortedNodes.indexOf(node) === 0) {
            status = 'available';
          }

          saveBatch.set(nodeRef, {
            ...node,
            lectures: updatedLectures,
            status
          });
        }
        await saveBatch.commit();
        console.log("New roadmap saved to Firestore with Smart Restore.");
      }
      setSelectedNode(null);
      console.log("Roadmap rebuild complete.");
    } catch (error) {
      console.error("Roadmap rebuild failed:", error);
      handleFirestoreError(error, OperationType.WRITE, `users/${profile.uid}/roadmap`);
    } finally {
      setIsRebuilding(false);
    }
  };

  useEffect(() => {
    if (!profile || !profile.uid) return;

    const roadmapRef = collection(db, 'users', profile.uid, 'roadmap');
    const unsubscribe = onSnapshot(roadmapRef, (snapshot) => {
      const initialNodes: Node[] = [];
      const initialEdges: Edge[] = [];

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        initialNodes.push({
          id: doc.id,
          type: 'skill',
          position: { x: 0, y: 0 },
          data: { ...data },
        });

        data.dependencies?.forEach((depId: string) => {
          const isAvailable = data.status === 'available';
          const isCompleted = data.status === 'completed';
          
          initialEdges.push({
            id: `e-${depId}-${doc.id}`,
            source: depId,
            target: doc.id,
            type: 'default', // Bezier curves look more like organic tree branches
            animated: isAvailable && !isCompleted,
            style: { 
              stroke: isCompleted ? '#10b981' : isAvailable ? '#ffffff' : '#3f3f46',
              strokeWidth: isAvailable || isCompleted ? 2 : 1,
              opacity: isAvailable || isCompleted ? 1 : 0.4
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: isCompleted ? '#10b981' : isAvailable ? '#ffffff' : '#3f3f46',
            },
          });
        });
      });

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        initialNodes,
        initialEdges
      );

      // We strictly use the 'order' property provided by the AI Mentor.
      // If a node doesn't have an 'order' yet, it won't display a number,
      // signaling that the AI needs to categorize it.
      setNodes([...layoutedNodes]);
      setEdges([...layoutedEdges]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${profile.uid}/roadmap`);
    });

    return () => unsubscribe();
  }, [profile]);

  const onNodeClick = (_: any, node: Node) => {
    setSelectedNode({ ...node.data, id: node.id });
  };

  const completeLecture = async (nodeId: string, lectureId: string, xp: number = 50) => {
    if (!profile || !selectedNode) return;

    // Ensure xp is a valid number
    const rewardXp = typeof xp === 'number' ? xp : 50;
    
    // Calculate marketPowerGain as per the specific skill's world demand and learned progress
    const demand = typeof selectedNode.marketDemand === 'number' ? selectedNode.marketDemand : 0.5;
    const marketPowerGain = Math.round(rewardXp * demand);

    try {
      const updatedLectures = selectedNode.lectures.map((l: any) => 
        l.id === lectureId ? { ...l, completed: true } : l
      );

      const allCompleted = updatedLectures.every((l: any) => l.completed);

      const batch = writeBatch(db);

      // Streak Logic
      const { newStreak, shouldUpdate: shouldUpdateStreak } = calculateStreak(profile.lastActive, profile.streak || 0);

      // Update node
      batch.set(doc(db, 'users', profile.uid, 'roadmap', nodeId), {
        lectures: updatedLectures,
        status: allCompleted ? 'completed' : 'available'
      }, { merge: true });

      // Update user XP, Streak, and marketPower
      const userUpdate: any = {
        xp: increment(rewardXp),
        marketPower: increment(marketPowerGain),
        lastActive: new Date().toISOString()
      };
      if (shouldUpdateStreak) {
        userUpdate.streak = newStreak;
      }

      batch.set(doc(db, 'users', profile.uid), userUpdate, { merge: true });

      batch.set(doc(db, 'public_profiles', profile.uid), {
        xp: increment(rewardXp),
        marketPower: increment(marketPowerGain)
      }, { merge: true });

      await batch.commit();

      // Update local state for detail panel
      setSelectedNode({
        ...selectedNode,
        lectures: updatedLectures,
        status: allCompleted ? 'completed' : 'available'
      });

      // Optimistically update store profile for instant UI feedback and rank recalculation
      useStore.getState().setProfile({
        ...profile,
        xp: profile.xp + rewardXp,
        marketPower: (profile.marketPower || 0) + marketPowerGain,
        streak: shouldUpdateStreak ? newStreak : profile.streak,
        lastActive: new Date().toISOString()
      });

      // Show XP gain notification
      setXpGain({ amount: rewardXp, id: Date.now().toString() });
      setTimeout(() => setXpGain(null), 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${profile.uid}/roadmap/${nodeId}`);
    }
  };

  const completeNode = async (nodeId: string, xp: number = 250) => {
    if (!profile) return;
    
    // Ensure xp is a valid number
    const rewardXp = typeof xp === 'number' ? xp : 250;

    // Calculate marketPowerGain based on this node/chapter's market demand
    const isSelected = selectedNode && selectedNode.id === nodeId;
    const demand = isSelected && typeof selectedNode.marketDemand === 'number' ? selectedNode.marketDemand : 0.5;
    const marketPowerGain = Math.round(rewardXp * demand);

    try {
      const batch = writeBatch(db);

      // Streak Logic
      const { newStreak, shouldUpdate: shouldUpdateStreak } = calculateStreak(profile.lastActive, profile.streak || 0);

      // Update node status
      batch.set(doc(db, 'users', profile.uid, 'roadmap', nodeId), {
        status: 'completed'
      }, { merge: true });

      // Update user XP, level, and marketPower
      const newXp = profile.xp + rewardXp;
      const newLevel = Math.floor(newXp / 1000) + 1;
      
      const userUpdate: any = {
        xp: increment(rewardXp),
        marketPower: increment(marketPowerGain),
        level: newLevel,
        lastActive: new Date().toISOString()
      };
      if (shouldUpdateStreak) {
        userUpdate.streak = newStreak;
      }

      batch.set(doc(db, 'users', profile.uid), userUpdate, { merge: true });

      batch.set(doc(db, 'public_profiles', profile.uid), {
        xp: increment(rewardXp),
        marketPower: increment(marketPowerGain),
        level: newLevel
      }, { merge: true });

      await batch.commit();

      // Optimistically update store profile
      useStore.getState().setProfile({
        ...profile,
        xp: newXp,
        marketPower: (profile.marketPower || 0) + marketPowerGain,
        level: newLevel,
        streak: shouldUpdateStreak ? newStreak : profile.streak,
        lastActive: new Date().toISOString()
      });

      // Show XP gain notification
      setXpGain({ amount: rewardXp, id: Date.now().toString() });
      setTimeout(() => setXpGain(null), 2000);

      setSelectedNode(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${profile.uid}/roadmap/${nodeId}`);
    }
  };

  return (
    <div className="h-full flex relative bg-zinc-950">
      <div className="flex-1 h-full relative">
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
          <div className="flex bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-lg p-1 shadow-2xl">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-zinc-400 hover:text-white"
              onClick={() => fitView({ duration: 800, padding: 0.2 })}
              title="Fit View"
            >
              <Maximize className="h-4 w-4" />
            </Button>
            <div className="w-[1px] bg-zinc-800 mx-1 my-1" />
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-zinc-400 hover:text-white"
              onClick={() => {
                const { zoom } = getViewport();
                zoomIn({ duration: 300 });
              }}
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-zinc-400 hover:text-white"
              onClick={() => zoomOut({ duration: 300 })}
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <div className="w-[1px] bg-zinc-800 mx-1 my-1" />
            <Button 
              variant="ghost" 
              size="sm" 
              className={cn("h-8 px-3 text-yellow-500 hover:text-yellow-400 font-mono text-[9px] uppercase tracking-widest gap-2", isRebuilding && "animate-spin")}
              onClick={() => setIsRebuildModalOpen(true)}
              disabled={isRebuilding}
            >
              <RefreshCw className="h-3 w-3" />
              <span className="hidden sm:inline">Rebuild Tree</span>
            </Button>
          </div>
        </div>

        {/* Rebuild Confirmation Modal */}
        <AnimatePresence>
          {isRebuildModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"
              >
                <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mb-6">
                  <RefreshCw className="h-6 w-6 text-yellow-500" />
                </div>
                <h3 className="text-xl font-black tracking-tighter uppercase mb-4">Rebuild Curriculum?</h3>
                <div className="space-y-4 text-zinc-400 text-sm mb-8">
                  <p>This will regenerate your Skill Tree with <strong>Academic-Grade</strong> content. I will prioritize resources from MIT OCW, Harvard CS50, and freeCodeCamp.</p>
                  <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <p className="text-white font-bold mb-1 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      Academic Rigor Mode
                    </p>
                    <p className="text-xs">Nexus will use the absolute best academic resources available globally. This is a destructive operation and will replace your current curriculum structure.</p>
                  </div>
                  <p className="text-xs italic">Choose "MASTER RESET" to start from XP 0 with the Software + Cloud + AI path, or "REBUILD" to keep your current progress.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <Button 
                      variant="ghost" 
                      className="flex-1 hover:bg-zinc-800"
                      onClick={() => setIsRebuildModalOpen(false)}
                    >
                      CANCEL
                    </Button>
                    <Button 
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold"
                      onClick={() => handleRebuild(false)}
                    >
                      REBUILD
                    </Button>
                  </div>
                  <Button 
                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black"
                    onClick={() => handleRebuild(true)}
                  >
                    MASTER RESET (XP 0)
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.05}
          maxZoom={2}
          panOnScroll={true}
          selectionOnDrag={true}
          panOnDrag={[1, 2]} // Allow panning with left or middle mouse button
          zoomOnScroll={true}
          zoomOnPinch={true}
          zoomOnDoubleClick={true}
          className="bg-zinc-950"
        >
          <Background color="#27272a" gap={20} size={1} />
          <Controls 
            showInteractive={false} 
            className="bg-zinc-900 border-zinc-800 fill-white [&_button]:border-zinc-800 [&_button]:bg-zinc-900 [&_button:hover]:bg-zinc-800" 
          />
          <MiniMap 
            className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
            nodeColor={(n) => {
              if (n.data.status === 'completed') return '#10b981';
              if (n.data.status === 'available') return '#ffffff';
              return '#27272a';
            }}
            maskColor="rgba(0, 0, 0, 0.5)"
          />
          <div className="absolute bottom-4 left-4 z-10 hidden md:block">
            <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-lg p-2 text-[10px] font-mono text-zinc-500 flex gap-4">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-zinc-700" />
                <span>DRAG TO PAN</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-zinc-700" />
                <span>SCROLL TO ZOOM</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-zinc-700" />
                <span>PINCH TO ZOOM</span>
              </div>
            </div>
          </div>
        </ReactFlow>
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {xpGain && (
          <motion.div
            key={xpGain.id}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.8 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 text-black px-6 py-2 rounded-full font-black shadow-[0_0_30px_rgba(16,185,129,0.4)] flex items-center gap-2"
          >
            <Zap className="h-4 w-4 fill-black" />
            +{xpGain.amount} XP EARNED
          </motion.div>
        )}

        {selectedNode && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed md:absolute inset-y-0 right-0 w-full md:w-96 border-l border-zinc-800 bg-zinc-900/95 md:bg-zinc-900/90 backdrop-blur-xl p-6 overflow-y-auto z-[60]"
          >
            <div className="flex justify-between items-start mb-6">
              <Badge className={cn(
                selectedNode.category === 'SWE' ? "bg-blue-500" : 
                selectedNode.category === 'Cloud' ? "bg-emerald-500" : "bg-purple-500"
              )}>
                {selectedNode.category}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setSelectedNode(null)}>Close</Button>
            </div>

            <h2 className="text-2xl font-black tracking-tighter mb-2 uppercase">{selectedNode.title}</h2>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">{selectedNode.description}</p>

            <div className="space-y-6">
              {/* Lectures Section */}
              {selectedNode.lectures && selectedNode.lectures.length > 0 ? (
                <div>
                  <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-3">Course Lectures</h4>
                  <div className="space-y-2">
                    {selectedNode.lectures.map((lecture: any) => (
                      <div 
                        key={lecture.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-all",
                          lecture.completed ? "bg-emerald-500/10 border-emerald-500/50" : "bg-zinc-800/50 border-zinc-700/50"
                        )}
                      >
                        <div className="flex flex-col">
                          <span className={cn("text-sm font-medium", lecture.completed && "text-emerald-500")}>
                            {lecture.title}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">+{lecture.xpReward} XP</span>
                        </div>
                        {lecture.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : selectedNode.status === 'locked' ? (
                          <Lock className="h-4 w-4 text-zinc-600" />
                        ) : (
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-7 px-2 text-[10px] hover:bg-white hover:text-black"
                            onClick={() => completeLecture(selectedNode.id, lecture.id, lecture.xpReward)}
                          >
                            COMPLETE
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                  <div className="flex items-center gap-2 mb-2 text-yellow-500">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-widest">Data Incomplete</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mb-3 leading-relaxed">
                    This skill node was initialized without lecture data. Please use the "REBUILD TREE" button at the top to sync your profile.
                  </p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-3">Learning Resources</h4>
                <div className="space-y-4">
                  {/* Primary Resource */}
                  {selectedNode.resources?.filter((r: any, i: number) => r.isPrimary || i === 0).map((res: any, i: number) => (
                    <div key={`primary-${i}`}>
                      <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest mb-2 block">Primary Source</span>
                      <div className="flex items-center gap-2">
                        <a 
                          href={res.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-between p-4 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors border border-emerald-500/30 group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                              <Play className="h-5 w-5 fill-current" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-white">{res.title}</span>
                              <span className="text-[10px] text-emerald-500/70 uppercase font-mono">Recommended Path</span>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-emerald-500/50" />
                        </a>
                        <a 
                          href={`https://www.google.com/search?q=${encodeURIComponent(res.title + " " + selectedNode.title + " tutorial")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 hover:bg-emerald-500/20 rounded-xl text-emerald-500/50 hover:text-emerald-500 transition-colors border border-emerald-500/10"
                          title="Search fallback"
                        >
                          <Sparkles className="h-5 w-5" />
                        </a>
                      </div>
                    </div>
                  ))}

                  {/* Alternative Resources */}
                  {selectedNode.resources?.filter((r: any, i: number) => !r.isPrimary && i !== 0).length > 0 && (
                    <div className="pt-2">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2 block">Alternative Options</span>
                      <div className="space-y-2">
                        {selectedNode.resources?.filter((r: any, i: number) => !r.isPrimary && i !== 0).map((res: any, i: number) => (
                          <div key={`alt-container-${i}`} className="flex items-center gap-2">
                            <a 
                              key={`alt-${i}`} 
                              href={res.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex-1 flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors border border-zinc-700/50"
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded bg-zinc-800 flex items-center justify-center text-zinc-500">
                                  <Play className="h-3 w-3" />
                                </div>
                                <span className="text-xs font-medium text-zinc-300">{res.title}</span>
                              </div>
                              <ExternalLink className="h-3 w-3 text-zinc-600" />
                            </a>
                            <a 
                              href={`https://www.google.com/search?q=${encodeURIComponent(res.title + " " + selectedNode.title + " tutorial")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-600 hover:text-zinc-400 transition-colors"
                              title="Search fallback"
                            >
                              <Sparkles className="h-3 w-3" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-800">
                {selectedNode.status === 'completed' ? (
                  <div className="flex items-center gap-2 text-emerald-500 font-bold">
                    <CheckCircle2 className="h-5 w-5" />
                    MASTERY ACHIEVED
                  </div>
                ) : selectedNode.status === 'locked' ? (
                  <div className="flex items-center gap-2 text-zinc-500 font-bold italic">
                    <Lock className="h-5 w-5" />
                    PREREQUISITES REQUIRED
                  </div>
                ) : (
                  <Button 
                    className="w-full bg-white text-black hover:bg-zinc-200"
                    onClick={() => completeNode(selectedNode.id, selectedNode.xpReward)}
                  >
                    COMPLETE & EARN {selectedNode.xpReward} XP
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
