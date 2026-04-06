/**
 * 历史记录加载性能测试
 * 测试大量历史记录加载到前端store的性能
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { RuntimeEvent, Session, DialogueEntry } from '../types';
import { useDebateStore } from '../stores/debateStore';
import { makeRuntimeEvent } from '../test/runtimeEventFactory';

// 测试数据生成工具函数
function makeDialogueEntry(index: number): DialogueEntry {
    const role = index % 2 === 0 ? 'proposer' : 'opposer';
    return {
        role,
        agent_name: role === 'proposer' ? '正方' : '反方',
        content: `这是第 ${index + 1} 条历史消息内容，包含一些测试数据`.repeat(5),
        citations: [],
        timestamp: `2026-03-17T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
        event_id: `evt_${index + 1}`,
        turn: Math.floor(index / 2),
    };
}

function makeRuntimeEventWithContent(index: number, type: string = 'speech_end'): RuntimeEvent {
    const role = index % 2 === 0 ? 'proposer' : 'opposer';
    return makeRuntimeEvent({
        event_id: `evt_perf_${index + 1}`,
        session_id: 'session_perf_test',
        seq: index + 1,
        type,
        timestamp: `2026-03-17T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
        payload: type === 'speech_end'
            ? {
                role,
                agent_name: role === 'proposer' ? '正方' : '反方',
                content: `性能测试事件 ${index + 1} 的内容`.repeat(3),
                citations: [],
                turn: Math.floor(index / 2),
            }
            : type === 'judge_score'
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
                    overall_comment: '评分事件',
                },
            }
            : {},
    });
}

function makeSessionWithHistory(historyCount: number): Session {
    return {
        id: 'session_perf_history',
        topic: `性能测试 - ${historyCount}条历史记录`,
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

describe('历史记录加载性能测试', () => {
    beforeEach(() => {
        useDebateStore.getState().reset();
    });

    afterEach(() => {
        useDebateStore.getState().reset();
    });

    describe('小规模历史记录加载 (100条)', () => {
        it('应在50ms内完成100条历史记录的加载和视图构建', () => {
            const session = makeSessionWithHistory(100);
            
            const startTime = performance.now();
            useDebateStore.getState().setCurrentSession(session);
            const loadTime = performance.now() - startTime;

            expect(loadTime).toBeLessThan(50);
            expect(useDebateStore.getState().currentSession?.dialogue_history).toHaveLength(100);
        });

        it('应在30ms内完成100个runtime events的加载', () => {
            const events = Array.from({ length: 100 }, (_, i) => 
                makeRuntimeEventWithContent(i)
            );

            const startTime = performance.now();
            useDebateStore.getState().hydrateRuntimeEvents(events, false);
            const loadTime = performance.now() - startTime;

            expect(loadTime).toBeLessThan(30);
            expect(useDebateStore.getState().runtimeEvents).toHaveLength(100);
        });
    });

    describe('中等规模历史记录加载 (500条)', () => {
        it('应在200ms内完成500条历史记录的加载和视图构建', () => {
            const session = makeSessionWithHistory(500);
            
            const startTime = performance.now();
            useDebateStore.getState().setCurrentSession(session);
            const loadTime = performance.now() - startTime;

            expect(loadTime).toBeLessThan(200);
            expect(useDebateStore.getState().currentSession?.dialogue_history).toHaveLength(500);
        });

        it('应在150ms内完成500个runtime events的加载', () => {
            const events = Array.from({ length: 500 }, (_, i) => 
                makeRuntimeEventWithContent(i)
            );

            const startTime = performance.now();
            useDebateStore.getState().hydrateRuntimeEvents(events, false);
            const loadTime = performance.now() - startTime;

            expect(loadTime).toBeLessThan(150);
            expect(useDebateStore.getState().runtimeEvents).toHaveLength(500);
        });
    });

    describe('大规模历史记录加载 (1000条)', () => {
        it('应在500ms内完成1000条历史记录的加载和视图构建', () => {
            const session = makeSessionWithHistory(1000);
            
            const startTime = performance.now();
            useDebateStore.getState().setCurrentSession(session);
            const loadTime = performance.now() - startTime;

            expect(loadTime).toBeLessThan(500);
            expect(useDebateStore.getState().currentSession?.dialogue_history).toHaveLength(1000);
        });

        it('应在300ms内完成1000个runtime events的加载', () => {
            const events = Array.from({ length: 1000 }, (_, i) => 
                makeRuntimeEventWithContent(i, i % 3 === 0 ? 'judge_score' : 'speech_end')
            );

            const startTime = performance.now();
            useDebateStore.getState().hydrateRuntimeEvents(events, false);
            const loadTime = performance.now() - startTime;

            expect(loadTime).toBeLessThan(300);
            expect(useDebateStore.getState().runtimeEvents).toHaveLength(1000);
        });

        it('应在400ms内完成历史记录和runtime events的混合加载', () => {
            const session = makeSessionWithHistory(800);
            const events = Array.from({ length: 800 }, (_, i) => 
                makeRuntimeEventWithContent(i)
            );

            const startTime = performance.now();
            useDebateStore.getState().setCurrentSession(session);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);
            const loadTime = performance.now() - startTime;

            expect(loadTime).toBeLessThan(400);
        });
    });

    describe('超大规模历史记录加载 (5000条)', () => {
        it('应在2000ms内完成5000条历史记录的加载', () => {
            const session = makeSessionWithHistory(5000);
            
            const startTime = performance.now();
            useDebateStore.getState().setCurrentSession(session);
            const loadTime = performance.now() - startTime;

            expect(loadTime).toBeLessThan(2000);
            expect(useDebateStore.getState().currentSession?.dialogue_history).toHaveLength(5000);
        });

        it('应在1500ms内完成5000个runtime events的加载', () => {
            const events = Array.from({ length: 5000 }, (_, i) => 
                makeRuntimeEventWithContent(i)
            );

            const startTime = performance.now();
            useDebateStore.getState().hydrateRuntimeEvents(events, false);
            const loadTime = performance.now() - startTime;

            expect(loadTime).toBeLessThan(1500);
            expect(useDebateStore.getState().runtimeEvents).toHaveLength(5000);
        });
    });

    describe('历史记录加载内存性能', () => {
        it('应在加载1000条记录后保持合理的内存占用', () => {
            const session = makeSessionWithHistory(1000);

            // @ts-expect-error - 获取内存使用信息
            const memoryBefore = performance.memory?.usedJSHeapSize || 0;

            useDebateStore.getState().setCurrentSession(session);

            // @ts-expect-error - performance.memory 是非标准但浏览器支持的 API
            const memoryAfter = performance.memory?.usedJSHeapSize || 0;
            const memoryIncrease = memoryAfter - memoryBefore;

            // 内存增加应该小于10MB
            if (memoryBefore > 0) {
                expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
            }
        });
    });

    describe('分页加载性能', () => {
        it('应在100ms内完成80条历史记录的批量加载', () => {
            const events = Array.from({ length: 80 }, (_, i) => 
                makeRuntimeEventWithContent(i)
            );

            const startTime = performance.now();
            useDebateStore.getState().prependRuntimeEvents(events, false);
            const loadTime = performance.now() - startTime;

            expect(loadTime).toBeLessThan(100);
        });

        it('应在50ms内完成历史记录的游标更新', () => {
            const events = Array.from({ length: 200 }, (_, i) => 
                makeRuntimeEventWithContent(i)
            );
            
            useDebateStore.getState().hydrateRuntimeEvents(events, false);
            
            const startTime = performance.now();
            useDebateStore.getState().setReplayCursor(100);
            const cursorTime = performance.now() - startTime;

            expect(cursorTime).toBeLessThan(50);
        });
    });
});
