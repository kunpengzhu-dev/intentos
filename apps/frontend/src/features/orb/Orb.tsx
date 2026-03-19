import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, useMotionValue } from 'framer-motion';
import { useIntentConversation } from '../../hooks/useIntentConversation';
import { buildOrbTranscript } from './orb-transcript';
import type { OrbTransitionState } from './types';
import { OrbPanel, OrbSphere } from './components';
import { useOrbDrag } from './useOrbDrag';

export function Orb({
  intentKey,
  transition,
  initialDraft,
  onDraftConsumed,
}: {
  intentKey: string | null;
  transition: OrbTransitionState;
  initialDraft: string;
  onDraftConsumed: () => void;
}) {
  const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 24;
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [panelPlacement, setPanelPlacement] = useState<'top' | 'bottom'>('bottom');
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);
  const orbButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelRafRef = useRef<number | null>(null);
  const panelPlacementRef = useRef<'top' | 'bottom'>('bottom');
  const panelX = useMotionValue(-9999);
  const panelY = useMotionValue(-9999);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isReady = transition.mode === 'ready' && Boolean(intentKey);
  const visibleOpacity = transition.cornered ? 1 : transition.opacity;
  const stageScale = transition.cornered ? 1 : 0.92 + transition.opacity * 0.08;
  const { dragX, dragY, dragBounds, onDragEnd } = useOrbDrag({
    isReady,
    cornered: transition.cornered,
  });
  const conversation = useIntentConversation(intentKey, Boolean(intentKey), {
    streamMessagesInHistory: false,
    includeMessageEventsInActivity: true,
    optimisticMessagesInActivity: true,
  });
  const entries = buildOrbTranscript(conversation.messages, conversation.activityEvents);
  const isConversationPending = conversation.isSending;

  useEffect(() => {
    if (initialDraft) {
      setInput(initialDraft);
      setIsOpen(true);
      onDraftConsumed();
    }
  }, [initialDraft, onDraftConsumed]);

  useEffect(() => {
    if (!isReady) {
      setIsOpen(false);
    }
  }, [isReady]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (!shouldAutoScroll) {
      return;
    }
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [entries, isOpen, shouldAutoScroll]);

  const updatePanelPosition = useCallback(() => {
    if (!isOpen) {
      return;
    }
    const orbEl = orbButtonRef.current;
    if (!orbEl) {
      return;
    }

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
    const nextPlacement =
      spaceBelow >= panelHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';
    const top = nextPlacement === 'bottom' ? orbRect.height + gap : -panelHeight - gap;

    if (panelPlacementRef.current !== nextPlacement) {
      panelPlacementRef.current = nextPlacement;
      setPanelPlacement(nextPlacement);
    }
    panelX.set(Math.round(left));
    panelY.set(Math.round(top));
  }, [isOpen, panelX, panelY]);

  const schedulePanelPositionUpdate = useCallback(() => {
    if (!isOpen || panelRafRef.current !== null) {
      return;
    }

    panelRafRef.current = requestAnimationFrame(() => {
      panelRafRef.current = null;
      updatePanelPosition();
    });
  }, [isOpen, updatePanelPosition]);

  useEffect(() => {
    if (!isReady || !isOpen) {
      return;
    }

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
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!intentKey) {
      setShouldAutoScroll(false);
    }
  }, [intentKey]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setShouldAutoScroll(true);
  }, [isOpen]);

  const handleMessagesScroll = useCallback(
    ({
      scrollTop,
      scrollHeight,
      clientHeight,
    }: {
      scrollTop: number;
      scrollHeight: number;
      clientHeight: number;
    }) => {
      const isNearBottom =
        scrollHeight - clientHeight - scrollTop <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
      setShouldAutoScroll((current) => (current === isNearBottom ? current : isNearBottom));
    },
    [],
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !intentKey || isConversationPending) {
      return;
    }

    setShouldAutoScroll(true);
    await conversation.sendMessage(text);
    setInput('');
  }, [conversation, input, intentKey, isConversationPending]);

  return (
    <AnimatePresence>
      <OrbSphere
        isReady={isReady}
        cornered={transition.cornered}
        visibleOpacity={visibleOpacity}
        stageScale={stageScale}
        dragX={dragX}
        dragY={dragY}
        dragBounds={dragBounds}
        onDragEnd={onDragEnd}
        onToggle={() => {
          if (isReady) {
            setIsOpen((open) => !open);
          }
        }}
        orbButtonRef={orbButtonRef}
      >
        {isOpen && (
          <OrbPanel
            connected={!conversation.error}
            messages={entries}
            isStreaming={isConversationPending}
            input={input}
            onInputChange={setInput}
            onInputEnter={() => {
              void handleSend();
            }}
            onSend={() => {
              void handleSend();
            }}
            onMessagesScroll={handleMessagesScroll}
            onClose={() => setIsOpen(false)}
            placement={panelPlacement}
            panelMotionStyle={{ x: panelX, y: panelY }}
            panelRef={panelRef}
            inputRef={inputRef}
            chatEndRef={chatEndRef}
          />
        )}
      </OrbSphere>
    </AnimatePresence>
  );
}
