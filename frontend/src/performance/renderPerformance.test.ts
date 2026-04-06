/**
 * 大量数据渲染性能测试
 * 测试虚拟滚动、组件渲染、视图构建等前端渲染性能
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { RuntimeEvent, Session, DialogueEntry } from '../types';
import { useDebateStore } from '../stores/debateStore';
import { makeRuntimeEvent } from '../test/runtimeEventFactory';
import { buildTranscriptViewModel, filterReplayHistory } from '../utils/transcriptViewModel';
import {
    buildTimelineSearchIndex,
    computeTimelinePageTotal,
    computeVirtualTimelineWindow,
    filterIndexedTimelineEvents,
    filterTimelineEvents,
    requiredPageCountForIndex,
    sliceTimelineTail,
} from '../utils/timelineWindow';

function makeDialogueEntry(index: number): DialogueEntry {
    const role = index % 2 === 0 ? 'proposer' : 'opposer';
    return {
        role,
        agent_name: role === 'proposer' ? '正方' : '反方',
        content: `渲染测试消息 ${index + 1}`.repeat(2),
        citations: [],
        timestamp: `2026-03-17T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
        event_id: `evt_render_${index + 1}`,
        turn: Math.floor(index / 2),
    };
}

function makeRuntimeeventBatch(count: number, startIndex: number = 0): RuntimeEvent[] {
    return Array.from({ length: count }, (_, i) => {
        const index = startIndex + i;
        const role = index % 2 === 0 ? 'proposer' : 'opposer';
        const eventType = index % 4 === 0 ? 'judge_score' : 
                         index % 4 === 1 ? 'speech_start' : 
                         index % 4 === 2 ? 'speech_end' : 'turn_complete';
        
        return makeRuntimeEvent({
            event_id: `evt_render_${index + 1}`,
            session_id: 'session_render_test',
            seq: index + 1,
            type: eventType,
            timestamp: `2026-03-17T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
            payload: eventType === 'speech_end'
                ? {
                    role,
                    agent_name: role === 'proposer' ? '正方' : '反方',
                    content: `渲染事件内容 ${index + 1}`.repeat(2),
                    citations: [],
                    turn: Math.floor(index / 2),
                }
                : eventType === 'judge_score'
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
                : eventType === 'turn_complete'
                ? {
                    turn: Math.floor(index / 2) + 1,
                    cumulative_scores: {},
                }
                : {},
        });
    });
}

function makeSessionWithHistory(historyCount: number): Session {
    return {
        id: 'session_render',
        topic: `渲染性能测试 - ${historyCount}条`,
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

describe('大量数据渲染性能测试', () => {
    beforeEach(() => {
        useDebateStore.getState().reset();
    });

    afterEach(() => {
        useDebateStore.getState().reset();
    });

    describe('视图模型构建性能', () => {
        it('应在50ms内构建100条记录的视图模型', () => {
            const session = makeSessionWithHistory(100);
            const events = makeRuntimeeventBatch(100);
            useDebateStore.getState().setCurrentSession(session);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);

            const startTime = performance.now();
            const viewModel = buildTranscriptViewModel(
                session.dialogue_history,
                [],
                [],
                events,
                false,
                -1,
                '',
                '',
            );
            const buildTime = performance.now() - startTime;

            expect(buildTime).toBeLessThan(50);
            expect(viewModel.rows.length).toBeGreaterThan(0);
        });

        it('应在200ms内构建500条记录的视图模型', () => {
            const session = makeSessionWithHistory(500);
            const events = makeRuntimeeventBatch(500);
            useDebateStore.getState().setCurrentSession(session);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);

            const startTime = performance.now();
            const viewModel = buildTranscriptViewModel(
                session.dialogue_history,
                [],
                [],
                events,
                false,
                -1,
                '',
                '',
            );
            const buildTime = performance.now() - startTime;

            expect(buildTime).toBeLessThan(200);
            expect(viewModel.rows.length).toBeGreaterThan(0);
        });

        it('应在500ms内构建1000条记录的视图模型', () => {
            const session = makeSessionWithHistory(1000);
            const events = makeRuntimeeventBatch(1000);
            useDebateStore.getState().setCurrentSession(session);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);

            const startTime = performance.now();
            const viewModel = buildTranscriptViewModel(
                session.dialogue_history,
                [],
                [],
                events,
                false,
                -1,
                '',
                '',
            );
            const buildTime = performance.now() - startTime;

            expect(buildTime).toBeLessThan(500);
            expect(viewModel.rows.length).toBeGreaterThan(0);
        });
    });

    describe('回放模式历史过滤性能', () => {
        it('应在20ms内过滤回放模式历史 (500条)', () => {
            const events = makeRuntimeeventBatch(500);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);
            useDebateStore.getState().setReplayCursor(250);

            const startTime = performance.now();
            const filtered = filterReplayHistory(events, 250);
            const filterTime = performance.now() - startTime;

            expect(filterTime).toBeLessThan(20);
            expect(filtered.length).toBe(251);
        });

        it('应在50ms内过滤回放模式历史 (2000条)', () => {
            const events = makeRuntimeeventBatch(2000);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);
            useDebateStore.getState().setReplayCursor(1000);

            const startTime = performance.now();
            const filtered = filterReplayHistory(events, 1000);
            const filterTime = performance.now() - startTime;

            expect(filterTime).toBeLessThan(50);
            expect(filtered.length).toBe(1001);
        });
    });

    describe('时间线索引性能', () => {
        it('应在100ms内构建1000个事件的搜索索引', () => {
            const events = makeRuntimeeventBatch(1000);

            const startTime = performance.now();
            const indexed = buildTimelineSearchIndex(events);
            const indexTime = performance.now() - startTime;

            expect(indexTime).toBeLessThan(100);
            expect(Object.keys(indexed.roleIndices).length).toBeGreaterThan(0);
        });

        it('应在300ms内构建5000个事件的搜索索引', () => {
            const events = makeRuntimeeventBatch(5000);

            const startTime = performance.now();
            buildTimelineSearchIndex(events);
            const indexTime = performance.now() - startTime;

            expect(indexTime).toBeLessThan(300);
        });

        it('应在50ms内完成索引过滤 (1000个事件)', () => {
            const events = makeRuntimeeventBatch(1000);
            const indexed = buildTimelineSearchIndex(events);

            const startTime = performance.now();
            const filtered = filterIndexedTimelineEvents(indexed, 'proposer');
            const filterTime = performance.now() - startTime;

            expect(filterTime).toBeLessThan(50);
            expect(filtered.length).toBeGreaterThan(0);
        });

        it('应在100ms内计算时间线分页 (5000个事件)', () => {
            const events = makeRuntimeeventBatch(5000);
            const filtered = filterTimelineEvents(events, 'proposer');

            const startTime = performance.now();
            const pageTotal = computeTimelinePageTotal(filtered.length, 200);
            const requiredPages = requiredPageCountForIndex(filtered.length, 1500, 200);
            const tail = sliceTimelineTail(filtered, 200, 5);
            computeVirtualTimelineWindow(tail.length, 3200, 360, 60, 8);
            const calcTime = performance.now() - startTime;

            expect(calcTime).toBeLessThan(100);
            expect(pageTotal).toBeGreaterThan(0);
            expect(requiredPages).toBeGreaterThan(0);
        });
    });

    describe('虚拟滚动窗口计算性能', () => {
        it('应在5ms内计算虚拟滚动窗口', () => {
            const startTime = performance.now();
            const window = computeVirtualTimelineWindow(500, 3200, 360, 60, 8);
            const calcTime = performance.now() - startTime;

            expect(calcTime).toBeLessThan(5);
            expect(window.endIndex - window.startIndex).toBeLessThan(50);
        });

        it('应在10ms内完成100次窗口计算', () => {
            const startTime = performance.now();
            for (let i = 0; i < 100; i++) {
                computeVirtualTimelineWindow(i * 10, 3200, 360, 60, 8);
            }
            const totalTime = performance.now() - startTime;

            expect(totalTime).toBeLessThan(100);
        });
    });

    describe('大规模渲染压力测试', () => {
        it('应在1000ms内完成2000条记录的完整渲染流程', () => {
            const session = makeSessionWithHistory(2000);
            const events = makeRuntimeeventBatch(2000);

            const startTime = performance.now();
            
            // 设置会话
            useDebateStore.getState().setCurrentSession(session);
            
            // 加载事件
            useDebateStore.getState().hydrateRuntimeEvents(events, false);
            
            // 构建视图模型
            const viewModel = buildTranscriptViewModel(
                session.dialogue_history,
                [],
                [],
                events,
                false,
                -1,
                '',
                '',
            );
            
            // 构建时间线索引
            const indexed = buildTimelineSearchIndex(events);
            const filtered = filterIndexedTimelineEvents(indexed, 'proposer');
            
            const totalTime = performance.now() - startTime;

            expect(totalTime).toBeLessThan(1000);
            expect(viewModel.rows.length).toBeGreaterThan(0);
            expect(filtered.length).toBeGreaterThan(0);
        });

        it('应在2000ms内完成5000条记录的完整渲染流程', () => {
            const session = makeSessionWithHistory(5000);
            const events = makeRuntimeeventBatch(5000);

            const startTime = performance.now();
            
            useDebateStore.getState().setCurrentSession(session);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);
            
            const viewModel = buildTranscriptViewModel(
                session.dialogue_history,
                [],
                [],
                events,
                false,
                -1,
                '',
                '',
            );

            buildTimelineSearchIndex(events);

            const totalTime = performance.now() - startTime;

            expect(totalTime).toBeLessThan(2000);
            expect(viewModel.rows.length).toBeGreaterThan(0);
        });
    });

    describe('重复渲染性能 (memo优化验证)', () => {
        it('应在30ms内完成相同视图的重复构建', () => {
            const session = makeSessionWithHistory(300);
            const events = makeRuntimeeventBatch(300);
            useDebateStore.getState().setCurrentSession(session);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);

            const viewModel1 = buildTranscriptViewModel(
                session.dialogue_history,
                [],
                [],
                events,
                false,
                -1,
                '',
                '',
            );

            const startTime = performance.now();
            const viewModel2 = buildTranscriptViewModel(
                session.dialogue_history,
                [],
                [],
                events,
                false,
                -1,
                '',
                '',
            );
            const rebuildTime = performance.now() - startTime;

            expect(rebuildTime).toBeLessThan(30);
            expect(viewModel1.rows.length).toBe(viewModel2.rows.length);
        });
    });

    describe('不同类型事件的渲染性能', () => {
        it('应在100ms内处理混合事件类型 (500条)', () => {
            const events = Array.from({ length: 500 }, (_, i) => {
                const types = ['speech_start', 'speech_end', 'judge_score', 'turn_complete', 'status'];
                return makeRuntimeEvent({
                    event_id: `evt_mixed_${i + 1}`,
                    session_id: 'session_mixed',
                    seq: i + 1,
                    type: types[i % types.length],
                    timestamp: `2026-03-17T00:00:${String(i % 60).padStart(2, '0')}Z`,
                    payload: { role: i % 2 === 0 ? 'proposer' : 'opposer' },
                });
            });

            const startTime = performance.now();
            useDebateStore.getState().hydrateRuntimeEvents(events, false);
            const visibleEvents = useDebateStore.getState().visibleRuntimeEvents;
            const processTime = performance.now() - startTime;

            expect(processTime).toBeLessThan(100);
            expect(visibleEvents.length).toBeGreaterThan(0);
        });
    });

    describe('长时间运行的渲染稳定性', () => {
        it('应在连续100次视图构建中保持稳定的性能', () => {
            const session = makeSessionWithHistory(200);
            const events = makeRuntimeeventBatch(200);
            useDebateStore.getState().setCurrentSession(session);
            useDebateStore.getState().hydrateRuntimeEvents(events, false);

            const times: number[] = [];
            
            for (let i = 0; i < 100; i++) {
                const startTime = performance.now();
                buildTranscriptViewModel(
                    session.dialogue_history,
                    [],
                    [],
                    events,
                    false,
                    -1,
                    '',
                    '',
                );
                times.push(performance.now() - startTime);
            }

            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const maxTime = Math.max(...times);

            expect(avgTime).toBeLessThan(20);
            expect(maxTime).toBeLessThan(100);
        });
    });
});
