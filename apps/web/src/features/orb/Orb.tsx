import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, useMotionValue } from 'framer-motion';
import type { ChatHistoryEntry, ChatHistoryOkPayload, ChatHistorySyncPayload } from '@intentos/protocol';
import { useChatStore } from '../../store/chat';
import { useConnectionStore } from '../../store/connection';
import type { OrbTransitionState } from './types';
import { OrbPanel, OrbSphere } from './components';
import { useOrbDrag } from './useOrbDrag';
import { historyEntryToDisplayText, useSubagentIntentSync } from './useSubagentIntentSync';

const HISTORY_PAGE_SIZE = 20;
const HISTORY_SYNC_INTERVAL_MS = 5000;

function historyEntryToBubble(entry: ChatHistoryEntry, fallbackId: string) {
  return {
    id: entry.id || `history:${fallbackId}`,
    role: entry.role === 'user' ? 'user' : 'assistant',
    content: historyEntryToDisplayText(entry),
    ts: entry.timestamp || Date.now(),
    streaming: false,
  } as const;
}

export function Orb({ transition }: { transition: OrbTransitionState }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [panelPlacement, setPanelPlacement] = useState<'top' | 'bottom'>('bottom');
  const { getClient, state } = useConnectionStore();
  const { messages, addMessage, upsertMessages, applyAssistantDelta, isStreaming } = useChatStore();
  const {
    filterDisplayEntries,
    syncSubagentIntentsFromEntries,
    collectCompletionEntries,
    resetSubagentSyncState,
  } = useSubagentIntentSync();

  const orbButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelRafRef = useRef<number | null>(null);
  const panelPlacementRef = useRef<'top' | 'bottom'>('bottom');
  const panelX = useMotionValue(-9999);
  const panelY = useMotionValue(-9999);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyLimitRef = useRef(HISTORY_PAGE_SIZE);
  const historyLoadingRef = useRef(false);
  const historyLoadedCountRef = useRef(0);
  const historyHasMoreRef = useRef(true);
  const historyInitializedRef = useRef(false);
  const historyPollingRef = useRef(false);
  const skipNextAutoScrollRef = useRef(false);

  const isReady = transition.mode === 'ready';
  const visibleOpacity = transition.cornered ? 1 : transition.opacity;
  const stageScale = transition.cornered ? 1 : 0.92 + transition.opacity * 0.08;
  const { dragX, dragY, dragBounds, onDragEnd } = useOrbDrag({
    isReady,
    cornered: transition.cornered,
  });

  useEffect(() => {
    if (!isReady) {
      setIsOpen(false);
    }
  }, [isReady]);

  const updatePanelPosition = useCallback(() => {
    if (!isOpen) return;
    const orbEl = orbButtonRef.current;
    if (!orbEl) return;

    const orbRect = orbEl.getBoundingClientRect();
    const panelEl = panelRef.current;
    const panelWidth = panelEl?.offsetWidth ?? Math.min(420, window.innerWidth - 24);
    const panelHeight = panelEl?.offsetHeight ?? Math.min(540, window.innerHeight - 24);
    const centerX = orbRect.left + orbRect.width / 2;
    const gap = 14;
    const margin = 12;
    const minLeft = margin;
    const maxLeft = window.innerWidth - margin - panelWidth;
    const clampedLeft = Math.min(maxLeft, Math.max(minLeft, centerX - panelWidth / 2));
    const left = clampedLeft - orbRect.left;

    const spaceBelow = window.innerHeight - orbRect.bottom - margin;
    const spaceAbove = orbRect.top - margin;
    const nextPlacement: 'top' | 'bottom' = spaceBelow >= panelHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';
    const top = nextPlacement === 'bottom'
      ? orbRect.height + gap
      : -panelHeight - gap;

    if (panelPlacementRef.current !== nextPlacement) {
      panelPlacementRef.current = nextPlacement;
      setPanelPlacement(nextPlacement);
    }
    panelX.set(Math.round(left));
    panelY.set(Math.round(top));
  }, [isOpen, panelX, panelY]);

  const schedulePanelPositionUpdate = useCallback(() => {
    if (!isOpen) return;
    if (panelRafRef.current != null) return;
    panelRafRef.current = requestAnimationFrame(() => {
      panelRafRef.current = null;
      updatePanelPosition();
    });
  }, [isOpen, updatePanelPosition]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    chatEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  const loadHistory = useCallback(async (limit: number, reason: 'initial' | 'pagination' = 'initial') => {
    if (state !== 'connected') return;
    if (historyLoadingRef.current) return;
    historyLoadingRef.current = true;
    try {
      const env = await getClient().send('chat/history', { contextId: 'global', limit });
      const payload = env.payload as ChatHistoryOkPayload;
      if (!payload?.accepted) return;
      const entries: ChatHistoryEntry[] = Array.isArray(payload.entries) ? payload.entries : [];
      syncSubagentIntentsFromEntries(entries);
      const bubbles = filterDisplayEntries(entries).map((entry, index) =>
        historyEntryToBubble(entry, `${limit}-${index}`),
      );
      skipNextAutoScrollRef.current = reason === 'pagination';
      upsertMessages(bubbles);

      const previousCount = historyLoadedCountRef.current;
      historyLoadedCountRef.current = entries.length;
      historyLimitRef.current = limit;
      historyHasMoreRef.current = entries.length > previousCount;
      historyInitializedRef.current = true;
    } catch {
      // ignore history load errors in UI path
    } finally {
      historyLoadingRef.current = false;
    }
  }, [filterDisplayEntries, getClient, state, syncSubagentIntentsFromEntries, upsertMessages]);

  useEffect(() => {
    if (state !== 'connected') return;
    const client = getClient();
    const offDelta = client.on('chat/delta', (env) => {
      const payload = env.payload as { delta: string; done: boolean };
      applyAssistantDelta(payload.delta, payload.done, env.id, env.ts);
    });
    const offHistory = client.on('chat/history_sync', (env) => {
      const payload = env.payload as ChatHistorySyncPayload;
      const entries: ChatHistoryEntry[] = Array.isArray(payload.entries) ? payload.entries : [];
      syncSubagentIntentsFromEntries(entries);
      // Incremental history sync is reserved for special-field reconciliation
      // (subagent/runtime-context flows). Regular chat text stays on stream+final.
      const completionEntries = collectCompletionEntries(entries);
      if (completionEntries.length > 0) {
        const bubbles = completionEntries.map((entry, index) =>
          historyEntryToBubble(entry, `${env.id}-completion-${index}`),
        );
        upsertMessages(bubbles);
      }
    });
    return () => {
      offDelta();
      offHistory();
    };
  }, [applyAssistantDelta, collectCompletionEntries, getClient, state, syncSubagentIntentsFromEntries, upsertMessages]);

  useEffect(() => {
    if (state !== 'connected') {
      historyInitializedRef.current = false;
      historyHasMoreRef.current = true;
      historyLoadedCountRef.current = 0;
      historyLimitRef.current = HISTORY_PAGE_SIZE;
      historyPollingRef.current = false;
      resetSubagentSyncState();
      return;
    }
    if (historyInitializedRef.current) return;
    void loadHistory(HISTORY_PAGE_SIZE, 'initial');
  }, [loadHistory, resetSubagentSyncState, state]);

  const pollSubagentCompletion = useCallback(async () => {
    if (state !== 'connected') return;
    if (historyPollingRef.current) return;
    historyPollingRef.current = true;
    try {
      const limit = Math.max(60, historyLimitRef.current);
      const env = await getClient().send('chat/history', { contextId: 'global', limit });
      const payload = env.payload as ChatHistoryOkPayload;
      if (!payload?.accepted) return;
      const entries: ChatHistoryEntry[] = Array.isArray(payload.entries) ? payload.entries : [];
      syncSubagentIntentsFromEntries(entries);
      const completionEntries = collectCompletionEntries(entries);
      if (completionEntries.length > 0) {
        const completionBubbles = completionEntries.map((entry, index) =>
          historyEntryToBubble(entry, `completion-${entry.timestamp}-${index}`),
        );
        upsertMessages(completionBubbles);
      }
    } catch {
      // ignore polling errors in UI path
    } finally {
      historyPollingRef.current = false;
    }
  }, [collectCompletionEntries, getClient, state, syncSubagentIntentsFromEntries, upsertMessages]);

  useEffect(() => {
    if (state !== 'connected') return;
    const timer = window.setInterval(() => {
      if (useChatStore.getState().isStreaming) return;
      void pollSubagentCompletion();
    }, HISTORY_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pollSubagentCompletion, state]);

  useEffect(() => {
    if (!isOpen) return;
    schedulePanelPositionUpdate();
  }, [isOpen, messages, schedulePanelPositionUpdate]);

  useEffect(() => {
    if (!isReady || !isOpen) return;
    const unsubX = dragX.on('change', schedulePanelPositionUpdate);
    const unsubY = dragY.on('change', schedulePanelPositionUpdate);
    const onResize = () => schedulePanelPositionUpdate();
    const onScroll = () => schedulePanelPositionUpdate();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    schedulePanelPositionUpdate();
    return () => {
      unsubX();
      unsubY();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [dragX, dragY, isOpen, isReady, schedulePanelPositionUpdate]);

  useEffect(() => {
    if (!isOpen) return;
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }
    scrollToBottom('auto');
  }, [isOpen, messages, scrollToBottom]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      scrollToBottom('auto');
      updatePanelPosition();
    });
  }, [isOpen, scrollToBottom, updatePanelPosition]);

  useEffect(() => () => {
    if (panelRafRef.current != null) {
      cancelAnimationFrame(panelRafRef.current);
      panelRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || state !== 'connected') return;
    addMessage({ id: crypto.randomUUID(), role: 'user', content: text, ts: Date.now() });
    setInput('');
    getClient().sendFire('chat/send', { message: text, contextId: 'global' });
  }, [addMessage, getClient, input, state]);

  const handleMessagesScroll = useCallback((scrollTop: number) => {
    if (!isOpen) return;
    if (scrollTop > 24) return;
    if (historyLoadingRef.current) return;
    if (!historyHasMoreRef.current) return;
    void loadHistory(historyLimitRef.current + HISTORY_PAGE_SIZE, 'pagination');
  }, [isOpen, loadHistory]);

  return (
    <>
      <OrbSphere
        isReady={isReady}
        cornered={transition.cornered}
        visibleOpacity={visibleOpacity}
        stageScale={stageScale}
        dragX={dragX}
        dragY={dragY}
        dragBounds={dragBounds}
        onDragEnd={onDragEnd}
        orbButtonRef={orbButtonRef}
        onToggle={() => {
          if (isReady) {
            setIsOpen((value) => !value);
          }
        }}
      >
        <AnimatePresence>
          {isReady && isOpen && (
            <OrbPanel
              connected={state === 'connected'}
              messages={messages}
              isStreaming={isStreaming}
              input={input}
              onInputChange={setInput}
              onInputEnter={handleSend}
              onSend={handleSend}
              onClose={() => setIsOpen(false)}
              onMessagesScroll={handleMessagesScroll}
              placement={panelPlacement}
              panelMotionStyle={{ x: panelX, y: panelY }}
              panelRef={panelRef}
              inputRef={inputRef}
              chatEndRef={chatEndRef}
            />
          )}
        </AnimatePresence>
      </OrbSphere>
    </>
  );
}
