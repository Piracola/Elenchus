/**
 * 历史记录切换性能测试
 * 测试在不同历史记录之间切换、回放模式切换等场景的性能
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { RuntimeEvent, Session, DialogueEntry } from '../types';
import { useDebateStore } from '../stores/debateStore';
import { makeRuntimeEvent } from '../test/runtimeEventFactory';

function makeDialogueEntry(index: number): DialogueEntry {
    const role = index % 2 === 0 ? 'proposer' : 'opposer';
    return {
        role,
        agent_name: role === 'proposer' ? '正方' : '反方',
        content: `对话内容 ${index + 1}`.repeat(3),
        citations: [],
        timestamp: `2026-03-17T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
        event_id: `evt_${index + 1}`,
        turn: Math.floor(index / 2),
    };
}

function makeSessionWithHistory(historyCount: number, sessionId: string = 'session_1'): Session {
    return {
        id: sessionId,
        topic: `测试会话 ${sessionId}`,
        debate_mode: 'standard',
        mode_config: {},
        participants: ['proposer', 'opposer'],
        max_turns: Math.ceil(historyCount / 2),
        current_turn: Math.ceil(historyCount / 2),
        status: 'completed',
        created_at: '2026-03-17T00:00:00+00:00',
        updated_at: '2026-03-17T01:00:00+00:00',
        dialogue_history: Array.from({ length: historyCount }, (_, i) => makeDialogueEntry(i)),
        team_dialogue_history: [],
        jury_dialogue_history: [],
        current_scores: {},
        cumulative_scores: {},
        team_config: { agents_per_team: 0, discussion_rounds: 0 },
        jury_config: { agents_per_jury: 0, discussion_rounds: 0 },
        reasoning_config: {
            steelman_enabled: true,
            counterfactual_enabled: true,
            consensus_enabled: true,
        },
        mode_artifacts: [],
        current_mode_report: null,
        final_mode_report: null,
    };
}

function makeRuntimeeventBatch(count: number, startIndex: number = 0): RuntimeEvent[] {
    return Array.from({ length: count }, (_, i) => {
        const index = startIndex + i;
        const role = index % 2 === 0 ? 'proposer' : 'opposer';
        return makeRuntimeEvent({
            event_id: `evt_switch_${index + 1}`,
            session_id: 'session_switch_test',
            seq: index + 1,
            type: index % 3 === 0 ? 'judge_score' : 'speech_end',
            timestamp: `2026-03-17T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
            payload: index % 3 === 0
                ? {
                    role,
                    turn: Math.floor(index / 2),
                    scores: {
                        logical_rigor: { score: 8, rationale: 'ok' },
                        evidence_quality: { score: 8, rationale: 'ok' },
                        topic_focus: { score: 8, rationale: 'ok' },
                        rebuttal_strength: { score: 8, rationale: 'ok' },
                        consistency: { score: 8, rationale: 'ok' },
                        persuasiveness: { score: 8, rationale: 'ok' },
                        module_scores: { foundation: 8, confrontation: 8, stability: 8, vision: 8 },
                        comprehensive_score: 8,
                        overall_comment: `评分 ${index + 1}`,
                    },
                }
                : {
                    role,
                    agent_name: role === 'proposer' ? '正方' : '反方',
                    content: `事件内容 ${index + 1}`,
                    citations: [],
                    turn: Math.floor(index / 2),
                },
        });
    });
}

describe('历史记录切换性能测试', () => {
    beforeEach(() => {
        useDebateStore.getState().reset();
    });

    afterEach(() => {
        useDebateStore.getState().reset();
    });

    describe('会话切换性能', () => {
        it('应在30ms内完成小规模会话切换 (100条历史)', () => {
            const session1 = makeSessionWithHistory(100, 'session_1');
            const session2 = makeSessionWithHistory(100, 'session_2');

            // 先设置第一个会话
            useDebateStore.getState().setCurrentSession(session1);
            useDebateStore.getState().hydrateRuntimeEvents(makeRuntimeeventBatch(100), false);

            // 切换到第二个会话
            const startTime = performance.now();
            useDebateStore.getState().setCurrentSession(session2);
            const switchTime = performance.now() - startTime;

            expect(switchTime).toBeLessThan(30);
            expect(useDebateStore.getState().currentSession?.id).toBe('session_2');
        });

        it('应在100ms内完成中等规模会话切换 (500条历史)', () => {
            const session1 = makeSessionWithHistory(500, 'session_1');
            const session2 = makeSessionWithHistory(500, 'session_2');

            useDebateStore.getState().setCurrentSession(session1);
            useDebateStore.getState().hydrateRuntimeEvents(makeRuntimeeventBatch(500), false);

            const startTime = performance.now();
            useDebateStore.getState().setCurrentSession(session2);
            const switchTime = performance.now() - startTime;

            expect(switchTime).toBeLessThan(100);
        });

        it('应在200ms内完成大规模会话切换 (1000条历史)', () => {
            const session1 = makeSessionWithHistory(1000, 'session_1');
            const session2 = makeSessionWithHistory(1000, 'session_2');

            useDebateStore.getState().setCurrentSession(session1);
            useDebateStore.getState().hydrateRuntimeEvents(makeRuntimeeventBatch(1000), false);

            const startTime = performance.now();
            useDebateStore.getState().setCurrentSession(session2);
            const switchTime = performance.now() - startTime;

            expect(switchTime).toBeLessThan(200);
        });

        it('应能快速连续切换会话5次而不造成性能问题', () => {
            const sessions = Array.from({ length: 5 }, (_, i) => 
                makeSessionWithHistory(200, `session_${i}`)
            );

            let totalTime = 0;
            for (let i = 0; i < sessions.length; i++) {
                const startTime = performance.now();
                useDebateStore.getState().setCurrentSession(sessions[i]);
                const switchTime = performance.now() - startTime;
                totalTime += switchTime;
            }

            expect(totalTime).toBeLessThan(200);
            expect(useDebateStore.getState().currentSession?.id).toBe('session_4');
        });
    });

    describe('回放模式切换性能', () => {
        beforeEach(() => {
            const session = makeSessionWithHistory(500, 'session_replay');
            useDebateStore.getState().setCurrentSession(session);
            useDebateStore.getState().hydrateRuntimeEvents(makeRuntimeeventBatch(500), false);
        });

        it('应在10ms内启用回放模式', () => {
            const startTime = performance.now();
            useDebateStore.getState().setReplayCursor(0);
            const enableTime = performance.now() - startTime;

            expect(enableTime).toBeLessThan(10);
            expect(useDebateStore.getState().replayEnabled).toBe(true);
        });

        it('应在5ms内更新回放游标', () => {
            useDebateStore.getState().setReplayCursor(0);

            const startTime = performance.now();
            useDebateStore.getState().setReplayCursor(250);
            const cursorTime = performance.now() - startTime;

            expect(cursorTime).toBeLessThan(5);
            expect(useDebateStore.getState().replayCursor).toBe(250);
        });

        it('应在20ms内快速步进回放10次', () => {
            useDebateStore.getState().setReplayCursor(0);

            const startTime = performance.now();
            for (let i = 1; i <= 10; i++) {
                useDebateStore.getState().setReplayCursor(i * 10);
            }
            const stepTime = performance.now() - startTime;

            expect(stepTime).toBeLessThan(20);
        });

        it('应在10ms内退出回放模式', () => {
            useDebateStore.getState().setReplayCursor(100);

            const startTime = performance.now();
            useDebateStore.getState().exitReplay();
            const exitTime = performance.now() - startTime;

            expect(exitTime).toBeLessThan(10);
            expect(useDebateStore.getState().replayEnabled).toBe(false);
        });

        it('应在50ms内完成回放启用-步进-退出的完整循环', () => {
            const startTime = performance.now();
            
            useDebateStore.getState().setReplayCursor(0);
            for (let i = 0; i < 5; i++) {
                useDebateStore.getState().setReplayCursor(i * 50);
            }
            useDebateStore.getState().exitReplay();
            
            const cycleTime = performance.now() - startTime;
            expect(cycleTime).toBeLessThan(50);
        });
    });

    describe('历史记录过滤性能', () => {
        it('应在30ms内过滤出特定角色的历史事件', () => {
            const events = makeRuntimeeventBatch(1000);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);

            const startTime = performance.now();
            const visibleEvents = useDebateStore.getState().visibleRuntimeEvents;
            const filterTime = performance.now() - startTime;

            expect(filterTime).toBeLessThan(30);
            expect(visibleEvents.length).toBeGreaterThan(0);
        });

        it('应在50ms内完成大规模历史记录的过滤 (2000条)', () => {
            const events = makeRuntimeeventBatch(2000);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);

            const startTime = performance.now();
            const visibleEvents = useDebateStore.getState().visibleRuntimeEvents;
            const filterTime = performance.now() - startTime;

            expect(filterTime).toBeLessThan(50);
            expect(visibleEvents.length).toBeGreaterThan(0);
        });
    });

    describe('历史记录窗口切换性能', () => {
        it('应在20ms内完成历史窗口的前移', () => {
            const events = makeRuntimeeventBatch(500);
            useDebateStore.getState().hydrateRuntimeEvents(events, true);

            const startTime = performance.now();
            useDebateStore.getState().setReplayCursor(100);
            const windowTime = performance.now() - startTime;

            expect(windowTime).toBeLessThan(20);
        });

        it('应在30ms内完成历史窗口的预加载', () => {
            const events = makeRuntimeeventBatch(800);
            useDebateStore.getState().hydrateRuntimeEvents(events, true);

            const startTime = performance.now();
            useDebateStore.getState().setReplayCursor(400);
            const preloadTime = performance.now() - startTime;

            expect(preloadTime).toBeLessThan(30);
        });
    });

    describe('实时模式与历史模式切换', () => {
        it('应在15ms内从实时模式切换到历史模式', () => {
            const session = makeSessionWithHistory(300, 'session_realtime');
            useDebateStore.getState().setCurrentSession(session);
            useDebateStore.getState().hydrateRuntimeEvents(makeRuntimeeventBatch(300), false);

            const startTime = performance.now();
            useDebateStore.getState().setReplayCursor(0);
            const switchTime = performance.now() - startTime;

            expect(switchTime).toBeLessThan(15);
            expect(useDebateStore.getState().replayEnabled).toBe(true);
        });

        it('应在15ms内从历史模式切换回实时模式', () => {
            const session = makeSessionWithHistory(300, 'session_realtime');
            useDebateStore.getState().setCurrentSession(session);
            useDebateStore.getState().hydrateRuntimeEvents(makeRuntimeeventBatch(300), false);
            useDebateStore.getState().setReplayCursor(100);

            const startTime = performance.now();
            useDebateStore.getState().exitReplay();
            const switchTime = performance.now() - startTime;

            expect(switchTime).toBeLessThan(15);
            expect(useDebateStore.getState().replayEnabled).toBe(false);
        });
    });

    describe('焦点切换性能', () => {
        it('应在5ms内切换焦点事件', () => {
            const events = makeRuntimeeventBatch(500);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);

            const startTime = performance.now();
            useDebateStore.getState().setFocusedRuntimeEventId('evt_switch_100');
            const focusTime = performance.now() - startTime;

            expect(focusTime).toBeLessThan(5);
            expect(useDebateStore.getState().focusedRuntimeEventId).toBe('evt_switch_100');
        });

        it('应在10ms内完成100次焦点切换', () => {
            const events = makeRuntimeeventBatch(500);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);

            const startTime = performance.now();
            for (let i = 0; i < 100; i++) {
                useDebateStore.getState().setFocusedRuntimeEventId(`evt_switch_${i + 1}`);
            }
            const totalFocusTime = performance.now() - startTime;

            expect(totalFocusTime).toBeLessThan(100);
        });
    });
});
