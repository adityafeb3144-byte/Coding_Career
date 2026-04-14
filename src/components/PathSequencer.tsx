import { useEffect, useRef } from 'react';
import { collection, onSnapshot, updateDoc, doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { resequenceRoadmap, generateMarketDemandSkill } from '../lib/gemini';

export function PathSequencer() {
  const { profile } = useStore();
  const lastCountRef = useRef<number>(0);
  const isSequencingRef = useRef<boolean>(false);
  const isAddingSkillRef = useRef<boolean>(false);
  const isEnforcingStatusRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastOptimizationTimeRef = useRef<number>(0);
  const lastMarketSkillCheckTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!profile) return;

    const unsubscribe = onSnapshot(collection(db, 'users', profile.uid, 'roadmap'), (snapshot) => {
      // Debounce the entire logic to prevent rapid-fire triggers during bulk updates
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      
      debounceTimerRef.current = setTimeout(async () => {
        const nodes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // 1. Check for daily market skill addition
        const lastAdded = profile.lastMarketSkillAdded ? new Date(profile.lastMarketSkillAdded) : new Date(0);
        const now = new Date();
        
        // 24 hours in milliseconds
        const isNewDay = now.getTime() - lastAdded.getTime() > 24 * 60 * 60 * 1000; 
        const marketSkillCooldown = 60000; // 1 minute cooldown for AI market check

        if (isNewDay && !isAddingSkillRef.current && (Date.now() - lastMarketSkillCheckTimeRef.current > marketSkillCooldown)) {
          isAddingSkillRef.current = true;
          lastMarketSkillCheckTimeRef.current = Date.now();
          console.log("PathSequencer: Daily market intelligence check...");
          
          try {
            const newSkill = await generateMarketDemandSkill(profile.specialization, nodes);
            if (newSkill && newSkill.title) {
              const nodeId = newSkill.title.toLowerCase().replace(/\s+/g, '-');
              
              await setDoc(doc(db, 'users', profile.uid, 'roadmap', nodeId), {
                id: nodeId,
                ...newSkill,
                status: 'locked',
                timestamp: serverTimestamp()
              });

              await updateDoc(doc(db, 'users', profile.uid), {
                lastMarketSkillAdded: now.toISOString()
              });

              console.log(`PathSequencer: Added market skill - ${newSkill.title}`);
            }
          } catch (error) {
            console.error("PathSequencer: Market skill addition failed", error);
          } finally {
            isAddingSkillRef.current = false;
          }
        }

        // 2. Check if we need to re-sequence:
        const hasUnorderedNode = nodes.some((n: any) => !n.order);
        const countChanged = nodes.length !== lastCountRef.current;
        const timeSinceLastOpt = Date.now() - lastOptimizationTimeRef.current;
        const cooldownPeriod = 60000; // 60 seconds cooldown for AI optimization

        if ((countChanged || hasUnorderedNode) && !isSequencingRef.current && nodes.length > 0) {
          if (timeSinceLastOpt < cooldownPeriod && !hasUnorderedNode) {
            console.log("PathSequencer: Optimization in cooldown...");
            return;
          }

          isSequencingRef.current = true;
          lastOptimizationTimeRef.current = Date.now();
          console.log("PathSequencer: Optimization triggered...");

          try {
            const newOrders = await resequenceRoadmap(nodes);
            const batch = writeBatch(db);
            let hasUpdates = false;
            
            for (const update of newOrders) {
              const node = nodes.find(n => n.id === update.nodeId) as any;
              if (node && node.order !== update.order) {
                batch.update(doc(db, 'users', profile.uid, 'roadmap', update.nodeId), {
                  order: update.order
                });
                hasUpdates = true;
              }
            }
            
            if (hasUpdates) await batch.commit();
            lastCountRef.current = nodes.length;
            console.log("PathSequencer: Optimization complete.");
          } catch (error) {
            console.error("PathSequencer: Optimization failed", error);
            // Do NOT reset cooldown on failure, respect the 60s window
          } finally {
            isSequencingRef.current = false;
          }
        }

        // 3. Enforce strict sequential status
        if (nodes.length > 0 && !isSequencingRef.current && !isEnforcingStatusRef.current) {
          isEnforcingStatusRef.current = true;
          const sortedNodes = [...nodes].sort((a: any, b: any) => (a.order || 999) - (b.order || 999));
          let foundFirstIncomplete = false;
          const batch = writeBatch(db);
          let hasUpdates = false;

          try {
            for (const node of sortedNodes as any[]) {
              let targetStatus = node.status;

              if (node.status === 'completed') {
                // Keep it completed
              } else if (!foundFirstIncomplete) {
                targetStatus = 'available';
                foundFirstIncomplete = true;
              } else {
                targetStatus = 'locked';
              }

              if (node.status !== targetStatus) {
                console.log(`PathSequencer: Updating status of ${node.title} to ${targetStatus}`);
                batch.update(doc(db, 'users', profile.uid, 'roadmap', node.id), {
                  status: targetStatus
                });
                hasUpdates = true;
              }
            }
            if (hasUpdates) await batch.commit();
          } catch (error) {
            console.error("PathSequencer: Status enforcement failed", error);
          } finally {
            isEnforcingStatusRef.current = false;
          }
        }
      }, 1000); // 1 second debounce
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [profile]);

  return null;
}
